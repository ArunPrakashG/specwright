import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "@wordpress/block-serialization-default-parser";
import type { AdapterContext, CheckGroup, Finding } from "@specwright/core";
import { layoutSections } from "@specwright/sections";
import type { SiteSpec } from "@specwright/spec";
import { patternFile } from "./theme.ts";
import { listFiles, themeSlug } from "./util.ts";

/** The block parser's own delimiter grammar (block-serialization-default-parser). */
const TOKENIZER =
  /<!--[ \t\f\r\n]+(\/)?wp:([a-z][a-z0-9_-]*\/)?([a-z][a-z0-9_-]*)[ \t\f\r\n]+({(?:(?=([^}]+|}+(?=})|(?!}[ \t\f\r\n]+\/?-->)[^])*)\5|[^]*?)}[ \t\f\r\n]+)?(\/)?-->/g;
const ALLOWED_NAMESPACES = new Set(["core", "woocommerce"]);

/** Theme file → section-level spec id, for findings. */
function fileSpecIds(spec: SiteSpec) {
  const out = new Map<string, string>();
  const { home, header, footer } = layoutSections(spec);
  if (header) out.set("theme/parts/header.html", `${home.id}.${header.id}`);
  if (footer) out.set("theme/parts/footer.html", `${home.id}.${footer.id}`);
  for (const page of spec.pages) for (const s of page.sections) out.set(`theme/${patternFile(page, s.id)}`, `${page.id}.${s.id}`);
  return out;
}

/** Pattern files hold PHP; check the block markup they print, with each PHP island as a neutral value. */
export function markupOf(file: string, source: string) {
  if (!file.endsWith(".php")) return source;
  return source.replace(/^<\?php[\s\S]*?\?>\n?/, "").replace(/<\?php[\s\S]*?\?>/g, "0");
}

export function checkMarkup(source: string, ctx: { patterns: Set<string>; parts: Set<string> }): string[] {
  const problems: string[] = [];
  const stack: { name: string; line: number }[] = [];
  const lineAt = (i: number) => source.slice(0, i).split("\n").length;
  let delimiters = 0;
  for (const m of source.matchAll(TOKENIZER)) {
    delimiters++;
    const [, closer, ns, local, json, , voidFlag] = m;
    const namespace = ns ? ns.slice(0, -1) : "core";
    const name = `${namespace}/${local}`;
    const line = lineAt(m.index);
    if (!ALLOWED_NAMESPACES.has(namespace)) problems.push(`line ${line}: block ${name} is outside core/* and woocommerce/*`);
    let attrs: Record<string, unknown> = {};
    if (json) {
      try {
        attrs = JSON.parse(json);
      } catch {
        problems.push(`line ${line}: ${name} has invalid attribute JSON`);
      }
    }
    if (closer) {
      const open = stack.pop();
      if (!open) problems.push(`line ${line}: stray closing comment for ${name}`);
      else if (open.name !== name) problems.push(`line ${line}: ${name} closes ${open.name} (opened on line ${open.line})`);
    } else if (!voidFlag) stack.push({ name, line });
    if (name === "core/pattern" && typeof attrs.slug === "string" && attrs.slug.includes("/") && !attrs.slug.startsWith("woocommerce")) {
      if (!ctx.patterns.has(attrs.slug)) problems.push(`line ${line}: pattern ${attrs.slug} does not exist`);
    }
    if (name === "core/template-part" && typeof attrs.slug === "string" && !attrs.theme && !ctx.parts.has(attrs.slug)) {
      problems.push(`line ${line}: template part ${attrs.slug} does not exist`);
    }
  }
  for (const open of stack) problems.push(`line ${open.line}: ${open.name} is never closed`);
  const loose = (source.match(/<!--\s*\/?wp:/g) ?? []).length;
  if (loose !== delimiters) problems.push(`${loose - delimiters} malformed block comment${loose - delimiters === 1 ? "" : "s"}`);
  try {
    parse(source);
  } catch (error) {
    problems.push(`parser failed: ${(error as Error).message}`);
  }
  return problems;
}

async function markupGroup(spec: SiteSpec, outDir: string): Promise<CheckGroup> {
  const themeDir = join(outDir, "theme");
  const files = (await listFiles(themeDir)).filter((f) => /^(templates|parts)\/.*\.html$|^patterns\/.*\.php$/.test(f));
  const ids = fileSpecIds(spec);
  const ctx = {
    patterns: new Set(files.filter((f) => f.startsWith("patterns/")).map((f) => `${themeSlug(spec)}/${f.slice(9, -4)}`)),
    parts: new Set(files.filter((f) => f.startsWith("parts/")).map((f) => f.slice(6, -5))),
  };
  const findings: Finding[] = [];
  let passed = 0;
  for (const f of files) {
    const problems = checkMarkup(markupOf(f, await readFile(join(themeDir, f), "utf8")), ctx);
    if (!problems.length) passed++;
    for (const p of problems) findings.push({ message: `${f}: ${p}`, severity: "error", specId: ids.get(`theme/${f}`) });
  }
  return {
    id: "markup",
    label: "Block markup",
    status: files.length === 0 ? "fail" : findings.length ? "fail" : "pass",
    summary: files.length ? `${passed}/${files.length} valid` : "No templates found",
    passed,
    total: files.length,
    findings,
  };
}

/** `php -l` through PHP.wasm (there is no system PHP). Returns per-file errors, or null if PHP.wasm could not run. */
export async function phpLint(root: string, files: string[]): Promise<Map<string, string | null> | null> {
  if (!files.length) return new Map();
  let php: any;
  try {
    // Their .d.ts files use extensionless re-exports that NodeNext cannot follow, so type them loosely.
    const [{ PHP }, { loadNodeRuntime, createNodeFsMountHandler }]: any[] = await Promise.all([import("@php-wasm/universal"), import("@php-wasm/node")]);
    php = new PHP(await loadNodeRuntime("8.3", { emscriptenOptions: { processId: 1 } }));
    await php.mount("/src", createNodeFsMountHandler(root));
    // PHP 8.3 lints every file named after -l.
    const res = await php.cli(["php", "-l", ...files.map((f) => `/src/${f}`)]);
    const out = `${await res.stdoutText}\n${await res.stderrText}`;
    const result = new Map<string, string | null>();
    for (const f of files) {
      const path = `/src/${f}`;
      if (out.includes(`No syntax errors detected in ${path}`)) result.set(f, null);
      else {
        const line = out.split("\n").find((l) => l.includes(path) && /error/i.test(l) && !l.startsWith("Errors parsing"));
        result.set(f, line?.replace(/^PHP\s+/, "").replace(/\/src\//g, "").trim() ?? "php -l did not report on this file");
      }
    }
    return result;
  } catch {
    return null;
  } finally {
    try {
      php?.[Symbol.dispose]();
    } catch {}
  }
}

async function standardsGroup(spec: SiteSpec, outDir: string, log: (m: string) => void): Promise<CheckGroup> {
  const ids = fileSpecIds(spec);
  const findings: Finding[] = [];
  let total = 0;
  let passed = 0;
  const check = (ok: boolean, message: string, specId?: string) => {
    total++;
    if (ok) passed++;
    else findings.push({ message, severity: "error", specId });
  };

  const phpFiles = (await listFiles(outDir)).filter((f) => (f.startsWith("theme/") || f.startsWith("import/")) && f.endsWith(".php"));
  const lint = await phpLint(outDir, phpFiles);
  if (lint) for (const [f, error] of lint) check(error === null, `${f}: ${error}`, ids.get(f));
  else log("Standards: PHP.wasm could not start; php -l skipped");

  const themeDir = join(outDir, "theme");
  const style = await readFile(join(themeDir, "style.css"), "utf8").catch(() => "");
  const header = (field: string) => style.match(new RegExp(`^${field}:\\s*(.+)$`, "m"))?.[1]?.trim();
  const missing = ["Theme Name", "Text Domain", "Version", "Requires at least", "Requires PHP", "License"].filter((f) => !header(f));
  check(missing.length === 0, `style.css header is missing ${missing.join(", ")}`);
  check(header("Text Domain") === themeSlug(spec), `style.css Text Domain should be ${themeSlug(spec)}`);

  let json: any = null;
  try {
    json = JSON.parse(await readFile(join(themeDir, "theme.json"), "utf8"));
  } catch {}
  check(json?.version === 3, "theme.json is missing or not version 3");
  const slugs = new Set((json?.settings?.color?.palette ?? []).map((c: { slug: string }) => c.slug));
  const absent = Object.keys(spec.tokens.color).filter((k) => !slugs.has(k));
  check(absent.length === 0, `theme.json palette lacks tokens: ${absent.join(", ")}`);
  const themeFiles = new Set(await listFiles(themeDir));
  const fontFiles = (json?.settings?.typography?.fontFamilies ?? []).flatMap((f: any) => (f.fontFace ?? []).flatMap((ff: any) => ff.src as string[]));
  const lost = fontFiles.map((s: string) => s.replace(/^file:\.\//, "")).filter((s: string) => !themeFiles.has(s));
  check(lost.length === 0, `theme.json references missing font files: ${lost.join(", ")}`);

  for (const f of [...themeFiles].filter((x) => x.startsWith("patterns/"))) {
    const src = await readFile(join(themeDir, f), "utf8");
    const slug = src.match(/^\s*\*\s*Slug:\s*(\S+)/m)?.[1];
    check(Boolean(src.match(/^\s*\*\s*Title:/m)) && slug === `${themeSlug(spec)}/${f.slice(9, -4)}`, `${f}: pattern header needs Title and Slug ${themeSlug(spec)}/${f.slice(9, -4)}`, ids.get(`theme/${f}`));
  }

  const lintNote = lint ? `php -l on ${phpFiles.length} PHP files` : "php -l skipped (PHP.wasm unavailable)";
  return {
    id: "standards",
    label: "Coding standards",
    status: findings.length ? "fail" : lint ? "pass" : "warn",
    summary: `${passed}/${total} · ${lintNote}, style.css header, theme.json v3 and palette, font files, pattern headers`,
    passed,
    total,
    findings,
  };
}

export async function validate(spec: SiteSpec, ctx: AdapterContext): Promise<CheckGroup[]> {
  return Promise.all([markupGroup(spec, ctx.outDir), standardsGroup(spec, ctx.outDir, ctx.log)]);
}

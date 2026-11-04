import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { getDefaultAutoSelectFamilyAttemptTimeout, setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import { homedir } from "node:os";
import { primaryMarket, type SiteSpec } from "@specwright/spec";
import { esc, t, type Localized } from "@specwright/sections";

export { esc };

export const themeSlug = (spec: SiteSpec) => `sw-${spec.id}`;

/** The primary market's first locale: the language every emitted string is written in. */
export function locale(spec: SiteSpec) {
  return primaryMarket(spec).locales[0] ?? "en";
}

export function text(spec: SiteSpec, value: Localized | undefined) {
  return t(value, locale(spec));
}

/** Class that functions.php turns into data-spec-id (dots are not safe in class names). */
export const sid = (specId: string) => `sid-${specId.replaceAll(".", "__")}`;

/** `/shop` → `/shop/` so links match WordPress permalinks without a redirect. */
export function href(value: string) {
  if (!value.startsWith("/") || value.startsWith("//") || /[?#.]/.test(value) || value.endsWith("/")) return value;
  return `${value}/`;
}

export const cls = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

/** Specwright's own cache, outside any build directory. */
export function cacheDir(...parts: string[]) {
  return join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "specwright", ...parts);
}

/** A PHP single-quoted string literal. */
export const phpString = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** JSON embedded in PHP as a nowdoc, decoded to an associative array. */
export function phpJson(value: unknown) {
  const json = JSON.stringify(value, null, 2);
  if (json.includes("\nJSON")) throw new Error("Data contains the nowdoc terminator");
  return `json_decode(<<<'JSON'\n${json}\nJSON, true)`;
}

/**
 * Write a set of files under `dir`, removing files a previous emit left behind.
 * The directory itself is never removed, so a running preview that mounts it keeps seeing it.
 */
export async function writeTree(dir: string, files: Map<string, string | Uint8Array>) {
  await mkdir(dir, { recursive: true });
  for (const old of await listFiles(dir)) if (!files.has(old)) await rm(join(dir, old), { force: true });
  for (const [path, body] of files) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), body);
  }
  return [...files.keys()].sort();
}

export async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string) => {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else out.push(relative(dir, p));
    }
  };
  await walk(dir);
  return out.sort();
}

/** Flag for child Node processes; see patientNetwork. */
export const NODE_NETWORK_FLAG = "--network-family-autoselection-attempt-timeout=2000";

/**
 * Node gives each address family 250 ms to connect before trying the next. On links with more
 * latency than that, and no IPv6 route, every fetch fails with ETIMEDOUT. Allow 2 s instead.
 */
export function patientNetwork() {
  if (getDefaultAutoSelectFamilyAttemptTimeout() < 2000) setDefaultAutoSelectFamilyAttemptTimeout(2000);
}

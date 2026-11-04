import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright";
import { closestPassingToken, type SiteSpec } from "@specwright/spec";
import type { CheckGroup, Finding, Fix } from "@specwright/core";
import { pickJourneyProduct } from "./journey.ts";
import { abs, ensureDir, errorMessage, groupStatus, newPage, open, pageUrl, rel, trim, VIEWPORTS, type Run } from "./util.ts";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

interface Audit {
  name: string;
  path: string;
  viewport: keyof typeof VIEWPORTS;
  cart?: boolean;
}

interface Node {
  target: unknown[];
  html: string;
  any: { id: string; data?: any }[];
}

/** `home.story.link` → page `home`, section `story`, part `link`. */
function sectionAt(spec: SiteSpec, specId: string) {
  const [pageId, sectionId, ...part] = specId.split(".");
  const pi = spec.pages.findIndex((p) => p.id === pageId);
  const si = spec.pages[pi]?.sections.findIndex((s) => s.id === sectionId) ?? -1;
  if (pi < 0 || si < 0) return null;
  return { pi, si, section: spec.pages[pi]!.sections[si]!, part: part.join(".") };
}

const hex6 = (c: string) => c.slice(0, 7).toUpperCase();

/**
 * Which section setting paints this colour? Looks at `*Color` settings on the owning section
 * whose current value resolves to the failing foreground, preferring the one named after the part.
 */
export function colourFix(spec: SiteSpec, specId: string, fg: string, bg: string, min: number): Fix | null {
  const at = sectionAt(spec, specId);
  if (!at) return null;
  const resolve = (v: string) => (v.startsWith("token:") ? spec.tokens.color[v.slice(6)] : v);
  const candidates = Object.entries(at.section.settings).filter(
    (e): e is [string, string] => /Color$/.test(e[0]) && typeof e[1] === "string" && resolve(e[1])?.toUpperCase() === fg.toUpperCase(),
  );
  const named = candidates.find(([k]) => at.part && k.toLowerCase().startsWith(at.part.split(".")[0]!.toLowerCase()));
  const hit = named ?? (candidates.length === 1 ? candidates[0] : undefined);
  if (!hit) return null;
  const token = closestPassingToken(spec.tokens.color, fg, bg, min);
  if (!token) return null;
  const [key, from] = hit;
  return {
    path: `pages.${at.pi}.sections.${at.si}.settings.${key}`,
    from,
    to: `token:${token.name}`,
    label: `${from.startsWith("token:") ? `--st-${from.slice(6)}` : from.toUpperCase()} → --st-${token.name}`,
  };
}

async function specIdOf(page: Page, target: unknown[]) {
  if (target.length !== 1 || typeof target[0] !== "string") return undefined;
  return page.evaluate((sel) => document.querySelector(sel)?.closest("[data-spec-id]")?.getAttribute("data-spec-id") ?? undefined, target[0]).catch(() => undefined);
}

export async function runA11y(run: Run): Promise<CheckGroup> {
  await ensureDir(run);
  const { spec, preview } = run.input;
  const pick = pickJourneyProduct(spec.catalog.products);
  const product = pick?.product ?? spec.catalog.products[0];
  const audits: Audit[] = [
    { name: "home", path: "/", viewport: "desktop" },
    { name: "home", path: "/", viewport: "mobile" },
    { name: "shop", path: preview.paths.shop, viewport: "desktop" },
    ...(product ? [{ name: "product", path: preview.paths.product(product.slug), viewport: "desktop" as const }] : []),
    { name: "cart", path: preview.paths.cart, viewport: "desktop", cart: true },
  ];

  const findings: Finding[] = [];
  const seen = new Set<string>();
  let passed = 0;
  let shots = 0;
  let platformWarnings = 0;

  for (const audit of audits) {
    const label = `${audit.name} (${audit.viewport})`;
    const { context, page } = await newPage(run, audit.viewport, audit.cart ? run.cartState : undefined);
    try {
      const r = await open(page, audit.path === "/" ? preview.url : pageUrl(run, audit.path));
      if (r && r.status() >= 400) throw new Error(`HTTP ${r.status()}`);
      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const owned: Finding[] = [];
      let hit = false;
      const platform = new Map<string, { finding: Finding; help: string; id: string; count: number }>();

      for (const v of results.violations) {
        for (const node of v.nodes as unknown as Node[]) {
          const specId = await specIdOf(page, node.target);
          const pagePath = new URL(page.url()).pathname;
          if (!specId) {
            const key = `${v.id}|${audit.name}|${audit.viewport}`;
            const f = platform.get(key);
            if (f) f.count++;
            else {
              const finding: Finding = { message: "", severity: "warning", page: pagePath, viewport: audit.viewport, snippet: trim(node.html) };
              platform.set(key, { finding, help: v.help, id: v.id, count: 1 });
            }
            continue;
          }
          hit = true;
          const dedupe = `${v.id}|${specId}|${node.target.join(" ")}`;
          if (seen.has(dedupe)) continue;
          seen.add(dedupe);

          const finding: Finding = { message: `${v.help} (${v.id})`, severity: "error", specId, page: pagePath, viewport: audit.viewport, snippet: trim(node.html) };
          if (v.id === "color-contrast") {
            const data = node.any.find((c) => c.id === "color-contrast")?.data;
            if (data?.fgColor && data?.bgColor) {
              const fg = hex6(data.fgColor);
              const bg = hex6(data.bgColor);
              const ratio = Number(data.contrastRatio);
              const min = parseFloat(String(data.expectedContrastRatio)) || 4.5;
              finding.message = `Text contrast ${ratio.toFixed(1)}:1. Needs ${min}:1. (${fg} on ${bg})`;
              const fix = colourFix(spec, specId, fg, bg, min);
              if (fix) finding.fix = fix;
            }
          }
          const name = `a11y-${++shots}-${v.id}.png`;
          const selector = node.target.length === 1 && typeof node.target[0] === "string" ? node.target[0] : null;
          if (selector) {
            const ok = await page.locator(selector).first().screenshot({ path: abs(run, name), timeout: 5_000 }).then(() => true, () => false);
            if (ok) finding.screenshot = rel(name);
          }
          owned.push(finding);
        }
      }

      const platformFindings = [...platform.values()].map(({ finding, help, id, count }) => ({
        ...finding,
        message: `${help} (${id}) in platform markup on ${finding.page}${count > 1 ? `, ${count} elements` : ""}`,
      }));
      platformWarnings += platformFindings.length;
      findings.push(...owned, ...platformFindings);
      if (!hit) passed++;
    } catch (e) {
      findings.push({ message: `Could not audit ${label}: ${errorMessage(e)}`, severity: "warning", page: audit.path, viewport: audit.viewport });
    } finally {
      await context.close();
    }
  }

  const failing = findings.filter((f) => f.severity === "error").length;
  const summary = `WCAG 2.2 AA · ${failing} failing${platformWarnings ? ` · ${platformWarnings} platform warning${platformWarnings > 1 ? "s" : ""}` : ""}`;
  return { id: "a11y", label: "Accessibility", status: groupStatus(findings, passed, audits.length), summary, passed, total: audits.length, findings };
}

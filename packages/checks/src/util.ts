import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import type { ChecksInput, CheckGroup, CheckStatus } from "@specwright/core";

export interface Run {
  input: ChecksInput;
  browser: Browser;
  /** Absolute directory for screenshots (`${outDir}/checks`). */
  dir: string;
  /** Cookies from the journey's filled cart, so the cart page is audited with an item in it. */
  cartState?: Awaited<ReturnType<BrowserContext["storageState"]>>;
}

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

export const NAV_TIMEOUT = 120_000;

export async function ensureDir(run: Pick<Run, "dir">) {
  await mkdir(run.dir, { recursive: true });
}

/** Path relative to the build directory, as findings store it. */
export const rel = (name: string) => `checks/${name}`;
export const abs = (run: Pick<Run, "dir">, name: string) => join(run.dir, name);

export function pageUrl(run: Run, path: string) {
  return new URL(path, run.input.preview.url).toString();
}

export async function newPage(run: Run, viewport: keyof typeof VIEWPORTS, storageState?: Run["cartState"]) {
  const context = await run.browser.newContext({
    viewport: VIEWPORTS[viewport],
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    storageState,
  });
  context.setDefaultTimeout(30_000);
  context.setDefaultNavigationTimeout(NAV_TIMEOUT);
  const page = await context.newPage();
  return { context, page };
}

/** Load a page and give late scripts (block cart, lazy fonts) a moment to settle. */
export async function open(page: Page, url: string) {
  const response = await page.goto(url, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  return response;
}

export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function trim(html: string, max = 240) {
  const s = html.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function groupStatus(findings: CheckGroup["findings"], passed: number, total: number): CheckStatus {
  if (findings.some((f) => f.severity === "error")) return "fail";
  if (findings.length || passed < total) return "warn";
  return "pass";
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message.split("\n")[0]! : String(e));

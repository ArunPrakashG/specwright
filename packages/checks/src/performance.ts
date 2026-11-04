import type { Page } from "playwright";
import type { CheckGroup, Finding } from "@specwright/core";
import { pickJourneyProduct } from "./journey.ts";
import { ensureDir, errorMessage, groupStatus, newPage, pageUrl, type Run } from "./util.ts";

/** LCP is measured from responseStart: the preview's server time (PHP in WebAssembly) is not the theme's. */
export const BUDGET = { renderLcpMs: 2500, cls: 0.1, bytes: 1.5 * 1024 * 1024 };

export interface PageMetrics {
  lcp: number | null;
  ttfb: number;
  cls: number;
  bytes: number;
  requests: number;
}

const INIT = `
window.__sw = { lcp: null, shifts: [] };
new PerformanceObserver((list) => {
  for (const e of list.getEntries()) window.__sw.lcp = e.startTime;
}).observe({ type: "largest-contentful-paint", buffered: true });
new PerformanceObserver((list) => {
  for (const e of list.getEntries()) if (!e.hadRecentInput) window.__sw.shifts.push([e.startTime, e.value]);
}).observe({ type: "layout-shift", buffered: true });
`;

/** Layout shift score as web.dev defines it: the worst session window (gaps < 1 s, up to 5 s). */
export function sessionCls(shifts: [number, number][]) {
  let best = 0;
  let sum = 0;
  let start = 0;
  let last = 0;
  for (const [t, v] of shifts) {
    if (sum && (t - last > 1000 || t - start > 5000)) sum = 0;
    if (!sum) start = t;
    sum += v;
    last = t;
    best = Math.max(best, sum);
  }
  return best;
}

async function measure(run: Run, path: string): Promise<PageMetrics> {
  const { context, page } = await newPage(run, "mobile");
  try {
    await page.addInitScript(INIT);
    let bytes = 0;
    let requests = 0;
    const pending: Promise<void>[] = [];
    page.on("requestfinished", (req) => {
      requests++;
      pending.push(req.sizes().then((s) => void (bytes += s.responseBodySize + s.responseHeadersSize), () => {}));
    });
    await page.goto(path === "/" ? run.input.preview.url : pageUrl(run, path), { waitUntil: "load" });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    // Let LCP and late layout shifts land.
    await page.waitForTimeout(2_000);
    await Promise.all(pending);
    return await read(page, bytes, requests);
  } finally {
    await context.close();
  }
}

async function read(page: Page, bytes: number, requests: number): Promise<PageMetrics> {
  const raw = await page.evaluate(() => {
    const w = window as any;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return { lcp: w.__sw.lcp as number | null, shifts: w.__sw.shifts as [number, number][], ttfb: nav?.responseStart ?? 0 };
  });
  return { lcp: raw.lcp, ttfb: raw.ttfb, cls: sessionCls(raw.shifts), bytes, requests };
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} kB`);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export async function runPerformance(run: Run): Promise<CheckGroup> {
  await ensureDir(run);
  const { spec, preview } = run.input;
  const product = pickJourneyProduct(spec.catalog.products)?.product ?? spec.catalog.products[0];
  const pages = [
    { name: "home", path: "/" },
    { name: "shop", path: preview.paths.shop },
    ...(product ? [{ name: "product", path: preview.paths.product(product.slug) }] : []),
  ];

  const findings: Finding[] = [];
  let passed = 0;
  const worst = { lcp: 0, cls: 0, bytes: 0, requests: 0 };
  for (const p of pages) {
    try {
      const m = await measure(run, p.path);
      run.input.log(`performance ${p.name}: LCP ${m.lcp?.toFixed(0)} ms, TTFB ${m.ttfb.toFixed(0)} ms, CLS ${m.cls.toFixed(3)}, ${kb(m.bytes)}, ${m.requests} requests`);
      const problems: string[] = [];
      const render = m.lcp === null ? null : Math.max(0, m.lcp - m.ttfb);
      if (render === null) problems.push("No largest contentful paint was reported");
      else {
        worst.lcp = Math.max(worst.lcp, render);
        if (render >= BUDGET.renderLcpMs) problems.push(`Render LCP ${secs(render)} is over the ${secs(BUDGET.renderLcpMs)} budget (server time ${secs(m.ttfb)} excluded)`);
      }
      worst.cls = Math.max(worst.cls, m.cls);
      if (m.cls >= BUDGET.cls) problems.push(`Layout shift ${m.cls.toFixed(2)} is over the ${BUDGET.cls} budget`);
      worst.bytes = Math.max(worst.bytes, m.bytes);
      if (m.bytes >= BUDGET.bytes) problems.push(`Page weight ${kb(m.bytes)} is over the ${kb(BUDGET.bytes)} budget`);
      worst.requests = Math.max(worst.requests, m.requests);
      for (const message of problems) findings.push({ message: `${p.name}: ${message}`, severity: "error", page: p.path, viewport: "mobile" });
      if (!problems.length) passed++;
    } catch (e) {
      findings.push({ message: `Could not measure ${p.name}: ${errorMessage(e)}`, severity: "error", page: p.path, viewport: "mobile" });
    }
  }

  const summary = `Mobile · render LCP ${secs(worst.lcp)} (server time excluded) · CLS ${worst.cls.toFixed(2)} · ${kb(worst.bytes)} · ${worst.requests} requests`;
  const status = groupStatus(findings, passed, pages.length);
  return { id: "performance", label: "Performance", status, summary, passed, total: pages.length, findings };
}

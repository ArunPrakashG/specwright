import { readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { Page } from "playwright";
import { renderPage, layoutSections } from "@specwright/sections";
import type { CheckGroup, Finding } from "@specwright/core";
import { abs, ensureDir, errorMessage, newPage, open, rel, VIEWPORTS, type Run } from "./util.ts";

/** Above this share of differing pixels the group warns. It never fails a build. */
export const MISMATCH_LIMIT = 10;

const MIME: Record<string, string> = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif" };

/** The reference render with every spec asset inlined, so it needs no server. */
export async function referenceHtml(run: Run) {
  const { spec, specDir } = run.input;
  const homeId = layoutSections(spec).home.id;
  const cache = new Map<string, string>();
  const srcs = new Set<string>();
  renderPage(spec, homeId, { asset: (src) => (srcs.add(src), src) });
  for (const src of srcs) {
    try {
      const data = await readFile(join(specDir, src));
      cache.set(src, `data:${MIME[extname(src).toLowerCase()] ?? "application/octet-stream"};base64,${data.toString("base64")}`);
    } catch {
      run.input.log(`visual: missing asset ${src}`);
    }
  }
  return renderPage(spec, homeId, { asset: (src) => cache.get(src) ?? src });
}

/** Scroll through the page so lazy images load, then settle. */
async function prepare(page: Page) {
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
  await page.evaluate(async () => {
    document.querySelectorAll("img[loading=lazy]").forEach((i) => ((i as HTMLImageElement).loading = "eager"));
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
  // Size the viewport to the whole page first. A full-page screenshot otherwise resizes it at capture,
  // srcset picks new candidates, and the shot catches them still loading.
  const width = page.viewportSize()!.width;
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height: Math.min(height, 16_000) });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.evaluate(async () => {
    // A slow preview server can take many seconds per image; a half-loaded tile is a false diff.
    await Promise.all([...document.images].map((img) => Promise.race([img.decode().catch(() => {}), new Promise((r) => setTimeout(r, 30_000))])));
    await document.fonts?.ready;
  });
  await page.waitForTimeout(300);
}

export function compare(a: Buffer, b: Buffer) {
  const [ia, ib] = [PNG.sync.read(a), PNG.sync.read(b)];
  const width = Math.min(ia.width, ib.width);
  const height = Math.min(ia.height, ib.height);
  const crop = (src: PNG) => {
    const out = new PNG({ width, height });
    PNG.bitblt(src, out, 0, 0, width, height, 0, 0);
    return out;
  };
  const diff = new PNG({ width, height });
  const count = pixelmatch(crop(ia).data, crop(ib).data, diff.data, width, height, { threshold: 0.1 });
  return { percent: (count / (width * height)) * 100, diff: PNG.sync.write(diff), sizes: [[ia.width, ia.height], [ib.width, ib.height]] as const };
}

export async function runVisual(run: Run): Promise<CheckGroup> {
  await ensureDir(run);
  const html = await referenceHtml(run);
  const findings: Finding[] = [];
  const results: { viewport: string; percent: number }[] = [];

  for (const viewport of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
    const ref = await newPage(run, viewport);
    const live = await newPage(run, viewport);
    try {
      await ref.page.setContent(html, { waitUntil: "load" });
      await prepare(ref.page);
      await open(live.page, run.input.preview.url);
      await prepare(live.page);
      const [a, b] = await Promise.all([ref.page.screenshot({ fullPage: true, animations: "disabled" }), live.page.screenshot({ fullPage: true, animations: "disabled" })]);
      const result = compare(a, b);
      await Promise.all([
        writeFile(abs(run, `visual-reference-${viewport}.png`), a),
        writeFile(abs(run, `visual-live-${viewport}.png`), b),
        writeFile(abs(run, `visual-diff-${viewport}.png`), result.diff),
      ]);
      const percent = Math.round(result.percent * 10) / 10;
      results.push({ viewport, percent });
      const [[rw, rh], [lw, lh]] = result.sizes;
      run.input.log(`visual ${viewport}: ${percent}% mismatch (reference ${rw}x${rh}, live ${lw}x${lh})`);
      if (percent > MISMATCH_LIMIT) {
        findings.push({
          message: `${viewport} render differs from the reference by ${percent}% (limit ${MISMATCH_LIMIT}%). Reference ${rw}×${rh}, live ${lw}×${lh}.`,
          severity: "warning",
          page: "/",
          viewport,
          screenshot: rel(`visual-diff-${viewport}.png`),
        });
      }
    } catch (e) {
      results.push({ viewport, percent: 100 });
      findings.push({ message: `Could not compare the ${viewport} render: ${errorMessage(e)}`, severity: "warning", page: "/", viewport });
    } finally {
      await Promise.all([ref.context.close(), live.context.close()]);
    }
  }

  const passed = results.filter((r) => r.percent <= MISMATCH_LIMIT).length;
  const max = Math.max(...results.map((r) => r.percent));
  return {
    id: "visual",
    label: "Visual match",
    status: passed === results.length ? "pass" : "warn",
    summary: `${results.length} viewports · max diff ${max}%`,
    passed,
    total: results.length,
    findings,
  };
}

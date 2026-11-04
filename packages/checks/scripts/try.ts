/**
 * Runs every check group against a WooCommerce preview and prints the result.
 *
 *   tmux new -d -s sw-checks-wp "cd packages/checks/scripts && \
 *     NODE_OPTIONS='--dns-result-order=ipv4first --no-network-family-autoselection' \
 *     npx @wp-playground/cli@latest server --blueprint=test-blueprint.json --port=9433"
 *   npx tsx packages/checks/scripts/try.ts [url] [specDir] [outDir]
 *
 * The blueprint builds the "Morning mug" and "Pasta bowl" products from the sample spec
 * on WooCommerce with Twenty Twenty-Five. (The NODE_OPTIONS are only for hosts with a
 * broken IPv6 route.)
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSpecFile } from "@specwright/core";
import { chromium } from "playwright";
import { runA11y, runChecks, runJourney, runPerformance, runVisual } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] ?? "http://127.0.0.1:9433";
const specDir = resolve(process.argv[3] ?? join(here, "../../spec/examples/hale-and-field"));
const outDir = resolve(process.argv[4] ?? (await mkdtemp(join(tmpdir(), "sw-try-"))));

const { result } = await loadSpecFile(specDir);
if (!result.ok) throw new Error(JSON.stringify(result.issues));

const started = Date.now();
const input = {
  spec: result.spec,
  specDir,
  outDir,
  preview: {
    url,
    paths: { shop: "/shop/", cart: "/cart/", checkout: "/checkout/", product: (slug: string) => `/product/${slug}/` },
    stop: async () => {},
  },
  log: (m: string) => console.log("  ·", m),
};

// ONLY=journey,a11y runs a subset (in that order); the default runs everything through runChecks.
const only = process.env.ONLY?.split(",");
const runners = { journey: runJourney, a11y: runA11y, performance: runPerformance, visual: runVisual };
let groups;
if (only) {
  const browser = await chromium.launch();
  const run = { input, browser, dir: join(outDir, "checks") };
  groups = [];
  for (const id of only) groups.push(await runners[id as keyof typeof runners](run));
  await browser.close();
} else {
  groups = await runChecks(input);
}

for (const g of groups) {
  console.log(`\n${g.label}: ${g.status.toUpperCase()} · ${g.summary} · ${g.passed}/${g.total}`);
  for (const f of g.findings) console.log(`  - [${f.severity}] ${f.specId ? f.specId + " " : ""}${f.message}${f.fix ? `\n      fix: ${f.fix.label} (${f.fix.path})` : ""}${f.screenshot ? `\n      ${f.screenshot}` : ""}`);
}
console.log(`\n${((Date.now() - started) / 1000).toFixed(0)} s · output ${outDir}`);

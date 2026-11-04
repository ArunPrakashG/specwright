/**
 * End-to-end check of the WooCommerce adapter on the sample spec.
 *
 *   tsx scripts/try.ts            emit → sync → configure → provision → validate → screenshots → journey → re-emit, then stop
 *   tsx scripts/try.ts serve      provision and keep the preview running (Ctrl-C stops it)
 *   tsx scripts/try.ts shots URL  re-emit the theme and screenshot a running preview
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import type { AdapterContext, Preview } from "@specwright/core";
import { renderPage, sectionTypes, specTree } from "@specwright/sections";
import { validateSpec, type SiteSpec } from "@specwright/spec";
import { woocommerce } from "../src/index.ts";

const SPEC_DIR = resolve(import.meta.dirname, "../../spec/examples/hale-and-field");
const SHOTS = "/tmp/claude-1000/sw/woo";
const OUT = join(SHOTS, "build");
const [mode = "all", arg] = process.argv.slice(2);

const t0 = Date.now();
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${m}`);
const ctx: AdapterContext = { specDir: SPEC_DIR, outDir: OUT, log };

async function loadSpec(): Promise<SiteSpec> {
  const r = validateSpec(JSON.parse(await readFile(join(SPEC_DIR, "spec.json"), "utf8")), sectionTypes);
  if (!r.ok) throw new Error(r.issues.map((i) => `${i.path}: ${i.message}`).join("\n"));
  return r.spec;
}

async function build(spec: SiteSpec) {
  const emitted = await woocommerce.emitTheme(spec, ctx);
  log(`emitTheme: ${emitted.summary}`);
  const synced = await woocommerce.syncCatalog(spec, ctx);
  const commerce = await woocommerce.configureCommerce(spec, ctx);
  log(`syncCatalog: ${synced.summary} · configureCommerce: ${commerce.summary}`);
  return emitted;
}

async function shots(browser: Browser, spec: SiteSpec, url: string) {
  const reference = join(SHOTS, "reference.html");
  await writeFile(reference, renderPage(spec, "home", { asset: (src) => pathToFileURL(join(SPEC_DIR, src)).href }));
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["mobile", 390, 844],
  ] as const) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(pathToFileURL(reference).href, { waitUntil: "networkidle" });
    await page.screenshot({ path: join(SHOTS, `ref-${name}.png`), fullPage: true });
    const refHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.goto(`${url}/`, { waitUntil: "networkidle" });
    await page.screenshot({ path: join(SHOTS, `live-${name}.png`), fullPage: true });
    const live = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, overflow: document.documentElement.scrollWidth - window.innerWidth }));
    log(`home ${name}: reference ${refHeight}px tall, live ${live.height}px tall, horizontal overflow ${live.overflow}px`);
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${url}/shop/`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS, "shop.png"), fullPage: true });
  await page.goto(`${url}/product/morning-mug/`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS, "product.png"), fullPage: true });
  await page.close();
}

async function specIds(browser: Browser, spec: SiteSpec, url: string) {
  const page = await browser.newPage();
  await page.goto(`${url}/`, { waitUntil: "networkidle" });
  const live = new Set(await page.$$eval("[data-spec-id]", (els) => els.map((e) => e.getAttribute("data-spec-id")!)));
  await page.close();
  const expected = specTree(spec, "home").map((n) => n.id);
  const missing = expected.filter((id) => !live.has(id));
  const required = ["home.hero.heading", "home.story.link", "home.newsletter.button", "home.featured.card-1.image"];
  const roots = spec.pages[0]!.sections.map((s) => `home.${s.id}`);
  log(`spec ids: ${expected.length - missing.length}/${expected.length} of the reference ids are live${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
  const hard = [...required, ...roots].filter((id) => !live.has(id));
  if (hard.length) throw new Error(`Required spec ids missing on the live home: ${hard.join(", ")}`);
}

async function journey(browser: Browser, preview: Preview) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(preview.url + preview.paths.product("morning-mug"), { waitUntil: "networkidle" });
  await page.selectOption('select[name="attribute_glaze"]', "Moss");
  await page.waitForSelector(".single_add_to_cart_button:not(.disabled)");
  await Promise.all([page.waitForLoadState("networkidle"), page.click(".single_add_to_cart_button")]);
  log(`journey: added Morning mug / Moss to cart`);
  await page.goto(preview.url + preview.paths.checkout, { waitUntil: "networkidle" });
  await page.waitForSelector(".wc-block-checkout", { timeout: 30_000 });
  await fillCheckout(page);
  await page.screenshot({ path: join(SHOTS, "checkout.png"), fullPage: true });
  await Promise.all([page.waitForURL(/order-received/, { timeout: 60_000 }), page.click(".wc-block-components-checkout-place-order-button")]);
  await page.waitForLoadState("networkidle");
  const text = await page.locator("main").innerText();
  await page.screenshot({ path: join(SHOTS, "order-received.png"), fullPage: true });
  if (!/Morning mug/.test(text) || !/Moss/.test(text)) throw new Error("Order received page does not list Morning mug / Moss");
  log(`journey: order received at ${page.url().replace(preview.url, "")} (${text.split("\n").find((l) => /thank/i.test(l)) ?? "no thank-you line"})`);
  await page.close();
}

async function fillCheckout(page: Page) {
  await page.fill("#email", "test.buyer@example.com");
  const prefix = (await page.locator("#shipping-first_name").count()) ? "shipping" : "billing";
  const country = page.locator(`#${prefix}-country`);
  if ((await country.evaluate((e) => e.tagName)) === "SELECT") await country.selectOption("US");
  await page.fill(`#${prefix}-first_name`, "Test");
  await page.fill(`#${prefix}-last_name`, "Buyer");
  await page.fill(`#${prefix}-address_1`, "1 Main Street");
  await page.fill(`#${prefix}-city`, "Portland");
  const state = page.locator(`#${prefix}-state`);
  if ((await state.evaluate((e) => e.tagName)) === "SELECT") await state.selectOption("OR");
  else {
    await state.locator("input").fill("Oregon");
    await page.keyboard.press("Enter");
  }
  await page.fill(`#${prefix}-postcode`, "97201");
  // Blur first: the blur recalculates the cart, and a click that lands mid-update is dropped.
  await page.locator(`#${prefix}-postcode`).blur();
  await page.waitForLoadState("networkidle");
  const cod = page.locator('input[value="cod"]');
  if (await cod.count()) await cod.check({ force: true });
  await page.waitForTimeout(1500);
}

async function reEmit(browser: Browser, spec: SiteSpec, url: string) {
  const page = await browser.newPage();
  const color = async () => {
    await page.goto(`${url}/`, { waitUntil: "networkidle" });
    return page.$eval('[data-spec-id="home.story.link"]', (e) => getComputedStyle(e).color);
  };
  const before = await color();
  const fixed = structuredClone(spec);
  const story = fixed.pages[0]!.sections.find((s) => s.id === "story")!;
  story.settings.linkColor = "token:ink";
  await woocommerce.emitTheme(fixed, ctx);
  const after = await color();
  await page.screenshot({ path: join(SHOTS, "live-after-fix.png"), fullPage: true });
  await page.close();
  log(`re-emit: story link colour ${before} → ${after} without restarting the preview`);
  if (after !== "rgb(34, 32, 28)") throw new Error(`Expected the ink colour after re-emit, got ${after}`);
  await woocommerce.emitTheme(spec, ctx);
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const spec = await loadSpec();

  if (mode === "shots") {
    await woocommerce.emitTheme(spec, ctx);
    const browser = await chromium.launch();
    await shots(browser, spec, arg ?? "http://127.0.0.1:9400");
    await specIds(browser, spec, arg ?? "http://127.0.0.1:9400");
    await browser.close();
    return;
  }

  await build(spec);
  const validated = await woocommerce.validate(spec, ctx);
  for (const g of validated) log(`validate ${g.id}: ${g.status} · ${g.summary}${g.findings.map((f) => `\n    ${f.message}`).join("")}`);

  const p0 = Date.now();
  const preview = await woocommerce.provision(spec, ctx);
  log(`provision: ${preview.url} in ${((Date.now() - p0) / 1000).toFixed(1)}s`);
  const stop = async () => {
    await preview.stop();
    log("preview stopped");
  };
  process.once("SIGINT", () => void stop().then(() => process.exit(130)));
  process.once("SIGTERM", () => void stop().then(() => process.exit(143)));

  if (mode === "serve") {
    log("serving; Ctrl-C to stop");
    await new Promise(() => {});
  }

  const browser = await chromium.launch();
  try {
    await shots(browser, spec, preview.url);
    await specIds(browser, spec, preview.url);
    await journey(browser, preview);
    await reEmit(browser, spec, preview.url);
  } finally {
    await browser.close();
    await stop();
  }
  log("all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

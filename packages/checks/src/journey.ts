import type { Locator, Page } from "playwright";
import { primaryMarket, type Product } from "@specwright/spec";
import type { CheckGroup, Finding } from "@specwright/core";
import { abs, ensureDir, errorMessage, newPage, open, pageUrl, rel, type Run } from "./util.ts";

const TEST_ADDRESSES: Record<string, { street: string; city: string; state?: string; postcode: string }> = {
  US: { street: "350 5th Ave", city: "New York", state: "New York", postcode: "10118" },
  GB: { street: "10 Downing Street", city: "London", postcode: "SW1A 2AA" },
  DE: { street: "Unter den Linden 77", city: "Berlin", postcode: "10117" },
  FR: { street: "5 Avenue Anatole France", city: "Paris", postcode: "75007" },
};

interface Step {
  label: string;
  run(page: Page): Promise<void>;
}

/** The first product with options and an in-stock variant, then the first in-stock value of its first option. */
export function pickJourneyProduct(products: Product[]) {
  for (const product of products) {
    if (!product.options.length) continue;
    const variant = product.variants.find((v) => v.stock === undefined || v.stock > 0) ?? product.variants[0];
    if (!variant) continue;
    const choices = product.options.map((o) => ({ name: o.name, value: variant.options[o.name] ?? o.values[0]! }));
    return { product, choices };
  }
  return null;
}

const visible = async (l: Locator, timeout = 15_000) => {
  await l.first().waitFor({ state: "visible", timeout });
};

/** A control named by its label, whether it is a select, a radio, a button or a text input. */
async function setField(page: Page, label: RegExp | string, value: string, optional = true) {
  const field = page.getByLabel(label).first();
  if (!(await field.count())) {
    if (optional) return false;
    throw new Error(`No field labelled ${label}`);
  }
  const tag = await field.evaluate((el) => el.tagName.toLowerCase());
  if (tag === "select") {
    await field.selectOption({ label: value }).catch(async () => {
      const options = await field.locator("option").allTextContents();
      const hit = options.find((o) => o.toLowerCase().includes(value.toLowerCase()));
      if (!hit) throw new Error(`No option ${value} in ${label}`);
      await field.selectOption({ label: hit });
    });
  } else {
    await field.fill(value);
  }
  return true;
}

async function chooseOption(page: Page, name: string, value: string) {
  const select = page.getByLabel(name, { exact: false });
  if ((await select.count()) && (await select.first().evaluate((el) => el.tagName)) === "SELECT") {
    await select.first().selectOption({ label: value });
    return;
  }
  const radio = page.getByRole("radio", { name: value, exact: true });
  if (await radio.count()) {
    await radio.first().check({ force: true });
    return;
  }
  const button = page.getByRole("button", { name: value, exact: true });
  if (await button.count()) {
    await button.first().click();
    return;
  }
  throw new Error(`No control to choose ${name}: ${value}`);
}

async function fillCheckout(page: Page, country: string | undefined) {
  const address = TEST_ADDRESSES[country ?? ""] ?? TEST_ADDRESSES.US!;
  if (country && TEST_ADDRESSES[country]) await setField(page, /^country/i, countryName(country));
  await setField(page, /e-?mail/i, "journey@example.com");
  await setField(page, /first name/i, "Test");
  await setField(page, /last name/i, "Shopper");
  if (!(await setField(page, /^address\b(?!.*(2|optional))|street address(?!.*(2|optional))/i, address.street))) {
    await setField(page, /address line 1/i, address.street);
  }
  await setField(page, /city|town/i, address.city);
  if (address.state) await setField(page, /^state|province|county/i, address.state);
  await setField(page, /post(al)? ?code|zip/i, address.postcode);
  await setField(page, /phone/i, "+15555550100");
}

function countryName(code: string) {
  return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
}

/** Pick an offline payment method (cash on delivery, bank transfer, cheque) so no gateway is involved. */
async function chooseOfflinePayment(page: Page) {
  const method = page.getByRole("radio", { name: /cash on delivery|bank transfer|cheque|check payments|pay on delivery|offline/i });
  if (await method.count()) {
    await method.first().check({ force: true });
    return;
  }
  // A single method is sometimes preselected and shown without a radio.
  const text = page.getByText(/cash on delivery|bank transfer|check payments/i);
  if (!(await text.count())) throw new Error("No offline payment method offered at checkout");
}

export async function runJourney(run: Run): Promise<CheckGroup> {
  await ensureDir(run);
  const { spec, preview } = run.input;
  const pick = pickJourneyProduct(spec.catalog.products);
  const market = primaryMarket(spec);
  const country = market.countries[0];
  const { context, page } = await newPage(run, "desktop");
  const findings: Finding[] = [];
  // What the page saw go wrong, quoted in the failure so a person can tell a slow server from a broken theme.
  const trouble: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400 && r.request().resourceType() !== "image") trouble.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  page.on("pageerror", (e) => trouble.push(`script error: ${e.message.split("\n")[0]}`));

  const shopProducts = spec.catalog.products.slice(0, 6);
  const steps: Step[] = [
    {
      label: "Home loads with a heading",
      async run(p) {
        const r = await open(p, preview.url);
        if (r && r.status() >= 400) throw new Error(`Home returned HTTP ${r.status()}`);
        await visible(p.getByRole("heading", { level: 1 }));
      },
    },
    {
      label: "Shop lists products",
      async run(p) {
        await open(p, pageUrl(run, preview.paths.shop));
        const found: string[] = [];
        for (const product of shopProducts) {
          if (await p.getByRole("link", { name: product.name }).count()) found.push(product.name);
        }
        if (!found.length) throw new Error(`The shop page shows none of: ${shopProducts.map((x) => x.name).join(", ")}`);
        if (pick && !found.includes(pick.product.name)) throw new Error(`${pick.product.name} is missing from the shop page`);
      },
    },
    {
      label: "Product page opens",
      async run(p) {
        if (!pick) throw new Error("The spec has no product with options to test");
        const r = await open(p, pageUrl(run, preview.paths.product(pick.product.slug)));
        if (r && r.status() >= 400) throw new Error(`${pick.product.name} returned HTTP ${r.status()}`);
        await visible(p.getByRole("heading", { name: pick.product.name }));
        await visible(p.getByRole("button", { name: /^add to cart$/i }));
      },
    },
    {
      label: "Variant can be chosen",
      async run(p) {
        for (const c of pick!.choices) await chooseOption(p, c.name, c.value);
        const add = p.getByRole("button", { name: /^add to cart$/i }).first();
        await p.waitForFunction((el) => !(el as HTMLButtonElement).disabled && !el.classList.contains("disabled"), await add.elementHandle(), { timeout: 15_000 });
      },
    },
    {
      label: "Add to cart shows it in the cart",
      async run(p) {
        await p.getByRole("button", { name: /^add to cart$/i }).first().click();
        await p.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        await open(p, pageUrl(run, preview.paths.cart));
        await visible(p.getByText(pick!.product.name, { exact: false }), 30_000);
        const value = pick!.choices[0]!.value;
        if (!(await p.getByText(value, { exact: true }).count())) throw new Error(`The cart does not show the chosen ${pick!.choices[0]!.name}: ${value}`);
        run.cartState = await context.storageState();
      },
    },
    {
      label: "Checkout reaches order received",
      async run(p) {
        await open(p, pageUrl(run, preview.paths.checkout));
        await visible(p.getByLabel(/first name/i), 45_000);
        await fillCheckout(p, country);
        await chooseOfflinePayment(p);
        // Block checkout re-prices shipping (debounced) after address changes and drops clicks meanwhile,
        // so click again until the order request actually goes out.
        const place = p.getByRole("button", { name: /place order/i }).first();
        const submitted = /wc\/store\/v1\/checkout|wc-ajax=checkout/;
        for (let attempt = 1; ; attempt++) {
          await p.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
          await place.waitFor({ state: "visible" });
          const sent = p.waitForRequest((r) => r.method() === "POST" && submitted.test(r.url()), { timeout: 15_000 });
          await place.click();
          if (await sent.then(() => true, () => false)) break;
          if (attempt === 3) throw new Error("Place order did nothing after three clicks");
        }
        await p.waitForURL(/order-received|order-confirmation|thank/i, { timeout: 120_000 });
        await visible(p.getByText(/order (has been )?(received|confirmed|placed)|thank you/i), 30_000);
      },
    },
  ];

  let passed = 0;
  let failedAt = -1;
  for (const [i, step] of steps.entries()) {
    try {
      await step.run(page);
      passed++;
    } catch (e) {
      failedAt = i;
      const name = `journey-step-${i + 1}.png`;
      await page.screenshot({ path: abs(run, name), fullPage: true }).catch(() => {});
      const later = steps.length - i - 1;
      findings.push({
        message: `Step ${i + 1} of ${steps.length}, ${step.label}: ${errorMessage(e)}${later ? ` (${later} later step${later > 1 ? "s" : ""} not run)` : ""}${trouble.length ? `. Seen: ${[...new Set(trouble)].slice(-3).join("; ")}` : ""}`,
        severity: "error",
        page: new URL(page.url()).pathname,
        viewport: "desktop",
        screenshot: rel(name),
      });
      break;
    }
  }
  await context.close();

  return {
    id: "journey",
    label: "Storefront journey",
    status: failedAt < 0 ? "pass" : "fail",
    summary: failedAt < 0 ? `${passed} of ${steps.length} steps` : `${passed} of ${steps.length} steps · failed at step ${failedAt + 1}`,
    passed,
    total: steps.length,
    findings,
  };
}

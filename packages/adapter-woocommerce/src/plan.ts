import type { PlanItem } from "@specwright/core";
import { primaryMarket, type SiteSpec } from "@specwright/spec";

const GOALS: Record<string, Omit<PlanItem, "area" | "subject">> = {
  stripe: { status: "plugin", detail: "WooCommerce Stripe Gateway plugin (test keys in preview, live keys at launch)" },
  "stripe-tax": { status: "plugin", detail: "Stripe Tax for WooCommerce plugin" },
  "flat-rate": { status: "native", detail: "WooCommerce shipping zones with Flat rate and Free shipping methods" },
  "free-shipping": { status: "native", detail: "WooCommerce Free shipping method" },
  mailchimp: { status: "plugin", detail: "Mailchimp for WooCommerce plugin" },
  klaviyo: { status: "plugin", detail: "Klaviyo for WooCommerce plugin" },
  paypal: { status: "plugin", detail: "WooCommerce PayPal Payments plugin" },
  woopayments: { status: "plugin", detail: "WooPayments plugin" },
  "google-analytics": { status: "plugin", detail: "Google Analytics for WooCommerce plugin" },
  "woocommerce-tax": { status: "plugin", detail: "WooCommerce Tax (automated taxes) plugin" },
  "product-reviews": { status: "native", detail: "WooCommerce product reviews" },
};

/** How WooCommerce meets each part of the spec. */
export function plan(spec: SiteSpec): PlanItem[] {
  const primary = primaryMarket(spec);
  const items: PlanItem[] = [
    { area: "theme", subject: "Theme", status: "native", detail: "Block theme: theme.json tokens, bundled fonts, header/footer parts, one pattern per section" },
    {
      area: "pages",
      subject: `${spec.pages.length} page${spec.pages.length === 1 ? "" : "s"}`,
      status: "native",
      detail: "Home is the front-page template; other pages are WordPress pages built from the section patterns",
    },
    {
      area: "policies",
      subject: `${spec.policies.length} polic${spec.policies.length === 1 ? "y" : "ies"}`,
      status: "native",
      detail: "WordPress pages under /policies/; privacy and terms are linked in WooCommerce settings",
    },
    {
      area: "catalog",
      subject: `${spec.catalog.products.length} products · ${spec.catalog.categories.length} categories`,
      status: "native",
      detail: "Product categories, simple products and featured flags",
    },
  ];
  const variable = spec.catalog.products.filter((p) => p.variants.length);
  if (variable.length) {
    items.push({ area: "catalog", subject: "Variants", status: "native", detail: `Variable products with attributes and per-variation stock (${variable.map((p) => p.name).join(", ")})` });
  }
  items.push({ area: "markets", subject: `${primary.name} (${primary.currency})`, status: "native", detail: `Store currency ${primary.currency}, prices ${primary.taxDisplay === "inclusive" ? "include" : "exclude"} tax` });

  const others = spec.markets.filter((m) => m !== primary);
  const currencies = [...new Set(others.map((m) => m.currency).filter((c) => c !== primary.currency))];
  if (currencies.length) {
    items.push({ area: "markets", subject: `Currencies: ${currencies.join(", ")}`, status: "plugin", detail: "WooPayments multi-currency, with fixed prices per currency from the spec" });
  }
  const primaryLocales = new Set(primary.locales);
  const locales = [...new Set(others.flatMap((m) => m.locales).filter((l) => !primaryLocales.has(l)))];
  if (locales.length) {
    items.push({ area: "markets", subject: `Languages: ${locales.join(", ")}`, status: "plugin", detail: "Polylang for WooCommerce (or WPML with WooCommerce Multilingual) for translated pages and products" });
  }
  const mixedTax = others.some((m) => m.taxDisplay !== primary.taxDisplay);
  if (mixedTax) {
    items.push({ area: "markets", subject: "Tax display per market", status: "manual", detail: "WooCommerce shows one tax display store-wide; per-market display needs tax-based pricing settings or a plugin" });
  }

  for (const g of spec.goals) {
    const known = GOALS[g.provider];
    items.push({
      area: "goals",
      subject: `${g.goal}: ${g.provider}`,
      ...(known ?? { status: "manual", detail: `No known WooCommerce integration for "${g.provider}"; set it up by hand` }),
    });
  }
  return items;
}

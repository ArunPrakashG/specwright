import { z } from "zod";
import { SiteSpec, type ColorValue } from "./schema.ts";

export interface Issue {
  /** Dotted path into the spec, e.g. `pages.0.sections.2.settings.linkColor`. */
  path: string;
  message: string;
  severity: "error" | "warning";
}

export type ValidateResult =
  | { ok: true; spec: SiteSpec; issues: Issue[] }
  | { ok: false; issues: Issue[] };

/**
 * Parse and check a spec. `knownSections` lets callers reject section types
 * that no renderer implements; pass it whenever a registry is available.
 */
export function validateSpec(input: unknown, knownSections?: ReadonlySet<string>): ValidateResult {
  const parsed = SiteSpec.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message, severity: "error" })),
    };
  }
  const spec = parsed.data;
  const issues: Issue[] = [];
  const err = (path: string, message: string) => issues.push({ path, message, severity: "error" });
  const warn = (path: string, message: string) => issues.push({ path, message, severity: "warning" });

  dupes(spec.pages.map((p) => p.id)).forEach((id) => err("pages", `Duplicate page id "${id}"`));
  dupes(spec.pages.map((p) => p.path)).forEach((p) => err("pages", `Duplicate page path "${p}"`));
  if (!spec.pages.some((p) => p.path === "/")) err("pages", "No home page (path \"/\")");

  spec.pages.forEach((page, pi) => {
    dupes(page.sections.map((s) => s.id)).forEach((id) => err(`pages.${pi}.sections`, `Duplicate section id "${id}" on ${page.id}`));
    page.sections.forEach((s, si) => {
      if (knownSections && !knownSections.has(s.type)) err(`pages.${pi}.sections.${si}.type`, `Unknown section type "${s.type}"`);
      for (const [key, value] of Object.entries(s.settings)) {
        if (typeof value === "string" && value.startsWith("token:") && !(tokenName(value as ColorValue) in spec.tokens.color)) {
          err(`pages.${pi}.sections.${si}.settings.${key}`, `Unknown colour token "${value}"`);
        }
      }
    });
  });

  const categories = new Set(spec.catalog.categories.map((c) => c.slug));
  dupes(spec.catalog.products.map((p) => p.sku)).forEach((sku) => err("catalog.products", `Duplicate SKU "${sku}"`));
  dupes(spec.catalog.products.map((p) => p.slug)).forEach((s) => err("catalog.products", `Duplicate product slug "${s}"`));
  spec.catalog.products.forEach((p, i) => {
    const at = `catalog.products.${i}`;
    p.categories.filter((c) => !categories.has(c)).forEach((c) => err(`${at}.categories`, `Unknown category "${c}"`));
    p.variants.forEach((v, vi) => {
      for (const o of p.options) {
        const value = v.options[o.name];
        if (value === undefined) err(`${at}.variants.${vi}`, `Variant ${v.sku} has no value for "${o.name}"`);
        else if (!o.values.includes(value)) err(`${at}.variants.${vi}`, `Variant ${v.sku}: "${value}" is not an allowed ${o.name}`);
      }
    });
    if (p.options.length && !p.variants.length) err(at, `${p.name} has options but no variants`);
    for (const m of spec.markets) {
      if (!p.price.some((pr) => pr.currency === m.currency)) warn(`${at}.price`, `${p.name} has no ${m.currency} price for ${m.name}`);
    }
  });

  const primary = spec.markets.filter((m) => m.primary);
  if (primary.length !== 1) err("markets", `Exactly one market must be primary (found ${primary.length})`);
  dupes(spec.markets.map((m) => m.id)).forEach((id) => err("markets", `Duplicate market id "${id}"`));

  for (const required of ["shipping", "returns", "privacy"] as const) {
    if (!spec.policies.some((p) => p.id === required)) warn("policies", `No ${required} policy`);
  }

  return issues.some((i) => i.severity === "error") ? { ok: false, issues } : { ok: true, spec, issues };
}

export function tokenName(value: ColorValue): string {
  return value.slice("token:".length);
}

/** Resolve a colour setting to a hex value. */
export function resolveColor(spec: SiteSpec, value: ColorValue): string {
  if (!value.startsWith("token:")) return value;
  const hex = spec.tokens.color[tokenName(value)];
  if (!hex) throw new Error(`Unknown colour token ${value}`);
  return hex;
}

export function primaryMarket(spec: SiteSpec) {
  return spec.markets.find((m) => m.primary) ?? spec.markets[0]!;
}

export function priceIn(prices: { amount: number; currency: string }[], currency: string) {
  return prices.find((p) => p.currency === currency) ?? prices[0]!;
}

export function formatMoney(amount: number, currency: string, locale = "en") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);
}

export function specJsonSchema() {
  return z.toJSONSchema(SiteSpec, { io: "input" });
}

function dupes(values: string[]) {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const v of values) (seen.has(v) ? out : seen).add(v);
  return [...out];
}

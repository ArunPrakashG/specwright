import { primaryMarket, type Page, type SiteSpec } from "@specwright/spec";
import { readFileSync } from "node:fs";
import { sections, esc, type RenderContext } from "./library.ts";

export const sectionsCss = readFileSync(new URL("./sections.css", import.meta.url), "utf8");

const SERIF = /serif|garamond|caslon|playfair|lora|merriweather|fraunces|baskerville|didot|bodoni/i;

export function fontStack(family: string) {
  const generic = SERIF.test(family) && !/sans/i.test(family) ? "Georgia, serif" : "ui-sans-serif, system-ui, sans-serif";
  return `"${family}", ${generic}`;
}

/** Google Fonts stylesheet for the spec's families (used by previews; themes bundle the files). */
export function fontsHref(spec: SiteSpec) {
  const families = [...new Set([spec.tokens.font.heading, spec.tokens.font.body])];
  const q = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}${SERIF.test(f) && !/sans/i.test(f) ? "" : ":wght@400;500;600"}`);
  return `https://fonts.googleapis.com/css2?${q.join("&")}&display=swap`;
}

/** The spec's tokens as --st-* custom properties on `selector`. */
export function tokensCss(spec: SiteSpec, selector = ".st") {
  const lines = Object.entries(spec.tokens.color).map(([k, v]) => `  --st-${k}: ${v};`);
  lines.push(
    `  --st-font-heading: ${fontStack(spec.tokens.font.heading)};`,
    `  --st-font-body: ${fontStack(spec.tokens.font.body)};`,
    `  --st-radius: ${spec.tokens.radius}px;`,
    `  --st-width: ${spec.tokens.width + 80}px;`,
  );
  return `${selector} {\n${lines.join("\n")}\n}\n`;
}

/** Header and footer sections on the home page frame every page. */
export function layoutSections(spec: SiteSpec) {
  const home = spec.pages.find((p) => p.path === "/") ?? spec.pages[0]!;
  return {
    home,
    header: home.sections.find((s) => s.type === "header"),
    footer: home.sections.find((s) => s.type === "footer"),
  };
}

export interface RenderOptions {
  locale?: string;
  /** Market id; picks the currency. Defaults to the primary market. */
  market?: string;
  asset?: (src: string) => string;
  productUrl?: RenderContext["productUrl"];
  cartUrl?: string;
}

function context(spec: SiteSpec, page: Page, o: RenderOptions): RenderContext {
  const market = spec.markets.find((m) => m.id === o.market) ?? primaryMarket(spec);
  return {
    spec,
    page,
    locale: o.locale ?? market.locales[0] ?? "en",
    currency: market.currency,
    asset: o.asset ?? ((src) => src),
    productUrl: o.productUrl ?? ((p) => `/product/${p.slug}/`),
    cartUrl: o.cartUrl ?? "/cart/",
  };
}

/** Render one section instance. Its spec id is `<page id>.<section id>`. */
export function renderSection(spec: SiteSpec, page: Page, sectionId: string, o: RenderOptions = {}) {
  const instance = page.sections.find((s) => s.id === sectionId);
  if (!instance) throw new Error(`No section ${sectionId} on ${page.id}`);
  const def = sections[instance.type];
  if (!def) throw new Error(`Unknown section type ${instance.type}`);
  const settings = def.settings.parse(instance.settings);
  const base = `${page.id}.${instance.id}`;
  return def.render(settings, context(spec, page, o), (part) => (part ? `${base}.${part}` : base));
}

/** The body of a page, framed by the site header and footer. */
export function renderBody(spec: SiteSpec, pageId: string, o: RenderOptions = {}) {
  const page = spec.pages.find((p) => p.id === pageId);
  if (!page) throw new Error(`No page ${pageId}`);
  const { home, header, footer } = layoutSections(spec);
  const own = page.sections.filter((s) => s.type !== "header" && s.type !== "footer");
  const parts = [
    header ? renderSection(spec, home, header.id, o) : "",
    `<main id="main">${own.map((s) => renderSection(spec, page, s.id, o)).join("\n")}</main>`,
    footer ? renderSection(spec, home, footer.id, o) : "",
  ];
  return `<div class="st">\n${parts.join("\n")}\n</div>`;
}

/** A complete, standalone HTML document: the reference render. */
export function renderPage(spec: SiteSpec, pageId: string, o: RenderOptions & { head?: string } = {}) {
  const page = spec.pages.find((p) => p.id === pageId);
  if (!page) throw new Error(`No page ${pageId}`);
  const ctx = context(spec, page, o);
  return `<!doctype html>
<html lang="${esc(ctx.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.path === "/" ? spec.name : `${page.title} · ${spec.name}`)}</title>
<link rel="stylesheet" href="${esc(fontsHref(spec))}">
<style>
body { margin: 0; }
${tokensCss(spec)}
${sectionsCss}
</style>
${o.head ?? ""}
</head>
<body>
${renderBody(spec, pageId, o)}
</body>
</html>
`;
}

export interface SpecNode {
  id: string;
  label: string;
  depth: number;
  type?: string;
}

/** Every addressable spec id on a page, in render order, for trees, pickers and pins. */
export function specTree(spec: SiteSpec, pageId: string): SpecNode[] {
  const page = spec.pages.find((p) => p.id === pageId);
  if (!page) return [];
  const { home, header, footer } = layoutSections(spec);
  const list = [
    ...(header && page !== home ? [{ page: home, s: header }] : []),
    ...page.sections.map((s) => ({ page, s })),
    ...(footer && page !== home ? [{ page: home, s: footer }] : []),
  ];
  const out: SpecNode[] = [];
  for (const { page: pg, s } of list) {
    const def = sections[s.type];
    const base = `${pg.id}.${s.id}`;
    out.push({ id: base, label: s.id, depth: 1, type: s.type });
    if (!def) continue;
    const ctx = context(spec, pg, {});
    for (const part of def.parts(def.settings.parse(s.settings), ctx).filter(Boolean)) {
      out.push({ id: `${base}.${part}`, label: part, depth: part.split(".").length + 1 });
    }
  }
  return out;
}

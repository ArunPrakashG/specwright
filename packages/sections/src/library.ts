import { z } from "zod";
import { ColorValue, Image, formatMoney, priceIn, type Page, type Product, type SiteSpec } from "@specwright/spec";

/** Text that may be translated: a plain string, or one string per locale. */
export const Localized = z.union([z.string(), z.record(z.string(), z.string())]);
export type Localized = z.infer<typeof Localized>;
const LinkSetting = z.object({ label: Localized, href: z.string() });

export interface RenderContext {
  spec: SiteSpec;
  page: Page;
  locale: string;
  currency: string;
  /** Turn a spec-relative asset path (`images/mug.svg`) into a URL the output can load. */
  asset(src: string): string;
  /** Where a product lives on the target platform. */
  productUrl(product: Product): string;
  cartUrl: string;
}

export interface SectionDef<S = any> {
  type: string;
  label: string;
  settings: z.ZodType<S>;
  /** Spec id suffixes this section marks with data-spec-id, for lock-on and review pins. */
  parts(settings: S, ctx: RenderContext): string[];
  render(settings: S, ctx: RenderContext, id: (part?: string) => string): string;
}

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function t(value: Localized | undefined, locale: string): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  return value[locale] ?? value[locale.split("-")[0]!] ?? value.en ?? Object.values(value)[0] ?? "";
}

export function colorVar(value: ColorValue) {
  return value.startsWith("token:") ? `var(--st-${value.slice(6)})` : value;
}

const attr = (id: string) => `data-spec-id="${esc(id)}"`;

function tile(img: z.infer<typeof Image>, ctx: RenderContext, id: string, extra = "") {
  const bg = img.background ? ` style="background: var(--st-${esc(img.background)})"` : "";
  return `<div class="st-tile${extra}"${bg} ${attr(id)}><img src="${esc(ctx.asset(img.src))}" alt="${esc(img.alt)}" loading="lazy"></div>`;
}

function paragraphs(body: string) {
  return body.split(/\n{2,}/).map((p) => `<p>${esc(p.trim())}</p>`).join("");
}

const headerSettings = z.object({ brand: z.string(), links: z.array(LinkSetting).default([]), showCart: z.boolean().default(true) });
const header: SectionDef<z.infer<typeof headerSettings>> = {
  type: "header",
  label: "Header",
  settings: headerSettings,
  parts: () => ["", "brand", "nav"],
  render(s, ctx, id) {
    const links = s.links.map((l) => `<li><a href="${esc(l.href)}">${esc(t(l.label, ctx.locale))}</a></li>`);
    if (s.showCart) links.push(`<li><a href="${esc(ctx.cartUrl)}">Cart</a></li>`);
    return `<header class="st-in st-head" ${attr(id())}>
  <a class="st-word" href="/" ${attr(id("brand"))}>${esc(s.brand)}</a>
  <nav aria-label="Main" ${attr(id("nav"))}><ul class="st-links">${links.join("")}</ul>
    <details class="st-menu"><summary>Menu</summary><ul>${links.join("")}</ul></details></nav>
</header>`;
  },
};

const heroSettings = z.object({
  heading: Localized,
  lead: Localized.optional(),
  button: LinkSetting.optional(),
  image: Image.optional(),
});
const hero: SectionDef<z.infer<typeof heroSettings>> = {
  type: "hero",
  label: "Hero · split",
  settings: heroSettings,
  parts: (s) => ["", "heading", ...(s.lead ? ["lead"] : []), ...(s.button ? ["cta"] : []), ...(s.image ? ["image"] : [])],
  render(s, ctx, id) {
    return `<section class="st-in" ${attr(id())} aria-labelledby="${id("heading")}"><div class="st-hero">
  <div>
    <h1 id="${id("heading")}" class="st-h1" ${attr(id("heading"))}>${esc(t(s.heading, ctx.locale))}</h1>
    ${s.lead ? `<p class="st-lead" ${attr(id("lead"))}>${esc(t(s.lead, ctx.locale))}</p>` : ""}
    ${s.button ? `<a class="st-btn" href="${esc(s.button.href)}" ${attr(id("cta"))}>${esc(t(s.button.label, ctx.locale))}</a>` : ""}
  </div>
  ${s.image ? tile(s.image, ctx, id("image")) : ""}
</div></section>`;
  },
};

const gridSettings = z.object({
  heading: Localized,
  category: z.string().optional(),
  featured: z.boolean().optional(),
  limit: z.number().int().min(1).max(24).default(3),
  link: LinkSetting.optional(),
});
function gridProducts(s: z.infer<typeof gridSettings>, spec: SiteSpec) {
  return spec.catalog.products
    .filter((p) => (s.category ? p.categories.includes(s.category) : true) && (s.featured ? p.featured : true))
    .slice(0, s.limit);
}
const productGrid: SectionDef<z.infer<typeof gridSettings>> = {
  type: "product-grid",
  label: "Product grid",
  settings: gridSettings,
  parts: (s, ctx) => [
    "",
    "heading",
    ...gridProducts(s, ctx.spec).flatMap((_, i) => [`card-${i + 1}`, `card-${i + 1}.image`]),
    ...(s.link ? ["link"] : []),
  ],
  render(s, ctx, id) {
    const cards = gridProducts(s, ctx.spec).map((p, i) => {
      const price = priceIn(p.price, ctx.currency);
      const img = p.images[0];
      const n = `card-${i + 1}`;
      return `<li class="st-card" ${attr(id(n))}>
      ${img ? tile(img, ctx, id(`${n}.image`)) : ""}
      <span class="st-card-meta"><a href="${esc(ctx.productUrl(p))}">${esc(p.name)}</a><span class="st-price">${esc(formatMoney(price.amount, price.currency, ctx.locale))}</span></span>
    </li>`;
    });
    return `<div class="st-in"><section class="st-sec" ${attr(id())} aria-labelledby="${id("heading")}">
  <div class="st-sechead">
    <h2 id="${id("heading")}" class="st-h2" ${attr(id("heading"))}>${esc(t(s.heading, ctx.locale))}</h2>
    ${s.link ? `<a class="st-textlink" href="${esc(s.link.href)}" ${attr(id("link"))}>${esc(t(s.link.label, ctx.locale))}</a>` : ""}
  </div>
  <ul class="st-grid">${cards.join("")}</ul>
</section></div>`;
  },
};

const mediaSettings = z.object({
  heading: Localized,
  body: Localized,
  link: LinkSetting.optional(),
  linkColor: ColorValue.optional(),
  image: Image,
  imageFirst: z.boolean().default(false),
});
const mediaText: SectionDef<z.infer<typeof mediaSettings>> = {
  type: "media-text",
  label: "Media and text",
  settings: mediaSettings,
  parts: (s) => ["", "heading", "body", ...(s.link ? ["link"] : []), "image"],
  render(s, ctx, id) {
    const color = s.linkColor ? ` style="color: ${esc(colorVar(s.linkColor))}"` : "";
    const text = `<div>
    <h2 id="${id("heading")}" class="st-h2" ${attr(id("heading"))}>${esc(t(s.heading, ctx.locale))}</h2>
    <p class="st-body" ${attr(id("body"))}>${esc(t(s.body, ctx.locale))}</p>
    ${s.link ? `<a class="st-textlink" href="${esc(s.link.href)}"${color} ${attr(id("link"))}>${esc(t(s.link.label, ctx.locale))}</a>` : ""}
  </div>`;
    const image = tile(s.image, ctx, id("image"));
    return `<div class="st-in"><section class="st-sec st-media" ${attr(id())} aria-labelledby="${id("heading")}">
  ${s.imageFirst ? image + text : text + image}
</section></div>`;
  },
};

const newsSettings = z.object({ heading: Localized, list: z.string(), button: Localized.default("Subscribe") });
const newsletter: SectionDef<z.infer<typeof newsSettings>> = {
  type: "newsletter",
  label: "Newsletter",
  settings: newsSettings,
  parts: () => ["", "heading", "input", "button"],
  render(s, ctx, id) {
    return `<div class="st-in"><section class="st-sec" ${attr(id())} aria-labelledby="${id("heading")}"><div class="st-news">
  <h2 id="${id("heading")}" class="st-h2" ${attr(id("heading"))}>${esc(t(s.heading, ctx.locale))}</h2>
  <form class="st-form" method="post" action="#subscribe" data-list="${esc(s.list)}">
    <label class="st-sr" for="${id("input")}">Email</label>
    <input id="${id("input")}" class="st-input" type="email" name="email" autocomplete="email" placeholder="you@example.com" required ${attr(id("input"))}>
    <button class="st-btn st-btn--accent" type="submit" ${attr(id("button"))}>${esc(t(s.button, ctx.locale))}</button>
  </form>
</div></section></div>`;
  },
};

const footSettings = z.object({ address: z.string(), links: z.array(LinkSetting).default([]) });
const footer: SectionDef<z.infer<typeof footSettings>> = {
  type: "footer",
  label: "Footer",
  settings: footSettings,
  parts: () => ["", "address", "links"],
  render(s, ctx, id) {
    return `<div class="st-in"><footer class="st-foot" ${attr(id())}>
  <span ${attr(id("address"))}>${esc(s.address)}</span>
  <nav aria-label="Policies" ${attr(id("links"))}><ul>${s.links.map((l) => `<li><a href="${esc(l.href)}">${esc(t(l.label, ctx.locale))}</a></li>`).join("")}</ul></nav>
</footer></div>`;
  },
};

const richSettings = z.object({ heading: Localized, body: Localized });
const richText: SectionDef<z.infer<typeof richSettings>> = {
  type: "rich-text",
  label: "Rich text",
  settings: richSettings,
  parts: () => ["", "heading", "body"],
  render(s, ctx, id) {
    return `<div class="st-in"><section class="st-sec st-prose" ${attr(id())} aria-labelledby="${id("heading")}">
  <h1 id="${id("heading")}" class="st-h2" ${attr(id("heading"))}>${esc(t(s.heading, ctx.locale))}</h1>
  <div ${attr(id("body"))}>${paragraphs(t(s.body, ctx.locale))}</div>
</section></div>`;
  },
};

export const sections: Record<string, SectionDef> = Object.fromEntries(
  [header, hero, productGrid, mediaText, newsletter, footer, richText].map((d) => [d.type, d]),
);
export const sectionTypes: ReadonlySet<string> = new Set(Object.keys(sections));
export { gridProducts };

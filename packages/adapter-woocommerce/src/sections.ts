import { sections } from "@specwright/sections";
import type { Page, SectionInstance, SiteSpec } from "@specwright/spec";
import { block, group, heading, join, list, paragraph } from "./blocks.ts";
import { cls, esc, href, sid, text } from "./util.ts";

export interface SectionContext {
  spec: SiteSpec;
  page: Page;
  /** Theme slug, the pattern namespace. */
  theme: string;
  /** Spec id of this section, or of one of its parts. */
  id(part?: string): string;
  /** URL of a spec asset bundled in the theme. Patterns get a PHP expression; parts must not use it. */
  image(src: string): string;
  /** Unique per page, for query blocks. */
  queryId: number;
}

type Render = (s: any, c: SectionContext) => string;

/** Block markup for one section instance, using the shared st-* classes. */
export function sectionMarkup(instance: SectionInstance, c: SectionContext) {
  const def = sections[instance.type];
  const render = RENDERERS[instance.type];
  if (!def || !render) throw new Error(`The WooCommerce adapter has no block markup for section type "${instance.type}"`);
  return render(def.settings.parse(instance.settings), c);
}

const tx = (c: SectionContext, v: Parameters<typeof text>[1]) => esc(text(c.spec, v));

function tile(img: { src: string; alt: string; background?: string }, c: SectionContext, id: string) {
  // core/image has no background support, so an inline style would fail editor validation; a class carries it.
  const className = cls("st-tile", img.background && `st-bg-${img.background}`, sid(id));
  return block(
    "image",
    { sizeSlug: "full", linkDestination: "none", className },
    `<figure class="wp-block-image size-full ${esc(className)}"><img src="${c.image(img.src)}" alt="${esc(img.alt)}"/></figure>`,
  );
}

function textLink(link: { label: Parameters<typeof text>[1]; href: string }, c: SectionContext, id: string, style = "") {
  return paragraph("st-linkp", `<a class="${cls("st-textlink", sid(id))}" href="${esc(href(link.href))}"${style}>${tx(c, link.label)}</a>`);
}

function navLinks(s: { links: { label: Parameters<typeof text>[1]; href: string }[]; showCart?: boolean }, c: SectionContext) {
  const links = s.links.map((l) => `<a href="${esc(href(l.href))}">${tx(c, l.label)}</a>`);
  if (s.showCart) links.push(`<a href="/cart/">Cart</a>`);
  return links;
}

const header: Render = (s, c) => {
  const links = navLinks(s, c);
  const menu = block("details", { className: "st-menu" }, `<details class="wp-block-details st-menu"><summary>Menu</summary>\n${list("", links)}\n</details>`);
  return group(
    cls("st-in st-head", sid(c.id())),
    join(
      paragraph("st-brand", `<a class="${cls("st-word", sid(c.id("brand")))}" href="/">${esc(s.brand)}</a>`),
      group(cls("st-nav", sid(c.id("nav"))), join(list("st-links", links), menu), { tag: "nav", label: "Main" }),
    ),
    { tag: "header" },
  );
};

const hero: Render = (s, c) => {
  const button = s.button
    ? block(
        "buttons",
        null,
        `<div class="wp-block-buttons">\n${block(
          "button",
          { className: cls("st-cta", sid(c.id("cta"))) },
          `<div class="wp-block-button ${cls("st-cta", sid(c.id("cta")))}"><a class="wp-block-button__link wp-element-button" href="${esc(href(s.button.href))}">${tx(c, s.button.label)}</a></div>`,
        )}\n</div>`,
      )
    : "";
  const copy = group(
    "st-hero-copy",
    join(
      heading(1, cls("st-h1", sid(c.id("heading"))), tx(c, s.heading)),
      s.lead && paragraph(cls("st-lead", sid(c.id("lead"))), tx(c, s.lead)),
      button,
    ),
  );
  return group(cls("st-in", sid(c.id())), group("st-hero", join(copy, s.image && tile(s.image, c, c.id("image")))), { tag: "section" });
};

/** The card markup inside a product collection: image tile, then name and price on one row. */
export function productCard() {
  return join(
    block("woocommerce/product-image", {
      showSaleBadge: false,
      showProductLink: true,
      imageSizing: "single",
      isDescendentOfQueryLoop: true,
      aspectRatio: "4/5",
      scale: "cover",
    }),
    group(
      "st-card-meta",
      join(
        block("post-title", { level: 0, isLink: true, className: "st-card-name", __woocommerceNamespace: "woocommerce/product-collection/product-title" }),
        block("woocommerce/product-price", { isDescendentOfQueryLoop: true, className: "st-price" }),
      ),
    ),
  );
}

/** A product collection; `cards` names the section whose cards get numbered spec ids. */
export function productCollection(o: { queryId: number; perPage: number; category?: string; featured?: boolean; inherit?: boolean; cards?: string; extra?: string }) {
  const query = {
    perPage: o.perPage,
    pages: 0,
    offset: 0,
    postType: "product",
    order: o.inherit ? "asc" : "desc",
    orderBy: o.inherit ? "menu_order" : "date",
    search: "",
    exclude: [],
    inherit: o.inherit ?? false,
    taxQuery: o.category ? { product_cat: [`__TERM_${o.category}__`] } : {},
    isProductCollectionBlock: true,
    featured: o.featured ?? false,
    woocommerceOnSale: false,
    woocommerceStockStatus: ["instock", "outofstock", "onbackorder"],
    woocommerceAttributes: [],
    woocommerceHandPickedProducts: [],
  };
  const className = cls("st-collection", o.cards && `sw-cards-${o.cards.replaceAll(".", "__")}`);
  const a = {
    queryId: o.queryId,
    query,
    tagName: "div",
    displayLayout: { type: "flex", columns: 3, shrinkColumns: true },
    queryContextIncludes: ["collection"],
    className,
  };
  const inner = join(block("woocommerce/product-template", { className: "st-grid" }, productCard()), o.extra);
  return block("woocommerce/product-collection", a, `<div class="wp-block-woocommerce-product-collection ${className}">\n${inner}\n</div>`).replace(
    /"__TERM_([a-z0-9-]+)__"/g,
    (_, slug) => `<?php echo (int) specwright_term_id( '${slug}' ); ?>`,
  );
}

const productGrid: Render = (s, c) => {
  const head = group(
    "st-sechead",
    join(heading(2, cls("st-h2", sid(c.id("heading"))), tx(c, s.heading)), s.link && textLink(s.link, c, c.id("link"))),
  );
  const grid = productCollection({ queryId: c.queryId, perPage: s.limit, category: s.category, featured: s.featured, cards: c.id() });
  return group("st-in", group(cls("st-sec", sid(c.id())), join(head, grid), { tag: "section" }));
};

const mediaText: Render = (s, c) => {
  const color = s.linkColor ? ` style="color: ${esc(colorCss(s.linkColor))}"` : "";
  const copy = group(
    "st-media-copy",
    join(
      heading(2, cls("st-h2", sid(c.id("heading"))), tx(c, s.heading)),
      paragraph(cls("st-body", sid(c.id("body"))), tx(c, s.body)),
      s.link && textLink(s.link, c, c.id("link"), color),
    ),
  );
  const image = tile(s.image, c, c.id("image"));
  return group("st-in", group(cls("st-sec st-media", sid(c.id())), s.imageFirst ? join(image, copy) : join(copy, image), { tag: "section" }));
};

/** Same value the reference render writes: a token becomes its custom property. */
function colorCss(value: string) {
  return value.startsWith("token:") ? `var(--st-${value.slice(6)})` : value;
}

const newsletter: Render = (s, c) => {
  const input = c.id("input");
  const form = `<form class="st-form" method="post" action="#subscribe" data-list="${esc(s.list)}">
  <label class="st-sr" for="${esc(input)}">Email</label>
  <input id="${esc(input)}" class="${cls("st-input", sid(input))}" type="email" name="email" autocomplete="email" placeholder="you@example.com" required>
  <button class="${cls("st-btn st-btn--accent", sid(c.id("button")))}" type="submit">${tx(c, s.button)}</button>
</form>`;
  return group(
    "st-in",
    group(cls("st-sec", sid(c.id())), group("st-news", join(heading(2, cls("st-h2", sid(c.id("heading"))), tx(c, s.heading)), block("html", null, form))), {
      tag: "section",
    }),
  );
};

const footer: Render = (s, c) => {
  const links = s.links.map((l: { label: Parameters<typeof text>[1]; href: string }) => `<a href="${esc(href(l.href))}">${tx(c, l.label)}</a>`);
  return group(
    "st-in",
    group(
      cls("st-foot", sid(c.id())),
      join(
        paragraph(cls("st-address", sid(c.id("address"))), esc(s.address)),
        group(sid(c.id("links")), list("", links), { tag: "nav", label: "Policies" }),
      ),
      { tag: "footer" },
    ),
  );
};

/** Rich text: also used for policy pages, which have no section of their own. */
export function prose(headingHtml: string, body: string, ids?: { root: string; heading: string; body: string }) {
  const paras = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => paragraph("", esc(p)));
  return group(
    "st-in",
    group(cls("st-sec st-prose", ids && sid(ids.root)), join(heading(1, cls("st-h2", ids && sid(ids.heading)), headingHtml), group(ids ? sid(ids.body) : "", join(...paras))), {
      tag: "section",
    }),
  );
}

const richText: Render = (s, c) => prose(tx(c, s.heading), text(c.spec, s.body), { root: c.id(), heading: c.id("heading"), body: c.id("body") });

const RENDERERS: Record<string, Render> = {
  header,
  hero,
  "product-grid": productGrid,
  "media-text": mediaText,
  newsletter,
  footer,
  "rich-text": richText,
};

export const supportedSections = new Set(Object.keys(RENDERERS));

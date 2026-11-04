import { z } from "zod";

/**
 * The Site Spec: a platform-neutral description of a store.
 * It owns structure and design. The live store owns operational data (orders, stock).
 * No Liquid, block markup or PHP lives here; adapters turn it into those.
 */

export const SPEC_VERSION = "1" as const;

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, digits and dashes");
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "six digit hex colour like #22201C");

/** A colour setting is either a token reference (`token:ink`) or a literal hex value. */
export const ColorValue = z.union([z.string().regex(/^token:[a-z0-9-]+$/), hex]);
export type ColorValue = z.infer<typeof ColorValue>;

export const Tokens = z.object({
  color: z
    .object({
      bg: hex,
      ink: hex,
      "ink-2": hex,
      line: hex,
      primary: hex,
      "on-primary": hex,
      accent: hex,
      "on-accent": hex,
      surface: hex,
    })
    .catchall(hex),
  font: z.object({
    heading: z.string(),
    body: z.string(),
  }),
  radius: z.number().int().min(0).max(32).default(2),
  /** Max content width in px. */
  width: z.number().int().min(640).max(1600).default(1120),
});
export type Tokens = z.infer<typeof Tokens>;

export const Image = z.object({
  src: z.string(),
  alt: z.string(),
  /** Token name painted behind the image, for illustrations with transparent backgrounds. */
  background: z.string().optional(),
});
export type Image = z.infer<typeof Image>;

export const Link = z.object({ label: z.string(), href: z.string() });

export const SectionInstance = z.object({
  id: slug,
  type: z.string(),
  settings: z.record(z.string(), z.unknown()).default({}),
});
export type SectionInstance = z.infer<typeof SectionInstance>;

export const Page = z.object({
  id: slug,
  title: z.string(),
  path: z.string().startsWith("/"),
  sections: z.array(SectionInstance),
});
export type Page = z.infer<typeof Page>;

export const Money = z.object({
  /** Amount in minor units (cents). */
  amount: z.number().int().nonnegative(),
  currency: z.string().length(3),
});
export type Money = z.infer<typeof Money>;

export const Option = z.object({ name: z.string(), values: z.array(z.string()).min(1) });

export const Variant = z.object({
  sku: z.string(),
  options: z.record(z.string(), z.string()),
  price: z.array(Money).optional(),
  stock: z.number().int().nonnegative().optional(),
});

export const Product = z.object({
  sku: z.string(),
  slug,
  name: z.string(),
  description: z.string(),
  price: z.array(Money).min(1),
  categories: z.array(slug).default([]),
  images: z.array(Image).default([]),
  options: z.array(Option).default([]),
  variants: z.array(Variant).default([]),
  featured: z.boolean().default(false),
  stock: z.number().int().nonnegative().optional(),
});
export type Product = z.infer<typeof Product>;

export const Category = z.object({ slug, name: z.string() });

export const Market = z.object({
  id: slug,
  name: z.string(),
  countries: z.array(z.string().length(2)).min(1),
  currency: z.string().length(3),
  locales: z.array(z.string()).min(1),
  /** Prices shown with tax included (EU, UK) or added at checkout (US). */
  taxDisplay: z.enum(["inclusive", "exclusive"]),
  primary: z.boolean().default(false),
});
export type Market = z.infer<typeof Market>;

/** Integrations are recorded as goals; each adapter decides how to meet them. */
export const Goal = z.object({
  goal: z.enum(["payments", "tax", "shipping", "email-marketing", "analytics", "reviews"]),
  provider: z.string(),
  notes: z.string().optional(),
});
export type Goal = z.infer<typeof Goal>;

export const Policy = z.object({
  id: z.enum(["shipping", "returns", "privacy", "terms", "accessibility"]),
  title: z.string(),
  body: z.string(),
});

export const SiteSpec = z.object({
  specVersion: z.literal(SPEC_VERSION),
  id: slug,
  name: z.string(),
  domain: z.string().optional(),
  revision: z.number().int().positive().default(1),
  tokens: Tokens,
  pages: z.array(Page).min(1),
  catalog: z.object({
    categories: z.array(Category).default([]),
    products: z.array(Product).default([]),
  }),
  markets: z.array(Market).min(1),
  goals: z.array(Goal).default([]),
  policies: z.array(Policy).default([]),
  /** Small per-platform escape hatch. Keep it small; most things belong above. */
  targets: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
});
export type SiteSpec = z.infer<typeof SiteSpec>;
export type SiteSpecInput = z.input<typeof SiteSpec>;

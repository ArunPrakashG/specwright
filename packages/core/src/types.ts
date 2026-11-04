import type { SiteSpec } from "@specwright/spec";

/** How a platform meets a part of the spec. Shown in `specwright plan` and the dashboard. */
export interface PlanItem {
  area: "theme" | "catalog" | "markets" | "goals" | "policies" | "pages";
  subject: string;
  status: "native" | "plugin" | "manual" | "unsupported";
  detail: string;
}

export interface AdapterContext {
  /** Directory holding spec.json and its assets (images/). */
  specDir: string;
  /** Build output directory; adapters write under it. */
  outDir: string;
  log(message: string): void;
  signal?: AbortSignal;
}

export interface Emitted {
  dir: string;
  files: string[];
  /** Spec id (section level) → the file that implements it, e.g. `home.hero` → `patterns/home-hero.php`. */
  map: Record<string, string>;
  summary: string;
}

export interface Preview {
  url: string;
  /** Store paths the shared storefront journey needs. */
  paths: { shop: string; cart: string; checkout: string; product(slug: string): string };
  stop(): Promise<void>;
}

export interface StoreAdapter {
  id: string;
  label: string;
  plan(spec: SiteSpec): PlanItem[];
  /** Write the theme. Section-level output files map back to spec ids. */
  emitTheme(spec: SiteSpec, ctx: AdapterContext): Promise<Emitted>;
  /** Prepare (preview) or push (live) categories, products and variants. */
  syncCatalog(spec: SiteSpec, ctx: AdapterContext): Promise<{ products: number; categories: number; summary: string }>;
  /** Currency, tax display, test-mode payments, shipping zones and policy pages. */
  configureCommerce(spec: SiteSpec, ctx: AdapterContext): Promise<{ summary: string }>;
  /** Start a disposable preview store from the emitted output. */
  provision(spec: SiteSpec, ctx: AdapterContext & { port?: number }): Promise<Preview>;
  /** Platform-native static checks on the emitted output (block markup, coding standards). */
  validate(spec: SiteSpec, ctx: AdapterContext): Promise<CheckGroup[]>;
}

export type CheckStatus = "pass" | "fail" | "warn" | "skip";

/** A change to the spec that resolves a finding. Paths are dotted, into the raw spec JSON. */
export interface Fix {
  path: string;
  from: unknown;
  to: unknown;
  label: string;
}

export interface Finding {
  message: string;
  severity: "error" | "warning";
  specId?: string;
  page?: string;
  viewport?: "desktop" | "mobile";
  /** Short HTML snippet of the failing element. */
  snippet?: string;
  /** Screenshot of the failing element, relative to the build directory. */
  screenshot?: string;
  fix?: Fix;
}

export interface CheckGroup {
  id: "journey" | "a11y" | "performance" | "markup" | "standards" | "visual";
  label: string;
  status: CheckStatus;
  /** One line, e.g. "6 of 6 steps" or "1 failing". */
  summary: string;
  passed: number;
  total: number;
  findings: Finding[];
}

export type StepId = "validate" | "theme" | "catalog" | "preview" | "checks" | "autofix" | "recheck";

export interface Step {
  id: StepId;
  label: string;
  status: "waiting" | "running" | "pass" | "fail" | "skip";
  detail?: string;
  startedAt?: string;
  endedAt?: string;
}

export type BuildEvent =
  | { type: "step"; step: Step }
  | { type: "checks"; groups: CheckGroup[] }
  | { type: "fix"; fix: Fix; revision: number }
  | { type: "log"; message: string };

export interface ChecksInput {
  spec: SiteSpec;
  specDir: string;
  outDir: string;
  preview: Preview;
  log(message: string): void;
}
export type ChecksRunner = (input: ChecksInput) => Promise<CheckGroup[]>;

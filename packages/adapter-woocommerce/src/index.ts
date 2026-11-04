import type { StoreAdapter } from "@specwright/core";
import { syncCatalog } from "./catalog.ts";
import { configureCommerce } from "./commerce.ts";
import { plan } from "./plan.ts";
import { provision } from "./provision.ts";
import { emitTheme } from "./theme.ts";
import { validate } from "./validate.ts";

export const woocommerce: StoreAdapter = {
  id: "woocommerce",
  label: "WooCommerce",
  plan,
  emitTheme,
  syncCatalog,
  configureCommerce,
  provision: (spec, ctx) => provision(spec, ctx),
  validate,
};

export { ensureWooCommerce, freePort } from "./provision.ts";
export { checkMarkup, markupOf, phpLint } from "./validate.ts";

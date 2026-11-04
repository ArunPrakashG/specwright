/**
 * WordPress and WooCommerce adjustments, appended after the shared section CSS. They undo core
 * and WooCommerce defaults that the reference render does not have, and style the store pages
 * (shop, product, cart, checkout) with the same tokens. Section rules themselves stay shared.
 */
export const wpCss = `
/* WordPress resets */
body.st { margin: 0; min-height: 100vh; }
.st .wp-site-blocks { display: flex; flex-direction: column; min-height: 100vh; }
.st .wp-site-blocks > main { flex: 1 0 auto; }
.st .st-brand, .st .st-linkp, .st .st-address, .st .st-card-name, .st figure.st-tile { margin: 0; }
.st .st-brand { line-height: 1; }
.st .st-hero-copy .wp-block-buttons { display: block; }
.st .st-hero-copy .wp-block-button { display: inline-block; }
.st .st-nav ul, .st .st-foot ul { margin: 0; padding: 0; list-style: none; }
.st .st-menu > summary { list-style: none; }
.st .st-news .st-h2 { flex: 0 1 auto; }
.st .st-thanks { flex: 1 1 360px; max-width: 460px; margin: 0; font-size: 15px; line-height: 48px; color: var(--st-ink); }

/* Product collections render as the library's card grid */
.st .st-collection { margin: 0; }
.st .wc-block-product-template.st-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; margin: 0; padding: 0; list-style: none; }
.st .wc-block-product-template.st-grid > li { width: auto; max-width: none; margin: 0; padding: 0; text-align: left; }
.st .st-grid .wc-block-components-product-image { margin: 0; aspect-ratio: 4 / 5; border-radius: var(--st-radius); overflow: hidden; }
.st .st-grid .wc-block-components-product-image a { display: block; width: 100%; height: 100%; }
.st .st-grid .wc-block-components-product-image img { width: 100%; height: 100%; object-fit: cover; aspect-ratio: 4 / 5; }
.st .st-card-meta { display: flex; justify-content: space-between; gap: 12px; font-size: 15px; line-height: normal; }
.st .st-card-meta .wp-block-post-title { margin: 0; font: inherit; color: inherit; }
.st .st-card-meta .wp-block-post-title a { display: inline; color: inherit; text-decoration: none; }
.st .st-card-meta .wp-block-post-title a:hover { text-decoration: underline; text-underline-offset: 4px; }
.st .st-card-meta .st-price { margin: 0; font-size: inherit; text-align: right; color: var(--st-ink-2); }
.st .st-card-meta .st-price .amount { font-variant-numeric: tabular-nums; }

/* Store pages */
.st-shop { padding-top: 40px; padding-bottom: 72px; }
.st .st-shop-title { margin: 0 0 28px; }
.st .st-shop-bar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; margin: 0 0 28px; font-size: 14px; color: var(--st-ink-2); }
.st .st-shop-bar > * { margin: 0; }
.st .woocommerce-breadcrumb, .st .wc-block-breadcrumbs { margin: 0 0 24px; font-size: 13px; color: var(--st-ink-2); }
.st .woocommerce-breadcrumb a, .st .wc-block-breadcrumbs a { color: var(--st-ink-2); }
.st .st-product { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; align-items: start; margin: 0; }
.st .st-product > .wp-block-column { margin: 0; flex: none; }
.st .st-product .woocommerce-product-gallery { margin: 0; }
.st .st-product .woocommerce-product-gallery img { border-radius: var(--st-radius); }
.st .st-product-summary > * + * { margin-top: 20px; }
.st .st-product-summary .st-h2 { margin: 0; }
.st .st-product-summary .wc-block-components-product-price { font-size: 20px; color: var(--st-ink); }
.st .st-product-summary .wp-block-post-excerpt__excerpt { margin: 0; font-size: 16px; line-height: 26px; color: var(--st-ink-2); }
.st .st-product-summary table.variations { border: 0; margin: 0 0 16px; }
.st .st-product-summary table.variations th, .st .st-product-summary table.variations td { display: block; padding: 0; border: 0; text-align: left; }
.st .st-product-summary table.variations label { display: block; margin: 0 0 8px; font-size: 14px; font-weight: 500; }
.st .st-product-summary .reset_variations { display: inline-block; margin-top: 8px; font-size: 13px; color: var(--st-ink-2); }
.st .st-product-summary form.cart { margin: 0; }
.st .st-product-summary .woocommerce-variation-add-to-cart, .st .st-product-summary form.cart:not(.variations_form) { display: flex; gap: 8px; align-items: stretch; }
.st .st-product-summary .quantity input.qty { width: 72px; height: 48px; }
.st .st-product-summary .stock { margin: 0 0 12px; font-size: 14px; color: var(--st-ink-2); }
.st .st-product-summary .product_meta, .st .st-product-summary .wp-block-woocommerce-product-meta { font-size: 13px; color: var(--st-ink-2); }
.st .st-product-details { margin-top: 56px; }
.st .woocommerce-tabs ul.tabs, .st .wc-tabs { margin: 0 0 16px; padding: 0; list-style: none; display: flex; gap: 20px; border-bottom: 1px solid var(--st-line); }
.st .woocommerce-tabs ul.tabs li { margin: 0; padding: 0 0 10px; }
.st .woocommerce-tabs ul.tabs li a { color: var(--st-ink-2); text-decoration: none; }
.st .woocommerce-tabs ul.tabs li.active a { color: var(--st-ink); }
.st .woocommerce-Tabs-panel h2 { display: none; }
.st .woocommerce-Tabs-panel p { max-width: 62ch; font-size: 16px; line-height: 26px; color: var(--st-ink-2); }

/* Form controls and buttons on store pages */
.st select, .st input.qty, .st .woocommerce-input-wrapper input, .st .woocommerce-input-wrapper select {
  height: 48px; padding: 0 12px; border: 1px solid var(--st-field-border, var(--st-ink-2)); border-radius: var(--st-radius);
  background: var(--st-surface); color: var(--st-ink); font: 400 15px/1 var(--st-font-body);
}
.st .single_add_to_cart_button, .st .wc-block-components-button:not(.is-link), .st .wc-block-cart__submit-button, .st .wc-block-components-checkout-place-order-button {
  min-height: 48px; padding: 0 22px; border: 0; border-radius: var(--st-radius);
  background: var(--st-primary); color: var(--st-on-primary); font: 500 15px/1 var(--st-font-body); cursor: pointer;
}
.st .single_add_to_cart_button.disabled { opacity: 0.5; cursor: not-allowed; }
.st .woocommerce-message, .st .woocommerce-info, .st .wc-block-components-notice-banner { border-radius: var(--st-radius); }

@container (max-width: 720px) {
  .st .wc-block-product-template.st-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .st-shop { padding-top: 24px; padding-bottom: 48px; }
  .st .st-product { grid-template-columns: minmax(0, 1fr); gap: 28px; }
}
`;

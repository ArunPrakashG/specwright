import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AdapterContext } from "@specwright/core";
import { primaryMarket, type SiteSpec } from "@specwright/spec";
import { block, group, heading, join as joinBlocks, list } from "./blocks.ts";
import { prose } from "./sections.ts";
import { esc, href, phpJson, themeSlug } from "./util.ts";

const WC_PAGES = new Set(["shop", "cart", "checkout", "my-account"]);
const SYMBOL_FIRST = new Set(["USD", "GBP", "AUD", "CAD", "NZD", "SGD", "HKD", "JPY", "CNY", "INR", "MXN", "BRL"]);

interface Zone {
  name: string;
  countries: string[];
  cost: string;
  freeOver: string | null;
}

/** Parse "US $8, EU €9, UK £5, free over 120" into a cost per market. */
export function shippingZones(spec: SiteSpec, log: (m: string) => void): Zone[] {
  const goal = spec.goals.find((g) => g.goal === "shipping");
  const notes = goal?.notes ?? "";
  const free = notes.match(/free\s+(?:over|above|from)\s*[^\d\s]?\s*(\d+(?:\.\d+)?)/i)?.[1] ?? null;
  return spec.markets.map((m) => {
    const cost = notes.match(new RegExp(`\\b${m.id}\\b\\s*[^\\d\\s,;]?\\s*(\\d+(?:\\.\\d+)?)`, "i"))?.[1];
    if (goal && !cost) log(`Shipping: no flat rate for ${m.name} in the spec notes; using 0`);
    return { name: m.name, countries: m.countries, cost: cost ?? "0", freeOver: free };
  });
}

/** Write `${outDir}/import/commerce.php`: store settings, test payments, shipping, pages and policies. */
export async function configureCommerce(spec: SiteSpec, ctx: AdapterContext) {
  const market = primaryMarket(spec);
  const theme = themeSlug(spec);
  const pages = spec.pages
    .filter((p) => p.path !== "/")
    .flatMap((p) => {
      const segments = p.path.split("/").filter(Boolean);
      if (segments.length === 1 && WC_PAGES.has(segments[0]!)) {
        ctx.log(`Pages: ${p.path} is a WooCommerce page; the spec page "${p.id}" is not created`);
        return [];
      }
      const content = joinBlocks(
        ...p.sections.filter((s) => s.type !== "header" && s.type !== "footer").map((s) => block("pattern", { slug: `${theme}/${p.id}-${s.id}` })),
      );
      return [{ path: segments, title: p.title, content }];
    });
  const policies = spec.policies.map((p) => ({ path: ["policies", p.id], title: p.title, content: prose(esc(p.title), p.body), id: p.id }));
  const index = policies.length
    ? {
        path: ["policies"],
        title: "Policies",
        content: group(
          "st-in",
          group("st-sec st-prose", joinBlocks(heading(1, "st-h2", "Policies"), list("", spec.policies.map((p) => `<a href="${href(`/policies/${p.id}`)}">${esc(p.title)}</a>`))), {
            tag: "section",
          }),
        ),
      }
    : null;
  const zones = shippingZones(spec, ctx.log);
  const data = {
    name: spec.name,
    currency: market.currency,
    currencyPos: SYMBOL_FIRST.has(market.currency) ? "left" : "right_space",
    country: market.countries[0],
    countries: [...new Set(spec.markets.flatMap((m) => m.countries))],
    taxInclusive: market.taxDisplay === "inclusive",
    zones,
    pages: [...(index ? [index] : []), ...policies, ...pages],
    privacy: policies.find((p) => p.id === "privacy")?.path ?? null,
    terms: policies.find((p) => p.id === "terms")?.path ?? null,
  };
  const dir = join(ctx.outDir, "import");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "commerce.php"), commercePhp(data));
  const parts = [
    market.currency,
    market.taxDisplay === "inclusive" ? "prices incl. tax" : "prices excl. tax",
    "cash on delivery (test)",
    `${zones.length} shipping zone${zones.length === 1 ? "" : "s"}`,
    `${pages.length + policies.length} pages`,
  ];
  return { summary: parts.join(" · ") };
}

function commercePhp(data: unknown) {
  return `<?php
/**
 * Specwright store settings. Idempotent. Run inside WordPress with WooCommerce active.
 * The only payment method is an offline one, for test orders.
 *
 * @package specwright
 */

if ( ! defined( 'ABSPATH' ) || ! class_exists( 'WooCommerce' ) ) {
	return;
}

$specwright_store = ${phpJson(data)};

$specwright_options = array(
	'blogname'                               => $specwright_store['name'],
	'blogdescription'                        => '',
	'show_on_front'                          => 'posts',
	'woocommerce_currency'                   => $specwright_store['currency'],
	'woocommerce_currency_pos'               => $specwright_store['currencyPos'],
	'woocommerce_default_country'            => $specwright_store['country'],
	'woocommerce_allowed_countries'          => 'specific',
	'woocommerce_specific_allowed_countries' => $specwright_store['countries'],
	'woocommerce_ship_to_countries'          => '',
	'woocommerce_prices_include_tax'         => $specwright_store['taxInclusive'] ? 'yes' : 'no',
	'woocommerce_tax_display_shop'           => $specwright_store['taxInclusive'] ? 'incl' : 'excl',
	'woocommerce_tax_display_cart'           => $specwright_store['taxInclusive'] ? 'incl' : 'excl',
	'woocommerce_calc_taxes'                 => 'no',
	'woocommerce_thumbnail_cropping'         => 'uncropped',
	'woocommerce_default_catalog_orderby'    => 'menu_order',
	'woocommerce_coming_soon'                => 'no',
	'woocommerce_store_pages_only'           => 'no',
	'woocommerce_onboarding_profile'         => array(
		'skipped'   => true,
		'completed' => true,
	),
	'woocommerce_task_list_hidden'           => 'yes',
	'woocommerce_task_list_complete'         => 'yes',
	'woocommerce_extended_task_list_hidden'  => 'yes',
	'woocommerce_show_marketplace_suggestions' => 'no',
	'woocommerce_allow_tracking'             => 'no',
	'woocommerce_enable_guest_checkout'      => 'yes',
	'woocommerce_cod_settings'               => array(
		'enabled'            => 'yes',
		'title'              => 'Cash on delivery',
		'description'        => 'Test payment: nothing is charged.',
		'instructions'       => '',
		'enable_for_methods' => array(),
		'enable_for_virtual' => 'yes',
	),
	'woocommerce_bacs_settings'              => array( 'enabled' => 'no' ),
	'woocommerce_cheque_settings'            => array( 'enabled' => 'no' ),
);
foreach ( $specwright_options as $specwright_key => $specwright_value ) {
	update_option( $specwright_key, $specwright_value );
}

global $wp_rewrite;
$wp_rewrite->set_permalink_structure( '/%postname%/' );

if ( class_exists( 'WC_Install' ) && ( wc_get_page_id( 'cart' ) <= 0 || wc_get_page_id( 'checkout' ) <= 0 ) ) {
	WC_Install::create_pages();
}

/*
 * Shipping: one zone per market, a flat rate, and free shipping over a threshold.
 */
$specwright_zones = array();
foreach ( WC_Shipping_Zones::get_zones() as $specwright_z ) {
	$specwright_zones[ $specwright_z['zone_name'] ] = (int) $specwright_z['id'];
}
foreach ( $specwright_store['zones'] as $specwright_i => $specwright_zone_data ) {
	$specwright_zone = new WC_Shipping_Zone( $specwright_zones[ $specwright_zone_data['name'] ] ?? null );
	$specwright_zone->set_zone_name( $specwright_zone_data['name'] );
	$specwright_zone->set_zone_order( $specwright_i );
	$specwright_zone->clear_locations();
	foreach ( $specwright_zone_data['countries'] as $specwright_country ) {
		$specwright_zone->add_location( $specwright_country, 'country' );
	}
	$specwright_zone->save();
	foreach ( $specwright_zone->get_shipping_methods() as $specwright_method ) {
		$specwright_zone->delete_shipping_method( $specwright_method->instance_id );
	}
	$specwright_flat = $specwright_zone->add_shipping_method( 'flat_rate' );
	update_option(
		'woocommerce_flat_rate_' . $specwright_flat . '_settings',
		array(
			'title'      => 'Flat rate',
			'tax_status' => 'none',
			'cost'       => $specwright_zone_data['cost'],
		)
	);
	if ( $specwright_zone_data['freeOver'] ) {
		$specwright_free = $specwright_zone->add_shipping_method( 'free_shipping' );
		update_option(
			'woocommerce_free_shipping_' . $specwright_free . '_settings',
			array(
				'title'      => 'Free shipping',
				'requires'   => 'min_amount',
				'min_amount' => $specwright_zone_data['freeOver'],
			)
		);
	}
}

/*
 * Pages from the spec (content is the theme's section patterns) and policy pages.
 */
$specwright_ids = array();
foreach ( $specwright_store['pages'] as $specwright_page ) {
	$specwright_path   = implode( '/', $specwright_page['path'] );
	$specwright_parent = count( $specwright_page['path'] ) > 1 ? ( $specwright_ids[ implode( '/', array_slice( $specwright_page['path'], 0, -1 ) ) ] ?? 0 ) : 0;
	$specwright_found  = get_page_by_path( $specwright_path );
	$specwright_postarr = array(
		'post_type'    => 'page',
		'post_status'  => 'publish',
		'post_title'   => $specwright_page['title'],
		'post_name'    => end( $specwright_page['path'] ),
		'post_parent'  => $specwright_parent,
		'post_content' => $specwright_page['content'],
	);
	if ( $specwright_found ) {
		$specwright_postarr['ID'] = $specwright_found->ID;
	}
	$specwright_ids[ $specwright_path ] = wp_insert_post( wp_slash( $specwright_postarr ) );
}
if ( $specwright_store['privacy'] ) {
	update_option( 'wp_page_for_privacy_policy', $specwright_ids[ implode( '/', $specwright_store['privacy'] ) ] ?? 0 );
}
if ( $specwright_store['terms'] ) {
	update_option( 'woocommerce_terms_page_id', $specwright_ids[ implode( '/', $specwright_store['terms'] ) ] ?? 0 );
}

// set_permalink_structure() resets WP_Rewrite, dropping the endpoints WooCommerce added on init
// (order-received, order-pay, view-order), so register them again before writing the rules.
if ( function_exists( 'WC' ) ) {
	WC()->query->init_query_vars();
	WC()->query->add_endpoints();
}
flush_rewrite_rules( false );
echo 'Specwright store: ' . count( $specwright_store['pages'] ) . " pages\\n";
`;
}

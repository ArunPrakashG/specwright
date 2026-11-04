import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import type { AdapterContext } from "@specwright/core";
import { primaryMarket, priceIn, type Product, type SiteSpec } from "@specwright/spec";
import { phpJson, writeTree } from "./util.ts";

/** Product tiles match the reference card: 4:5, token background, artwork at 76% width. */
const TILE = { width: 800, height: 1000, art: 0.76 };

/** WordPress refuses SVG uploads, so each product image becomes a PNG tile. */
async function tilePng(spec: SiteSpec, specDir: string, img: Product["images"][number]) {
  const source = await readFile(join(specDir, img.src));
  const bg = (img.background && spec.tokens.color[img.background]) || spec.tokens.color.surface;
  const width = Math.round(TILE.width * TILE.art);
  const art = extname(img.src).toLowerCase() === ".svg" ? sharp(source, { density: 300 }) : sharp(source);
  const resized = await art.resize({ width, height: TILE.height, fit: "inside" }).png().toBuffer();
  return sharp({ create: { width: TILE.width, height: TILE.height, channels: 4, background: bg } })
    .composite([{ input: resized, gravity: "center" }])
    .flatten({ background: bg })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Write `${outDir}/import/catalog.php` and the product images it attaches. */
export async function syncCatalog(spec: SiteSpec, ctx: AdapterContext) {
  const currency = primaryMarket(spec).currency;
  const images = new Map<string, Uint8Array>();
  const products = [];
  for (const p of spec.catalog.products) {
    const files = [];
    for (const img of p.images) {
      const png = await tilePng(spec, ctx.specDir, img);
      const name = `${basename(img.src, extname(img.src))}-${createHash("sha1").update(png).digest("hex").slice(0, 8)}.png`;
      images.set(name, png);
      files.push({ file: name, alt: img.alt });
    }
    products.push({
      sku: p.sku,
      slug: p.slug,
      name: p.name,
      description: p.description,
      price: amount(priceIn(p.price, currency).amount),
      categories: p.categories,
      featured: p.featured,
      stock: p.stock ?? null,
      images: files,
      options: p.options,
      variants: p.variants.map((v) => ({
        sku: v.sku,
        options: v.options,
        price: amount(priceIn(v.price ?? p.price, currency).amount),
        stock: v.stock ?? null,
      })),
    });
  }
  const dir = join(ctx.outDir, "import");
  await writeTree(join(dir, "images"), images);
  await writeFile(join(dir, "catalog.php"), catalogPhp({ categories: spec.catalog.categories, products }));

  const n = products.length;
  const c = spec.catalog.categories.length;
  return { products: n, categories: c, summary: `${n} product${n === 1 ? "" : "s"} · ${c} categor${c === 1 ? "y" : "ies"}` };
}

const amount = (minor: number) => (minor / 100).toFixed(2);

function catalogPhp(data: unknown) {
  return `<?php
/**
 * Specwright catalog import. Idempotent: products are matched by SKU, images by file name.
 * Run inside WordPress with WooCommerce active.
 *
 * @package specwright
 */

if ( ! defined( 'ABSPATH' ) || ! class_exists( 'WooCommerce' ) ) {
	return;
}

require_once ABSPATH . 'wp-admin/includes/image.php';

$specwright_data = ${phpJson(data)};

/**
 * Attach an image from the import folder once; later runs reuse it.
 *
 * @param string $file File name in import/images.
 * @param string $alt  Alt text.
 * @return int Attachment id, or 0.
 */
function specwright_attach( $file, $alt ) {
	$found = get_posts(
		array(
			'post_type'   => 'attachment',
			'post_status' => 'any',
			'numberposts' => 1,
			'fields'      => 'ids',
			'meta_key'    => '_specwright_source', // phpcs:ignore WordPress.DB.SlowDBQuery
			'meta_value'  => $file, // phpcs:ignore WordPress.DB.SlowDBQuery
		)
	);
	if ( $found ) {
		return (int) $found[0];
	}
	$bytes = file_get_contents( __DIR__ . '/images/' . $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions
	if ( false === $bytes ) {
		return 0;
	}
	$upload = wp_upload_bits( $file, null, $bytes );
	if ( ! empty( $upload['error'] ) ) {
		return 0;
	}
	$id = wp_insert_attachment(
		array(
			'post_mime_type' => 'image/png',
			'post_title'     => $alt ? $alt : $file,
			'post_status'    => 'inherit',
		),
		$upload['file']
	);
	if ( ! $id || is_wp_error( $id ) ) {
		return 0;
	}
	wp_update_attachment_metadata( $id, wp_generate_attachment_metadata( $id, $upload['file'] ) );
	update_post_meta( $id, '_wp_attachment_image_alt', $alt );
	update_post_meta( $id, '_specwright_source', $file );
	return (int) $id;
}

$specwright_terms = array();
foreach ( $specwright_data['categories'] as $specwright_cat ) {
	$specwright_term = term_exists( $specwright_cat['slug'], 'product_cat' );
	if ( ! $specwright_term ) {
		$specwright_term = wp_insert_term( $specwright_cat['name'], 'product_cat', array( 'slug' => $specwright_cat['slug'] ) );
	} else {
		wp_update_term( (int) $specwright_term['term_id'], 'product_cat', array( 'name' => $specwright_cat['name'] ) );
	}
	if ( ! is_wp_error( $specwright_term ) ) {
		$specwright_terms[ $specwright_cat['slug'] ] = (int) $specwright_term['term_id'];
	}
}

$specwright_now = time();
foreach ( $specwright_data['products'] as $specwright_i => $specwright_p ) {
	$specwright_variable = ! empty( $specwright_p['options'] );
	$specwright_id       = wc_get_product_id_by_sku( $specwright_p['sku'] );
	$specwright_product  = $specwright_id ? wc_get_product( $specwright_id ) : null;
	if ( $specwright_product && $specwright_product->is_type( 'variable' ) !== $specwright_variable ) {
		$specwright_product->delete( true );
		$specwright_product = null;
	}
	if ( ! $specwright_product ) {
		$specwright_product = $specwright_variable ? new WC_Product_Variable() : new WC_Product_Simple();
	}

	$specwright_product->set_name( $specwright_p['name'] );
	$specwright_product->set_slug( $specwright_p['slug'] );
	$specwright_product->set_sku( $specwright_p['sku'] );
	$specwright_product->set_status( 'publish' );
	$specwright_product->set_catalog_visibility( 'visible' );
	$specwright_product->set_description( $specwright_p['description'] );
	$specwright_product->set_short_description( $specwright_p['description'] );
	$specwright_product->set_featured( (bool) $specwright_p['featured'] );
	$specwright_product->set_menu_order( $specwright_i );
	// Newest first is spec order, so date-sorted collections match the reference render.
	$specwright_product->set_date_created( $specwright_now - $specwright_i * 60 );
	$specwright_product->set_category_ids(
		array_values( array_filter( array_map( fn( $s ) => $specwright_terms[ $s ] ?? 0, $specwright_p['categories'] ) ) )
	);

	$specwright_images = array_values( array_filter( array_map( fn( $img ) => specwright_attach( $img['file'], $img['alt'] ), $specwright_p['images'] ) ) );
	$specwright_product->set_image_id( $specwright_images[0] ?? 0 );
	$specwright_product->set_gallery_image_ids( array_slice( $specwright_images, 1 ) );

	if ( $specwright_variable ) {
		$specwright_attributes = array();
		foreach ( $specwright_p['options'] as $specwright_o ) {
			$specwright_attr = new WC_Product_Attribute();
			$specwright_attr->set_name( $specwright_o['name'] );
			$specwright_attr->set_options( $specwright_o['values'] );
			$specwright_attr->set_visible( true );
			$specwright_attr->set_variation( true );
			$specwright_attributes[] = $specwright_attr;
		}
		$specwright_product->set_attributes( $specwright_attributes );
		$specwright_product->set_manage_stock( false );
	} else {
		$specwright_product->set_regular_price( $specwright_p['price'] );
		$specwright_product->set_manage_stock( null !== $specwright_p['stock'] );
		if ( null !== $specwright_p['stock'] ) {
			$specwright_product->set_stock_quantity( $specwright_p['stock'] );
		}
	}
	$specwright_parent = $specwright_product->save();

	if ( $specwright_variable ) {
		$specwright_keep = array();
		foreach ( $specwright_p['variants'] as $specwright_v ) {
			$specwright_vid       = wc_get_product_id_by_sku( $specwright_v['sku'] );
			$specwright_variation = $specwright_vid ? wc_get_product( $specwright_vid ) : null;
			if ( ! $specwright_variation || ! $specwright_variation->is_type( 'variation' ) ) {
				$specwright_variation = new WC_Product_Variation();
			}
			$specwright_variation->set_parent_id( $specwright_parent );
			$specwright_variation->set_sku( $specwright_v['sku'] );
			$specwright_options = array();
			foreach ( $specwright_v['options'] as $specwright_name => $specwright_value ) {
				$specwright_options[ sanitize_title( $specwright_name ) ] = $specwright_value;
			}
			$specwright_variation->set_attributes( $specwright_options );
			$specwright_variation->set_regular_price( $specwright_v['price'] );
			$specwright_variation->set_status( 'publish' );
			$specwright_variation->set_manage_stock( null !== $specwright_v['stock'] );
			if ( null !== $specwright_v['stock'] ) {
				$specwright_variation->set_stock_quantity( $specwright_v['stock'] );
			}
			$specwright_keep[] = $specwright_variation->save();
		}
		foreach ( wc_get_product( $specwright_parent )->get_children() as $specwright_child ) {
			if ( ! in_array( $specwright_child, $specwright_keep, true ) ) {
				wp_delete_post( $specwright_child, true );
			}
		}
		WC_Product_Variable::sync( $specwright_parent );
	}
}

wc_delete_product_transients();
echo 'Specwright catalog: ' . count( $specwright_data['products'] ) . " products\\n";
`;
}

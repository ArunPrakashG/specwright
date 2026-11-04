import { readFile, realpath } from "node:fs/promises";
import { extname, join, sep } from "node:path";
import { projectDir, type Project } from "@specwright/db";
import { renderPage } from "@specwright/sections";
import { loadSpec } from "./spec.ts";
import { overlayHead, withOverlay } from "./overlay.ts";

const page = (status: number, message: string) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><body style="font: 14px/20px system-ui; color: #474F5C; padding: 24px">${message}</body>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" },
  });

export async function previewResponse(project: Project, pageId: string, url: URL, assetBase: string, revision?: number) {
  const { spec } = await loadSpec(project, revision);
  if (!spec) return page(422, "This spec has errors, so it cannot be rendered. Fix them in the spec and try again.");
  if (!spec.pages.some((p) => p.id === pageId)) return page(404, "No such page in this spec.");
  const market = url.searchParams.get("market") ?? undefined;
  const locale = url.searchParams.get("locale") ?? undefined;
  const m = spec.markets.find((x) => x.id === market);
  const html = renderPage(spec, pageId, {
    market: m?.id,
    locale: locale && m?.locales.includes(locale) ? locale : undefined,
    asset: (src) => (/^(https?:|data:)/.test(src) ? src : `${assetBase}/${src.split("/").map(encodeURIComponent).join("/")}`),
    head: overlayHead,
  });
  return new Response(withOverlay(html), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "X-Frame-Options": "SAMEORIGIN" },
  });
}

const TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
};

/** Serve an image or font from a project folder. Anything outside the folder, hidden or not an asset type is a 404. */
export async function assetResponse(project: Project, parts: string[]) {
  const notFound = new Response("Not found", { status: 404 });
  if (!parts.length || parts.some((p) => !p || p === "." || p === ".." || p.startsWith(".") || p.includes("\0") || p.includes("/") || p.includes("\\"))) return notFound;
  const type = TYPES[extname(parts.at(-1)!).toLowerCase()];
  if (!type) return notFound;
  try {
    const root = await realpath(projectDir(project.slug));
    const file = await realpath(join(root, ...parts));
    if (!file.startsWith(root + sep)) return notFound;
    return new Response(new Uint8Array(await readFile(file)), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
      },
    });
  } catch {
    return notFound;
  }
}

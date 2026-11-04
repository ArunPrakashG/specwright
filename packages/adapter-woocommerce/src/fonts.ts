import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fontsHref } from "@specwright/sections";
import type { SiteSpec } from "@specwright/spec";
import { cacheDir, patientNetwork } from "./util.ts";

/** A modern browser UA, so Google Fonts answers with woff2. */
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export interface FontFace {
  fontFamily: string;
  fontStyle: string;
  fontWeight: string;
  unicodeRange?: string;
  /** Path inside the theme, e.g. `assets/fonts/geist-1a2b3c4d.woff2`. */
  file: string;
}

export interface BundledFonts {
  faces: FontFace[];
  /** Theme path → woff2 bytes. */
  files: Map<string, Uint8Array>;
}

/**
 * Download the spec's Google Fonts once (cached on disk) so the theme serves them itself:
 * EU visitors then never send a request to Google. Offline, the theme falls back to the
 * system stack and the caller logs a warning.
 */
export async function bundleFonts(spec: SiteSpec, log: (m: string) => void, signal?: AbortSignal): Promise<BundledFonts> {
  patientNetwork();
  const dir = cacheDir("fonts");
  await mkdir(dir, { recursive: true });
  const url = fontsHref(spec);
  const key = createHash("sha1").update(url).digest("hex").slice(0, 12);
  const cssPath = join(dir, `${key}.css`);
  let css: string;
  try {
    css = await readFile(cssPath, "utf8");
  } catch {
    try {
      css = await fetchText(url, signal);
      await writeFile(cssPath, css);
    } catch (error) {
      log(`Fonts: could not reach Google Fonts (${(error as Error).message}); the theme uses the system font stack`);
      return { faces: [], files: new Map() };
    }
  }

  const faces: FontFace[] = [];
  const files = new Map<string, Uint8Array>();
  for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const prop = (name: string) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
    const src = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    const family = prop("font-family")?.replace(/^['"]|['"]$/g, "");
    if (!src || !family) continue;
    const file = `assets/fonts/${slugify(family)}-${createHash("sha1").update(src).digest("hex").slice(0, 8)}.woff2`;
    if (!files.has(file)) {
      const cached = join(dir, file.split("/").pop()!);
      let bytes: Uint8Array;
      try {
        bytes = await readFile(cached);
      } catch {
        try {
          bytes = await fetchBytes(src, signal);
        } catch (error) {
          log(`Fonts: could not download ${family} (${(error as Error).message}); the theme uses the system font stack`);
          return { faces: [], files: new Map() };
        }
        await writeFile(cached, bytes);
      }
      files.set(file, bytes);
    }
    faces.push({
      fontFamily: family,
      fontStyle: prop("font-style") ?? "normal",
      fontWeight: prop("font-weight") ?? "400",
      unicodeRange: prop("unicode-range"),
      file,
    });
  }
  return { faces, files };
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function fetchText(url: string, signal?: AbortSignal) {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: timeout(signal) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchBytes(url: string, signal?: AbortSignal) {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: timeout(signal) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function timeout(signal?: AbortSignal) {
  const t = AbortSignal.timeout(20_000);
  return signal ? AbortSignal.any([signal, t]) : t;
}

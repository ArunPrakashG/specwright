/**
 * Runs the a11y and visual groups against the sample spec's own reference render, served
 * locally, then applies the reported fix to a copy of the spec and runs a11y again.
 *   npx tsx packages/checks/scripts/static.ts
 */
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { validateSpec } from "@specwright/spec";
import { renderPage } from "@specwright/sections";
import { sectionTypes } from "@specwright/sections";
import { getPath, setPath, type CheckGroup, type Fix, type Preview } from "@specwright/core";
import { runA11y, runVisual, type Run } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const sample = resolve(here, "../../spec/examples/hale-and-field");
const work = await mkdtemp(join(tmpdir(), "sw-static-"));
const specDir = join(work, "spec");
await cp(sample, specDir, { recursive: true });
const outDir = join(work, "out");

const patchButtons = { on: false };

function serve(dir: string, getSpec: () => ReturnType<typeof load>) {
  const mime: Record<string, string> = { ".svg": "image/svg+xml" };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const spec = getSpec();
    const asset = (src: string) => `/assets/${src}`;
    const page = (id: string) => renderPage(spec, id, { asset, productUrl: (p) => `/product/${p.slug}/` });
    if (url.pathname.startsWith("/assets/")) {
      const data = await readFile(join(dir, url.pathname.slice(8))).catch(() => null);
      res.writeHead(data ? 200 : 404, { "content-type": mime[extname(url.pathname)] ?? "application/octet-stream" }).end(data);
      return;
    }
    const map: Record<string, string> = { "/": "home", "/shop": "journal", "/cart": "about" };
    const id = map[url.pathname] ?? (url.pathname.startsWith("/product/") ? "about" : null);
    if (!id) return void res.writeHead(404).end("not found");
    // `.st a { color: inherit }` outranks `.st-btn`, so buttons render ink on primary (a sections bug).
    // `patchButtons` stands in for that being fixed upstream, to show the rest of the page passing.
    const html = patchButtons.on ? page(id).replace("</style>", ".st a.st-btn{color:var(--st-on-primary)}\n</style>") : page(id);
    res.writeHead(200, { "content-type": "text/html" }).end(html);
  });
  return new Promise<{ url: string; close(): void }>((ok) => server.listen(0, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${(server.address() as any).port}/`, close: () => server.close() })));
}

function load() {
  const result = validateSpec(JSON.parse(readFileSync(join(specDir, "spec.json"), "utf8")), sectionTypes);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.spec;
}
import { readFileSync } from "node:fs";

let spec = load();
const server = await serve(specDir, () => spec);
const preview: Preview = {
  url: server.url,
  paths: { shop: "/shop", cart: "/cart", checkout: "/checkout", product: (slug) => `/product/${slug}/` },
  stop: async () => {},
};
const browser = await chromium.launch();
const mkRun = (): Run => ({ input: { spec, specDir, outDir, preview, log: (m) => console.log("  ·", m) }, browser, dir: join(outDir, "checks") });

function show(g: CheckGroup) {
  console.log(`${g.label}: ${g.status} · ${g.summary} · ${g.passed}/${g.total}`);
  for (const f of g.findings) console.log("  -", JSON.stringify(f));
}

try {
  console.log("--- first run");
  const a11y = await runA11y(mkRun());
  show(a11y);
  show(await runVisual(mkRun()));

  const fix: Fix | undefined = a11y.findings.find((f) => f.fix)?.fix;
  if (!fix) throw new Error("No fix reported");
  const raw = JSON.parse(await readFile(join(specDir, "spec.json"), "utf8"));
  if (getPath(raw, fix.path) !== fix.from) throw new Error("fix.from does not match the spec");
  setPath(raw, fix.path, fix.to);
  await writeFile(join(specDir, "spec.json"), JSON.stringify(raw, null, 2));
  spec = load();
  console.log(`--- applied fix ${fix.label}`);
  show(await runA11y(mkRun()));
  console.log("--- with the button colour rule corrected in the stylesheet");
  patchButtons.on = true;
  show(await runA11y(mkRun()));
} finally {
  await browser.close();
  server.close();
  console.log("output:", outDir);
}

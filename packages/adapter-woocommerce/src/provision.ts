import { spawn, execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { AdapterContext, Preview } from "@specwright/core";
import type { SiteSpec } from "@specwright/spec";
import { NODE_NETWORK_FLAG, patientNetwork, themeSlug } from "./util.ts";

const run = promisify(execFile);
const require = createRequire(import.meta.url);

/** Playground keeps its WordPress downloads here; WooCommerce is cached next to them. */
const PLAYGROUND_CACHE = join(homedir(), ".wordpress-playground");
const WC_CACHE = join(PLAYGROUND_CACHE, "specwright");
const PHP_VERSION = "8.3";

export interface ProvisionOptions {
  /** Request-handling PHP workers. Each one is a PHP.wasm instance, so keep it small. */
  workers?: number;
  /** Max time to wait for the store to answer, in ms. Cold starts download WordPress. */
  timeout?: number;
}

/** Start a disposable WordPress Playground with WooCommerce, the emitted theme and the import scripts. */
export async function provision(spec: SiteSpec, ctx: AdapterContext & { port?: number }, o: ProvisionOptions = {}): Promise<Preview> {
  const started = Date.now();
  const plugin = await ensureWooCommerce(ctx.log, ctx.signal);
  const port = await freePort(ctx.port ?? 9400);
  const url = `http://127.0.0.1:${port}`;
  const work = join(ctx.outDir, "playground");
  await mkdir(work, { recursive: true });
  const blueprint = join(work, "blueprint.json");
  await writeFile(blueprint, JSON.stringify(blueprintFor(spec), null, 2) + "\n");

  const cli = join(dirname(require.resolve("@wp-playground/cli/package.json")), "wp-playground.js");
  const args = [
    NODE_NETWORK_FLAG,
    cli,
    "server",
    `--port=${port}`,
    `--php=${PHP_VERSION}`,
    "--wp=latest",
    `--workers=${o.workers ?? 2}`,
    `--blueprint=${blueprint}`,
    `--mount=${plugin}:/wordpress/wp-content/plugins/woocommerce`,
    `--mount=${join(ctx.outDir, "theme")}:/wordpress/wp-content/themes/${themeSlug(spec)}`,
    `--mount=${join(ctx.outDir, "import")}:/specwright/import`,
  ];
  ctx.log(`Playground: starting on ${url}`);
  const logFile = createWriteStream(join(work, "server.log"));
  const child = spawn(process.execPath, args, { cwd: work, stdio: ["ignore", "pipe", "pipe"] });
  const tail: string[] = [];
  const onOutput = (chunk: Buffer) => {
    logFile.write(chunk);
    for (const line of chunk.toString().split(/[\r\n]+/)) {
      const l = line.trim();
      if (!l) continue;
      tail.push(l);
      if (tail.length > 40) tail.shift();
      if (!/\d+%|^\[?=+/.test(l)) ctx.log(`Playground: ${l}`);
    }
  };
  child.stdout.on("data", onOutput);
  child.stderr.on("data", onOutput);
  let exited: number | null = null;
  const exit = new Promise<void>((resolve) => child.once("exit", (code) => ((exited = code ?? -1), resolve())));
  const killOnExit = () => child.kill("SIGKILL");
  process.once("exit", killOnExit);

  let stopping: Promise<void> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      process.off("exit", killOnExit);
      if (exited === null) {
        child.kill("SIGTERM");
        const timer = setTimeout(() => child.kill("SIGKILL"), 8000);
        await exit;
        clearTimeout(timer);
      }
      logFile.end();
    })());
  const onAbort = () => void stop();
  ctx.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    await waitForStore(url, () => exited, o.timeout ?? 15 * 60_000, ctx.signal);
  } catch (error) {
    await stop();
    ctx.signal?.removeEventListener("abort", onAbort);
    throw new Error(`${(error as Error).message}\n${tail.slice(-15).join("\n")}`);
  }
  ctx.log(`Playground: store ready at ${url} in ${Math.round((Date.now() - started) / 1000)}s`);

  return {
    url,
    paths: { shop: "/shop/", cart: "/cart/", checkout: "/checkout/", product: (slug) => `/product/${slug}/` },
    async stop() {
      ctx.signal?.removeEventListener("abort", onAbort);
      await stop();
    },
  };
}

function blueprintFor(spec: SiteSpec) {
  const php = (file: string) => `<?php require_once '/wordpress/wp-load.php'; require '/specwright/import/${file}';`;
  return {
    $schema: "https://playground.wordpress.net/blueprint-schema.json",
    preferredVersions: { php: PHP_VERSION, wp: "latest" },
    steps: [
      { step: "defineWpConfigConsts", consts: { WP_DEVELOPMENT_MODE: "theme", WP_ENVIRONMENT_TYPE: "development" } },
      { step: "activatePlugin", pluginPath: "woocommerce/woocommerce.php" },
      { step: "activateTheme", themeFolderName: themeSlug(spec) },
      { step: "runPHP", code: php("commerce.php") },
      { step: "runPHP", code: php("catalog.php") },
    ],
  };
}

async function waitForStore(url: string, exited: () => number | null, timeout: number, signal?: AbortSignal) {
  const deadline = Date.now() + timeout;
  let last = "no answer";
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("Provision cancelled");
    const code = exited();
    if (code !== null) throw new Error(`Playground exited with code ${code} before the store was ready`);
    try {
      const res = await fetch(`${url}/`, { signal: AbortSignal.timeout(60_000), redirect: "manual" });
      const body = await res.text();
      // The blueprint may still be running while the server answers; wait for the theme's markup.
      if (res.status === 200 && body.includes("data-spec-id")) return;
      last = `HTTP ${res.status}: ${body.replace(/\s+/g, " ").slice(0, 300)}`;
    } catch (error) {
      last = (error as Error).message;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`The store did not serve the theme within ${Math.round(timeout / 1000)}s (last: ${last})`);
}

export async function freePort(from: number) {
  for (let port = from; port < from + 100; port++) {
    const ok = await new Promise<boolean>((resolve) => {
      const srv = createServer();
      srv.once("error", () => resolve(false));
      srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
    });
    if (ok) return port;
  }
  throw new Error(`No free port between ${from} and ${from + 99}`);
}

/**
 * WooCommerce from wordpress.org, downloaded once and kept unzipped next to Playground's
 * WordPress cache. The plugin is mounted, not copied, so a boot does not unzip 60 MB into memory.
 */
export async function ensureWooCommerce(log: (m: string) => void, signal?: AbortSignal) {
  patientNetwork();
  await mkdir(WC_CACHE, { recursive: true });
  let version: string | undefined;
  try {
    const res = await fetch("https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request%5Bslug%5D=woocommerce&request%5Bfields%5D%5Bsections%5D=0", {
      signal: AbortSignal.timeout(8000),
    });
    version = ((await res.json()) as { version?: string }).version;
  } catch {}
  if (!version) {
    const cached = (await readdir(WC_CACHE)).filter((d) => /^woocommerce-[\d.]+$/.test(d)).sort(compareVersions);
    if (!cached.length) throw new Error("WooCommerce is not cached and wordpress.org is unreachable");
    version = cached.at(-1)!.slice("woocommerce-".length);
    log(`WooCommerce: offline, using cached ${version}`);
  }
  const dir = join(WC_CACHE, `woocommerce-${version}`);
  const plugin = join(dir, "woocommerce");
  if (await exists(join(plugin, "woocommerce.php"))) return plugin;

  log(`WooCommerce: downloading ${version} from wordpress.org`);
  const zip = join(WC_CACHE, `woocommerce-${version}.zip`);
  if (!(await exists(zip))) {
    const res = await fetch(`https://downloads.wordpress.org/plugin/woocommerce.${version}.zip`, { signal });
    if (!res.ok) throw new Error(`WooCommerce download failed: HTTP ${res.status}`);
    await writeFile(`${zip}.partial`, new Uint8Array(await res.arrayBuffer()));
    await rename(`${zip}.partial`, zip);
  }
  const tmp = `${dir}.partial`;
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  try {
    await run("unzip", ["-q", zip, "-d", tmp]);
  } catch {
    await run("bsdtar", ["-xf", zip, "-C", tmp]);
  }
  await rm(dir, { recursive: true, force: true });
  await rename(tmp, dir);
  return plugin;
}

function compareVersions(a: string, b: string) {
  const pa = a.replace(/^\D+/, "").split(".").map(Number);
  const pb = b.replace(/^\D+/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

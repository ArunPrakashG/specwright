import { parseArgs } from "node:util";
import { cp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { specJsonSchema, validateSpec, type SiteSpec } from "@specwright/spec";
import { renderPage, sectionTypes } from "@specwright/sections";
import { runBuild, type BuildEvent, type CheckGroup, type StoreAdapter } from "@specwright/core";

const VERSION = "0.1.0";
// Loaded on demand so commands that never touch a store stay fast.
const adapters: Record<string, () => Promise<StoreAdapter>> = {
  woocommerce: async () => (await import("@specwright/adapter-woocommerce")).woocommerce,
};
const examples = resolve(dirname(fileURLToPath(import.meta.url)), "../../spec/examples");

const HELP = `specwright ${VERSION}
Turn a client brief into a store they own, on any platform, verified before it ships.

Usage: specwright <command> [dir] [options]

Commands
  init [dir]             Start a project from the sample store (--example) or a brief (--brief)
  draft <brief.md|->     Draft a spec from a brief with your own Anthropic key
  validate [dir]         Check spec.json
  plan [dir]             Show how a platform meets each part of the spec
  render [dir]           Write the reference render of a page to HTML
  build [dir]            Emit, preview and check a store; auto-fix what the spec can fix
  preview [dir]          Build, then keep the preview store running
  schema                 Print the Site Spec JSON Schema
  worker                 Run dashboard builds from the queue

Options
  --target <platform>    woocommerce (default). Shopify is planned.
  --page <id>            Page to render (default: home page)
  --market <id>          Market for prices and copy (default: primary)
  --out <path>           Output file or directory
  --example <name>       Sample to start from (default: hale-and-field)
  --brief <file>         Brief to draft from (init)
  --no-fix               Report failures without changing the spec
  --port <n>             Preview port
  --json                 Machine-readable output
  -h, --help             Show this help
`;

type Flags = {
  target: string;
  page?: string;
  market?: string;
  out?: string;
  example: string;
  brief?: string;
  "no-fix": boolean;
  port?: string;
  json: boolean;
  help: boolean;
};

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      target: { type: "string", default: "woocommerce" },
      page: { type: "string" },
      market: { type: "string" },
      out: { type: "string" },
      example: { type: "string", default: "hale-and-field" },
      brief: { type: "string" },
      "no-fix": { type: "boolean", default: false },
      port: { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });
  const flags = values as unknown as Flags & { version: boolean };
  const [command, arg] = positionals;
  if (flags.version) return print(VERSION), 0;
  if (!command || flags.help) return print(HELP), command ? 0 : 2;

  switch (command) {
    case "init":
      return init(arg ?? "store", flags);
    case "draft":
      return draft(arg, flags);
    case "validate":
      return validate(arg ?? ".", flags);
    case "plan":
      return plan(arg ?? ".", flags);
    case "render":
      return render(arg ?? ".", flags);
    case "build":
      return build(arg ?? ".", flags, false);
    case "preview":
      return build(arg ?? ".", flags, true);
    case "schema":
      return print(JSON.stringify(specJsonSchema(), null, 2)), 0;
    case "worker": {
      const { runWorker } = await import("./worker.ts");
      await runWorker();
      return 0;
    }
    default:
      return fail(`Unknown command "${command}". Run specwright --help.`, 2);
  }
}

function print(text: string) {
  process.stdout.write(text.endsWith("\n") ? text : text + "\n");
}

function fail(message: string, code = 1) {
  process.stderr.write(`specwright: ${message}\n`);
  return code;
}

async function exists(path: string) {
  return access(path).then(() => true, () => false);
}

async function load(dir: string) {
  const file = join(resolve(dir), "spec.json");
  if (!(await exists(file))) throw new UsageError(`No spec.json in ${resolve(dir)}. Run specwright init first.`);
  return validateSpec(JSON.parse(await readFile(file, "utf8")), sectionTypes);
}

async function loadValid(dir: string): Promise<SiteSpec> {
  const result = await load(dir);
  if (!result.ok) throw new UsageError(`spec.json is invalid:\n${result.issues.map((i) => `  ${i.path}: ${i.message}`).join("\n")}`);
  return result.spec;
}

async function adapter(target: string) {
  const a = adapters[target];
  if (!a) throw new UsageError(target === "shopify" ? "The Shopify adapter is planned but not built yet." : `Unknown target "${target}". Available: ${Object.keys(adapters).join(", ")}.`);
  return a();
}

class UsageError extends Error {}

async function init(dir: string, flags: Flags) {
  const target = resolve(dir);
  if (await exists(join(target, "spec.json"))) return fail(`${target} already has a spec.json.`);
  if (flags.brief) {
    const code = await draft(flags.brief, { ...flags, out: target });
    if (code) return code;
  } else {
    const source = join(examples, flags.example);
    if (!(await exists(join(source, "spec.json")))) return fail(`No example called "${flags.example}".`);
    await mkdir(target, { recursive: true });
    await cp(source, target, { recursive: true });
  }
  print(`Created ${join(target, "spec.json")}\n\nNext:\n  specwright validate ${dir}\n  specwright build ${dir}`);
  return 0;
}

async function draft(briefPath: string | undefined, flags: Flags) {
  if (!briefPath) return fail("draft needs a brief file, or - to read stdin.", 2);
  const brief = briefPath === "-" ? await readStdin() : await readFile(briefPath, "utf8");
  if (brief.trim().length < 20) return fail("The brief is too short to draft from.", 2);
  const { draftSpec } = await import("@specwright/ai");
  let result;
  try {
    result = await draftSpec(brief, { onProgress: (m) => process.stderr.write(`${m}…\n`) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(/api.?key|auth/i.test(message) ? `${message}\nSet ANTHROPIC_API_KEY (or run \`ant auth login\`) to draft with your own key.` : message);
  }
  const out = resolve(flags.out ?? result.spec.id);
  await mkdir(join(out, "images"), { recursive: true });
  for (const [path, svg] of Object.entries(result.assets)) await writeFile(join(out, path), svg + "\n");
  await writeFile(join(out, "spec.json"), JSON.stringify(result.spec, null, 2) + "\n");
  if (flags.json) print(JSON.stringify({ dir: out, attempts: result.attempts, assets: Object.keys(result.assets) }));
  else print(`Drafted ${result.spec.name} in ${out} (${result.spec.pages.length} pages, ${result.spec.catalog.products.length} products, ${Object.keys(result.assets).length} illustrations).`);
  return 0;
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function validate(dir: string, flags: Flags) {
  const result = await load(dir);
  if (flags.json) return print(JSON.stringify({ ok: result.ok, issues: result.issues })), result.ok ? 0 : 1;
  for (const i of result.issues) print(`${i.severity === "error" ? "error  " : "warning"}  ${i.path || "(root)"}  ${i.message}`);
  if (!result.ok) return fail(`spec.json has ${result.issues.filter((i) => i.severity === "error").length} errors.`);
  const s = result.spec;
  print(`valid  ${s.name} · spec v${s.revision} · ${s.pages.length} pages · ${s.catalog.products.length} products · ${s.markets.length} markets`);
  return 0;
}

async function plan(dir: string, flags: Flags) {
  const items = (await adapter(flags.target)).plan(await loadValid(dir));
  if (flags.json) return print(JSON.stringify(items, null, 2)), 0;
  const w = Math.max(...items.map((i) => i.subject.length));
  let area = "";
  for (const i of items) {
    if (i.area !== area) print(`\n${(area = i.area)}`);
    print(`  ${i.subject.padEnd(w)}  ${i.status.padEnd(11)}  ${i.detail}`);
  }
  return 0;
}

const MIME: Record<string, string> = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

async function render(dir: string, flags: Flags) {
  const spec = await loadValid(dir);
  const page = flags.page ?? spec.pages.find((p) => p.path === "/")!.id;
  if (!spec.pages.some((p) => p.id === page)) return fail(`No page "${page}". Pages: ${spec.pages.map((p) => p.id).join(", ")}.`, 2);
  const assets = new Map<string, string>();
  for (const src of collectSrcs(spec)) {
    const file = resolve(dir, src);
    if (!file.startsWith(resolve(dir) + "/") || !(await exists(file))) continue;
    assets.set(src, `data:${MIME[extname(file)] ?? "application/octet-stream"};base64,${(await readFile(file)).toString("base64")}`);
  }
  const html = renderPage(spec, page, { market: flags.market, asset: (src) => assets.get(src) ?? src });
  const out = resolve(flags.out ?? join(dir, ".specwright", "render", `${page}.html`));
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html);
  print(out);
  return 0;
}

function collectSrcs(spec: SiteSpec) {
  const out = new Set<string>();
  JSON.stringify(spec, (k, v) => (k === "src" && typeof v === "string" && out.add(v), v));
  return out;
}

const MARK: Record<string, string> = { pass: "pass", fail: "FAIL", skip: "skip", running: "…", waiting: "wait", warn: "warn" };

async function build(dir: string, flags: Flags, keep: boolean) {
  const specDir = resolve(dir);
  await loadValid(specDir);
  const outDir = resolve(flags.out ?? join(specDir, ".specwright", "build"));
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);

  const events: BuildEvent[] = [];
  const onEvent = (e: BuildEvent) => {
    events.push(e);
    if (flags.json) return;
    if (e.type === "step" && e.step.status !== "running" && e.step.status !== "waiting") {
      print(`${MARK[e.step.status]!.padEnd(4)}  ${e.step.label.padEnd(16)}  ${e.step.detail ?? ""}`);
      if ((e.step.id === "checks" || e.step.id === "recheck") && e.step.status !== "skip") printChecks(lastChecks(events));
    } else if (e.type === "fix") print(`      fix   ${e.fix.label}  (${e.fix.path}) → spec v${e.revision}`);
    else if (e.type === "log" && process.env.SPECWRIGHT_DEBUG) process.stderr.write(e.message + "\n");
  };

  const result = await runBuild({
    specDir,
    outDir,
    adapter: await adapter(flags.target),
    checks: (await import("@specwright/checks")).runChecks,
    keepPreview: keep,
    maxFixAttempts: flags["no-fix"] ? 0 : 3,
    writeFixes: !flags["no-fix"],
    onEvent,
    signal: controller.signal,
  });
  process.off("SIGINT", stop);

  if (flags.json) print(JSON.stringify({ status: result.status, steps: result.steps, checks: result.checks, fixes: result.fixes, outDir }, null, 2));
  else print(`\n${result.status === "pass" ? "Build passed" : result.status === "cancelled" ? "Build cancelled" : "Build failed"} · output in ${outDir}`);

  if (keep && result.preview) {
    print(`Preview running at ${result.preview.url} · Ctrl-C to stop`);
    await new Promise<void>((done) => process.once("SIGINT", () => done()));
    await result.preview.stop();
  }
  return result.status === "pass" ? 0 : 1;
}

function lastChecks(events: BuildEvent[]): CheckGroup[] {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.type === "checks") return e.groups;
  }
  return [];
}

function printChecks(groups: CheckGroup[]) {
  for (const g of groups) {
    print(`        ${MARK[g.status]!.padEnd(4)}  ${g.label.padEnd(20)}  ${g.summary}`);
    for (const f of g.findings.filter((f) => f.severity === "error").slice(0, 5)) {
      print(`              ${f.specId ?? "-"}  ${f.message}${f.fix ? `  · fix: ${f.fix.label}` : ""}`);
    }
  }
}

export async function run() {
  try {
    process.exitCode = await main();
  } catch (error) {
    process.exitCode = error instanceof UsageError ? fail(error.message, 2) : fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
  }
}

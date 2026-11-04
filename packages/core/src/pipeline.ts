import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { validateSpec, type SiteSpec } from "@specwright/spec";
import { sectionTypes } from "@specwright/sections";
import type { BuildEvent, CheckGroup, ChecksRunner, Fix, Preview, Step, StepId, StoreAdapter } from "./types.ts";

export interface BuildOptions {
  /** Directory holding spec.json. Fixes are written back to it. */
  specDir: string;
  outDir: string;
  adapter: StoreAdapter;
  checks: ChecksRunner;
  maxFixAttempts?: number;
  /** Leave the preview running after the build (the CLI's `preview` command). */
  keepPreview?: boolean;
  /** Apply auto-fixes to spec.json on disk. Off for dry runs. */
  writeFixes?: boolean;
  onEvent?(event: BuildEvent): void;
  signal?: AbortSignal;
}

export interface BuildResult {
  status: "pass" | "fail" | "cancelled";
  steps: Step[];
  checks: CheckGroup[];
  fixes: Fix[];
  spec?: SiteSpec;
  preview?: Preview;
}

const LABELS: Record<StepId, string> = {
  validate: "Spec validated",
  theme: "Theme generated",
  catalog: "Catalog synced",
  preview: "Preview started",
  checks: "Checks",
  autofix: "Auto-fix",
  recheck: "Re-run checks",
};

export const STEP_ORDER: StepId[] = ["validate", "theme", "catalog", "preview", "checks", "autofix", "recheck"];

export function initialSteps(): Step[] {
  return STEP_ORDER.map((id) => ({ id, label: LABELS[id], status: "waiting" }));
}

export async function loadSpecFile(specDir: string) {
  const raw = JSON.parse(await readFile(join(specDir, "spec.json"), "utf8"));
  return { raw, result: validateSpec(raw, sectionTypes) };
}

export function summarize(groups: CheckGroup[]) {
  const passed = groups.reduce((n, g) => n + g.passed, 0);
  const total = groups.reduce((n, g) => n + g.total, 0);
  return { passed, total, failing: groups.filter((g) => g.status === "fail") };
}

/** Set a dotted path (`pages.0.sections.3.settings.linkColor`) in a JSON value. */
export function setPath(target: any, path: string, value: unknown) {
  const keys = path.split(".");
  let node = target;
  for (const k of keys.slice(0, -1)) node = node[k];
  node[keys.at(-1)!] = value;
}

export function getPath(target: any, path: string): unknown {
  return path.split(".").reduce((n, k) => (n == null ? n : n[k]), target);
}

/**
 * The build: validate, emit, sync, preview, check, then fix what can be fixed from the
 * spec and check again, up to `maxFixAttempts` times. The CLI and the dashboard worker
 * both run exactly this.
 */
export async function runBuild(o: BuildOptions): Promise<BuildResult> {
  const steps = initialSteps();
  const fixes: Fix[] = [];
  const emit = (e: BuildEvent) => o.onEvent?.(e);
  const log = (message: string) => emit({ type: "log", message });
  const ctx = { specDir: o.specDir, outDir: o.outDir, log, signal: o.signal };
  let preview: Preview | undefined;
  let checks: CheckGroup[] = [];

  const set = (id: StepId, patch: Partial<Step>) => {
    const step = steps.find((s) => s.id === id)!;
    Object.assign(step, patch);
    if (patch.status === "running") step.startedAt = new Date().toISOString();
    if (patch.status && patch.status !== "running" && patch.status !== "waiting") step.endedAt = new Date().toISOString();
    emit({ type: "step", step: { ...step } });
  };
  const cancelled = () => o.signal?.aborted ?? false;
  const finish = async (status: BuildResult["status"], spec?: SiteSpec): Promise<BuildResult> => {
    for (const s of steps) if (s.status === "waiting" || s.status === "running") set(s.id, { status: "skip" });
    if (preview && (!o.keepPreview || status === "cancelled")) {
      await preview.stop().catch(() => {});
      preview = undefined;
    }
    return { status, steps, checks, fixes, spec, preview };
  };

  await mkdir(o.outDir, { recursive: true });

  set("validate", { status: "running" });
  let { raw, result } = await loadSpecFile(o.specDir);
  if (!result.ok) {
    set("validate", { status: "fail", detail: result.issues.filter((i) => i.severity === "error").map((i) => `${i.path}: ${i.message}`).join("; ") });
    return finish("fail");
  }
  let spec = result.spec;
  const warnings = result.issues.length;
  set("validate", { status: "pass", detail: `spec v${spec.revision}${warnings ? ` · ${warnings} warning${warnings > 1 ? "s" : ""}` : ""}` });
  if (cancelled()) return finish("cancelled", spec);

  try {
    set("theme", { status: "running" });
    const emitted = await o.adapter.emitTheme(spec, ctx);
    set("theme", { status: "pass", detail: emitted.summary });
    if (cancelled()) return finish("cancelled", spec);

    set("catalog", { status: "running" });
    const synced = await o.adapter.syncCatalog(spec, ctx);
    const commerce = await o.adapter.configureCommerce(spec, ctx);
    set("catalog", { status: "pass", detail: `${synced.summary} · ${commerce.summary}` });
    if (cancelled()) return finish("cancelled", spec);

    set("preview", { status: "running" });
    preview = await o.adapter.provision(spec, ctx);
    set("preview", { status: "pass", detail: `${o.adapter.label} preview at ${preview.url}` });
    if (cancelled()) return finish("cancelled", spec);

    const runAll = async () => {
      const [platform, store] = await Promise.all([o.adapter.validate(spec, ctx), o.checks({ spec, specDir: o.specDir, outDir: o.outDir, preview: preview!, log })]);
      return order([...store, ...platform]);
    };

    set("checks", { status: "running" });
    checks = await runAll();
    emit({ type: "checks", groups: checks });
    let sum = summarize(checks);
    set("checks", { status: sum.failing.length ? "fail" : "pass", detail: `${sum.passed} of ${sum.total} passed` });
    if (!sum.failing.length) {
      set("autofix", { status: "skip", detail: "Nothing to fix" });
      set("recheck", { status: "skip" });
      return finish("pass", spec);
    }

    const max = o.maxFixAttempts ?? 3;
    for (let attempt = 1; attempt <= max; attempt++) {
      if (cancelled()) return finish("cancelled", spec);
      const pending = sum.failing.flatMap((g) => g.findings).filter((f) => f.fix && getPath(raw, f.fix.path) === f.fix.from);
      if (!pending.length) {
        set("autofix", { status: "fail", detail: attempt === 1 ? "No automatic fix for the failing checks" : `Attempt ${attempt - 1} of ${max} left failures that need a person` });
        set("recheck", { status: "skip" });
        return finish("fail", spec);
      }
      set("autofix", { status: "running", detail: `Attempt ${attempt} of ${max}: ${pending.map((f) => f.fix!.label).join(", ")}` });
      for (const f of pending) {
        setPath(raw, f.fix!.path, f.fix!.to);
        fixes.push(f.fix!);
      }
      raw.revision = (raw.revision ?? 1) + 1;
      const next = validateSpec(raw, sectionTypes);
      if (!next.ok) {
        set("autofix", { status: "fail", detail: "The fix produced an invalid spec" });
        return finish("fail", spec);
      }
      spec = next.spec;
      if (o.writeFixes !== false) await writeFile(join(o.specDir, "spec.json"), JSON.stringify(raw, null, 2) + "\n");
      for (const f of pending) emit({ type: "fix", fix: f.fix!, revision: spec.revision });
      await o.adapter.emitTheme(spec, ctx);
      set("autofix", { status: "pass", detail: `Attempt ${attempt} of ${max}: ${pending.map((f) => f.fix!.label).join(", ")} · spec v${spec.revision}` });

      set("recheck", { status: "running" });
      checks = await runAll();
      emit({ type: "checks", groups: checks });
      sum = summarize(checks);
      set("recheck", { status: sum.failing.length ? "fail" : "pass", detail: `${sum.passed} of ${sum.total} passed` });
      if (!sum.failing.length) return finish("pass", spec);
    }
    return finish("fail", spec);
  } catch (error) {
    const running = steps.find((s) => s.status === "running");
    if (running) set(running.id, { status: "fail", detail: error instanceof Error ? error.message : String(error) });
    log(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return finish(cancelled() ? "cancelled" : "fail", spec);
  }
}

const GROUP_ORDER: CheckGroup["id"][] = ["journey", "a11y", "performance", "markup", "standards", "visual"];
function order(groups: CheckGroup[]) {
  return [...groups].sort((a, b) => GROUP_ORDER.indexOf(a.id) - GROUP_ORDER.indexOf(b.id));
}

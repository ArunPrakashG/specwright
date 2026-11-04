import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runBuild, type BuildEvent, type CheckGroup, type Fix, type Step } from "@specwright/core";
import { woocommerce } from "@specwright/adapter-woocommerce";
import { runChecks } from "@specwright/checks";
import {
  BUILD_QUEUE,
  buildDir,
  getBuildById,
  isCancelRequested,
  listReviewVersions,
  migrate,
  projectDir,
  queue,
  setStage,
  snapshot,
  sql,
  updateBuild,
} from "@specwright/db";

const adapters = { woocommerce };

/** Run one queued build: the same pipeline as `specwright build`, written to the database as it goes. */
export async function processBuild(buildId: string) {
  const build = await getBuildById(buildId);
  if (!build || build.status !== "queued") return;
  const adapter = adapters[build.target as keyof typeof adapters];
  if (!adapter) {
    await updateBuild(build.id, { status: "fail", finished: true, appendLog: `No adapter for ${build.target}\n` });
    return;
  }
  await updateBuild(build.id, { status: "running", started: true });

  let steps: Step[] = [];
  let checks: CheckGroup[] = [];
  const fixes: Fix[] = [];
  let log = "";
  let dirty = false;
  const onEvent = (e: BuildEvent) => {
    if (e.type === "step") steps = upsert(steps, e.step);
    else if (e.type === "checks") checks = e.groups;
    else if (e.type === "fix") fixes.push(e.fix);
    else log += e.message + "\n";
    dirty = true;
  };

  const controller = new AbortController();
  const flush = async () => {
    if (!dirty) return;
    dirty = false;
    const appendLog = log;
    log = "";
    await updateBuild(build.id, { steps, checks, fixes, appendLog });
  };
  const timer = setInterval(async () => {
    await flush().catch(() => {});
    if (await isCancelRequested(build.id).catch(() => false)) controller.abort();
  }, 1000);

  const specDir = projectDir(build.slug);
  try {
    const result = await runBuild({
      specDir,
      outDir: buildDir(build.slug, build.number),
      adapter,
      checks: runChecks,
      onEvent,
      signal: controller.signal,
    });
    clearInterval(timer);
    steps = result.steps;
    checks = result.checks;
    dirty = true;
    await flush();
    if (fixes.length) {
      const raw = JSON.parse(await readFile(join(specDir, "spec.json"), "utf8"));
      await snapshot(build.project_id, raw.revision, raw);
      await updateBuild(build.id, { revision: raw.revision });
    }
    await updateBuild(build.id, { status: result.status, finished: true, preview_url: result.preview?.url ?? null } as any);
  } catch (error) {
    clearInterval(timer);
    await updateBuild(build.id, { status: "fail", finished: true, steps, checks, appendLog: `${error instanceof Error ? (error.stack ?? error.message) : error}\n` });
  } finally {
    const versions = await listReviewVersions(build.project_id);
    const latest = versions[0];
    await setStage(build.project_id, latest ? (latest.approved_at ? "approved" : "in-review") : "draft");
  }
}

function upsert(steps: Step[], step: Step) {
  const i = steps.findIndex((s) => s.id === step.id);
  return i < 0 ? [...steps, step] : steps.map((s, j) => (j === i ? step : s));
}

export async function runWorker() {
  await migrate();
  // Builds orphaned by a crash or restart can never finish; close them honestly.
  await sql()`update builds set status = 'fail', finished_at = now(), log = log || 'Worker restarted during this build.\n' where status = 'running'`;
  const boss = await queue();
  await boss.work<{ buildId: string }>(BUILD_QUEUE, { batchSize: 1, pollingIntervalSeconds: 1 }, async ([job]) => {
    if (job) await processBuild(job.data.buildId);
  });
  process.stdout.write("specwright worker: waiting for builds\n");
  await new Promise<void>((done) => {
    const stop = async () => {
      await boss.stop({ graceful: true, timeout: 30_000 }).catch(() => {});
      done();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

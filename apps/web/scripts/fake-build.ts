/**
 * Walk a build row through the pipeline the way the worker does, with the steps and
 * checks from the design, so the build screen can be tried without WordPress.
 *   pnpm --filter @specwright/web fake-build [slug] [--finish] [--fail]
 * Drives the newest queued build, or creates one. Stops at "Auto-fix running" unless --finish.
 */
import "./env.ts";
import type { CheckGroup, Fix, Step } from "@specwright/core";
import { getProject, listBuilds, sql, updateBuild, type Build } from "@specwright/db";

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--")) ?? "hale-and-field";
const finish = args.includes("--finish");
const failAtEnd = args.includes("--fail");

const project = await getProject(slug);
if (!project) throw new Error(`No project ${slug}. Run the seed script first.`);
const db = sql();

let build: Build | undefined = (await listBuilds(project.id)).find((b) => b.status === "queued");
if (!build) {
  [build] = await db<Build[]>`insert into builds (project_id, number, target, revision)
    values (${project.id}, coalesce((select max(number) from builds where project_id = ${project.id}), 0) + 1, ${project.platform}, ${project.revision}) returning *`;
  await db`update projects set stage = 'building', updated_at = now() where id = ${project.id}`;
}
const id = build!.id;
console.log(`Driving build #${build!.number} of ${slug}`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const steps: Step[] = [
  { id: "validate", label: "Spec validated", status: "waiting" },
  { id: "theme", label: "Theme generated", status: "waiting" },
  { id: "catalog", label: "Catalog synced", status: "waiting" },
  { id: "preview", label: "Preview started", status: "waiting" },
  { id: "checks", label: "Checks", status: "waiting" },
  { id: "autofix", label: "Auto-fix", status: "waiting" },
  { id: "recheck", label: "Re-run checks", status: "waiting" },
];
const set = async (sid: Step["id"], patch: Partial<Step>, took?: number) => {
  const s = steps.find((x) => x.id === sid)!;
  Object.assign(s, patch);
  if (patch.status === "running") s.startedAt = iso(0);
  if (took !== undefined) {
    s.startedAt = iso(took);
    s.endedAt = iso(0);
  }
  await updateBuild(id, { steps });
  await sleep(700);
};

const fix: Fix = { path: "pages.0.sections.3.settings.linkColor", from: "#9A8F7E", to: "token:ink", label: "#9A8F7E → --st-ink" };
const group = (gid: CheckGroup["id"], label: string, summary: string, passed: number, total: number): CheckGroup => ({ id: gid, label, status: "pass", summary, passed, total, findings: [] });
const checks = (fixed: boolean): CheckGroup[] => [
  group("journey", "Storefront journey", "Browse, filter, product, variant, cart, test payment", 6, 6),
  fixed
    ? group("a11y", "Accessibility", "WCAG 2.2 AA", 6, 6)
    : {
        ...group("a11y", "Accessibility", "WCAG 2.2 AA", 5, 6),
        status: "fail",
        findings: [
          {
            message: "Text contrast 2.9:1. Needs 4.5:1.",
            severity: "error",
            specId: "home.story.link",
            page: "/",
            viewport: "mobile",
            snippet: '<a class="st-textlink" href="/about" style="color: #9A8F7E">Read our story</a>',
            fix,
          },
        ],
      },
  group("performance", "Performance", "Mobile · LCP 1.4 s · CLS 0.01 · JS 18 kB", 3, 3),
  group("markup", "Block markup", "46 of 46 valid in the editor", 46, 46),
  group("standards", "Coding standards", "WordPress · 0 errors", 1, 1),
  group("visual", "Visual match", "7 sections · max diff 0.6%", 7, 7),
];

await updateBuild(id, { status: "running", steps, started: true, appendLog: "fake build started\n" });
await set("validate", { status: "running" });
await set("validate", { status: "pass", detail: `v${project.revision} · 3 markets` }, 300);
await set("theme", { status: "running" });
await set("theme", { status: "pass", detail: "38 files · 12 patterns" }, 41_000);
await set("catalog", { status: "running" });
await set("catalog", { status: "pass", detail: "24 products" }, 9_000);
await set("preview", { status: "running" });
await set("preview", { status: "pass", detail: "WordPress Playground" }, 6_000);
await set("checks", { status: "running" });
await updateBuild(id, { checks: checks(false) });
await set("checks", { status: "fail", detail: "41 of 42 passed" }, 38_000);
await set("autofix", { status: "running", detail: "Attempt 1 of 3" });

if (finish) {
  await sleep(1500);
  await updateBuild(id, { fixes: [fix] });
  await set("autofix", { status: "pass", detail: "Attempt 1 of 3 · spec unchanged (fake build)" }, 2_000);
  await set("recheck", { status: "running" });
  if (failAtEnd) {
    await set("recheck", { status: "fail", detail: "41 of 42 passed" }, 31_000);
    await updateBuild(id, { status: "fail", finished: true });
  } else {
    await updateBuild(id, { checks: checks(true) });
    await set("recheck", { status: "pass", detail: "42 of 42 passed" }, 31_000);
    await updateBuild(id, { status: "pass", finished: true });
  }
  await db`update projects set updated_at = now() where id = ${project.id}`;
}
console.log(finish ? "Finished." : "Left at auto-fix running. Run again with --finish to complete a new build.");
await db.end();

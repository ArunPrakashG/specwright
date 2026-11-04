import postgres from "postgres";
import { PgBoss } from "pg-boss";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { schemaSql } from "./schema.ts";
import type { SiteSpec } from "@specwright/spec";
import type { CheckGroup, Fix, Step } from "@specwright/core";

export type Stage = "draft" | "building" | "in-review" | "approved" | "live";
export type BuildStatus = "queued" | "running" | "pass" | "fail" | "cancelled";

export interface Project {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
  platform: string;
  stage: Stage;
  revision: number;
  review_token: string;
  created_at: Date;
  updated_at: Date;
}

export interface Build {
  id: string;
  project_id: string;
  number: number;
  target: string;
  status: BuildStatus;
  revision: number;
  steps: Step[];
  checks: CheckGroup[];
  fixes: Fix[];
  preview_url: string | null;
  log: string;
  cancel_requested: boolean;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

export interface ReviewVersion {
  project_id: string;
  n: number;
  revision: number;
  created_at: Date;
  approved_at: Date | null;
  approved_by: string | null;
}

export type Label = "copy" | "design" | "bug" | "scope";
export interface Comment {
  id: string;
  project_id: string;
  n: number | null;
  parent_id: string | null;
  version: number;
  page_id: string;
  spec_id: string;
  viewport: "desktop" | "mobile";
  body: string;
  author_name: string;
  author_role: "client" | "agency";
  label: Label | null;
  status: "open" | "quote-sent" | "resolved";
  resolved_in: number | null;
  created_at: Date;
}

export const BUILD_QUEUE = "build";

const g = globalThis as unknown as { __swSql?: postgres.Sql; __swMigrated?: Promise<void> };

export function sql() {
  if (!g.__swSql) {
    const url = process.env.DATABASE_URL ?? "postgres://specwright:specwright@localhost:5433/specwright";
    g.__swSql = postgres(url, { max: 5, onnotice: () => {} });
  }
  return g.__swSql;
}

export function migrate() {
  g.__swMigrated ??= (async () => {
    await sql().unsafe(schemaSql);
  })();
  return g.__swMigrated;
}

/** Root for project folders, build output and screenshots. */
export function dataDir() {
  return resolve(/* turbopackIgnore: true */ process.env.SPECWRIGHT_DATA_DIR ?? join(process.cwd(), ".specwright"));
}
export const projectDir = (slug: string) => join(dataDir(), "projects", slug);
export const buildDir = (slug: string, number: number) => join(dataDir(), "builds", slug, String(number));

export async function readSpec(slug: string): Promise<unknown> {
  return JSON.parse(await readFile(join(projectDir(slug), "spec.json"), "utf8"));
}

/** Write spec.json, bump the revision and keep a snapshot so review versions can show it later. */
export async function saveSpec(project: Project, spec: SiteSpec | Record<string, unknown>) {
  const raw = { ...(spec as Record<string, unknown>) };
  const revision = Math.max(project.revision, Number(raw.revision ?? 1)) + 1;
  raw.revision = revision;
  await writeFile(join(projectDir(project.slug), "spec.json"), JSON.stringify(raw, null, 2) + "\n");
  await snapshot(project.id, revision, raw);
  return revision;
}

export async function snapshot(projectId: string, revision: number, spec: unknown) {
  const db = sql();
  await db`insert into spec_versions (project_id, revision, spec) values (${projectId}, ${revision}, ${db.json(spec as any)})
    on conflict (project_id, revision) do update set spec = excluded.spec`;
  await db`update projects set revision = greatest(revision, ${revision}), updated_at = now() where id = ${projectId}`;
}

export async function specAt(projectId: string, revision: number): Promise<unknown | undefined> {
  const [row] = await sql()`select spec from spec_versions where project_id = ${projectId} and revision = ${revision}`;
  return row?.spec;
}

export async function getWorkspace(): Promise<{ name: string }> {
  await migrate();
  const [row] = await sql()`select name from workspace where id = 1`;
  return { name: row?.name ?? "My studio" };
}

export async function setWorkspaceName(name: string) {
  await migrate();
  await sql()`update workspace set name = ${name}, updated_at = now() where id = 1`;
}

export async function listProjects(): Promise<(Project & { last_build: Pick<Build, "status" | "checks" | "number"> | null })[]> {
  await migrate();
  return (await sql()`
    select p.*, (
      select json_build_object('status', b.status, 'checks', b.checks, 'number', b.number)
      from builds b where b.project_id = p.id order by b.number desc limit 1
    ) as last_build
    from projects p order by p.updated_at desc`) as any;
}

export async function getProject(slug: string): Promise<Project | undefined> {
  await migrate();
  const [row] = await sql()<Project[]>`select * from projects where slug = ${slug}`;
  return row;
}

export async function getProjectByToken(token: string): Promise<Project | undefined> {
  await migrate();
  if (!/^[a-f0-9]{24,64}$/.test(token)) return undefined;
  const [row] = await sql()<Project[]>`select * from projects where review_token = ${token}`;
  return row;
}

/**
 * Create a project folder from a spec (and the folder its assets live in, if any)
 * and register it.
 */
export async function createProject(spec: SiteSpec | Record<string, any>, assetsFrom?: string): Promise<Project> {
  await migrate();
  const s = spec as Record<string, any>;
  const dir = projectDir(s.id);
  await mkdir(dir, { recursive: true });
  if (assetsFrom) await cp(assetsFrom, dir, { recursive: true, filter: (src) => !src.endsWith("spec.json") });
  await writeFile(join(dir, "spec.json"), JSON.stringify(s, null, 2) + "\n");
  const platform = Object.keys(s.targets ?? {})[0] ?? "woocommerce";
  const [row] = await sql()<Project[]>`
    insert into projects (slug, name, domain, platform, revision, review_token)
    values (${s.id}, ${s.name}, ${s.domain ?? null}, ${platform}, ${s.revision ?? 1}, ${randomBytes(18).toString("hex")})
    on conflict (slug) do update set name = excluded.name, domain = excluded.domain, updated_at = now()
    returning *`;
  await snapshot(row!.id, s.revision ?? 1, s);
  return row!;
}

/** Rename a project or change its domain (the spec file is updated separately with saveSpec). */
export async function updateProject(id: string, patch: { name: string; domain: string | null }) {
  await sql()`update projects set name = ${patch.name}, domain = ${patch.domain}, updated_at = now() where id = ${id}`;
}

export async function setStage(projectId: string, stage: Stage) {
  await sql()`update projects set stage = ${stage}, updated_at = now() where id = ${projectId}`;
}

let boss: PgBoss | undefined;
export async function queue() {
  if (!boss) {
    boss = new PgBoss(process.env.DATABASE_URL ?? "postgres://specwright:specwright@localhost:5433/specwright");
    boss.on("error", (e) => console.error("[queue]", e));
    await boss.start();
    await boss.createQueue(BUILD_QUEUE, { expireInSeconds: 3600, retryLimit: 0 });
  }
  return boss;
}

export async function enqueueBuild(project: Project, target = project.platform): Promise<Build> {
  await migrate();
  const db = sql();
  const [build] = await db<Build[]>`
    insert into builds (project_id, number, target, revision)
    values (${project.id}, coalesce((select max(number) from builds where project_id = ${project.id}), 0) + 1, ${target}, ${project.revision})
    returning *`;
  await setStage(project.id, "building");
  await (await queue()).send(BUILD_QUEUE, { buildId: build!.id });
  return build!;
}

export async function listBuilds(projectId: string, limit = 20): Promise<Build[]> {
  return sql()<Build[]>`select * from builds where project_id = ${projectId} order by number desc limit ${limit}`;
}

export async function getBuild(projectId: string, number: number): Promise<Build | undefined> {
  const [row] = await sql()<Build[]>`select * from builds where project_id = ${projectId} and number = ${number}`;
  return row;
}

export async function getBuildById(id: string): Promise<(Build & { slug: string }) | undefined> {
  const [row] = await sql()<(Build & { slug: string })[]>`select b.*, p.slug from builds b join projects p on p.id = b.project_id where b.id = ${id}`;
  return row;
}

export async function updateBuild(id: string, patch: Partial<Pick<Build, "status" | "steps" | "checks" | "fixes" | "preview_url" | "revision">> & { appendLog?: string; started?: boolean; finished?: boolean }) {
  const db = sql();
  await db`update builds set
    status = coalesce(${patch.status ?? null}, status),
    steps = coalesce(${patch.steps ? db.json(patch.steps as any) : null}, steps),
    checks = coalesce(${patch.checks ? db.json(patch.checks as any) : null}, checks),
    fixes = coalesce(${patch.fixes ? db.json(patch.fixes as any) : null}, fixes),
    preview_url = coalesce(${patch.preview_url ?? null}, preview_url),
    revision = coalesce(${patch.revision ?? null}, revision),
    log = log || ${patch.appendLog ?? ""},
    started_at = case when ${!!patch.started} then now() else started_at end,
    finished_at = case when ${!!patch.finished} then now() else finished_at end
    where id = ${id}`;
}

export async function requestCancel(buildId: string) {
  await sql()`update builds set cancel_requested = true where id = ${buildId} and status in ('queued', 'running')`;
  await sql()`update builds set status = 'cancelled', finished_at = now() where id = ${buildId} and status = 'queued'`;
}

export async function isCancelRequested(buildId: string) {
  const [row] = await sql()`select cancel_requested from builds where id = ${buildId}`;
  return !!row?.cancel_requested;
}

export async function listReviewVersions(projectId: string): Promise<ReviewVersion[]> {
  return sql()<ReviewVersion[]>`select * from review_versions where project_id = ${projectId} order by n desc`;
}

/** Share the current revision with the client as the next review version. */
export async function publishReviewVersion(project: Project): Promise<ReviewVersion> {
  const [row] = await sql()<ReviewVersion[]>`
    insert into review_versions (project_id, n, revision)
    values (${project.id}, coalesce((select max(n) from review_versions where project_id = ${project.id}), 0) + 1, ${project.revision})
    returning *`;
  await setStage(project.id, "in-review");
  return row!;
}

export async function approveVersion(projectId: string, n: number, by: string) {
  await sql()`update review_versions set approved_at = now(), approved_by = ${by} where project_id = ${projectId} and n = ${n} and approved_at is null`;
  await setStage(projectId, "approved");
}

export async function listComments(projectId: string): Promise<Comment[]> {
  return sql()<Comment[]>`select * from comments where project_id = ${projectId} order by created_at`;
}

export async function addComment(c: Pick<Comment, "project_id" | "version" | "page_id" | "spec_id" | "viewport" | "body" | "author_name" | "author_role"> & { label?: Label | null; parent_id?: string | null }): Promise<Comment> {
  const db = sql();
  const [row] = await db<Comment[]>`
    insert into comments (project_id, n, parent_id, version, page_id, spec_id, viewport, body, author_name, author_role, label)
    values (
      ${c.project_id},
      ${c.parent_id ? null : db`coalesce((select max(n) from comments where project_id = ${c.project_id}), 0) + 1`},
      ${c.parent_id ?? null}, ${c.version}, ${c.page_id}, ${c.spec_id}, ${c.viewport}, ${c.body}, ${c.author_name}, ${c.author_role}, ${c.label ?? null}
    ) returning *`;
  return row!;
}

export async function updateComment(id: string, projectId: string, patch: Partial<Pick<Comment, "label" | "status" | "resolved_in">>) {
  const db = sql();
  await db`update comments set
    label = coalesce(${patch.label ?? null}, label),
    status = coalesce(${patch.status ?? null}, status),
    resolved_in = coalesce(${patch.resolved_in ?? null}, resolved_in)
    where id = ${id} and project_id = ${projectId}`;
}

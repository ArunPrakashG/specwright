"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addComment,
  createProject,
  enqueueBuild,
  getBuild,
  getProject,
  listReviewVersions,
  publishReviewVersion,
  readSpec,
  requestCancel,
  saveSpec,
  setWorkspaceName,
  updateComment,
  updateProject,
  getWorkspace,
  listComments,
  sql,
  type Label,
} from "@specwright/db";
import { sectionTypes } from "@specwright/sections";
import { validateSpec, type Issue } from "@specwright/spec";
import { ADMIN_COOKIE, adminToken, requireAdmin, safeEqual, tokenDigest } from "@/lib/auth";
import { applyEdits } from "@/lib/spec";
import { sampleSpec } from "@/lib/sample";

export type FormState = { error?: string; issues?: Issue[]; ok?: boolean; message?: string } | undefined;

async function project(slug: string) {
  await requireAdmin();
  const p = await getProject(slug);
  if (!p) throw new Error("Project not found.");
  return p;
}

async function freeSlug(base: string) {
  if (!(await getProject(base))) return base;
  for (let i = 2; i < 100; i++) if (!(await getProject(`${base}-${i}`))) return `${base}-${i}`;
  throw new Error("Too many copies of this project.");
}

export async function createSample(): Promise<FormState> {
  await requireAdmin();
  const { dir, spec } = await sampleSpec();
  spec.id = await freeSlug(spec.id);
  const p = await createProject(spec, dir);
  redirect(`/p/${p.slug}`);
}

export async function createFromUpload(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const file = form.get("spec");
  if (!(file instanceof File) || !file.size) return { error: "Choose a spec.json file." };
  if (file.size > 1_000_000) return { error: "That file is over 1 MB. A spec is usually a few kB." };
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return { error: "That file is not valid JSON." };
  }
  const result = validateSpec(raw, sectionTypes);
  if (!result.ok) return { error: "The spec has problems. Fix them and upload it again.", issues: result.issues };
  const spec = raw as Record<string, any>;
  delete spec.$schema;
  if (await getProject(result.spec.id)) return { error: `A project with the id "${result.spec.id}" already exists. Change "id" in the spec to import it as a new project.` };
  const p = await createProject(spec);
  redirect(`/p/${p.slug}`);
}

export async function startBuild(slug: string) {
  const p = await project(slug);
  const build = await enqueueBuild(p);
  redirect(`/p/${slug}/builds/${build.number}`);
}

export async function cancelBuild(slug: string, n: number) {
  const p = await project(slug);
  const b = await getBuild(p.id, n);
  if (b) await requestCancel(b.id);
  revalidatePath(`/p/${slug}/builds/${n}`);
}

export interface Edit {
  pageId: string;
  sectionId: string;
  path: (string | number)[];
  value: string | number | boolean;
}

export async function saveEdits(slug: string, baseRevision: number, edits: Edit[]): Promise<{ revision?: number; error?: string; issues?: (Issue & { key?: string })[] }> {
  const p = await project(slug);
  if (p.revision !== baseRevision) return { error: `The spec changed since you opened it (now v${p.revision}). Reload to see the latest, then make your edit again.` };
  if (!Array.isArray(edits) || !edits.length || edits.length > 200) return { error: "Nothing to save." };
  const raw = (await readSpec(slug)) as Record<string, any>;
  const groups = new Map<string, Edit[]>();
  for (const e of edits) {
    if (typeof e?.pageId !== "string" || typeof e.sectionId !== "string" || !Array.isArray(e.path) || !["string", "number", "boolean"].includes(typeof e.value)) return { error: "Invalid edit." };
    if (typeof e.value === "string" && e.value.length > 4000) return { error: "That text is too long." };
    const k = `${e.pageId}.${e.sectionId}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  for (const [k, list] of groups) {
    const { issues } = applyEdits(raw, list[0]!.pageId, list[0]!.sectionId, list);
    if (issues.length) return { error: "Not saved. Fix the highlighted fields.", issues: issues.map((i) => ({ ...i, key: `${k}|${i.path}` })) };
  }
  const revision = await saveSpec(p, raw);
  revalidatePath(`/p/${slug}`, "layout");
  return { revision };
}

export async function shareVersion(slug: string) {
  const p = await project(slug);
  await publishReviewVersion(p);
  revalidatePath(`/p/${slug}`, "layout");
}

const clean = (s: unknown, max = 4000) => (typeof s === "string" ? s.trim().slice(0, max) : "");

export async function agencyReply(slug: string, parentId: string, text: string): Promise<FormState> {
  const p = await project(slug);
  const body = clean(text);
  if (!body) return { error: "Write a reply first." };
  const parent = (await listComments(p.id)).find((c) => c.id === parentId && !c.parent_id);
  if (!parent) return { error: "That thread no longer exists." };
  const { name } = await getWorkspace();
  await addComment({ project_id: p.id, parent_id: parent.id, version: parent.version, page_id: parent.page_id, spec_id: parent.spec_id, viewport: parent.viewport, body, author_name: name, author_role: "agency" });
  revalidatePath(`/p/${slug}/review`);
  return { ok: true };
}

const LABEL_IDS = ["copy", "design", "bug", "scope"] as const;
export async function setCommentLabel(slug: string, id: string, label: string) {
  const p = await project(slug);
  if (!LABEL_IDS.includes(label as Label)) return;
  await updateComment(id, p.id, { label: label as Label });
  revalidatePath(`/p/${slug}/review`);
}

export async function setCommentStatus(slug: string, id: string, status: string) {
  const p = await project(slug);
  if (status !== "open" && status !== "quote-sent" && status !== "resolved") return;
  const latest = (await listReviewVersions(p.id))[0]?.n;
  if (status === "open") {
    await sql()`update comments set status = 'open', resolved_in = null where id = ${id} and project_id = ${p.id}`;
  } else await updateComment(id, p.id, { status, resolved_in: status === "resolved" ? (latest ?? null) : null });
  revalidatePath(`/p/${slug}/review`);
}

export async function saveProjectSettings(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const p = await project(slug);
  const name = clean(form.get("name"), 120);
  const domain = clean(form.get("domain"), 253).replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!name) return { error: "A project needs a name." };
  if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return { error: "Enter a domain like haleandfield.com, without a path." };
  const raw = (await readSpec(slug)) as Record<string, any>;
  if (raw.name !== name || (raw.domain ?? "") !== domain) {
    raw.name = name;
    if (domain) raw.domain = domain;
    else delete raw.domain;
    const check = validateSpec(raw, sectionTypes);
    if (!check.ok) return { error: "The spec has errors, so it was not changed.", issues: check.issues };
    await saveSpec(p, raw);
  }
  await updateProject(p.id, { name, domain: domain || null });
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved" };
}

export async function saveWorkspace(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const name = clean(form.get("workspace"), 80);
  if (!name) return { error: "The workspace needs a name. Clients see it on review links." };
  await setWorkspaceName(name);
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved" };
}

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const token = adminToken();
  const given = clean(form.get("token"), 512);
  if (!token) redirect("/");
  if (!given || !safeEqual(given, token)) return { error: "That token is not right." };
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, await tokenDigest(token), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  const next = clean(form.get("next"), 300);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  redirect("/login");
}

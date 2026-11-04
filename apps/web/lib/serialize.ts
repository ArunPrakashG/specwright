import type { Build, Comment, ReviewVersion } from "@specwright/db";

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

export function buildJson(b: Build) {
  return {
    number: b.number,
    target: b.target,
    status: b.status,
    revision: b.revision,
    steps: b.steps,
    checks: b.checks,
    fixes: b.fixes,
    preview_url: b.preview_url,
    cancel_requested: b.cancel_requested,
    created_at: iso(b.created_at)!,
    started_at: iso(b.started_at),
    finished_at: iso(b.finished_at),
  };
}
export type BuildJson = ReturnType<typeof buildJson>;

export function versionJson(v: ReviewVersion) {
  return { n: v.n, revision: v.revision, created_at: iso(v.created_at)!, approved_at: iso(v.approved_at), approved_by: v.approved_by };
}
export type VersionJson = ReturnType<typeof versionJson>;

export function commentJson(c: Comment) {
  return {
    id: c.id,
    n: c.n,
    parent_id: c.parent_id,
    version: c.version,
    page_id: c.page_id,
    spec_id: c.spec_id,
    viewport: c.viewport,
    body: c.body,
    author_name: c.author_name,
    author_role: c.author_role,
    label: c.label,
    status: c.status,
    resolved_in: c.resolved_in,
    created_at: iso(c.created_at)!,
  };
}
export type CommentJson = ReturnType<typeof commentJson>;
export type Thread = CommentJson & { replies: CommentJson[] };

export function threads(comments: Comment[]): Thread[] {
  const all = comments.map(commentJson);
  return all
    .filter((c) => !c.parent_id && c.n !== null)
    .map((t) => ({ ...t, replies: all.filter((r) => r.parent_id === t.id) }))
    .sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
}

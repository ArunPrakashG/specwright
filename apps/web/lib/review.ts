import { headers } from "next/headers";
import { listComments, listReviewVersions, type Project } from "@specwright/db";
import { specTree } from "@specwright/sections";
import type { ReviewPage } from "@/components/review-board";
import { threads, versionJson } from "./serialize.ts";
import { loadSpec } from "./spec.ts";

/** Everything the review board needs: versions newest first, the pages of the newest one, and threads. */
export async function reviewData(project: Project) {
  const [versions, comments] = await Promise.all([listReviewVersions(project.id), listComments(project.id)]);
  const sorted = [...versions].sort((a, b) => b.n - a.n);
  const latest = sorted[0];
  const { spec } = await loadSpec(project, latest?.revision ?? project.revision);
  const pages: ReviewPage[] = spec ? spec.pages.map((p) => ({ id: p.id, title: p.title, path: p.path, ids: specTree(spec, p.id).map((n) => n.id) })) : [];
  return { versions: sorted.map(versionJson), pages, threads: threads(comments) };
}

/** The public origin of this request, for links people copy. */
export async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

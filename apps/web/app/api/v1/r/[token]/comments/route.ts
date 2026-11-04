import { addComment, listComments } from "@specwright/db";
import { specTree } from "@specwright/sections";
import { triageByRules } from "@specwright/ai";
import { body, fail, handle, json } from "@/lib/http";
import { commentJson, threads } from "@/lib/serialize";
import { nameCookie, reviewerName, reviewProject, versionOf } from "@/lib/review-api";
import { loadSpec } from "@/lib/spec";

export const GET = handle(async (req, ctx: RouteContext<"/api/v1/r/[token]/comments">) => {
  const project = await reviewProject(req, (await ctx.params).token, "read");
  return json({ threads: threads(await listComments(project.id)) });
});

/** A client comment: a new thread anchored to a spec id, or a reply to a thread (`parent_id`). */
export const POST = handle(async (req, ctx: RouteContext<"/api/v1/r/[token]/comments">) => {
  const project = await reviewProject(req, (await ctx.params).token, "write");
  const input = (await body(req, 16_000)) as Record<string, unknown>;
  if (!input || typeof input !== "object") return fail(400, "Body must be a JSON object");
  const text = typeof input.body === "string" ? input.body.trim() : "";
  if (!text) return fail(422, "Write a comment first");
  if (text.length > 4000) return fail(422, "Keep comments under 4000 characters");
  const name = reviewerName(req, input.author_name);
  const comments = await listComments(project.id);

  let comment;
  if (input.parent_id !== undefined && input.parent_id !== null) {
    const parent = comments.find((c) => c.id === input.parent_id && !c.parent_id);
    if (!parent) return fail(422, "That thread does not exist");
    comment = await addComment({ project_id: project.id, parent_id: parent.id, version: parent.version, page_id: parent.page_id, spec_id: parent.spec_id, viewport: parent.viewport, body: text, author_name: name, author_role: "client" });
  } else {
    const version = await versionOf(project, input.version);
    const viewport = input.viewport === "mobile" ? "mobile" : input.viewport === "desktop" || input.viewport === undefined ? "desktop" : null;
    if (!viewport) return fail(422, "viewport must be desktop or mobile");
    const { spec } = await loadSpec(project, version.revision);
    if (!spec) return fail(409, "This version cannot be rendered");
    const pageId = typeof input.page_id === "string" ? input.page_id : "";
    if (!spec.pages.some((p) => p.id === pageId)) return fail(422, "No such page");
    const specId = typeof input.spec_id === "string" ? input.spec_id : "";
    if (!specTree(spec, pageId).some((n) => n.id === specId)) return fail(422, "That element is not on this page");
    comment = await addComment({ project_id: project.id, version: version.n, page_id: pageId, spec_id: specId, viewport, body: text, author_name: name, author_role: "client", label: triageByRules(text).label });
  }
  return json({ comment: commentJson(comment) }, 201, { "Set-Cookie": nameCookie(name) });
});

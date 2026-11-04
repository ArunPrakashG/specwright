import { getProject, readSpec, saveSpec } from "@specwright/db";
import { sectionTypes } from "@specwright/sections";
import { validateSpec } from "@specwright/spec";
import { body, fail, handle, json, requireApiAdmin } from "@/lib/http";

export const GET = handle(async (req, ctx: RouteContext<"/api/v1/projects/[slug]/spec">) => {
  await requireApiAdmin(req);
  const project = await getProject((await ctx.params).slug);
  if (!project) return fail(404, "No such project");
  return json({ revision: project.revision, spec: await readSpec(project.slug) });
});

/** Replace the spec. Send `If-Match: <revision>` to refuse the write when someone else saved first. */
export const PUT = handle(async (req, ctx: RouteContext<"/api/v1/projects/[slug]/spec">) => {
  await requireApiAdmin(req);
  const project = await getProject((await ctx.params).slug);
  if (!project) return fail(404, "No such project");
  const ifMatch = req.headers.get("if-match");
  if (ifMatch && Number(ifMatch.replace(/"/g, "")) !== project.revision) return fail(409, "The spec changed since that revision", { revision: project.revision });
  const raw = await body(req, 1_000_000);
  const result = validateSpec(raw, sectionTypes);
  if (!result.ok) return fail(422, "The spec is not valid", { issues: result.issues });
  if (result.spec.id !== project.slug) return fail(422, `The spec id must stay "${project.slug}"`);
  const revision = await saveSpec(project, raw as Record<string, unknown>);
  return json({ revision, issues: result.issues });
});

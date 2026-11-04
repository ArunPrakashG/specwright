import { getBuild, getProject } from "@specwright/db";
import { fail, handle, json, requireApiAdmin } from "@/lib/http";
import { buildJson } from "@/lib/serialize";

export const GET = handle(async (req, ctx: RouteContext<"/api/v1/projects/[slug]/builds/[n]">) => {
  await requireApiAdmin(req);
  const { slug, n } = await ctx.params;
  const project = await getProject(slug);
  if (!project) return fail(404, "No such project");
  const number = Number(n);
  if (!Number.isInteger(number) || number < 1) return fail(400, "Build number must be a positive integer");
  const build = await getBuild(project.id, number);
  if (!build) return fail(404, "No such build");
  return json({ build: buildJson(build) });
});

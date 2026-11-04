import { enqueueBuild, getProject, listBuilds } from "@specwright/db";
import { fail, handle, json, requireApiAdmin } from "@/lib/http";
import { buildJson } from "@/lib/serialize";

export const GET = handle(async (req, ctx: RouteContext<"/api/v1/projects/[slug]/builds">) => {
  await requireApiAdmin(req);
  const project = await getProject((await ctx.params).slug);
  if (!project) return fail(404, "No such project");
  return json({ builds: (await listBuilds(project.id)).map(buildJson) });
});

export const POST = handle(async (req, ctx: RouteContext<"/api/v1/projects/[slug]/builds">) => {
  await requireApiAdmin(req);
  const project = await getProject((await ctx.params).slug);
  if (!project) return fail(404, "No such project");
  const build = await enqueueBuild(project);
  return json({ build: buildJson(build) }, 201, { Location: `/api/v1/projects/${project.slug}/builds/${build.number}` });
});

import { getProject, listComments } from "@specwright/db";
import { fail, handle, json, requireApiAdmin } from "@/lib/http";
import { threads } from "@/lib/serialize";

export const GET = handle(async (req, ctx: RouteContext<"/api/v1/projects/[slug]/comments">) => {
  await requireApiAdmin(req);
  const project = await getProject((await ctx.params).slug);
  if (!project) return fail(404, "No such project");
  return json({ threads: threads(await listComments(project.id)) });
});

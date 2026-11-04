import { getProject } from "@specwright/db";
import { assetResponse } from "@/lib/preview";

export async function GET(_req: Request, ctx: RouteContext<"/assets/[slug]/[...path]">) {
  const { slug, path } = await ctx.params;
  const project = await getProject(slug);
  if (!project) return new Response("Not found", { status: 404 });
  return assetResponse(project, path);
}

import { getProject } from "@specwright/db";
import { previewResponse } from "@/lib/preview";

export async function GET(req: Request, ctx: RouteContext<"/preview/[slug]/[page]">) {
  const { slug, page } = await ctx.params;
  const project = await getProject(slug);
  if (!project) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const rev = Number(url.searchParams.get("rev")) || undefined;
  return previewResponse(project, page, url, `/assets/${encodeURIComponent(slug)}`, rev);
}

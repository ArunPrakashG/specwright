import { getProjectByToken, listReviewVersions } from "@specwright/db";
import { previewResponse } from "@/lib/preview";
import { clientKey, limited } from "@/lib/rate-limit";

export async function GET(req: Request, ctx: RouteContext<"/r/[token]/preview/[page]">) {
  const { token, page } = await ctx.params;
  if (limited(`preview:${clientKey(req)}`, 240)) return new Response("Too many requests", { status: 429 });
  const project = await getProjectByToken(token);
  if (!project) return new Response("Not found", { status: 404 });
  const versions = await listReviewVersions(project.id);
  const url = new URL(req.url);
  const n = Number(url.searchParams.get("v"));
  const version = versions.find((v) => v.n === n) ?? versions[0];
  if (!version) return new Response("Nothing has been shared for review yet.", { status: 404 });
  return previewResponse(project, page, url, `/r/${token}/assets`, version.revision);
}

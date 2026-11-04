import { getProjectByToken } from "@specwright/db";
import { assetResponse } from "@/lib/preview";
import { clientKey, limited } from "@/lib/rate-limit";

export async function GET(req: Request, ctx: RouteContext<"/r/[token]/assets/[...path]">) {
  const { token, path } = await ctx.params;
  if (limited(`asset:${clientKey(req)}`, 1200)) return new Response("Too many requests", { status: 429 });
  const project = await getProjectByToken(token);
  if (!project) return new Response("Not found", { status: 404 });
  return assetResponse(project, path);
}

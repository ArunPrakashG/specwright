import { approveVersion } from "@specwright/db";
import { body, fail, handle, json } from "@/lib/http";
import { nameCookie, reviewerName, reviewProject, versionOf } from "@/lib/review-api";

export const POST = handle(async (req, ctx: RouteContext<"/api/v1/r/[token]/approve">) => {
  const project = await reviewProject(req, (await ctx.params).token, "write");
  const input = (await body(req, 4_000)) as Record<string, unknown>;
  const version = await versionOf(project, input?.version);
  if (version.approved_at) return fail(409, `v${version.n} is already approved`);
  const name = reviewerName(req, input?.author_name);
  await approveVersion(project.id, version.n, name);
  return json({ approved: version.n, by: name }, 200, { "Set-Cookie": nameCookie(name) });
});

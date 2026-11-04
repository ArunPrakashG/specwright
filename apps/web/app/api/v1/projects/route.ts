import { listProjects } from "@specwright/db";
import { handle, json, requireApiAdmin } from "@/lib/http";

export const GET = handle(async (req) => {
  await requireApiAdmin(req);
  const projects = await listProjects();
  return json({
    projects: projects.map((p) => ({
      slug: p.slug,
      name: p.name,
      domain: p.domain,
      platform: p.platform,
      stage: p.stage,
      revision: p.revision,
      updated_at: p.updated_at,
      last_build: p.last_build ? { number: p.last_build.number, status: p.last_build.status } : null,
    })),
  });
});

/**
 * Seed the dashboard with the Hale & Field sample: the project, the workspace name,
 * three review versions and the four review threads from the design.
 *   pnpm --filter @specwright/web seed [--reset]
 */
import { repoRoot } from "./env.ts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createProject, getProject, migrate, setWorkspaceName, snapshot, sql } from "@specwright/db";

const reset = process.argv.includes("--reset");
const dir = join(repoRoot, "packages/spec/examples/hale-and-field");
const spec = JSON.parse(await readFile(join(dir, "spec.json"), "utf8"));
delete spec.$schema;

await migrate();
const db = sql();
if (reset) await db`delete from projects where slug = ${spec.id}`;

let project = await getProject(spec.id);
if (!project) project = await createProject(spec, dir);
await setWorkspaceName("Northline Studio");

const at = (ms: number) => new Date(Date.now() - ms);
const oct = (d: number, h = 10) => new Date(new Date().getFullYear(), 9, d, h);

const count = (await db<{ count: number }[]>`select count(*)::int as count from review_versions where project_id = ${project.id}`)[0]?.count ?? 0;
if (!count) {
  for (const rev of [2, 3]) await snapshot(project.id, rev, { ...spec, revision: rev });
  await db`insert into review_versions (project_id, n, revision, created_at) values
    (${project.id}, 1, 2, ${oct(27)}), (${project.id}, 2, 3, ${oct(30)}), (${project.id}, 3, ${project.revision}, ${at(3 * 3600_000)})`;
  await db`update projects set stage = 'in-review', updated_at = ${at(12 * 60_000)} where id = ${project.id}`;

  const thread = async (n: number, version: number, specId: string, body: string, label: string, status: string, when: Date, resolvedIn: number | null = null) => {
    const [row] = await db`insert into comments (project_id, n, version, page_id, spec_id, viewport, body, author_name, author_role, label, status, resolved_in, created_at)
      values (${project!.id}, ${n}, ${version}, 'home', ${specId}, 'desktop', ${body}, 'Maya Chen', 'client', ${label}, ${status}, ${resolvedIn}, ${when}) returning id`;
    return row!.id as string;
  };
  const reply = (parent: string, version: number, specId: string, body: string, when: Date) =>
    db`insert into comments (project_id, parent_id, version, page_id, spec_id, viewport, body, author_name, author_role, created_at)
      values (${project!.id}, ${parent}, ${version}, 'home', ${specId}, 'desktop', ${body}, 'Ana Ruiz', 'agency', ${when})`;

  await thread(4, 2, "home.newsletter.button", "The subscribe button is hard to read.", "design", "resolved", oct(30, 15), 3);
  const t1 = await thread(1, 3, "home.hero.heading", "Can the headline feel warmer? “Made slowly” reads a little cold.", "copy", "open", at(2 * 3600_000 + 120_000));
  await thread(2, 3, "home.featured.card-1.image", "The mug photo looks too dark on my phone.", "design", "open", at(2 * 3600_000));
  const t3 = await thread(3, 3, "checkout.options", "Could we offer gift wrapping at checkout?", "scope", "quote-sent", at(3600_000));
  await reply(t1, 3, "home.hero.heading", "Trying “Stoneware for slow mornings.” in v4.", at(90 * 60_000));
  await reply(t3, 3, "checkout.options", "This is outside the agreed scope, so I have sent a quote for it.", at(40 * 60_000));
}

const fresh = (await getProject(spec.id))!;
console.log(`Seeded ${fresh.name}: /p/${fresh.slug}  review link /r/${fresh.review_token}`);
await db.end();

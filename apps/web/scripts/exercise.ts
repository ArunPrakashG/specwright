/**
 * Drive the main flows in a real browser against a running dashboard and fail loudly if one breaks.
 * Changes data: run the seed with --reset afterwards to get the sample back.
 *   pnpm --filter @specwright/web exec tsx scripts/exercise.ts [--out dir]
 */
import "./env.ts";
import { chromium, type Frame, type Page } from "playwright";
import { getProject } from "@specwright/db";
import { ADMIN_COOKIE, tokenDigest } from "../lib/auth.ts";

const args = process.argv.slice(2);
const out = args.includes("--out") ? args[args.indexOf("--out") + 1]! : "/tmp/claude-1000/sw/web";
const base = process.env.BASE_URL ?? "http://localhost:3100";
const project = (await getProject("hale-and-field"))!;

function check(ok: unknown, what: string) {
  if (!ok) throw new Error(`FAILED: ${what}`);
  console.log(`ok  ${what}`);
}

async function preview(page: Page, path: string): Promise<Frame> {
  const handle = await page.waitForSelector(`iframe[src^="${path}"]`);
  const frame = (await handle.contentFrame())!;
  await frame.waitForSelector("[data-specwright-overlay]", { state: "attached" });
  return frame;
}
const locked = (frame: Frame) => frame.evaluate(() => document.querySelector(".swo-layer .swo-box")?.getAttribute("data-for") ?? "");
async function until(fn: () => Promise<unknown>, what: string, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return check(true, what);
    await new Promise((r) => setTimeout(r, 100));
  }
  check(false, what);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const admin = process.env.SPECWRIGHT_ADMIN_TOKEN;
if (admin) await page.context().addCookies([{ name: ADMIN_COOKIE, value: await tokenDigest(admin), url: base }]);

// Spec: the tree drives lock-on, an edit saves as a new revision, Build queues a run.
await page.goto(`${base}/p/${project.slug}`);
let frame = await preview(page, `/preview/${project.slug}/home`);
await page.click('button[title="home.hero.heading"]');
await until(async () => (await locked(frame)) === "home.hero.heading", "tree select locks onto home.hero.heading");
await page.click('button[title="home.story"]');
await until(async () => (await locked(frame)) === "home.story", "lock-on moves to home.story");
await page.click('button[title="home.hero"]');
await page.click('button[title="home.hero.heading"]');
const before = project.revision;
const heading = page.getByLabel("Text · en", { exact: true });
await heading.fill("Stoneware for slow mornings.");
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.getByText(`Saved as spec v${before + 1}`).waitFor();
check(true, `hero heading saved, spec v${before} → v${before + 1}`);
await until(async () => (await page.locator("h1 + span").first().textContent())?.includes(`v${before + 1}`), "header shows the new revision");
frame = await preview(page, `/preview/${project.slug}/home`);
await until(() => frame.getByText("Stoneware for slow mornings.").count(), "preview renders the new heading");
await page.screenshot({ path: `${out}/flow-spec-saved.png` });

await page.getByRole("button", { name: "Build", exact: true }).click();
await page.waitForURL(/\/builds\/\d+$/);
check(true, `Build opened ${new URL(page.url()).pathname}`);
await page.getByText("Queued").first().waitFor();
check(true, "new build shows Queued");

// Client review: pins, pick mode, comment, reply, approve.
await page.context().clearCookies();
await page.goto(`${base}/r/${project.review_token}`);
frame = await preview(page, `/r/${project.review_token}/preview/home`);
await until(async () => (await locked(frame)) === "home.hero.heading", "review opens locked on thread 1");
check((await page.content()).includes("Specwright") === false, "client review has no Specwright branding");
await frame.click('.swo-pin[data-n="2"]');
await until(async () => (await page.locator('article button[aria-pressed="true"]').textContent())?.includes("mug photo"), "clicking pin 2 activates thread 2");
await until(async () => (await locked(frame)) === "home.featured.card-1.image", "lock-on moves to the pin's element");
await page.locator("article button", { hasText: "subscribe button" }).click();
await until(async () => (await locked(frame)) === "home.newsletter.button", "selecting thread 4 moves lock-on");

await page.getByRole("button", { name: "Comment", exact: true }).click();
await frame.locator('[data-spec-id="home.story.heading"]').click();
await page.getByLabel("New comment").fill("Could the story section use a photo of the studio instead?");
await page.locator("#new-name").fill("Maya Chen");
await page.getByRole("button", { name: "Send", exact: true }).first().click();
await until(() => page.locator("article", { hasText: "photo of the studio" }).count(), "new comment appears as a thread");
const label = await page.locator("article", { hasText: "photo of the studio" }).locator(".sw-label").textContent();
check(label, `new thread labelled "${label}" by triage`);
await page.screenshot({ path: `${out}/flow-review-commented.png` });

// Keyboard pick: Tab into the preview, Enter on an element.
await page.getByRole("button", { name: "Comment", exact: true }).click();
await until(() => frame.evaluate(() => document.documentElement.classList.contains("swo-picking")), "pick mode reaches the preview");
await frame.locator('[data-spec-id="home.newsletter"]').focus();
await page.keyboard.press("Enter");
await until(() => page.locator(".sw-tag", { hasText: /^home\.newsletter$/ }).count(), "keyboard Enter picks the focused element");
await page.getByRole("button", { name: "Cancel", exact: true }).click();

await page.getByLabel(/^Reply to #/).fill("Thanks, that reads better now.");
check(!(await page.locator("#reply-name").count()), "reviewer name is remembered (no name field)");
await page.locator("form", { has: page.getByLabel(/^Reply to #/) }).getByRole("button", { name: "Send" }).click();
await until(() => page.getByText("Thanks, that reads better now.").count(), "reply shows in the thread");

await page.getByRole("button", { name: /^Approve v\d+$/ }).click();
await page.locator("dialog[open]").getByRole("button", { name: /^Approve v\d+$/ }).click();
await until(() => page.locator(".sw-status", { hasText: /^Approved$/ }).count(), "approval shows Approved status text");
check(await page.getByRole("button", { name: /^Approve v\d+$/ }).isDisabled(), "approve button disabled after approval");
await page.screenshot({ path: `${out}/flow-review-approved.png` });

await browser.close();
process.exit(0);

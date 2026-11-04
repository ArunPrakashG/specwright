/**
 * Screenshot dashboard screens at 1440, 768 and 375 wide, light and dark.
 *   pnpm --filter @specwright/web exec tsx scripts/shoot.ts [name-filter] [--out dir]
 */
import "./env.ts";
import { chromium } from "playwright";
import { getProject, listBuilds } from "@specwright/db";
import { ADMIN_COOKIE, tokenDigest } from "../lib/auth.ts";

const args = process.argv.slice(2);
const filter = args.find((a) => !a.startsWith("--"));
const out = args.includes("--out") ? args[args.indexOf("--out") + 1]! : "/tmp/claude-1000/sw/web";
const base = process.env.BASE_URL ?? "http://localhost:3100";

const p = (await getProject("hale-and-field"))!;
const build = (await listBuilds(p.id))[0];
const screens: [string, string][] = [
  ["projects", "/"],
  ["spec", `/p/${p.slug}`],
  ["builds", `/p/${p.slug}/builds`],
  ...(build ? [["build", `/p/${p.slug}/builds/${build.number}`] as [string, string]] : []),
  ["review-agency", `/p/${p.slug}/review`],
  ["settings", `/p/${p.slug}/settings`],
  ["review-client", `/r/${p.review_token}`],
  ["sections", "/sections"],
  ["workspace", "/settings"],
];

const browser = await chromium.launch();
for (const [name, path] of screens.filter(([n]) => !filter || n.includes(filter))) {
  for (const width of [1440, 768, 375]) {
    for (const scheme of ["light", "dark"] as const) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 1000 }, colorScheme: scheme, deviceScaleFactor: 1 });
      const admin = process.env.SPECWRIGHT_ADMIN_TOKEN;
      if (admin) await ctx.addCookies([{ name: ADMIN_COOKIE, value: await tokenDigest(admin), url: base }]);
      const page = await ctx.newPage();
      await page.goto(base + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const file = `${out}/${name}-${width}-${scheme}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(`${file}${overflow > 0 ? `  HORIZONTAL OVERFLOW ${overflow}px` : ""}`);
      await ctx.close();
    }
  }
}
await browser.close();
process.exit(0);

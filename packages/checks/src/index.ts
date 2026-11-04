import { chromium } from "playwright";
import type { CheckGroup, ChecksRunner } from "@specwright/core";
import { runA11y } from "./a11y.ts";
import { runJourney } from "./journey.ts";
import { runPerformance } from "./performance.ts";
import { errorMessage, ensureDir, type Run } from "./util.ts";
import { runVisual } from "./visual.ts";
import { join } from "node:path";

export { runA11y, runJourney, runPerformance, runVisual };

const GROUPS: { id: CheckGroup["id"]; label: string; run(run: Run): Promise<CheckGroup> }[] = [
  { id: "journey", label: "Storefront journey", run: runJourney },
  { id: "a11y", label: "Accessibility", run: runA11y },
  { id: "performance", label: "Performance", run: runPerformance },
  { id: "visual", label: "Visual match", run: runVisual },
];

/** Run the shared storefront checks against a live preview. One browser serves every group. */
export const runChecks: ChecksRunner = async (input) => {
  const browser = await chromium.launch();
  const run: Run = { input, browser, dir: join(input.outDir, "checks") };
  await ensureDir(run);
  try {
    const groups: CheckGroup[] = [];
    for (const g of GROUPS) {
      input.log(`checks: ${g.label}`);
      try {
        groups.push(await g.run(run));
      } catch (e) {
        // A crashed group must not hide the others.
        groups.push({
          id: g.id,
          label: g.label,
          status: g.id === "visual" ? "warn" : "fail",
          summary: "Could not run",
          passed: 0,
          total: 1,
          findings: [{ message: errorMessage(e), severity: g.id === "visual" ? "warning" : "error" }],
        });
      }
    }
    return groups;
  } finally {
    await browser.close();
  }
};

export type { Run } from "./util.ts";

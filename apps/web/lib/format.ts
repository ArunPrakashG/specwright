import type { CheckGroup, Step } from "@specwright/core";

export type Tone = "pass" | "warn" | "fail" | "run" | "idle";
export const statusClass = (tone: Tone) => `sw-status is-${tone}`;

const PLATFORMS: Record<string, string> = { woocommerce: "WooCommerce", shopify: "Shopify" };
export const platformLabel = (id: string) => PLATFORMS[id] ?? id;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDate(d: Date) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Now", "12 min ago", "3 h ago", "Yesterday", "Oct 28". */
export function ago(value: Date | string, now = Date.now()) {
  const d = new Date(value);
  const s = Math.max(0, (now - d.getTime()) / 1000);
  if (s < 60) return "Now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return "Yesterday";
  return shortDate(d);
}

/** "today", "Oct 30": the day a review version was shared. */
export function dayLabel(value: Date | string, now = Date.now()) {
  const d = new Date(value);
  return new Date(now).toDateString() === d.toDateString() ? "today" : shortDate(d);
}

export function seconds(ms: number) {
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s ? `${m} min ${s} s` : `${m} min`;
}

export function stepTime(step: Step) {
  if (!step.startedAt || !step.endedAt) return "";
  return seconds(new Date(step.endedAt).getTime() - new Date(step.startedAt).getTime());
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function errorsIn(group: CheckGroup) {
  return group.findings.filter((f) => f.severity === "error").length;
}

/** One status for a set of check groups: "42 passed", "2 failing", "1 warning". */
export function checksStatus(groups: CheckGroup[]): { tone: Tone; text: string } {
  const failing = groups.filter((g) => g.status === "fail");
  if (failing.length) {
    const n = failing.reduce((sum, g) => sum + Math.max(1, errorsIn(g)), 0);
    return { tone: "fail", text: `${n} failing` };
  }
  const warnings = groups.filter((g) => g.status === "warn").reduce((sum, g) => sum + Math.max(1, g.findings.length), 0);
  if (warnings) return { tone: "warn", text: plural(warnings, "warning") };
  const passed = groups.reduce((sum, g) => sum + g.passed, 0);
  return { tone: "pass", text: `${passed} passed` };
}

export interface BuildLike {
  status: "queued" | "running" | "pass" | "fail" | "cancelled";
  steps: Step[];
  checks: CheckGroup[];
}

function fixingCount(b: BuildLike) {
  return b.checks.filter((g) => g.status === "fail").flatMap((g) => g.findings).filter((f) => f.severity === "error").length;
}

/** The status line of a build: "Running checks", "Fixing 1 issue", "Passed". */
export function buildStatus(b: BuildLike): { tone: Tone; text: string } {
  if (b.status === "queued") return { tone: "idle", text: "Queued" };
  if (b.status === "cancelled") return { tone: "idle", text: "Cancelled" };
  if (b.status === "pass") return { tone: "pass", text: "Passed" };
  if (b.status === "fail") return { tone: "fail", text: "Failed" };
  const step = b.steps.find((s) => s.status === "running");
  if (step?.id === "autofix") return { tone: "run", text: `Fixing ${plural(Math.max(1, fixingCount(b)), "issue")}` };
  if (step?.id === "recheck") return { tone: "run", text: "Re-running checks" };
  if (step) return { tone: "run", text: step.id === "checks" ? "Running checks" : step.label };
  return { tone: "run", text: "Running" };
}

/** The checks column of the project list, from the last build. */
export function lastBuildChecks(b: BuildLike | null): { tone: Tone; text: string } {
  if (!b) return { tone: "idle", text: "Not built" };
  if (b.status === "queued" || b.status === "running") return { tone: "run", text: "Running" };
  if (b.status === "cancelled" && !b.checks.length) return { tone: "idle", text: "Cancelled" };
  if (!b.checks.length) return b.status === "fail" ? { tone: "fail", text: "Build failed" } : { tone: "idle", text: "No checks" };
  return checksStatus(b.checks);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

export const LABELS = { copy: "Copy", design: "Design", bug: "Bug", scope: "Needs quote" } as const;
export type LabelId = keyof typeof LABELS;

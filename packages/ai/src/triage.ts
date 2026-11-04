export type TriageLabel = "copy" | "design" | "bug" | "scope";

export interface Triage {
  label: TriageLabel;
  /** True when the request is outside the agreed scope and should be quoted. */
  needsQuote: boolean;
  source: "rules" | "model";
}

const RULES: [TriageLabel, RegExp][] = [
  ["scope", /\b(could|can) (we|you) (also |please )?(add|offer|have|include|support|build)\b|\bnew (page|feature|section)\b|\bgift ?wrap|\bsubscriptions?\b|\bloyalty\b|\bintegrat(e|ion) with\b/i],
  ["bug", /\b(broken|bug|error|crash|doesn'?t (work|load)|can'?t (click|add|pay|checkout|log ?in)|404|not working|fails?)\b/i],
  ["design", /\b(colou?r|photo|image|picture|font|dark|light|bigger|smaller|size|spacing|align|layout|looks?|contrast|hard to (read|see)|logo|icon)\b/i],
  ["copy", /\b(headline|heading|text|copy|word(ing)?|wording|says?|tone|typo|spelling|reads?|sentence|title)\b/i],
];

/** Label a client comment with keyword rules. Fast, free and good enough to sort a queue. */
export function triageByRules(body: string): Triage {
  for (const [label, re] of RULES) if (re.test(body)) return { label, needsQuote: label === "scope", source: "rules" };
  return { label: "design", needsQuote: false, source: "rules" };
}

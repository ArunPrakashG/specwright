import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { MODEL } from "./draft.ts";

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

const TriageSchema = z.object({
  label: z.enum(["copy", "design", "bug", "scope"]),
  needsQuote: z.boolean(),
});

/**
 * Label a client comment with the model when a key is configured, otherwise with rules.
 * Any API failure falls back to rules: triage must never block a comment.
 */
export async function triageComment(body: string, context: { specId: string; scope?: string }, client?: Anthropic): Promise<Triage> {
  if (!client && !process.env.ANTHROPIC_API_KEY) return triageByRules(body);
  try {
    const response = await (client ?? new Anthropic()).beta.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low", format: betaZodOutputFormat(TriageSchema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system:
        "You sort client feedback on a store design for the agency that built it. Labels: copy (wording), design (visual), bug (something broken), scope (a new feature or change outside what was agreed). needsQuote is true only for scope.",
      messages: [
        {
          role: "user",
          content: `Element: ${context.specId}\n${context.scope ? `Agreed scope: ${context.scope}\n` : ""}Comment: ${body}`,
        },
      ],
    });
    const parsed = response.parsed_output;
    if (response.stop_reason === "refusal" || !parsed) return triageByRules(body);
    return { label: parsed.label, needsQuote: parsed.needsQuote || parsed.label === "scope", source: "model" };
  } catch {
    return triageByRules(body);
  }
}

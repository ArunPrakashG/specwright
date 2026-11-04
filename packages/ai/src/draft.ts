import Anthropic from "@anthropic-ai/sdk";
import { specJsonSchema, validateSpec, type Issue, type SiteSpec } from "@specwright/spec";
import { sections, sectionTypes } from "@specwright/sections";

export const MODEL = "claude-opus-5-5";
// Re-runs a declined request on a fallback model inside the same call.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

export interface Draft {
  spec: SiteSpec;
  /** Illustrations the spec references, keyed by spec-relative path. */
  assets: Record<string, string>;
  attempts: number;
}

const SYSTEM = `You draft Site Specs for Specwright. A Site Spec is a platform-neutral JSON description of an online store: design tokens, pages made of sections, the catalogue, markets, integration goals and policies. Adapters turn it into WooCommerce or Shopify stores, so it must never contain platform code.

Reply with exactly one JSON object and nothing else: {"spec": <Site Spec>, "assets": [{"path": "images/<name>.svg", "svg": "<svg ...>...</svg>"}]}.

Rules:
- Follow the JSON Schema below exactly. specVersion is "1", revision is 1.
- Sections available (type: settings): ${Object.values(sections).map((s) => `${s.type} (${s.label})`).join(", ")}. The home page (path "/") starts with a header section and ends with a footer section; other pages share them.
- Colours: tokens.color must define bg, ink, ink-2, line, primary, on-primary, accent, on-accent, surface, plus any extra named colours you use (tile backgrounds, field-border). Every text colour must reach 4.5:1 contrast on bg; on-primary and on-accent must reach 4.5:1 on primary and accent.
- Fonts: pick one heading and one body family available on Google Fonts.
- Images: every image src must be "images/<name>.svg" and you must supply that SVG in assets. Keep illustrations simple and flat: a viewBox, a few shapes in the token colours, transparent background (set "background" on the image to a token name for the tile colour). No text, scripts, links, external references or event attributes.
- Prices are integer minor units. Give every product a price in every market currency. Products with options need variants covering each combination.
- Only write facts that are in the brief or are reasonable defaults for a small store. Policies are short, plain and conservative. Do not invent awards, reviews or claims.
- Plain, concrete copy. No marketing superlatives.

JSON Schema:
`;

function sectionHints() {
  return Object.values(sections)
    .map((s) => `${s.type}: ${JSON.stringify(Object.keys((s.settings as any).shape ?? {}))}`)
    .join("\n");
}

/** Accept only inert SVG: no scripts, event handlers, foreign objects or external references. */
export function safeSvg(svg: string): string | null {
  const s = svg.trim();
  if (!/^<svg[\s>]/i.test(s) || !/<\/svg>$/i.test(s) || s.length > 20000) return null;
  if (/<script|<foreignObject|\son\w+\s*=|javascript:|<!entity|<!doctype|(?:xlink:)?href\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i.test(s)) return null;
  return s.includes("xmlns=") ? s : s.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
}

function parseReply(text: string): { spec?: unknown; assets?: { path: string; svg: string }[] } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The model did not return JSON");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Turn a client brief into a validated spec. Validation issues go back to the model,
 * up to `maxRepairs` times; the conversation is append-only.
 */
export async function draftSpec(brief: string, o: { client?: Anthropic; maxRepairs?: number; onProgress?(message: string): void } = {}): Promise<Draft> {
  const client = o.client ?? new Anthropic();
  const system = SYSTEM + JSON.stringify(specJsonSchema()) + `\n\nSection settings keys:\n${sectionHints()}`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: `Client brief:\n\n${brief}` }];
  const maxRepairs = o.maxRepairs ?? 2;

  for (let attempt = 1; attempt <= maxRepairs + 1; attempt++) {
    o.onProgress?.(attempt === 1 ? "Drafting the spec" : `Fixing ${attempt - 1 === 1 ? "issues" : "remaining issues"}`);
    const response = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 64000,
        output_config: { effort: "medium" },
        system,
        messages,
        ...FALLBACK,
      })
      .finalMessage();
    if (response.stop_reason === "refusal") throw new Error(`The model declined to draft this brief${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : ""}`);
    if (response.stop_reason === "max_tokens") throw new Error("The draft was cut off. Try a shorter brief.");
    messages.push({ role: "assistant", content: response.content });
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");

    let issues: Issue[];
    try {
      const reply = parseReply(text);
      const assets: Record<string, string> = {};
      const assetIssues: Issue[] = [];
      for (const a of reply.assets ?? []) {
        const svg = safeSvg(a.svg);
        if (!/^images\/[a-z0-9-]+\.svg$/.test(a.path) || !svg) assetIssues.push({ path: `assets.${a.path}`, message: "Unsafe or malformed SVG, or a bad path", severity: "error" });
        else assets[a.path] = svg;
      }
      const result = validateSpec(reply.spec, sectionTypes);
      const missing = result.ok ? referencedImages(result.spec).filter((src) => !(src in assets)) : [];
      missing.forEach((src) => assetIssues.push({ path: "assets", message: `No SVG supplied for ${src}`, severity: "error" }));
      if (result.ok && !assetIssues.length) return { spec: result.spec, assets, attempts: attempt };
      issues = [...result.issues.filter((i) => i.severity === "error"), ...assetIssues];
    } catch (error) {
      issues = [{ path: "", message: error instanceof Error ? error.message : String(error), severity: "error" }];
    }
    messages.push({
      role: "user",
      content: `The draft has these problems. Reply with the whole corrected JSON object.\n${issues.map((i) => `- ${i.path || "(root)"}: ${i.message}`).join("\n")}`,
    });
  }
  throw new Error("Could not produce a valid spec. Try a more specific brief.");
}

function referencedImages(spec: SiteSpec) {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.src === "string") out.add(o.src);
      Object.values(o).forEach(walk);
    }
  };
  walk(spec.pages);
  walk(spec.catalog.products);
  return [...out];
}

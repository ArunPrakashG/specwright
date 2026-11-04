import { readSpec, specAt, type Project } from "@specwright/db";
import { sections, sectionTypes, specTree, type SpecNode } from "@specwright/sections";
import { validateSpec, type Issue, type SiteSpec } from "@specwright/spec";

export async function loadSpec(project: Project, revision?: number) {
  let raw: unknown;
  if (revision && revision !== project.revision) raw = await specAt(project.id, revision);
  raw ??= await readSpec(project.slug).catch(() => undefined);
  if (raw === undefined) return { raw: undefined, spec: undefined, issues: [{ path: "", message: "spec.json is missing", severity: "error" } as Issue] };
  const result = validateSpec(raw, sectionTypes);
  return { raw: raw as Record<string, any>, spec: result.ok ? result.spec : undefined, issues: result.issues };
}

export function pageForPath(spec: SiteSpec, path: string) {
  const clean = (p: string) => p.replace(/\/+$/, "") || "/";
  return spec.pages.find((p) => clean(p.path) === clean(path));
}

export type FieldKind = "text" | "long" | "color" | "number" | "boolean";
export interface Field {
  key: string;
  /** Path inside the section's settings. */
  path: (string | number)[];
  label: string;
  kind: FieldKind;
  value: string | number | boolean;
}

export interface Inspect {
  pageId: string;
  sectionId: string;
  typeLabel: string;
  fields: Field[];
  note?: string;
  woo: string;
  shop: string;
}

type Z = { _zod: { def: any }; shape?: Record<string, Z> };
const def = (s: Z) => s._zod.def;
function unwrap(s: Z): Z {
  let cur = s;
  while (["optional", "default", "nullable", "prefault"].includes(def(cur).type)) cur = def(cur).innerType;
  return cur;
}

const NAMES: Record<string, string> = { limit: "Products shown", showCart: "Show cart", imageFirst: "Image first", featured: "Featured only" };
const LONG = new Set(["lead", "body"]);
const human = (key: string) => NAMES[key] ?? (key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/^./, (c) => c.toUpperCase()));

function fieldsOf(schema: Z, value: unknown, path: (string | number)[], label: string, out: Field[]) {
  const s = unwrap(schema);
  const type = def(s).type;
  const key = path[path.length - 1];
  const add = (kind: FieldKind, v: string | number | boolean, p = path, l = label) => out.push({ key: p.join("."), path: p, label: l, kind, value: v });
  if (value === undefined || value === null) return;
  if (type === "string") {
    if (typeof value === "string") add(LONG.has(String(key)) || value.length > 90 ? "long" : "text", value);
  } else if (type === "number") {
    if (typeof value === "number") add("number", value);
  } else if (type === "boolean") {
    if (typeof value === "boolean") add("boolean", value);
  } else if (type === "union") {
    const options: Z[] = def(s).options;
    const localized = options.some((o) => def(unwrap(o)).type === "record");
    const long = LONG.has(String(key));
    if (!localized) {
      if (typeof value === "string") add("color", value);
    } else if (typeof value === "string") {
      add(long || value.length > 90 ? "long" : "text", value);
    } else if (value && typeof value === "object") {
      for (const [locale, text] of Object.entries(value as Record<string, unknown>)) {
        if (typeof text === "string") add(long || text.length > 90 ? "long" : "text", text, [...path, locale], `${label} · ${locale}`);
      }
    }
  } else if (type === "object" && s.shape && value && typeof value === "object") {
    for (const [k, child] of Object.entries(s.shape)) {
      const sub = k === "label" ? `${label} label` : k === "href" ? (label === "Link" ? "Link URL" : `${label} link`) : k === "src" ? label : k === "alt" ? `${label} alt text` : `${label} ${human(k).toLowerCase()}`;
      fieldsOf(child, (value as Record<string, unknown>)[k], [...path, k], sub, out);
    }
  } else if (type === "array" && Array.isArray(value)) {
    const element: Z = def(s).element;
    value.forEach((item, i) => {
      const base = `${label === "Links" ? "Link" : label} ${i + 1}`;
      if (def(unwrap(element)).type === "object" && item && typeof item === "object") {
        for (const [k, child] of Object.entries(unwrap(element).shape ?? {})) {
          fieldsOf(child, (item as Record<string, unknown>)[k], [...path, i, k], k === "label" ? base : k === "href" ? `${base} URL` : `${base} ${human(k).toLowerCase()}`, out);
        }
      } else fieldsOf(element, item, [...path, i], base, out);
    });
  }
}

const PART_ALIAS: Record<string, string> = { cta: "button", nav: "links" };
const PART_LABEL: Record<string, string> = {
  brand: "Brand",
  nav: "Menu",
  lead: "Lead",
  cta: "Button",
  image: "Image",
  body: "Body",
  link: "Link",
  input: "Email field",
  button: "Button",
  address: "Address",
  links: "Links",
};

export function targetsFor(pageId: string, sectionId: string, type: string) {
  const woo = type === "header" ? "parts/header.html" : type === "footer" ? "parts/footer.html" : `patterns/${pageId}-${sectionId}.php`;
  return { woo, shop: `sections/${type}.liquid` };
}

/** Inspector data for every spec id on every page, keyed by spec id. */
export function inspectAll(spec: SiteSpec, raw: Record<string, any>): Record<string, Inspect> {
  const out: Record<string, Inspect> = {};
  spec.pages.forEach((page, pi) => {
    page.sections.forEach((section, si) => {
      const sd = sections[section.type];
      if (!sd) return;
      const settings = raw.pages?.[pi]?.sections?.[si]?.settings ?? {};
      const shape = ((sd.settings as unknown as Z).shape ?? {}) as Record<string, Z>;
      const base = `${page.id}.${section.id}`;
      const targets = targetsFor(page.id, section.id, section.type);
      const all: Field[] = [];
      for (const [k, schema] of Object.entries(shape)) fieldsOf(schema, settings[k], [k], human(k), all);
      out[base] = { pageId: page.id, sectionId: section.id, typeLabel: sd.label, fields: all, ...targets };

      for (const node of specTree(spec, page.id).filter((n) => n.id.startsWith(`${base}.`))) {
        const part = node.id.slice(base.length + 1);
        const head = part.split(".")[0]!;
        const name = PART_ALIAS[head] ?? head;
        const fields: Field[] = [];
        for (const [k, schema] of Object.entries(shape)) {
          if (k === name || (k.startsWith(name) && /^[A-Z]/.test(k.slice(name.length)))) {
            fieldsOf(schema, settings[k], [k], k === name && def(unwrap(schema)).type === "union" ? "Text" : human(k), fields);
          }
        }
        let typeLabel = PART_LABEL[head] ?? human(head);
        let note: string | undefined;
        if (head === "heading") typeLabel = section.type === "hero" || section.type === "rich-text" ? "Heading 1" : "Heading 2";
        const card = /^card-(\d+)/.exec(part);
        if (card) {
          typeLabel = part.endsWith(".image") ? "Product image" : "Product card";
          note = "Products come from the catalog in the spec. This card shows the next product in the grid's category.";
        } else if (!fields.length) note = `This part has no settings of its own. Select ${base} to edit the section.`;
        out[node.id] = { pageId: page.id, sectionId: section.id, typeLabel, fields, note, ...targets };
      }
    });
  });
  return out;
}

export interface PageTree {
  id: string;
  title: string;
  path: string;
  nodes: SpecNode[];
}

export function pageTrees(spec: SiteSpec): PageTree[] {
  return spec.pages.map((p) => ({ id: p.id, title: p.title, path: p.path, nodes: specTree(spec, p.id) }));
}

export function locales(spec: SiteSpec) {
  return [...new Set(spec.markets.flatMap((m) => m.locales))];
}

/** Apply inspector edits to a raw spec and validate the result. */
export function applyEdits(raw: Record<string, any>, pageId: string, sectionId: string, edits: { path: (string | number)[]; value: unknown }[]) {
  const pi = (raw.pages ?? []).findIndex((p: any) => p?.id === pageId);
  const si = pi < 0 ? -1 : raw.pages[pi].sections.findIndex((s: any) => s?.id === sectionId);
  if (si < 0) return { issues: [{ path: "", message: `No section ${pageId}.${sectionId}`, severity: "error" } as Issue] };
  const section = raw.pages[pi].sections[si];
  for (const e of edits) {
    if (!e.path.length || e.path.some((k) => typeof k === "string" && (k === "__proto__" || k === "constructor" || k === "prototype"))) {
      return { issues: [{ path: "", message: "Invalid field", severity: "error" } as Issue] };
    }
    let node = section.settings;
    for (const k of e.path.slice(0, -1)) {
      if (node == null || typeof node !== "object" || !(k in node)) return { issues: [{ path: e.path.join("."), message: "Unknown field", severity: "error" } as Issue] };
      node = node[k];
    }
    const last = e.path[e.path.length - 1]!;
    if (node == null || typeof node !== "object" || !(last in node)) return { issues: [{ path: e.path.join("."), message: "Unknown field", severity: "error" } as Issue] };
    if (typeof node[last] !== typeof e.value) return { issues: [{ path: e.path.join("."), message: "Wrong value type", severity: "error" } as Issue] };
    node[last] = e.value;
  }
  const sd = sections[section.type];
  const parsed = sd?.settings.safeParse(section.settings);
  if (parsed && !parsed.success) {
    return { issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message, severity: "error" }) as Issue) };
  }
  const result = validateSpec(raw, sectionTypes);
  const prefix = `pages.${pi}.sections.${si}.settings.`;
  const issues = result.issues.filter((i) => i.severity === "error").map((i) => ({ ...i, path: i.path.startsWith(prefix) ? i.path.slice(prefix.length) : i.path }));
  return { issues, ok: result.ok };
}

/** The top-level settings of a section type, as readable names. */
export function settingNames(type: string) {
  const s = unwrap(sections[type]!.settings as unknown as Z);
  return Object.keys(s.shape ?? {}).map(human);
}

/** Serialize block attributes the way WordPress does, so the comment delimiter can never be closed early. */
export function attrs(value: Record<string, unknown>) {
  return JSON.stringify(value)
    .replace(/--/g, "\\u002d\\u002d")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\\"/g, "\\u0022");
}

/**
 * One block in serialized form. Core blocks drop the `core/` prefix like WordPress does.
 * Without `inner` the block is void (`<!-- wp:name /-->`).
 */
export function block(name: string, a: Record<string, unknown> | null = null, inner?: string) {
  const n = name.replace(/^core\//, "");
  const json = a && Object.keys(a).length ? ` ${attrs(a)}` : "";
  if (inner === undefined) return `<!-- wp:${n}${json} /-->`;
  return `<!-- wp:${n}${json} -->\n${inner}\n<!-- /wp:${n} -->`;
}

export const join = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join("\n");

/** A group block rendered as `<tag class="wp-block-group …">`. */
export function group(className: string, inner: string, o: { tag?: string; anchor?: string; extra?: string } = {}) {
  const tag = o.tag ?? "div";
  const a: Record<string, unknown> = {};
  if (tag !== "div") a.tagName = tag;
  if (o.anchor) a.anchor = o.anchor;
  if (className) a.className = className;
  a.layout = { type: "default" };
  const id = o.anchor ? ` id="${o.anchor}"` : "";
  const classes = ["wp-block-group", className].filter(Boolean).join(" ");
  return block("group", a, `<${tag}${id} class="${classes}"${o.extra ?? ""}>\n${inner}\n</${tag}>`);
}

export function heading(level: number, className: string, html: string, anchor?: string) {
  const a: Record<string, unknown> = {};
  if (level !== 2) a.level = level;
  if (anchor) a.anchor = anchor;
  if (className) a.className = className;
  const id = anchor ? ` id="${anchor}"` : "";
  return block("heading", a, `<h${level}${id} class="wp-block-heading ${className}">${html}</h${level}>`);
}

export function paragraph(className: string, html: string) {
  return block("paragraph", className ? { className } : null, `<p${className ? ` class="${className}"` : ""}>${html}</p>`);
}

export function list(className: string, items: string[]) {
  const li = items.map((html) => block("list-item", null, `<li>${html}</li>`)).join("\n");
  return block("list", className ? { className } : null, `<ul class="wp-block-list${className ? ` ${className}` : ""}">\n${li}\n</ul>`);
}

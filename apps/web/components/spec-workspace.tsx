"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Field, Inspect, PageTree } from "@/lib/spec";
import { saveEdits, type Edit } from "@/app/actions";
import { PreviewFrame } from "./preview-frame";

interface Market {
  id: string;
  name: string;
  currency: string;
  locales: string[];
  primary: boolean;
}

interface Props {
  slug: string;
  revision: number;
  pages: PageTree[];
  markets: Market[];
  inspect: Record<string, Inspect>;
  colors: Record<string, string>;
  locales: string[];
  built: { number: number; revision: number } | null;
  platform: string;
}

const sectionOf = (id: string) => id.split(".").slice(0, 2).join(".");
const h2 = { margin: 0, padding: "0 8px", fontSize: 13, fontWeight: 500, color: "var(--sw-text-3)" } as const;

function firstSelection(page: PageTree) {
  return (page.nodes.find((n) => n.depth === 1 && n.type !== "header") ?? page.nodes[0])?.id ?? "";
}

export function SpecWorkspace(p: Props) {
  const router = useRouter();
  const [pageId, setPageId] = useState(p.pages.find((x) => x.path === "/")?.id ?? p.pages[0]!.id);
  const page = p.pages.find((x) => x.id === pageId) ?? p.pages[0]!;
  const [sel, setSel] = useState(() => firstSelection(page));
  const [mobile, setMobile] = useState(false);
  const [market, setMarket] = useState((p.markets.find((m) => m.primary) ?? p.markets[0])!.id);
  const [drafts, setDrafts] = useState<Record<string, Edit>>({});
  const [result, setResult] = useState<{ error?: string; saved?: number; issues?: Record<string, string> }>({});
  const [saving, startSave] = useTransition();

  const info = p.inspect[sel];
  const open = sectionOf(sel);
  const dirty = Object.keys(drafts).length;

  const pick = (id: string) => {
    if (!p.inspect[id]) return;
    setSel(id);
    if (!page.nodes.some((n) => n.id === id)) {
      const owner = p.pages.find((x) => x.nodes.some((n) => n.id === id));
      if (owner) setPageId(owner.id);
    }
  };

  const showPage = (id: string) => {
    const next = p.pages.find((x) => x.id === id);
    if (!next) return;
    setPageId(id);
    setSel(firstSelection(next));
  };

  const save = () =>
    startSave(async () => {
      const r = await saveEdits(p.slug, p.revision, Object.values(drafts)).catch((e: Error) => ({ error: e.message, revision: undefined, issues: undefined }));
      if (r.revision) {
        setDrafts({});
        setResult({ saved: r.revision });
        router.refresh();
      } else {
        const issues: Record<string, string> = {};
        for (const i of r.issues ?? []) if (i.key) issues[i.key] = i.message;
        setResult({ error: r.error ?? "Not saved.", issues });
      }
    });

  const src = `/preview/${encodeURIComponent(p.slug)}/${encodeURIComponent(page.id)}?market=${encodeURIComponent(market)}&rev=${p.revision}`;

  return (
    <main id="main" className="sw-wrap" style={{ display: "flex", flexWrap: "wrap", gap: 24, paddingTop: 24, paddingBottom: 48, alignItems: "flex-start" }}>
      <aside aria-label="Spec" style={{ flex: "1 1 220px", maxWidth: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={h2}>Pages</h2>
          <ul className="sw-tree">
            {p.pages.map((pg) => (
              <PageItems key={pg.id} page={pg} current={pg.id === page.id} sel={sel} open={open} onPage={showPage} onPick={pick} />
            ))}
          </ul>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={h2}>Markets</h2>
          <ul className="sw-tree">
            {p.markets.map((m) => (
              <li key={m.id}>
                <button type="button" aria-pressed={m.id === market} onClick={() => setMarket(m.id)}>
                  <span>{m.name}</span>
                  <span style={{ fontFamily: "var(--sw-font-mono)", fontSize: 12, color: "var(--sw-text-3)" }}>
                    {m.currency} · {m.locales.join(" ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section aria-label="Reference render" style={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div className="sw-seg" role="group" aria-label="Viewport">
            <button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button>
            <button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}>Mobile</button>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--sw-text-2)" }}>
            Market
            <select className="sw-input" style={{ width: "auto", height: 32, fontSize: 13 }} value={market} onChange={(e) => setMarket(e.target.value)}>
              {p.markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.currency}
                </option>
              ))}
            </select>
          </label>
        </div>
        <PreviewFrame src={src} title={`${page.title}, reference render`} mobile={mobile} select={sel} clickSelects onSelect={pick} />
      </section>

      <aside aria-labelledby="insp" style={{ flex: "1 1 280px", maxWidth: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="sw-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="sw-tag" style={{ alignSelf: "flex-start", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{sel}</span>
            <h2 id="insp" style={{ margin: 0, fontSize: 16, lineHeight: "24px", fontWeight: 600 }}>{info?.typeLabel ?? "Nothing selected"}</h2>
          </div>
          {info?.note && <p className="sw-hint">{info.note}</p>}
          {info?.fields.map((f) => {
            const k = `${info.pageId}.${info.sectionId}|${f.key}`;
            return (
              <FieldInput
                key={`${sel}|${f.key}`}
                id={`f-${sel}-${f.key}`.replace(/[^a-zA-Z0-9-]+/g, "-")}
                field={f}
                value={drafts[k]?.value ?? f.value}
                error={result.issues?.[k]}
                colors={p.colors}
                onChange={(value) => {
                  setResult({});
                  setDrafts((d) => {
                    const next = { ...d };
                    if (value === f.value) delete next[k];
                    else next[k] = { pageId: info.pageId, sectionId: info.sectionId, path: f.path, value };
                    return next;
                  });
                }}
              />
            );
          })}
          {(dirty > 0 || result.saved || result.error) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
              {result.error && <p className="sw-error" role="alert">{result.error}</p>}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span role="status" style={{ fontSize: 13, color: "var(--sw-text-3)" }}>
                  {dirty > 0 ? `${dirty} unsaved ${dirty === 1 ? "change" : "changes"}` : result.saved ? <span className="sw-status is-pass">Saved as spec v{result.saved}</span> : ""}
                </span>
                {dirty > 0 && (
                  <span style={{ display: "flex", gap: 8 }}>
                    <button className="sw-btn sw-btn--ghost" type="button" onClick={() => (setDrafts({}), setResult({}))} disabled={saving}>Discard</button>
                    <button className="sw-btn sw-btn--primary" type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        {info && (
          <div className="sw-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Targets</h3>
            <Target name="WooCommerce" file={info.woo} tone={p.built ? "pass" : "idle"} status={p.built ? "Built" : "Not built"} />
            <Target name="Shopify" file={info.shop} tone="idle" status="Not enabled" />
          </div>
        )}
      </aside>
    </main>
  );
}

function PageItems({ page, current, sel, open, onPage, onPick }: { page: PageTree; current: boolean; sel: string; open: string; onPage(id: string): void; onPick(id: string): void }) {
  const nodes = useMemo(() => page.nodes.filter((n) => n.depth === 1 || sectionOf(n.id) === open), [page.nodes, open]);
  return (
    <>
      <li>
        <button type="button" aria-pressed={false} aria-current={current ? "page" : undefined} style={current ? { color: "var(--sw-text)", fontWeight: 500 } : undefined} onClick={() => onPage(page.id)}>
          {page.title}
        </button>
      </li>
      {current &&
        nodes.map((n) => (
          <li key={n.id}>
            <button type="button" className={n.depth > 1 ? "sw-d2" : "sw-d1"} aria-pressed={sel === n.id} onClick={() => onPick(n.id)} title={n.id}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.label}</span>
            </button>
          </li>
        ))}
    </>
  );
}

function Target({ name, file, tone, status }: { name: string; file: string; tone: "pass" | "idle"; status: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 14 }}>{name}</span>
        <span style={{ fontFamily: "var(--sw-font-mono)", fontSize: 12, color: "var(--sw-text-3)", overflowWrap: "break-word" }}>
          {file.split("/").map((part, i, all) => (
            <span key={i}>
              {part}
              {i < all.length - 1 && <>/<wbr /></>}
            </span>
          ))}
        </span>
      </div>
      <span className={`sw-status is-${tone}`}>{status}</span>
    </div>
  );
}

function FieldInput({ id, field, value, error, colors, onChange }: { id: string; field: Field; value: string | number | boolean; error?: string; colors: Record<string, string>; onChange(v: string | number | boolean): void }) {
  const err = error ? `${id}-err` : undefined;
  if (field.kind === "boolean") {
    return (
      <label htmlFor={id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--sw-text-2)", minHeight: 24 }}>
        <input id={id} className="sw-check" type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }
  const swatch = field.kind === "color" ? (String(value).startsWith("token:") ? colors[String(value).slice(6)] : /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : undefined) : undefined;
  return (
    <div className="sw-field">
      <label htmlFor={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {field.label}
        {field.kind === "color" && <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: "var(--sw-radius-sm)", border: "1px solid var(--sw-border-strong)", background: swatch ?? "transparent" }} />}
      </label>
      {field.kind === "long" ? (
        <textarea id={id} className="sw-input" rows={3} value={String(value)} aria-invalid={!!error} aria-describedby={err} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          id={id}
          className="sw-input"
          type={field.kind === "number" ? "number" : "text"}
          value={String(value)}
          spellCheck={field.kind === "text"}
          style={field.kind === "color" ? { fontFamily: "var(--sw-font-mono)", fontSize: 13 } : undefined}
          aria-invalid={!!error}
          aria-describedby={err ?? (field.kind === "color" ? `${id}-hint` : undefined)}
          onChange={(e) => onChange(field.kind === "number" ? Number(e.target.value) : e.target.value)}
        />
      )}
      {field.kind === "color" && !error && <p id={`${id}-hint`} className="sw-hint">A hex colour like #22201C, or a token like token:ink.</p>}
      {error && <p id={err} className="sw-error">{error}</p>}
    </div>
  );
}

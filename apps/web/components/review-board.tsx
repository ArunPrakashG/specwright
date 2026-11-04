"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { agencyReply, setCommentLabel, setCommentStatus } from "@/app/actions";
import { ago, dayLabel, initials, LABELS, type LabelId } from "@/lib/format";
import type { Thread, VersionJson } from "@/lib/serialize";
import { PreviewFrame } from "./preview-frame";

export interface ReviewPage {
  id: string;
  title: string;
  path: string;
  ids: string[];
}

interface Props {
  role: "client" | "agency";
  agency: string;
  projectName: string;
  slug?: string;
  token?: string;
  versions: VersionJson[];
  pages: ReviewPage[];
  threads: Thread[];
  reviewer?: string;
}

const STATUS = {
  open: { cls: "sw-status is-run", text: () => "Open" },
  "quote-sent": { cls: "sw-status is-warn", text: () => "Quote sent" },
  resolved: { cls: "sw-status is-pass", text: (t: Thread) => (t.resolved_in ? `Resolved in v${t.resolved_in}` : "Resolved") },
} as const;

const plain = { appearance: "none", background: "none", border: 0, padding: 0, margin: 0, width: "100%", color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer" } as const;

async function post(url: string, data: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error ?? "Something went wrong. Try again.");
  return out;
}

export function ReviewBoard(p: Props) {
  const router = useRouter();
  const [vn, setVn] = useState(p.versions[0]?.n ?? 0);
  const version = p.versions.find((v) => v.n === vn) ?? p.versions[0]!;
  const [pageId, setPageId] = useState(p.pages.find((x) => x.path === "/")?.id ?? p.pages[0]!.id);
  const page = p.pages.find((x) => x.id === pageId) ?? p.pages[0]!;
  const onPage = useMemo(() => p.threads.filter((t) => t.page_id === page.id), [p.threads, page.id]);
  const [active, setActive] = useState(() => (onPage.find((t) => t.status !== "resolved") ?? onPage[0] ?? p.threads[0])?.n ?? 0);
  const [mobile, setMobile] = useState(false);
  const [pick, setPick] = useState(false);
  const [picked, setPicked] = useState("");
  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<{ where: string; message: string } | null>(null);
  const [busy, start] = useTransition();
  const approveRef = useRef<HTMLDialogElement>(null);

  const isClient = p.role === "client";
  const activeThread = p.threads.find((t) => t.n === active);
  const open = p.threads.filter((t) => t.status !== "resolved").length;
  const resolved = p.threads.length - open;
  const needName = isClient && !p.reviewer;

  const src = isClient
    ? `/r/${p.token}/preview/${encodeURIComponent(page.id)}?v=${version.n}`
    : `/preview/${encodeURIComponent(p.slug!)}/${encodeURIComponent(page.id)}?rev=${version.revision}`;

  const pins = onPage.map((t) => ({ n: t.n!, id: t.spec_id, done: t.status === "resolved", active: t.n === active }));
  const select = picked || (activeThread?.page_id === page.id ? activeThread.spec_id : "");

  const choose = (n: number) => {
    const t = p.threads.find((x) => x.n === n);
    if (t && t.page_id !== pageId && p.pages.some((x) => x.id === t.page_id)) setPageId(t.page_id);
    setActive(n);
    setPicked("");
    setReply("");
    setError(null);
  };
  const navigate = (path: string) => {
    const clean = (s: string) => s.replace(/\/+$/, "") || "/";
    const next = p.pages.find((x) => clean(x.path) === clean(path));
    if (next) showPage(next.id);
  };
  const showPage = (id: string) => {
    setPageId(id);
    setPicked("");
    const first = p.threads.find((t) => t.page_id === id && t.status !== "resolved") ?? p.threads.find((t) => t.page_id === id);
    if (first) setActive(first.n!);
  };

  const run = (where: string, fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError({ where, message: e instanceof Error ? e.message : "Something went wrong." });
      }
    });

  const sendComment = (e: React.FormEvent) => {
    e.preventDefault();
    run("composer", async () => {
      const out = await post(`/api/v1/r/${p.token}/comments`, { body: draft, spec_id: picked, page_id: page.id, version: version.n, viewport: mobile ? "mobile" : "desktop", author_name: needName ? name : undefined });
      setDraft("");
      setPicked("");
      if (out.comment?.n) setActive(out.comment.n);
    });
  };

  const sendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThread) return;
    run("reply", async () => {
      if (isClient) await post(`/api/v1/r/${p.token}/comments`, { body: reply, parent_id: activeThread.id, author_name: needName ? name : undefined });
      else {
        const r = await agencyReply(p.slug!, activeThread.id, reply);
        if (r?.error) throw new Error(r.error);
      }
      setReply("");
    });
  };

  const approve = (e: React.FormEvent) => {
    e.preventDefault();
    run("approve", async () => {
      await post(`/api/v1/r/${p.token}/approve`, { version: version.n, author_name: needName ? name : undefined });
      approveRef.current?.close();
    });
  };

  const nameField = (id: string) =>
    needName && (
      <div className="sw-field">
        <label htmlFor={id}>Your name</label>
        <input id={id} className="sw-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={80} />
      </div>
    );

  const versionSelect = (
    <label style={{ display: "flex", alignItems: "center" }}>
      <span className="sw-sr">Version</span>
      <select className="sw-input" style={{ width: "auto", height: 32, fontSize: 13 }} value={version.n} onChange={(e) => (setVn(Number(e.target.value)), setPicked(""))}>
        {p.versions.map((v) => (
          <option key={v.n} value={v.n} suppressHydrationWarning>
            v{v.n} · {dayLabel(v.created_at)}
            {v.approved_at ? " · approved" : ""}
          </option>
        ))}
      </select>
    </label>
  );
  const viewport = (
    <div className="sw-seg" role="group" aria-label="Viewport">
      <button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button>
      <button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}>Mobile</button>
    </div>
  );

  return (
    <>
      {isClient ? (
        <header style={{ background: "var(--sw-surface)", borderBottom: "1px solid var(--sw-border)" }}>
          <a className="sw-btn sw-btn--secondary sw-skip" href="#comments">Skip to comments</a>
          <div className="sw-wrap sw-bar" style={{ justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px", minWidth: 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 6, background: "var(--sw-text)", color: "var(--sw-bg)", fontSize: 13, fontWeight: 600 }}>
                  {initials(p.agency).slice(0, 1)}
                </span>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{p.agency}</span>
              </span>
              <span aria-hidden="true" style={{ color: "var(--sw-border-strong)" }}>/</span>
              <h1 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
                {p.projectName} · {page.title}
              </h1>
              {versionSelect}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
              {viewport}
              <button className="sw-btn sw-btn--secondary" type="button" aria-pressed={pick} onClick={() => (setPick(!pick), setPicked(""))}>
                {pick ? "Cancel comment" : "Comment"}
              </button>
              {version.approved_at ? (
                <>
                  <button className="sw-btn sw-btn--primary" type="button" disabled>Approve v{version.n}</button>
                  <span className="sw-status is-pass">Approved</span>
                </>
              ) : (
                <button className="sw-btn sw-btn--primary" type="button" onClick={() => approveRef.current?.showModal()}>Approve v{version.n}</button>
              )}
              {p.reviewer && (
                <span role="img" aria-label={`Reviewing as ${p.reviewer}`} title={p.reviewer} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", background: "var(--sw-surface-2)", fontSize: 12, fontWeight: 600 }}>
                  {initials(p.reviewer)}
                </span>
              )}
            </div>
          </div>
        </header>
      ) : null}

      <main id="main" className="sw-wrap" style={{ display: "flex", flexWrap: "wrap", gap: 24, paddingTop: isClient ? 24 : 0, paddingBottom: 48, alignItems: "flex-start" }}>
        {!isClient && (
          <div style={{ flexBasis: "100%", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px" }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{page.title}</span>
              {versionSelect}
              {version.approved_at && <span className="sw-status is-pass">Approved by {version.approved_by}</span>}
            </div>
            {viewport}
          </div>
        )}

        <section aria-label="Page preview" style={{ flex: "999 1 560px", minWidth: 0 }}>
          <PreviewFrame
            variant="review"
            src={src}
            title={`${p.projectName}, ${page.title}, version ${version.n}`}
            mobile={mobile}
            select={select}
            pins={pins}
            pick={pick}
            onPin={(n) => choose(n)}
            onPick={(id) => (setPicked(id), setPick(false))}
            onCancel={() => setPick(false)}
            onNavigate={navigate}
          />
        </section>

        <aside aria-labelledby="comments" style={{ flex: "1 1 340px", maxWidth: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <h2 id="comments" tabIndex={-1} style={{ margin: 0, fontSize: 16, lineHeight: "24px", fontWeight: 600 }}>Comments</h2>
            <span style={{ fontSize: 13, color: "var(--sw-text-3)" }}>
              {open} open · {resolved} resolved
            </span>
          </div>

          {isClient && pick && (
            <div className="sw-card" role="status" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 14, lineHeight: "20px" }}>Click the part of the page you want to comment on.</span>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--sw-text-2)" }}>
                Or choose it from the list
                <select className="sw-input" defaultValue="" onChange={(e) => e.target.value && (setPicked(e.target.value), setPick(false))}>
                  <option value="" disabled>Choose an element</option>
                  {page.ids.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {isClient && picked && (
            <form className="sw-card" onSubmit={sendComment} style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, borderColor: "var(--sw-accent)" }}>
              <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span className="sw-tag sw-rise">{picked}</span>
                <button className="sw-btn sw-btn--ghost" type="button" onClick={() => setPick(true)}>Change</button>
              </span>
              <label htmlFor="new-comment" style={{ fontSize: 13, fontWeight: 500, color: "var(--sw-text-2)" }}>New comment</label>
              <textarea id="new-comment" className="sw-input" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} required maxLength={4000} autoFocus />
              {nameField("new-name")}
              {error?.where === "composer" && <p className="sw-error" role="alert">{error.message}</p>}
              <span style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="sw-btn sw-btn--ghost" type="button" onClick={() => setPicked("")}>Cancel</button>
                <button className="sw-btn sw-btn--primary" type="submit" disabled={busy || !draft.trim() || (needName && !name.trim())}>{busy ? "Sending…" : "Send"}</button>
              </span>
            </form>
          )}

          {!p.threads.length && !picked && (
            <p className="sw-card" style={{ margin: 0, padding: "14px 16px", fontSize: 14, lineHeight: "20px", color: "var(--sw-text-2)" }}>
              {isClient ? "No comments yet. Use Comment, then click the part of the page you want to talk about." : "No comments yet. Your client can leave them from the review link."}
            </p>
          )}

          {p.threads.map((t) => {
            const on = t.n === active;
            const st = STATUS[t.status];
            return (
              <article key={t.id} className="sw-card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, borderColor: on ? "var(--sw-accent)" : "var(--sw-border)" }}>
                <button type="button" onClick={() => choose(t.n!)} aria-pressed={on} className="sw-thread" style={{ ...plain, display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, width: "100%" }}>
                    <span className={`sw-pin${t.status === "resolved" ? " is-done" : ""}`} aria-hidden="true" style={{ width: 24, height: 24, lineHeight: "20px", flex: "none", boxShadow: "none", cursor: "inherit" }}>{t.n}</span>
                    <span className="sw-sr">Comment {t.n}, </span>
                    <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.author_name}</span>
                    <span style={{ fontSize: 13, color: "var(--sw-text-3)", whiteSpace: "nowrap" }} suppressHydrationWarning>{ago(t.created_at)}</span>
                    <span className={st.cls} style={{ marginLeft: "auto" }}>{st.text(t)}</span>
                  </span>
                  <span style={{ fontSize: 14, lineHeight: "20px", overflowWrap: "anywhere" }}>{t.body}</span>
                </button>
                <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <span className="sw-tag" style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{t.spec_id}</span>
                  {t.label && <span className={`sw-label${t.label === "scope" ? " is-quote" : ""}`}>{LABELS[t.label as LabelId]}</span>}
                </span>
                {t.replies.map((r) => (
                  <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 12px", borderRadius: "var(--sw-radius-md)", background: "var(--sw-surface-2)" }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {r.author_name}{" "}
                      {r.author_role === "agency" && r.author_name !== p.agency && <span style={{ fontWeight: 400, color: "var(--sw-text-3)" }}>{p.agency}</span>}
                    </span>
                    <span style={{ fontSize: 14, lineHeight: "20px", color: "var(--sw-text-2)", overflowWrap: "anywhere" }}>{r.body}</span>
                  </div>
                ))}
                {!isClient && on && (
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, paddingTop: 2 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--sw-text-2)" }}>
                      Label
                      <select className="sw-input" style={{ width: "auto", height: 32, fontSize: 13 }} value={t.label ?? ""} disabled={busy} onChange={(e) => run("label", () => setCommentLabel(p.slug!, t.id, e.target.value))}>
                        {!t.label && <option value="">None</option>}
                        {Object.entries(LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <span style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                      {t.status !== "quote-sent" && t.status !== "resolved" && (
                        <button className="sw-btn sw-btn--secondary" type="button" disabled={busy} onClick={() => run("status", () => setCommentStatus(p.slug!, t.id, "quote-sent"))}>Mark quote sent</button>
                      )}
                      {t.status === "resolved" ? (
                        <button className="sw-btn sw-btn--secondary" type="button" disabled={busy} onClick={() => run("status", () => setCommentStatus(p.slug!, t.id, "open"))}>Reopen</button>
                      ) : (
                        <button className="sw-btn sw-btn--secondary" type="button" disabled={busy} onClick={() => run("status", () => setCommentStatus(p.slug!, t.id, "resolved"))}>Resolve</button>
                      )}
                    </span>
                  </div>
                )}
              </article>
            );
          })}

          {activeThread && (
            <form className="sw-card" onSubmit={sendReply} style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              <label htmlFor="reply" style={{ fontSize: 13, fontWeight: 500, color: "var(--sw-text-2)" }}>Reply to #{activeThread.n}</label>
              <textarea id="reply" className="sw-input" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} required maxLength={4000} />
              {nameField("reply-name")}
              {error && error.where !== "composer" && error.where !== "approve" && <p className="sw-error" role="alert">{error.message}</p>}
              <button className="sw-btn sw-btn--secondary" type="submit" disabled={busy || !reply.trim() || (needName && !name.trim())} style={{ alignSelf: "flex-end" }}>{busy ? "Sending…" : "Send"}</button>
            </form>
          )}

        </aside>
      </main>

      {isClient && (
        <dialog ref={approveRef} className="sw-dialog" aria-labelledby="approve-title">
          <form onSubmit={approve} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 id="approve-title" style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 600 }}>Approve v{version.n}?</h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "var(--sw-text-2)" }}>
              This tells {p.agency} that version {version.n} is ready to go live. {open ? `${open} ${open === 1 ? "comment is" : "comments are"} still open.` : ""}
            </p>
            {nameField("approve-name")}
            {error?.where === "approve" && <p className="sw-error" role="alert">{error.message}</p>}
            <span style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="sw-btn sw-btn--ghost" type="button" onClick={() => approveRef.current?.close()}>Cancel</button>
              <button className="sw-btn sw-btn--primary" type="submit" disabled={busy || (needName && !name.trim())}>{busy ? "Approving…" : `Approve v${version.n}`}</button>
            </span>
          </form>
        </dialog>
      )}
    </>
  );
}

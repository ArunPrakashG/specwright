"use client";

import { useEffect, useState } from "react";
import type { Finding, Fix, Step } from "@specwright/core";
import { cancelBuild } from "@/app/actions";
import { ago, buildStatus, platformLabel, statusClass, stepTime } from "@/lib/format";
import type { BuildJson } from "@/lib/serialize";
import { CopyField } from "./copy-button";
import { PreviewFrame } from "./preview-frame";

const live = (b: BuildJson) => b.status === "queued" || b.status === "running";

function StepIcon({ status }: { status: Step["status"] }) {
  if (status === "pass")
    return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: "var(--sw-pass)" }}><path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" /></svg>;
  if (status === "fail")
    return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: "var(--sw-fail)" }}><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" /></svg>;
  if (status === "running")
    return (
      <svg className="sw-spin" width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: "var(--sw-accent)" }}>
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
        <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: "var(--sw-text-3)" }}>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      {status === "skip" && <path d="M5.5 8h5" stroke="currentColor" strokeWidth="1.5" />}
    </svg>
  );
}

const STEP_STATE: Record<Step["status"], string> = { pass: "done", fail: "failed", running: "running", waiting: "waiting", skip: "skipped" };

function setting(path: string) {
  const key = path.split(".").at(-1) ?? "";
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function FixLine({ fix }: { fix: Fix }) {
  const [from, to] = fix.label.split(" → ");
  const code = { fontFamily: "var(--sw-font-mono)" };
  return (
    <span style={{ fontSize: 13, color: "var(--sw-text-2)" }}>
      Fix: {setting(fix.path)}{" "}
      {to ? (
        <>
          <code style={code}>{from}</code> → <code style={code}>{to}</code>
        </>
      ) : (
        fix.label
      )}
    </span>
  );
}

export function BuildView({ slug, initial, pages }: { slug: string; initial: BuildJson; pages: { id: string; path: string }[] }) {
  const [b, setB] = useState(initial);
  const [focus, setFocus] = useState(0);

  useEffect(() => {
    if (!live(b)) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/v1/projects/${encodeURIComponent(slug)}/builds/${b.number}`, { cache: "no-store" }).catch(() => null);
      if (r?.ok) {
        const next = (await r.json()).build as BuildJson;
        if (!next.steps.length) next.steps = b.steps;
        setB(next);
      } else setB((x) => ({ ...x }));
    }, 1000);
    return () => clearTimeout(t);
  }, [b, slug]);

  // Hidden tabs throttle timers to about once a minute; catch up as soon as the tab is visible again.
  useEffect(() => {
    const wake = () => document.visibilityState === "visible" && setB((x) => ({ ...x }));
    document.addEventListener("visibilitychange", wake);
    return () => document.removeEventListener("visibilitychange", wake);
  }, []);

  const status = buildStatus(b);
  const fixing = b.steps.find((s) => s.id === "autofix")?.status === "running";
  const findings = b.checks.filter((g) => g.status === "fail").flatMap((g) => g.findings.filter((f) => f.severity === "error"));
  const shown: Finding | undefined = findings.filter((f) => f.specId)[focus] ?? findings.find((f) => f.specId);
  const pageOf = (f: Finding) => {
    const clean = (p: string) => p.replace(/\/+$/, "") || "/";
    return pages.find((p) => f.page && clean(p.path) === clean(f.page))?.id ?? f.specId?.split(".")[0] ?? "home";
  };
  const applied = (fix: Fix) => b.fixes.some((x) => x.path === fix.path && JSON.stringify(x.to) === JSON.stringify(fix.to));
  const started = b.started_at ?? b.created_at;

  return (
    <main id="main" className="sw-wrap" style={{ display: "flex", flexWrap: "wrap", gap: 24, paddingTop: 24, paddingBottom: 48, alignItems: "flex-start" }}>
      <div style={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 600 }}>Build #{b.number}</h2>
              <span className={statusClass(status.tone)} role="status">{status.text}</span>
            </div>
            <span style={{ fontSize: 13, color: "var(--sw-text-3)" }} suppressHydrationWarning>
              {platformLabel(b.target)} · spec v{b.revision} · {b.status === "queued" ? `queued ${ago(b.created_at).toLowerCase()}` : `started ${ago(started).toLowerCase()}`}
            </span>
          </div>
          {live(b) && (
            <form action={cancelBuild.bind(null, slug, b.number)}>
              <button className="sw-btn sw-btn--secondary" type="submit" disabled={b.cancel_requested}>{b.cancel_requested ? "Cancelling…" : "Cancel"}</button>
            </form>
          )}
        </div>

        <ol className="sw-card" aria-label="Pipeline" style={{ listStyle: "none", margin: 0, padding: "4px 0" }}>
          {b.steps.map((s) => (
            <li key={s.id} style={{ display: "grid", gridTemplateColumns: "24px minmax(0, 1fr) auto", gap: 12, alignItems: "center", padding: "12px 20px" }}>
              <span aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20 }}>
                <StepIcon status={s.status} />
              </span>
              <span style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 12px", minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>
                  {s.label}
                  <span className="sw-sr">, {STEP_STATE[s.status]}</span>
                </span>
                {s.detail && <span style={{ fontSize: 13, color: "var(--sw-text-3)", overflowWrap: "anywhere" }}>{s.detail}</span>}
              </span>
              <span style={{ fontFamily: "var(--sw-font-mono)", fontSize: 12, color: "var(--sw-text-3)" }}>{stepTime(s)}</span>
            </li>
          ))}
        </ol>

        <section aria-labelledby="checks" className="sw-card">
          <h3 id="checks" style={{ margin: 0, padding: "16px 20px", fontSize: 14, fontWeight: 600, borderBottom: b.checks.length ? "1px solid var(--sw-border)" : 0 }}>Checks</h3>
          {!b.checks.length && <p style={{ margin: 0, padding: "0 20px 16px", fontSize: 13, color: "var(--sw-text-3)" }}>{live(b) ? "Checks run once the preview store is up." : "No checks ran in this build."}</p>}
          {b.checks.map((c, i) => {
            const errors = c.findings.filter((f) => f.severity === "error");
            const result =
              c.status === "pass" ? (c.id === "journey" ? `${c.passed} of ${c.total}` : "Passed") : c.status === "fail" ? `${Math.max(1, errors.length)} failing` : c.status === "warn" ? `${c.findings.length} ${c.findings.length === 1 ? "warning" : "warnings"}` : "Skipped";
            const tone = c.status === "pass" ? "pass" : c.status === "fail" ? "fail" : c.status === "warn" ? "warn" : "idle";
            return (
              <div key={c.id} style={{ padding: "14px 20px", borderBottom: i < b.checks.length - 1 ? "1px solid var(--sw-border)" : 0, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "8px 16px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 12px", minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{c.label}</span>
                    <span style={{ fontSize: 13, color: "var(--sw-text-3)" }}>{c.summary}</span>
                  </div>
                  <span className={statusClass(tone)}>{result}</span>
                </div>
                {c.status === "fail" &&
                  errors.map((f, fi) => (
                    <div key={fi} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: "var(--sw-radius-md)", background: "var(--sw-surface-2)" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px" }}>
                        {f.specId && (
                          <button
                            type="button"
                            className="sw-tag is-fail"
                            style={{ border: 0, cursor: "pointer" }}
                            aria-pressed={shown === f}
                            aria-label={`Show ${f.specId} in the failing element view`}
                            onClick={() => setFocus(findings.filter((x) => x.specId).indexOf(f))}
                          >
                            {f.specId}
                          </button>
                        )}
                        <span style={{ fontSize: 14 }}>{f.message}</span>
                      </div>
                      {f.fix && (
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px 12px" }}>
                          <FixLine fix={f.fix} />
                          {applied(f.fix) ? <span className="sw-status is-pass">Applied</span> : fixing ? <span className="sw-status is-run">Applying</span> : <span className="sw-status is-idle">Not applied</span>}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            );
          })}
        </section>
      </div>

      <aside style={{ flex: "1 1 340px", maxWidth: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
        {shown?.specId && (
          <section aria-labelledby="failing" className="sw-card" style={{ overflow: "hidden" }}>
            <h3 id="failing" style={{ margin: 0, padding: "16px 20px", fontSize: 14, fontWeight: 600, borderBottom: "1px solid var(--sw-border)" }}>
              Failing element · {shown.viewport ?? "desktop"}
            </h3>
            <PreviewFrame
              variant="snippet"
              src={`/preview/${encodeURIComponent(slug)}/${encodeURIComponent(pageOf(shown))}?rev=${b.revision}`}
              title={`Failing element ${shown.specId}`}
              mobile={shown.viewport === "mobile"}
              select={shown.specId}
              tone="fail"
              clickSelects
            />
          </section>
        )}
        <section aria-labelledby="cli" className="sw-card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 id="cli" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Run locally</h3>
          <CopyField text={`specwright build --target ${b.target}`} label="Copy command" />
          {b.preview_url && (
            <a href={b.preview_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "var(--sw-accent)" }}>
              Open the preview store
            </a>
          )}
        </section>
      </aside>
    </main>
  );
}

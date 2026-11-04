"use client";

import { useActionState, useRef, useTransition } from "react";
import { createFromUpload, createSample, type FormState } from "@/app/actions";
import { CopyField } from "./copy-button";

function Dialog({ id, title, open, onClose, children }: { id: string; title: string; open: React.RefObject<HTMLDialogElement | null>; onClose?: () => void; children: React.ReactNode }) {
  return (
    <dialog ref={open} className="sw-dialog" aria-labelledby={`${id}-title`} onClose={onClose}>
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 id={`${id}-title`} style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 600 }}>{title}</h2>
          <button className="sw-btn sw-btn--ghost sw-btn--icon" type="button" aria-label="Close" onClick={() => open.current?.close()}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function Issues({ state }: { state: FormState }) {
  if (!state?.error) return null;
  return (
    <div role="alert" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderRadius: "var(--sw-radius-md)", background: "var(--sw-fail-soft)" }}>
      <p className="sw-error" style={{ fontWeight: 500 }}>{state.error}</p>
      {!!state.issues?.length && (
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4, fontSize: 13, lineHeight: "18px", color: "var(--sw-text)" }}>
          {state.issues.slice(0, 12).map((i, n) => (
            <li key={n}>
              {i.path && <code style={{ fontFamily: "var(--sw-font-mono)", fontSize: 12 }}>{i.path}</code>} {i.message}
              {i.severity === "warning" && <span style={{ color: "var(--sw-text-3)" }}> (warning)</span>}
            </li>
          ))}
          {state.issues.length > 12 && <li>{state.issues.length - 12} more</li>}
        </ul>
      )}
    </div>
  );
}

export function NewProject() {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, upload, uploading] = useActionState(createFromUpload, undefined);
  const [sampling, startSample] = useTransition();
  return (
    <>
      <button className="sw-btn sw-btn--primary" type="button" onClick={() => ref.current?.showModal()}>New project</button>
      <Dialog id="new" title="New project" open={ref}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "var(--sw-text-2)" }}>Start from the sample store, or upload a spec.json you already have.</p>
        <div className="sw-card" style={{ padding: 16, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Hale &amp; Field</span>
            <span style={{ fontSize: 13, color: "var(--sw-text-3)" }}>Sample ceramics store · 3 pages · 3 markets</span>
          </div>
          <button className="sw-btn sw-btn--secondary" type="button" disabled={sampling} onClick={() => startSample(() => void createSample())}>
            {sampling ? "Creating…" : "Use sample"}
          </button>
        </div>
        <form action={upload} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="sw-field">
            <label htmlFor="spec-file">spec.json</label>
            <input id="spec-file" name="spec" type="file" accept="application/json,.json" required className="sw-input" style={{ height: "auto", padding: 6, fontSize: 13 }} aria-describedby="spec-hint" />
            <p id="spec-hint" className="sw-hint">Checked against the Site Spec schema and the section library before anything is saved. Images it references go in the project folder.</p>
          </div>
          <Issues state={state} />
          <button className="sw-btn sw-btn--primary" type="submit" disabled={uploading} style={{ alignSelf: "flex-end" }}>
            {uploading ? "Checking…" : "Create project"}
          </button>
        </form>
      </Dialog>
    </>
  );
}

export function ImportStore() {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button className="sw-btn sw-btn--secondary" type="button" onClick={() => ref.current?.showModal()}>Import a store</button>
      <Dialog id="import" title="Import a store" open={ref}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "var(--sw-text-2)" }}>
          Importing a store you already run is planned, but not built yet. For now, start a spec from the command line and describe the store there.
        </p>
        <CopyField text="npx specwright init" label="Copy command" />
      </Dialog>
    </>
  );
}

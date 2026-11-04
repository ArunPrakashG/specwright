"use client";

import { useActionState } from "react";
import { saveProjectSettings, saveWorkspace } from "@/app/actions";
import { Issues } from "./new-project";

const card = { padding: 20, display: "flex", flexDirection: "column", gap: 16 } as const;
const title = { margin: 0, fontSize: 16, lineHeight: "24px", fontWeight: 600 } as const;

function Saved({ state, pending }: { state: { ok?: boolean; message?: string } | undefined; pending: boolean }) {
  return (
    <span className="sw-hint" role="status" style={{ marginRight: "auto" }}>
      {!pending && state?.ok ? state.message : ""}
    </span>
  );
}

export function ProjectSettings({ slug, name, domain }: { slug: string; name: string; domain: string }) {
  const [state, action, pending] = useActionState(saveProjectSettings.bind(null, slug), undefined);
  return (
    <form action={action} className="sw-card" aria-labelledby="project-settings" style={card}>
      <h2 id="project-settings" style={title}>Project</h2>
      <div className="sw-field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" className="sw-input" defaultValue={name} required maxLength={120} />
      </div>
      <div className="sw-field">
        <label htmlFor="domain">Domain</label>
        <input id="domain" name="domain" className="sw-input" defaultValue={domain} placeholder="haleandfield.com" inputMode="url" autoComplete="off" spellCheck={false} aria-describedby="domain-hint" />
        <p id="domain-hint" className="sw-hint">Shown on the project list. Saved into spec.json, so it bumps the spec version.</p>
      </div>
      <Issues state={state} />
      <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Saved state={state} pending={pending} />
        <button className="sw-btn sw-btn--primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </span>
    </form>
  );
}

export function WorkspaceSettings({ name }: { name: string }) {
  const [state, action, pending] = useActionState(saveWorkspace, undefined);
  return (
    <form action={action} className="sw-card" aria-labelledby="workspace-settings" style={card}>
      <h2 id="workspace-settings" style={title}>Workspace</h2>
      <div className="sw-field">
        <label htmlFor="workspace">Workspace name</label>
        <input id="workspace" name="workspace" className="sw-input" defaultValue={name} required maxLength={80} aria-describedby="workspace-hint" />
        <p id="workspace-hint" className="sw-hint">Your clients see this name on review links instead of Specwright.</p>
      </div>
      <Issues state={state} />
      <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Saved state={state} pending={pending} />
        <button className="sw-btn sw-btn--primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </span>
    </form>
  );
}

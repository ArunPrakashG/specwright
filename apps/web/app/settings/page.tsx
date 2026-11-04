import type { Metadata } from "next";
import { getWorkspace } from "@specwright/db";
import { logout } from "@/app/actions";
import { WorkspaceHeader } from "@/components/workspace-header";
import { WorkspaceSettings } from "@/components/settings-forms";
import { adminToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Specwright · Settings" };

export default async function Settings() {
  const workspace = await getWorkspace();
  return (
    <>
      <WorkspaceHeader name={workspace.name} current="settings" />
      <main id="main" className="sw-wrap" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 600, letterSpacing: "-0.01em" }}>Settings</h1>
        <WorkspaceSettings name={workspace.name} />
        {adminToken() && (
          <form action={logout} className="sw-card" style={{ padding: 20, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontSize: 14, color: "var(--sw-text-2)" }}>Signed in with the admin token.</span>
            <button className="sw-btn sw-btn--secondary" type="submit">Sign out</button>
          </form>
        )}
          </div>
    </main>
    </>
  );
}

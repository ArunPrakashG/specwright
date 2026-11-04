import type { Metadata } from "next";
import { getWorkspace } from "@specwright/db";
import { sections } from "@specwright/sections";
import { WorkspaceHeader } from "@/components/workspace-header";
import { settingNames } from "@/lib/spec";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Specwright · Sections" };

export default async function SectionsPage() {
  const workspace = await getWorkspace();
  const list = Object.values(sections);
  return (
    <>
      <WorkspaceHeader name={workspace.name} current="sections" />
      <main id="main" className="sw-wrap" style={{ paddingTop: 32, paddingBottom: 48, display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 600, letterSpacing: "-0.01em" }}>Sections</h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "var(--sw-text-2)" }}>
            {list.length} section types a spec can use. Each one renders the reference preview and builds to a WooCommerce block pattern.
          </p>
        </div>
        <ul className="sw-card sw-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {list.map((s) => (
            <li key={s.type} style={{ padding: "14px 20px", display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 16px" }}>
              <span style={{ flex: "0 0 180px", display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{s.label}</span>
                <code style={{ fontFamily: "var(--sw-font-mono)", fontSize: 12, color: "var(--sw-text-3)" }}>{s.type}</code>
              </span>
              <span style={{ flex: "1 1 280px", fontSize: 13, lineHeight: "20px", color: "var(--sw-text-2)", minWidth: 0 }}>{settingNames(s.type).join(", ") || "No settings"}</span>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}

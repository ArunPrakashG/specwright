import type { Metadata } from "next";
import Link from "next/link";
import { getWorkspace, listProjects, listReviewVersions, type Project } from "@specwright/db";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Mark } from "@/components/mark";
import { NewProject, ImportStore } from "@/components/new-project";
import { ago, lastBuildChecks, platformLabel, statusClass, buildStatus, type BuildLike } from "@/lib/format";

export const metadata: Metadata = { title: "Specwright · Projects" };
export const dynamic = "force-dynamic";

function stage(p: Project, build: BuildLike | null, version: number | undefined) {
  switch (p.stage) {
    case "building":
      if (build && (build.status === "running" || build.status === "queued")) return `Build · ${buildStatus(build).text.toLowerCase()}`;
      return build?.status === "fail" ? "Build · failed" : "Build";
    case "in-review":
      return version ? `Client review · v${version}` : "Client review";
    case "approved":
      return version ? `Approved · v${version}` : "Approved";
    case "live":
      return "Live";
    default:
      return "Spec";
  }
}

export default async function ProjectsPage() {
  const [workspace, projects] = await Promise.all([getWorkspace(), listProjects()]);
  const versions = await Promise.all(projects.map((p) => listReviewVersions(p.id).then((v) => v[0]?.n)));
  const rows = projects.map((p, i) => {
    const build = p.last_build ? ({ ...p.last_build, steps: [] } as BuildLike) : null;
    const checks = lastBuildChecks(build);
    return { p, checks, stage: stage(p, build, versions[i]) };
  });

  return (
    <>
      <WorkspaceHeader name={workspace.name} current="projects" />
      <main id="main" className="sw-wrap" style={{ paddingTop: 40, paddingBottom: 64, display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 600, letterSpacing: "-0.01em" }}>Projects</h1>
          {rows.length > 0 && <NewProject />}
        </div>

        {rows.length > 0 ? (
          <div className="sw-card">
            <div className="sw-row sw-row-head" aria-hidden="true" style={{ padding: "12px 20px", borderBottom: "1px solid var(--sw-border)", fontSize: 13, color: "var(--sw-text-3)" }}>
              <span>Project</span>
              <span className="sw-col-platform">Platform</span>
              <span>Stage</span>
              <span>Checks</span>
              <span className="sw-col-updated">Updated</span>
            </div>
            {rows.map(({ p, checks, stage }) => (
              <Link key={p.id} className="sw-row" href={`/p/${p.slug}`} style={{ padding: "16px 20px", borderBottom: "1px solid var(--sw-border)", textDecoration: "none", color: "var(--sw-text)" }}>
                <span className="sw-col-name" style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</span>
                  <span style={{ fontFamily: "var(--sw-font-mono)", fontSize: 12, color: "var(--sw-text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.domain ?? p.slug}</span>
                </span>
                <span className="sw-col-platform" style={{ fontSize: 13, color: "var(--sw-text-2)" }}>{platformLabel(p.platform)}</span>
                <span style={{ fontSize: 13, color: "var(--sw-text-2)" }}>
                  <span className="sw-sr">Stage: </span>
                  {stage}
                </span>
                <span>
                  <span className={statusClass(checks.tone)}>
                    <span className="sw-sr">Checks: </span>
                    {checks.text}
                  </span>
                </span>
                <span className="sw-col-updated" style={{ fontSize: 13, color: "var(--sw-text-3)" }}>{ago(p.updated_at)}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="sw-card" style={{ padding: "72px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
            <Mark size={40} stroke={1.5} bare style={{ color: "var(--sw-text-3)" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h2 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 600 }}>No projects yet</h2>
              <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "var(--sw-text-2)" }}>Start from a brief, or import a store you already run.</p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
              <NewProject />
              <ImportStore />
            </div>
            <code style={{ fontFamily: "var(--sw-font-mono)", fontSize: 12, color: "var(--sw-text-3)" }}>npx specwright init</code>
          </div>
        )}
      </main>
    </>
  );
}

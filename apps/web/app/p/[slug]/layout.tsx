import { notFound } from "next/navigation";
import { getProject, getWorkspace } from "@specwright/db";
import { WorkspaceHeader } from "@/components/workspace-header";
import { BuildButton, ProjectTabs } from "@/components/project-nav";

export default async function ProjectLayout({ children, params }: LayoutProps<"/p/[slug]">) {
  const { slug } = await params;
  const [project, workspace] = await Promise.all([getProject(slug), getWorkspace()]);
  if (!project) notFound();
  return (
    <>
      <WorkspaceHeader name={workspace.name} current="projects">
        <div className="sw-wrap" style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 36 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 600, letterSpacing: "-0.01em" }}>{project.name}</h1>
              <span style={{ fontFamily: "var(--sw-font-mono)", fontSize: 12, color: "var(--sw-text-3)", whiteSpace: "nowrap" }}>spec v{project.revision}</span>
            </div>
            <BuildButton slug={slug} />
          </div>
          <ProjectTabs slug={slug} />
        </div>
      </WorkspaceHeader>
      {children}
    </>
  );
}

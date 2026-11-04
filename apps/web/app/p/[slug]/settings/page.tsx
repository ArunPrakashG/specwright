import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject, getWorkspace } from "@specwright/db";
import { CopyField } from "@/components/copy-button";
import { ProjectSettings, WorkspaceSettings } from "@/components/settings-forms";
import { origin } from "@/lib/review";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/p/[slug]/settings">): Promise<Metadata> {
  const p = await getProject((await params).slug);
  return { title: p ? `Specwright · ${p.name} · Settings` : "Specwright" };
}

export default async function SettingsPage({ params }: PageProps<"/p/[slug]/settings">) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();
  const [workspace, base] = await Promise.all([getWorkspace(), origin()]);
  return (
    <main id="main" className="sw-wrap" style={{ paddingTop: 24, paddingBottom: 48 }}>
        <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 24 }}>
      <ProjectSettings slug={slug} name={project.name} domain={project.domain ?? ""} />
      <section className="sw-card" aria-labelledby="review-link" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 id="review-link" style={{ margin: 0, fontSize: 16, lineHeight: "24px", fontWeight: 600 }}>Review link</h2>
        <CopyField text={`${base}/r/${project.review_token}`} label="Copy review link" />
        <p className="sw-hint">Anyone with this link can see shared versions, comment and approve. It shows your workspace name, not Specwright.</p>
      </section>
      <WorkspaceSettings name={workspace.name} />
        </div>
    </main>
  );
}

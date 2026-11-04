import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getProjectByToken, getWorkspace } from "@specwright/db";
import { ReviewBoard } from "@/components/review-board";
import { REVIEWER_COOKIE } from "@/lib/auth";
import { reviewData } from "@/lib/review";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/r/[token]">): Promise<Metadata> {
  const project = await getProjectByToken((await params).token);
  if (!project) return { title: "Review" };
  const { versions, pages } = await reviewData(project);
  const home = pages.find((p) => p.path === "/") ?? pages[0];
  return { title: versions[0] && home ? `Review · ${project.name} · ${home.title} v${versions[0].n}` : `Review · ${project.name}` };
}

export default async function ClientReview({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const project = await getProjectByToken(token);
  if (!project) notFound();
  const [{ versions, pages, threads }, workspace, jar] = await Promise.all([reviewData(project), getWorkspace(), cookies()]);
  const reviewer = jar.get(REVIEWER_COOKIE)?.value?.trim().slice(0, 80) || undefined;

  if (!versions.length || !pages.length) {
    return (
      <main id="main" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
          <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 10, background: "var(--sw-text)", color: "var(--sw-bg)", fontSize: 18, fontWeight: 600 }}>
            {workspace.name.trim()[0]?.toUpperCase()}
          </span>
          <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 600 }}>{project.name}</h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "var(--sw-text-2)" }}>
            {workspace.name} has not shared a version for review yet. You will be able to see the pages and leave comments here once they do.
          </p>
        </div>
      </main>
    );
  }

  return <ReviewBoard role="client" agency={workspace.name} projectName={project.name} token={token} versions={versions} pages={pages} threads={threads} reviewer={reviewer} />;
}

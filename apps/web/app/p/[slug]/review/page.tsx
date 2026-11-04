import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject, getWorkspace } from "@specwright/db";
import { shareVersion } from "@/app/actions";
import { CopyField } from "@/components/copy-button";
import { ReviewBoard } from "@/components/review-board";
import { dayLabel } from "@/lib/format";
import { origin, reviewData } from "@/lib/review";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/p/[slug]/review">): Promise<Metadata> {
  const p = await getProject((await params).slug);
  return { title: p ? `Specwright · ${p.name} · Review` : "Specwright" };
}

export default async function ReviewPage({ params }: PageProps<"/p/[slug]/review">) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();
  const [{ versions, pages, threads }, workspace, base] = await Promise.all([reviewData(project), getWorkspace(), origin()]);
  const latest = versions[0];
  const shared = latest?.revision === project.revision;
  const next = (latest?.n ?? 0) + 1;

  return (
    <>
      <div className="sw-wrap" style={{ paddingTop: 24, paddingBottom: 24 }}>
        <section aria-labelledby="share" className="sw-card" style={{ padding: "16px 20px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 24px" }}>
          <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 id="share" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Review link</h2>
            <CopyField text={`${base}/r/${project.review_token}`} label="Copy review link" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, marginLeft: "auto" }}>
            <form action={shareVersion.bind(null, slug)}>
              <button className="sw-btn sw-btn--primary" type="submit" disabled={shared}>Share v{next} for review</button>
            </form>
            <span className="sw-hint" suppressHydrationWarning>
              {shared ? `Spec v${project.revision} is shared as v${latest!.n}.` : latest ? `v${latest.n} shared ${dayLabel(latest.created_at)} from spec v${latest.revision}.` : "Nothing shared yet."}
            </span>
          </div>
        </section>
      </div>
      {versions.length && pages.length ? (
        <ReviewBoard role="agency" agency={workspace.name} projectName={project.name} slug={slug} versions={versions} pages={pages} threads={threads} />
      ) : (
        <main id="main" className="sw-wrap" style={{ paddingBottom: 48 }}>
          <p className="sw-card" style={{ margin: 0, padding: "24px 20px", fontSize: 14, lineHeight: "20px", color: "var(--sw-text-2)" }}>
            Share a version to open the review. Your client sees the reference render of spec v{project.revision} and can leave comments on any part of it.
          </p>
        </main>
      )}
    </>
  );
}

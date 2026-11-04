import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject, listBuilds } from "@specwright/db";
import { ago, buildStatus, platformLabel, seconds, statusClass } from "@/lib/format";
import { CopyField } from "@/components/copy-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/p/[slug]/builds">): Promise<Metadata> {
  const p = await getProject((await params).slug);
  return { title: p ? `Specwright · ${p.name} · Builds` : "Specwright" };
}

export default async function BuildsPage({ params }: PageProps<"/p/[slug]/builds">) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();
  const builds = await listBuilds(project.id, 50);
  return (
    <main id="main" className="sw-wrap" style={{ paddingTop: 24, paddingBottom: 48, display: "flex", flexDirection: "column", gap: 24 }}>
      <h2 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 600 }}>Builds</h2>
      {builds.length ? (
        <div className="sw-card">
          <div className="sw-builds" aria-hidden="true" style={{ padding: "12px 20px", borderBottom: "1px solid var(--sw-border)", fontSize: 13, color: "var(--sw-text-3)" }}>
            <span>Build</span>
            <span>Status</span>
            <span className="sw-col-hide">Target</span>
            <span className="sw-col-hide">Started</span>
            <span className="sw-col-hide">Took</span>
          </div>
          {builds.map((b, i) => {
            const s = buildStatus(b);
            const took = b.started_at && b.finished_at ? seconds(new Date(b.finished_at).getTime() - new Date(b.started_at).getTime()) : "";
            return (
              <Link key={b.id} href={`/p/${slug}/builds/${b.number}`} className="sw-builds" style={{ padding: "14px 20px", borderBottom: i < builds.length - 1 ? "1px solid var(--sw-border)" : 0, textDecoration: "none", color: "var(--sw-text)" }}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Build #{b.number}</span>
                  <span style={{ fontFamily: "var(--sw-font-mono)", fontSize: 12, color: "var(--sw-text-3)" }}>spec v{b.revision}</span>
                </span>
                <span><span className={statusClass(s.tone)}>{s.text}</span></span>
                <span className="sw-col-hide" style={{ fontSize: 13, color: "var(--sw-text-2)" }}>{platformLabel(b.target)}</span>
                <span className="sw-col-hide" style={{ fontSize: 13, color: "var(--sw-text-3)" }}>{ago(b.started_at ?? b.created_at)}</span>
                <span className="sw-col-hide" style={{ fontFamily: "var(--sw-font-mono)", fontSize: 12, color: "var(--sw-text-3)" }}>{took}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="sw-card" style={{ padding: "48px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h3 style={{ margin: 0, fontSize: 16, lineHeight: "24px", fontWeight: 600 }}>No builds yet</h3>
            <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "var(--sw-text-2)", maxWidth: "52ch" }}>
              A build turns the spec into a {platformLabel(project.platform)} theme, starts a preview store and checks it. Start one with Build, or from your machine:
            </p>
          </div>
          <div style={{ width: "min(100%, 420px)" }}>
            <CopyField text={`specwright build --target ${project.platform}`} label="Copy command" />
          </div>
        </div>
      )}
    </main>
  );
}

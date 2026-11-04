import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject, listBuilds } from "@specwright/db";
import { inspectAll, loadSpec, locales, pageTrees } from "@/lib/spec";
import { SpecWorkspace } from "@/components/spec-workspace";
import { Issues } from "@/components/new-project";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const p = await getProject((await params).slug);
  return { title: p ? `Specwright · ${p.name} · Spec` : "Specwright" };
}

export default async function SpecPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();
  const [{ spec, raw, issues }, builds] = await Promise.all([loadSpec(project), listBuilds(project.id)]);

  if (!spec || !raw) {
    return (
      <main id="main" className="sw-wrap" style={{ paddingTop: 24, paddingBottom: 48 }}>
        <Issues state={{ error: "spec.json has errors, so the reference render is unavailable. Fix them in the file, then reload.", issues }} />
      </main>
    );
  }

  const built = builds.find((b) => b.status === "pass");
  return (
    <SpecWorkspace
      slug={slug}
      revision={project.revision}
      pages={pageTrees(spec)}
      markets={spec.markets.map((m) => ({ id: m.id, name: m.name, currency: m.currency, locales: m.locales, primary: m.primary }))}
      inspect={inspectAll(spec, raw)}
      colors={spec.tokens.color}
      locales={locales(spec)}
      built={built ? { number: built.number, revision: built.revision } : null}
      platform={project.platform}
    />
  );
}

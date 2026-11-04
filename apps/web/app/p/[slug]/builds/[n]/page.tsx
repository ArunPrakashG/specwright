import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBuild, getProject } from "@specwright/db";
import { initialSteps } from "@specwright/core";
import { buildJson } from "@/lib/serialize";
import { loadSpec } from "@/lib/spec";
import { BuildView } from "@/components/build-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/p/[slug]/builds/[n]">): Promise<Metadata> {
  const { slug, n } = await params;
  const p = await getProject(slug);
  return { title: p ? `Specwright · ${p.name} · Build #${n}` : "Specwright" };
}

export default async function BuildPage({ params }: PageProps<"/p/[slug]/builds/[n]">) {
  const { slug, n } = await params;
  const project = await getProject(slug);
  const number = Number(n);
  if (!project || !Number.isInteger(number)) notFound();
  const build = await getBuild(project.id, number);
  if (!build) notFound();
  const { spec } = await loadSpec(project);
  const json = buildJson(build);
  if (!json.steps.length) json.steps = initialSteps();
  return <BuildView slug={slug} initial={json} pages={spec?.pages.map((p) => ({ id: p.id, path: p.path })) ?? []} />;
}

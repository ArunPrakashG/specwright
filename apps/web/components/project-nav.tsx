"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { startBuild } from "@/app/actions";

export function ProjectTabs({ slug }: { slug: string }) {
  const path = usePathname();
  const base = `/p/${slug}`;
  const tabs = [
    { href: base, label: "Spec", on: path === base },
    { href: `${base}/builds`, label: "Builds", on: path.startsWith(`${base}/builds`) },
    { href: `${base}/review`, label: "Review", on: path.startsWith(`${base}/review`) },
    { href: `${base}/settings`, label: "Settings", on: path.startsWith(`${base}/settings`) },
  ];
  return (
    <nav className="sw-tabs" aria-label="Project" style={{ borderBottom: 0 }}>
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.on ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

function BuildSubmit() {
  const { pending } = useFormStatus();
  return (
    <button className="sw-btn sw-btn--primary" type="submit" disabled={pending}>
      {pending ? "Starting…" : "Build"}
    </button>
  );
}

export function BuildButton({ slug }: { slug: string }) {
  const path = usePathname();
  if (/\/builds\/\d+$/.test(path)) return null;
  return (
    <form action={startBuild.bind(null, slug)}>
      <BuildSubmit />
    </form>
  );
}

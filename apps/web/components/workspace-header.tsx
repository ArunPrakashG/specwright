import Link from "next/link";
import { Mark } from "./mark";

export function WorkspaceHeader({ name, current, children }: { name: string; current?: "projects" | "sections" | "settings"; children?: React.ReactNode }) {
  const nav = [
    { id: "projects", href: "/", label: "Projects" },
    { id: "sections", href: "/sections", label: "Sections" },
    { id: "settings", href: "/settings", label: "Settings" },
  ] as const;
  return (
    <header style={{ background: "var(--sw-surface)", borderBottom: "1px solid var(--sw-border)" }}>
      <a className="sw-btn sw-btn--secondary sw-skip" href="#main">Skip to content</a>
      <div className="sw-wrap sw-bar">
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }} aria-label={`${name}, projects`}>
          <Mark />
          <span style={{ fontWeight: 600, fontSize: 15 }}>{name}</span>
        </Link>
        <nav className="sw-nav" aria-label="Workspace">
          {nav.map((n) => (
            <Link key={n.id} href={n.href} aria-current={current === n.id ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </header>
  );
}

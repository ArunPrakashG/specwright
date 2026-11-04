import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { Mark } from "@/components/mark";
import { adminToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Specwright · Sign in" };

export default async function Login({ searchParams }: PageProps<"/login">) {
  if (!adminToken()) redirect("/");
  const next = (await searchParams).next;
  return (
    <main id="main" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="sw-card" style={{ width: "100%", maxWidth: 380, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Mark />
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Sign in to Specwright</h1>
        </span>
        <LoginForm next={typeof next === "string" ? next : "/"} />
      </div>
    </main>
  );
}

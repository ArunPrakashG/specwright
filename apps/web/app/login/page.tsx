import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { Mark } from "@/components/mark";
import { adminToken } from "@/lib/auth";
import { googleConfig } from "@/lib/google";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Specwright · Sign in" };

const ERRORS: Record<string, string> = {
  "google-not-allowed": "That Google account can't sign in here. Ask the owner to add it to SPECWRIGHT_ADMIN_EMAILS.",
  "google-cancelled": "Google sign-in was cancelled.",
  "google-expired": "That sign-in link expired. Try again.",
  "google-failed": "Google sign-in didn't go through. Try again.",
  "google-off": "Google sign-in isn't set up on this server.",
};

export default async function Login({ searchParams }: PageProps<"/login">) {
  if (!adminToken()) redirect("/");
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const google = !!googleConfig();
  return (
    <main id="main" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="sw-card" style={{ width: "100%", maxWidth: 380, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Mark />
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Sign in to Specwright</h1>
        </span>
        {error && (
          <p role="alert" className="sw-error" style={{ margin: 0, padding: "12px 14px", borderRadius: "var(--sw-radius-md)", background: "var(--sw-fail-soft)", fontWeight: 500 }}>
            {error}
          </p>
        )}
        {google ? (
          <>
            <a className="sw-btn sw-btn--secondary" href={`/api/v1/auth/google?next=${encodeURIComponent(next)}`} style={{ height: 44 }}>
              <GoogleG />
              Continue with Google
            </a>
            <details className="sw-login-token">
              <summary>Use the admin token</summary>
              <div style={{ paddingTop: 16 }}>
                <LoginForm next={next} autoFocus={false} />
              </div>
            </details>
          </>
        ) : (
          <LoginForm next={next} />
        )}
      </div>
    </main>
  );
}

/** Google's mark in its own colours, as its sign-in branding rules require. */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

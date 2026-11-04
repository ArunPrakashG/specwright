import { adminToken } from "./auth.ts";

/** Google sign-in for the agency side. On when a client id and secret are set and the dashboard has an admin token to sign in to. */
export function googleConfig() {
  const id = process.env.GOOGLE_CLIENT_ID || "";
  const secret = process.env.GOOGLE_CLIENT_SECRET || "";
  if (!id || !secret || !adminToken()) return null;
  return { id, secret };
}

export const OAUTH_COOKIE = "sw_google";

/** SPECWRIGHT_PUBLIC_URL wins; otherwise the host the request came in on, as the proxy saw it. */
export function callbackUrl(req: Request) {
  const base = process.env.SPECWRIGHT_PUBLIC_URL?.replace(/\/+$/, "");
  if (base) return `${base}/api/v1/auth/google/callback`;
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}/api/v1/auth/google/callback`;
}

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

export function randomToken() {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function challenge(verifier: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

/**
 * Exchange the code for an id token and read its claims. The token comes straight from Google's
 * token endpoint over TLS, so its signature needs no separate check (OpenID Connect Core 3.1.3.7).
 */
export async function exchange(code: string, verifier: string, redirectUri: string) {
  const cfg = googleConfig()!;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, code_verifier: verifier, client_id: cfg.id, client_secret: cfg.secret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: HTTP ${res.status}`);
  const { id_token } = (await res.json()) as { id_token?: string };
  const claims = JSON.parse(Buffer.from(id_token?.split(".")[1] ?? "", "base64url").toString("utf8") || "{}") as {
    iss?: string;
    aud?: string;
    exp?: number;
    email?: string;
    email_verified?: boolean;
  };
  if (!["accounts.google.com", "https://accounts.google.com"].includes(claims.iss ?? "") || claims.aud !== cfg.id || (claims.exp ?? 0) * 1000 < Date.now()) {
    throw new Error("Google returned an id token for another app or one that has expired");
  }
  return claims;
}

/** SPECWRIGHT_ADMIN_EMAILS: comma-separated addresses, or `@example.com` for a whole domain. */
export function emailAllowed(email: string) {
  const e = email.trim().toLowerCase();
  return (process.env.SPECWRIGHT_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => (rule.startsWith("@") ? e.endsWith(rule) : e === rule));
}

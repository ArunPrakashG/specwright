import { cookies } from "next/headers";

export const ADMIN_COOKIE = "sw_admin";
export const REVIEWER_COOKIE = "sw_reviewer";

export const adminToken = () => process.env.SPECWRIGHT_ADMIN_TOKEN || "";

/** The cookie holds a hash of the admin token, never the token itself. */
export async function tokenDigest(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`specwright-admin:${token}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the request may use the dashboard: no admin token set, or a valid cookie or bearer token. */
export async function isAdmin(cookie: string | undefined, authorization?: string | null) {
  const token = adminToken();
  if (!token) return true;
  if (authorization?.startsWith("Bearer ") && safeEqual(authorization.slice(7), token)) return true;
  return !!cookie && safeEqual(cookie, await tokenDigest(token));
}

/** Server actions are reachable from any page, so each admin action checks for itself. */
export async function requireAdmin() {
  const jar = await cookies();
  if (!(await isAdmin(jar.get(ADMIN_COOKIE)?.value))) throw new Error("Sign in to continue.");
}

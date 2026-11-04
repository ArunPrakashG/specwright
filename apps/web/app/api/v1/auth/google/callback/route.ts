import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, adminToken, safeEqual, tokenDigest } from "@/lib/auth";
import { callbackUrl, emailAllowed, exchange, googleConfig, OAUTH_COOKIE } from "@/lib/google";

/** Google sends the person back here. An allowed, verified address gets the same session the admin token gives. */
export async function GET(req: NextRequest) {
  const redirectUri = callbackUrl(req);
  const origin = new URL(redirectUri).origin;
  const params = new URL(req.url).searchParams;
  const back = (error: string) => {
    const res = NextResponse.redirect(`${origin}/login?error=${error}`);
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/v1/auth/google" });
    return res;
  };
  if (!googleConfig()) return back("google-off");
  if (params.get("error")) return back("google-cancelled");

  let saved: { state?: string; verifier?: string; next?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get(OAUTH_COOKIE)?.value ?? "{}");
  } catch {}
  const state = params.get("state") ?? "";
  const code = params.get("code");
  if (!code || !saved.state || !saved.verifier || !safeEqual(state, saved.state)) return back("google-expired");

  let email: string | undefined;
  try {
    const claims = await exchange(code, saved.verifier, redirectUri);
    if (claims.email_verified) email = claims.email;
  } catch (e) {
    console.error(e);
    return back("google-failed");
  }
  if (!email || !emailAllowed(email)) return back("google-not-allowed");

  const next = saved.next?.startsWith("/") && !saved.next.startsWith("//") ? saved.next : "/";
  const res = NextResponse.redirect(`${origin}${next}`);
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/v1/auth/google" });
  res.cookies.set(ADMIN_COOKIE, await tokenDigest(adminToken()), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}

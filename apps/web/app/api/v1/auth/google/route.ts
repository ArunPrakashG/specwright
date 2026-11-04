import { NextResponse } from "next/server";
import { callbackUrl, challenge, googleConfig, OAUTH_COOKIE, randomToken } from "@/lib/google";
import { clientKey, limited } from "@/lib/rate-limit";

/** Start Google sign-in: remember state, the PKCE verifier and where to go after, then hand over to Google. */
export async function GET(req: Request) {
  const redirectUri = callbackUrl(req);
  const origin = new URL(redirectUri).origin;
  const cfg = googleConfig();
  if (!cfg) return NextResponse.redirect(`${origin}/login`);
  if (limited(`google:${clientKey(req)}`, 30)) return new Response("Too many requests", { status: 429 });

  const asked = new URL(req.url).searchParams.get("next") ?? "/";
  const next = asked.startsWith("/") && !asked.startsWith("//") ? asked.slice(0, 300) : "/";
  const state = randomToken();
  const verifier = randomToken();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: cfg.id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email",
    state,
    code_challenge: await challenge(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  const res = NextResponse.redirect(url.toString());
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, verifier, next }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/v1/auth/google",
    maxAge: 600,
  });
  return res;
}

import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, adminToken, isAdmin } from "@/lib/auth";

/** Client review links, their previews and the token API stay public; everything else needs the admin token when one is set. */
const PUBLIC = [/^\/r\/[^/]+(\/.*)?$/, /^\/api\/v1\/r\/[^/]+(\/.*)?$/, /^\/login$/];

export async function proxy(req: NextRequest) {
  if (!adminToken()) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, req.headers.get("authorization"))) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in with the admin token" }, { status: 401, headers: { "X-Robots-Tag": "noindex" } });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};

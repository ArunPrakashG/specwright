import { ADMIN_COOKIE, isAdmin } from "./auth.ts";

export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, { status, headers: { "X-Robots-Tag": "noindex", "Cache-Control": "no-store", ...headers } });

export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);

export async function body(req: Request, max = 512_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > max) throw new HttpError(413, "Request body too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function handle(fn: (req: Request, ctx: any) => Promise<Response>) {
  return async (req: Request, ctx: any) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message);
      console.error(e);
      return fail(500, "Something went wrong");
    }
  };
}

/** Admin API routes accept the session cookie or `Authorization: Bearer <SPECWRIGHT_ADMIN_TOKEN>`. */
export async function requireApiAdmin(req: Request) {
  const cookie = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1);
  if (!(await isAdmin(cookie, req.headers.get("authorization")))) throw new HttpError(401, "Sign in or send an admin bearer token");
}

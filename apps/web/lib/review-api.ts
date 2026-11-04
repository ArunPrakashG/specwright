import { getProjectByToken, listReviewVersions, type Project } from "@specwright/db";
import { REVIEWER_COOKIE } from "./auth.ts";
import { HttpError } from "./http.ts";
import { clientKey, limited } from "./rate-limit.ts";

/** Resolve a review token, rate limited per client and token. */
export async function reviewProject(req: Request, token: string, kind: "read" | "write") {
  const key = `${kind}:${clientKey(req)}:${token.slice(0, 12)}`;
  if (limited(key, kind === "write" ? 20 : 120)) throw new HttpError(429, "Too many requests. Wait a minute and try again.");
  const project = await getProjectByToken(token);
  if (!project) throw new HttpError(404, "This review link is not valid");
  return project;
}

export async function versionOf(project: Project, n: unknown) {
  const versions = await listReviewVersions(project.id);
  const v = versions.find((x) => x.n === n);
  if (!v) throw new HttpError(422, "No such review version");
  return v;
}

export function reviewerName(req: Request, given: unknown) {
  const fromBody = typeof given === "string" ? given.trim().replace(/\s+/g, " ") : "";
  if (fromBody) {
    if (fromBody.length > 80) throw new HttpError(422, "Your name is too long");
    return fromBody;
  }
  const raw = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${REVIEWER_COOKIE}=`))?.slice(REVIEWER_COOKIE.length + 1);
  const name = raw ? decodeURIComponent(raw).trim().slice(0, 80) : "";
  if (!name) throw new HttpError(422, "Tell us your name first");
  return name;
}

export const nameCookie = (name: string) => `${REVIEWER_COOKIE}=${encodeURIComponent(name)}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`;

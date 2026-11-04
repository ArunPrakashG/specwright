import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** The Hale & Field example that ships with @specwright/spec. */
export function sampleDir() {
  const candidates = [
    resolve(process.cwd(), "../../packages/spec/examples/hale-and-field"),
    resolve(process.cwd(), "packages/spec/examples/hale-and-field"),
    resolve(process.cwd(), "node_modules/@specwright/spec/examples/hale-and-field"),
  ];
  const dir = candidates.find((d) => existsSync(join(d, "spec.json")));
  if (!dir) throw new Error("The sample spec is not available in this install.");
  return dir;
}

export async function sampleSpec() {
  const dir = sampleDir();
  const spec = JSON.parse(await readFile(join(dir, "spec.json"), "utf8")) as Record<string, any>;
  delete spec.$schema;
  return { dir, spec };
}

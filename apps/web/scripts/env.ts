import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Same default as next.config.ts: project folders live in <repo>/.specwright.
export const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
process.env.SPECWRIGHT_DATA_DIR ??= join(repoRoot, ".specwright");

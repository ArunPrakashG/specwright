import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

// Project folders live at the repo root (.specwright/), shared with the CLI and the worker.
const root = resolve(process.cwd(), "../..");
if (!process.env.SPECWRIGHT_DATA_DIR && existsSync(join(root, "pnpm-workspace.yaml"))) {
  process.env.SPECWRIGHT_DATA_DIR = join(root, ".specwright");
}

const config: NextConfig = {
  transpilePackages: ["@specwright/ai", "@specwright/core", "@specwright/db", "@specwright/sections", "@specwright/spec"],
  serverExternalPackages: ["postgres", "pg-boss"],
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
};

export default config;

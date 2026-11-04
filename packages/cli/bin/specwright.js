#!/usr/bin/env node
import { register } from "tsx/esm/api";

register();
const { run } = await import("../src/main.ts");
await run();

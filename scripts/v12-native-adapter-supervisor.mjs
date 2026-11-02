#!/usr/bin/env node
import { writeSync } from "node:fs";

const controller = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => controller.abort());
}
try { writeSync(3, "ready\n"); } catch { /* fd 3 is present only in readiness tests */ }

const { runV12NativeSupervisorCli } = await import("./v12-native-adapter.mjs");
await runV12NativeSupervisorCli({ signal: controller.signal });

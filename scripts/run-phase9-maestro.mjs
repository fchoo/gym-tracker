#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const manifestIndex = process.argv.indexOf("--manifest");
const manifest = manifestIndex < 0
  ? "artifacts/native/phase9/build.json"
  : process.argv[manifestIndex + 1];
if (manifest === undefined || !existsSync(manifest)) {
  throw new Error("Phase 9 Maestro: a native build manifest is required.");
}
const build = JSON.parse(readFileSync(manifest, "utf8"));
if (typeof build.apk?.path !== "string" || !existsSync(build.apk.path)) {
  throw new Error("Phase 9 Maestro: manifest APK is missing.");
}
const result = spawnSync("maestro", ["test", "maestro/phase9/in-workout-exercise-editing.yaml"], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);

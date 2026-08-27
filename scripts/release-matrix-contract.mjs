#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export const REQUIRED_RELEASE_MATRIX_SCRIPTS = Object.freeze([
  "typecheck",
  "lint",
  "check:boundaries",
  "test:unit",
  "test:components",
  "test:sqlite:host",
  "test:integration",
  "test:coverage",
  "test:evidence:phase2",
  "test:evidence:phase3",
  "test:evidence:phase4",
  "test:evidence:phase5",
  "test:evidence:release",
  "test:maestro:phase5",
  "benchmark:phase5",
  "verify:native:phase5",
]);

export function validateReleaseMatrixScripts(packageJson) {
  const missing = REQUIRED_RELEASE_MATRIX_SCRIPTS.filter(
    (script) => typeof packageJson?.scripts?.[script] !== "string",
  );
  if (missing.length > 0) {
    throw new Error("release_matrix_incomplete: " + missing.join(", "));
  }
  return Object.freeze({
    required: REQUIRED_RELEASE_MATRIX_SCRIPTS,
    count: REQUIRED_RELEASE_MATRIX_SCRIPTS.length,
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    const result = validateReleaseMatrixScripts(packageJson);
    process.stdout.write(JSON.stringify({ ok: true, ...result }) + "\n");
  } catch (error) {
    process.stderr.write(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "release_matrix_incomplete",
    }) + "\n");
    process.exitCode = 1;
  }
}

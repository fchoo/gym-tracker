#!/usr/bin/env node

import {
  createHash,
} from "node:crypto";
import {
  execFileSync,
} from "node:child_process";
import {
  existsSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  sourceTreeSha256,
  sourceTreeSha256AtHead,
} from "./source-tree-digest.mjs";
import { validateImplementationIdentity } from "./phase2-evidence-identity.mjs";

const projectRoot = process.cwd();

export const PHASE3_BENCHMARK_MEASUREMENTS = Object.freeze([
  "effective-history-read",
  "history-projection-rebuild",
]);

/**
 * The 250 ms p95 ceiling is deliberately bounded but conservative for the
 * Phase 3 factual-history and canonical-projection operations. It is a
 * native-candidate acceptance threshold, not a host benchmark claim.
 */
export const PHASE3_BENCHMARK_THRESHOLDS = Object.freeze({
  minimumSamples: 100,
  maximumP95Ms: 250,
  maximumJsTaskMs: 50,
});

function exactIdentity(label, evidence, manifest) {
  if (
    evidence?.base_head !== manifest?.base_head
    || evidence?.source_tree_sha256 !== manifest?.source_tree_sha256
    || evidence?.package !== manifest?.package
    || evidence?.apk?.path !== manifest?.apk?.path
    || evidence?.apk?.sha256 !== manifest?.apk?.sha256
    || evidence?.apk?.size_bytes !== manifest?.apk?.size_bytes
  ) {
    throw new Error(`${label} identity does not match the build manifest HEAD.`);
  }
}

function exactLedger(label, actual, expected) {
  if (
    !Array.isArray(actual)
    || actual.length !== expected.length
    || actual.some((id, index) => id !== expected[index])
  ) {
    throw new Error(`${label} is incomplete or stale.`);
  }
}

export function validatePhase3BenchmarkResult(evidence, manifest) {
  if (
    evidence?.schema_version !== 1
    || evidence?.suite !== "phase3"
    || evidence?.status !== "passed"
    || evidence?.thresholds?.minimum_samples
      !== PHASE3_BENCHMARK_THRESHOLDS.minimumSamples
    || evidence?.thresholds?.maximum_p95_ms
      !== PHASE3_BENCHMARK_THRESHOLDS.maximumP95Ms
    || evidence?.thresholds?.maximum_js_task_ms
      !== PHASE3_BENCHMARK_THRESHOLDS.maximumJsTaskMs
  ) {
    throw new Error("Phase 3 benchmark evidence did not pass.");
  }
  exactIdentity("Phase 3 benchmark", evidence, manifest);
  exactLedger(
    "Phase 3 benchmark measurement",
    evidence.measurements?.map(({ id }) => id),
    PHASE3_BENCHMARK_MEASUREMENTS,
  );
  for (const measurement of evidence.measurements) {
    if (
      measurement.samples_requested < PHASE3_BENCHMARK_THRESHOLDS.minimumSamples
      || measurement.samples_completed < PHASE3_BENCHMARK_THRESHOLDS.minimumSamples
      || measurement.durations_ms?.length !== measurement.samples_completed
      || measurement.p95_ms > PHASE3_BENCHMARK_THRESHOLDS.maximumP95Ms
      || measurement.maximum_js_task_ms
        > PHASE3_BENCHMARK_THRESHOLDS.maximumJsTaskMs
    ) {
      throw new Error(`Phase 3 benchmark threshold failed: ${measurement.id}`);
    }
  }
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function validateCurrentCandidate(manifest) {
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: projectRoot,
    encoding: "utf8",
  }).trim();
  const changedPaths = currentHead === manifest.base_head
    ? []
    : execFileSync("git", [
      "diff", "--name-only", `${manifest.base_head}..${currentHead}`,
    ], { cwd: projectRoot, encoding: "utf8" }).trim().split(/\r?\n/u).filter(Boolean);
  validateImplementationIdentity({
    manifestHead: manifest.base_head,
    currentHead,
    changedPaths,
    manifestSourceSha256: manifest.source_tree_sha256,
    currentSourceSha256: sourceTreeSha256(projectRoot),
    implementationSourceSha256: sourceTreeSha256AtHead(manifest.base_head, projectRoot),
  });
  const apkPath = path.resolve(projectRoot, manifest.apk.path);
  if (!existsSync(apkPath) || sha256(apkPath) !== manifest.apk.sha256) {
    throw new Error("current APK identity does not match manifest.");
  }
}

function parseArgs(args) {
  const options = { manifestArgument: "artifacts/native/phase3/build.json" };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--manifest requires a value.");
      options.manifestArgument = value;
      index += 1;
    } else if (argument.startsWith("--manifest=")) {
      options.manifestArgument = argument.slice("--manifest=".length);
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

export async function executePhase3BenchmarkCli({
  args = process.argv.slice(2),
} = {}) {
  const { manifestArgument } = parseArgs(args);
  if (manifestArgument !== "artifacts/native/phase3/build.json") {
    throw new Error("Phase 3 manifest must be artifacts/native/phase3/build.json.");
  }
  const manifestPath = path.join(projectRoot, manifestArgument);
  if (!existsSync(manifestPath)) {
    throw new Error("Phase 3 exact-HEAD native build manifest is missing.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  validateCurrentCandidate(manifest);
  throw new Error(
    "Phase 3 benchmark generation is deferred until the final shared native verification gate.",
  );
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  executePhase3BenchmarkCli().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: "phase3_benchmark_deferred",
      message: error.message,
    }));
    process.exitCode = 1;
  });
}

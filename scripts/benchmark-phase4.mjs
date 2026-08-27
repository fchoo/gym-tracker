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
import { validatePhase4CandidateManifest } from "./run-phase4-maestro.mjs";

const projectRoot = process.cwd();

/**
 * Restricted to a pure period reducer and a bounded repository read; neither
 * measurement is permission to benchmark live device or attended behavior.
 */
export const PHASE4_BENCHMARK_MEASUREMENTS = Object.freeze([
  "progress-period-projection",
  "progress-repository-read",
]);

export const PHASE4_BENCHMARK_THRESHOLDS = Object.freeze({
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

export function validatePhase4BenchmarkResult(evidence, manifest) {
  if (
    evidence?.schema_version !== 1
    || evidence?.suite !== "phase4"
    || evidence?.status !== "passed"
    || evidence?.mode !== "automated-only"
    || evidence?.approval_status !== "evidence_pending"
    || evidence?.physical_review !== "deferred_final_gate"
    || evidence?.thresholds?.minimum_samples
      !== PHASE4_BENCHMARK_THRESHOLDS.minimumSamples
    || evidence?.thresholds?.maximum_p95_ms
      !== PHASE4_BENCHMARK_THRESHOLDS.maximumP95Ms
    || evidence?.thresholds?.maximum_js_task_ms
      !== PHASE4_BENCHMARK_THRESHOLDS.maximumJsTaskMs
  ) {
    throw new Error("Phase 4 benchmark evidence did not pass as automated-only evidence.");
  }
  exactIdentity("Phase 4 benchmark", evidence, manifest);
  exactLedger(
    "Phase 4 benchmark measurement",
    evidence.measurements?.map(({ id }) => id),
    PHASE4_BENCHMARK_MEASUREMENTS,
  );
  for (const measurement of evidence.measurements) {
    if (
      measurement.samples_requested < PHASE4_BENCHMARK_THRESHOLDS.minimumSamples
      || measurement.samples_completed < PHASE4_BENCHMARK_THRESHOLDS.minimumSamples
      || measurement.durations_ms?.length !== measurement.samples_completed
      || measurement.p95_ms > PHASE4_BENCHMARK_THRESHOLDS.maximumP95Ms
      || measurement.maximum_js_task_ms
        > PHASE4_BENCHMARK_THRESHOLDS.maximumJsTaskMs
    ) {
      throw new Error(`Phase 4 benchmark threshold failed: ${measurement.id}`);
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
  const options = { manifestArgument: "artifacts/native/phase4/build.json" };
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

export async function executePhase4BenchmarkCli({
  args = process.argv.slice(2),
} = {}) {
  const { manifestArgument } = parseArgs(args);
  if (manifestArgument !== "artifacts/native/phase4/build.json") {
    throw new Error("Phase 4 manifest must be artifacts/native/phase4/build.json.");
  }
  const manifestPath = path.join(projectRoot, manifestArgument);
  if (!existsSync(manifestPath)) {
    throw new Error("Phase 4 exact-HEAD native build manifest is missing.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  validatePhase4CandidateManifest(manifest);
  validateCurrentCandidate(manifest);
  throw new Error(
    "Phase 4 benchmark generation is deferred until the final shared native verification gate.",
  );
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  executePhase4BenchmarkCli().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: "phase4_benchmark_deferred",
      message: error.message,
    }));
    process.exitCode = 1;
  });
}

#!/usr/bin/env node

import {
  execFileSync,
} from "node:child_process";
import {
  createHash,
} from "node:crypto";
import {
  existsSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  PHASE4_BENCHMARK_MEASUREMENTS,
  validatePhase4BenchmarkResult,
} from "./benchmark-phase4.mjs";
import {
  PHASE4_MAESTRO_FLOW_CONTRACTS,
  validatePhase4MaestroEvidence,
} from "./run-phase4-maestro.mjs";
import {
  sourceTreeSha256,
  sourceTreeSha256AtHead,
} from "./source-tree-digest.mjs";
import { validateImplementationIdentity } from "./phase2-evidence-identity.mjs";

const projectRoot = process.cwd();

export const PHASE4_AUTOMATED_CONTRACT_CASE_IDS = Object.freeze([
  "today-current-target-preserved",
  "pending-review-source-navigation",
  "stale-progress-suppressed",
  "targeted-full-rebuild-equivalence",
  "progress-accessible-equivalence",
]);

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

function automatedOnlyMetadata(evidence) {
  return evidence?.mode === "automated-only"
    && evidence?.approval_status === "evidence_pending"
    && evidence?.physical_review === "deferred_final_gate";
}

export function validatePhase4AutomatedContract(evidence, manifest) {
  if (
    evidence?.schema_version !== 1
    || evidence?.suite !== "phase4"
    || evidence?.status !== "passed"
    || !automatedOnlyMetadata(evidence)
    || evidence?.contract?.expected_count !== PHASE4_AUTOMATED_CONTRACT_CASE_IDS.length
    || evidence?.contract?.total !== PHASE4_AUTOMATED_CONTRACT_CASE_IDS.length
    || evidence?.contract?.passed !== PHASE4_AUTOMATED_CONTRACT_CASE_IDS.length
    || evidence?.contract?.failed !== 0
    || evidence?.contract?.skipped !== 0
  ) {
    throw new Error("Phase 4 automated aggregate counts are incomplete.");
  }
  exactIdentity("Phase 4 automated", evidence, manifest);
  exactLedger(
    "Phase 4 automated case",
    evidence.contract.cases?.map(({ id }) => id),
    PHASE4_AUTOMATED_CONTRACT_CASE_IDS,
  );
  if (evidence.contract.cases.some(({ status }) => status !== "passed")) {
    throw new Error("Phase 4 automated aggregate contains a failed or skipped case.");
  }
}

export function validatePhase4AutomatedEvidence({
  manifest,
  automated,
  maestro,
  benchmark,
}) {
  if (
    manifest?.schema_version !== 1
    || manifest?.suite !== "phase4"
    || manifest?.profile !== "development-test"
    || manifest?.build_variant !== "release"
    || manifest?.js_bundle?.embedded !== true
    || manifest?.apk?.page_alignment_kib !== 16
    || manifest?.apk?.page_alignment_verified !== true
  ) {
    throw new Error("Phase 4 build manifest is invalid.");
  }
  validatePhase4AutomatedContract(automated, manifest);
  validatePhase4MaestroEvidence(maestro, manifest);
  validatePhase4BenchmarkResult(benchmark, manifest);
  return {
    schema_version: 1,
    suite: "phase4",
    status: "passed",
    mode: "automated-only",
    approval_status: "evidence_pending",
    physical_review: "deferred_final_gate",
    build_manifest: "artifacts/native/phase4/build.json",
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk_sha256: manifest.apk.sha256,
    automated_cases: `${PHASE4_AUTOMATED_CONTRACT_CASE_IDS.length}/${PHASE4_AUTOMATED_CONTRACT_CASE_IDS.length}`,
    maestro_flows: `${PHASE4_MAESTRO_FLOW_CONTRACTS.length}/${PHASE4_MAESTRO_FLOW_CONTRACTS.length}`,
    benchmark_measurements: `${PHASE4_BENCHMARK_MEASUREMENTS.length}/${PHASE4_BENCHMARK_MEASUREMENTS.length}`,
  };
}

export { validateImplementationIdentity };

export function resolvePhase4VerifierMode({
  automatedOnly = false,
  attendedPreflight = false,
  requirePhysical = false,
  approval = false,
  outputArgument = null,
} = {}) {
  if (
    attendedPreflight
    || requirePhysical
    || approval
    || outputArgument !== null
  ) {
    throw new Error(
      "Phase 4 evidence is automated-only; attended, physical, and approval evidence are deferred to the final gate.",
    );
  }
  return { automatedOnly: automatedOnly || true };
}

export function parsePhase4VerifierArgs(args) {
  const options = {
    automatedOnly: false,
    manifestArgument: "artifacts/native/phase4/build.json",
  };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--automated-only") {
      if (seen.has("automatedOnly")) throw new Error("duplicate argument: --automated-only");
      seen.add("automatedOnly");
      options.automatedOnly = true;
    } else if (argument === "--manifest" || argument.startsWith("--manifest=")) {
      if (seen.has("manifest")) throw new Error("duplicate argument: --manifest");
      seen.add("manifest");
      const value = argument === "--manifest"
        ? args[index + 1]
        : argument.slice("--manifest=".length);
      if (!value || value.startsWith("--") || value.includes("\0")) {
        throw new Error("--manifest requires a value.");
      }
      options.manifestArgument = value;
      if (argument === "--manifest") index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not readable JSON: ${error.message}`);
  }
}

function validateCurrentManifestIdentity(manifest) {
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
  const apkPath = path.resolve(projectRoot, manifest.apk?.path ?? "");
  if (!existsSync(apkPath) || sha256(apkPath) !== manifest.apk?.sha256) {
    throw new Error("current APK identity does not match manifest.");
  }
}

export async function executePhase4VerifierCli({
  args = process.argv.slice(2),
  log = console.log,
} = {}) {
  const { automatedOnly, manifestArgument } = parsePhase4VerifierArgs(args);
  resolvePhase4VerifierMode({ automatedOnly });
  if (manifestArgument !== "artifacts/native/phase4/build.json") {
    throw new Error("Phase 4 manifest must be artifacts/native/phase4/build.json.");
  }
  const artifactDirectory = path.join(projectRoot, "artifacts/native/phase4");
  const manifest = readJson(path.join(artifactDirectory, "build.json"), "build manifest");
  validateCurrentManifestIdentity(manifest);
  const result = validatePhase4AutomatedEvidence({
    manifest,
    automated: readJson(path.join(artifactDirectory, "result.json"), "automated"),
    maestro: readJson(path.join(artifactDirectory, "maestro.json"), "Maestro"),
    benchmark: readJson(path.join(artifactDirectory, "benchmark.json"), "benchmark"),
  });
  log(JSON.stringify({ ok: true, ...result }));
  return result;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  executePhase4VerifierCli().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: "phase4_native_evidence_failed",
      message: error.message,
    }));
    process.exitCode = 1;
  });
}

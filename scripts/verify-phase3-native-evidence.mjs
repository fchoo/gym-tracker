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
  PHASE3_BENCHMARK_MEASUREMENTS,
  validatePhase3BenchmarkResult,
} from "./benchmark-phase3.mjs";
import {
  PHASE3_MAESTRO_FLOW_CONTRACTS,
  validatePhase3MaestroEvidence,
} from "./run-phase3-maestro.mjs";
import {
  sourceTreeSha256,
  sourceTreeSha256AtHead,
} from "./source-tree-digest.mjs";
import { validateImplementationIdentity } from "./phase2-evidence-identity.mjs";

const projectRoot = process.cwd();

export const PHASE3_NATIVE_CONTRACT_CASE_IDS = Object.freeze([
  "calendar-effective-state",
  "correction-audit-facts",
  "void-restore-lifecycle",
  "stale-rebuild-rejected",
  "targeted-full-rebuild-equivalence",
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

export function validatePhase3NativeContract(evidence, manifest) {
  if (
    evidence?.schema_version !== 1
    || evidence?.suite !== "phase3"
    || evidence?.status !== "passed"
    || evidence?.contract?.expected_count !== PHASE3_NATIVE_CONTRACT_CASE_IDS.length
    || evidence?.contract?.total !== PHASE3_NATIVE_CONTRACT_CASE_IDS.length
    || evidence?.contract?.passed !== PHASE3_NATIVE_CONTRACT_CASE_IDS.length
    || evidence?.contract?.failed !== 0
    || evidence?.contract?.skipped !== 0
  ) {
    throw new Error("Phase 3 native aggregate counts are incomplete.");
  }
  exactIdentity("Phase 3 native", evidence, manifest);
  exactLedger(
    "Phase 3 native case",
    evidence.contract.cases?.map(({ id }) => id),
    PHASE3_NATIVE_CONTRACT_CASE_IDS,
  );
  if (evidence.contract.cases.some(({ status }) => status !== "passed")) {
    throw new Error("Phase 3 native aggregate contains a failed or skipped case.");
  }
}

export function validatePhase3AutomatedEvidence({
  manifest,
  native,
  maestro,
  benchmark,
}) {
  if (
    manifest?.schema_version !== 1
    || manifest?.suite !== "phase3"
    || manifest?.profile !== "development-test"
    || manifest?.build_variant !== "release"
    || manifest?.js_bundle?.embedded !== true
    || manifest?.apk?.page_alignment_kib !== 16
    || manifest?.apk?.page_alignment_verified !== true
  ) {
    throw new Error("Phase 3 build manifest is invalid.");
  }
  validatePhase3NativeContract(native, manifest);
  validatePhase3MaestroEvidence(maestro, manifest);
  validatePhase3BenchmarkResult(benchmark, manifest);
  return {
    schema_version: 1,
    suite: "phase3",
    status: "passed",
    mode: "automated-only",
    approval_status: "evidence_pending",
    physical_review: "deferred_final_gate",
    build_manifest: "artifacts/native/phase3/build.json",
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk_sha256: manifest.apk.sha256,
    native_cases: `${PHASE3_NATIVE_CONTRACT_CASE_IDS.length}/${PHASE3_NATIVE_CONTRACT_CASE_IDS.length}`,
    maestro_flows: `${PHASE3_MAESTRO_FLOW_CONTRACTS.length}/${PHASE3_MAESTRO_FLOW_CONTRACTS.length}`,
    benchmark_measurements: `${PHASE3_BENCHMARK_MEASUREMENTS.length}/${PHASE3_BENCHMARK_MEASUREMENTS.length}`,
  };
}

export { validateImplementationIdentity };

export function resolvePhase3VerifierMode({
  automatedOnly = false,
  attendedPreflight = false,
  requirePhysical = false,
  outputArgument = null,
} = {}) {
  if (attendedPreflight || requirePhysical || outputArgument !== null) {
    throw new Error(
      "Phase 3 evidence is automated-only; attended and physical approval are deferred to the final gate.",
    );
  }
  return { automatedOnly: automatedOnly || true };
}

export function parsePhase3VerifierArgs(args) {
  const options = {
    automatedOnly: false,
    manifestArgument: "artifacts/native/phase3/build.json",
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

export async function executePhase3VerifierCli({
  args = process.argv.slice(2),
  log = console.log,
} = {}) {
  const { automatedOnly, manifestArgument } = parsePhase3VerifierArgs(args);
  resolvePhase3VerifierMode({ automatedOnly });
  if (manifestArgument !== "artifacts/native/phase3/build.json") {
    throw new Error("Phase 3 manifest must be artifacts/native/phase3/build.json.");
  }
  const artifactDirectory = path.join(projectRoot, "artifacts/native/phase3");
  const manifest = readJson(path.join(artifactDirectory, "build.json"), "build manifest");
  validateCurrentManifestIdentity(manifest);
  const result = validatePhase3AutomatedEvidence({
    manifest,
    native: readJson(path.join(artifactDirectory, "result.json"), "native"),
    maestro: readJson(path.join(artifactDirectory, "maestro.json"), "Maestro"),
    benchmark: readJson(path.join(artifactDirectory, "benchmark.json"), "benchmark"),
  });
  log(JSON.stringify({ ok: true, ...result }));
  return result;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  executePhase3VerifierCli().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: "phase3_native_evidence_failed",
      message: error.message,
    }));
    process.exitCode = 1;
  });
}

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

/**
 * These are exact coverage claims for the final shared native gate. The Phase
 * 4 command validates identity but never manufactures a device run itself.
 */
export const PHASE4_MAESTRO_FLOW_CONTRACTS = Object.freeze([
  Object.freeze({
    id: "phase4-today-review",
    coverage: Object.freeze([
      "today-current-target-preserved",
      "pending-review-source-navigation",
    ]),
  }),
  Object.freeze({
    id: "phase4-progress-rebuild",
    coverage: Object.freeze([
      "stale-progress-suppressed",
      "targeted-full-rebuild-equivalence",
    ]),
  }),
  Object.freeze({
    id: "phase4-progress-accessibility",
    coverage: Object.freeze(["progress-accessible-equivalence"]),
  }),
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

function exactFlows(flows) {
  if (!Array.isArray(flows)) {
    throw new Error("Phase 4 Maestro evidence is missing flows.");
  }
  const expected = PHASE4_MAESTRO_FLOW_CONTRACTS.map(({ id, coverage }) => ({
    id,
    coverage,
  }));
  const actual = flows.map(({ id, coverage }) => ({ id, coverage }));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Phase 4 Maestro execution coverage is incomplete or stale.");
  }
  for (const flow of flows) {
    if (
      flow.tests < 1
      || flow.failures !== 0
      || flow.errors !== 0
      || flow.skipped !== 0
    ) {
      throw new Error(`Phase 4 Maestro flow did not pass: ${String(flow.id)}`);
    }
  }
}

export function validatePhase4MaestroEvidence(evidence, manifest) {
  if (
    evidence?.schema_version !== 1
    || evidence?.suite !== "phase4"
    || evidence?.status !== "passed"
    || evidence?.mode !== "automated-only"
    || evidence?.approval_status !== "evidence_pending"
    || evidence?.physical_review !== "deferred_final_gate"
  ) {
    throw new Error("Phase 4 Maestro evidence did not pass as automated-only evidence.");
  }
  exactIdentity("Phase 4 Maestro", evidence, manifest);
  exactFlows(evidence.flows);
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function parseArgs(args) {
  const options = { manifestArgument: "artifacts/native/phase4/build.json" };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--manifest requires a value.");
      }
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

function canonicalManifestPath(manifestArgument) {
  if (manifestArgument !== "artifacts/native/phase4/build.json") {
    throw new Error("Phase 4 manifest must be artifacts/native/phase4/build.json.");
  }
  return path.join(projectRoot, manifestArgument);
}

export function validatePhase4CandidateManifest(manifest) {
  if (
    manifest?.schema_version !== 1
    || manifest?.suite !== "phase4"
    || manifest?.profile !== "development-test"
    || manifest?.build_variant !== "release"
    || manifest?.js_bundle?.embedded !== true
    || !/^[a-f0-9]{40}$/u.test(manifest?.base_head ?? "")
    || !/^[a-f0-9]{64}$/u.test(manifest?.source_tree_sha256 ?? "")
    || !/^[a-f0-9]{64}$/u.test(manifest?.apk?.sha256 ?? "")
  ) {
    throw new Error("Phase 4 build manifest is invalid.");
  }
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

export async function executePhase4MaestroCli({
  args = process.argv.slice(2),
} = {}) {
  const { manifestArgument } = parseArgs(args);
  const manifestPath = canonicalManifestPath(manifestArgument);
  if (!existsSync(manifestPath)) {
    throw new Error("Phase 4 exact-HEAD native build manifest is missing.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  validatePhase4CandidateManifest(manifest);
  validateCurrentCandidate(manifest);
  throw new Error(
    "Phase 4 Maestro generation is deferred until the final shared native verification gate.",
  );
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  executePhase4MaestroCli().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: "phase4_maestro_deferred",
      message: error.message,
    }));
    process.exitCode = 1;
  });
}

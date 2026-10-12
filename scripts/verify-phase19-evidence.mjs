#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import {
  PHASE19_REQUIREMENT_EVIDENCE_IDS,
  buildPhase19NativeRows,
  derivePhase19NativeIdentity,
  validateAndHashPhase19ObservationArtifacts,
} from "./run-phase19-native-evidence.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_HEAD = /^[a-f0-9]{40}$/u;
const EXPECTED_REQUIREMENTS = Object.freeze(
  Array.from({ length: 18 }, (_, index) => `PRO-${String(index + 1).padStart(2, "0")}`),
);

function evidenceRecord(requirement, evidenceId, taskId, refs) {
  return Object.freeze({
    requirement,
    evidence_id: evidenceId,
    task_id: taskId,
    host: Object.freeze({ status: "PASS", refs: Object.freeze(refs) }),
    native: Object.freeze({
      status: "NOT_RUN",
      owner: "phase20",
      required_case_id: evidenceId,
      required_capture_id: `${evidenceId}:capture`,
      required_trace_id: `${evidenceId}:trace`,
    }),
  });
}

export const PHASE19_REQUIREMENT_EVIDENCE = Object.freeze([
  evidenceRecord("PRO-01", "progress.sport-range", "19-03-01", [
    "src/ui/__tests__/ProgressScreen.test.tsx",
    "app/__tests__/progress-route.test.tsx",
  ]),
  evidenceRecord("PRO-02", "progress.all", "19-02-02", [
    "src/domains/progress/dashboardProjection.test.ts",
    "tests/sqlite-host/progressRepository.test.ts",
  ]),
  evidenceRecord("PRO-03", "progress.strength", "19-01-03", [
    "src/domains/progress/dashboardProjection.test.ts",
    "src/ui/__tests__/ProgressScreen.test.tsx",
  ]),
  evidenceRecord("PRO-04", "progress.running", "19-01-02", [
    "src/domains/progress/dashboardProjection.test.ts",
    "src/testing/contracts/progressParity.contract.test.ts",
  ]),
  evidenceRecord("PRO-05", "progress.fixed-goal", "19-01-02", [
    "src/domains/progress/runningPacing.test.ts",
    "src/testing/contracts/progressParity.contract.test.ts",
  ]),
  evidenceRecord("PRO-06", "progress.unset-goals", "19-03-02", [
    "src/domains/progress/dashboardProjection.test.ts",
    "src/ui/__tests__/ProgressScreen.test.tsx",
  ]),
  evidenceRecord("PRO-07", "progress.running-source-states", "19-03-02", [
    "src/ui/__tests__/ProgressScreen.test.tsx",
    "tests/sqlite-host/progressRepository.test.ts",
  ]),
  evidenceRecord("PRO-08", "progress.progress-errors", "19-02-02", [
    "tests/sqlite-host/progressRepository.test.ts",
    "src/bootstrap/workoutAppRuntime.test.tsx",
  ]),
  evidenceRecord("PRO-09", "progress.history-sheet", "19-04-02", [
    "src/ui/__tests__/FactualHistoryChart.test.tsx",
    "src/ui/__tests__/RunningHistorySheet.test.tsx",
  ]),
  evidenceRecord("PRO-10", "progress.exercise-history-route", "19-05-03", [
    "src/ui/__tests__/ExerciseHistoryScreen.test.tsx",
    "app/exercise-history/__tests__/exercise-history-route.test.tsx",
  ]),
  evidenceRecord("PRO-11", "progress.relative-view", "19-05-02", [
    "src/domains/progress/relativeStrength.test.ts",
    "tests/sqlite-host/historyRepository.test.ts",
  ]),
  evidenceRecord("PRO-12", "progress.target-editor", "19-06-01", [
    "src/ui/__tests__/RunningTargetSheet.test.tsx",
    "src/bootstrap/runningPlanRuntime.test.tsx",
  ]),
  evidenceRecord("PRO-13", "progress.target-persistence", "19-06-02", [
    "src/domains/running/commands.test.ts",
    "tests/integration/running-foundation.test.ts",
    "src/testing/contracts/progressParity.contract.test.ts",
  ]),
  evidenceRecord("PRO-14", "progress.recommendation", "19-07-01", [
    "src/domains/progression/recommendationCommands.test.ts",
    "src/ui/__tests__/RecommendationSurface.test.tsx",
  ]),
  evidenceRecord("PRO-15", "progress.recommendation-persistence", "19-07-02", [
    "src/domains/progression/recommendationCommands.test.ts",
    "tests/integration/load-reps.test.ts",
  ]),
  evidenceRecord("PRO-16", "progress.progress-settings", "19-08-03", [
    "src/ui/__tests__/ProgressSettingsSheet.test.tsx",
    "src/ui/__tests__/ProgressScreen.test.tsx",
  ]),
  evidenceRecord("PRO-17", "progress.bodyweight-history", "19-08-03", [
    "src/ui/__tests__/BodyweightHistorySheet.test.tsx",
    "tests/integration/bodyweight-history.test.ts",
  ]),
  evidenceRecord("PRO-18", "progress.bodyweight-editor", "19-08-02", [
    "src/domains/bodyweight/contracts.test.ts",
    "src/domains/bodyweight/commands.test.ts",
    "tests/integration/bodyweight-history.test.ts",
  ]),
]);

function fail(code) {
  throw new Error(code);
}

function exactKeys(value, expected) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function privateKey(key, value) {
  if (/^(?:raw_rows?|route_points?|coordinates?|latitude|longitude|heart_rates?|hr_values?|filenames?|file_uri|provider_subject|external_ids?|sql_parameters?|credentials?|password|secret|access_token|refresh_token|owner_identifier|account_namespace)$/iu.test(key)) {
    return true;
  }
  return /^(?:bodyweight|weight)_(?:kg|grams?|value|values)$/iu.test(key)
    && (typeof value === "number" || Array.isArray(value));
}

export function validatePhase19Privacy(value) {
  const visit = (entry) => {
    if (typeof entry === "string") {
      if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(entry)
        || /(?:file|content):\/\//iu.test(entry)) {
        fail("phase19_evidence_privacy_invalid");
      }
      return;
    }
    if (Array.isArray(entry)) {
      for (const item of entry) visit(item);
      return;
    }
    if (typeof entry !== "object" || entry === null) return;
    for (const [key, nested] of Object.entries(entry)) {
      if (privateKey(key, nested)) fail("phase19_evidence_privacy_invalid");
      visit(nested);
    }
  };
  visit(value);
  return true;
}

function validateSourceRegistry() {
  if (
    PHASE19_REQUIREMENT_EVIDENCE.length !== EXPECTED_REQUIREMENTS.length
    || PHASE19_REQUIREMENT_EVIDENCE.some((record, index) =>
      record.requirement !== EXPECTED_REQUIREMENTS[index]
      || record.evidence_id !== PHASE19_REQUIREMENT_EVIDENCE_IDS[index]
      || !/^19-(?:0[1-9]|10)-0[1-3]$/u.test(record.task_id)
      || record.host.status !== "PASS"
      || record.host.refs.length === 0
      || record.host.refs.some((file) => !existsSync(file))
      || record.native.status !== "NOT_RUN"
      || record.native.owner !== "phase20")
    || new Set(PHASE19_REQUIREMENT_EVIDENCE.map(({ requirement }) => requirement)).size !== 18
    || new Set(PHASE19_REQUIREMENT_EVIDENCE.map(({ evidence_id }) => evidence_id)).size !== 18
  ) fail("phase19_evidence_source_registry_invalid");
  return true;
}

export function buildPhase19AutomatedOnlyReport(source) {
  validateSourceRegistry();
  if (!GIT_HEAD.test(source?.source_head ?? "") || !SHA256.test(source?.source_tree_sha256 ?? "")) {
    fail("phase19_evidence_source_identity_invalid");
  }
  return Object.freeze({
    schema_version: 1,
    suite: "phase19-progress",
    mode: "automated-only",
    status: "REVIEW_REQUIRED",
    source_status: "PASS",
    native_status: "NOT_RUN",
    phase20_owned: true,
    source: Object.freeze({
      head: source.source_head,
      tree_sha256: source.source_tree_sha256,
    }),
    requirements: Object.freeze(PHASE19_REQUIREMENT_EVIDENCE.map((record) => Object.freeze({
      requirement: record.requirement,
      evidence_id: record.evidence_id,
      task_id: record.task_id,
      host_status: record.host.status,
      host_refs: record.host.refs,
      native_status: record.native.status,
      native_owner: record.native.owner,
      required_case_id: record.native.required_case_id,
      required_capture_id: record.native.required_capture_id,
      required_trace_id: record.native.required_trace_id,
    }))),
    prohibited_claims: Object.freeze([
      "release approval",
      "attended approval",
      "Phase 20 acceptance",
      "aggregate score",
    ]),
  });
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function configurationSha256(configuration) {
  return createHash("sha256").update(canonicalJson(configuration)).digest("hex");
}

export async function validatePhase19NativeEvidenceRows(
  evidence,
  expectedIdentity,
  expectedRows,
  outputRoot,
) {
  validateSourceRegistry();
  validatePhase19Privacy(evidence);
  const identityKeys = [
    "source_head", "source_tree_sha256", "build_manifest_sha256",
    "build_producer_sha256", "flow_sha256", "apk_sha256", "installed_apk_sha256",
    "device_identity_sha256", "package", "profile",
  ];
  const rowKeys = ["id", "evidence_id", "configuration_id", "status", "observations"];
  const observationKeys = [
    "id", "motion_mode", "input_mode", "status", "configuration_sha256", "artifacts",
  ];
  const artifactKinds = [
    "semantic", "focus", "viewport", "target_bounds", "performance", "capture",
  ];
  if (
    !exactKeys(evidence, ["schema_version", "suite", "producer", "status", "identity", "rows"])
    || evidence.schema_version !== 2
    || evidence.suite !== "phase19-progress"
    || evidence.producer !== "phase19-native-evidence/v2"
    || evidence.status !== "PASS"
    || !exactKeys(evidence.identity, identityKeys)
    || canonicalJson(evidence.identity) !== canonicalJson(expectedIdentity)
    || evidence.identity.installed_apk_sha256 !== evidence.identity.apk_sha256
    || !Array.isArray(evidence.rows)
    || evidence.rows.length !== expectedRows.length
  ) fail("phase19_evidence_native_invalid");

  const retainedPaths = new Set();
  for (let rowIndex = 0; rowIndex < expectedRows.length; rowIndex += 1) {
    const row = evidence.rows[rowIndex];
    const expectedRow = expectedRows[rowIndex];
    if (
      !exactKeys(row, rowKeys)
      || row.id !== expectedRow.id
      || row.evidence_id !== expectedRow.evidence_id
      || row.configuration_id !== expectedRow.configuration.id
      || row.status !== "PASS"
      || !Array.isArray(row.observations)
      || row.observations.length !== expectedRow.observations.length
    ) fail("phase19_evidence_native_invalid");
    for (let index = 0; index < expectedRow.observations.length; index += 1) {
      const observation = row.observations[index];
      const expectedObservation = expectedRow.observations[index];
      const expectedConfiguration = {
        ...expectedRow.configuration,
        motion_mode: expectedObservation.motion_mode,
        input_mode: expectedObservation.input_mode,
      };
      if (
        !exactKeys(observation, observationKeys)
        || observation.id !== expectedObservation.id
        || observation.motion_mode !== expectedObservation.motion_mode
        || observation.input_mode !== expectedObservation.input_mode
        || observation.status !== "PASS"
        || observation.configuration_sha256 !== configurationSha256(expectedConfiguration)
        || !exactKeys(observation.artifacts, artifactKinds)
      ) fail("phase19_evidence_native_invalid");
      const artifactPaths = Object.fromEntries(artifactKinds.map((kind) => [
        kind,
        observation.artifacts[kind]?.artifact_path,
      ]));
      let recomputed;
      try {
        recomputed = await validateAndHashPhase19ObservationArtifacts(
          outputRoot,
          artifactPaths,
          {
            row_id: expectedRow.id,
            observation_id: expectedObservation.id,
            configuration: expectedConfiguration,
          },
        );
      } catch {
        fail("phase19_evidence_native_invalid");
      }
      for (const kind of artifactKinds) {
        const retained = observation.artifacts[kind];
        if (
          !exactKeys(retained, ["artifact_path", "sha256", "size_bytes"])
          || canonicalJson(retained) !== canonicalJson(recomputed[kind])
          || retainedPaths.has(retained.artifact_path)
        ) fail("phase19_evidence_native_invalid");
        retainedPaths.add(retained.artifact_path);
      }
    }
  }
  return true;
}

export async function validatePhase19NativeEvidence(evidence, context) {
  const derived = await derivePhase19NativeIdentity(context);
  return validatePhase19NativeEvidenceRows(
    evidence,
    derived.identity,
    buildPhase19NativeRows(),
    context.output_root,
  );
}

export function parsePhase19EvidenceArgs(args) {
  if (args.length !== 1 || args[0] !== "--automated-only") {
    fail("phase19_evidence_arguments_invalid");
  }
  return Object.freeze({ automated_only: true });
}

export function executePhase19EvidenceCli(args = process.argv.slice(2), root = process.cwd()) {
  parsePhase19EvidenceArgs(args);
  const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  return buildPhase19AutomatedOnlyReport({
    source_head: sourceHead,
    source_tree_sha256: sourceTreeSha256(root),
  });
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    process.stdout.write(`${JSON.stringify(executePhase19EvidenceCli())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: "phase19_evidence_verification_failed",
      message: error instanceof Error ? error.message : "phase19_evidence_verification_failed",
    })}\n`);
    process.exitCode = 1;
  }
}

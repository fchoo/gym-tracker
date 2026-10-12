import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PHASE19_REQUIREMENT_EVIDENCE,
  buildPhase19AutomatedOnlyReport,
  validatePhase19NativeEvidence,
  validatePhase19Privacy,
} from "./verify-phase19-evidence.mjs";
import {
  PHASE19_REQUIREMENT_EVIDENCE_IDS,
  buildPhase19NativeRows,
} from "./run-phase19-native-evidence.mjs";

const HASH = "a".repeat(64);
const HEAD = "b".repeat(40);

function identity(overrides = {}) {
  return {
    source_head: HEAD,
    source_tree_sha256: HASH,
    apk_sha256: HASH,
    installed_apk_sha256: HASH,
    device_identity_sha256: HASH,
    package: "com.fchoo.gymtracker.devtest",
    profile: "development-test",
    ...overrides,
  };
}

function nativeEvidence(overrides = {}) {
  const rows = buildPhase19NativeRows().map((source) => ({
    id: source.id,
    evidence_id: source.evidence_id,
    configuration_id: source.configuration.id,
    status: "PASS",
    configuration_sha256: HASH,
    semantic_sha256: HASH,
    focus_sha256: HASH,
    viewport_sha256: HASH,
    target_bounds_sha256: HASH,
    performance_sha256: HASH,
    capture_sha256: HASH,
  }));
  return {
    schema_version: 1,
    suite: "phase19-progress",
    producer: "phase19-native-evidence/v1",
    status: "PASS",
    identity: identity(),
    rows,
    ...overrides,
  };
}

test("Phase 19 owns one exact source evidence record for each PRO requirement", () => {
  assert.deepEqual(PHASE19_REQUIREMENT_EVIDENCE.map(({ requirement }) => requirement),
    Array.from({ length: 18 }, (_, index) => `PRO-${String(index + 1).padStart(2, "0")}`));
  assert.deepEqual(PHASE19_REQUIREMENT_EVIDENCE.map(({ evidence_id }) => evidence_id),
    PHASE19_REQUIREMENT_EVIDENCE_IDS);
  assert.equal(new Set(PHASE19_REQUIREMENT_EVIDENCE.map(({ task_id }) => task_id)).size > 1, true);
  for (const record of PHASE19_REQUIREMENT_EVIDENCE) {
    assert.match(record.task_id, /^19-(?:0[1-9]|10)-0[1-3]$/u);
    assert.equal(record.host.status, "PASS");
    assert.ok(record.host.refs.length > 0);
    assert.deepEqual(record.native, {
      status: "NOT_RUN",
      owner: "phase20",
      required_case_id: record.evidence_id,
      required_capture_id: `${record.evidence_id}:capture`,
      required_trace_id: `${record.evidence_id}:trace`,
    });
  }
});

test("automated-only report passes source contracts while retaining every native deferral", () => {
  const report = buildPhase19AutomatedOnlyReport({
    source_head: HEAD,
    source_tree_sha256: HASH,
  });

  assert.equal(report.source_status, "PASS");
  assert.equal(report.native_status, "NOT_RUN");
  assert.equal(report.status, "REVIEW_REQUIRED");
  assert.equal(report.phase20_owned, true);
  assert.equal(report.requirements.length, 18);
  assert.deepEqual(report.requirements.map(({ native_status }) => native_status),
    Array(18).fill("NOT_RUN"));
  assert.doesNotMatch(JSON.stringify(report), /release_approved|attended_approved|aggregate[_-]?score/iu);
});

test("future native validation binds all 1,152 rows and rejects identity, omission, privacy, and claim drift", () => {
  const complete = nativeEvidence();
  assert.equal(validatePhase19NativeEvidence(complete, identity()), true);

  const missing = nativeEvidence();
  missing.rows = missing.rows.slice(1);
  const staleInstalled = nativeEvidence({ identity: identity({ installed_apk_sha256: "c".repeat(64) }) });
  const score = nativeEvidence({ aggregate_score: 100 });
  const release = nativeEvidence({ release_approved: true });
  const privateRoute = nativeEvidence({ route_points: [{ latitude: 1, longitude: 2 }] });
  const fakeCount = nativeEvidence({ total: 999 });
  for (const value of [missing, staleInstalled, score, release, privateRoute, fakeCount]) {
    assert.throws(
      () => validatePhase19NativeEvidence(value, identity()),
      /phase19_evidence_/u,
    );
  }
});

test("privacy scanner rejects personal payload fields and values recursively", () => {
  for (const value of [
    { raw_rows: [] },
    { nested: { bodyweight_kg: 75 } },
    { nested: { heart_rate: 150 } },
    { nested: { sql_parameters: ["owner"] } },
    { nested: { file_uri: "file:///private/evidence.json" } },
    { nested: { provider_subject: "external-123" } },
    { nested: { credentials: "secret" } },
    { nested: { note: "owner@example.invalid" } },
  ]) {
    assert.throws(() => validatePhase19Privacy(value), /phase19_evidence_privacy_invalid/u);
  }
  assert.equal(validatePhase19Privacy({ codes: ["progress_ok"], hashes: [HASH], counts: [1] }), true);
});

test("coverage gate registers every Phase 19 integrity module and preserves Phase 16 focus modes", () => {
  const coverageSource = readFileSync("scripts/run-coverage-gate.mjs", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const required = [
    "src/domains/progress/dashboardProjection.ts",
    "src/domains/progress/runningPacing.ts",
    "src/domains/progress/periodProjection.ts",
    "src/platform/sqlite/repositories/progressRepository.ts",
    "src/domains/progress/relativeStrength.ts",
    "src/domains/history/metricHistory.ts",
    "src/platform/sqlite/repositories/historyRepository.ts",
    "src/domains/running/commands.ts",
    "src/platform/sqlite/repositories/runningPlanRepository.ts",
    "src/domains/progression/recommendationCommands.ts",
    "src/domains/bodyweight/contracts.ts",
    "src/domains/bodyweight/commands.ts",
    "src/domains/portability/backupContracts.ts",
    "src/domains/portability/mergePlan.ts",
    "src/domains/portability/restoreCommands.ts",
    "src/platform/sqlite/migrations/0045_recommendation_decision_receipts.ts",
    "src/platform/sqlite/repositories/logicalBackupRepository.ts",
    "src/platform/sqlite/repositories/logicalRestoreRepository.ts",
    "src/platform/sqlite/repositories/logicalMergeRepository.ts",
  ];
  assert.ok(coverageSource.includes("const phase19IntegrityCriticalFiles"));
  assert.ok(coverageSource.includes("--focus-phase19"));
  assert.ok(coverageSource.includes("focusPhase16Evidence"));
  for (const file of required) assert.ok(coverageSource.includes(file), file);
  assert.match(packageJson.scripts["test:coverage:integrity"], /--focus-phase19/u);
  assert.match(packageJson.scripts["test:evidence:phase19"], /verify-phase19-evidence\.test\.mjs/u);
  assert.match(packageJson.scripts["verify:phase19:evidence"], /verify-phase19-evidence\.mjs/u);
});

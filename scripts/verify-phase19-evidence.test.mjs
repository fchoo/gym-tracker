import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PHASE19_REQUIREMENT_EVIDENCE,
  buildPhase19AutomatedOnlyReport,
  validatePhase19NativeEvidenceRows,
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
    build_manifest_sha256: HASH,
    build_producer_sha256: HASH,
    flow_sha256: HASH,
    apk_sha256: HASH,
    installed_apk_sha256: HASH,
    device_identity_sha256: HASH,
    package: "com.fchoo.gymtracker.devtest",
    profile: "development-test",
    ...overrides,
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function nativeEvidence(root, overrides = {}) {
  const source = buildPhase19NativeRows()[0];
  const observations = source.observations.map((observation) => {
    const artifacts = {};
    for (const kind of [
      "semantic", "focus", "viewport", "target_bounds", "performance", "capture",
    ]) {
      const artifactPath = `${observation.id.replace(":", "-")}-${kind}.${kind === "capture" ? "png" : "json"}`;
      const common = {
        schema_version: 1,
        artifact_kind: kind,
        row_id: source.id,
        observation_id: observation.id,
        status: "PASS",
        assertions: [{ id: `${kind}-assertion`, status: "PASS" }],
      };
      const document = kind === "semantic"
        ? { ...common, summary: { nodes_checked: 3, violations: 0 } }
        : kind === "focus"
        ? { ...common, focus: { expected_return: "progress-root", observed_return: "progress-root", matches: true } }
        : kind === "viewport"
        ? { ...common, viewport: {
          width: source.configuration.width,
          height: source.configuration.height,
          orientation: source.configuration.orientation,
          font_scale: source.configuration.font_scale,
          clipped_nodes: 0,
        } }
        : kind === "target_bounds"
        ? { ...common, target_bounds: { targets_checked: 4, violations: 0 } }
        : { ...common, performance: { samples_ms: [1, 2, 3], max_js_task_ms: 3 } };
      const bytes = kind === "capture"
        ? Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("synthetic")])
        : Buffer.from(JSON.stringify(document));
      writeFileSync(join(root, artifactPath), bytes);
      artifacts[kind] = {
        artifact_path: artifactPath,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        size_bytes: statSync(join(root, artifactPath)).size,
      };
    }
    return {
      id: observation.id,
      motion_mode: observation.motion_mode,
      input_mode: observation.input_mode,
      status: "PASS",
      configuration_sha256: createHash("sha256").update(canonicalJson({
        ...source.configuration,
        motion_mode: observation.motion_mode,
        input_mode: observation.input_mode,
      })).digest("hex"),
      artifacts,
    };
  });
  return {
    schema_version: 2,
    suite: "phase19-progress",
    producer: "phase19-native-evidence/v2",
    status: "PASS",
    identity: identity(),
    rows: [{
      id: source.id,
      evidence_id: source.evidence_id,
      configuration_id: source.configuration.id,
      status: "PASS",
      observations,
    }],
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

test("future native validation rehashes retained bytes and rejects identity, omission, privacy, and claim drift", async () => {
  const root = mkdtempSync(join(tmpdir(), "phase19-native-verifier-"));
  try {
    const expectedRows = [buildPhase19NativeRows()[0]];
    const complete = nativeEvidence(root);
    assert.equal(await validatePhase19NativeEvidenceRows(
      complete, identity(), expectedRows, root,
    ), true);

    const variants = [
      { ...nativeEvidence(root), rows: [] },
      nativeEvidence(root, { identity: identity({ installed_apk_sha256: "c".repeat(64) }) }),
      nativeEvidence(root, { aggregate_score: 100 }),
      nativeEvidence(root, { release_approved: true }),
      nativeEvidence(root, { route_points: [{ latitude: 1, longitude: 2 }] }),
      nativeEvidence(root, { total: 999 }),
    ];
    for (const value of variants) {
      await assert.rejects(
        validatePhase19NativeEvidenceRows(value, identity(), expectedRows, root),
        /phase19_evidence_/u,
      );
    }

    const tampered = nativeEvidence(root);
    const capture = tampered.rows[0].observations[0].artifacts.capture.artifact_path;
    writeFileSync(join(root, capture), "tampered");
    await assert.rejects(
      validatePhase19NativeEvidenceRows(tampered, identity(), expectedRows, root),
      /phase19_evidence_native_invalid/u,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
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

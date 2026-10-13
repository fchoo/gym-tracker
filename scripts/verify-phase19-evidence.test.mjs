import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  PHASE19_HOST_CASE_IDS,
  PHASE19_HOST_COMMAND_IDS,
  PHASE19_REQUIREMENT_EVIDENCE,
  buildPhase19AutomatedOnlyReport,
  validatePhase19HostManifest,
  validatePhase19NativeEvidenceRows,
  validatePhase19Privacy,
} from "./verify-phase19-evidence.mjs";
import {
  PHASE19_REQUIREMENT_EVIDENCE_IDS,
  buildPhase19NativeRows,
} from "./run-phase19-native-evidence.mjs";
import {
  PHASE19_PROGRESS_BUDGETS,
  evaluatePhase19ProgressBenchmark,
} from "./benchmark-phase19-progress.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";

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

const repeated = (count, value) => Array.from(
  { length: count },
  (_, index) => value + (index % 3),
);

function hostFixture(root) {
  const retained = (name, value) => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    writeFileSync(join(root, name), bytes);
    return {
      path: name,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size_bytes: bytes.length,
    };
  };
  const now = "2026-10-13T01:00:00.000Z";
  const commands = PHASE19_HOST_COMMAND_IDS.map((id, index) => ({
    id,
    status: "PASS",
    exit_code: 0,
    started_at: "2026-10-13T00:00:00.000Z",
    finished_at: "2026-10-13T00:59:00.000Z",
    stdout: retained(`${index}-${id}.stdout`, `${id}:pass\n`),
    stderr: retained(`${index}-${id}.stderr`, ""),
  }));
  const contract = {
    schemaVersion: 1,
    contractVersion: 1,
    status: "passed",
    total: 18,
    passed: 18,
    failed: 0,
    skipped: 0,
    cases: PHASE19_HOST_CASE_IDS.map((id, index) => ({
      id,
      requirement: `PRO-${String(index + 1).padStart(2, "0")}`,
      status: "passed",
      code: "progress_contract_case_passed",
      counts: {},
      timings: { durationMs: 1 },
      hashes: {
        source: createHash("sha256").update(`source-${id}`).digest("hex"),
        projection: createHash("sha256").update(`projection-${id}`).digest("hex"),
        receipt: createHash("sha256").update(`receipt-${id}`).digest("hex"),
      },
    })),
    startedAt: "2026-10-13T00:00:00.000Z",
    finishedAt: "2026-10-13T00:30:00.000Z",
  };
  const benchmark = evaluatePhase19ProgressBenchmark({
    schema_version: 2,
    suite: "phase19-progress",
    producer: "phase19-progress-benchmark/v2",
    environment: "host-production-workload",
    status: "passed",
    native_status: "NOT_RUN",
    phase20_owned: true,
    budgets: PHASE19_PROGRESS_BUDGETS,
    production_artifact: {
      case_id: "phase19-progress-production-workload",
      source_sha256: HASH,
      result_sha256: HASH,
    },
    measurements: {
      useful_content_ms: repeated(20, 1),
      review_open_ms: repeated(100, 1),
      targeted_rebuild_ms: repeated(20, 1),
      range_query_ms: repeated(100, 1),
      chart_data_render_ms: repeated(20, 1),
      js_task_ms: repeated(100, 1),
    },
    query_rows: { case_id: "progress-repository-query-rows", samples: [0, 1, 500] },
    targeted_rebuild: { updating_visible: false, bounded_yield_count: 20 },
  });
  const coverage = {
    ok: true,
    integrity_critical_files: 23,
    focused: true,
    metrics: ["statements", "branches", "functions", "lines"],
    required_percent: 100,
    changed_line_scope_files: 4,
  };
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const manifest = {
    schema_version: 1,
    suite: "phase19-progress-host",
    producer: "run-phase19-host-evidence/v1",
    producer_sha256: createHash("sha256")
      .update(readFileSync("scripts/run-phase19-host-evidence.mjs"))
      .digest("hex"),
    run_id: HASH,
    status: "PASS",
    source: { head: currentHead, tree_sha256: sourceTreeSha256(process.cwd()) },
    commands,
    contract_result: retained("contract.json", JSON.stringify(contract)),
    benchmark_result: retained("benchmark.json", JSON.stringify(benchmark)),
    coverage_result: retained("coverage.json", JSON.stringify(coverage)),
    generated_at: now,
  };
  return { manifest, contract };
}

test("Phase 19 owns one exact source evidence record for each PRO requirement", () => {
  assert.deepEqual(PHASE19_REQUIREMENT_EVIDENCE.map(({ requirement }) => requirement),
    Array.from({ length: 18 }, (_, index) => `PRO-${String(index + 1).padStart(2, "0")}`));
  assert.deepEqual(PHASE19_REQUIREMENT_EVIDENCE.map(({ evidence_id }) => evidence_id),
    PHASE19_REQUIREMENT_EVIDENCE_IDS);
  assert.equal(new Set(PHASE19_REQUIREMENT_EVIDENCE.map(({ task_id }) => task_id)).size > 1, true);
  for (const [index, record] of PHASE19_REQUIREMENT_EVIDENCE.entries()) {
    assert.match(record.task_id, /^19-(?:0[1-9]|10)-0[1-3]$/u);
    assert.equal(record.host.required_case_id, PHASE19_HOST_CASE_IDS[index]);
    assert.equal(record.host.required_test_id, `progress-parity/${PHASE19_HOST_CASE_IDS[index]}`);
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

test("automated-only report rehashes fresh host results while retaining every native deferral", () => {
  const root = mkdtempSync(join(tmpdir(), "phase19-host-verifier-"));
  try {
    const { manifest } = hostFixture(root);
    assert.ok(validatePhase19HostManifest(manifest, {
      root: process.cwd(), artifact_root: root,
    }));
    const report = buildPhase19AutomatedOnlyReport(manifest, {
      root: process.cwd(), artifact_root: root,
    });

    assert.equal(report.source_status, "PASS");
    assert.equal(report.native_status, "NOT_RUN");
    assert.equal(report.status, "REVIEW_REQUIRED");
    assert.equal(report.phase20_owned, true);
    assert.equal(report.requirements.length, 18);
    assert.deepEqual(report.requirements.map(({ host_status }) => host_status),
      Array(18).fill("PASS"));
    assert.deepEqual(report.requirements.map(({ native_status }) => native_status),
      Array(18).fill("NOT_RUN"));
    assert.doesNotMatch(JSON.stringify(report), /release_approved|attended_approved|aggregate[_-]?score/iu);

    writeFileSync(join(root, manifest.commands[0].stdout.path), "tampered");
    assert.throws(
      () => validatePhase19HostManifest(manifest, {
        root: process.cwd(), artifact_root: root,
      }),
      /phase19_evidence_host_artifact_invalid/u,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
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
  const manifest = JSON.parse(readFileSync(
    "scripts/phase19-integrity-coverage.json",
    "utf8",
  ));
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
    "src/bootstrap/runningPlanRuntime.tsx",
    "src/domains/progression/recommendationCommands.ts",
    "src/platform/sqlite/repositories/workoutOutcomeRepository.ts",
    "src/bootstrap/trainingFoundationRuntime.ts",
    "src/bootstrap/workoutAppRuntime.tsx",
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
  assert.deepEqual(manifest.required_files, required);
  assert.deepEqual(manifest.changed_line_scope.map(({ path }) => path), [
    "src/bootstrap/runningPlanRuntime.tsx",
    "src/platform/sqlite/repositories/workoutOutcomeRepository.ts",
    "src/bootstrap/trainingFoundationRuntime.ts",
    "src/bootstrap/workoutAppRuntime.tsx",
  ]);
  assert.deepEqual(manifest.unreachable_coverage, [{
    path: "src/bootstrap/workoutAppRuntime.tsx",
    line: 4765,
    metrics: ["statements", "branches", "lines"],
    reason: "The local command is assigned immediately before this defensive assertion and cannot be cleared or observed as undefined in JavaScript execution.",
  }]);
  const changedModules = execFileSync("git", [
    "diff", "--name-only", `${manifest.diff_base}..${manifest.diff_head}`,
  ], { encoding: "utf8" }).split(/\r?\n/u).filter((filePath) =>
    /^(?:src|app)\/.*\.tsx?$/u.test(filePath)
    && !/\.test\.|\/__tests__\/|^src\/testing\//u.test(filePath));
  const classified = new Set([
    ...manifest.required_files,
    ...manifest.reviewed_exclusions.map(({ path }) => path),
  ]);
  assert.deepEqual(changedModules.filter((filePath) => !classified.has(filePath)), []);
  assert.deepEqual([...classified].filter((filePath) =>
    !changedModules.includes(filePath) && !manifest.supporting_files.includes(filePath)), []);
  assert.match(coverageSource, /focusPhase16Evidence/u);
  assert.match(coverageSource, /argument === "--coverageDirectory"/u);
  assert.match(coverageSource, /changedScopeFailures/u);
  assert.match(coverageSource, /--coverageThreshold=\{\}/u);
  assert.match(packageJson.scripts["test:coverage:integrity"], /--focus-phase19/u);
  assert.match(packageJson.scripts["test:evidence:phase19"], /verify-phase19-evidence\.test\.mjs/u);
  assert.match(packageJson.scripts["verify:phase19:evidence"], /run-phase19-host-evidence\.mjs/u);
  assert.match(packageJson.scripts["verify:phase19:evidence:retained"], /verify-phase19-evidence\.mjs/u);
});

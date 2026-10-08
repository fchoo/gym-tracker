import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PHASE13_HOST_GATES,
  PHASE13_MIGRATION_CASE_IDS,
  PHASE13_MULTI_PLAN_RUNNING_CASE_IDS,
  PHASE13_PORTABLE_MERGE_CASE_IDS,
  PHASE13_SCHEMA_VERSION,
  parsePhase13VerifierArgs,
  validatePhase13AutomatedEvidence,
  validatePhase13CurrentArtifacts,
  validatePhase13Privacy,
} from "./verify-phase13-evidence.mjs";

const HEAD = "a".repeat(40);
const SOURCE_SHA256 = "b".repeat(64);
const APK_BYTES = Buffer.from("phase13-apk");
const APK_SHA256 = createHash("sha256").update(APK_BYTES).digest("hex");
const MANIFEST_PATH = "artifacts/native/phase13/build.json";
const APK_PATH = "artifacts/native/phase13/gym-tracker-phase13-devtest.apk";

function fixture() {
  const manifest = {
    schema_version: 1,
    suite: "phase13",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: HEAD,
    source_tree_sha256: SOURCE_SHA256,
    package: "com.fchoo.gymtracker.devtest",
    apk: {
      path: APK_PATH,
      sha256: APK_SHA256,
      size_bytes: APK_BYTES.length,
      page_alignment_kib: 16,
      page_alignment_verified: true,
    },
    installed_apk: {
      device_path: "/data/app/com.fchoo.gymtracker.devtest/base.apk",
      sha256: APK_SHA256,
      matches_retained_apk: true,
    },
    device: {
      role: "automated-test-device",
      serial: "emulator-5554",
      api: 36,
      abi: "arm64-v8a",
      model: "sdk_gphone64_arm64",
      android_release: "16",
    },
    started_at: "2026-10-08T00:00:00.000Z",
    finished_at: "2026-10-08T00:00:03.000Z",
  };
  const result = (suite, ids) => ({
    schema_version: 1,
    suite,
    status: "passed",
    build_manifest: MANIFEST_PATH,
    base_head: HEAD,
    source_tree_sha256: SOURCE_SHA256,
    package: manifest.package,
    apk: manifest.apk,
    installed_apk: manifest.installed_apk,
    device: manifest.device,
    contract: {
      version: 1,
      expected_count: ids.length,
      total: ids.length,
      passed: ids.length,
      failed: 0,
      skipped: 0,
      cases: ids.map((id) => ({ id, status: "passed", durationMs: 1 })),
      started_at: "2026-10-08T00:00:00.000Z",
      finished_at: "2026-10-08T00:00:01.000Z",
    },
    runner: {
      run_id: `${suite}-1`,
      started_at: "2026-10-08T00:00:00.000Z",
      finished_at: "2026-10-08T00:00:02.000Z",
    },
  });
  return {
    manifest,
    migrations: result("migrations-effects", PHASE13_MIGRATION_CASE_IDS),
    portableMerge: result("portable-merge", PHASE13_PORTABLE_MERGE_CASE_IDS),
    multiPlanRunning: result(
      "multi-plan-running",
      PHASE13_MULTI_PLAN_RUNNING_CASE_IDS,
    ),
    ownerDecisions: {
      schema_version: 1,
      milestone: "v1.2",
      source: "direct_owner_reply",
      decisions: {
        "MAP-01": { status: "approved", selection: "one-per-sport" },
        "TIM-01": {
          status: "approved",
          selection: "retire-playback",
          legacy_playback_compatibility: false,
        },
      },
      product_decisions_pending: 0,
    },
  };
}

test("accepts only complete Phase 13 evidence and records automated-only scope", () => {
  const evidence = validatePhase13AutomatedEvidence(fixture());
  assert.equal(evidence.schema_version, 1);
  assert.equal(evidence.suite, "phase13");
  assert.equal(evidence.status, "passed");
  assert.equal(evidence.mode, "automated-only");
  assert.equal(evidence.approval_status, "evidence_pending");
  assert.equal(evidence.attended_scope, "excluded");
  assert.equal(evidence.release_scope, "excluded");
  assert.equal(evidence.database_schema_version, PHASE13_SCHEMA_VERSION);
  assert.equal(evidence.device.role, "automated-test-device");
  assert.equal(
    evidence.native["migrations-effects"].cases,
    `${PHASE13_MIGRATION_CASE_IDS.length}/${PHASE13_MIGRATION_CASE_IDS.length}`,
  );
  assert.equal(
    evidence.native["portable-merge"].cases,
    `${PHASE13_PORTABLE_MERGE_CASE_IDS.length}/${PHASE13_PORTABLE_MERGE_CASE_IDS.length}`,
  );
  assert.equal(
    evidence.native["multi-plan-running"].cases,
    `${PHASE13_MULTI_PLAN_RUNNING_CASE_IDS.length}/${PHASE13_MULTI_PLAN_RUNNING_CASE_IDS.length}`,
  );
  assert.deepEqual(evidence.owner_decisions, {
    "MAP-01": "one-per-sport",
    "TIM-01": "retire-playback",
    legacy_playback_compatibility: false,
  });
});

test("rejects stale schema, source, artifact, package, device, case, and decision evidence", () => {
  const mutations = [
    (value) => { value.manifest.schema_version = 2; },
    (value) => { value.migrations.source_tree_sha256 = "0".repeat(64); },
    (value) => { value.portableMerge.apk.sha256 = "0".repeat(64); },
    (value) => { value.multiPlanRunning.package = "com.example.wrong"; },
    (value) => { value.multiPlanRunning.device.role = "samsung-attended"; },
    (value) => { value.migrations.contract.cases.pop(); },
    (value) => {
      value.portableMerge.contract.cases[1].id =
        value.portableMerge.contract.cases[0].id;
    },
    (value) => {
      value.multiPlanRunning.contract.cases[0].status = "failed";
      value.multiPlanRunning.contract.failed = 1;
      value.multiPlanRunning.contract.passed -= 1;
    },
    (value) => { value.migrations.contract.skipped = 1; },
    (value) => { value.ownerDecisions.decisions["MAP-01"].selection = "many"; },
    (value) => {
      value.ownerDecisions.decisions["TIM-01"].legacy_playback_compatibility = true;
    },
  ];
  for (const mutate of mutations) {
    const value = fixture();
    mutate(value);
    assert.throws(() => validatePhase13AutomatedEvidence(value));
  }
});

test("rejects current source, retained APK, and installed APK drift", () => {
  const { manifest } = fixture();
  const valid = {
    manifest,
    currentHead: HEAD,
    currentSourceTreeSha256: SOURCE_SHA256,
    retainedApkBytes: APK_BYTES,
    installedApkBytes: APK_BYTES,
    installedPackagePath: manifest.installed_apk.device_path,
  };
  assert.doesNotThrow(() => validatePhase13CurrentArtifacts(valid));
  for (const overrides of [
    { currentHead: "0".repeat(40) },
    { currentSourceTreeSha256: "0".repeat(64) },
    { retainedApkBytes: Buffer.from("stale") },
    { installedApkBytes: Buffer.from("stale") },
    { installedPackagePath: "/data/app/other/base.apk" },
  ]) {
    assert.throws(() => validatePhase13CurrentArtifacts({ ...valid, ...overrides }));
  }
});

test("recursively rejects sensitive payloads while allowing aggregate evidence", () => {
  assert.doesNotThrow(() => validatePhase13Privacy({
    case_id: "phase13-merge-rebuild",
    count: 14,
    sha256: "a".repeat(64),
    apk_path: APK_PATH,
  }));
  const forbidden = [
    { workout_rows: [{ id: "w1" }] },
    { imported_activity: { normalized: true } },
    { bodyweight_rows: [{ kilograms: 80 }] },
    { route_points: [[1, 2]] },
    { heart_rate: 140 },
    { filename: "morning-run.fit" },
    { evidence: "morning-run.fit" },
    { sql_parameters: ["owner"] },
    { access_token: "secret" },
    { authorization: "Bearer secret" },
    { owner_id: "person-1" },
    { email: "person@example.com" },
  ];
  for (const value of forbidden) {
    assert.throws(() => validatePhase13Privacy(value));
  }
});

test("owns exact CLI mode and host gates", () => {
  assert.deepEqual(parsePhase13VerifierArgs([
    "--manifest",
    MANIFEST_PATH,
    "--automated-only",
  ]), { manifest: MANIFEST_PATH, automatedOnly: true });
  assert.deepEqual(PHASE13_HOST_GATES, [
    ["run", "typecheck"],
    ["run", "lint"],
    ["run", "test:all", "--", "--runInBand"],
  ]);
  for (const args of [
    [],
    ["--manifest", MANIFEST_PATH],
    ["--automated-only", "--unknown"],
    ["--manifest", "artifacts/native/phase12/build.json", "--automated-only"],
  ]) {
    assert.throws(() => parsePhase13VerifierArgs(args));
  }
});

test("package, native runner, and build manifest expose the Phase 13 evidence path", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(
    packageJson.scripts["test:evidence:phase13"],
    "node --test scripts/verify-phase13-evidence.test.mjs",
  );
  assert.equal(
    packageJson.scripts["verify:phase13:evidence"],
    "node scripts/verify-phase13-evidence.mjs",
  );
  const runner = readFileSync("scripts/run-native-sqlite-contracts.mjs", "utf8");
  assert.match(
    runner,
    /manifestSuite === 'phase13'[\s\S]*?requestedSuite === 'migrations-effects'/u,
  );
  assert.match(
    runner,
    /manifestSuite === 'phase13'[\s\S]*?requestedSuite === 'portable-merge'/u,
  );
  assert.match(
    runner,
    /manifestSuite === 'phase13'[\s\S]*?requestedSuite === 'multi-plan-running'/u,
  );
  const route = readFileSync("app/__native-contracts.tsx", "utf8");
  assert.match(route, /configuredSuite === "phase13"[\s\S]*?"multi-plan-running"/u);
  assert.match(route, /configuredSuite === "phase13"[\s\S]*?candidate === "migrations-effects"/u);
  assert.match(route, /configuredSuite === "phase13"[\s\S]*?candidate === "portable-merge"/u);
  assert.match(route, /configuredSuite === "phase13"[\s\S]*?candidate === "multi-plan-running"/u);
  assert.match(
    readFileSync("scripts/build-current-native-test-apk.sh", "utf8"),
    /role: 'automated-test-device'/u,
  );
});

test("the completed-set correction hash remains bundle-safe", () => {
  const repository = readFileSync(
    "src/platform/sqlite/repositories/workoutRepository.ts",
    "utf8",
  );
  assert.doesNotMatch(repository, /from "node:crypto"/u);
  assert.match(repository, /runtimeSha256/u);
  const nativeHashPort = readFileSync(
    "src/platform/crypto/runtimeSha256.native.ts",
    "utf8",
  );
  assert.match(nativeHashPort, /digestStringAsync/u);
  assert.match(nativeHashPort, /CryptoDigestAlgorithm\.SHA256/u);
  assert.doesNotMatch(nativeHashPort, /node:crypto/u);
});

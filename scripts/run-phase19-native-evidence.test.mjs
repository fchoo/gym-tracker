import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";

import {
  PHASE19_INPUT_MODES,
  PHASE19_MOTION_MODES,
  PHASE19_NATIVE_SCENARIOS,
  PHASE19_REQUIREMENT_EVIDENCE_IDS,
  buildPhase19ConfigurationMatrix,
  buildPhase19NativeRows,
  createPhase19NativeRunPlan,
  executePhase19NativeEvidence,
  hashPhase19ObservationArtifacts,
  parsePhase19NativeEvidenceArgs,
  validatePhase19NativeManifest,
  validatePhase19NativeFlow,
} from "./run-phase19-native-evidence.mjs";

const HASH = "a".repeat(64);
const HEAD = "b".repeat(40);

function manifest() {
  return {
    schema_version: 1,
    suite: "phase19",
    profile: "development-test",
    package: "com.fchoo.gymtracker.devtest",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: HEAD,
    source_tree_sha256: HASH,
    package: "com.fchoo.gymtracker.devtest",
    apk: {
      path: "artifacts/native/phase19/gym-tracker-phase19-devtest.apk",
      sha256: HASH,
      size_bytes: 123,
      page_alignment_kib: 16,
      page_alignment_verified: true,
    },
    installed_apk: {
      device_path: "/data/app/synthetic/base.apk",
      sha256: HASH,
      matches_retained_apk: true,
    },
    package_launch: {
      component: "com.fchoo.gymtracker.devtest/.MainActivity",
      succeeded: true,
    },
    device: {
      role: "automated-test-device",
      serial: "synthetic-device",
      api: 36,
      abi: "arm64-v8a",
      model: "Synthetic",
      android_release: "16",
      identity_sha256: phase18DeviceIdentitySha256({
        serial: "synthetic-device",
        abi: "arm64-v8a",
        apiLevel: "36",
        model: "Synthetic",
      }),
    },
    toolchain: {
      node: "24.19.0",
      npm: "11.6.2",
      java: "17.0.20+8",
      android_api: 36,
      build_tools: "36.0.0",
      ndk: "27.1.12297006",
    },
    started_at: "2026-10-13T00:00:00Z",
    finished_at: "2026-10-13T00:01:00Z",
  };
}

test("Phase 19 native source owns every requirement row and the full 64-render configuration matrix", () => {
  assert.deepEqual(PHASE19_REQUIREMENT_EVIDENCE_IDS, [
    "progress.sport-range",
    "progress.all",
    "progress.strength",
    "progress.running",
    "progress.fixed-goal",
    "progress.unset-goals",
    "progress.running-source-states",
    "progress.progress-errors",
    "progress.history-sheet",
    "progress.exercise-history-route",
    "progress.relative-view",
    "progress.target-editor",
    "progress.target-persistence",
    "progress.recommendation",
    "progress.recommendation-persistence",
    "progress.progress-settings",
    "progress.bodyweight-history",
    "progress.bodyweight-editor",
  ]);
  assert.deepEqual(PHASE19_MOTION_MODES, ["normal", "reduced"]);
  assert.deepEqual(PHASE19_INPUT_MODES, [
    "touch",
    "software-keyboard",
    "hardware-keyboard",
    "dpad",
  ]);
  assert.ok(PHASE19_NATIVE_SCENARIOS.includes("no-write-dismissal"));
  assert.ok(PHASE19_NATIVE_SCENARIOS.includes("target-lost-ack-replay"));
  assert.ok(PHASE19_NATIVE_SCENARIOS.includes("bodyweight-private-failure"));

  const configurations = buildPhase19ConfigurationMatrix();
  assert.equal(configurations.length, 64);
  assert.equal(new Set(configurations.map(({ id }) => id)).size, 64);
  assert.deepEqual(new Set(configurations.map(({ appearance }) => appearance)), new Set([
    "light",
    "dark",
    "system-on-light",
    "system-on-dark",
  ]));
  assert.deepEqual(new Set(configurations.map(({ orientation }) => orientation)), new Set([
    "portrait",
    "landscape",
  ]));
  assert.deepEqual(new Set(configurations.map(({ font_scale }) => font_scale)), new Set([1, 2]));
  assert.deepEqual(new Set(configurations.filter(({ orientation }) => orientation === "portrait").map(({ viewport }) => viewport)), new Set([
    "360x800", "390x844", "600x960", "840x1080",
  ]));
  assert.deepEqual(new Set(configurations.filter(({ orientation }) => orientation === "landscape").map(({ viewport }) => viewport)), new Set([
    "800x360", "844x390", "960x600", "1080x840",
  ]));

  const rows = buildPhase19NativeRows();
  assert.equal(rows.length, PHASE19_REQUIREMENT_EVIDENCE_IDS.length * 64);
  assert.equal(new Set(rows.map(({ id }) => id)).size, rows.length);
  assert.ok(rows.every(({ native_status, phase20_owned, observations }) =>
    native_status === "NOT_RUN"
      && phase20_owned === true
      && observations.length === PHASE19_MOTION_MODES.length * PHASE19_INPUT_MODES.length
      && new Set(observations.map(({ id }) => id)).size === observations.length));
});

test("Phase 19 run plan binds exact artifact identity without claiming native PASS", () => {
  const plan = createPhase19NativeRunPlan(manifest(), "c".repeat(64), {
    build_manifest_sha256: "d".repeat(64),
    build_producer_sha256: "e".repeat(64),
  });

  assert.equal(plan.native_execution, "NOT_RUN");
  assert.equal(plan.acceptance_authority, "phase20");
  assert.equal(plan.rows.length, 18 * 64);
  assert.equal(plan.identity.apk_sha256, HASH);
  assert.equal(plan.identity.installed_apk_sha256, HASH);
  assert.equal(plan.identity.build_manifest_sha256, "d".repeat(64));
  assert.equal(plan.identity.build_producer_sha256, "e".repeat(64));
  assert.equal(plan.identity.flow_sha256, "c".repeat(64));
  assert.deepEqual(plan.allowed_pre_execution_statuses, ["NOT_RUN", "REVIEW_REQUIRED"]);
  assert.doesNotMatch(JSON.stringify(plan), /"status":"PASS"|release_approved|attended_approved/iu);
});

test("Phase 19 accepts only the exact manifest emitted by the native build producer", () => {
  assert.equal(validatePhase19NativeManifest(manifest()), true);
  const reduced = manifest();
  delete reduced.toolchain;
  assert.throws(
    () => validatePhase19NativeManifest(reduced),
    /phase19_native_manifest_invalid/u,
  );
  const producer = readFileSync("scripts/build-current-native-test-apk.sh", "utf8");
  for (const field of ["package_launch", "page_alignment_kib", "toolchain", "started_at"] ) {
    assert.ok(producer.includes(field), field);
  }
});

test("Phase 19 Maestro source covers the semantic journey and every scenario marker", () => {
  const flow = readFileSync("maestro/phase19/progress-parity.yaml", "utf8");

  assert.equal(validatePhase19NativeFlow(flow), true);
  for (const marker of [
    "Progress",
    "All",
    "Strength",
    "Running",
    "4 weeks",
    "12 weeks",
    "All time",
    "Open history",
    "Save target",
    "Keep target unchanged",
    "Use target",
    "Body metrics",
    "PHASE19_SCENARIO",
  ]) {
    assert.ok(flow.includes(marker), marker);
  }
});

test("Phase 19 native execution is fail-closed behind explicit Phase 20 authority", () => {
  assert.deepEqual(parsePhase19NativeEvidenceArgs([
    "--manifest", "artifacts/native/phase19/build.json",
    "--plan-only",
  ]), {
    manifest: "artifacts/native/phase19/build.json",
    mode: "plan-only",
  });
  for (const args of [
    [],
    ["--manifest", "artifacts/native/phase19/build.json"],
    ["--manifest", "wrong.json", "--plan-only"],
    ["--manifest", "artifacts/native/phase19/build.json", "--execute"],
    ["--manifest", "artifacts/native/phase19/build.json", "--phase19-authorized"],
  ]) {
    assert.throws(
      () => parsePhase19NativeEvidenceArgs(args),
      /phase19_native_evidence_arguments_invalid|phase19_native_execution_phase20_only/u,
    );
  }
});

test("Phase 19 orchestration restores device settings after an identity failure", async () => {
  let restored = false;
  await assert.rejects(
    executePhase19NativeEvidence({
      manifest: manifest(),
      flow_sha256: "c".repeat(64),
      build_manifest_sha256: "d".repeat(64),
      build_producer_sha256: "e".repeat(64),
      phase20_authorized: true,
      driver: {
        captureSettings: async () => ({ token: "synthetic-settings" }),
        applyConfiguration: async () => undefined,
        restoreSettings: async () => { restored = true; },
      },
    }),
    /phase19_native_/u,
  );
  assert.equal(restored, true);
});

test("Phase 19 native execution rejects opaque driver hash claims without retained bytes", async () => {
  let restored = false;
  await assert.rejects(
    executePhase19NativeEvidence({
      manifest: manifest(),
      flow_sha256: "c".repeat(64),
      build_manifest_sha256: "d".repeat(64),
      build_producer_sha256: "e".repeat(64),
      phase20_authorized: true,
      driver: {
        captureSettings: async () => ({ token: "synthetic-settings" }),
        applyConfiguration: async () => undefined,
        runRow: async () => ({
          status: "PASS",
          semantic_sha256: HASH,
          focus_sha256: HASH,
          viewport_sha256: HASH,
          target_bounds_sha256: HASH,
          performance_sha256: HASH,
          capture_sha256: HASH,
        }),
        restoreSettings: async () => { restored = true; },
      },
    }),
    /phase19_native_/u,
  );
  assert.equal(restored, true);
});

test("Phase 19 hashes retained observation bytes and rejects path traversal", async () => {
  const root = mkdtempSync(join(tmpdir(), "phase19-native-artifacts-"));
  try {
    const paths = {};
    for (const key of [
      "semantic", "focus", "viewport", "target_bounds", "performance", "capture",
    ]) {
      paths[key] = `${key}.json`;
      writeFileSync(join(root, paths[key]), JSON.stringify({ key, status: "PASS" }));
    }
    const hashed = await hashPhase19ObservationArtifacts(root, paths);
    for (const artifact of Object.values(hashed)) {
      assert.match(artifact.sha256, /^[a-f0-9]{64}$/u);
      assert.ok(artifact.size_bytes > 0);
    }
    await assert.rejects(
      hashPhase19ObservationArtifacts(root, { ...paths, capture: "../outside.json" }),
      /phase19_native_artifact_path_invalid/u,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("native SQLite orchestration bounds every adb command and subprocess output", () => {
  const runner = readFileSync("scripts/run-native-sqlite-contracts.mjs", "utf8");
  assert.match(runner, /NATIVE_MAX_ADB_CALLS/u);
  assert.match(runner, /NATIVE_SUBPROCESS_MAX_OUTPUT_BYTES/u);
  assert.match(runner, /timeoutMs = DEFAULT_NATIVE_TIMEOUT_MS/u);
  assert.match(runner, /timeoutMs:\s*NATIVE_ADB_COMMAND_TIMEOUT_MS/u);
  assert.match(runner, /validatePhase19NativeManifest/u);
});

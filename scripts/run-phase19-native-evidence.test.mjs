import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PHASE19_INPUT_MODES,
  PHASE19_MOTION_MODES,
  PHASE19_NATIVE_SCENARIOS,
  PHASE19_REQUIREMENT_EVIDENCE_IDS,
  buildPhase19ConfigurationMatrix,
  buildPhase19NativeRows,
  createPhase19NativeRunPlan,
  parsePhase19NativeEvidenceArgs,
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
    apk: {
      path: "artifacts/native/phase19/gym-tracker-phase19.apk",
      sha256: HASH,
      size_bytes: 123,
    },
    installed_apk: { sha256: HASH, matches_retained_apk: true },
    device: { identity_sha256: HASH },
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
  assert.ok(rows.every(({ native_status, phase20_owned, motion_modes, input_modes }) =>
    native_status === "NOT_RUN"
      && phase20_owned === true
      && motion_modes === PHASE19_MOTION_MODES
      && input_modes === PHASE19_INPUT_MODES));
});

test("Phase 19 run plan binds exact artifact identity without claiming native PASS", () => {
  const plan = createPhase19NativeRunPlan(manifest(), "c".repeat(64));

  assert.equal(plan.native_execution, "NOT_RUN");
  assert.equal(plan.acceptance_authority, "phase20");
  assert.equal(plan.rows.length, 18 * 64);
  assert.equal(plan.identity.apk_sha256, HASH);
  assert.equal(plan.identity.installed_apk_sha256, HASH);
  assert.equal(plan.flow_sha256, "c".repeat(64));
  assert.deepEqual(plan.allowed_pre_execution_statuses, ["NOT_RUN", "REVIEW_REQUIRED"]);
  assert.doesNotMatch(JSON.stringify(plan), /"status":"PASS"|release_approved|attended_approved/iu);
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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  PHASE10_EVIDENCE_MATRIX,
  PHASE10_MAESTRO_FLOW_CONTRACTS,
  validatePhase10Manifest,
  validatePhase10Evidence,
} from "./run-phase10-maestro.mjs";

const projectRoot = process.cwd();

test("Phase 10 runner preserves historical evidence IDs while retiring timing flows under TIM-01", () => {
  assert.deepEqual(
    PHASE10_MAESTRO_FLOW_CONTRACTS.map(({ flow }) => flow),
    [],
  );
  assert.deepEqual(
    PHASE10_EVIDENCE_MATRIX.map(({ id }) => id),
    [
      "WORK-26",
      "D-01",
      "D-02",
      "D-03",
      "D-04",
      "ROADMAP-10-01",
      "ROADMAP-10-02",
      "ROADMAP-10-03",
      "ROADMAP-10-04",
    ],
  );
  const byId = new Map(PHASE10_EVIDENCE_MATRIX.map((entry) => [entry.id, entry]));
  assert.match(byId.get("D-01")?.source ?? "", /workoutAppRuntime.test/u);
  assert.equal(byId.get("D-02")?.retiredBy, "TIM-01");
  assert.equal(byId.get("D-03")?.retiredBy, "TIM-01");
  assert.equal(byId.get("D-04")?.retiredBy, "TIM-01");
  assert.deepEqual(byId.get("WORK-26")?.flows, []);
});

test("Phase 10 runner fails closed for missing matrix items and wrong build identity", () => {
  const completeEvidence = {
    schema_version: 1,
    suite: "phase10",
    status: "passed",
    build_manifest: "artifacts/native/phase10/build.json",
    apk_sha256: "a".repeat(64),
    matrix: PHASE10_EVIDENCE_MATRIX,
    flows: PHASE10_MAESTRO_FLOW_CONTRACTS.map(({ id, flow }) => ({
      id,
      flow,
      tests: 1,
      failures: 0,
      errors: 0,
      skipped: 0,
    })),
  };
  assert.doesNotThrow(() => validatePhase10Evidence(completeEvidence));
  assert.throws(() => validatePhase10Evidence({
    ...completeEvidence,
    build_manifest: "artifacts/native/migrations-effects/build.json",
  }), /Phase 10 evidence is incomplete/u);
  assert.throws(() => validatePhase10Evidence({
    ...completeEvidence,
    matrix: PHASE10_EVIDENCE_MATRIX.filter(({ id }) => id !== "D-04"),
  }), /D-04/u);
  assert.throws(() => validatePhase10Evidence({
    ...completeEvidence,
    flows: [{ tests: 1, failures: 1, errors: 0, skipped: 0 }],
  }), /Phase 10 evidence is incomplete/u);
});

test("Phase 10 runner rejects a retained APK whose bytes disagree with the manifest", () => {
  const sourceIdentity = {
    baseHead: "b".repeat(40),
    sourceTreeSha256: "c".repeat(64),
  };
  const manifest = {
    schema_version: 1,
    profile: "development-test",
    suite: "phase10",
    package: "com.fchoo.gymtracker.devtest",
    base_head: sourceIdentity.baseHead,
    source_tree_sha256: sourceIdentity.sourceTreeSha256,
    device: { serial: "emulator-5554" },
    apk: { path: "artifacts/native/phase10/app.apk", sha256: "a".repeat(64) },
  };

  assert.doesNotThrow(() => validatePhase10Manifest(
    manifest,
    "/retained/app.apk",
    "a".repeat(64),
    sourceIdentity,
  ));
  assert.throws(() => validatePhase10Manifest(
    manifest,
    "/retained/app.apk",
    "b".repeat(64),
    sourceIdentity,
  ), /APK bytes do not match/u);
  assert.throws(() => validatePhase10Manifest(
    manifest,
    "/retained/app.apk",
    "a".repeat(64),
    { ...sourceIdentity, baseHead: "d".repeat(40) },
  ), /source identity/u);
  assert.throws(() => validatePhase10Manifest(
    manifest,
    "/retained/app.apk",
    "a".repeat(64),
    { ...sourceIdentity, sourceTreeSha256: "e".repeat(64) },
  ), /source identity/u);
});

test("Phase 10 artifact permits only the packaged migrations-effects contract", async () => {
  const nativeRunner = await readFile(
    path.join(projectRoot, "scripts/run-native-sqlite-contracts.mjs"),
    "utf8",
  );

  assert.match(nativeRunner, /manifestSuite === 'phase10'/u);
  assert.match(nativeRunner, /requestedSuite === 'migrations-effects'/u);
  assert.ok(nativeRunner.includes(
    "manifestSupportsRequestedSuite(manifest.suite, suite)",
  ));
});

test("Phase 10 source evidence asserts TIM-01 timing retirement", async () => {
  const runtime = await readFile(
    path.join(projectRoot, "src/bootstrap/workoutAppRuntime.tsx"),
    "utf8",
  );
  const activeWorkoutScreen = await readFile(
    path.join(projectRoot, "src/ui/screens/ActiveWorkoutScreen.tsx"),
    "utf8",
  );
  const componentIndex = await readFile(
    path.join(projectRoot, "src/ui/components/index.ts"),
    "utf8",
  );

  assert.doesNotMatch(runtime, /advancedTimingRepository/u);
  assert.doesNotMatch(runtime, /createAdvancedTimingRepository/u);
  assert.doesNotMatch(runtime, /(?:start|configure|reconcile|pause|resume|stop)AdvancedTiming/u);
  assert.doesNotMatch(runtime, /(?:begin|skip)AdvancedTimingClusterGap/u);
  assert.doesNotMatch(runtime, /createExpoHapticsAdapter\(\)\.cue\(\)/u);
  assert.doesNotMatch(runtime, /advancedTimingCueFailed/u);
  assert.doesNotMatch(activeWorkoutScreen, /AdvancedTiming|advanced timing|cadence|cluster timing|set timing/u);
  assert.doesNotMatch(componentIndex, /AdvancedTiming|advanced timing|cadence|cluster timing|set timing/u);
});

test("Phase 10 runner binds retained APK bytes before device installation", async () => {
  const runner = await readFile(
    path.join(projectRoot, "scripts/run-phase10-maestro.mjs"),
    "utf8",
  );

  assert.match(runner, /function sha256File/u);
  assert.ok(runner.includes(
    "validatePhase10Manifest(manifest, apkPath, sha256File(apkPath));",
  ));
  assert.match(runner, /APK bytes do not match the declared Phase 10 manifest/u);
  assert.match(runner, /sourceTreeSha256/u);
  assert.match(runner, /manifest source identity does not match/u);
  assert.doesNotMatch(runner, /maestro\/phase10\/advanced-set-timing\.yaml/u);
});

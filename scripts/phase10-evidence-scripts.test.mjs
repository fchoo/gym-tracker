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

test("Phase 10 runner declares the advanced timing tracer flow and evidence matrix", () => {
  assert.deepEqual(
    PHASE10_MAESTRO_FLOW_CONTRACTS.map(({ flow }) => flow),
    ["maestro/phase10/advanced-set-timing.yaml"],
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
  assert.match(byId.get("D-02")?.source ?? "", /advanced-timing.test/u);
  assert.match(byId.get("D-03")?.source ?? "", /rest-lifecycle.test/u);
  assert.match(byId.get("D-04")?.source ?? "", /advanced-timing.test/u);
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
    flows: [{
      ...completeEvidence.flows[0],
      failures: 1,
    }],
  }), /flow evidence is invalid/u);
});

test("Phase 10 runner rejects a retained APK whose bytes disagree with the manifest", () => {
  const manifest = {
    schema_version: 1,
    profile: "development-test",
    suite: "phase10",
    package: "com.fchoo.gymtracker.devtest",
    device: { serial: "emulator-5554" },
    apk: { path: "artifacts/native/phase10/app.apk", sha256: "a".repeat(64) },
  };

  assert.doesNotThrow(() => validatePhase10Manifest(
    manifest,
    "/retained/app.apk",
    "a".repeat(64),
  ));
  assert.throws(() => validatePhase10Manifest(
    manifest,
    "/retained/app.apk",
    "b".repeat(64),
  ), /APK bytes do not match/u);
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

test("Phase 10 Maestro flow exercises per-rep and 3+3+3 cluster lifecycle timing", async () => {
  const flow = await readFile(
    path.join(projectRoot, "maestro/phase10/advanced-set-timing.yaml"),
    "utf8",
  );

  assert.match(flow, /^appId: com\.fchoo\.gymtracker\.devtest$/mu);
  assert.match(flow, /WORKOUT OVERVIEW/u);
  assert.ok(flow.indexOf('visible: "Start a workout"')
    < flow.indexOf('visible: "Start Full Body A"'));
  assert.ok(flow.indexOf('visible: "Resume workout"')
    < flow.indexOf('visible: "WORKOUT OVERVIEW"'));
  assert.ok(flow.indexOf('visible: "WORKOUT OVERVIEW"')
    < flow.indexOf('visible: "Back Squat exercise actions"'));
  assert.match(flow, /Back Squat exercise actions/u);
  assert.match(flow, /Configure timing/u);
  assert.match(flow, /Exercise timing/u);
  assert.match(flow, /advanced-timing-config-interval/u);
  assert.match(flow, /Set timing/u);
  assert.match(flow, /advanced-timing-config-cluster-pattern/u);
  assert.match(flow, /Save timing/u);
  assert.match(flow, /Per-rep cadence/u);
  assert.match(flow, /Per-rep interval in seconds/u);
  assert.match(flow, /Configure and start per-rep cadence/u);
  assert.match(flow, /Pause per-rep cadence/u);
  assert.match(flow, /Resume per-rep cadence/u);
  assert.match(flow, /Stop per-rep cadence/u);
  assert.match(flow, /Select cluster timing/u);
  assert.match(flow, /Cluster grouping/u);
  assert.match(flow, /3\+3\+3/u);
  assert.match(flow, /Cluster gap in seconds/u);
  assert.match(flow, /Configure and start cluster timing/u);
  assert.match(flow, /Start rest after group 1/u);
  assert.match(flow, /Skip intra-set rest/u);
  assert.match(flow, /Start rest after group 2/u);
  assert.match(flow, /\^\(Cluster 2 of 3\|Cluster 3 of 3\|Intra-set rest\)/u);
  assert.match(flow, /Complete Set 1/u);
  assert.match(flow, /stopApp[\s\S]*?clearState: false/u);
});

test("Phase 10 source evidence keeps cue failure advisory", async () => {
  const indicator = await readFile(
    path.join(projectRoot, "src/ui/components/AdvancedTimingIndicator.tsx"),
    "utf8",
  );
  const runtime = await readFile(
    path.join(projectRoot, "src/bootstrap/workoutAppRuntime.tsx"),
    "utf8",
  );
  const screenTest = await readFile(
    path.join(projectRoot, "src/ui/__tests__/ActiveWorkoutScreen.test.tsx"),
    "utf8",
  );
  const integration = await readFile(
    path.join(projectRoot, "tests/integration/advanced-timing.test.ts"),
    "utf8",
  );

  assert.match(indicator, /Timing cue unavailable/u);
  assert.match(indicator, /The timer and recorded set remain accurate/u);
  assert.match(indicator, /Cluster timing/u);
  assert.match(indicator, /Start rest after group/u);
  assert.match(indicator, /Skip intra-set rest/u);
  assert.match(runtime, /createExpoHapticsAdapter\(\)\.cue\(\)/u);
  assert.match(runtime, /advancedTimingCueFailed: true/u);
  assert.ok(runtime.includes("Promise.allSettled(cueTasks)"));
  assert.match(screenTest, /Complete Set 1/u);
  assert.ok(screenTest.includes("startManualRest).not.toHaveBeenCalled"));
  assert.match(screenTest, /Timing cue unavailable/u);
  assert.match(integration, /protectedFacts/u);
  assert.match(integration, /persists cluster gaps as advanced-only state and preserves one recorded set/u);
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
});

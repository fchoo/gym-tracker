import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  PHASE10_EVIDENCE_MATRIX,
  PHASE10_MAESTRO_FLOW_CONTRACTS,
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

test("Phase 10 Maestro flow exercises the per-rep advisory lifecycle tracer", async () => {
  const flow = await readFile(
    path.join(projectRoot, "maestro/phase10/advanced-set-timing.yaml"),
    "utf8",
  );

  assert.match(flow, /^appId: com\.fchoo\.gymtracker\.devtest$/mu);
  assert.match(flow, /WORKOUT OVERVIEW/u);
  assert.match(flow, /Per-rep cadence/u);
  assert.match(flow, /Per-rep interval in seconds/u);
  assert.match(flow, /Configure and start per-rep cadence/u);
  assert.match(flow, /Pause per-rep cadence/u);
  assert.match(flow, /Resume per-rep cadence/u);
  assert.match(flow, /Stop per-rep cadence/u);
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

  assert.match(indicator, /Timing cue unavailable/u);
  assert.match(indicator, /The timer and recorded set remain accurate/u);
  assert.match(runtime, /createExpoHapticsAdapter\(\)\.cue\(\)/u);
  assert.match(runtime, /advancedTimingCueFailed: true/u);
  assert.match(screenTest, /Complete Set 1/u);
  assert.match(screenTest, /Timing cue unavailable/u);
});

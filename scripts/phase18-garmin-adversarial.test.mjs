import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT,
  createPhase18GarminAdversarialRunnerPlan,
  executePhase18GarminAdversarialRunner,
  parsePhase18GarminAdversarialRunnerArgs,
} from "./run-phase18-garmin-adversarial.mjs";

const MANIFEST = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/build.json`;
const RECORD = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/native-record.json`;

test("adversarial runner is inert without the explicit Phase 20 authority", () => {
  assert.deepEqual(parsePhase18GarminAdversarialRunnerArgs([
    "--manifest", MANIFEST,
    "--record", RECORD,
  ]), {
    manifest: MANIFEST,
    record: RECORD,
    execute: false,
    phase20Checkpoint: false,
  });
  assert.throws(
    () => parsePhase18GarminAdversarialRunnerArgs([
      "--manifest", MANIFEST,
      "--record", RECORD,
      "--execute",
    ]),
    /phase18_garmin_adversarial_runner_arguments_invalid/u,
  );
  const calls = [];
  assert.deepEqual(executePhase18GarminAdversarialRunner([
    "--manifest", MANIFEST,
    "--record", RECORD,
  ], {
    readJson: (...args) => calls.push(args),
    writeRawReport: (...args) => calls.push(args),
  }), {
    status: "native_deferred",
    final_evidence_written: false,
  });
  assert.deepEqual(calls, []);
});

test("runner plan owns the exact ordered lifecycle prefix and Phase 20 handoff", () => {
  const plan = createPhase18GarminAdversarialRunnerPlan();
  assert.deepEqual(plan.case_ids.slice(0, 6), [
    "PH18-ADV-RESTORE",
    "PH18-ADV-REFRESH",
    "PH18-ADV-READ",
    "PH18-ADV-LOGOUT",
    "PH18-ADV-RESTART",
    "PH18-ADV-LATE-GENERATION",
  ]);
  assert.equal(plan.execution_authority, "phase20-native-checkpoint");
  assert.equal(plan.final_evidence_owner, "phase20-native-checkpoint");
  assert.equal(plan.runner_writes_final_evidence, false);
  assert.equal(plan.real_account_required, true);
});

test("package scripts expose only planning-safe adversarial commands", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  assert.equal(
    scripts["adversarial:phase18:garmin"],
    `node scripts/run-phase18-garmin-adversarial.mjs --manifest ${MANIFEST} --record ${RECORD}`,
  );
  assert.equal(
    scripts["verify:phase18:garmin-adversarial"],
    `node scripts/verify-phase18-garmin-adversarial.mjs --manifest ${MANIFEST}`,
  );
  assert.equal(
    scripts["test:evidence:phase18:garmin-adversarial"],
    "node --test scripts/phase18-garmin-adversarial.test.mjs",
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  PHASE8_MAESTRO_FLOW_CONTRACTS,
  validatePhase8Evidence,
} from "./run-phase8-maestro.mjs";

const projectRoot = process.cwd();

test("Phase 8 runner declares the overview tracer and lifecycle flows", () => {
  assert.deepEqual(
    PHASE8_MAESTRO_FLOW_CONTRACTS.map(({ flow }) => flow),
    [
      "maestro/phase8/session-overview.yaml",
      "maestro/lifecycle/rest-recovery.yaml",
      "maestro/phase2/remediation-workout.yaml",
      "maestro/smoke/phase1-full-loop.yaml",
      "maestro/smoke/phase1-denied-late-notifications.yaml",
    ],
  );
});

test("Phase 8 tracer targets the dev-test package and skips rest before the next set", async () => {
  const flow = await readFile(
    path.join(projectRoot, "maestro/phase8/session-overview.yaml"),
    "utf8",
  );

  assert.match(flow, /^appId: com\.fchoo\.gymtracker\.devtest$/mu);
  assert.match(flow, /Choose your starting plan[\s\S]*?scrollUntilVisible:[\s\S]*?text: "Use Full Body Foundation"[\s\S]*?Activate Full Body Foundation/u);
  assert.match(flow, /notVisible: "Bench Press"[\s\S]*?start: 95%, 75%[\s\S]*?end: 95%, 40%[\s\S]*?assertVisible: "Bench Press"/u);
  assert.match(flow, /pressKey: TAB[\s\S]*?pressKey: ENTER[\s\S]*?assertVisible: "Working set 1 load in kilograms"/u);
  assert.match(flow, /notVisible: "Bench Press"[\s\S]*?assertVisible: "Bench Press"[\s\S]*?notVisible: "Warm-up W1"[\s\S]*?start: 95%, 40%[\s\S]*?end: 95%, 75%[\s\S]*?assertVisible: "Warm-up W1"[\s\S]*?times: 12[\s\S]*?notVisible: "Complete Set 1"[\s\S]*?start: 95%, 75%[\s\S]*?end: 95%, 40%[\s\S]*?assertVisible: "Complete Set 1"/u);
  assert.doesNotMatch(flow, /notVisible: "Back Squat"|assertVisible: "Back Squat"/u);
  assert.doesNotMatch(flow, /(?:start|end): 95%, 25%/u);
  assert.match(flow, /tapOn: "Skip rest"[\s\S]*?notVisible: "Skip rest"[\s\S]*?notVisible: "Complete Set 2"/u);
  assert.match(flow, /More workout actions[\s\S]*?Discard workout[\s\S]*?discard-workout-confirm[\s\S]*?\^\(Choose another day\|Train anyway\)\$[\s\S]*?visible: "Choose another day"[\s\S]*?tapOn: "Choose another day"[\s\S]*?visible: "Train anyway"[\s\S]*?tapOn: "Train anyway"[\s\S]*?Start empty workout/u);
  assert.match(flow, /assertVisible: "Add exercise\. Available in Phase 9\."[\s\S]*?scrollUntilVisible:[\s\S]*?text: "Save zero-set workout"[\s\S]*?direction: DOWN[\s\S]*?centerElement: true[\s\S]*?tapOn: "Save zero-set workout"/u);
  assert.doesNotMatch(flow, /Back Squat\. Completed\. 2 of 2 working sets/u);
});

test("Phase 8 rest recovery traverses upward from the active-set anchor before asserting Back Squat", async () => {
  const flow = await readFile(
    path.join(projectRoot, "maestro/lifecycle/rest-recovery.yaml"),
    "utf8",
  );

  assert.match(flow, /WORKOUT OVERVIEW[\s\S]*?notVisible: "Back Squat"[\s\S]*?start: 95%, 25%[\s\S]*?end: 95%, 75%[\s\S]*?assertVisible: "Back Squat"/u);
  assert.match(flow, /Resume rest[\s\S]*?RESTING · NEXT: SET 2 AT 60 kg × 8[\s\S]*?Expand rest controls[\s\S]*?Skip rest/u);
});

test("Phase 8 evidence fails closed without a verified 200 percent font-scale restoration", () => {
  assert.throws(
    () => validatePhase8Evidence({
      status: "passed",
      font_scale: {
        prior: "1.0",
        applied: "2.0",
        restored: false,
      },
      flows: PHASE8_MAESTRO_FLOW_CONTRACTS.map(({ id, flow }) => ({
        id,
        flow,
        tests: 1,
        failures: 0,
        errors: 0,
        skipped: 0,
      })),
    }),
    /font scale/i,
  );
});

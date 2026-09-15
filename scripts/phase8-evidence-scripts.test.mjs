import assert from "node:assert/strict";
import test from "node:test";

import {
  PHASE8_MAESTRO_FLOW_CONTRACTS,
  validatePhase8Evidence,
} from "./run-phase8-maestro.mjs";

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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PHASE15_NATIVE_MATRIX,
  phase15NativeMatrixPlan,
  validatePhase15NativeMatrix,
} from "./phase15-native-matrix.mjs";

test("Phase 15 tracer binds the root-to-completion journey to the canonical ledger", () => {
  assert.doesNotThrow(() => validatePhase15NativeMatrix(PHASE15_NATIVE_MATRIX));
  const tracer = phase15NativeMatrixPlan().find(({ caseId }) => caseId === "workout.root-identity");
  assert.ok(tracer);
  assert.equal(tracer.flowPath, "maestro/phase15/workout-root.yaml");
  assert.deepEqual(tracer.actions, ["preview", "start", "save", "complete", "rest", "finish", "completion", "keep-plan-as-is"]);
  assert.equal(tracer.visual.referenceViewport, "390x844");
  assert.equal(tracer.visual.hashChain, "reference-native-overlay-difference-sha256");
});

test("Phase 15 tracer flows use only production route actions and ledger stages", () => {
  for (const file of [
    "maestro/phase15/workout-root.yaml",
    "maestro/phase15/active-workout.yaml",
    "maestro/phase15/recovery-completion.yaml",
  ]) {
    const flow = readFileSync(file, "utf8");
    assert.match(flow, /appId: com\.fchoo\.gymtracker\.devtest/u);
    assert.match(flow, /PHASE15_STAGE/u);
    assert.doesNotMatch(flow, /https?:\/\//u);
  }
  const root = readFileSync("maestro/phase15/workout-root.yaml", "utf8");
  assert.match(root, /PHASE15_STAGE == 'workout\.root-identity'/u);
  assert.match(root, /Start Full Body A/u);
  const active = readFileSync("maestro/phase15/active-workout.yaml", "utf8");
  assert.match(active, /PHASE15_STAGE == 'workout\.complete-commit'/u);
  assert.match(active, /tapOn: "Complete Set 1"/u);
  const recovery = readFileSync("maestro/phase15/recovery-completion.yaml", "utf8");
  assert.match(recovery, /PHASE15_STAGE == 'workout\.completion-review'/u);
  assert.match(recovery, /Keep plan as is/u);
});

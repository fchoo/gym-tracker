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
  assert.match(recovery, /Keep plan as-is/u);
});

test("Phase 15 matrix maps every ledger case once, with bounded necessary variants", () => {
  assert.equal(PHASE15_NATIVE_MATRIX.representativeCellCount, 56);
  assert.equal(PHASE15_NATIVE_MATRIX.cells.length, 56);
  assert.deepEqual(PHASE15_NATIVE_MATRIX.viewports.map(({ width, height }) => `${width}x${height}`), [
    "360x800", "390x844", "600x960", "840x1080", "800x360", "960x600", "1080x840",
  ]);
  assert.deepEqual(PHASE15_NATIVE_MATRIX.appearances.map(({ id }) => id), [
    "light", "dark", "system-on-light", "system-on-dark",
  ]);
  assert.deepEqual(PHASE15_NATIVE_MATRIX.fontScales, [1, 2]);
  assert.deepEqual(PHASE15_NATIVE_MATRIX.motion, ["standard", "reduced-motion"]);
  for (const input of ["touch", "keyboard", "dpad", "enter", "space", "back", "escape", "ime-clearance"]) {
    assert.ok(PHASE15_NATIVE_MATRIX.input.includes(input), input);
  }
  const ids = PHASE15_NATIVE_MATRIX.requiredCaseIds;
  assert.equal(ids.length, 42);
  for (const id of ids) {
    const cells = PHASE15_NATIVE_MATRIX.cells.filter((cell) => cell.caseId === id);
    assert.ok(cells.length >= 1, id);
    assert.equal(cells.filter(({ behavior }) => behavior.actionBearing).length, 1, id);
  }
  const editorProfiles = PHASE15_NATIVE_MATRIX.cells
    .filter(({ caseId }) => caseId === "workout.all-metrics")
    .map(({ editorProfile }) => editorProfile)
    .filter(Boolean);
  assert.deepEqual(editorProfiles.sort(), [
    "distance", "duration", "duration-distance", "load", "load-reps", "reps", "reps-distance", "rounds", "timed-reps",
  ]);
});

test("Phase 15 matrix requires native accessibility, recovery, privacy-safe visual capture, and restoration", () => {
  assert.deepEqual(PHASE15_NATIVE_MATRIX.capture, {
    semanticTree: "pre-and-post-each-action",
    focusTrace: "keyboard-dpad-observed",
    targetBounds: "minimum-48dp",
    visualComparison: "reference-native-overlay-difference-sha256",
    privacy: "synthetic-facts-only-recursive-verifier",
  });
  assert.deepEqual(PHASE15_NATIVE_MATRIX.restoreAfterEachCase, [
    "fontScale", "appearance", "orientation", "notificationState", "fixtureDatabase",
  ]);
  assert.equal(PHASE15_NATIVE_MATRIX.cells.filter(({ visual }) => visual?.referenceIds?.length === 1).length, 6);
  assert.ok(PHASE15_NATIVE_MATRIX.cells.some(({ reducedMotion }) => reducedMotion));
  assert.ok(PHASE15_NATIVE_MATRIX.cells.some(({ lifecycle }) => lifecycle === "process-death-offline-restart"));
});

test("Phase 15 flows declare all ledger stages and retain exact accessibility actions", () => {
  const flows = ["workout-root.yaml", "active-workout.yaml", "recovery-completion.yaml"]
    .map((file) => readFileSync(`maestro/phase15/${file}`, "utf8"))
    .join("\n");
  for (const id of PHASE15_NATIVE_MATRIX.requiredCaseIds) assert.match(flows, new RegExp(`PHASE15_STAGE == '${id}'`, "u"));
  for (const action of ["hideKeyboard", "pressKey: \"Escape\"", "pressKey: \"Back\"", "pressKey: \"Remote Dpad Center\""]) {
    assert.match(flows, new RegExp(action.replaceAll(".", "\\\\.").replaceAll("*", "\\\\*"), "u"));
  }
});

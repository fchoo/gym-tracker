import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Phase 9 evidence runner requires a manifest and full edit/relaunch assertions", () => {
  const runner = readFileSync("scripts/run-phase9-maestro.mjs", "utf8");
  const flow = readFileSync("maestro/phase9/in-workout-exercise-editing.yaml", "utf8");
  assert.match(runner, /native build manifest is required/);
  assert.match(runner, /build\.apk\?\.path/);
  assert.match(runner, /maestro\/phase9\/in-workout-exercise-editing\.yaml/);
  assert.match(flow, /appId: com\.fchoo\.gymtracker\.devtest/);
  assert.match(flow, /Choose your starting plan/);
  assert.match(flow, /Activate Full Body Foundation/);
  assert.match(flow, /Start empty workout/);
  assert.match(flow, /tapOn: "Add Back Squat"/);
  assert.match(flow, /tapOn: "\.\*Add exercise"\n- pressKey: Back\n- scrollUntilVisible:[\s\S]*text: "Add Back Squat"[\s\S]*- tapOn: "Add Back Squat"/);
  assert.doesNotMatch(flow, /tapOn: "Add \.\*"/);
  assert.match(flow, /Add exercise/);
  const addedExerciseAssertion =
    /^- assertVisible: '\^Back Squat\\\. Added\\\. 0 of 1 working sets\\\. Collapse exercise\$'$/gmu;
  assert.equal(
    [...flow.matchAll(addedExerciseAssertion)].length,
    1,
    "Phase 9 must assert the exact unique added-exercise accessibility label before relaunch",
  );
  assert.match(flow, /- assertVisible: '\^Working sets\$'/u);
  assert.doesNotMatch(flow, /- assertVisible: "Added"/u);
  assert.match(flow, /arm_replace_exercise_failure/);
  assert.match(flow, /Replace exercise failure armed/);
  assert.match(flow, /Replace exercise failure armed[\s\S]*?scrollUntilVisible:[\s\S]*?text: "Return to Today"[\s\S]*?tapOn: "Return to Today"/u);
  assert.match(flow, /inputText: "Bench Press"[\s\S]*?tapOn:\n    id: "replace-exercise-option-5f140001-7e35-4a6d-9100-000000000002"[\s\S]*?scrollUntilVisible:[\s\S]*?text: "Replace with Bench Press"[\s\S]*?tapOn: "Replace with Bench Press"/u);
  assert.match(flow, /Retry replacing exercise/);
  assert.match(flow, /arm_remove_exercise_failure/);
  assert.match(flow, /Remove exercise failure armed/);
  assert.match(flow, /Remove exercise failure armed[\s\S]*?scrollUntilVisible:[\s\S]*?text: "Return to Today"[\s\S]*?tapOn: "Return to Today"/u);
  assert.match(flow, /Retry removing exercise/);
  assert.match(flow, /Keep exercise/);
  assert.match(flow, /This exercise has completed sets. They will be retained and this exercise will be marked Skipped, not deleted./);
  assert.match(flow, /Skipped/);
  assert.match(flow, /Complete Set 1/);
  assert.match(flow, /stopApp/);
  assert.match(flow, /clearState: false/);
  assert.match(flow, /clearState: false[\s\S]*- assertVisible: '\^Back Squat · Working set 1 · Rest idle\$'/u);
});

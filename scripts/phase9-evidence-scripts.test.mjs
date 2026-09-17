import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PHASE9_EVIDENCE_MATRIX,
  PHASE9_MAESTRO_FLOW_CONTRACTS,
  validatePhase9Evidence,
} from "./run-phase9-maestro.mjs";

test("Phase 9 evidence runner requires a manifest and full edit/relaunch assertions", () => {
  const runner = readFileSync("scripts/run-phase9-maestro.mjs", "utf8");
  const flow = readFileSync("maestro/phase9/in-workout-exercise-editing.yaml", "utf8");
  const keepFlow = readFileSync(
    "maestro/phase9/completed-workout-plan-writeback-keep.yaml",
    "utf8",
  );
  const retryFlow = readFileSync(
    "maestro/phase9/completed-workout-plan-writeback-retry.yaml",
    "utf8",
  );
  assert.match(runner, /native manifest identity does not match the current Phase 9 source/);
  assert.match(runner, /export const PHASE9_MAESTRO_FLOW_CONTRACTS/);
  assert.match(runner, /export const PHASE9_EVIDENCE_MATRIX/);
  assert.match(runner, /export function validatePhase9Evidence/);
  assert.match(runner, /phase9-maestro\.json/);
  assert.match(runner, /verify-phase9-v20-native-evidence\.mjs/);
  assert.match(runner, /verify-phase9-task1-boundary\.mjs/);
  assert.match(runner, /sourceTreeSha256/);
  assert.match(runner, /installed APK bytes do not match/u);
  assert.match(runner, /typeof installedPath !== "string"/u);
  assert.doesNotMatch(
    runner,
    /installedPath !== manifest.installed_apk.device_path/u,
    "Android may reassign the package install path after the runner reinstalls the exact APK",
  );
  assert.match(runner, /--format", "junit"/);
  for (const id of [
    "D-01", "D-02", "D-03", "D-04", "D-05", "D-06", "D-07", "D-08",
    "WORK-20", "WORK-21", "WORK-22", "WORK-23", "WORK-24", "WORK-25", "WORK-27",
    "ROADMAP-09-01", "ROADMAP-09-02", "ROADMAP-09-03", "ROADMAP-09-04", "ROADMAP-09-05", "ROADMAP-09-06",
    "UI-populated", "UI-partial", "UI-overflow", "UI-zero-one-many", "UI-long-text", "UI-loading", "UI-empty", "UI-error",
    "UI-themes", "UI-widths", "UI-font-scale-2", "UI-reduced-motion", "UI-role-name-state", "UI-focus-input", "UI-minimum-target", "UI-non-color",
  ]) {
    assert.match(runner, new RegExp(`id: "${id}"`, "u"));
  }
  assert.match(runner, /manifest\.apk\?\.sha256/);
  assert.match(runner, /manifest\.device\?\.serial/);
  assert.match(runner, /--udid/);
  assert.match(runner, /maestro\/phase9\/in-workout-exercise-editing\.yaml/);
  assert.match(runner, /completed-workout-plan-writeback-keep\.yaml/);
  assert.match(runner, /completed-workout-plan-writeback-retry\.yaml/);
  assert.match(runner, /for \(const contract of flows\)/);
  assert.match(runner, /const PHASE9_SCHEDULED_WORKOUT_CLOCK = "091812002026"/);
  assert.match(runner, /command\(adb, \["-s", serial, "root"\]\)/);
  assert.match(runner, /command\(adb, \["-s", serial, "wait-for-device"\]\)/);
  assert.match(runner, /const adbUser = command\(adb, \["-s", serial, "shell", "id"\]\)/);
  assert.match(runner, /if \(!adbUser\.includes\("uid=0\(root\)"\)\)/);
  assert.match(
    runner,
    /function verifyNoForbiddenScope\(boundary\) \{[\s\S]*?\$\{boundary\}\.\.HEAD/u,
    "Phase 9 scope validation must inspect every successor of the recorded Task 1 boundary",
  );
  assert.match(
    runner,
    /function verifyImmutableMigration\(boundary\) \{[\s\S]*?\$\{boundary\}\.\.HEAD[\s\S]*?0019_session_exercise_editing/u,
    "Phase 9 native execution must reject committed migration-0019 drift after the Task 1 boundary",
  );
  assert.match(runner, /"settings", "get", "global", "auto_time"/u);
  assert.match(runner, /"settings", "put", "global", "auto_time", "0"/u);
  assert.match(runner, /"shell", "date", PHASE9_SCHEDULED_WORKOUT_CLOCK/u);
  assert.match(runner, /command\(adb, \["-s", serial, "shell", "date", "\+%Y-%m-%d"\]\)/u);
  assert.match(runner, /command\(adb, \["-s", serial, "shell", "date", "\+%Y-%m-%d"\]\) !== "2026-09-18"[\s\S]*?scheduled workout date was not applied/u);
  assert.match(runner, /finally \{[\s\S]*?"settings", "put", "global", "auto_time", priorAutoTime/u);
  assert.match(runner, /if \(priorAutoTime === "0"\)/u);
  assert.match(runner, /"shell", "date", priorDate/u);
  assert.doesNotMatch(
    runner,
    /spawnSync\("maestro", \[\s*"test",[\s\S]*?in-workout-exercise-editing\.yaml[\s\S]*?completed-workout-plan-writeback-keep\.yaml[\s\S]*?completed-workout-plan-writeback-retry\.yaml/u,
    "Phase 9 must run clear-state flows one at a time on the single manifest device",
  );
  assert.match(flow, /appId: com\.fchoo\.gymtracker\.devtest/);
  assert.match(flow, /Choose your starting plan/);
  assert.match(flow, /Activate Full Body Foundation/);
  assert.match(flow, /tapOn: "Activate Full Body Foundation"\n- runFlow:\n    when:\n      visible: "Retry Today action"\n    commands:\n      - tapOn: "Retry Today action"\n- extendedWaitUntil:\n    visible: "[\^]\(Start Full Body A\|Start Full Body B\|Rest day\)[$]\"/);
  assert.match(flow, /visible: "[\^]\(Start Full Body A\|Start Full Body B\)[$]\"\n    commands:\n      - tapOn: "Choose another day"/);
  assert.match(flow, /Start empty workout/);
  assert.match(flow, /tapOn: "Add Back Squat"/);
  assert.match(flow, /inputText: "Back Squat"\n- tapOn: "Back Squat[.] Add exercise"\n- waitForAnimationToEnd:\n    timeout: 10000\n- extendedWaitUntil:\n    visible: "Add Back Squat"\n    timeout: 30000\n- tapOn: "Add Back Squat"/);
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
  assert.match(flow, /tapOn:\n    text: "Start empty workout"\n    retryTapIfNoChange: true/u);
  assert.match(flow, /Add exercise[\s\S]*?inputText: "Overhead Press"[\s\S]*?add-exercise-option-5f140001-7e35-4a6d-9100-000000000007[\s\S]*?Add Overhead Press[\s\S]*?Reorder exercises[\s\S]*?scrollUntilVisible:[\s\S]*?text: "Move Back Squat down"[\s\S]*?tapOn: "Move Back Squat down"[\s\S]*?Back Squat moved to 2 of 2[\s\S]*?Back Squat · Position 2 of 2/u);
  assert.match(flow, /clearState: false[\s\S]*?Back Squat · Working set 1 · Rest idle[\s\S]*?Resume workout[\s\S]*?WORKOUT OVERVIEW[\s\S]*?Reorder exercises[\s\S]*?Back Squat · Position 2 of 2/u);
  assert.doesNotMatch(flow, /- assertVisible: "Added"/u);
  assert.match(flow, /arm_replace_exercise_failure/);
  assert.match(flow, /Replace exercise failure armed/);
  const boundedReturnToToday = [
    "- repeat:",
    "    times: 12",
    "    while:",
    '      notVisible: "Return to Today"',
    "    commands:",
    "      - swipe:",
    "          start: 95%, 75%",
    "          end: 95%, 25%",
    "          duration: 300",
    "- swipe:",
    "    start: 95%, 75%",
    "    end: 95%, 45%",
    "    duration: 300",
    '- assertVisible: "Return to Today"',
    '- tapOn: "Return to Today"',
  ].join("\n");
  assert.equal(
    flow.split(boundedReturnToToday).length - 1,
    2,
    "Phase 9 injected failure paths must use bounded Return to Today discovery before resuming the workout",
  );
  assert.match(flow, /inputText: "Bench Press"[\s\S]*?tapOn:\n    id: "replace-exercise-option-5f140001-7e35-4a6d-9100-000000000002"\n- waitForAnimationToEnd:\n    timeout: 10000\n- extendedWaitUntil:\n    visible: "Replace with Bench Press"\n    timeout: 30000\n- tapOn: "Replace with Bench Press"/u);
  assert.match(flow, /Retry replacing exercise/);
  assert.match(flow, /Complete Set 1[\s\S]*?Overhead Press exercise actions[\s\S]*?This exercise has completed sets/u);
  assert.match(flow, /arm_remove_exercise_failure/);
  assert.match(flow, /Remove exercise failure armed/);
  assert.match(flow, /tapOn: "Remove exercise"[\s\S]*?tapOn:\n    id: "remove-exercise-confirm"[\s\S]*?Retry removing exercise/u);
  assert.match(flow, /Retry removing exercise/);
  assert.match(flow, /Keep exercise/);
  assert.match(flow, /This exercise has completed sets. They will be retained and this exercise will be marked Skipped, not deleted./);
  assert.match(flow, /Retry removing exercise[\s\S]*?Overhead Press\. Skipped\. Completed · 0 kg × 8\. 1 of 1 working sets\. Expand exercise/u);
  assert.match(flow, /Overhead Press\. Skipped\. Completed · 0 kg × 8\. 1 of 1 working sets\. Expand exercise/u);
  assert.match(flow, /Complete Set 1/);
  const retainedObservationAssertion =
    /assertVisible: "Overhead Press. Skipped. Completed · 0 kg × 8. 1 of 1 working sets. Expand exercise"/gu;
  assert.equal(
    [...flow.matchAll(retainedObservationAssertion)].length,
    2,
    "Phase 9 must assert the full rendered retained observation before and after relaunch",
  );
  assert.doesNotMatch(flow, /assertVisible: "0 kg × 8"/u);
  assert.match(
    flow,
    /Overhead Press. Skipped. Completed · 0 kg × 8. 1 of 1 working sets. Expand exercise[\s\S]*?- stopApp[\s\S]*?- launchApp:[\s\S]*?clearState: false[\s\S]*?assertVisible: "Workout in progress"[\s\S]*?tapOn: "Resume workout"[\s\S]*?visible: "WORKOUT OVERVIEW"[\s\S]*?assertVisible: "Overhead Press. Skipped. Completed · 0 kg × 8. 1 of 1 working sets. Expand exercise"/u,
    "Phase 9 must resume the persisted workout before proving protected history after relaunch",
  );
  assert.match(flow, /stopApp/);
  assert.match(flow, /clearState: false/);
  assert.match(flow, /clearState: false[\s\S]*- assertVisible: '\^Back Squat · Working set 1 · Rest idle\$'/u);

  for (const writeBackFlow of [keepFlow, retryFlow]) {
    assert.match(writeBackFlow, /appId: com\.fchoo\.gymtracker\.devtest/);
    assert.match(
      writeBackFlow,
      /extendedWaitUntil:\n    visible: "Choose your starting plan"\n    timeout: 180000/u,
      "Phase 9 planned write-back flows must tolerate a cold native startup after state clearing",
    );
    assert.match(writeBackFlow, /Start Full Body A/);
    assert.match(
      writeBackFlow,
      /- assertVisible: "Complete Set 1"\n- tapOn:\n    text: "Complete Set 1"\n    retryTapIfNoChange: true[\s\S]*?- assertVisible: "Complete Set 2"\n- tapOn:\n    text: "Complete Set 2"\n    retryTapIfNoChange: true[\s\S]*?- assertVisible: "Complete Set 3"\n- tapOn:\n    text: "Complete Set 3"\n    retryTapIfNoChange: true/u,
      "Phase 9 planned write-back flows must retry every completion transition when native rendering has not advanced",
    );
    assert.match(
      writeBackFlow,
      /- assertVisible: "Complete Set 3"\n- tapOn:\n    text: "Complete Set 3"\n    retryTapIfNoChange: true/u,
      "Phase 9 must wait out the final completion control's brief disabled state",
    );
    for (const exerciseId of [
      "5f140001-7e35-4a6d-9100-000000000002",
      "5f140001-7e35-4a6d-9100-000000000003",
      "5f140001-7e35-4a6d-9100-000000000004",
      "5f140001-7e35-4a6d-9100-000000000005",
    ]) {
      assert.match(
        writeBackFlow,
        new RegExp(`exercise-actions-${exerciseId}`, "u"),
      );
      assert.match(
        writeBackFlow,
        new RegExp(
          `scrollUntilVisible:[\\s\\S]*?id: \"exercise-actions-${exerciseId}\"[\\s\\S]*?tapOn:[\\s\\S]*?id: \"exercise-actions-${exerciseId}\"[\\s\\S]*?retryTapIfNoChange: true`,
          "u",
        ),
      );
    }
    assert.match(writeBackFlow, /Save these changes to the plan\?/);
    assert.match(writeBackFlow, /Keep plan as-is/);
    assert.match(writeBackFlow, /Save changes to plan/);
    const finishCount = writeBackFlow.match(/- tapOn: "Finish workout"/gu)?.length ?? 0;
    const guardedFinishCount = writeBackFlow.match(
      /- scrollUntilVisible:\n    element:\n      text: "Finish workout"\n    direction: UP\n    centerElement: true\n    timeout: 30000\n- assertVisible: "Finish workout"\n- tapOn: "Finish workout"/gu,
    )?.length ?? 0;
    assert.equal(
      guardedFinishCount,
      finishCount,
      "Phase 9 planned write-back flows must reveal the finish action after overview resume before tapping it",
    );
  }
  assert.match(
    keepFlow,
    /retryTapIfNoChange: true\n- extendedWaitUntil:\n    visible: "Finish workout"[\s\S]*?Save these changes to the plan\?[\s\S]*?Keep plan as-is[\s\S]*?visible: "Today"/u,
  );
  assert.match(retryFlow, /arm_plan_write_back_failure/);
  assert.match(
    retryFlow,
    /retryTapIfNoChange: true\n- extendedWaitUntil:\n    visible: "Finish workout"[\s\S]*?openLink: "gymtracker-devtest:\/\/__notification-test-controls\?action=arm_plan_write_back_failure"/u,
  );
  assert.match(retryFlow, /Plan write-back failure armed/);
  assert.match(retryFlow, /Changes were not saved to the plan/);
  assert.match(retryFlow, /Your completed workout is safe\. Try again or keep the plan as-is\./);
  assert.match(retryFlow, /Retry saving changes/);
});

test("Phase 9 retained evidence rejects a missing or duplicate native flow", () => {
  const snapshot = PHASE9_MAESTRO_FLOW_CONTRACTS.map((contract, index) => ({
    ...contract,
    sha256: `${index + 1}`.repeat(64),
  }));
  const identity = {
    base_head: "b".repeat(40),
    source_tree_sha256: "c".repeat(64),
    apk_sha256: "d".repeat(64),
    installed_apk_sha256: "d".repeat(64),
    device: {
      serial: "emulator-5554",
      api: 36,
      abi: "arm64-v8a",
      model: "sdk_gphone64_arm64",
      android_release: "16",
    },
  };
  const v20 = {
    ok: true,
    suite: "migrations-effects",
    base_head: identity.base_head,
    source_tree_sha256: identity.source_tree_sha256,
    apk_sha256: "e".repeat(64),
    device: identity.device,
    exact_cases: 11,
  };
  const evidence = {
    schema_version: 1,
    suite: "phase9",
    status: "passed",
    producer: "phase9-maestro/v1",
    identity,
    matrix: PHASE9_EVIDENCE_MATRIX,
    v20,
    flows: snapshot.map((contract) => ({
      id: contract.id,
      flow: contract.flow,
      flow_sha256: contract.sha256,
      report_sha256: "a".repeat(64),
      tests: 1,
      failures: 0,
      errors: 0,
      skipped: 0,
    })),
  };

  const expected = { identity, v20 };
  assert.equal(validatePhase9Evidence(evidence, snapshot, expected), evidence);
  assert.throws(
    () => validatePhase9Evidence({ ...evidence, v20: { ...v20, ok: false } }, snapshot, expected),
    /identity or matrix is invalid/u,
  );
  assert.throws(
    () => validatePhase9Evidence({ ...evidence, flows: evidence.flows.slice(1) }, snapshot, expected),
    /flow ledger is incomplete/u,
  );
  assert.throws(
    () => validatePhase9Evidence({
      ...evidence,
      flows: [evidence.flows[0], evidence.flows[0], evidence.flows[2]],
    }, snapshot, expected),
    /flow is invalid/u,
  );
  assert.throws(
    () => validatePhase9Evidence({ ...evidence, v20: { ...v20, exact_cases: 0 } }, snapshot, expected),
    /identity or matrix is invalid/u,
  );
  assert.throws(
    () => validatePhase9Evidence({
      ...evidence,
      identity: { ...identity, source_tree_sha256: "f".repeat(64) },
    }, snapshot, expected),
    /identity or matrix is invalid/u,
  );
  assert.throws(
    () => validatePhase9Evidence({
      ...evidence,
      identity: { ...identity, device: { ...identity.device, serial: "other-device" } },
    }, snapshot, expected),
    /identity or matrix is invalid/u,
  );
});

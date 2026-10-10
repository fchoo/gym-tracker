import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  computePhase14ScrimTap,
  evaluatePhase14SemanticPredicate,
  phase14FocusAcquisitionSatisfied,
  parsePhase14SemanticSnapshot,
  validatePhase14ActionObservation,
} from "./phase14-action-observation.mjs";
import { PHASE14_NATIVE_MATRIX } from "./phase14-native-matrix.mjs";
import { parsePhase14ImeVisibility } from "./run-phase14-maestro.mjs";

const PACKAGE = "com.fchoo.gymtracker.devtest";

test("Phase 14 IME visibility prefers Android's current input request state", () => {
  assert.equal(parsePhase14ImeVisibility("mInputShown=true mIsInputViewShown=true"), true);
  assert.equal(parsePhase14ImeVisibility("mInputShown=false mIsInputViewShown=true"), false);
  assert.equal(parsePhase14ImeVisibility("mIsInputViewShown=true"), true);
  assert.equal(parsePhase14ImeVisibility("mIsInputViewShown=false"), false);
});

function node({
  bounds = "[0,0][390,844]",
  focused = false,
  label,
  packageName = PACKAGE,
  resourceId = "",
  selected = false,
}) {
  return `<node package="${packageName}" text="${label}" content-desc="${label}" resource-id="${resourceId}" focused="${focused}" selected="${selected}" bounds="${bounds}" />`;
}

test("Phase 14 semantic predicates require exact package, visible, absent, selected, and focus state", () => {
  const snapshot = parsePhase14SemanticSnapshot(`<hierarchy rotation="0">${node({ label: "Workout", selected: true })}${node({ focused: true, label: "Calendar" })}</hierarchy>`);
  assert.deepEqual(evaluatePhase14SemanticPredicate(snapshot, {
    package: PACKAGE,
    visible: ["Workout", "Calendar"],
    absent: ["Background control activated"],
    nodes: [{ label: "Workout", selected: true }, { focused: true, label: "Calendar", selected: false }],
    focus: { equals: "Calendar", allowNull: false },
    rejectLauncher: true,
  }), { ok: true, failures: [] });
  assert.deepEqual(evaluatePhase14SemanticPredicate(snapshot, {
    package: PACKAGE,
    visible: ["Removed sessions"],
    absent: [],
    nodes: [],
    focus: { allowNull: true },
    rejectLauncher: true,
  }).ok, false);
  const launcher = parsePhase14SemanticSnapshot(`<hierarchy>${node({ label: "Home", packageName: "com.google.android.apps.nexuslauncher" })}</hierarchy>`);
  assert.equal(evaluatePhase14SemanticPredicate(launcher, {
    package: PACKAGE,
    visible: [],
    absent: [],
    nodes: [],
    focus: { allowNull: true },
    rejectLauncher: true,
  }).ok, false);
});

test("Phase 14 scrim coordinates come from actual rotated window and sheet bounds", () => {
  const portrait = parsePhase14SemanticSnapshot(`<hierarchy rotation="0">${node({ label: "App", bounds: "[0,0][390,844]" })}${node({ label: "Appearance", bounds: "[0,286][390,844]", resourceId: `${PACKAGE}:id/bottom-sheet-frame` })}</hierarchy>`);
  assert.deepEqual(computePhase14ScrimTap(portrait), {
    rotation: 0,
    window_bounds: { left: 0, top: 0, right: 390, bottom: 844 },
    sheet_bounds: { left: 0, top: 286, right: 390, bottom: 844 },
    x: 195,
    y: 278,
  });
  const landscape = parsePhase14SemanticSnapshot(`<hierarchy rotation="1">${node({ label: "App", bounds: "[0,0][844,390]" })}${node({ label: "Appearance", bounds: "[0,120][844,390]", resourceId: `${PACKAGE}:id/bottom-sheet-frame` })}</hierarchy>`);
  assert.deepEqual(computePhase14ScrimTap(landscape).y, 112);
  assert.throws(
    () => computePhase14ScrimTap(parsePhase14SemanticSnapshot(`<hierarchy>${node({ label: "App" })}</hierarchy>`)),
    /phase14_sheet_bounds_missing/u,
  );
});

test("Phase 14 action contracts are state-specific and exact", () => {
  assert.equal(PHASE14_NATIVE_MATRIX.cells.length, 874);
  for (const state of PHASE14_NATIVE_MATRIX.states) {
    assert.equal(Object.hasOwn(state.state, "fixture"), false, state.caseId);
    assert.equal(state.state.dataPolicy, state.caseId === "shell.toasts" ? "development-test-proof-route" : "installed-user-data-preserved");
    for (const action of state.actions) {
      assert.equal(action.preparation.stage, state.stage);
      assert.equal(action.preparation.action, action.id);
      assert.equal(action.pre.package, PACKAGE);
      assert.equal(action.post.package, PACKAGE);
      assert.equal(action.pre.rejectLauncher, true);
      assert.equal(action.post.rejectLauncher, true);
      assert.ok(action.poll.timeoutMs > 0 && action.poll.timeoutMs <= 10_000);
      assert.ok(action.poll.intervalMs >= 50 && action.poll.intervalMs <= 500);
      assert.ok(action.pre.visible.length + action.pre.nodes.length + Number(action.pre.packageForeground === false) > 0);
      assert.ok(action.post.visible.length + action.post.nodes.length > 0);
      if (["ENTER", "SPACE"].includes(action.input)) {
        assert.equal(action.pre.focus.allowNull, false);
        assert.equal(typeof action.pre.focus.equals, "string");
      }
      if (action.focusAcquisition !== undefined) {
        assert.equal(action.focusAcquisition.strategy, "key-sequence-until");
        assert.ok(action.focusAcquisition.keyCodes.length > 0);
      }
    }
  }

  const rootState = PHASE14_NATIVE_MATRIX.states.find(({ caseId }) => caseId === "shell.root-state");
  assert.deepEqual(rootState.actions[0].pre.nodes, [{ label: "Library", selected: true }]);
  assert.deepEqual(rootState.actions[0].post.nodes, [{ label: "Workout", selected: true }]);
  const deepLink = PHASE14_NATIVE_MATRIX.states.find(({ caseId }) => caseId === "shell.settings-deep-links");
  assert.deepEqual(deepLink.actions.map(({ id }) => id), ["back-from-data-recovery"]);
  assert.deepEqual(deepLink.actions[0].pre.visible, ["Manual encrypted backup"]);
  const dataRecovery = PHASE14_NATIVE_MATRIX.states.find(({ caseId }) => caseId === "shell.data-recovery");
  assert.deepEqual(dataRecovery.state.capture.visible, ["Restore clean", "No backup was selected"]);
  assert.deepEqual(dataRecovery.actions[0].pre.visible, ["Restore clean", "Restore password"]);
  assert.deepEqual(dataRecovery.actions[0].post.visible, ["Restore clean", "Restore password"]);
  const automaticBackup = PHASE14_NATIVE_MATRIX.states.find(({ caseId }) => caseId === "shell.automatic-backup");
  assert.deepEqual(automaticBackup.actions[0].post.visible, ["Automatic backup settings"]);
  assert.deepEqual(automaticBackup.actions[0].post.nodes, [{ label: "Automatic backup settings", focused: true }]);
  const manualBackup = PHASE14_NATIVE_MATRIX.states.find(({ caseId }) => caseId === "shell.manual-backup");
  assert.deepEqual(manualBackup.actions[0].post.visible, ["Manual encrypted backup"]);
  assert.deepEqual(manualBackup.actions[0].post.nodes, [{ label: "Manual encrypted backup", focused: true }]);
  const launch = PHASE14_NATIVE_MATRIX.states.find(({ caseId }) => caseId === "shell.launch");
  assert.equal(launch.actions[0].transport, "adb-launch");
  assert.equal(launch.actions[0].pre.packageForeground, false);
  const toast = PHASE14_NATIVE_MATRIX.states.find(({ caseId }) => caseId === "shell.toasts");
  assert.deepEqual(toast.actions[0].pre.visible, ["Toast host mounted", "Background control idle", "Toast proof active"]);
  assert.deepEqual(toast.actions[0].post.visible, ["Toast host mounted", "Background control activated", "Toast proof active"]);
});

test("Phase 14 validates exact action observations rather than XML inequality", () => {
  const contract = PHASE14_NATIVE_MATRIX.states.find(({ caseId }) => caseId === "shell.root-state").actions[0];
  const observation = {
    schema_version: 3,
    action_id: contract.id,
    input: contract.input,
    transport: contract.transport,
    command: { key_code: contract.command.keyCode },
    started_at: "2026-10-10T01:00:00.000Z",
    finished_at: "2026-10-10T01:00:00.200Z",
    poll_attempts: 2,
    pre: {
      package_foreground: true,
      snapshot: parsePhase14SemanticSnapshot(`<hierarchy>${node({ focused: true, label: "Library", selected: true })}${node({ label: "Library section" })}</hierarchy>`),
    },
    post: {
      package_foreground: true,
      snapshot: parsePhase14SemanticSnapshot(`<hierarchy>${node({ focused: true, label: "Workout", selected: true })}</hierarchy>`),
    },
    verdict: "PASS",
  };
  assert.doesNotThrow(() => validatePhase14ActionObservation(observation, contract));
  assert.throws(
    () => validatePhase14ActionObservation({ ...observation, post: observation.pre }, contract),
    /phase14_action_postcondition_invalid/u,
  );
});

test("Phase 14 focus acquisition evaluates the full precondition instead of a duplicate label", () => {
  const action = PHASE14_NATIVE_MATRIX.states.find(({ caseId }) => caseId === "shell.four-roots")
    .actions.find(({ id }) => id === "root-enter-calendar");
  const duplicateWrongState = parsePhase14SemanticSnapshot(`<hierarchy>${node({ label: "Workout", selected: true })}${node({ focused: true, label: "Calendar", selected: true })}</hierarchy>`);
  assert.equal(duplicateWrongState.focused_node, "Calendar");
  assert.equal(phase14FocusAcquisitionSatisfied(duplicateWrongState, action, {
    packageForeground: true,
    imeVisible: false,
  }), false);
  const exact = parsePhase14SemanticSnapshot(`<hierarchy>${node({ label: "Workout", selected: true })}${node({ focused: true, label: "Calendar", selected: false })}</hierarchy>`);
  assert.equal(phase14FocusAcquisitionSatisfied(exact, action, {
    packageForeground: true,
    imeVisible: false,
  }), true);
});

test("Phase 14 focus acquisition validates the full precondition instead of a duplicate label", () => {
  const runner = readFileSync("scripts/run-phase14-maestro.mjs", "utf8");
  assert.match(runner, /function acquireExactFocus\(adbPath, serial, packageName, action\)[\s\S]*?phase14FocusAcquisitionSatisfied\(snapshot, action, runtimeState\)/u);
  assert.doesNotMatch(
    runner,
    /if \(snapshot\.focused_node === acquisition\.target\) return/u,
  );
});

test("Phase 14 Maestro action preparation is conditional and does not consume the audited action", () => {
  const shell = readFileSync("maestro/phase14/shell.yaml", "utf8");
  const settings = readFileSync("maestro/phase14/settings-recovery.yaml", "utf8");
  const accessibility = readFileSync("maestro/phase14/accessibility.yaml", "utf8");
  const toastProofRoute = readFileSync("app/__phase14-toast-proof.tsx", "utf8");
  assert.match(shell, /PHASE14_STAGE == 'phase14-root-state' && PHASE14_ACTION == 'back-from-library'/u);
  assert.match(settings, /PHASE14_STAGE == 'phase14-settings-deep-links' && PHASE14_ACTION == 'back-from-data-recovery'/u);
  assert.match(settings, /PHASE14_STAGE == 'phase14-removed-sessions'[\s\S]*?tapOn: "Removed sessions"[\s\S]*?visible: "Removed sessions"/u);
  assert.match(settings, /PHASE14_STAGE == 'phase14-manual-backup'[\s\S]*?tapOn: "Manual encrypted backup"[\s\S]*?visible: "Manual encrypted backup"/u);
  const toastAction = accessibility.match(/PHASE14_STAGE == 'phase14-toasts' && PHASE14_ACTION == 'toast-background-enter'[\s\S]*?(?=\n- runFlow:|$)/u)?.[0] ?? "";
  assert.match(toastAction, /Background control idle/u);
  assert.doesNotMatch(toastAction, /tapOn: "Tap background control"/u);
  assert.match(toastProofRoute, /PROOF_TOAST_DURATION_MS = 10_000/u);
  assert.doesNotMatch(accessibility, /PHASE14_STAGE == 'phase14-launch'[\s\S]*?pressKey: BACK/u);
});

test("Phase 14 keeps reinstall and every Maestro launch user-data preserving", () => {
  const build = readFileSync("scripts/build-current-native-test-apk.sh", "utf8");
  assert.match(build, /adb -s "\$device_serial" install -r "\$apk_path"/u);
  assert.doesNotMatch(build, /adb[^\n]*(?:uninstall|pm clear)/u);
  for (const file of ["shell.yaml", "accessibility.yaml", "settings-recovery.yaml"]) {
    const source = readFileSync(`maestro/phase14/${file}`, "utf8");
    assert.match(source, /clearState: false/u);
    assert.doesNotMatch(source, /clearState: true/u);
  }
  const inlineTheme = readFileSync("maestro/phase14/select-theme.yaml", "utf8");
  assert.doesNotMatch(inlineTheme, /launchApp|clearState: true/u);
});

test("Phase 14 --cell smoke output is isolated from canonical capture paths", () => {
  const runner = readFileSync("scripts/run-phase14-maestro.mjs", "utf8");
  assert.match(runner, /writeVisualComparison\(cell, screenshot, theme, outputDirectory\)/u);
  assert.match(runner, /mode === "cell-smoke"[\s\S]*?ARTIFACT_ROOT, "smoke", requestedCell/u);
  assert.doesNotMatch(runner, /writeVisualComparison\(cell, screenshot\)/u);
});

test("Phase 14 combines explicit theme selection with the base stage Maestro invocation", () => {
  const runner = readFileSync("scripts/run-phase14-maestro.mjs", "utf8");
  assert.doesNotMatch(runner, /function runThemeSelection/u);
  assert.match(runner, /PHASE14_THEME_PRESELECTED=\$\{actionId === "none" \? "false" : "true"\}/u);
  assert.match(runner, /const reportArtifact = Object\.freeze[\s\S]*?themeObservation\(adbPath, serial, cell, reportArtifact\)/u);
  for (const flow of ["shell.yaml", "accessibility.yaml", "settings-recovery.yaml"]) {
    assert.match(readFileSync(`maestro/phase14/${flow}`, "utf8"), /file: select-theme\.yaml/u);
  }
});

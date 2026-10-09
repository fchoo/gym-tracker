import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PHASE14_NATIVE_MATRIX,
  validatePhase14NativeMatrix,
} from "./phase14-native-matrix.mjs";

test("Phase 14 matrix covers every requested theme, OS switch, viewport, orientation, and text scale", () => {
  assert.doesNotThrow(() => validatePhase14NativeMatrix(PHASE14_NATIVE_MATRIX));
  assert.deepEqual(PHASE14_NATIVE_MATRIX.themes, ["light", "dark", "system-on-light", "system-on-dark"]);
  assert.equal(PHASE14_NATIVE_MATRIX.liveOsSwitch, true);
  assert.equal(PHASE14_NATIVE_MATRIX.explicitThemeInvariant, true);
  assert.deepEqual(PHASE14_NATIVE_MATRIX.fontScales, [1, 2]);
  for (const viewport of [[360, 800], [390, 844], [600, 960], [840, 1080]]) {
    assert.equal(PHASE14_NATIVE_MATRIX.viewports.some(({ width, height }) => width === viewport[0] && height === viewport[1]), true);
  }
  assert.equal(PHASE14_NATIVE_MATRIX.orientations.includes("portrait"), true);
  assert.equal(PHASE14_NATIVE_MATRIX.orientations.includes("landscape"), true);
});

test("Phase 14 owns the complete 64-configuration Cartesian product for every shell state", () => {
  const baseCells = PHASE14_NATIVE_MATRIX.cells.filter(({ variant }) => variant === "base");
  assert.equal(baseCells.length, 13 * 64);
  for (const state of PHASE14_NATIVE_MATRIX.states) {
    const cells = baseCells.filter(({ caseId }) => caseId === state.caseId);
    assert.equal(cells.length, 64, state.caseId);
    assert.equal(new Set(cells.map(({ configurationId }) => configurationId)).size, 64);
    for (const cell of cells) {
      assert.equal(cell.state.id, state.state.id);
      assert.ok(cell.actions.length > 0);
      assert.ok(cell.checkpoints.length > 0);
      assert.ok(cell.postconditions.length > 0);
      assert.ok(["revision18-png", "native-only"].includes(cell.referencePolicy.kind));
      assert.ok(["Light", "Dark", "System"].includes(cell.appearanceSelection));
      assert.ok(["light", "dark"].includes(cell.osScheme));
    }
  }
});

test("Phase 14 adds observed live-theme and reduced-motion variants without replacing base coverage", () => {
  const variants = PHASE14_NATIVE_MATRIX.cells.filter(({ variant }) => variant !== "base");
  assert.ok(variants.some(({ variant }) => variant === "system-live-switch"));
  assert.ok(variants.some(({ variant }) => variant === "explicit-theme-invariance"));
  for (const state of PHASE14_NATIVE_MATRIX.states.filter(({ motionSensitive }) => motionSensitive)) {
    assert.ok(variants.some(({ caseId, variant, reducedMotion }) =>
      caseId === state.caseId && variant === "reduced-motion" && reducedMotion));
  }
});

test("Phase 14 matrix requires fixed-data bounds, keyboard/focus, reduced-motion, factual startup, and no-write recovery traces", () => {
  assert.equal(PHASE14_NATIVE_MATRIX.minTargetDp, 48);
  assert.equal(PHASE14_NATIVE_MATRIX.focusRingDp, 3);
  assert.equal(PHASE14_NATIVE_MATRIX.capture.semanticTree, "pre-and-post-each-action");
  assert.equal(PHASE14_NATIVE_MATRIX.capture.runtimeStateDigest, "installed-app-sqlite-files");
  assert.equal(PHASE14_NATIVE_MATRIX.capture.visualComparison, "pngjs-7.0.0");
  assert.deepEqual(PHASE14_NATIVE_MATRIX.input, ["dpad", "enter", "space", "back", "escape", "scrim", "ime-clearance"]);
  assert.deepEqual(PHASE14_NATIVE_MATRIX.motion, ["normal", "reduced-motion-equivalence"]);
  assert.deepEqual(PHASE14_NATIVE_MATRIX.recovery, ["development-test-fixtures", "no-write-navigation"]);
});

test("Phase 14 Maestro flows encode all shell stages and stay native-only", () => {
  for (const file of ["maestro/phase14/shell.yaml", "maestro/phase14/settings-recovery.yaml", "maestro/phase14/accessibility.yaml"]) {
    const flow = readFileSync(file, "utf8");
    assert.match(flow, /appId: com\.fchoo\.gymtracker\.devtest/u);
    assert.doesNotMatch(flow, /https?:\/\//u);
    assert.match(flow, /PHASE14_STAGE/u);
    assert.match(flow, /file: select-theme\.yaml/u);
  }
  const settingsRecovery = readFileSync("maestro/phase14/settings-recovery.yaml", "utf8");
  const combined = ["shell.yaml", "accessibility.yaml"].map((name) => readFileSync(`maestro/phase14/${name}`, "utf8")).concat(settingsRecovery).join("\n");
  for (const id of ["phase14-four-roots", "phase14-root-state", "phase14-appearance", "phase14-tokens", "phase14-sheets", "phase14-toasts", "phase14-launch", "phase14-rest-alerts", "phase14-settings-deep-links", "phase14-removed-sessions", "phase14-data-recovery", "phase14-automatic-backup", "phase14-manual-backup"]) assert.match(combined, new RegExp(`PHASE14_STAGE == '${id}'`, "u"));
  assert.match(settingsRecovery, /tapOn: "Manual encrypted backup"/u);
  assert.match(settingsRecovery, /inputText: "phase14-cancel-only"/u);
  assert.match(settingsRecovery, /PHASE14_ACTION != 'ime-clearance'/u);
  assert.match(settingsRecovery, /hideKeyboard/u);
  assert.match(settingsRecovery, /id: "restore-clean-action"/u);
  assert.match(settingsRecovery, /visible: "No backup was selected"/u);
  const automaticBackupStart = settingsRecovery.indexOf("true: ${PHASE14_STAGE == 'phase14-automatic-backup'}");
  const automaticBackupEnd = settingsRecovery.indexOf("- runFlow:", automaticBackupStart + 1);
  const automaticBackup = settingsRecovery.slice(automaticBackupStart, automaticBackupEnd);
  assert.match(automaticBackup, /tapOn: "Automatic backup settings"/u);
  assert.match(automaticBackup, /visible: "Automatic backup settings"/u);
  const accessibility = readFileSync("maestro/phase14/accessibility.yaml", "utf8");
  const toastStart = accessibility.indexOf("true: ${PHASE14_STAGE == 'phase14-toasts'}");
  const toastEnd = accessibility.indexOf("- runFlow:", toastStart + 1);
  const toastFlow = accessibility.slice(toastStart, toastEnd);
  assert.match(toastFlow, /openLink: "gymtracker-devtest:\/\/__phase14-toast-proof"/u);
  assert.match(toastFlow, /tapOn: "Tap background control"/u);
  assert.match(toastFlow, /assertVisible: "Background control activated"/u);

  const runner = readFileSync("scripts/run-phase14-maestro.mjs", "utf8");
  assert.match(runner, /runComponentEvidence\(ids, outputDirectory\)/u);
  assert.match(runner, /executeObservedAction/u);
  assert.match(runner, /captureRuntimeStateDigest/u);
  assert.match(runner, /comparePhase14PngBytes/u);
  assert.match(runner, /finally \{[\s\S]*?force-stop[\s\S]*?restoreCellDeviceState/u);
});

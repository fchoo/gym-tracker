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

test("Phase 14 matrix requires fixed-data bounds, keyboard/focus, reduced-motion, factual startup, and no-write recovery traces", () => {
  assert.equal(PHASE14_NATIVE_MATRIX.minTargetDp, 48);
  assert.equal(PHASE14_NATIVE_MATRIX.focusRingDp, 3);
  assert.equal(PHASE14_NATIVE_MATRIX.capture.semanticTree, true);
  assert.equal(PHASE14_NATIVE_MATRIX.capture.sourceStateDigest, true);
  assert.equal(PHASE14_NATIVE_MATRIX.capture.differenceOverlay, "revision-18");
  assert.deepEqual(PHASE14_NATIVE_MATRIX.input, ["heading-focus", "trigger-focus", "back", "escape", "scrim", "ime-clearance", "dpad"]);
  assert.deepEqual(PHASE14_NATIVE_MATRIX.motion, ["reduced-motion-equivalence"]);
  assert.deepEqual(PHASE14_NATIVE_MATRIX.recovery, ["development-test-fixtures", "no-write-navigation"]);
});

test("Phase 14 Maestro flows encode all shell stages and stay native-only", () => {
  for (const file of ["maestro/phase14/shell.yaml", "maestro/phase14/settings-recovery.yaml", "maestro/phase14/accessibility.yaml"]) {
    const flow = readFileSync(file, "utf8");
    assert.match(flow, /appId: com\.fchoo\.gymtracker\.devtest/u);
    assert.doesNotMatch(flow, /https?:\/\//u);
    assert.match(flow, /PHASE14_STAGE/u);
  }
  const settingsRecovery = readFileSync("maestro/phase14/settings-recovery.yaml", "utf8");
  const combined = ["shell.yaml", "accessibility.yaml"].map((name) => readFileSync(`maestro/phase14/${name}`, "utf8")).concat(settingsRecovery).join("\n");
  for (const id of ["phase14-four-roots", "phase14-root-state", "phase14-appearance", "phase14-tokens", "phase14-sheets", "phase14-toasts", "phase14-launch", "phase14-rest-alerts", "phase14-settings-deep-links", "phase14-removed-sessions", "phase14-data-recovery", "phase14-automatic-backup", "phase14-manual-backup"]) assert.match(combined, new RegExp(`PHASE14_STAGE == '${id}'`, "u"));
  const dataRecoveryStart = settingsRecovery.indexOf("true: ${PHASE14_STAGE == 'phase14-data-recovery'}");
  const dataRecoveryEnd = settingsRecovery.indexOf("- runFlow:", dataRecoveryStart + 1);
  const dataRecovery = settingsRecovery.slice(dataRecoveryStart, dataRecoveryEnd);
  assert.match(dataRecovery, /tapOn: "Manual encrypted backup"/u);
  assert.match(dataRecovery, /inputText: "phase14-cancel-only"/u);
  assert.match(dataRecovery, /hideKeyboard/u);
  assert.match(dataRecovery, /id: "restore-clean-action"/u);
  assert.match(dataRecovery, /visible: "No backup was selected"/u);
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
});

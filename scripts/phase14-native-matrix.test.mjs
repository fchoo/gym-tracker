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
  assert.equal(PHASE14_NATIVE_MATRIX.cells.length, 874);
  const baseCells = PHASE14_NATIVE_MATRIX.cells.filter(({ variant }) => variant === "base");
  assert.equal(baseCells.length, 13 * 64);
  for (const state of PHASE14_NATIVE_MATRIX.states) {
    const cells = baseCells.filter(({ caseId }) => caseId === state.caseId);
    assert.equal(cells.length, 64, state.caseId);
    assert.equal(new Set(cells.map(({ configurationId }) => configurationId)).size, 64);
    for (const cell of cells) {
      assert.equal(cell.state.id, state.state.id);
      assert.ok(Array.isArray(cell.actions));
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

test("Phase 14 limits actions and logical probes to explicit representative behavior profiles", () => {
  assert.equal(PHASE14_NATIVE_MATRIX.cells.filter(({ behavior }) => behavior.representative).length, 31);
  for (const state of PHASE14_NATIVE_MATRIX.states) {
    const representatives = PHASE14_NATIVE_MATRIX.cells.filter(({ caseId, behavior }) =>
      caseId === state.caseId && behavior.representative);
    const expectedProfiles = ["normal", "accessibility-200"];
    if (["shell.sheets", "shell.data-recovery"].includes(state.caseId)) expectedProfiles.push("landscape-geometry");
    if (state.motionSensitive) expectedProfiles.push("reduced-motion");
    assert.deepEqual(representatives.map(({ behavior }) => behavior.profile).sort(), expectedProfiles.sort(), state.caseId);
    for (const cell of PHASE14_NATIVE_MATRIX.cells.filter(({ caseId }) => caseId === state.caseId)) {
      assert.deepEqual(cell.captureRequirements, {
        geometry: true,
        layout: true,
        screenshot: true,
        semantic: true,
        theme: true,
      });
      if (cell.behavior.representative) {
        assert.deepEqual(cell.behavior.actionIds, state.actions.map(({ id }) => id));
        assert.equal(cell.behavior.logicalStateProbe, state.runtimeStatePolicy === "no-write" && state.actions.length > 0);
      } else {
        assert.deepEqual(cell.behavior, {
          representative: false,
          profile: null,
          actionIds: [],
          logicalStateProbe: false,
        });
      }
    }
  }
});

test("Phase 14 representatives pin normal, 200 percent, and relevant landscape geometry", () => {
  const normal = PHASE14_NATIVE_MATRIX.cells.filter(({ behavior }) => behavior.profile === "normal");
  assert.ok(normal.every(({ appearance, viewport, orientation, fontScale, variant }) =>
    appearance === "light" && viewport.width === 390 && viewport.height === 844
      && orientation === "portrait" && fontScale === 1 && variant === "base"));
  const accessibility = PHASE14_NATIVE_MATRIX.cells.filter(({ behavior }) => behavior.profile === "accessibility-200");
  assert.ok(accessibility.every(({ appearance, viewport, orientation, fontScale, variant }) =>
    appearance === "dark" && viewport.width === 360 && viewport.height === 800
      && orientation === "portrait" && fontScale === 2 && variant === "base"));
  const landscape = PHASE14_NATIVE_MATRIX.cells.filter(({ behavior }) => behavior.profile === "landscape-geometry");
  assert.deepEqual(landscape.map(({ caseId }) => caseId).sort(), ["shell.data-recovery", "shell.sheets"]);
  assert.ok(landscape.every(({ viewport, orientation, fontScale }) =>
    viewport.width === 390 && viewport.height === 844 && orientation === "landscape" && fontScale === 1));
});

test("Phase 14 matrix requires fixed-data bounds, keyboard/focus, reduced-motion, factual startup, and no-write recovery traces", () => {
  assert.equal(PHASE14_NATIVE_MATRIX.minTargetDp, 48);
  assert.equal(PHASE14_NATIVE_MATRIX.focusRingDp, 3);
  assert.equal(PHASE14_NATIVE_MATRIX.capture.semanticTree, "pre-and-post-each-action");
  assert.equal(PHASE14_NATIVE_MATRIX.capture.runtimeStateDigest, "development-test-app-canonical-logical-sqlite-source");
  assert.equal(PHASE14_NATIVE_MATRIX.capture.visualComparison, "pngjs-7.0.0");
  assert.deepEqual(PHASE14_NATIVE_MATRIX.input, ["dpad", "enter", "space", "back", "escape", "scrim", "ime-clearance", "launch"]);
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
  assert.match(settingsRecovery, /PHASE14_ACTION == 'ime-clearance-restore-field'/u);
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
  assert.match(toastFlow, /assertVisible: "Background control idle"/u);
  assert.doesNotMatch(toastFlow, /tapOn: "Tap background control"/u);

  const runner = readFileSync("scripts/run-phase14-maestro.mjs", "utf8");
  assert.match(runner, /runComponentEvidence\(ids, outputDirectory\)/u);
  assert.match(runner, /executeObservedAction/u);
  assert.match(runner, /captureRuntimeSourceStateProof/u);
  assert.doesNotMatch(runner, /run-as/u);
  assert.match(runner, /comparePhase14PngBytes/u);
  assert.match(runner, /finally \{[\s\S]*?force-stop[\s\S]*?restoreCellDeviceState/u);
});

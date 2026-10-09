import { PHASE14_SHELL_EVIDENCE_CASES } from "../src/testing/contracts/phase14Shell.contract.ts";

const REQUIRED_APPEARANCES = Object.freeze([
  Object.freeze({ id: "light", selection: "Light", renderedTheme: "light", osScheme: "dark" }),
  Object.freeze({ id: "dark", selection: "Dark", renderedTheme: "dark", osScheme: "light" }),
  Object.freeze({ id: "system-on-light", selection: "System", renderedTheme: "light", osScheme: "light" }),
  Object.freeze({ id: "system-on-dark", selection: "System", renderedTheme: "dark", osScheme: "dark" }),
]);
const REQUIRED_VIEWPORTS = Object.freeze([
  Object.freeze({ width: 360, height: 800 }),
  Object.freeze({ width: 390, height: 844 }),
  Object.freeze({ width: 600, height: 960 }),
  Object.freeze({ width: 840, height: 1080 }),
]);
const REQUIRED_ORIENTATIONS = Object.freeze(["portrait", "landscape"]);
const REQUIRED_FONT_SCALES = Object.freeze([1, 2]);
const REQUIRED_INPUT = Object.freeze(["dpad", "enter", "space", "back", "escape", "scrim", "ime-clearance"]);

const ACTIONS = Object.freeze({
  "dpad-down": Object.freeze({ id: "dpad-down", input: "DPAD_DOWN", transport: "adb-keyevent", command: Object.freeze({ keyCode: 20 }), postcondition: Object.freeze({ id: "focus-moved", kind: "semantic-tree-changed" }) }),
  enter: Object.freeze({ id: "enter", input: "ENTER", transport: "adb-keyevent", command: Object.freeze({ keyCode: 66 }), postcondition: Object.freeze({ id: "activated-once", kind: "semantic-tree-changed" }) }),
  space: Object.freeze({ id: "space", input: "SPACE", transport: "adb-keyevent", command: Object.freeze({ keyCode: 62 }), postcondition: Object.freeze({ id: "activated-once", kind: "semantic-tree-changed" }) }),
  back: Object.freeze({ id: "back", input: "BACK", transport: "adb-keyevent", command: Object.freeze({ keyCode: 4 }), postcondition: Object.freeze({ id: "back-dismissed-or-navigated", kind: "semantic-tree-changed" }) }),
  escape: Object.freeze({ id: "escape", input: "ESCAPE", transport: "adb-keyevent", command: Object.freeze({ keyCode: 111 }), postcondition: Object.freeze({ id: "escape-dismissed", kind: "semantic-tree-changed" }) }),
  scrim: Object.freeze({ id: "scrim", input: "SCRIM", transport: "adb-coordinate", command: Object.freeze({ target: "outside-sheet" }), postcondition: Object.freeze({ id: "scrim-dismissed", kind: "semantic-tree-changed" }) }),
  "ime-clearance": Object.freeze({ id: "ime-clearance", input: "IME_CLEARANCE", transport: "adb-keyevent", command: Object.freeze({ keyCode: 4 }), postcondition: Object.freeze({ id: "ime-hidden", kind: "semantic-tree-changed" }) }),
});

const CASE_BY_ID = Object.freeze(Object.fromEntries(
  PHASE14_SHELL_EVIDENCE_CASES.map((entry) => [entry.id, entry]),
));

function freezeList(values) {
  return Object.freeze(values.map((value) =>
    typeof value === "object" && value !== null ? Object.freeze({ ...value }) : value));
}

function stateContract(entry) {
  return Object.freeze({
    caseId: entry.id,
    stage: entry.stage,
    flow: entry.flow,
    state: Object.freeze({ ...entry.state }),
    actions: Object.freeze(entry.actions.map((id) => ACTIONS[id])),
    checkpoints: freezeList(entry.checkpoints.map((id) => ({ id, expectedVisible: id }))),
    postconditions: freezeList(entry.postconditions.map((id) => ({ id, kind: "semantic-contract" }))),
    componentTests: Object.freeze([...entry.componentTests]),
    runtimeStatePolicy: entry.runtimeStatePolicy,
    motionSensitive: entry.motionSensitive,
    referencePolicy: Object.freeze(entry.referencePolicy),
  });
}

export const PHASE14_NATIVE_STATES = Object.freeze(
  PHASE14_SHELL_EVIDENCE_CASES.map(stateContract),
);

function configurationId(appearance, viewport, orientation, fontScale) {
  return `${appearance.id}-${viewport.width}x${viewport.height}-${orientation}-font-${fontScale}`;
}

function createCell(state, appearance, viewport, orientation, fontScale, variant = "base", overrides = {}) {
  const suffix = variant === "base" ? "" : `-${variant}`;
  return Object.freeze({
    id: `${state.state.id}-${configurationId(appearance, viewport, orientation, fontScale)}${suffix}`,
    configurationId: configurationId(appearance, viewport, orientation, fontScale),
    variant,
    caseId: state.caseId,
    stage: state.stage,
    flow: state.flow,
    state: state.state,
    actions: state.actions,
    checkpoints: state.checkpoints,
    postconditions: state.postconditions,
    componentTests: state.componentTests,
    runtimeStatePolicy: state.runtimeStatePolicy,
    referencePolicy: state.referencePolicy,
    appearance: appearance.id,
    appearanceSelection: appearance.selection,
    renderedTheme: appearance.renderedTheme,
    osScheme: appearance.osScheme,
    theme: appearance.id,
    viewport,
    orientation,
    fontScale,
    reducedMotion: false,
    liveOsSwitch: false,
    expectedInputs: Object.freeze(state.actions.map(({ id }) => id)),
    ...overrides,
  });
}

function baseCells() {
  const cells = [];
  for (const state of PHASE14_NATIVE_STATES) {
    for (const appearance of REQUIRED_APPEARANCES) {
      for (const viewport of REQUIRED_VIEWPORTS) {
        for (const orientation of REQUIRED_ORIENTATIONS) {
          for (const fontScale of REQUIRED_FONT_SCALES) {
            cells.push(createCell(state, appearance, viewport, orientation, fontScale));
          }
        }
      }
    }
  }
  return cells;
}

function variantCells() {
  const viewport = REQUIRED_VIEWPORTS[1];
  const cells = [];
  for (const state of PHASE14_NATIVE_STATES) {
    const system = REQUIRED_APPEARANCES[2];
    cells.push(createCell(state, system, viewport, "portrait", 1, "system-live-switch", {
      liveOsSwitch: true,
      systemNightAfter: true,
      expectedRenderedThemeAfterSwitch: "dark",
    }));
    for (const appearance of REQUIRED_APPEARANCES.slice(0, 2)) {
      cells.push(createCell(state, appearance, viewport, "portrait", 1, "explicit-theme-invariance", {
        liveOsSwitch: true,
        systemNightAfter: appearance.osScheme !== "dark",
        expectedRenderedThemeAfterSwitch: appearance.renderedTheme,
      }));
    }
    if (state.motionSensitive) {
      cells.push(createCell(state, REQUIRED_APPEARANCES[1], viewport, "portrait", 1, "reduced-motion", {
        reducedMotion: true,
      }));
    }
  }
  return cells;
}

export const PHASE14_EXECUTABLE_MATRIX_CELLS = Object.freeze([
  ...baseCells(),
  ...variantCells(),
]);

export const PHASE14_NATIVE_MATRIX = Object.freeze({
  schemaVersion: 3,
  suite: "phase14",
  package: "com.fchoo.gymtracker.devtest",
  profile: "development-test",
  themes: Object.freeze(REQUIRED_APPEARANCES.map(({ id }) => id)),
  appearances: REQUIRED_APPEARANCES,
  liveOsSwitch: true,
  explicitThemeInvariant: true,
  viewports: REQUIRED_VIEWPORTS,
  orientations: REQUIRED_ORIENTATIONS,
  fontScales: REQUIRED_FONT_SCALES,
  minTargetDp: 48,
  focusRingDp: 3,
  capture: Object.freeze({
    semanticTree: "pre-and-post-each-action",
    focusKeyTrace: "observed-adb",
    targetWindowBounds: true,
    runtimeStateDigest: "development-test-app-canonical-logical-sqlite-source",
    screenshot: true,
    visualComparison: "pngjs-7.0.0",
    referenceNativeOverlayDifferenceMask: true,
    contactSheetsAreIndexOnly: true,
    platformChromeSeparate: true,
    unexplainedDifferenceFails: true,
  }),
  input: REQUIRED_INPUT,
  motion: Object.freeze(["normal", "reduced-motion-equivalence"]),
  startup: Object.freeze(["factual-loading", "notification-permission", "continue-without-alerts"]),
  recovery: Object.freeze(["development-test-fixtures", "no-write-navigation"]),
  states: PHASE14_NATIVE_STATES,
  stages: Object.freeze(PHASE14_NATIVE_STATES.map(({ stage, flow }) => Object.freeze({ stage, flow }))),
  baseCellCount: 13 * 64,
  cells: PHASE14_EXECUTABLE_MATRIX_CELLS,
});

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isViewport(value) {
  return REQUIRED_VIEWPORTS.some((entry) => same(entry, value));
}

function validateState(state) {
  const source = CASE_BY_ID[state?.caseId];
  if (
    source === undefined
    || source.stage !== state.stage
    || source.flow !== state.flow
    || !same(source.state, state.state)
    || !Array.isArray(state.actions)
    || state.actions.length < 1
    || state.actions.some((action) => ACTIONS[action.id] !== action)
    || !Array.isArray(state.checkpoints)
    || state.checkpoints.length < 1
    || !Array.isArray(state.postconditions)
    || state.postconditions.length < 1
    || !Array.isArray(state.componentTests)
    || state.componentTests.length < 1
    || !["no-write", "preference-write-reviewed"].includes(state.runtimeStatePolicy)
    || typeof state.motionSensitive !== "boolean"
    || !["revision18-png", "native-only"].includes(state.referencePolicy?.kind)
  ) {
    throw new Error("phase14_native_matrix_state_invalid");
  }
}

export function validatePhase14NativeMatrix(matrix) {
  if (
    matrix?.schemaVersion !== 3
    || matrix.suite !== "phase14"
    || matrix.package !== "com.fchoo.gymtracker.devtest"
    || matrix.profile !== "development-test"
    || !same(matrix.themes, REQUIRED_APPEARANCES.map(({ id }) => id))
    || !same(matrix.appearances, REQUIRED_APPEARANCES)
    || !same(matrix.viewports, REQUIRED_VIEWPORTS)
    || !same(matrix.orientations, REQUIRED_ORIENTATIONS)
    || !same(matrix.fontScales, REQUIRED_FONT_SCALES)
    || matrix.liveOsSwitch !== true
    || matrix.explicitThemeInvariant !== true
    || matrix.minTargetDp !== 48
    || matrix.focusRingDp !== 3
    || !same(matrix.input, REQUIRED_INPUT)
    || matrix.capture?.semanticTree !== "pre-and-post-each-action"
    || matrix.capture?.focusKeyTrace !== "observed-adb"
    || matrix.capture?.runtimeStateDigest !== "development-test-app-canonical-logical-sqlite-source"
    || matrix.capture?.visualComparison !== "pngjs-7.0.0"
    || matrix.capture?.referenceNativeOverlayDifferenceMask !== true
  ) {
    throw new Error("phase14_native_matrix_identity_invalid");
  }
  if (!Array.isArray(matrix.states) || matrix.states.length !== PHASE14_NATIVE_STATES.length) {
    throw new Error("phase14_native_matrix_state_invalid");
  }
  matrix.states.forEach(validateState);
  if (!Array.isArray(matrix.cells) || matrix.cells.length < matrix.baseCellCount) {
    throw new Error("phase14_native_matrix_cells_invalid");
  }
  const ids = new Set();
  for (const cell of matrix.cells) {
    const state = matrix.states.find(({ caseId }) => caseId === cell.caseId);
    if (
      state === undefined
      || ids.has(cell.id)
      || state.stage !== cell.stage
      || state.flow !== cell.flow
      || !same(cell.state, state.state)
      || !same(cell.actions, state.actions)
      || !same(cell.checkpoints, state.checkpoints)
      || !same(cell.postconditions, state.postconditions)
      || !same(cell.referencePolicy, state.referencePolicy)
      || !REQUIRED_APPEARANCES.some(({ id }) => id === cell.appearance)
      || !["Light", "Dark", "System"].includes(cell.appearanceSelection)
      || !["light", "dark"].includes(cell.renderedTheme)
      || !["light", "dark"].includes(cell.osScheme)
      || !isViewport(cell.viewport)
      || !REQUIRED_ORIENTATIONS.includes(cell.orientation)
      || !REQUIRED_FONT_SCALES.includes(cell.fontScale)
      || typeof cell.reducedMotion !== "boolean"
      || typeof cell.liveOsSwitch !== "boolean"
    ) {
      throw new Error("phase14_native_matrix_cells_invalid");
    }
    ids.add(cell.id);
  }
  const base = matrix.cells.filter(({ variant }) => variant === "base");
  if (base.length !== PHASE14_NATIVE_STATES.length * 64) {
    throw new Error("phase14_native_matrix_cartesian_incomplete");
  }
  for (const state of matrix.states) {
    const stateBase = base.filter(({ caseId }) => caseId === state.caseId);
    if (
      stateBase.length !== 64
      || new Set(stateBase.map(({ configurationId: id }) => id)).size !== 64
      || !matrix.cells.some(({ caseId, variant }) => caseId === state.caseId && variant === "system-live-switch")
      || !matrix.cells.some(({ caseId, variant }) => caseId === state.caseId && variant === "explicit-theme-invariance")
      || (state.motionSensitive && !matrix.cells.some(({ caseId, variant, reducedMotion }) =>
        caseId === state.caseId && variant === "reduced-motion" && reducedMotion))
    ) {
      throw new Error("phase14_native_matrix_cartesian_incomplete");
    }
  }
  const observedInputs = new Set(matrix.states.flatMap(({ actions }) =>
    actions.map(({ id }) => id === "dpad-down" ? "dpad" : id)));
  if (REQUIRED_INPUT.some((input) => !observedInputs.has(input))) {
    throw new Error("phase14_native_matrix_input_incomplete");
  }
  return true;
}

export function phase14NativeMatrixPlan(matrix = PHASE14_NATIVE_MATRIX) {
  validatePhase14NativeMatrix(matrix);
  return matrix.cells.map((entry) => Object.freeze({
    ...entry,
    flowPath: `maestro/phase14/${entry.flow}.yaml`,
    capture: matrix.capture,
  }));
}

export function phase14MatrixCellsForIds(ids, matrix = PHASE14_NATIVE_MATRIX) {
  validatePhase14NativeMatrix(matrix);
  return phase14NativeMatrixPlan(matrix).filter(({ caseId }) => ids.includes(caseId));
}

if (process.argv[1]?.endsWith("phase14-native-matrix.mjs")) {
  try {
    process.stdout.write(`${JSON.stringify({ ok: true, matrix: PHASE14_NATIVE_MATRIX, plan: phase14NativeMatrixPlan() }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}

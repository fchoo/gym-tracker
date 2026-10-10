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
const REQUIRED_INPUT = Object.freeze(["dpad", "enter", "space", "back", "escape", "scrim", "ime-clearance", "launch"]);

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
    actions: Object.freeze([...entry.actions]),
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

const BASE_CAPTURE_REQUIREMENTS = Object.freeze({
  geometry: true,
  layout: true,
  screenshot: true,
  semantic: true,
  theme: true,
});

function behaviorProfile(state, appearance, viewport, orientation, fontScale, variant) {
  if (
    variant === "base"
    && appearance.id === "light"
    && viewport.width === 390
    && viewport.height === 844
    && orientation === "portrait"
    && fontScale === 1
  ) return "normal";
  if (
    variant === "base"
    && appearance.id === "dark"
    && viewport.width === 360
    && viewport.height === 800
    && orientation === "portrait"
    && fontScale === 2
  ) return "accessibility-200";
  if (
    variant === "base"
    && appearance.id === "system-on-light"
    && viewport.width === 390
    && viewport.height === 844
    && orientation === "landscape"
    && fontScale === 1
    && ["shell.sheets", "shell.data-recovery"].includes(state.caseId)
  ) return "landscape-geometry";
  if (variant === "reduced-motion" && state.motionSensitive) return "reduced-motion";
  return null;
}

function behaviorContract(state, profile) {
  if (profile === null) {
    return Object.freeze({ representative: false, profile: null, actionIds: Object.freeze([]), logicalStateProbe: false });
  }
  return Object.freeze({
    representative: true,
    profile,
    actionIds: Object.freeze(state.actions.map(({ id }) => id)),
    logicalStateProbe: state.runtimeStatePolicy === "no-write" && state.actions.length > 0,
  });
}

function createCell(state, appearance, viewport, orientation, fontScale, variant = "base", overrides = {}) {
  const suffix = variant === "base" ? "" : `-${variant}`;
  const { behaviorProfile: profileOverride, ...cellOverrides } = overrides;
  const profile = profileOverride === undefined
    ? behaviorProfile(state, appearance, viewport, orientation, fontScale, variant)
    : profileOverride;
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
    behavior: behaviorContract(state, profile),
    captureRequirements: BASE_CAPTURE_REQUIREMENTS,
    ...cellOverrides,
  });
}

function requiredState(caseId) {
  const state = PHASE14_NATIVE_STATES.find((entry) => entry.caseId === caseId);
  if (state === undefined) throw new Error(`phase14_native_matrix_unknown_case:${caseId}`);
  return state;
}

function requiredAppearance(id) {
  const appearance = REQUIRED_APPEARANCES.find((entry) => entry.id === id);
  if (appearance === undefined) throw new Error(`phase14_native_matrix_unknown_appearance:${id}`);
  return appearance;
}

function requiredViewport(width, height) {
  const viewport = REQUIRED_VIEWPORTS.find((entry) => entry.width === width && entry.height === height);
  if (viewport === undefined) throw new Error(`phase14_native_matrix_unknown_viewport:${width}x${height}`);
  return viewport;
}

function representativeCell({
  caseId,
  appearance,
  viewport,
  orientation,
  fontScale,
  profile = null,
  variant = "base",
  ...overrides
}) {
  return createCell(
    requiredState(caseId),
    requiredAppearance(appearance),
    requiredViewport(viewport[0], viewport[1]),
    orientation,
    fontScale,
    variant,
    { behaviorProfile: profile, ...overrides },
  );
}

// Risk-based native coverage: one exact action-bearing representative for every
// shell requirement, plus four appearance/theme variants. This is the original
// validated Phase 14 scale and avoids a redundant 13 x 64 Cartesian product.
export const PHASE14_EXECUTABLE_MATRIX_CELLS = Object.freeze([
  representativeCell({ caseId: "shell.four-roots", appearance: "dark", viewport: [360, 800], orientation: "portrait", fontScale: 2, profile: "accessibility-200" }),
  representativeCell({ caseId: "shell.four-roots", appearance: "system-on-light", viewport: [390, 844], orientation: "portrait", fontScale: 1, variant: "system-live-switch", liveOsSwitch: true, systemNightAfter: true, expectedRenderedThemeAfterSwitch: "dark" }),
  representativeCell({ caseId: "shell.root-state", appearance: "dark", viewport: [390, 844], orientation: "portrait", fontScale: 1, profile: "normal" }),
  representativeCell({ caseId: "shell.appearance", appearance: "light", viewport: [390, 844], orientation: "portrait", fontScale: 1, profile: "normal", variant: "explicit-theme-invariance", liveOsSwitch: true, systemNightAfter: false, expectedRenderedThemeAfterSwitch: "light" }),
  representativeCell({ caseId: "shell.appearance", appearance: "dark", viewport: [390, 844], orientation: "portrait", fontScale: 1, variant: "explicit-theme-invariance", liveOsSwitch: true, systemNightAfter: true, expectedRenderedThemeAfterSwitch: "dark" }),
  representativeCell({ caseId: "shell.appearance", appearance: "system-on-light", viewport: [390, 844], orientation: "portrait", fontScale: 1 }),
  representativeCell({ caseId: "shell.appearance", appearance: "system-on-dark", viewport: [390, 844], orientation: "portrait", fontScale: 1 }),
  representativeCell({ caseId: "shell.tokens", appearance: "system-on-dark", viewport: [600, 960], orientation: "portrait", fontScale: 1, profile: "normal" }),
  representativeCell({ caseId: "shell.sheets", appearance: "system-on-light", viewport: [390, 844], orientation: "landscape", fontScale: 1, profile: "landscape-geometry" }),
  representativeCell({ caseId: "shell.toasts", appearance: "dark", viewport: [390, 844], orientation: "portrait", fontScale: 1, profile: "reduced-motion", variant: "reduced-motion", reducedMotion: true }),
  representativeCell({ caseId: "shell.launch", appearance: "system-on-light", viewport: [360, 800], orientation: "portrait", fontScale: 2, profile: "accessibility-200" }),
  representativeCell({ caseId: "shell.rest-alerts", appearance: "dark", viewport: [390, 844], orientation: "portrait", fontScale: 1, profile: "normal" }),
  representativeCell({ caseId: "shell.settings-deep-links", appearance: "light", viewport: [600, 960], orientation: "portrait", fontScale: 2, profile: "accessibility-200" }),
  representativeCell({ caseId: "shell.removed-sessions", appearance: "dark", viewport: [390, 844], orientation: "portrait", fontScale: 2, profile: "accessibility-200" }),
  representativeCell({ caseId: "shell.data-recovery", appearance: "light", viewport: [840, 1080], orientation: "landscape", fontScale: 1, profile: "landscape-geometry" }),
  representativeCell({ caseId: "shell.automatic-backup", appearance: "system-on-light", viewport: [600, 960], orientation: "portrait", fontScale: 1, profile: "normal" }),
  representativeCell({ caseId: "shell.manual-backup", appearance: "system-on-dark", viewport: [840, 1080], orientation: "portrait", fontScale: 2, profile: "accessibility-200" }),
]);

export const PHASE14_NATIVE_MATRIX = Object.freeze({
  schemaVersion: 5,
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
  representativeCellCount: 17,
  behaviorProfiles: Object.freeze({
    required: Object.freeze(["normal", "accessibility-200", "landscape-geometry", "reduced-motion"]),
    geometry: Object.freeze({ "shell.sheets": "landscape-geometry", "shell.data-recovery": "landscape-geometry" }),
    motion: "reduced-motion",
  }),
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
    || state.actions.some((action) =>
      typeof action?.id !== "string"
      || action.preparation?.stage !== state.stage
      || action.preparation?.action !== action.id
      || !["adb-keyevent", "adb-coordinate", "adb-launch"].includes(action.transport)
      || action.pre?.package !== "com.fchoo.gymtracker.devtest"
      || action.post?.package !== "com.fchoo.gymtracker.devtest"
      || action.pre?.rejectLauncher !== true
      || action.post?.rejectLauncher !== true
      || !Number.isInteger(action.poll?.timeoutMs)
      || !Number.isInteger(action.poll?.intervalMs))
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
    matrix?.schemaVersion !== 5
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
  if (
    matrix.representativeCellCount !== 17
    || !Array.isArray(matrix.cells)
    || matrix.cells.length !== matrix.representativeCellCount
  ) {
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
      || !same(cell.captureRequirements, BASE_CAPTURE_REQUIREMENTS)
      || typeof cell.behavior?.representative !== "boolean"
      || !Array.isArray(cell.behavior?.actionIds)
      || typeof cell.behavior?.logicalStateProbe !== "boolean"
    ) {
      throw new Error("phase14_native_matrix_cells_invalid");
    }
    ids.add(cell.id);
  }
  if (
    REQUIRED_APPEARANCES.some(({ id }) => !matrix.cells.some(({ appearance }) => appearance === id))
    || REQUIRED_VIEWPORTS.some((viewport) => !matrix.cells.some((cell) => same(cell.viewport, viewport)))
    || REQUIRED_ORIENTATIONS.some((orientation) => !matrix.cells.some((cell) => cell.orientation === orientation))
    || REQUIRED_FONT_SCALES.some((fontScale) => !matrix.cells.some((cell) => cell.fontScale === fontScale))
    || !matrix.cells.some(({ variant, liveOsSwitch }) => variant === "system-live-switch" && liveOsSwitch)
    || !matrix.cells.some(({ appearance, variant, liveOsSwitch }) => appearance === "light" && variant === "explicit-theme-invariance" && liveOsSwitch)
    || !matrix.cells.some(({ appearance, variant, liveOsSwitch }) => appearance === "dark" && variant === "explicit-theme-invariance" && liveOsSwitch)
    || !matrix.cells.some(({ variant, reducedMotion }) => variant === "reduced-motion" && reducedMotion)
  ) {
    throw new Error("phase14_native_matrix_representative_coverage_invalid");
  }
  for (const state of matrix.states) {
    const stateCells = matrix.cells.filter(({ caseId }) => caseId === state.caseId);
    const representatives = matrix.cells.filter(({ caseId, behavior }) =>
      caseId === state.caseId && behavior.representative);
    if (
      stateCells.length < 1
      || representatives.length !== 1
      || representatives.some(({ behavior }) =>
        !same(behavior.actionIds, state.actions.map(({ id }) => id))
        || behavior.logicalStateProbe !== (state.runtimeStatePolicy === "no-write" && state.actions.length > 0))
      || matrix.cells.some(({ caseId, behavior }) => caseId === state.caseId && !behavior.representative
        && (behavior.profile !== null || behavior.actionIds.length !== 0 || behavior.logicalStateProbe !== false))
    ) throw new Error("phase14_native_matrix_behavior_coverage_invalid");
  }
  const profiles = new Set(matrix.cells.filter(({ behavior }) => behavior.representative)
    .map(({ behavior }) => behavior.profile));
  if (
    matrix.behaviorProfiles.required.some((profile) => !profiles.has(profile))
    || matrix.cells.filter(({ behavior }) => behavior.profile === "landscape-geometry")
      .some(({ caseId }) => !["shell.sheets", "shell.data-recovery"].includes(caseId))
    || !["shell.sheets", "shell.data-recovery"].every((caseId) =>
      matrix.cells.some((cell) => cell.caseId === caseId && cell.behavior.profile === "landscape-geometry"))
  ) throw new Error("phase14_native_matrix_behavior_coverage_invalid");
  const inputName = {
    DPAD_RIGHT: "dpad",
    DPAD_DOWN: "dpad",
    ENTER: "enter",
    SPACE: "space",
    BACK: "back",
    ESCAPE: "escape",
    SCRIM: "scrim",
    IME_CLEARANCE: "ime-clearance",
    LAUNCH: "launch",
  };
  const observedInputs = new Set(matrix.states.flatMap(({ actions }) =>
    actions.map(({ input }) => inputName[input])));
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

export function phase14BehaviorCoverageForCells(cells) {
  return Object.freeze({
    representative_cell_ids: Object.freeze(cells.filter(({ behavior }) => behavior.representative).map(({ id }) => id)),
    logical_probe_cell_ids: Object.freeze(cells.filter(({ behavior }) => behavior.logicalStateProbe).map(({ id }) => id)),
    profiles_by_case: Object.freeze(Object.fromEntries(PHASE14_NATIVE_STATES.map(({ caseId }) => [
      caseId,
      Object.freeze(cells.filter((cell) => cell.caseId === caseId && cell.behavior.representative)
        .map(({ behavior }) => behavior.profile)),
    ]))),
  });
}

if (process.argv[1]?.endsWith("phase14-native-matrix.mjs")) {
  try {
    process.stdout.write(`${JSON.stringify({ ok: true, matrix: PHASE14_NATIVE_MATRIX, plan: phase14NativeMatrixPlan() }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}

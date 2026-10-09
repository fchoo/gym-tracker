import { PHASE14_SHELL_EVIDENCE_CASES } from "../src/testing/contracts/phase14Shell.contract.ts";

const REQUIRED_THEMES = Object.freeze([
  "light",
  "dark",
  "system-on-light",
  "system-on-dark",
]);
const REQUIRED_VIEWPORTS = Object.freeze([
  Object.freeze({ width: 360, height: 800 }),
  Object.freeze({ width: 390, height: 844 }),
  Object.freeze({ width: 600, height: 960 }),
  Object.freeze({ width: 840, height: 1080 }),
]);
const REQUIRED_INPUT = Object.freeze([
  "heading-focus",
  "trigger-focus",
  "back",
  "escape",
  "scrim",
  "ime-clearance",
  "dpad",
]);

const STAGES_BY_ID = Object.freeze(
  Object.fromEntries(
    PHASE14_SHELL_EVIDENCE_CASES.map((entry) => [entry.id, entry]),
  ),
);

function stageFor(caseId) {
  const entry = STAGES_BY_ID[caseId];
  if (entry === undefined) {
    throw new Error(`phase14_native_matrix_unknown_case:${caseId}`);
  }
  return entry;
}

function cell({
  id,
  caseId,
  theme,
  viewport,
  orientation,
  fontScale,
  reducedMotion,
  expectedInputs,
  liveOsSwitch = false,
  systemNightAfter = null,
}) {
  const entry = stageFor(caseId);
  return Object.freeze({
    id,
    caseId,
    stage: entry.stage,
    flow: entry.flow,
    theme,
    viewport: Object.freeze(viewport),
    orientation,
    fontScale,
    reducedMotion,
    liveOsSwitch,
    ...(systemNightAfter === null ? {} : { systemNightAfter }),
    expectedInputs: Object.freeze([...expectedInputs]),
  });
}

export const PHASE14_EXECUTABLE_MATRIX_CELLS = Object.freeze([
  cell({
    id: "shell-four-roots-phone-360-portrait-scale-2",
    caseId: "shell.four-roots",
    theme: "light",
    viewport: { width: 360, height: 800 },
    orientation: "portrait",
    fontScale: 2,
    reducedMotion: false,
    expectedInputs: ["heading-focus", "dpad"],
  }),
  cell({
    id: "shell-four-roots-tablet-840-landscape-scale-1",
    caseId: "shell.four-roots",
    theme: "dark",
    viewport: { width: 840, height: 1080 },
    orientation: "landscape",
    fontScale: 1,
    reducedMotion: false,
    expectedInputs: ["heading-focus", "dpad"],
  }),
  cell({
    id: "shell-root-state-phone-390-portrait-scale-1",
    caseId: "shell.root-state",
    theme: "dark",
    viewport: { width: 390, height: 844 },
    orientation: "portrait",
    fontScale: 1,
    reducedMotion: false,
    expectedInputs: ["trigger-focus", "back", "dpad"],
  }),
  cell({
    id: "shell-appearance-light-390-portrait-scale-1",
    caseId: "shell.appearance",
    theme: "light",
    viewport: { width: 390, height: 844 },
    orientation: "portrait",
    fontScale: 1,
    reducedMotion: false,
    expectedInputs: ["trigger-focus"],
  }),
  cell({
    id: "shell-appearance-dark-390-portrait-scale-1",
    caseId: "shell.appearance",
    theme: "dark",
    viewport: { width: 390, height: 844 },
    orientation: "portrait",
    fontScale: 1,
    reducedMotion: false,
    expectedInputs: ["trigger-focus"],
  }),
  cell({
    id: "shell-appearance-system-light-live-switch",
    caseId: "shell.appearance",
    theme: "system-on-light",
    viewport: { width: 390, height: 844 },
    orientation: "portrait",
    fontScale: 1,
    reducedMotion: false,
    liveOsSwitch: true,
    systemNightAfter: true,
    expectedInputs: ["trigger-focus"],
  }),
  cell({
    id: "shell-appearance-system-dark-390-portrait-scale-1",
    caseId: "shell.appearance",
    theme: "system-on-dark",
    viewport: { width: 390, height: 844 },
    orientation: "portrait",
    fontScale: 1,
    reducedMotion: false,
    expectedInputs: ["trigger-focus"],
  }),
  cell({
    id: "shell-tokens-tablet-600-portrait-scale-1",
    caseId: "shell.tokens",
    theme: "system-on-dark",
    viewport: { width: 600, height: 960 },
    orientation: "portrait",
    fontScale: 1,
    reducedMotion: false,
    expectedInputs: ["heading-focus"],
  }),
  cell({
    id: "shell-sheets-tablet-600-landscape-scale-2",
    caseId: "shell.sheets",
    theme: "light",
    viewport: { width: 600, height: 960 },
    orientation: "landscape",
    fontScale: 2,
    reducedMotion: false,
    expectedInputs: ["escape", "scrim", "ime-clearance", "dpad"],
  }),
  cell({
    id: "shell-toasts-phone-390-portrait-scale-1-reduced-motion",
    caseId: "shell.toasts",
    theme: "dark",
    viewport: { width: 390, height: 844 },
    orientation: "portrait",
    fontScale: 1,
    reducedMotion: true,
    expectedInputs: ["trigger-focus"],
  }),
  cell({
    id: "shell-launch-phone-360-portrait-scale-2",
    caseId: "shell.launch",
    theme: "system-on-light",
    viewport: { width: 360, height: 800 },
    orientation: "portrait",
    fontScale: 2,
    reducedMotion: false,
    expectedInputs: ["back"],
  }),
  cell({
    id: "shell-rest-alerts-phone-390-portrait-scale-1",
    caseId: "shell.rest-alerts",
    theme: "dark",
    viewport: { width: 390, height: 844 },
    orientation: "portrait",
    fontScale: 1,
    reducedMotion: false,
    expectedInputs: ["back", "dpad"],
  }),
  cell({
    id: "shell-settings-deep-links-tablet-600-portrait-scale-2",
    caseId: "shell.settings-deep-links",
    theme: "light",
    viewport: { width: 600, height: 960 },
    orientation: "portrait",
    fontScale: 2,
    reducedMotion: false,
    expectedInputs: ["back", "trigger-focus"],
  }),
  cell({
    id: "shell-removed-sessions-phone-390-portrait-scale-2",
    caseId: "shell.removed-sessions",
    theme: "dark",
    viewport: { width: 390, height: 844 },
    orientation: "portrait",
    fontScale: 2,
    reducedMotion: false,
    expectedInputs: ["trigger-focus", "back"],
  }),
  cell({
    id: "shell-data-recovery-tablet-840-landscape-scale-1",
    caseId: "shell.data-recovery",
    theme: "light",
    viewport: { width: 840, height: 1080 },
    orientation: "landscape",
    fontScale: 1,
    reducedMotion: false,
    expectedInputs: ["ime-clearance", "back"],
  }),
  cell({
    id: "shell-automatic-backup-tablet-600-portrait-scale-1",
    caseId: "shell.automatic-backup",
    theme: "system-on-light",
    viewport: { width: 600, height: 960 },
    orientation: "portrait",
    fontScale: 1,
    reducedMotion: false,
    expectedInputs: ["trigger-focus", "back"],
  }),
  cell({
    id: "shell-manual-backup-tablet-840-portrait-scale-2",
    caseId: "shell.manual-backup",
    theme: "system-on-dark",
    viewport: { width: 840, height: 1080 },
    orientation: "portrait",
    fontScale: 2,
    reducedMotion: false,
    expectedInputs: ["ime-clearance", "back"],
  }),
]);

export const PHASE14_NATIVE_MATRIX = Object.freeze({
  suite: "phase14",
  package: "com.fchoo.gymtracker.devtest",
  profile: "development-test",
  themes: REQUIRED_THEMES,
  liveOsSwitch: true,
  explicitThemeInvariant: true,
  viewports: REQUIRED_VIEWPORTS,
  orientations: Object.freeze(["portrait", "landscape"]),
  fontScales: Object.freeze([1, 2]),
  minTargetDp: 48,
  focusRingDp: 3,
  capture: Object.freeze({
    semanticTree: true,
    focusKeyTrace: true,
    targetWindowBounds: true,
    sourceStateDigest: true,
    screenshot: true,
    differenceOverlay: "revision-18",
    contactSheetsAreIndexOnly: true,
    platformChromeSeparate: true,
    unexplainedDifferenceFails: true,
  }),
  input: REQUIRED_INPUT,
  motion: Object.freeze(["reduced-motion-equivalence"]),
  startup: Object.freeze([
    "factual-loading",
    "notification-permission",
    "continue-without-alerts",
  ]),
  recovery: Object.freeze([
    "development-test-fixtures",
    "no-write-navigation",
  ]),
  stages: Object.freeze(
    PHASE14_SHELL_EVIDENCE_CASES.map(({ stage, flow }) =>
      Object.freeze({ stage, flow })),
  ),
  cells: PHASE14_EXECUTABLE_MATRIX_CELLS,
});

function exactArray(actual, expected, name) {
  if (
    !Array.isArray(actual)
    || actual.length !== expected.length
    || actual.some((entry, index) => entry !== expected[index])
  ) {
    throw new Error(`phase14_native_matrix_${name}_invalid`);
  }
}

function includesViewport(viewports, required) {
  return viewports.some(
    ({ width, height }) =>
      width === required.width && height === required.height,
  );
}

function sameViewport(left, right) {
  return left.width === right.width && left.height === right.height;
}

export function validatePhase14NativeMatrix(matrix) {
  if (
    matrix?.suite !== "phase14"
    || matrix.package !== "com.fchoo.gymtracker.devtest"
    || matrix.profile !== "development-test"
  ) {
    throw new Error("phase14_native_matrix_identity_invalid");
  }
  exactArray(matrix.themes, REQUIRED_THEMES, "themes");
  if (
    matrix.liveOsSwitch !== true
    || matrix.explicitThemeInvariant !== true
  ) {
    throw new Error("phase14_native_matrix_theme_behavior_invalid");
  }
  if (
    !Array.isArray(matrix.viewports)
    || REQUIRED_VIEWPORTS.some(
      (viewport) => !includesViewport(matrix.viewports, viewport),
    )
  ) {
    throw new Error("phase14_native_matrix_viewports_invalid");
  }
  exactArray(matrix.orientations, ["portrait", "landscape"], "orientations");
  exactArray(matrix.fontScales, [1, 2], "font_scales");
  if (
    matrix.minTargetDp !== 48
    || matrix.focusRingDp !== 3
  ) {
    throw new Error("phase14_native_matrix_accessibility_bounds_invalid");
  }
  if (
    matrix.capture?.semanticTree !== true
    || matrix.capture?.focusKeyTrace !== true
    || matrix.capture?.targetWindowBounds !== true
    || matrix.capture?.sourceStateDigest !== true
    || matrix.capture?.screenshot !== true
    || matrix.capture?.differenceOverlay !== "revision-18"
    || matrix.capture?.contactSheetsAreIndexOnly !== true
    || matrix.capture?.platformChromeSeparate !== true
    || matrix.capture?.unexplainedDifferenceFails !== true
  ) {
    throw new Error("phase14_native_matrix_capture_invalid");
  }
  exactArray(matrix.input, REQUIRED_INPUT, "input");
  exactArray(matrix.motion, ["reduced-motion-equivalence"], "motion");
  exactArray(
    matrix.startup,
    ["factual-loading", "notification-permission", "continue-without-alerts"],
    "startup",
  );
  exactArray(
    matrix.recovery,
    ["development-test-fixtures", "no-write-navigation"],
    "recovery",
  );
  const expectedStages = PHASE14_SHELL_EVIDENCE_CASES.map(({ stage }) => stage);
  if (
    !Array.isArray(matrix.stages)
    || matrix.stages.length !== expectedStages.length
    || matrix.stages.some(
      (entry, index) =>
        entry?.stage !== expectedStages[index]
        || entry.flow !== PHASE14_SHELL_EVIDENCE_CASES[index].flow,
    )
  ) {
    throw new Error("phase14_native_matrix_stages_invalid");
  }

  if (!Array.isArray(matrix.cells) || matrix.cells.length < expectedStages.length) {
    throw new Error("phase14_native_matrix_cells_invalid");
  }
  const seenCellIds = new Set();
  const stageCoverage = new Set();
  const themeCoverage = new Set();
  const orientationCoverage = new Set();
  const fontScaleCoverage = new Set();
  const inputCoverage = new Set();
  const liveViewportCoverage = [];
  let reducedMotionCovered = false;
  let liveSwitchCovered = false;
  for (const entry of matrix.cells) {
    const expectedInputs = Array.isArray(entry.expectedInputs)
      ? entry.expectedInputs
      : [];
    if (
      typeof entry?.id !== "string"
      || seenCellIds.has(entry.id)
      || !STAGES_BY_ID[entry.caseId]
      || STAGES_BY_ID[entry.caseId].stage !== entry.stage
      || STAGES_BY_ID[entry.caseId].flow !== entry.flow
      || !REQUIRED_THEMES.includes(entry.theme)
      || expectedInputs.length === 0
      || new Set(expectedInputs).size !== expectedInputs.length
      || expectedInputs.some((input) => !REQUIRED_INPUT.includes(input))
      || !includesViewport(REQUIRED_VIEWPORTS, entry.viewport)
      || !["portrait", "landscape"].includes(entry.orientation)
      || ![1, 2].includes(entry.fontScale)
      || typeof entry.reducedMotion !== "boolean"
      || typeof entry.liveOsSwitch !== "boolean"
    ) {
      throw new Error("phase14_native_matrix_cells_invalid");
    }
    seenCellIds.add(entry.id);
    stageCoverage.add(entry.stage);
    themeCoverage.add(entry.theme);
    orientationCoverage.add(entry.orientation);
    fontScaleCoverage.add(entry.fontScale);
    liveViewportCoverage.push(entry.viewport);
    expectedInputs.forEach((input) => inputCoverage.add(input));
    reducedMotionCovered ||= entry.reducedMotion;
    liveSwitchCovered ||= entry.liveOsSwitch;
  }
  if (
    expectedStages.some((stage) => !stageCoverage.has(stage))
    || REQUIRED_THEMES.some((theme) => !themeCoverage.has(theme))
    || ["portrait", "landscape"].some(
      (orientation) => !orientationCoverage.has(orientation),
    )
    || [1, 2].some((scale) => !fontScaleCoverage.has(scale))
    || REQUIRED_VIEWPORTS.some(
      (viewport) => !liveViewportCoverage.some((entry) => sameViewport(entry, viewport)),
    )
    || REQUIRED_INPUT.some((input) => !inputCoverage.has(input))
    || reducedMotionCovered !== true
    || liveSwitchCovered !== true
  ) {
    throw new Error("phase14_native_matrix_cells_invalid");
  }
  return true;
}

export function phase14NativeMatrixPlan(matrix = PHASE14_NATIVE_MATRIX) {
  validatePhase14NativeMatrix(matrix);
  return matrix.cells.map((entry) => ({
    ...entry,
    flowPath: `maestro/phase14/${entry.flow}.yaml`,
    capture: matrix.capture,
  }));
}

export function phase14MatrixCellsForIds(
  ids,
  matrix = PHASE14_NATIVE_MATRIX,
) {
  validatePhase14NativeMatrix(matrix);
  return phase14NativeMatrixPlan(matrix).filter(({ caseId }) =>
    ids.includes(caseId));
}

if (process.argv[1]?.endsWith("phase14-native-matrix.mjs")) {
  try {
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        matrix: PHASE14_NATIVE_MATRIX,
        plan: phase14NativeMatrixPlan(),
      }, null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}

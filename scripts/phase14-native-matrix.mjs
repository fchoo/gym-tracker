import { PHASE14_SHELL_EVIDENCE_CASES } from "../src/testing/contracts/phase14Shell.contract.ts";

const REQUIRED_THEMES = Object.freeze(["light", "dark", "system-on-light", "system-on-dark"]);
const REQUIRED_VIEWPORTS = Object.freeze([
  Object.freeze({ width: 360, height: 800 }),
  Object.freeze({ width: 390, height: 844 }),
  Object.freeze({ width: 600, height: 960 }),
  Object.freeze({ width: 840, height: 1080 }),
]);
const REQUIRED_INPUT = Object.freeze(["heading-focus", "trigger-focus", "back", "escape", "scrim", "ime-clearance", "dpad"]);

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
  startup: Object.freeze(["factual-loading", "notification-permission", "continue-without-alerts"]),
  recovery: Object.freeze(["development-test-fixtures", "no-write-navigation"]),
  stages: Object.freeze(PHASE14_SHELL_EVIDENCE_CASES.map(({ stage, flow }) => Object.freeze({ stage, flow }))),
});

function exactArray(actual, expected, name) {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
    throw new Error(`phase14_native_matrix_${name}_invalid`);
  }
}

function includesViewport(viewports, required) {
  return viewports.some(({ width, height }) => width === required.width && height === required.height);
}

export function validatePhase14NativeMatrix(matrix) {
  if (matrix?.suite !== "phase14" || matrix.package !== "com.fchoo.gymtracker.devtest" || matrix.profile !== "development-test") {
    throw new Error("phase14_native_matrix_identity_invalid");
  }
  exactArray(matrix.themes, REQUIRED_THEMES, "themes");
  if (matrix.liveOsSwitch !== true || matrix.explicitThemeInvariant !== true) throw new Error("phase14_native_matrix_theme_behavior_invalid");
  if (!Array.isArray(matrix.viewports) || REQUIRED_VIEWPORTS.some((viewport) => !includesViewport(matrix.viewports, viewport))) {
    throw new Error("phase14_native_matrix_viewports_invalid");
  }
  exactArray(matrix.orientations, ["portrait", "landscape"], "orientations");
  exactArray(matrix.fontScales, [1, 2], "font_scales");
  if (matrix.minTargetDp !== 48 || matrix.focusRingDp !== 3) throw new Error("phase14_native_matrix_accessibility_bounds_invalid");
  if (matrix.capture?.semanticTree !== true || matrix.capture?.focusKeyTrace !== true || matrix.capture?.targetWindowBounds !== true || matrix.capture?.sourceStateDigest !== true || matrix.capture?.screenshot !== true || matrix.capture?.differenceOverlay !== "revision-18" || matrix.capture?.contactSheetsAreIndexOnly !== true || matrix.capture?.platformChromeSeparate !== true || matrix.capture?.unexplainedDifferenceFails !== true) {
    throw new Error("phase14_native_matrix_capture_invalid");
  }
  exactArray(matrix.input, REQUIRED_INPUT, "input");
  exactArray(matrix.motion, ["reduced-motion-equivalence"], "motion");
  exactArray(matrix.startup, ["factual-loading", "notification-permission", "continue-without-alerts"], "startup");
  exactArray(matrix.recovery, ["development-test-fixtures", "no-write-navigation"], "recovery");
  const expectedStages = PHASE14_SHELL_EVIDENCE_CASES.map(({ stage }) => stage);
  if (!Array.isArray(matrix.stages) || matrix.stages.length !== expectedStages.length || matrix.stages.some((entry, index) => entry?.stage !== expectedStages[index] || entry.flow !== PHASE14_SHELL_EVIDENCE_CASES[index].flow)) {
    throw new Error("phase14_native_matrix_stages_invalid");
  }
  return true;
}

export function phase14NativeMatrixPlan(matrix = PHASE14_NATIVE_MATRIX) {
  validatePhase14NativeMatrix(matrix);
  return matrix.stages.map(({ stage, flow }) => ({
    stage,
    flow: `maestro/phase14/${flow}.yaml`,
    themes: matrix.themes,
    viewports: matrix.viewports,
    orientations: matrix.orientations,
    fontScales: matrix.fontScales,
    capture: matrix.capture,
  }));
}

if (process.argv[1]?.endsWith("phase14-native-matrix.mjs")) {
  try {
    process.stdout.write(`${JSON.stringify({ ok: true, matrix: PHASE14_NATIVE_MATRIX, plan: phase14NativeMatrixPlan() }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}

import { createHash } from "node:crypto";

import {
  PHASE15_EVIDENCE_CASE_IDS,
  PHASE15_ROOT_TO_COMPLETION_CASE,
  PHASE15_VISUAL_REFERENCES,
} from "../src/testing/contracts/phase15Workout.contract.ts";

const PACKAGE = "com.fchoo.gymtracker.devtest";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const freeze = (value) => Object.freeze(value);
const REFERENCE_VIEWPORT = freeze({ width: 390, height: 844 });
const REQUIRED_APPEARANCES = freeze([
  freeze({ id: "light", selection: "Light", renderedTheme: "light", osScheme: "dark" }),
  freeze({ id: "dark", selection: "Dark", renderedTheme: "dark", osScheme: "light" }),
  freeze({ id: "system-on-light", selection: "System", renderedTheme: "light", osScheme: "light" }),
  freeze({ id: "system-on-dark", selection: "System", renderedTheme: "dark", osScheme: "dark" }),
]);
const REQUIRED_VIEWPORTS = freeze([
  freeze({ width: 360, height: 800, orientation: "portrait" }),
  freeze({ width: 390, height: 844, orientation: "portrait" }),
  freeze({ width: 600, height: 960, orientation: "portrait" }),
  freeze({ width: 840, height: 1080, orientation: "portrait" }),
  freeze({ width: 800, height: 360, orientation: "landscape" }),
  freeze({ width: 960, height: 600, orientation: "landscape" }),
  freeze({ width: 1080, height: 840, orientation: "landscape" }),
]);
const EDITOR_PROFILES = freeze(["load-reps", "load", "reps", "duration", "distance", "duration-distance", "reps-distance", "timed-reps", "rounds"]);
const REQUIRED_INPUT = freeze(["touch", "keyboard", "dpad", "enter", "space", "back", "escape", "ime-clearance"]);
const ROOT_CASES = new Set(["workout.root-identity", "workout.day-switch", "workout.scheduled-rest-empty", "workout.start-alternate", "workout.start-resume", "workout.context-running", "workout.appearance"]);
const COMPLETION_CASES = new Set(["workout.outcomes", "workout.completion-review", "workout.completion-writeback", "workout.offline-recovery"]);

function flowFor(caseId) {
  if (ROOT_CASES.has(caseId)) return "workout-root";
  if (COMPLETION_CASES.has(caseId)) return "recovery-completion";
  return "active-workout";
}

function actionsFor(caseId) {
  if (caseId === "workout.root-identity") return freeze(["preview", "start", "save", "complete", "rest", "finish", "completion", "keep-plan-as-is"]);
  if (caseId === "workout.day-switch") return freeze(["keyboard-day-select", "back-focus-return"]);
  if (caseId === "workout.row-edit" || caseId === "workout.load-reps-editor") return freeze(["open-editor", "input", "hide-ime", "save"]);
  if (caseId === "workout.complete-commit") return freeze(["complete", "duplicate-suppression", "rest"]);
  if (caseId === "workout.rest-recovery") return freeze(["pause", "resume", "skip", "relaunch-offline"]);
  if (caseId === "workout.reorder") return freeze(["drag-8dp", "dpad-move", "cancel"]);
  if (caseId === "workout.completion-writeback") return freeze(["preview", "keep-plan-as-is", "retry"]);
  return freeze(["observe", "activate", "assert-authoritative-state"]);
}

function baseCell(caseId, index) {
  const appearance = REQUIRED_APPEARANCES[index % REQUIRED_APPEARANCES.length];
  const viewport = REQUIRED_VIEWPORTS[index % REQUIRED_VIEWPORTS.length];
  const fontScale = index % 5 === 0 ? 2 : 1;
  const reducedMotion = index % 11 === 0;
  const lifecycle = ["workout.start-resume", "workout.rest-recovery", "workout.offline-recovery", "workout.outcomes"].includes(caseId)
    ? "process-death-offline-restart"
    : "in-process";
  return freeze({
    id: `${caseId}-${appearance.id}-${viewport.width}x${viewport.height}-font-${fontScale}`,
    caseId,
    stage: caseId,
    flow: flowFor(caseId),
    appearance: appearance.id,
    appearanceSelection: appearance.selection,
    renderedTheme: appearance.renderedTheme,
    osScheme: appearance.osScheme,
    viewport: freeze({ width: viewport.width, height: viewport.height }),
    orientation: viewport.orientation,
    fontScale,
    reducedMotion,
    lifecycle,
    inputs: freeze([REQUIRED_INPUT[index % REQUIRED_INPUT.length]]),
    actions: actionsFor(caseId),
    productionRouteOnly: true,
    behavior: freeze({ actionBearing: true, stateClass: caseId }),
    visual: caseId === PHASE15_ROOT_TO_COMPLETION_CASE
      ? freeze({ referenceViewport: "390x844", hashChain: "reference-native-overlay-difference-sha256", referenceIds: freeze(["light-workout-root", "light-active-overview", "light-committed-rest"]) })
      : undefined,
  });
}

const BASE_CELLS = PHASE15_EVIDENCE_CASE_IDS.map(baseCell);
const METRIC_VARIANTS = EDITOR_PROFILES.slice(1).map((editorProfile, index) => freeze({
  ...BASE_CELLS.find(({ caseId }) => caseId === "workout.all-metrics"),
  id: `workout.all-metrics-${editorProfile}-editor-variant`,
  editorProfile,
  fontScale: index % 2 === 0 ? 2 : 1,
  inputs: freeze([index % 2 === 0 ? "keyboard" : "touch"]),
  behavior: freeze({ actionBearing: false, stateClass: `metric-editor-${editorProfile}` }),
}));
const METRIC_BASE_INDEX = BASE_CELLS.findIndex(({ caseId }) => caseId === "workout.all-metrics");
const METRIC_BASE = freeze({ ...BASE_CELLS[METRIC_BASE_INDEX], editorProfile: EDITOR_PROFILES[0] });
BASE_CELLS[METRIC_BASE_INDEX] = METRIC_BASE;
const VISUAL_VARIANTS = Object.keys(PHASE15_VISUAL_REFERENCES).map((referenceId) => {
  const isRoot = referenceId.endsWith("workout-root");
  const isActive = referenceId.endsWith("active-overview");
  const source = BASE_CELLS.find(({ caseId }) => caseId === (isRoot ? "workout.root-identity" : isActive ? "workout.active-layout" : "workout.rest-dock"));
  return freeze({
    ...source,
    id: `${source.caseId}-${referenceId}-visual-390x844`,
    appearance: referenceId.startsWith("light") ? "light" : "dark",
    appearanceSelection: referenceId.startsWith("light") ? "Light" : "Dark",
    renderedTheme: referenceId.startsWith("light") ? "light" : "dark",
    osScheme: referenceId.startsWith("light") ? "dark" : "light",
    viewport: REFERENCE_VIEWPORT,
    orientation: "portrait",
    fontScale: 1,
    inputs: freeze([]),
    reducedMotion: false,
    behavior: freeze({ actionBearing: false, stateClass: `visual-${referenceId}` }),
    visual: freeze({ referenceViewport: "390x844", hashChain: "reference-native-overlay-difference-sha256", referenceIds: freeze([referenceId]) }),
  });
});

export const PHASE15_NATIVE_MATRIX = freeze({
  schemaVersion: 2,
  suite: "phase15",
  package: PACKAGE,
  profile: "development-test",
  sqliteContract: "expo-sqlite-authoritative",
  sourceOfTruth: "phase15-workout-ledger",
  requiredCaseIds: freeze([...PHASE15_EVIDENCE_CASE_IDS]),
  referenceViewport: REFERENCE_VIEWPORT,
  appearances: REQUIRED_APPEARANCES,
  viewports: REQUIRED_VIEWPORTS,
  fontScales: freeze([1, 2]),
  input: REQUIRED_INPUT,
  motion: freeze(["standard", "reduced-motion"]),
  minTargetDp: 48,
  capture: freeze({ semanticTree: "pre-and-post-each-action", focusTrace: "keyboard-dpad-observed", targetBounds: "minimum-48dp", visualComparison: "reference-native-overlay-difference-sha256", privacy: "synthetic-facts-only-recursive-verifier" }),
  restoreAfterEachCase: freeze(["fontScale", "appearance", "orientation", "notificationState", "fixtureDatabase"]),
  visualDerivation: "reference-native-overlay-difference-sha256",
  representativeCellCount: 56,
  cells: freeze([...BASE_CELLS, ...METRIC_VARIANTS, ...VISUAL_VARIANTS]),
});

export function derivePhase15VisualHashChain({ referenceId, nativeScreenshotBytes, overlayBytes, differenceBytes }) {
  const referenceSha256 = PHASE15_VISUAL_REFERENCES[referenceId];
  if (!referenceSha256 || !Buffer.isBuffer(nativeScreenshotBytes) || !Buffer.isBuffer(overlayBytes) || !Buffer.isBuffer(differenceBytes)) throw new Error("phase15_visual_derivation_input_invalid");
  const nativeScreenshotSha256 = sha256(nativeScreenshotBytes);
  const inputs = freeze({ reference_sha256: referenceSha256, native_screenshot_sha256: nativeScreenshotSha256 });
  return freeze({ reference_id: referenceId, reference_sha256: referenceSha256, native_screenshot_sha256: nativeScreenshotSha256, overlay: freeze({ sha256: sha256(overlayBytes), inputs }), difference: freeze({ sha256: sha256(differenceBytes), inputs }) });
}

export function validatePhase15NativeMatrix(matrix) {
  if (matrix?.schemaVersion !== 2 || matrix.suite !== "phase15" || matrix.package !== PACKAGE || matrix.profile !== "development-test" || matrix.sqliteContract !== "expo-sqlite-authoritative" || matrix.sourceOfTruth !== "phase15-workout-ledger" || matrix.minTargetDp !== 48 || matrix.visualDerivation !== "reference-native-overlay-difference-sha256" || matrix.representativeCellCount !== 56 || matrix.cells?.length !== 56) throw new Error("phase15_native_matrix_identity_invalid");
  if (JSON.stringify(matrix.requiredCaseIds) !== JSON.stringify(PHASE15_EVIDENCE_CASE_IDS) || matrix.viewports?.length !== 7 || matrix.appearances?.length !== 4 || JSON.stringify(matrix.fontScales) !== "[1,2]" || JSON.stringify(matrix.input) !== JSON.stringify(REQUIRED_INPUT) || JSON.stringify(matrix.restoreAfterEachCase) !== JSON.stringify(["fontScale", "appearance", "orientation", "notificationState", "fixtureDatabase"])) throw new Error("phase15_native_matrix_coverage_invalid");
  const ids = new Set();
  for (const cell of matrix.cells) {
    if (ids.has(cell.id) || !matrix.requiredCaseIds.includes(cell.caseId) || !cell.productionRouteOnly || !Array.isArray(cell.actions) || !cell.behavior || typeof cell.behavior.actionBearing !== "boolean" || !REQUIRED_APPEARANCES.some(({ id }) => id === cell.appearance) || !REQUIRED_VIEWPORTS.some(({ width, height }) => width === cell.viewport?.width && height === cell.viewport?.height) || ![1, 2].includes(cell.fontScale)) throw new Error("phase15_native_matrix_cell_invalid");
    ids.add(cell.id);
  }
  for (const caseId of matrix.requiredCaseIds) if (matrix.cells.filter((cell) => cell.caseId === caseId && cell.behavior.actionBearing).length !== 1) throw new Error("phase15_native_matrix_representative_invalid");
  const profiles = matrix.cells.filter(({ caseId }) => caseId === "workout.all-metrics").map(({ editorProfile }) => editorProfile).filter(Boolean).sort();
  if (JSON.stringify(profiles) !== JSON.stringify([...EDITOR_PROFILES].sort()) || matrix.cells.filter(({ visual }) => visual?.referenceIds?.length === 1).length !== 6 || !matrix.cells.some(({ reducedMotion }) => reducedMotion) || !matrix.cells.some(({ lifecycle }) => lifecycle === "process-death-offline-restart")) throw new Error("phase15_native_matrix_variant_invalid");
  return true;
}

export function phase15NativeMatrixPlan(matrix = PHASE15_NATIVE_MATRIX) {
  validatePhase15NativeMatrix(matrix);
  return matrix.cells.map((cell) => freeze({ ...cell, flowPath: `maestro/phase15/${cell.flow}.yaml`, capture: matrix.capture, restoreAfterEachCase: matrix.restoreAfterEachCase }));
}

if (process.argv[1]?.endsWith("phase15-native-matrix.mjs")) {
  try { process.stdout.write(`${JSON.stringify({ ok: true, plan: phase15NativeMatrixPlan() }, null, 2)}\n`); } catch (error) { process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`); process.exitCode = 1; }
}

import { createHash } from "node:crypto";

import {
  PHASE15_ROOT_TO_COMPLETION_CASE,
  PHASE15_VISUAL_REFERENCES,
} from "../src/testing/contracts/phase15Workout.contract.ts";

const PACKAGE = "com.fchoo.gymtracker.devtest";
const REFERENCE_VIEWPORT = Object.freeze({ width: 390, height: 844 });
const TRACER_ACTIONS = Object.freeze([
  "preview", "start", "save", "complete", "rest", "finish", "completion", "keep-plan-as-is",
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export const PHASE15_NATIVE_MATRIX = Object.freeze({
  schemaVersion: 1,
  suite: "phase15",
  package: PACKAGE,
  profile: "development-test",
  sqliteContract: "expo-sqlite-authoritative",
  sourceOfTruth: "phase15-workout-ledger",
  referenceViewport: REFERENCE_VIEWPORT,
  visualDerivation: "reference-native-overlay-difference-sha256",
  cells: Object.freeze([Object.freeze({
    id: "workout.root-identity-light-390x844-portrait-font-1",
    caseId: PHASE15_ROOT_TO_COMPLETION_CASE,
    flow: "workout-root",
    stage: PHASE15_ROOT_TO_COMPLETION_CASE,
    appearance: "light",
    renderedTheme: "light",
    viewport: REFERENCE_VIEWPORT,
    orientation: "portrait",
    fontScale: 1,
    actions: TRACER_ACTIONS,
    productionRouteOnly: true,
    visual: Object.freeze({
      referenceViewport: "390x844",
      hashChain: "reference-native-overlay-difference-sha256",
      referenceIds: Object.freeze(["light-workout-root", "light-active-overview", "light-committed-rest"]),
    }),
  })]),
});

export function derivePhase15VisualHashChain({ referenceId, nativeScreenshotBytes, overlayBytes, differenceBytes }) {
  const referenceSha256 = PHASE15_VISUAL_REFERENCES[referenceId];
  if (!referenceSha256 || !Buffer.isBuffer(nativeScreenshotBytes) || !Buffer.isBuffer(overlayBytes) || !Buffer.isBuffer(differenceBytes)) {
    throw new Error("phase15_visual_derivation_input_invalid");
  }
  const nativeScreenshotSha256 = sha256(nativeScreenshotBytes);
  const inputs = Object.freeze({ reference_sha256: referenceSha256, native_screenshot_sha256: nativeScreenshotSha256 });
  return Object.freeze({
    reference_id: referenceId,
    reference_sha256: referenceSha256,
    native_screenshot_sha256: nativeScreenshotSha256,
    overlay: Object.freeze({ sha256: sha256(overlayBytes), inputs }),
    difference: Object.freeze({ sha256: sha256(differenceBytes), inputs }),
  });
}

export function validatePhase15NativeMatrix(matrix) {
  if (
    matrix?.schemaVersion !== 1
    || matrix.suite !== "phase15"
    || matrix.package !== PACKAGE
    || matrix.profile !== "development-test"
    || matrix.sqliteContract !== "expo-sqlite-authoritative"
    || matrix.sourceOfTruth !== "phase15-workout-ledger"
    || matrix.visualDerivation !== "reference-native-overlay-difference-sha256"
    || matrix.referenceViewport?.width !== 390
    || matrix.referenceViewport?.height !== 844
    || !Array.isArray(matrix.cells)
    || matrix.cells.length !== 1
  ) throw new Error("phase15_native_matrix_identity_invalid");
  const [cell] = matrix.cells;
  if (
    cell.caseId !== PHASE15_ROOT_TO_COMPLETION_CASE
    || cell.flow !== "workout-root"
    || cell.stage !== PHASE15_ROOT_TO_COMPLETION_CASE
    || cell.appearance !== "light"
    || cell.renderedTheme !== "light"
    || cell.orientation !== "portrait"
    || cell.fontScale !== 1
    || cell.productionRouteOnly !== true
    || JSON.stringify(cell.actions) !== JSON.stringify(TRACER_ACTIONS)
    || cell.visual?.referenceViewport !== "390x844"
    || cell.visual?.hashChain !== "reference-native-overlay-difference-sha256"
  ) throw new Error("phase15_native_matrix_tracer_invalid");
  return true;
}

export function phase15NativeMatrixPlan(matrix = PHASE15_NATIVE_MATRIX) {
  validatePhase15NativeMatrix(matrix);
  return matrix.cells.map((cell) => Object.freeze({
    ...cell,
    flowPath: `maestro/phase15/${cell.flow}.yaml`,
  }));
}

if (process.argv[1]?.endsWith("phase15-native-matrix.mjs")) {
  try {
    process.stdout.write(`${JSON.stringify({ ok: true, plan: phase15NativeMatrixPlan() }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}

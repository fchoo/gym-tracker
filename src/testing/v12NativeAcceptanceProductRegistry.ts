import {
  V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS,
  type V12NativeAcceptanceShard,
} from "./contracts/phase15Workout.contract.ts";

export type V12NativeAcceptanceProductDefinition = Readonly<{
  shard: V12NativeAcceptanceShard;
  caseId: string;
  operationId: string;
  phaseFlowSource: string;
  visualStateId: string;
  routeSource: string;
  controlSource: string;
  readySource: string;
  resultSource: string;
  readyId: string;
  actionId: string;
  resultId: string;
  normalCallbackToken: string;
  productPath(nonce: string): string;
  routeParams: Readonly<Record<string, string>>;
}>;

const selectorPart = (value: string): string => value.toLowerCase()
  .replace(/[^a-z0-9]+/gu, "-")
  .replace(/^-+|-+$/gu, "");

const profiles = Object.freeze({
  "multi-plan": Object.freeze({
    routeSource: "app/calendar/plan/[occurrenceId].tsx",
    controlSource: "src/ui/screens/PlannedWorkoutDetailScreen.tsx",
    readySource: "src/ui/layout/AdaptiveScreen.tsx",
    resultSource: "src/ui/screens/PlannedWorkoutDetailScreen.tsx",
    readyId: "adaptive-screen",
    resultId: "planned-workout-expanded-result",
    normalCallbackToken: "setExpandedExerciseIds",
    productPath: (nonce: string) => `/calendar/plan/${encodeURIComponent(`v12:collision:${nonce}:strength-opportunity`)}`,
    routeParams: Object.freeze({ origin: "calendar" }),
  }),
  workout: Object.freeze({
    routeSource: "app/(tabs)/index.tsx",
    controlSource: "src/ui/screens/TodayScreen.tsx",
    readySource: "src/ui/layout/AdaptiveScreen.tsx",
    resultSource: "src/ui/shell/AppRootShell.tsx",
    readyId: "adaptive-screen",
    resultId: "app-settings-sheet",
    normalCallbackToken: "onOpenSettings",
    productPath: () => "/index",
    routeParams: Object.freeze({}),
  }),
  "library-running": Object.freeze({
    routeSource: "app/(tabs)/library.tsx",
    controlSource: "src/ui/screens/LibraryScreen.tsx",
    readySource: "src/ui/screens/LibraryScreen.tsx",
    resultSource: "src/bootstrap/libraryRuntimeReadPort.ts",
    readyId: "library-screen",
    resultId: "library-actions-sheet-frame",
    normalCallbackToken: "setActionsVisible(true)",
    productPath: () => "/library",
    routeParams: Object.freeze({}),
  }),
} satisfies Readonly<Record<V12NativeAcceptanceShard, Readonly<{
  routeSource: string;
  controlSource: string;
  readySource: string;
  resultSource: string;
  readyId: string;
  resultId: string;
  normalCallbackToken: string;
  productPath(nonce: string): string;
  routeParams: Readonly<Record<string, string>>;
}>>>);

const workoutRootCases = new Set([
  "workout.root-identity", "workout.day-switch", "workout.scheduled-rest-empty",
  "workout.start-alternate", "workout.start-resume", "workout.context-running", "workout.appearance",
]);
const workoutRecoveryCases = new Set([
  "workout.outcomes", "workout.completion-review", "workout.completion-writeback", "workout.offline-recovery",
]);
const phase17MatrixOnlyCases = new Set([
  "library.custom-exercise-edit", "library.custom-exercise-hide", "library.custom-exercise-unhide",
  "library.custom-exercise-copy-bundled", "library.custom-exercise-archive",
  "library.custom-exercise-reactivate", "library.metric-profile-migration",
]);

function approvedFlowSource(shard: V12NativeAcceptanceShard, caseId: string): string {
  if (shard === "multi-plan") return "src/testing/contracts/multiPlanRunning.contract.ts";
  if (shard === "workout") {
    if (workoutRootCases.has(caseId)) return "maestro/phase15/workout-root.yaml";
    if (workoutRecoveryCases.has(caseId)) return "maestro/phase15/recovery-completion.yaml";
    return "maestro/phase15/active-workout.yaml";
  }
  if (caseId === "library.accessibility-recovery") return "maestro/phase17/accessibility.yaml";
  if (caseId.startsWith("library.running-")) return "maestro/phase17/running-authoring.yaml";
  if (phase17MatrixOnlyCases.has(caseId)) return "src/testing/contracts/phase17LibraryRunning.contract.ts";
  return "maestro/phase17/library.yaml";
}

function approvedVisualStateId(shard: V12NativeAcceptanceShard, caseId: string): string {
  if (shard === "multi-plan") return "BW-027";
  if (shard === "workout") return "BW-002";
  return "BW-034";
}

const entries = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.map((contract) => {
  const profile = profiles[contract.shard];
  const actionId = `v12-product-action-${selectorPart(contract.shard)}-${selectorPart(contract.caseId)}`;
  if (actionId.length > 160) throw new Error("v12_product_registry_selector_invalid");
  return Object.freeze({
    shard: contract.shard,
    caseId: contract.caseId,
    operationId: contract.operation.id,
    phaseFlowSource: approvedFlowSource(contract.shard, contract.caseId),
    visualStateId: approvedVisualStateId(contract.shard, contract.caseId),
    ...profile,
    actionId,
  });
});

const byKey = new Map(entries.map((entry) => [`${entry.shard}:${entry.caseId}`, entry]));
if (entries.length !== 101 || byKey.size !== 101
  || new Set(entries.map(({ actionId }) => actionId)).size !== 101) {
  throw new Error("v12_product_registry_coverage_invalid");
}

export const V12_NATIVE_ACCEPTANCE_PRODUCT_REGISTRY: readonly V12NativeAcceptanceProductDefinition[] =
  Object.freeze(entries);

export function v12NativeAcceptanceProductDefinition(
  shard: V12NativeAcceptanceShard,
  caseId: string,
): V12NativeAcceptanceProductDefinition {
  const definition = byKey.get(`${shard}:${caseId}`);
  if (definition === undefined) throw new Error("v12_product_registry_case_missing");
  return definition;
}

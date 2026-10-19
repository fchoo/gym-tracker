import {
  PHASE17_CASE_ACTION_CONTRACTS,
  PHASE17_FAMILY_A_CUSTOM_METRIC_MATRIX_CONTRACTS,
} from "./phase17LibraryRunning.contract.ts";

/**
 * Source-owned evidence ledger for the Phase 15 Workout acceptance gate.
 * It intentionally lists evidence paths rather than runtime data: evidence is
 * recorded only by the native runner after it has exercised the SQLite-backed app.
 */
const requirementCases = [
  ["workout.root-identity", "WRK-01"], ["workout.day-switch", "WRK-02"],
  ["workout.scheduled-rest-empty", "WRK-03"], ["workout.start-alternate", "WRK-04"],
  ["workout.start-resume", "WRK-05"], ["workout.context-running", "WRK-06"],
  ["workout.active-layout", "WRK-07"], ["workout.active-back", "WRK-08"],
  ["workout.exercise-disclosure", "WRK-09"], ["workout.active-indicator", "WRK-10"],
  ["workout.set-states", "WRK-11"], ["workout.row-edit", "WRK-12"],
  ["workout.load-reps-editor", "WRK-13"], ["workout.duration-editor", "WRK-14"],
  ["workout.all-metrics", "WRK-15"], ["workout.warmup-order", "WRK-16"],
  ["workout.add-set", "WRK-17"], ["workout.complete-commit", "WRK-18"],
  ["workout.complete-failure", "WRK-19"], ["workout.completion-collapse", "WRK-20"],
  ["workout.rest-dock", "WRK-21"], ["workout.rest-controls", "WRK-22"],
  ["workout.rest-recovery", "WRK-23"], ["workout.trend", "WRK-24"],
  ["workout.exercise-menu", "WRK-25"], ["workout.timing-flat", "WRK-26"],
  ["workout.plan-increment", "WRK-27"], ["workout.plan-after-workout", "WRK-28"],
  ["workout.add-exercise", "WRK-29"], ["workout.replace-exercise", "WRK-30"],
  ["workout.delete-exercise", "WRK-31"], ["workout.reorder", "WRK-32"],
  ["workout.undo", "WRK-33"], ["workout.outcomes", "WRK-34"],
  ["workout.completion-review", "WRK-35"], ["workout.completion-writeback", "WRK-36"],
];

const crossCuttingCases = [
  ["workout.readonly-presentation", "cross-cutting"],
  ["workout.timing-policy", "TIM-01"],
  ["workout.accessibility", "cross-cutting"],
  ["workout.appearance", "cross-cutting"],
  ["workout.offline-recovery", "cross-cutting"],
  ["workout.performance", "cross-cutting"],
];

export const PHASE15_REQUIRED_CASES = Object.freeze(
  [...requirementCases, ...crossCuttingCases].map(([id, requirement]) => Object.freeze({
    id,
    requirement,
    evidence_path: `artifacts/native/phase15/evidence/${id}.json`,
  })),
);

export const PHASE15_EVIDENCE_CASE_IDS = Object.freeze(PHASE15_REQUIRED_CASES.map(({ id }) => id));

export const PHASE15_ROOT_TO_COMPLETION_CASE = "workout.root-identity";

export const PHASE15_VISUAL_REFERENCES = Object.freeze({
  "light-workout-root": "513173987c6b29d370f5428e3226608a795d48cdf5a9c258a8624dd2bed0ad2d",
  "dark-workout-root": "ffd8cf979d3ba679cc744e58a91d30d7bd34cda055fc0bff5ae8c09d886de301",
  "light-active-overview": "0c40bbb3555550653d89ee517df29c882269cf92d58b95487512e9e6dfde5b18",
  "dark-active-overview": "aa2b56418d8cc13446fdfc0bef8ce6c1c8d7fff5bbad3ff9530c709fe4d9b61f",
  "light-committed-rest": "09aa4b4bda47451d35be6316b769a03fd70b5736ec4c7842ad1399015f47253b",
  "dark-committed-rest": "5d7a7035df19c63feedc0b400453c57c79b9ec3a1f8e51727807b867924bd0d7",
});

export const PHASE15_PINNED_VISUAL_SOURCES = Object.freeze({
  approved_json: "b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf",
  approved_hybrid_html: "b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96",
  source_manifest: "90de9f6040f36dc029b97ad3687d0e3569fd9bc33ad3eaab2cafc649ae1196a4",
});

const MULTI_PLAN_RUNNING_CASE_IDS = Object.freeze([
  "phase13-migration-failure-cuts", "phase13-map01-activation", "phase13-running-two-slots",
  "phase13-strength-completion-retry", "phase13-import-normalized-identity", "phase13-import-remove-restore",
  "phase13-match-invalidation", "phase13-stale-replay-no-resurrection", "phase13-bodyweight-correction-delete",
  "phase13-backup-clean-restore", "phase13-merge-rebuild", "phase13-source-generation-neutrality",
  "phase13-tim01-retirement",
] as const);

export type V12NativeAcceptanceShard = "multi-plan" | "workout" | "library-running";
export type V12NativeAcceptanceOperationKind = "repository-read" | "repository-mutation";

export type V12NativeAcceptanceCaseContract = Readonly<{
  shard: V12NativeAcceptanceShard;
  caseId: string;
  requirement: string;
  actionId: string;
  sourceProbe: string;
  operation: Readonly<{
    id: string;
    kind: V12NativeAcceptanceOperationKind;
    expectedResult: "read" | "committed";
  }>;
  probes: Readonly<{
    pre: Readonly<{ id: string; tables: readonly string[] }>;
    action: Readonly<{ id: string; tables: readonly string[] }>;
    post: Readonly<{ id: string; tables: readonly string[] }>;
  }>;
  uiReadback: Readonly<{ id: string; label: string }>;
}>;

const tables = (...values: string[]): readonly string[] => Object.freeze(values);

const MULTI_PLAN_TABLES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "phase13-migration-failure-cuts": tables("portability_restore_state"),
  "phase13-map01-activation": tables("plans", "owned_plan_schedules", "owned_plan_mutation_requests"),
  "phase13-running-two-slots": tables("running_plans", "running_session_slots", "running_session_slot_revisions"),
  "phase13-strength-completion-retry": tables("workout_sessions", "session_sets", "workout_receipts"),
  "phase13-import-normalized-identity": tables("imported_activities", "imported_activity_identities", "imported_activity_receipts"),
  "phase13-import-remove-restore": tables("imported_activities", "imported_activity_removal_events", "imported_activity_receipts"),
  "phase13-match-invalidation": tables("running_activity_current_matches", "running_activity_match_events", "running_activity_match_receipts"),
  "phase13-stale-replay-no-resurrection": tables("imported_activities", "imported_activity_removal_events", "imported_activity_receipts"),
  "phase13-bodyweight-correction-delete": tables("bodyweight_entries", "bodyweight_entry_events", "bodyweight_command_receipts"),
  "phase13-backup-clean-restore": tables("portability_restore_state", "portable_owner_identity"),
  "phase13-merge-rebuild": tables("portability_restore_state", "history_projection_freshness"),
  "phase13-source-generation-neutrality": tables("automatic_backup_state", "imported_activity_receipts"),
  "phase13-tim01-retirement": tables("session_sets", "session_advanced_timing_states"),
});

const WORKOUT_TABLES = Object.freeze({
  root: tables("plans", "owned_plan_schedules", "workout_sessions"),
  active: tables("workout_sessions", "session_exercises", "session_sets"),
  set: tables("session_sets", "workout_receipts"),
  rest: tables("session_rest_states", "pending_effects"),
  history: tables("history_subject_revisions", "history_projection_metric_aggregates"),
  plan: tables("plans", "owned_plan_aggregate_states", "progression_recommendations"),
  edit: tables("session_exercises", "session_sets", "workout_session_exercise_edit_receipts"),
  completion: tables("workout_sessions", "workout_receipts", "workout_provenance"),
  settings: tables("app_settings", "session_advanced_timing_states"),
});

const WORKOUT_MUTATIONS = new Set([
  "workout.start-alternate", "workout.start-resume", "workout.row-edit", "workout.load-reps-editor",
  "workout.duration-editor", "workout.all-metrics", "workout.add-set", "workout.complete-commit",
  "workout.complete-failure", "workout.rest-controls", "workout.rest-recovery", "workout.plan-increment",
  "workout.plan-after-workout", "workout.add-exercise", "workout.replace-exercise", "workout.delete-exercise",
  "workout.reorder", "workout.undo", "workout.outcomes", "workout.completion-writeback",
  "workout.offline-recovery", "workout.timing-policy", "workout.appearance",
]);

function workoutTables(caseId: string): readonly string[] {
  if (["workout.root-identity", "workout.day-switch", "workout.scheduled-rest-empty", "workout.start-alternate", "workout.start-resume", "workout.context-running"].includes(caseId)) return WORKOUT_TABLES.root;
  if (["workout.rest-dock", "workout.rest-controls", "workout.rest-recovery"].includes(caseId)) return WORKOUT_TABLES.rest;
  if (caseId === "workout.trend") return WORKOUT_TABLES.history;
  if (["workout.plan-increment", "workout.plan-after-workout"].includes(caseId)) return WORKOUT_TABLES.plan;
  if (["workout.add-exercise", "workout.replace-exercise", "workout.delete-exercise", "workout.reorder", "workout.undo"].includes(caseId)) return WORKOUT_TABLES.edit;
  if (["workout.outcomes", "workout.completion-review", "workout.completion-writeback", "workout.offline-recovery"].includes(caseId)) return WORKOUT_TABLES.completion;
  if (["workout.timing-policy", "workout.appearance", "workout.accessibility", "workout.performance", "workout.readonly-presentation"].includes(caseId)) return WORKOUT_TABLES.settings;
  if (["workout.set-states", "workout.row-edit", "workout.load-reps-editor", "workout.duration-editor", "workout.all-metrics", "workout.warmup-order", "workout.add-set", "workout.complete-commit", "workout.complete-failure", "workout.completion-collapse"].includes(caseId)) return WORKOUT_TABLES.set;
  return WORKOUT_TABLES.active;
}

const LIBRARY_PROBE_TABLES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  accessibility_runtime_profile: tables("app_settings"),
  custom_exercise_metric_migrations: tables("metric_profile_migration_events"),
  metric_profile_migration_events: tables("metric_profile_migration_events"),
  custom_exercises: tables("exercises", "exercise_owner_preferences"),
  exercise_instruction_sets: tables("exercise_library_entries"),
  exercise_preferences: tables("exercise_owner_preferences"),
  exercise_search_index: tables("exercise_search_terms"),
  library_action_state: tables("app_settings"),
  library_view_state: tables("app_settings"),
  owned_plan_lifecycle_receipts: tables("owned_plan_mutation_requests", "plans"),
  owned_plan_revisions: tables("owned_plan_mutation_requests", "plans"),
  owned_plans: tables("plans"),
  plan_create_intent: tables("plans"),
  plan_day_revisions: tables("plan_days", "owned_plan_mutation_requests"),
  plan_exercise_replacements: tables("owned_plan_day_exercises", "owned_plan_mutation_requests"),
  plan_schedule_slots: tables("owned_plan_schedules", "owned_plan_schedule_versions"),
  running_plan_aggregates: tables("running_plans", "running_plan_receipts"),
  running_plan_revisions: tables("running_plans", "running_plan_events", "running_plan_receipts"),
  running_plans: tables("running_plans"),
  running_session_revisions: tables("running_session_revisions", "running_plan_receipts"),
  running_session_slots: tables("running_session_slots", "running_session_slot_revisions", "running_plan_receipts"),
  schedule_collision_projections: tables("schedule_collision_projections", "schedule_collision_receipts"),
  starter_plan_activations: tables("starter_plan_activation_requests", "owned_plan_schedules"),
});

function nativeAcceptanceContract(input: Readonly<{
  shard: V12NativeAcceptanceShard;
  caseId: string;
  requirement: string;
  actionId: string;
  sourceProbe: string;
  uiReadback: string;
  authorityTables: readonly string[];
  mutation: boolean;
}>): V12NativeAcceptanceCaseContract {
  const operationId = `${input.shard}:${input.caseId}:${input.actionId}`;
  const probe = (phase: "pre" | "action" | "post") => Object.freeze({
    id: `${input.caseId}:${phase}:${input.sourceProbe}`,
    tables: Object.freeze([...input.authorityTables]),
  });
  return Object.freeze({
    shard: input.shard,
    caseId: input.caseId,
    requirement: input.requirement,
    actionId: input.actionId,
    sourceProbe: input.sourceProbe,
    operation: Object.freeze({
      id: operationId,
      kind: input.mutation ? "repository-mutation" : "repository-read",
      expectedResult: input.mutation ? "committed" : "read",
    }),
    probes: Object.freeze({ pre: probe("pre"), action: probe("action"), post: probe("post") }),
    uiReadback: Object.freeze({ id: `${input.caseId}:ui:${input.uiReadback}`, label: input.uiReadback }),
  });
}

const multiPlanContracts = MULTI_PLAN_RUNNING_CASE_IDS.map((caseId) => nativeAcceptanceContract({
  shard: "multi-plan",
  caseId,
  requirement: "Phase 13 source-owned contract",
  actionId: caseId.slice("phase13-".length),
  sourceProbe: `multi-plan-running:${caseId}`,
  uiReadback: "SQLite-backed contract observation",
  authorityTables: MULTI_PLAN_TABLES[caseId] ?? [],
  mutation: true,
}));

const workoutContracts = PHASE15_REQUIRED_CASES.map(({ id: caseId, requirement }) => {
  if (caseId === undefined || requirement === undefined) throw new Error("v12_native_acceptance_contract_missing");
  return nativeAcceptanceContract({
    shard: "workout",
    caseId,
    requirement,
    actionId: caseId.slice("workout.".length),
    sourceProbe: `phase15-workout-ledger:${caseId}`,
    uiReadback: "Workout source contract observation",
    authorityTables: workoutTables(caseId),
    mutation: WORKOUT_MUTATIONS.has(caseId),
  });
});

const librarySource = [
  ...PHASE17_CASE_ACTION_CONTRACTS,
  ...PHASE17_FAMILY_A_CUSTOM_METRIC_MATRIX_CONTRACTS.filter(({ id }) => (
    !PHASE17_CASE_ACTION_CONTRACTS.some((entry) => entry.id === id)
  )),
];
const libraryContracts = librarySource.map((entry) => nativeAcceptanceContract({
  shard: "library-running",
  caseId: entry.id,
  requirement: entry.sourceProbe,
  actionId: entry.action,
  sourceProbe: entry.sourceProbe,
  uiReadback: entry.uiReadback,
  authorityTables: LIBRARY_PROBE_TABLES[entry.sourceProbe] ?? [],
  mutation: entry.proofMode === "mutating",
}));

export const V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS = Object.freeze([
  ...multiPlanContracts,
  ...workoutContracts,
  ...libraryContracts,
]);

const V12_NATIVE_ACCEPTANCE_CONTRACTS_BY_KEY = new Map(V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS
  .map((entry) => [`${entry.shard}:${entry.caseId}`, entry]));

export function v12NativeAcceptanceCaseContract(
  shard: V12NativeAcceptanceShard,
  caseId: string,
): V12NativeAcceptanceCaseContract {
  const value = V12_NATIVE_ACCEPTANCE_CONTRACTS_BY_KEY.get(`${shard}:${caseId}`);
  if (value === undefined || value.probes.pre.tables.length === 0) {
    throw new Error("v12_native_acceptance_contract_missing");
  }
  return value;
}

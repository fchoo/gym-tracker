import { PHASE15_REQUIRED_CASES } from "./phase15Workout.contract.ts";
import {
  PHASE17_CASE_ACTION_CONTRACTS,
  PHASE17_FAMILY_A_CUSTOM_METRIC_MATRIX_CONTRACTS,
} from "./phase17LibraryRunning.contract.ts";

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

function contract(input: Readonly<{
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

const multiPlanContracts = MULTI_PLAN_RUNNING_CASE_IDS.map((caseId) => contract({
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
  return contract({
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
const libraryContracts = librarySource.map((entry) => contract({
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

const CONTRACTS_BY_KEY = new Map(V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.map((entry) => [`${entry.shard}:${entry.caseId}`, entry]));

export function v12NativeAcceptanceCaseContract(
  shard: V12NativeAcceptanceShard,
  caseId: string,
): V12NativeAcceptanceCaseContract {
  const value = CONTRACTS_BY_KEY.get(`${shard}:${caseId}`);
  if (value === undefined || value.probes.pre.tables.length === 0) {
    throw new Error("v12_native_acceptance_contract_missing");
  }
  return value;
}

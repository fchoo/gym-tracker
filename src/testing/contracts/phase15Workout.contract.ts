import {
  PHASE17_CASE_ACTION_CONTRACTS,
  PHASE17_FAMILY_A_CUSTOM_METRIC_MATRIX_CONTRACTS,
  PHASE17_FAMILY_A_CUSTOM_METRIC_MATRIX_RECEIPTS,
  PHASE17_FAMILY_A_MUTATION_RECEIPTS,
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
    /** Exact source-owned repository/domain operation executed by the case. */
    handlerId: string;
    /** Case-owned parameters; this may not be only a generic table name. */
    parameterContract: string;
    postcondition: Readonly<{
      id: string;
      description: string;
    }>;
    receipt: Readonly<{
      table: string;
      identityColumns: readonly string[];
      effectColumns: readonly string[];
      expectedValues: Readonly<Record<string, string>>;
    }> | null;
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
  "workout.start-alternate", "workout.row-edit", "workout.load-reps-editor",
  "workout.duration-editor", "workout.all-metrics", "workout.add-set", "workout.complete-commit",
  "workout.rest-controls", "workout.rest-recovery", "workout.plan-increment",
  "workout.add-exercise", "workout.replace-exercise", "workout.delete-exercise",
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
  custom_exercise_metric_migrations: tables("metric_profile_migration_events", "exercises"),
  metric_profile_migration_events: tables("metric_profile_migration_events", "exercises"),
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
  running_plan_aggregates: tables("plans", "running_plans", "running_plan_receipts"),
  running_plan_revisions: tables("plans", "running_plans", "running_plan_events", "running_plan_receipts"),
  running_plans: tables("plans", "running_plans"),
  running_session_revisions: tables("plans", "running_session_revisions", "running_plan_receipts"),
  running_session_slots: tables("plans", "running_session_slots", "running_session_slot_revisions", "running_plan_receipts"),
  schedule_collision_projections: tables("plans", "schedule_collision_projections", "schedule_collision_receipts"),
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
  handlerId: string;
  receipt?: Readonly<{
    table: string;
    identityColumns: readonly string[];
    effectColumns: readonly string[];
    expectedValues?: Readonly<Record<string, string>>;
  }>;
}>): V12NativeAcceptanceCaseContract {
  const operationId = `${input.shard}:${input.caseId}:${input.actionId}`;
  const authorityTables = input.receipt === undefined || input.authorityTables.includes(input.receipt.table)
    ? input.authorityTables
    : tables(...input.authorityTables, input.receipt.table);
  const probe = (phase: "pre" | "action" | "post") => Object.freeze({
    id: `${input.caseId}:${phase}:${input.sourceProbe}`,
    tables: Object.freeze([...authorityTables]),
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
      handlerId: input.handlerId,
      parameterContract: `${input.caseId}:${input.actionId}:${input.sourceProbe}`,
      postcondition: Object.freeze({
        id: `${input.caseId}:postcondition:${input.uiReadback}`,
        description: `${input.handlerId} must produce ${input.uiReadback} from ${input.sourceProbe}`,
      }),
      receipt: input.receipt === undefined ? null : Object.freeze({
        ...input.receipt,
        identityColumns: Object.freeze([...input.receipt.identityColumns]),
        effectColumns: Object.freeze([...input.receipt.effectColumns]),
        expectedValues: Object.freeze({ ...input.receipt.expectedValues }),
      }),
    }),
    probes: Object.freeze({ pre: probe("pre"), action: probe("action"), post: probe("post") }),
    uiReadback: Object.freeze({ id: `${input.caseId}:ui:${input.uiReadback}`, label: input.uiReadback }),
  });
}

const WORKOUT_OPERATION_HANDLERS: Readonly<Record<string, string>> = Object.freeze({
  "workout.root-identity": "workout.plans-workout-repository.get-today-view",
  "workout.day-switch": "workout.plans-workout-repository.get-plan-days",
  "workout.scheduled-rest-empty": "workout.plans-workout-repository.get-today-view",
  "workout.start-alternate": "workout.plans-workout-repository.start-workout",
  "workout.start-resume": "active-workout.workout-repository.get-workout-session",
  "workout.context-running": "running-plan.running-plan-repository.read-aggregate",
  "workout.active-layout": "active-workout.workout-repository.get-workout-session",
  "workout.active-back": "active-workout.workout-repository.get-workout-session",
  "workout.exercise-disclosure": "active-workout.workout-repository.get-active-workout",
  "workout.active-indicator": "active-workout.workout-repository.get-active-workout",
  "workout.set-states": "active-workout.workout-repository.get-active-workout",
  "workout.row-edit": "active-workout.workout-repository.update-active-set-draft",
  "workout.load-reps-editor": "active-workout.workout-repository.update-active-set-draft",
  "workout.duration-editor": "active-workout.workout-repository.update-active-set-draft",
  "workout.all-metrics": "active-workout.workout-repository.update-active-set-draft",
  "workout.warmup-order": "active-workout.workout-repository.get-active-workout",
  "workout.add-set": "active-workout.workout-repository.add-working-set",
  "workout.complete-commit": "active-workout.workout-repository.complete-set",
  "workout.complete-failure": "active-workout.workout-repository.complete-set-conflict",
  "workout.completion-collapse": "active-workout.workout-repository.get-active-workout",
  "workout.rest-dock": "rest.rest-repository.get-rest-context",
  "workout.rest-controls": "rest.rest-repository.adjust-rest",
  "workout.rest-recovery": "rest.rest-repository.resume-rest",
  "workout.trend": "history.history-repository.load-exercise-metric-history",
  "workout.exercise-menu": "active-workout.workout-repository.get-active-workout",
  "workout.timing-flat": "active-workout.workout-repository.get-active-workout",
  "workout.plan-increment": "workout.workout-outcome-repository.accept-recommendation",
  "workout.plan-after-workout": "owned-plan.owned-plan-repository.read",
  "workout.add-exercise": "active-workout.workout-repository.add-exercise",
  "workout.replace-exercise": "active-workout.workout-repository.replace-exercise",
  "workout.delete-exercise": "active-workout.workout-repository.remove-exercise",
  "workout.reorder": "active-workout.workout-repository.reorder-exercises",
  "workout.undo": "active-workout.workout-repository.undo-completed-set",
  "workout.outcomes": "workout.workout-outcome-repository.finish-partial",
  "workout.completion-review": "workout.workout-outcome-repository.get-session-detail",
  "workout.completion-writeback": "owned-plan.owned-plan-repository.apply-session-exercise-edits-to-plan",
  "workout.readonly-presentation": "workout.workout-presentation.project-workout",
  "workout.timing-policy": "workout.workout-preference-repository.write",
  "workout.accessibility": "workout.workout-presentation.project-accessibility",
  "workout.appearance": "workout.workout-preference-repository.write",
  "workout.offline-recovery": "backup.logical-backup-repository.collect",
  "workout.performance": "workout.workout-presentation.project-workout",
});

const LIBRARY_OPERATION_HANDLERS: Readonly<Record<string, string>> = Object.freeze({
  "library.remembered-state": "library.app-settings-repository.read-library-view-state",
  "library.plan-groups": "owned-plan.owned-plan-repository.read",
  "library.exercise-search": "library.library-search-repository.search-exercises",
  "library.exercise-favorites": "custom-exercise.custom-exercise-repository.set-exercise-favorite",
  "library.actions-sheet": "library.app-settings-repository.read-library-action-state",
  "library.neutral-plan-chooser": "owned-plan.plan-create-intent.read",
  "library.true-no-plans": "owned-plan.owned-plan-repository.create-draft",
  "library.owned-summary": "owned-plan.owned-plan-repository.read",
  "library.owned-lifecycle": "owned-plan.owned-plan-repository.archive",
  "library.starter-detail": "starter-plan.starter-plan-repository.create-editable-copy",
  "library.starter-activation": "starter-plan.starter-plan-repository.activate-accepted-starter-plan",
  "library.template-update": "starter-plan.starter-plan-repository.create-template-update-copy",
  "library.create-strength": "owned-plan.owned-plan-repository.create-draft",
  "library.plan-editor": "owned-plan.owned-plan-repository.save",
  "library.editor-draft-guards": "owned-plan.owned-plan-repository.read",
  "library.schedule-editor": "owned-plan.schedule-repository.save-version",
  "library.replacement-impact": "plan-impact.plan-impact-repository.apply-exercise-replacement",
  "library.day-removal-impact": "plan-impact.plan-impact-repository.apply-day-removal",
  "library.builtin-exercise": "library.content-repository.read-exercise-instructions",
  "library.custom-exercise": "custom-exercise.custom-exercise-repository.set-custom-exercise-archived",
  "library.create-exercise": "custom-exercise.custom-exercise-repository.create-custom-exercise",
  "library.copy-metric-migration": "metric-profile.metric-repository.migrate-custom-exercise-metric-profile",
  "library.load-error-recovery": "owned-plan.owned-plan-repository.read",
  "library.running-detail": "running-plan.running-plan-repository.read-aggregate",
  "library.running-create-zero-sessions": "running-plan.running-plan-repository.create-inactive-aggregate",
  "library.running-goal-edit": "running-plan.running-plan-repository.save-running-target",
  "library.running-session-common": "running-plan.running-plan-repository.save-source-graph",
  "library.running-recovery": "running-plan.running-plan-repository.save-source-graph",
  "library.running-long": "running-plan.running-plan-repository.save-source-graph",
  "library.running-progression": "running-plan.running-plan-repository.save-source-graph",
  "library.running-tempo": "running-plan.running-plan-repository.save-source-graph",
  "library.running-intervals": "running-plan.running-plan-repository.save-source-graph",
  "library.running-hills": "running-plan.running-plan-repository.save-source-graph",
  "library.running-fartlek": "running-plan.running-plan-repository.save-source-graph",
  "library.running-session-lifecycle": "running-plan.running-plan-repository.confirm-lifecycle",
  "library.running-conflict": "schedule-collision.schedule-collision-repository.confirm",
  "library.running-create-typed-sessions": "running-plan.running-plan-repository.save-source-graph",
  "library.running-two-same-day-slots": "running-plan.running-plan-repository.save-source-graph",
  "library.accessibility-recovery": "library.app-settings-repository.read-accessibility-runtime-profile",
  "library.custom-exercise-edit": "custom-exercise.custom-exercise-repository.edit-custom-exercise",
  "library.custom-exercise-hide": "custom-exercise.custom-exercise-repository.set-exercise-hidden",
  "library.custom-exercise-unhide": "custom-exercise.custom-exercise-repository.set-exercise-hidden",
  "library.custom-exercise-copy-bundled": "custom-exercise.custom-exercise-repository.create-custom-copy",
  "library.custom-exercise-archive": "custom-exercise.custom-exercise-repository.set-custom-exercise-archived",
  "library.custom-exercise-reactivate": "custom-exercise.custom-exercise-repository.set-custom-exercise-archived",
  "library.metric-profile-migration": "metric-profile.metric-repository.migrate-custom-exercise-metric-profile",
});

const entityReceipt = (
  table: string,
  identityColumns: readonly string[],
  effectColumns: readonly string[],
  expectedValues: Readonly<Record<string, string>> = {},
) => Object.freeze({ table, identityColumns: Object.freeze([...identityColumns]), effectColumns: Object.freeze([...effectColumns]), expectedValues: Object.freeze({ ...expectedValues }) });

const WORKOUT_OPERATION_RECEIPTS: Readonly<Record<string, ReturnType<typeof entityReceipt>>> = Object.freeze({
  "workout.start-alternate": entityReceipt("workout_sessions", ["id"], ["status", "revision"]),
  "workout.row-edit": entityReceipt("session_sets", ["id"], ["observed_json", "status", "revision"]),
  "workout.load-reps-editor": entityReceipt("session_sets", ["id"], ["observed_json", "status", "revision"]),
  "workout.duration-editor": entityReceipt("session_sets", ["id"], ["observed_json", "status", "revision"]),
  "workout.all-metrics": entityReceipt("session_sets", ["id"], ["observed_json", "status", "revision"]),
  "workout.add-set": entityReceipt("session_sets", ["id"], ["set_kind", "ordinal", "revision"]),
  "workout.complete-commit": entityReceipt("session_sets", ["completion_idempotency_key"], ["status", "observed_json", "revision"]),
  "workout.rest-controls": entityReceipt("session_rest_states", ["session_id"], ["status", "remaining_ms", "revision"]),
  "workout.rest-recovery": entityReceipt("session_rest_states", ["session_id"], ["status", "remaining_ms", "revision"]),
  "workout.plan-increment": entityReceipt("progression_recommendations", ["id"], ["status", "target_revision", "decided_at_ms"]),
  "workout.add-exercise": entityReceipt("workout_session_exercise_edit_receipts", ["request_id"], ["operation", "result_session_revision"], { operation: "add_exercise" }),
  "workout.replace-exercise": entityReceipt("workout_session_exercise_edit_receipts", ["request_id"], ["operation", "result_session_revision"], { operation: "replace_exercise" }),
  "workout.delete-exercise": entityReceipt("workout_session_exercise_edit_receipts", ["request_id"], ["operation", "result_session_revision"], { operation: "remove_exercise" }),
  "workout.reorder": entityReceipt("workout_session_exercise_reorder_receipts", ["request_id"], ["operation", "result_session_revision"], { operation: "reorder_exercises" }),
  "workout.undo": entityReceipt("session_undo_snapshots", ["idempotency_key"], ["completed_set_id", "consumed_at_ms"]),
  "workout.outcomes": entityReceipt("workout_receipts", ["id"], ["workout_session_id", "committed_at_ms"]),
  "workout.completion-writeback": entityReceipt("owned_plan_mutation_requests", ["request_id"], ["operation", "result_plan_id", "result_revision"]),
  "workout.timing-policy": entityReceipt("app_settings", ["key"], ["value_json", "revision"]),
  "workout.appearance": entityReceipt("app_settings", ["key"], ["value_json", "revision"]),
  "workout.offline-recovery": entityReceipt("workout_receipts", ["id"], ["workout_session_id", "committed_at_ms"]),
});

const familyAReceiptRows = [
  ...PHASE17_FAMILY_A_MUTATION_RECEIPTS,
  ...PHASE17_FAMILY_A_CUSTOM_METRIC_MATRIX_RECEIPTS,
] as const;
const LIBRARY_RECEIPT_COLUMNS: Readonly<Record<string, Readonly<{
  identity: readonly string[];
  effects: readonly string[];
}>>> = Object.freeze({
  custom_exercise_mutation_receipts: Object.freeze({ identity: Object.freeze(["request_id"]), effects: Object.freeze(["mutation_kind", "result_json"]) }),
  metric_profile_migration_events: Object.freeze({ identity: Object.freeze(["idempotency_key"]), effects: Object.freeze(["exercise_id", "exercise_revision", "to_exercise_metric_generation", "result_json"]) }),
  starter_plan_activation_requests: Object.freeze({ identity: Object.freeze(["request_id"]), effects: Object.freeze(["template_id", "source_revision", "choice", "result_json"]) }),
  owned_plan_schedule_events: Object.freeze({ identity: Object.freeze(["id"]), effects: Object.freeze(["event_type", "schedule_revision", "payload_json"]) }),
  owned_plan_mutation_requests: Object.freeze({ identity: Object.freeze(["request_id"]), effects: Object.freeze(["operation", "result_plan_id", "result_revision", "result_json"]) }),
});
function libraryReceipt(table: string): ReturnType<typeof entityReceipt> {
  const columns = LIBRARY_RECEIPT_COLUMNS[table]!;
  return entityReceipt(table, columns.identity, columns.effects);
}
const CUSTOM_MUTATION_KIND: Readonly<Record<string, string>> = Object.freeze({
  "library.exercise-favorites": "favorite",
  "library.create-exercise": "create",
  "library.custom-exercise": "archive",
  "library.custom-exercise-edit": "edit",
  "library.custom-exercise-hide": "hidden",
  "library.custom-exercise-unhide": "hidden",
  "library.custom-exercise-copy-bundled": "copy",
  "library.custom-exercise-archive": "archive",
  "library.custom-exercise-reactivate": "archive",
});
const LIBRARY_OPERATION_RECEIPTS: Readonly<Record<string, ReturnType<typeof entityReceipt>>> = Object.freeze(Object.fromEntries([
  ...familyAReceiptRows.map(([caseId, table]) => {
    const receipt = libraryReceipt(table);
    const mutationKind = CUSTOM_MUTATION_KIND[caseId];
    return [caseId, mutationKind === undefined ? receipt : entityReceipt(receipt.table, receipt.identityColumns, receipt.effectColumns, { mutation_kind: mutationKind })];
  }),
  ...[
    "library.running-create-zero-sessions", "library.running-goal-edit", "library.running-session-common",
    "library.running-recovery", "library.running-long", "library.running-progression", "library.running-tempo",
    "library.running-intervals", "library.running-hills", "library.running-fartlek", "library.running-session-lifecycle",
    "library.running-create-typed-sessions", "library.running-two-same-day-slots",
  ].map((caseId) => [caseId, entityReceipt("running_plan_receipts", ["request_id"], ["operation", "plan_id", "result_json"], {
    operation: caseId === "library.running-create-zero-sessions"
      ? "create"
      : caseId === "library.running-session-lifecycle"
        ? "archive"
        : "edit",
  })]),
  ["library.running-conflict", entityReceipt("schedule_collision_receipts", ["request_id"], ["outcome_id", "result_json"])],
]));

const multiPlanContracts = MULTI_PLAN_RUNNING_CASE_IDS.map((caseId) => nativeAcceptanceContract({
  shard: "multi-plan",
  caseId,
  requirement: "Phase 13 source-owned contract",
  actionId: caseId.slice("phase13-".length),
  sourceProbe: `multi-plan-running:${caseId}`,
  uiReadback: "SQLite-backed contract observation",
  authorityTables: MULTI_PLAN_TABLES[caseId]!,
  mutation: true,
  handlerId: `migration.multi-plan-running-contract.${caseId}`,
}));

const workoutContracts = PHASE15_REQUIRED_CASES.map(({ id: caseId, requirement }) => {
  const requiredCaseId = caseId!;
  const requiredRequirement = requirement!;
  return nativeAcceptanceContract({
    shard: "workout",
    caseId: requiredCaseId,
    requirement: requiredRequirement,
    actionId: requiredCaseId.slice("workout.".length),
    sourceProbe: `phase15-workout-ledger:${requiredCaseId}`,
    uiReadback: "Workout source contract observation",
    authorityTables: workoutTables(requiredCaseId),
    mutation: WORKOUT_MUTATIONS.has(requiredCaseId),
    handlerId: WORKOUT_OPERATION_HANDLERS[requiredCaseId]!,
    ...(WORKOUT_OPERATION_RECEIPTS[requiredCaseId] === undefined ? {} : { receipt: WORKOUT_OPERATION_RECEIPTS[requiredCaseId] }),
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
  authorityTables: LIBRARY_PROBE_TABLES[entry.sourceProbe]!,
  mutation: entry.proofMode === "mutating",
  handlerId: LIBRARY_OPERATION_HANDLERS[entry.id]!,
  ...(LIBRARY_OPERATION_RECEIPTS[entry.id] === undefined ? {} : { receipt: LIBRARY_OPERATION_RECEIPTS[entry.id] }),
}));

export const V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS = Object.freeze([
  ...multiPlanContracts,
  ...workoutContracts,
  ...libraryContracts,
]);

/** Fails module load when a new functional case silently falls back to a
 * generic operation signature or reuses another case's parameters/readback. */
export function assertV12NativeAcceptanceOperationRegistry(
  contracts: readonly V12NativeAcceptanceCaseContract[] = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS,
): true {
  if (contracts.length !== 101) throw new Error("v12_native_acceptance_contract_count_invalid");
  const sourceOwned = contracts.filter(({ shard }) => shard !== "multi-plan");
  if (sourceOwned.length !== 88) throw new Error("v12_native_acceptance_operation_count_invalid");
  const caseKeys = new Set<string>();
  const signatures = new Set<string>();
  for (const contract of contracts) {
    const caseKey = `${contract.shard}:${contract.caseId}`;
    if (caseKeys.has(caseKey)) throw new Error("v12_native_acceptance_contract_duplicate");
    caseKeys.add(caseKey);
    const { handlerId, parameterContract, postcondition } = contract.operation;
    if (!/^[a-z][a-z0-9-]*\.[a-z0-9.-]+$/u.test(handlerId)
      || /(?:count|noop|metadata|generic)/u.test(handlerId)
      || !parameterContract.includes(contract.caseId)
      || !postcondition.id.includes(contract.caseId)
      || postcondition.description.length < 13) {
      throw new Error("v12_native_acceptance_operation_invalid");
    }
    if (contract.shard === "multi-plan") continue;
    if (contract.operation.kind === "repository-mutation") {
      const receipt = contract.operation.receipt;
      if (receipt === null || !contract.probes.post.tables.includes(receipt.table)
        || receipt.identityColumns.length === 0 || receipt.effectColumns.length === 0
        || receipt.identityColumns.some((column) => receipt.effectColumns.includes(column))) {
        throw new Error("v12_native_acceptance_receipt_contract_missing");
      }
    } else if (contract.operation.receipt !== null) {
      throw new Error("v12_native_acceptance_read_receipt_forbidden");
    }
    const signature = `${handlerId}\u0000${parameterContract}\u0000${postcondition.id}`;
    if (signatures.has(signature)) throw new Error("v12_native_acceptance_operation_collapsed");
    signatures.add(signature);
  }
  return true;
}

assertV12NativeAcceptanceOperationRegistry();

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

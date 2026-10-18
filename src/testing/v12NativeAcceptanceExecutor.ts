import type {
  SqliteKernel,
  SqliteReadTransactionExecutor,
} from "../platform/sqlite/sqliteKernel";

export type V12NativeAcceptanceShard =
  | "multi-plan"
  | "workout"
  | "library-running";

export type V12NativeAcceptanceRequest = Readonly<{
  shard: V12NativeAcceptanceShard;
  caseId: string;
  fixtureId: "v12-synthetic-fixtures-r18";
  title: string;
  source: string;
  requirement: string;
  action: string;
  readback: string;
  sourceProbe: string;
  authorityTables: readonly string[];
  nonce: string;
}>;

export type V12NativeAcceptanceSourceState = Readonly<{
  source_sha256: string;
  row_count: number;
  table_count: number;
  schema_version: number;
}>;

export type V12NativeAcceptanceSourceReceipt = Readonly<{
  schema_version: 1;
  producer: "v12-native-acceptance-source/v1";
  authority: "sqlite-domain-read";
  shard: V12NativeAcceptanceShard;
  case_id: string;
  nonce: string;
  action_id: string;
  source_probe: string;
  authority_tables: readonly string[];
  pre: V12NativeAcceptanceSourceState;
  action: V12NativeAcceptanceSourceState;
  post: V12NativeAcceptanceSourceState;
  action_request_sha256: string;
  source_receipt_sha256: string;
}>;

export type V12NativeAcceptanceUiReadback = Readonly<{
  schema_version: 1;
  producer: "v12-native-acceptance-ui-readback/v1";
  shard: V12NativeAcceptanceShard;
  case_id: string;
  nonce: string;
  declared_action: string;
  declared_readback: string;
  source_receipt_sha256: string;
  ui_receipt_sha256: string;
}>;

export type V12NativeAcceptanceReadbacks = Readonly<{
  source_receipt: V12NativeAcceptanceSourceReceipt;
  ui_readback: V12NativeAcceptanceUiReadback;
}>;

const HASH = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{48}$/u;
const TABLE = /^[a-z][a-z0-9_]{1,80}$/u;

const MULTI_PLAN_TABLES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "phase13-migration-failure-cuts": Object.freeze(["portability_restore_state"]),
  "phase13-map01-activation": Object.freeze(["plans", "owned_plan_schedules", "owned_plan_mutation_requests"]),
  "phase13-running-two-slots": Object.freeze(["running_plans", "running_session_slots", "running_session_slot_revisions"]),
  "phase13-strength-completion-retry": Object.freeze(["workout_sessions", "session_sets", "workout_receipts"]),
  "phase13-import-normalized-identity": Object.freeze(["imported_activities", "imported_activity_identities", "imported_activity_receipts"]),
  "phase13-import-remove-restore": Object.freeze(["imported_activities", "imported_activity_removal_events", "imported_activity_receipts"]),
  "phase13-match-invalidation": Object.freeze(["running_activity_current_matches", "running_activity_match_events", "running_activity_match_receipts"]),
  "phase13-stale-replay-no-resurrection": Object.freeze(["imported_activities", "imported_activity_removal_events", "imported_activity_receipts"]),
  "phase13-bodyweight-correction-delete": Object.freeze(["bodyweight_entries", "bodyweight_entry_events", "bodyweight_command_receipts"]),
  "phase13-backup-clean-restore": Object.freeze(["portability_restore_state", "portable_owner_identity"]),
  "phase13-merge-rebuild": Object.freeze(["portability_restore_state", "history_projection_freshness"]),
  "phase13-source-generation-neutrality": Object.freeze(["automatic_backup_state", "imported_activity_receipts"]),
  "phase13-tim01-retirement": Object.freeze(["session_sets", "session_advanced_timing_states"]),
});

const WORKOUT_TABLES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  root: Object.freeze(["plans", "owned_plan_schedules", "workout_sessions"]),
  active: Object.freeze(["workout_sessions", "session_exercises", "session_sets"]),
  set: Object.freeze(["session_sets", "workout_receipts"]),
  rest: Object.freeze(["session_rest_states", "pending_effects"]),
  history: Object.freeze(["history_subject_revisions", "history_projection_metric_aggregates"]),
  plan: Object.freeze(["plans", "owned_plan_aggregate_states", "progression_recommendations"]),
  edit: Object.freeze(["session_exercises", "session_sets", "workout_session_exercise_edit_receipts"]),
  completion: Object.freeze(["workout_sessions", "workout_receipts", "workout_provenance"]),
  settings: Object.freeze(["app_settings", "session_advanced_timing_states"]),
});

const LIBRARY_PROBE_TABLES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  accessibility_runtime_profile: Object.freeze(["app_settings"]),
  custom_exercise_metric_migrations: Object.freeze(["metric_profile_migration_events"]),
  metric_profile_migration_events: Object.freeze(["metric_profile_migration_events"]),
  custom_exercises: Object.freeze(["exercises", "exercise_owner_preferences"]),
  exercise_instruction_sets: Object.freeze(["exercise_library_entries"]),
  exercise_preferences: Object.freeze(["exercise_owner_preferences"]),
  exercise_search_index: Object.freeze(["exercise_search_terms"]),
  library_action_state: Object.freeze(["app_settings"]),
  library_view_state: Object.freeze(["app_settings"]),
  owned_plan_lifecycle_receipts: Object.freeze(["owned_plan_mutation_requests", "plans"]),
  owned_plan_revisions: Object.freeze(["owned_plan_mutation_requests", "plans"]),
  owned_plans: Object.freeze(["plans"]),
  plan_create_intent: Object.freeze(["plans"]),
  plan_day_revisions: Object.freeze(["plan_days", "owned_plan_mutation_requests"]),
  plan_exercise_replacements: Object.freeze(["owned_plan_day_exercises", "owned_plan_mutation_requests"]),
  plan_schedule_slots: Object.freeze(["owned_plan_schedules", "owned_plan_schedule_versions"]),
  running_plan_aggregates: Object.freeze(["running_plans", "running_plan_receipts"]),
  running_plan_revisions: Object.freeze(["running_plans", "running_plan_events", "running_plan_receipts"]),
  running_plans: Object.freeze(["running_plans"]),
  running_session_revisions: Object.freeze(["running_session_revisions", "running_plan_receipts"]),
  running_session_slots: Object.freeze(["running_session_slots", "running_session_slot_revisions", "running_plan_receipts"]),
  schedule_collision_projections: Object.freeze(["schedule_collision_projections", "schedule_collision_receipts"]),
  starter_plan_activations: Object.freeze(["starter_plan_activation_requests", "owned_plan_schedules"]),
});

function workoutAuthorityTables(caseId: string): readonly string[] {
  if (["workout.root-identity", "workout.day-switch", "workout.scheduled-rest-empty", "workout.start-alternate", "workout.start-resume", "workout.context-running"].includes(caseId)) return WORKOUT_TABLES.root!;
  if (["workout.rest-dock", "workout.rest-controls", "workout.rest-recovery"].includes(caseId)) return WORKOUT_TABLES.rest!;
  if (["workout.trend"].includes(caseId)) return WORKOUT_TABLES.history!;
  if (["workout.plan-increment", "workout.plan-after-workout"].includes(caseId)) return WORKOUT_TABLES.plan!;
  if (["workout.add-exercise", "workout.replace-exercise", "workout.delete-exercise", "workout.reorder", "workout.undo"].includes(caseId)) return WORKOUT_TABLES.edit!;
  if (["workout.outcomes", "workout.completion-review", "workout.completion-writeback", "workout.offline-recovery"].includes(caseId)) return WORKOUT_TABLES.completion!;
  if (["workout.timing-policy", "workout.appearance", "workout.accessibility", "workout.performance", "workout.readonly-presentation"].includes(caseId)) return WORKOUT_TABLES.settings!;
  if (["workout.set-states", "workout.row-edit", "workout.load-reps-editor", "workout.duration-editor", "workout.all-metrics", "workout.warmup-order", "workout.add-set", "workout.complete-commit", "workout.complete-failure", "workout.completion-collapse"].includes(caseId)) return WORKOUT_TABLES.set!;
  return WORKOUT_TABLES.active!;
}

export function authorityTablesForV12NativeAcceptance(
  shard: V12NativeAcceptanceShard,
  caseId: string,
  sourceProbe: string,
): readonly string[] {
  const tables = shard === "multi-plan"
    ? MULTI_PLAN_TABLES[caseId]
    : shard === "workout"
      ? workoutAuthorityTables(caseId)
      : LIBRARY_PROBE_TABLES[sourceProbe];
  if (!validateV12NativeAcceptanceAuthorityTables(tables)) {
    throw new Error("v12_native_acceptance_authority_missing");
  }
  return tables;
}

export function validateV12NativeAcceptanceAuthorityTables(
  tables: readonly string[] | undefined,
): tables is readonly string[] {
  return Array.isArray(tables) && tables.length > 0 && tables.every((table) => TABLE.test(table));
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}

async function readAuthorityState(input: Readonly<{
  kernel: SqliteKernel;
  tables: readonly string[];
  sha256(value: string): Promise<string>;
}>): Promise<V12NativeAcceptanceSourceState> {
  if (input.kernel.readSnapshot === undefined) throw new Error("v12_native_acceptance_snapshot_unavailable");
  const snapshot = await input.kernel.readSnapshot(async (transaction: SqliteReadTransactionExecutor) => {
    const [version] = await transaction.queryAll<{ user_version: number }>("PRAGMA user_version");
    const facts = [] as Readonly<{ table: string; rows: readonly unknown[] }>[];
    let rowCount = 0;
    for (const table of input.tables) {
      const rows = await transaction.queryAll<Record<string, unknown>>(`SELECT * FROM "${table}"`);
      const ordered = [...rows].sort((left, right) => stableJson(left).localeCompare(stableJson(right), "en"));
      facts.push(Object.freeze({ table, rows: Object.freeze(ordered) }));
      rowCount += rows.length;
    }
    return Object.freeze({ schemaVersion: version?.user_version ?? -1, facts: Object.freeze(facts), rowCount });
  });
  const digest = await input.sha256(stableJson({ schema_version: snapshot.schemaVersion, tables: snapshot.facts }));
  if (!HASH.test(digest) || !Number.isSafeInteger(snapshot.schemaVersion) || snapshot.schemaVersion < 1 || !Number.isSafeInteger(snapshot.rowCount) || snapshot.rowCount < 0) {
    throw new Error("v12_native_acceptance_source_state_invalid");
  }
  return Object.freeze({ source_sha256: digest, row_count: snapshot.rowCount, table_count: input.tables.length, schema_version: snapshot.schemaVersion });
}

export async function executeV12NativeAcceptanceReadAction(input: Readonly<{
  kernel: SqliteKernel;
  request: V12NativeAcceptanceRequest;
  sha256(value: string): Promise<string>;
}>): Promise<V12NativeAcceptanceReadbacks> {
  const { request } = input;
  if (!NONCE.test(request.nonce)) throw new Error("v12_native_acceptance_request_invalid");
  const expectedTables = authorityTablesForV12NativeAcceptance(request.shard, request.caseId, request.sourceProbe);
  if (stableJson(expectedTables) !== stableJson(request.authorityTables)) throw new Error("v12_native_acceptance_authority_mismatch");
  const actionRequest = Object.freeze({
    schema_version: 1,
    producer: "v12-native-acceptance-action-request/v1",
    shard: request.shard,
    case_id: request.caseId,
    nonce: request.nonce,
    action_id: request.action,
    source_probe: request.sourceProbe,
    authority_tables: request.authorityTables,
  });
  const actionRequestSha256 = await input.sha256(JSON.stringify(actionRequest));
  const pre = await readAuthorityState({ ...input, tables: request.authorityTables });
  const action = await readAuthorityState({ ...input, tables: request.authorityTables });
  const post = await readAuthorityState({ ...input, tables: request.authorityTables });
  if (pre.source_sha256 !== action.source_sha256 || pre.source_sha256 !== post.source_sha256) {
    throw new Error("v12_native_acceptance_read_action_drift");
  }
  const sourceUnsigned = Object.freeze({
    schema_version: 1 as const,
    producer: "v12-native-acceptance-source/v1" as const,
    authority: "sqlite-domain-read" as const,
    shard: request.shard,
    case_id: request.caseId,
    nonce: request.nonce,
    action_id: request.action,
    source_probe: request.sourceProbe,
    authority_tables: request.authorityTables,
    pre,
    action,
    post,
    action_request_sha256: actionRequestSha256,
  });
  const sourceReceipt = Object.freeze({ ...sourceUnsigned, source_receipt_sha256: await input.sha256(JSON.stringify(sourceUnsigned)) });
  const uiUnsigned = Object.freeze({
    schema_version: 1 as const,
    producer: "v12-native-acceptance-ui-readback/v1" as const,
    shard: request.shard,
    case_id: request.caseId,
    nonce: request.nonce,
    declared_action: request.action,
    declared_readback: request.readback,
    source_receipt_sha256: sourceReceipt.source_receipt_sha256,
  });
  const uiReadback = Object.freeze({ ...uiUnsigned, ui_receipt_sha256: await input.sha256(JSON.stringify(uiUnsigned)) });
  return Object.freeze({ source_receipt: sourceReceipt, ui_readback: uiReadback });
}

import fullBodyFoundationAsset from "../../../assets/content/full-body-foundation.v1.json";
import {
  changeGarminActivityLifecycle,
  confirmGarminImportDate,
  type PreparedGarminImport,
} from "../../domains/activities/importCommands";
import {
  canonicalBodyweightRequestPayload,
} from "../../domains/bodyweight/contracts";
import {
  updateSessionSetAdvancedTiming,
} from "../../domains/advancedTiming/advancedTimingCommands";
import {
  parseFullBodyFoundation,
} from "../../domains/content";
import { activateStarterPlan } from "../../domains/plans";
import { confirmRunningActivityMatch } from "../../domains/running/activityMatchCommands";
import { startWorkout } from "../../domains/workout/startWorkout";
import { completeSet } from "../../domains/workout/setCommands";
import { parseLocalDate } from "../../domains/scheduling/localDate";
import { parseStoredTimeZone } from "../../domains/scheduling/timeZone";
import { createMigrationRunner } from "../../platform/sqlite/migrationRunner";
import type { Migration } from "../../platform/sqlite/migrationRunner";
import { migrations } from "../../platform/sqlite/migrations";
import type { RecoveryBackupPort } from "../../platform/sqlite/recoveryBackup";
import { runtimeSha256 } from "../../platform/crypto/runtimeSha256";
import { createAdvancedTimingRepository } from "../../platform/sqlite/repositories/advancedTimingRepository";
import { createBodyweightRepository } from "../../platform/sqlite/repositories/bodyweightRepository";
import { createImportedActivityRepository } from "../../platform/sqlite/repositories/importedActivityRepository";
import { createLogicalBackupRepository } from "../../platform/sqlite/repositories/logicalBackupRepository";
import { createLogicalRestoreRepository } from "../../platform/sqlite/repositories/logicalRestoreRepository";
import { createPlansWorkoutRepository } from "../../platform/sqlite/repositories/plansWorkoutRepository";
import { createRunningActivityMatchRepository } from "../../platform/sqlite/repositories/runningActivityMatchRepository";
import { createRunningPlanRepository } from "../../platform/sqlite/repositories/runningPlanRepository";
import { createScheduleRepository } from "../../platform/sqlite/repositories/scheduleRepository";
import { createWorkoutRepository } from "../../platform/sqlite/repositories/workoutRepository";
import type { SqliteKernel, SqliteKernelTestObserver } from "../../platform/sqlite/sqliteKernel";
import {
  createExpoMigrationsEffectsContractAdapter,
} from "./migrationsEffects.contract";
import {
  createExpoPortableMergeContractAdapter,
  runPortableMergeContract,
} from "./portableMerge.contract";

/** Source-owned, privacy-safe Phase 13 evidence identities. */
export const MULTI_PLAN_RUNNING_CONTRACT_CASES = [
  "phase13-migration-failure-cuts", "phase13-map01-activation", "phase13-running-two-slots",
  "phase13-strength-completion-retry", "phase13-import-normalized-identity", "phase13-import-remove-restore",
  "phase13-match-invalidation", "phase13-stale-replay-no-resurrection", "phase13-bodyweight-correction-delete",
  "phase13-backup-clean-restore", "phase13-merge-rebuild", "phase13-source-generation-neutrality",
  "phase13-tim01-retirement",
] as const;

export type MultiPlanRunningContractCaseId =
  (typeof MULTI_PLAN_RUNNING_CONTRACT_CASES)[number];

/**
 * Fail immediately after the first initial-schema statement. That statement
 * creates a user table, making this a rollback-after-write cut rather than an
 * untouched-database abort.
 */
export const PHASE13_STATEMENT_FAILURE_CUT = Object.freeze({
  phase: "after" as const,
  statementIndex: 0,
});

export type MultiPlanRunningContractAdapter = Readonly<{
  runCase(caseId: MultiPlanRunningContractCaseId): Promise<void>;
  cleanup?(): Promise<void>;
}>;

export type MultiPlanRunningContractResult = Readonly<{
  schemaVersion: 1; contractVersion: 1; status: "passed" | "failed"; total: number;
  passed: number; failed: number; skipped: 0;
  cases: readonly Readonly<{ id: MultiPlanRunningContractCaseId; status: "passed" | "failed"; durationMs: number; errorCode?: string; }>[];
  startedAt: string; finishedAt: string;
}>;

type ExpoRuntime = Readonly<{
  databaseName: string;
  kernel: SqliteKernel;
  recoveryBackup?: RecoveryBackupPort;
  close(): Promise<void>;
}>;

type ExpoMigrationsAdapter = Readonly<{
  createRuntime(databaseKey: string, observer?: SqliteKernelTestObserver): Promise<ExpoRuntime>;
  recoveryBackup: RecoveryBackupPort;
  cleanup?(): Promise<void>;
}>;

function invariant(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && /^[a-z0-9_:-]{3,80}$/iu.test(error.message)) {
    return error.message;
  }
  return "multi_plan_running_contract_failed";
}

async function withFreshExpoRuntime(
  adapter: ExpoMigrationsAdapter,
  caseId: MultiPlanRunningContractCaseId,
  operation: (kernel: SqliteKernel) => Promise<void>,
): Promise<void> {
  const runtime = await adapter.createRuntime(caseId);
  try {
    const migrated = await createMigrationRunner({
      databaseName: runtime.databaseName,
      kernel: runtime.kernel,
      migrations,
      // The native adapter supplies a per-case backup port.  Keep the adapter
      // fallback for test adapters that expose only the shared port.
      recoveryBackup: runtime.recoveryBackup ?? adapter.recoveryBackup,
    }).run();
    invariant(
      migrated.currentVersion === migrations.at(-1)?.version,
      "phase13_migration_not_current",
    );
    await operation(runtime.kernel);
  } finally {
    await runtime.close();
  }
}

async function failedMigrationState(kernel: SqliteKernel): Promise<Readonly<{
  version: number;
  userTables: number;
}>> {
  const [version, tables] = await Promise.all([
    kernel.queryAll<{ user_version: number }>("PRAGMA user_version"),
    kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    ),
  ]);
  return Object.freeze({ version: version[0]?.user_version ?? -1, userTables: tables[0]?.count ?? -1 });
}

const verifyFailureMigration: Migration = Object.freeze({
  version: 1,
  name: "phase13-native-verify-failure",
  kind: "additive",
  async up(transaction) {
    await transaction.execute("CREATE TABLE phase13_verify_failure (id TEXT PRIMARY KEY NOT NULL) STRICT");
  },
  async verify() {
    throw new Error("phase13_verify_failure");
  },
});

const commitFailureMigration: Migration = Object.freeze({
  version: 1,
  name: "phase13-native-commit-failure",
  kind: "additive",
  async up(transaction) {
    await transaction.execute("CREATE TABLE phase13_commit_failure (id TEXT PRIMARY KEY NOT NULL) STRICT");
  },
  async verify() {},
});

async function assertMigrationFailureCut(
  adapter: ExpoMigrationsAdapter,
  databaseKey: string,
  action: (runtime: ExpoRuntime) => Promise<void>,
  observer: SqliteKernelTestObserver = {},
): Promise<void> {
  const runtime = await adapter.createRuntime(databaseKey, observer);
  let failed = false;
  try {
    try {
      await action(runtime);
    } catch {
      failed = true;
    }
  } finally {
    await runtime.close();
  }

  const reopenedRuntime = await adapter.createRuntime(databaseKey);
  try {
    const state = await failedMigrationState(reopenedRuntime.kernel);
    invariant(failed, "phase13_migration_failure_not_observed");
    invariant(state.version === 0 && state.userTables === 0, "phase13_migration_rollback_invalid");
  } finally {
    await reopenedRuntime.close();
  }
}

async function runMigrationFailureCuts(
  adapter: ExpoMigrationsAdapter,
  caseId: string,
): Promise<void> {
  await assertMigrationFailureCut(adapter, `${caseId}-statement`, async (runtime) => {
    await createMigrationRunner({
      databaseName: runtime.databaseName,
      kernel: runtime.kernel,
      migrations: [migrations[0]!],
      failureInjector(event) {
        if (
          event.phase === PHASE13_STATEMENT_FAILURE_CUT.phase
          && event.statementIndex === PHASE13_STATEMENT_FAILURE_CUT.statementIndex
        ) {
          throw new Error("phase13_statement_failure_after_write");
        }
      },
    }).run();
  });
  await assertMigrationFailureCut(adapter, `${caseId}-verify`, async (runtime) => {
    await createMigrationRunner({ databaseName: runtime.databaseName, kernel: runtime.kernel, migrations: [verifyFailureMigration] }).run();
  });
  await assertMigrationFailureCut(adapter, `${caseId}-commit`, async (runtime) => {
    await createMigrationRunner({ databaseName: runtime.databaseName, kernel: runtime.kernel, migrations: [commitFailureMigration] }).run();
  }, {
    async beforeCommit() {
      throw new Error("phase13_commit_failure");
    },
  });
}

const SHA256 = "a".repeat(64);
const PHASE13_NATIVE_EVENT_TIME_MS = 1_786_853_700_000;

function requestHash(requestId: string): Promise<string> {
  return runtimeSha256(`phase13-native-request:${requestId}`);
}

type RunningFixture = Readonly<{
  planId: string;
  scheduleId: string;
  scheduleVersionId: string;
  slotId: string;
  sessionRevisionId: string;
  opportunityId: string;
}>;

async function seedRunningFixture(
  kernel: SqliteKernel,
  prefix: string,
): Promise<RunningFixture> {
  const fixture: RunningFixture = {
    planId: `${prefix}-running-plan`,
    scheduleId: `${prefix}-running-schedule`,
    scheduleVersionId: `${prefix}-running-version`,
    slotId: `${prefix}-running-slot`,
    sessionRevisionId: `${prefix}-running-recovery-v1`,
    opportunityId: `${prefix}-running-opportunity`,
  };
  const plans = createRunningPlanRepository(kernel);
  await plans.createInactiveMinimum({
    planId: fixture.planId,
    planName: "Native Running fixture",
    anchorDayId: `${prefix}-running-day`,
    scheduleId: fixture.scheduleId,
    scheduleVersionId: fixture.scheduleVersionId,
    scheduleBindingId: `${prefix}-running-binding`,
    createdAtMs: 1_786_853_600_000,
    effectiveLocalDate: "2026-08-17",
    timezone: "Asia/Singapore",
    recoveryRevisionId: fixture.sessionRevisionId,
    slots: [{
      id: fixture.slotId,
      weekday: "Monday",
      ordinal: 0,
      sessionRevisionId: fixture.sessionRevisionId,
    }],
  });
  await plans.activateMinimum({
    planId: fixture.planId,
    scheduleId: fixture.scheduleId,
    expectedPlanRevision: 1,
    expectedScheduleRevision: 1,
    activatedAtMs: 1_786_853_601_000,
  });
  const occurrences = await plans.materializeOccurrences({
    planId: fixture.planId,
    scheduleId: fixture.scheduleId,
    scheduleVersionId: fixture.scheduleVersionId,
    localDate: "2026-08-17",
    timezone: "Asia/Singapore",
    createdAtMs: 1_786_853_602_000,
    occurrenceIds: [fixture.opportunityId],
  });
  invariant(
    occurrences.length === 1 && occurrences[0]?.slotId === fixture.slotId,
    "phase13_running_occurrence_missing",
  );
  return fixture;
}

async function seedStrengthActivationFixture(
  kernel: SqliteKernel,
  prefix: string,
): Promise<void> {
  const planId = `${prefix}-strength-plan`;
  const dayId = `${prefix}-strength-day`;
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO plans
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         days_per_week, audience, goal, estimate_minutes, attribution,
         is_active, revision, plan_kind)
       VALUES (?, NULL, 'custom', NULL, NULL, 'Native Strength fixture',
               1, 'Personal', 'Strength', 30, 'Owner', 0, 1, 'strength')`,
      [planId],
    );
    await transaction.execute(
      "INSERT INTO plan_days(id, plan_id, ordinal, name, revision) VALUES (?, ?, 0, 'Day', 1)",
      [dayId, planId],
    );
    await transaction.execute(
      `INSERT INTO exercise_library_entries
        (exercise_id, origin, canonical_name, exercise_type, movement_class,
         metric_profile, metric_contract_version, exercise_metric_generation,
         availability, revision)
       VALUES (
         'native-strength-exercise', 'custom', 'Native Strength exercise',
         'strength', 'compound', 'load_reps', 1, 1, 'available', 1
       )`,
    );
    await transaction.execute(
      `INSERT INTO exercises
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         metric_profile, metric_contract_version, exercise_metric_generation,
         equipment, default_rest_seconds, revision)
       VALUES ('native-strength-exercise', NULL, 'custom', NULL, NULL,
               'Native Strength exercise', 'load_reps', 1, 1,
               'Unspecified', 60, 1)`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_aggregate_states
        (plan_id, lifecycle, graph_status, missing_requirement_code,
         missing_requirement, created_at_ms, updated_at_ms, archived_at_ms)
       VALUES (?, 'ready', 'valid', NULL, NULL, 1, 1, NULL)`,
      [planId],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_day_exercises
        (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds,
         metric_profile, metric_contract_version, exercise_metric_generation, revision)
       VALUES (?, ?, 'native-strength-exercise', 0, 60, 'load_reps', 1, 1, 1)`,
      [`${prefix}-strength-occurrence`, dayId],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_working_set_targets
        (id, plan_day_exercise_id, ordinal, target_json, unit_json,
         metric_profile, metric_contract_version, exercise_metric_generation, revision)
       VALUES (?, ?, 0,
         '{"version":1,"profile":"load_reps","loadGrams":30000,"minReps":8,"maxReps":10,"incrementGrams":2500,"perSide":false}',
         '{"version":1,"load":"grams","count":"repetitions"}',
         'load_reps', 1, 1, 1)`,
      [`${prefix}-strength-target`, `${prefix}-strength-occurrence`],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_progression_policies
        (id, plan_day_exercise_id, policy_kind, policy_id, policy_version,
         rule_json, metric_profile, metric_contract_version,
         exercise_metric_generation, status, revision)
       VALUES (?, ?, 'manual_hold', 'native-manual-hold', 1,
         '{"kind":"manual_hold","id":"native-manual-hold","version":1}',
         'load_reps', 1, 1, 'active', 1)`,
      [`${prefix}-strength-policy`, `${prefix}-strength-occurrence`],
    );
  });
  const result = await createScheduleRepository(kernel).activateSchedule({
    operation: "activate_schedule",
    requestId: `${prefix}-strength-activate`,
    requestSha256: await requestHash(`${prefix}-strength-activate`),
    planId,
    expectedPlanRevision: 1,
    expectedActivePair: { kind: "none" },
    targetSchedule: { kind: "absent", scheduleId: `${prefix}-strength-schedule` },
    todayLocalDate: parseLocalDate("2026-08-17"),
    activatedAtMs: 1_786_853_603_000,
    next: {
      effectiveLocalDate: parseLocalDate("2026-08-17"),
      mode: "weekday",
      timeZone: parseStoredTimeZone("Asia/Singapore"),
      bindings: [{ ordinal: 0, weekIndex: 0, weekday: "Monday", planDayId: dayId }],
    },
    confirmationToken: `${prefix}-strength-confirmation`,
    versionId: `${prefix}-strength-version`,
    bindingIds: [`${prefix}-strength-binding`],
  });
  invariant(result.planId === planId, "phase13_map01_activation_failed");
}

function stagedGarminImport(prefix: string): PreparedGarminImport {
  const normalized = {
    version: 1 as const,
    started_at_ms: 1_786_853_604_000,
    sport: "running" as const,
    subtype: "outdoor",
    distance_meters: 5_000,
    elapsed_ms: 1_500_000,
    laps: [],
  };
  return Object.freeze({
    envelope: Object.freeze({
      version: 1 as const,
      source_kind: "garmin_connect_account" as const,
      account_namespace: `${prefix}-account`,
      external_activity_id: `${prefix}-external`,
      normalization_version: 1,
      normalized_json_sha256: SHA256,
      raw_component_sha256: { activity: SHA256, splits: SHA256, details: SHA256 },
      sample_fidelity: "source_summary" as const,
      normalized,
    }),
    canonical_payload_json: JSON.stringify({ normalization_version: 1, normalized }),
  });
}

async function importGarminActivity(
  kernel: SqliteKernel,
  prefix: string,
): Promise<string> {
  const repository = createImportedActivityRepository(kernel);
  const activityId = `${prefix}-activity`;
  const input = {
    requestId: `${prefix}-import`,
    requestSha256: await requestHash(`${prefix}-import`),
    activityId,
    expectedAggregateRevision: 0,
    confirmedLocalDate: "2026-08-17",
    staged: stagedGarminImport(prefix),
  };
  const first = await confirmGarminImportDate(repository, input);
  const replay = await confirmGarminImportDate(repository, input);
  invariant(
    first.kind === "imported" && replay.kind === "replayed",
    "phase13_import_replay_invalid",
  );
  return activityId;
}

async function setupActiveWorkout(kernel: SqliteKernel) {
  const plans = createPlansWorkoutRepository(kernel);
  const activation = await activateStarterPlan({
    fixture: parseFullBodyFoundation(fullBodyFoundationAsset),
    repository: plans,
    activatedAtMs: 1_786_853_600_000,
    startLocalDate: "2026-08-17",
    timezone: "Asia/Singapore",
  });
  const session = await startWorkout({
    repository: plans,
    request: {
      mode: "scheduled",
      planId: activation.plan.id,
      planDayId: activation.days[0]!.id,
      localDate: "2026-08-17",
      timezone: "Asia/Singapore",
      startedAtMs: 1_786_853_600_000,
    },
  });
  const workout = createWorkoutRepository(kernel);
  const view = await workout.getActiveWorkout(session.id);
  return { session, workout, view };
}

const caseAssertions: Record<
  MultiPlanRunningContractCaseId,
  (kernel: SqliteKernel) => Promise<void>
> = {
  async "phase13-migration-failure-cuts"(kernel) {
    const [row] = await kernel.queryAll<{ user_version: number }>("PRAGMA user_version");
    invariant(row?.user_version === migrations.at(-1)?.version, "phase13_migration_version_invalid");
  },
  async "phase13-map01-activation"(kernel) {
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE workout_sessions
         SET status = 'completed',
             completed_at_ms = COALESCE(completed_at_ms, started_at_ms),
             active_session_exercise_id = NULL,
             active_set_id = NULL
         WHERE status = 'in_progress'`,
      );
      await transaction.execute(
        "UPDATE plans SET is_active = 0 WHERE plan_kind = 'strength' AND is_active = 1",
      );
      await transaction.execute(
        `UPDATE owned_plan_schedules
         SET lifecycle = 'inactive',
             deactivated_at_ms = COALESCE(deactivated_at_ms, ?)
         WHERE plan_kind = 'strength' AND lifecycle = 'active'`,
        [PHASE13_NATIVE_EVENT_TIME_MS - 2],
      );
    });
    const running = await seedRunningFixture(kernel, "map01");
    await seedStrengthActivationFixture(kernel, "map01");
    const pairs = await kernel.queryAll<{ plan_kind: string; plan_id: string }>(
      "SELECT plan_kind, id AS plan_id FROM plans WHERE is_active = 1 ORDER BY plan_kind",
    );
    invariant(
      pairs.length === 2 && pairs[0]?.plan_kind === "running"
        && pairs[0]?.plan_id === running.planId && pairs[1]?.plan_kind === "strength",
      "phase13_map01_sport_pairs_invalid",
    );
  },
  async "phase13-running-two-slots"(kernel) {
    const plans = createRunningPlanRepository(kernel);
    await plans.createInactiveMinimum({
      planId: "slots-second-plan", planName: "Two slots", anchorDayId: "slots-second-day",
      scheduleId: "slots-second-schedule", scheduleVersionId: "slots-second-version",
      scheduleBindingId: "slots-second-binding", createdAtMs: 1, effectiveLocalDate: "2026-08-17",
      timezone: "Asia/Singapore", recoveryRevisionId: "slots-second-recovery",
      slots: [
        { id: "slots-second-a", weekday: "Monday", ordinal: 0, sessionRevisionId: "slots-second-recovery" },
        { id: "slots-second-b", weekday: "Monday", ordinal: 1, sessionRevisionId: "slots-second-recovery" },
      ],
    });
    await plans.activateMinimum({
      planId: "slots-second-plan",
      scheduleId: "slots-second-schedule",
      expectedPlanRevision: 1,
      expectedScheduleRevision: 1,
      activatedAtMs: 2,
    });
    const opportunities = await plans.materializeOccurrences({
      planId: "slots-second-plan",
      scheduleId: "slots-second-schedule",
      scheduleVersionId: "slots-second-version",
      localDate: "2026-08-17",
      timezone: "Asia/Singapore",
      createdAtMs: 3,
      occurrenceIds: ["slots-second-opportunity-a", "slots-second-opportunity-b"],
    });
    const [storedOpportunities, revisions] = await Promise.all([
      kernel.queryAll<{ id: string; slot_id: string }>(
        "SELECT id, slot_id FROM running_opportunities WHERE plan_id = ? ORDER BY id",
        ["slots-second-plan"],
      ),
      kernel.queryAll<{ id: string; ordinal: number; slot_root_id: string }>(
        `SELECT revision.id, revision.ordinal, revision.slot_root_id
         FROM running_session_slot_revisions revision
         JOIN running_session_slot_roots root ON root.id = revision.slot_root_id
         WHERE root.plan_id = ? AND revision.revision = 1
         ORDER BY revision.ordinal`,
        ["slots-second-plan"],
      ),
    ]);
    invariant(
      opportunities.length === 2
        && opportunities.map(({ id }) => id).join(",") === "slots-second-opportunity-a,slots-second-opportunity-b"
        && opportunities[0]?.ordinal === 0 && opportunities[1]?.ordinal === 1
        && new Set(opportunities.map(({ slotId }) => slotId)).size === 2
        && storedOpportunities.length === 2
        && new Set(storedOpportunities.map(({ id }) => id)).size === 2
        && new Set(storedOpportunities.map(({ slot_id }) => slot_id)).size === 2
        && revisions.length === 2 && revisions[0]?.ordinal === 0 && revisions[1]?.ordinal === 1
        && new Set(revisions.map(({ slot_root_id }) => slot_root_id)).size === 2,
      "phase13_running_two_slot_durable_facts_invalid",
    );
  },
  async "phase13-strength-completion-retry"(kernel) {
    const { session, workout, view } = await setupActiveWorkout(kernel);
    const set = view.currentExercise.workingSets[0]!;
    const input = { sessionId: session.id, setId: set.id, expectedSessionRevision: view.revision,
      expectedSetRevision: set.revision, completionIdempotencyKey: "phase13-native-complete",
      metricIdentity: set.metricIdentity, observation: { version: 1 as const, profile: "load_reps" as const,
        loadGrams: 60_000, reps: 8, source: "plan_default" as const }, completedAtMs: 1_786_853_605_000 };
    const first = await completeSet({ repository: workout, haptics: { committed: async () => undefined, cue: async () => undefined }, invalidate: async () => undefined, drainEffects: async () => undefined, input });
    const replay = await completeSet({ repository: workout, haptics: { committed: async () => undefined, cue: async () => undefined }, invalidate: async () => undefined, drainEffects: async () => undefined, input });
    invariant(first.outcome === "committed" && replay.outcome === "already_completed", "phase13_strength_retry_invalid");
  },
  async "phase13-import-normalized-identity"(kernel) {
    const activityId = await importGarminActivity(kernel, "identity");
    const rows = await kernel.queryAll<{ activity_id: string; removal_state: string }>(
      "SELECT activity_id, removal_state FROM imported_activity_identities WHERE activity_id = ?", [activityId],
    );
    invariant(rows.length === 1 && rows[0]?.removal_state === "active", "phase13_import_identity_invalid");
  },
  async "phase13-import-remove-restore"(kernel) {
    const activityId = await importGarminActivity(kernel, "lifecycle");
    const repository = createImportedActivityRepository(kernel);
    const remove = {
      operation: "remove" as const,
      requestId: "lifecycle-remove",
      requestSha256: await requestHash("lifecycle-remove"),
      activityId,
      expectedAggregateRevision: 1,
      occurredAtMs: PHASE13_NATIVE_EVENT_TIME_MS,
      reason: "owner_request",
    };
    const removed = await changeGarminActivityLifecycle(repository, remove);
    const replay = await changeGarminActivityLifecycle(repository, remove);
    const restoreRequestSha256 = await requestHash("lifecycle-restore");
    const restored = await changeGarminActivityLifecycle(repository, {
      ...remove,
      operation: "restore",
      requestId: "lifecycle-restore",
      requestSha256: restoreRequestSha256,
      occurredAtMs: PHASE13_NATIVE_EVENT_TIME_MS + 1,
    });
    const [lifecycle, events, receipts] = await Promise.all([
      kernel.queryAll<{ removal_state: string }>(
        "SELECT removal_state FROM imported_activity_current_lifecycle WHERE activity_id = ?",
        [activityId],
      ),
      kernel.queryAll<{ event_type: string }>(
        `SELECT event_type FROM imported_activity_events
         WHERE activity_id = ? AND event_type IN ('removed', 'restored')
         ORDER BY created_at_ms, id`,
        [activityId],
      ),
      kernel.queryAll<{ id: string; request_sha256: string }>(
        "SELECT id, request_sha256 FROM imported_activity_receipts WHERE activity_id = ? ORDER BY id",
        [activityId],
      ),
    ]);
    invariant(
      removed.kind === "removed" && replay.kind === "removed" && restored.kind === "replayed"
        && lifecycle[0]?.removal_state === "active"
        && events.length === 2 && events[0]?.event_type === "removed" && events[1]?.event_type === "restored"
        && receipts.length === 3
        && new Set(receipts.map(({ id }) => id)).size === 3
        && new Set(receipts.map(({ request_sha256 }) => request_sha256)).size === 3
        && receipts.some(({ request_sha256 }) => request_sha256 === remove.requestSha256)
        && receipts.some(({ request_sha256 }) => request_sha256 === restoreRequestSha256),
      "phase13_remove_restore_durable_facts_invalid",
    );
  },
  async "phase13-match-invalidation"(kernel) {
    const running = await seedRunningFixture(kernel, "match");
    const activityId = await importGarminActivity(kernel, "match");
    const repository = createRunningActivityMatchRepository(kernel);
    const input = { requestId: "match-command", requestSha256: await requestHash("match-command"), action: "match" as const, activityId,
      expectedActivityRevision: 1, opportunityId: running.opportunityId, expectedOpportunityRevision: 1,
      expectedRelationRevision: 0, scheduleId: running.scheduleId, scheduleVersionId: running.scheduleVersionId,
      slotId: running.slotId, sessionRevisionId: running.sessionRevisionId,
      occurredAtMs: PHASE13_NATIVE_EVENT_TIME_MS - 1 };
    const matched = await confirmRunningActivityMatch(repository, input);
    const replay = await confirmRunningActivityMatch(repository, input);
    const activities = createImportedActivityRepository(kernel);
    const removal = await changeGarminActivityLifecycle(activities, {
      operation: "remove", requestId: "match-remove", requestSha256: await requestHash("match-remove"),
      activityId, expectedAggregateRevision: 1, occurredAtMs: PHASE13_NATIVE_EVENT_TIME_MS, reason: "owner_request",
    });
    const [currentAfterRemoval, invalidatedEvents, invalidations, removalReceipts] = await Promise.all([
      kernel.queryAll<{ activity_id: string }>(
        "SELECT activity_id FROM running_activity_current_matches WHERE activity_id = ?", [activityId],
      ),
      kernel.queryAll<{ action: string }>(
        "SELECT action FROM running_activity_match_events WHERE activity_id = ? AND action = 'invalidated'", [activityId],
      ),
      kernel.queryAll<{ id: string }>(
        "SELECT id FROM imported_activity_match_invalidations WHERE activity_id = ?", [activityId],
      ),
      kernel.queryAll<{ id: string }>(
        "SELECT id FROM imported_activity_receipts WHERE id = 'match-remove' AND activity_id = ?", [activityId],
      ),
    ]);
    const restored = await changeGarminActivityLifecycle(activities, {
      operation: "restore", requestId: "match-restore", requestSha256: await requestHash("match-restore"),
      activityId, expectedAggregateRevision: 1, occurredAtMs: PHASE13_NATIVE_EVENT_TIME_MS + 1, reason: "owner_request",
    });
    const unmatchedAfterRestore = await kernel.queryAll<{ activity_id: string }>(
      "SELECT activity_id FROM running_activity_current_matches WHERE activity_id = ?", [activityId],
    );
    const rematched = await confirmRunningActivityMatch(repository, {
      ...input,
      requestId: "match-command-after-restore",
      requestSha256: await requestHash("match-command-after-restore"),
      occurredAtMs: PHASE13_NATIVE_EVENT_TIME_MS + 2,
    });
    invariant(
      matched.kind === "matched" && replay.kind === "replayed" && removal.kind === "removed"
        && currentAfterRemoval.length === 0 && invalidatedEvents.length === 1
        && invalidations.length === 1 && removalReceipts.length === 1
        && restored.kind === "replayed" && unmatchedAfterRestore.length === 0
        && rematched.kind === "matched",
      "phase13_match_invalidation_durable_facts_invalid",
    );
  },
  async "phase13-stale-replay-no-resurrection"(kernel) {
    const activityId = await importGarminActivity(kernel, "stale");
    const repository = createImportedActivityRepository(kernel);
    await changeGarminActivityLifecycle(repository, { operation: "remove", requestId: "stale-remove", requestSha256: await requestHash("stale-remove"), activityId, expectedAggregateRevision: 1, occurredAtMs: PHASE13_NATIVE_EVENT_TIME_MS, reason: "owner_request" });
    const stale = await confirmGarminImportDate(repository, { requestId: "stale-import", requestSha256: await requestHash("stale-import"), activityId: "stale-other", expectedAggregateRevision: 0, confirmedLocalDate: "2026-08-17", staged: stagedGarminImport("stale") });
    invariant(stale.kind === "removed" && stale.activityId === activityId, "phase13_stale_replay_resurrected");
  },
  async "phase13-bodyweight-correction-delete"(kernel) {
    const repository = createBodyweightRepository(kernel);
    const create = { operation: "create" as const, requestId: "bodyweight-create", entryId: "bodyweight-entry", ownerId: "owner", expectedRevision: 0, revisionId: "bodyweight-r1", eventId: "bodyweight-e1", occurredAtMs: 1, localDate: "2026-08-17", timezone: "Asia/Singapore", grams: 75_000 };
    const created = await repository.commit({
      ...create,
      requestSha256: await runtimeSha256(canonicalBodyweightRequestPayload(create)),
    });
    const deleteCommand = { operation: "delete" as const, requestId: "bodyweight-delete", entryId: create.entryId, ownerId: create.ownerId, expectedRevision: 1, revisionId: "bodyweight-r2", eventId: "bodyweight-e2", occurredAtMs: 2 };
    const deleteInput = {
      ...deleteCommand,
      requestSha256: await runtimeSha256(canonicalBodyweightRequestPayload(deleteCommand)),
    };
    const deleted = await repository.commit(deleteInput);
    const replay = await repository.commit(deleteInput);
    invariant(created.kind === "created" && deleted.kind === "deleted" && replay.kind === "deleted" && (await repository.history(create.ownerId))[0]?.lifecycle === "deleted", "phase13_bodyweight_history_invalid");
  },
  async "phase13-backup-clean-restore"(kernel) {
    const bodyweight = createBodyweightRepository(kernel);
    const command = { operation: "create" as const, requestId: "backup-bodyweight-create", entryId: "backup-bodyweight-entry", ownerId: "backup-owner", expectedRevision: 0, revisionId: "backup-bodyweight-r1", eventId: "backup-bodyweight-e1", occurredAtMs: 5, localDate: "2026-08-17", timezone: "Asia/Singapore", grams: 75_000 };
    await bodyweight.commit({
      ...command,
      requestSha256: await runtimeSha256(canonicalBodyweightRequestPayload(command)),
    });
    const snapshot = await createLogicalBackupRepository(kernel).collect({ snapshotId: "phase13-native-backup", createdAtMs: 5 });
    const divergent = { operation: "create" as const, requestId: "backup-bodyweight-divergent", entryId: "backup-bodyweight-divergent", ownerId: "backup-owner", expectedRevision: 0, revisionId: "backup-bodyweight-r2", eventId: "backup-bodyweight-e2", occurredAtMs: 6, localDate: "2026-08-18", timezone: "Asia/Singapore", grams: 76_000 };
    await bodyweight.commit({
      ...divergent,
      requestSha256: await runtimeSha256(canonicalBodyweightRequestPayload(divergent)),
    });
    const running = await seedRunningFixture(kernel, "backup-projection");
    const activityId = await importGarminActivity(kernel, "backup-projection");
    await confirmRunningActivityMatch(createRunningActivityMatchRepository(kernel), {
      requestId: "backup-projection-match", requestSha256: await requestHash("backup-projection-match"), action: "match", activityId,
      expectedActivityRevision: 1, opportunityId: running.opportunityId, expectedOpportunityRevision: 1,
      expectedRelationRevision: 0, scheduleId: running.scheduleId, scheduleVersionId: running.scheduleVersionId,
      slotId: running.slotId, sessionRevisionId: running.sessionRevisionId,
      occurredAtMs: PHASE13_NATIVE_EVENT_TIME_MS,
    });
    const restored = await createLogicalRestoreRepository(kernel, { nowMs: () => 8 }).restore(snapshot);
    const restoredSnapshot = await createLogicalBackupRepository(kernel).collect({ snapshotId: "phase13-native-backup-restored", createdAtMs: 9 });
    const [history, divergentRows, projections, graph] = await Promise.all([
      bodyweight.history(command.ownerId),
      kernel.queryAll<{ id: string }>("SELECT id FROM bodyweight_entries WHERE id = ?", [divergent.entryId]),
      kernel.queryAll<{ activity_id: string }>("SELECT activity_id FROM running_activity_current_matches"),
      kernel.queryAll<{ entries: number; events: number; receipts: number }>(
        `SELECT
           (SELECT COUNT(*) FROM bodyweight_entries WHERE id = ?) AS entries,
           (SELECT COUNT(*) FROM bodyweight_entry_events WHERE entry_id = ?) AS events,
           (SELECT COUNT(*) FROM bodyweight_command_receipts WHERE entry_id = ?) AS receipts`,
        [command.entryId, command.entryId, command.entryId],
      ),
    ]);
    const fault = { operation: "create" as const, requestId: "backup-bodyweight-fault", entryId: "backup-bodyweight-fault", ownerId: "backup-owner", expectedRevision: 0, revisionId: "backup-bodyweight-r3", eventId: "backup-bodyweight-e3", occurredAtMs: 10, localDate: "2026-08-19", timezone: "Asia/Singapore", grams: 77_000 };
    await bodyweight.commit({
      ...fault,
      requestSha256: await runtimeSha256(canonicalBodyweightRequestPayload(fault)),
    });
    const priorToFault = await createLogicalBackupRepository(kernel).collect({ snapshotId: "phase13-native-fault-prior", createdAtMs: 10 });
    let faultObserved = false;
    try {
      await createLogicalRestoreRepository(kernel, {
        nowMs: () => 11,
        async faultAfter(stage) {
          if (stage === "verified") throw new Error("phase13_restore_fault");
        },
      }).restore(snapshot);
    } catch {
      faultObserved = true;
    }
    const afterFault = await createLogicalBackupRepository(kernel).collect({ snapshotId: "phase13-native-fault-after", createdAtMs: 11 });
    invariant(
      restored.state === "rebuild_pending"
        && JSON.stringify(restoredSnapshot.tables) === JSON.stringify(snapshot.tables)
        && history.length === 1 && history[0]?.entryId === command.entryId
        && divergentRows.length === 0 && projections.length === 0
        && graph[0]?.entries === 1 && graph[0]?.events === 1 && graph[0]?.receipts === 1
        && faultObserved && JSON.stringify(afterFault.tables) === JSON.stringify(priorToFault.tables),
      "phase13_backup_restore_replacement_invalid",
    );
  },
  async "phase13-merge-rebuild"(kernel) {
    void kernel;
    const result = await runPortableMergeContract(await createExpoPortableMergeContractAdapter("phase13-merge-rebuild"));
    invariant(result.status === "passed" && result.failed === 0, "phase13_merge_rebuild_invalid");
  },
  async "phase13-source-generation-neutrality"(kernel) {
    const [before] = await kernel.queryAll<{ mutation_generation: number }>(
      "SELECT mutation_generation FROM automatic_backup_state WHERE id = 1",
    );
    await importGarminActivity(kernel, "generation");
    const [after] = await kernel.queryAll<{ mutation_generation: number }>(
      "SELECT mutation_generation FROM automatic_backup_state WHERE id = 1",
    );
    invariant((after?.mutation_generation ?? 0) > (before?.mutation_generation ?? 0), "phase13_source_generation_missing");
  },
  async "phase13-tim01-retirement"(kernel) {
    const { session, view } = await setupActiveWorkout(kernel);
    const set = view.currentExercise.workingSets[0]!;
    await updateSessionSetAdvancedTiming({ repository: createAdvancedTimingRepository(kernel), input: {
      sessionId: session.id, sessionSetId: set.id, expectedSessionRevision: view.revision,
      expectedSetRevision: set.revision, override: { version: 1, mode: "per_rep", intervalMs: 1_000, cueChannels: "audio" }, nowMs: 6,
    } });
    const [row] = await kernel.queryAll<{ advanced_timing_override_json: string | null; advanced_timing_resolved_json: string }>(
      "SELECT advanced_timing_override_json, advanced_timing_resolved_json FROM session_sets WHERE id = ?", [set.id],
    );
    invariant(row?.advanced_timing_override_json === null && row.advanced_timing_resolved_json === '{"version":1,"mode":"off"}', "phase13_tim01_retirement_invalid");
  },
};

export function runMultiPlanRunningContractCase(
  caseId: MultiPlanRunningContractCaseId,
  kernel: SqliteKernel,
): Promise<void> {
  return caseAssertions[caseId](kernel);
}

export async function createExpoMultiPlanRunningContractAdapter(
  runId: string,
): Promise<MultiPlanRunningContractAdapter> {
  const base = await createExpoMigrationsEffectsContractAdapter(
    `multi-plan-running-${runId}`,
  );
  const adapter: MultiPlanRunningContractAdapter = {
    runCase: (caseId: MultiPlanRunningContractCaseId) =>
      caseId === "phase13-migration-failure-cuts"
        ? runMigrationFailureCuts(base, caseId)
        : withFreshExpoRuntime(
            base,
            caseId,
            (kernel) => runMultiPlanRunningContractCase(caseId, kernel),
          ),
    ...(base.cleanup === undefined ? {} : { cleanup: base.cleanup }),
  };
  return Object.freeze(adapter);
}

export async function runMultiPlanRunningContract(
  runIdOrAdapter: string | MultiPlanRunningContractAdapter,
): Promise<MultiPlanRunningContractResult> {
  const startedAt = new Date().toISOString();
  const adapter = typeof runIdOrAdapter === "string"
    ? await createExpoMultiPlanRunningContractAdapter(runIdOrAdapter)
    : runIdOrAdapter;
  const cases: MultiPlanRunningContractResult["cases"][number][] = [];
  try {
    for (const id of MULTI_PLAN_RUNNING_CONTRACT_CASES) {
      const startedMs = Date.now();
      try {
        await adapter.runCase(id);
        cases.push(Object.freeze({ id, status: "passed", durationMs: Date.now() - startedMs }));
      } catch (error) {
        cases.push(Object.freeze({ id, status: "failed", durationMs: Date.now() - startedMs, errorCode: safeErrorCode(error) }));
      }
    }
  } finally {
    await adapter.cleanup?.();
  }
  const passed = cases.filter((value) => value.status === "passed").length;
  return Object.freeze({
    schemaVersion: 1, contractVersion: 1, status: passed === cases.length ? "passed" : "failed",
    total: cases.length, passed, failed: cases.length - passed, skipped: 0, cases,
    startedAt, finishedAt: new Date().toISOString(),
  });
}

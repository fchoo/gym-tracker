import {
  createLibrarySectionPreferencePort,
} from "../../bootstrap/workoutAppRuntime";
import {
  createWorkoutLifecycle,
} from "../../bootstrap/workoutLifecycle";
import {
  archiveCustomExercise,
  createCustomCopy,
  createCustomExercise,
  previewCustomExerciseArchive,
  restoreCustomExercise,
  setExerciseHidden,
} from "../../domains/library/customExerciseCommands";
import {
  archiveOwnedPlan,
  createOwnedPlanDraft,
  duplicateOwnedPlan,
  restoreOwnedPlan,
  saveOwnedPlan,
  type OwnedPlanDraftInput,
} from "../../domains/plans/ownedPlanCommands";
import {
  startWorkout,
} from "../../domains/workout/startWorkout";
import {
  previewDayRemoval,
  previewExerciseReplacement,
  replacePlanExercise,
} from "../../domains/plans/planImpactCommands";
import {
  expireRestWithForegroundFeedback,
  startManualRest,
  type RestAlertPreferences,
  type RestNotificationPort,
} from "../../domains/rest";
import {
  addWarmup,
  addWorkingSet,
  completeSet,
  copyPreviousWarmup,
  reviseCompletedSet,
} from "../../domains/workout/setCommands";
import {
  createRestNotificationReconciler,
} from "../../platform/notifications/restNotificationReconciler";
import {
  DEFAULT_REST_ALERT_PREFERENCES,
  REST_ALERT_PREFERENCE_KEY,
  createSqliteRestAlertPreferenceStore,
} from "../../platform/preferences/restAlertPreferenceStore";
import {
  createForegroundRestFeedbackStore,
} from "../../platform/sqlite/foregroundRestFeedbackStore";
import {
  createMigrationRunner,
} from "../../platform/sqlite/migrationRunner";
import {
  migrations,
} from "../../platform/sqlite/migrations";
import type {
  RecoveryBackupPort,
} from "../../platform/sqlite/recoveryBackup";
import {
  createContentRepository,
} from "../../platform/sqlite/repositories/contentRepository";
import {
  createCustomExerciseRepository,
} from "../../platform/sqlite/repositories/customExerciseRepository";
import {
  openExerciseSearchFtsContractRuntime,
} from "../../platform/sqlite/repositories/exerciseSearchIndexRepository";
import {
  createOwnedPlanRepository,
  type OwnedPlanCommittedResult,
  type OwnedPlanRepositoryResult,
} from "../../platform/sqlite/repositories/ownedPlanRepository";
import {
  createPlanImpactRepository,
} from "../../platform/sqlite/repositories/planImpactRepository";
import {
  createPlansWorkoutRepository,
} from "../../platform/sqlite/repositories/plansWorkoutRepository";
import {
  createRestRepository,
} from "../../platform/sqlite/repositories/restRepository";
import {
  createWorkoutRepository,
} from "../../platform/sqlite/repositories/workoutRepository";
import type {
  SqliteKernel,
} from "../../platform/sqlite/sqliteKernel";
import {
  parseAcceptedPhase2Catalog,
  type Phase2ContractRequirement,
} from "./phase2Content.contract";

export const PHASE2_PLAN_CONTRACT_VERSION = 1 as const;

export const PHASE2_PLAN_CASE_IDS = [
  "plan-library-section-preference",
  "plan-custom-lifecycle",
  "plan-owned-aggregate-lifecycle",
  "plan-impact-previews",
  "plan-impact-stale-rollback",
  "plan-latest-schema-add-warmup",
  "plan-latest-schema-copy-warmup",
  "plan-latest-schema-add-working-set",
  "plan-active-completed-set-revision",
  "plan-rest-alert-preference-persistence",
  "plan-notification-failure-non-authority",
  "plan-foreground-feedback-attempt-once",
] as const;

export type Phase2PlanContractCaseId =
  (typeof PHASE2_PLAN_CASE_IDS)[number];

type Phase2PlanRemediationCaseId =
  | "RC-02-ACTIVE-CORRECTION"
  | "RC-02-ALERT-BG-DELIVERY-NONAUTH"
  | "RC-02-ALERT-FG-ATTEMPT-ONCE"
  | "RC-02-ALERT-PREFERENCES-CHANNEL-NONAUTH"
  | "RC-02-LATEST-SCHEMA-ADD-COPY";

type Phase2PlanCaseMetadata = Readonly<{
  id: Phase2PlanContractCaseId;
  category: string;
  edgeIds: readonly `E-${string}`[];
  sourceTest: string;
}> & (
  | Readonly<{
    requirement: Phase2ContractRequirement;
  }>
  | Readonly<{
    remediationCaseId: Phase2PlanRemediationCaseId;
    decisionIds: readonly `D-${string}`[];
    gapIds: readonly `G-${string}`[];
    applicableRequirementIds: readonly Phase2ContractRequirement[];
  }>
);

export const PHASE2_PLAN_CASE_METADATA = [
  {
    id: "plan-library-section-preference",
    requirement: "LIB-03",
    category: "library-preference",
    edgeIds: ["E-01", "E-02", "E-03", "E-04", "E-05"],
    sourceTest: "src/ui/__tests__/LibraryScreen.test.tsx#Library section preference authority",
  },
  {
    id: "plan-custom-lifecycle",
    requirement: "LIB-05",
    category: "custom-exercise",
    edgeIds: ["E-28", "E-29", "E-30", "E-31", "E-32", "E-33"],
    sourceTest: "tests/integration/custom-exercise.test.ts#custom exercise create edit hide copy archive and restore lifecycle",
  },
  {
    id: "plan-owned-aggregate-lifecycle",
    requirement: "LIB-08",
    category: "owned-plan",
    edgeIds: ["E-47", "E-48", "E-49", "E-50", "E-51", "E-52"],
    sourceTest: "tests/integration/owned-plan-crud.test.ts#owned-plan CRUD repository",
  },
  {
    id: "plan-impact-previews",
    requirement: "LIB-08",
    category: "plan-impact",
    edgeIds: ["E-47", "E-50"],
    sourceTest: "tests/integration/plan-impact-replacement.test.ts#plan impact day removal and exercise replacement",
  },
  {
    id: "plan-impact-stale-rollback",
    requirement: "LIB-05",
    category: "replacement-rollback",
    edgeIds: ["E-51", "E-52"],
    sourceTest: "tests/integration/plan-impact-replacement.test.ts#rejects incomplete stale incompatible and failed replacements without writes",
  },
  {
    id: "plan-latest-schema-add-warmup",
    remediationCaseId: "RC-02-LATEST-SCHEMA-ADD-COPY",
    decisionIds: ["D-64"],
    gapIds: ["G-02-05"],
    applicableRequirementIds: ["LIB-12"],
    category: "remediation-latest-schema-add-warmup",
    edgeIds: ["E-64"],
    sourceTest: "tests/integration/complete-set.test.ts#Plan 01-08 warm-up commands",
  },
  {
    id: "plan-latest-schema-copy-warmup",
    remediationCaseId: "RC-02-LATEST-SCHEMA-ADD-COPY",
    decisionIds: ["D-64"],
    gapIds: ["G-02-05"],
    applicableRequirementIds: ["LIB-12"],
    category: "remediation-latest-schema-copy-warmup",
    edgeIds: ["E-64"],
    sourceTest: "tests/integration/complete-set.test.ts#Plan 01-08 warm-up commands",
  },
  {
    id: "plan-latest-schema-add-working-set",
    remediationCaseId: "RC-02-LATEST-SCHEMA-ADD-COPY",
    decisionIds: ["D-64"],
    gapIds: ["G-02-05"],
    applicableRequirementIds: ["LIB-12"],
    category: "remediation-latest-schema-add-working-set",
    edgeIds: ["E-64"],
    sourceTest: "tests/integration/complete-set.test.ts#Plan 01-10 working-set structure commands",
  },
  {
    id: "plan-active-completed-set-revision",
    remediationCaseId: "RC-02-ACTIVE-CORRECTION",
    decisionIds: ["D-63"],
    gapIds: ["G-02-08"],
    applicableRequirementIds: ["LIB-12"],
    category: "remediation-active-completed-set-revision",
    edgeIds: ["E-75"],
    sourceTest: "tests/integration/complete-set.test.ts#Plan 02-27 completed working-set correction",
  },
  {
    id: "plan-rest-alert-preference-persistence",
    remediationCaseId: "RC-02-ALERT-PREFERENCES-CHANNEL-NONAUTH",
    decisionIds: ["D-61"],
    gapIds: ["G-02-07"],
    applicableRequirementIds: [],
    category: "remediation-rest-alert-preference-persistence",
    edgeIds: ["E-58"],
    sourceTest: "src/platform/preferences/restAlertPreferenceStore.test.ts#SQLite rest-alert preference store",
  },
  {
    id: "plan-notification-failure-non-authority",
    remediationCaseId: "RC-02-ALERT-BG-DELIVERY-NONAUTH",
    decisionIds: ["D-61"],
    gapIds: ["G-02-07"],
    applicableRequirementIds: [],
    category: "remediation-notification-failure-non-authority",
    edgeIds: ["E-59"],
    sourceTest: "src/platform/notifications/restNotificationReconciler.test.ts#Plan 01-09 rest notification reconciliation",
  },
  {
    id: "plan-foreground-feedback-attempt-once",
    remediationCaseId: "RC-02-ALERT-FG-ATTEMPT-ONCE",
    decisionIds: ["D-61"],
    gapIds: ["G-02-07"],
    applicableRequirementIds: [],
    category: "remediation-foreground-feedback-attempt-once",
    edgeIds: ["E-60"],
    sourceTest: "tests/sqlite-host/foreground-rest-feedback.test.ts#foreground rest feedback attempts",
  },
] as const satisfies readonly Phase2PlanCaseMetadata[];

export type Phase2PlanContractRuntime = Readonly<{
  kernel: SqliteKernel;
  preferenceStorage?: Phase2PlanPreferenceStorage;
  close(): Promise<void>;
}>;

export type Phase2PlanPreferenceStorage = Readonly<{
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
  removeItemSync?(key: string): boolean;
}>;

export interface Phase2PlanContractAdapter {
  onCaseStart?(caseId: Phase2PlanContractCaseId): void;
  createRuntime(
    caseId: Phase2PlanContractCaseId,
  ): Promise<Phase2PlanContractRuntime>;
  sha256(value: string): Promise<string>;
}

export type Phase2PlanContractCaseResult = Readonly<{
  id: Phase2PlanContractCaseId;
  status: "passed" | "failed";
  durationMs: number;
  errorCode?: string;
}>;

export type Phase2PlanContractResult = Readonly<{
  schemaVersion: 1;
  contractVersion: typeof PHASE2_PLAN_CONTRACT_VERSION;
  status: "passed" | "failed";
  total: number;
  passed: number;
  failed: number;
  skipped: 0;
  cases: readonly Phase2PlanContractCaseResult[];
  startedAt: string;
  finishedAt: string;
}>;

type ContractCase = (
  runtime: Phase2PlanContractRuntime,
  adapter: Phase2PlanContractAdapter,
) => Promise<void>;

function invariant(value: unknown, code: string): asserts value {
  if (!value) {
    throw new Error(code);
  }
}

function safeErrorCode(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
  ) {
    return error.code.slice(0, 80);
  }
  if (error instanceof Error && /^[a-z0-9_:-]{3,80}$/iu.test(error.message)) {
    return error.message;
  }
  return "phase2_plan_contract_failed";
}

const recoveryBackup: RecoveryBackupPort = {
  async createAndValidate(request) {
    return {
      backupId: `phase2-plan-${request.fromVersion}-${request.toVersion}`,
      databaseName: request.databaseName,
      fromVersion: request.fromVersion,
      toVersion: request.toVersion,
      validated: true,
    };
  },
};

async function prepareRuntime(
  kernel: SqliteKernel,
  adapter: Phase2PlanContractAdapter,
) {
  await createMigrationRunner({
    databaseName: "phase2-plan.db",
    kernel,
    migrations,
    recoveryBackup,
  }).run();
  const catalog = await parseAcceptedPhase2Catalog(adapter.sha256);
  await createContentRepository(kernel).importAcceptedCatalog({
    catalog,
    expectedInstalled: null,
  });
  const bundled = catalog.exercises.find(({ metricIdentity, source }) =>
    metricIdentity.profile === "load_reps"
    && source.upstreamId !== null
  );
  invariant(bundled !== undefined, "phase2_plan_bundled_source_missing");
  const [projection] = await kernel.queryAll<{
    id: string;
    origin: string;
    source_namespace: string;
    upstream_id: string;
    name: string;
    metric_profile: string;
    metric_contract_version: number;
    exercise_metric_generation: number;
    equipment: string;
    default_rest_seconds: number;
    revision: number;
  }>(
    `SELECT id, origin, source_namespace, upstream_id, name, metric_profile,
            metric_contract_version, exercise_metric_generation, equipment,
            default_rest_seconds, revision
     FROM exercises
     WHERE id = ?`,
    [bundled.id],
  );
  invariant(
    projection?.origin === "bundled"
    && projection.source_namespace === bundled.source.namespace
    && projection.upstream_id === (bundled.source.upstreamId ?? bundled.id)
    && projection.name === bundled.canonicalName
    && projection.metric_profile === bundled.metricIdentity.profile
    && projection.metric_contract_version
      === bundled.metricIdentity.contractVersion
    && projection.exercise_metric_generation
      === bundled.metricIdentity.exerciseMetricGeneration
    && projection.equipment
      === (bundled.equipment.join(", ") || "Unspecified")
    && projection.default_rest_seconds === 90
    && projection.revision === catalog.metadata.revision,
    "phase2_plan_workout_projection_missing",
  );
  return { catalog, bundled };
}

type ContractSessionSetRow = Readonly<{
  id: string;
  session_exercise_id: string;
  set_kind: "warmup" | "working";
  ordinal: number;
  source_plan_working_set_target_id: string | null;
  source_owned_plan_working_set_target_id: string | null;
  target_load_grams: number;
  target_min_reps: number;
  target_max_reps: number;
  target_json: string;
  unit_json: string;
  rule_type: string;
  rule_version: number;
  metric_profile: string;
  metric_contract_version: number;
  exercise_metric_generation: number;
  observed_load_grams: number | null;
  observed_reps: number | null;
  observed_json: string | null;
  status: string;
  draft_updated_at_ms: number | null;
  completed_at_ms: number | null;
  completion_idempotency_key: string | null;
  revision: number;
}>;

const CONTRACT_SET_PROJECTION = `
  ss.id, ss.session_exercise_id, ss.set_kind, ss.ordinal,
  ss.source_plan_working_set_target_id,
  ss.source_owned_plan_working_set_target_id,
  ss.target_load_grams, ss.target_min_reps, ss.target_max_reps,
  ss.target_json, ss.unit_json, ss.rule_type, ss.rule_version,
  ss.metric_profile, ss.metric_contract_version,
  ss.exercise_metric_generation, ss.observed_load_grams,
  ss.observed_reps, ss.observed_json, ss.status,
  ss.draft_updated_at_ms, ss.completed_at_ms,
  ss.completion_idempotency_key, ss.revision
` as const;

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function rejectsWithCode(
  operation: () => Promise<unknown>,
  expectedCode: string,
): Promise<boolean> {
  try {
    await operation();
    return false;
  } catch (error) {
    return safeErrorCode(error) === expectedCode;
  }
}

async function readContractSet(
  kernel: SqliteKernel,
  setId: string,
): Promise<ContractSessionSetRow> {
  const rows = await kernel.queryAll<ContractSessionSetRow>(
    `SELECT ${CONTRACT_SET_PROJECTION}
     FROM session_sets ss
     WHERE ss.id = ?`,
    [setId],
  );
  invariant(rows.length === 1, "phase2_plan_contract_set_missing");
  return rows[0]!;
}

async function prepareActiveWorkout(
  kernel: SqliteKernel,
  adapter: Phase2PlanContractAdapter,
) {
  const { bundled } = await prepareRuntime(kernel, adapter);
  const { saved } = await createAndSaveOwnedPlan(
    kernel,
    adapter,
    bundled.id,
    { id: "phase2-contract-active-plan" },
  );
  const planDay = saved.plan.days[0];
  invariant(planDay !== undefined, "phase2_plan_active_day_missing");
  const session = await startWorkout({
    repository: createPlansWorkoutRepository(kernel),
    request: {
      mode: "scheduled",
      planId: saved.plan.id,
      planDayId: planDay.id,
      localDate: "2026-08-23",
      timezone: "Asia/Singapore",
      startedAtMs: 1_787_000_020_000,
    },
  });
  const repository = createWorkoutRepository(kernel);
  const restRepository = createRestRepository(kernel);
  const view = await repository.getActiveWorkout(session.id);
  const [schema] = await kernel.queryAll<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const latestMigration = migrations.at(-1);
  invariant(
    schema !== undefined
    && latestMigration !== undefined
    && schema.user_version === latestMigration.version
    && schema.user_version >= 12
    && view.id === session.id
    && view.status === "in_progress",
    "phase2_plan_current_schema_fixture_invalid",
  );
  return { repository, restRepository, sessionId: session.id, view };
}

function committed(
  result: OwnedPlanRepositoryResult,
): OwnedPlanCommittedResult {
  invariant(
    result.outcome !== "requires_schedule_impact",
    "phase2_plan_unexpected_impact",
  );
  return result;
}

function planDraft(
  exerciseId: string,
  input: Readonly<{
    id?: string;
    name?: string;
    dayCount?: 1 | 2;
  }> = {},
): OwnedPlanDraftInput {
  const planId = input.id ?? "phase2-owned-plan";
  const dayCount = input.dayCount ?? 1;
  return {
    id: planId,
    name: input.name ?? "力量 Owner Plan",
    days: Array.from({ length: dayCount }, (_, dayOrdinal) => ({
      id: `${planId}-day-${dayOrdinal}`,
      name: dayOrdinal === 0 ? "Strength Día α" : "Power Día β",
      ordinal: dayOrdinal,
      occurrences: [{
        id: `${planId}-occurrence-${dayOrdinal}`,
        exerciseId,
        ordinal: 0,
        restSeconds: 90 + dayOrdinal * 30,
        metricIdentity: {
          profile: "load_reps",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
        warmups: [{
          id: `${planId}-warmup-${dayOrdinal}`,
          ordinal: 0,
          loadGrams: 10_000,
          reps: 5,
        }],
        targets: [
          {
            id: `${planId}-target-${dayOrdinal}-a`,
            ordinal: 0,
            target: {
              version: 1,
              profile: "load_reps",
              loadGrams: 20_000 + dayOrdinal * 5_000,
              minReps: 8,
              maxReps: 12,
              incrementGrams: 2_500,
              perSide: false,
            },
            units: {
              version: 1,
              load: "grams",
              count: "repetitions",
            },
          },
          {
            id: `${planId}-target-${dayOrdinal}-b`,
            ordinal: 1,
            target: {
              version: 1,
              profile: "load_reps",
              loadGrams: 20_000 + dayOrdinal * 5_000,
              minReps: 8,
              maxReps: 12,
              incrementGrams: 2_500,
              perSide: false,
            },
            units: {
              version: 1,
              load: "grams",
              count: "repetitions",
            },
          },
        ],
        policy: {
          id: `${planId}-policy-${dayOrdinal}`,
          kind: "manual_hold",
          policyId: "manual-hold-v1",
          version: 1,
          rule: {
            kind: "manual_hold",
            id: "manual-hold-v1",
            version: 1,
          },
        },
      }],
    })),
  };
}

async function createAndSaveOwnedPlan(
  kernel: SqliteKernel,
  adapter: Phase2PlanContractAdapter,
  exerciseId: string,
  input: Readonly<{
    id?: string;
    name?: string;
    dayCount?: 1 | 2;
  }> = {},
) {
  const plan = planDraft(exerciseId, input);
  const repository = createOwnedPlanRepository(kernel);
  const created = committed(await createOwnedPlanDraft({
    repository,
    invalidate: async () => undefined,
    sha256: adapter.sha256,
    input: {
      requestId: `${plan.id}-create`,
      planId: plan.id,
      name: plan.name,
      dayId: plan.days[0]!.id,
      dayName: plan.days[0]!.name,
      createdAtMs: 1_787_000_000_000,
    },
  }));
  const saved = committed(await saveOwnedPlan({
    repository,
    invalidate: async () => undefined,
    sha256: adapter.sha256,
    input: {
      requestId: `${plan.id}-save`,
      expectedRevision: created.plan.revision,
      savedAtMs: 1_787_000_001_000,
      plan,
    },
  }));
  return { plan, repository, saved };
}

async function seedReplacementExercise(
  kernel: SqliteKernel,
  input: Readonly<{
    id: string;
    name: string;
    profile: "load_reps" | "bodyweight_reps";
  }>,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO exercises
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         metric_profile, metric_contract_version, exercise_metric_generation,
         equipment, default_rest_seconds, revision)
       VALUES (?, NULL, 'custom', NULL, NULL, ?, ?, 1, 1,
               'Owner equipment', 90, 1)`,
      [input.id, input.name, input.profile],
    );
    await transaction.execute(
      `INSERT INTO exercise_library_entries
        (exercise_id, origin, canonical_name, exercise_type, movement_class,
         metric_profile, metric_contract_version, exercise_metric_generation,
         availability, revision)
       VALUES (?, 'custom', ?, 'strength', 'compound', ?, 1, 1,
               'available', 1)`,
      [input.id, input.name, input.profile],
    );
  });
}

async function seedImpactScheduleAndHistory(
  kernel: SqliteKernel,
  planId: string,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `UPDATE plans SET is_active = 1 WHERE id = ?`,
      [planId],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_schedules
        (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms)
       VALUES (?, ?, 'active', 1, 100, NULL)`,
      [`${planId}-schedule`, planId],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_schedule_versions
        (id, schedule_id, version_number, effective_local_date, mode,
         timezone, rotation_pointer, created_at_ms)
       VALUES (?, ?, 1, '2026-08-18', 'weekday',
               'Asia/Singapore', NULL, 100)`,
      [`${planId}-schedule-v1`, `${planId}-schedule`],
    );
    for (const [ordinal, weekday] of ["Monday", "Wednesday"].entries()) {
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_bindings
          (id, schedule_version_id, mode, ordinal, week_index, weekday,
           plan_day_id)
         VALUES (?, ?, 'weekday', ?, 0, ?, ?)`,
        [
          `${planId}-binding-${ordinal}`,
          `${planId}-schedule-v1`,
          ordinal,
          weekday,
          `${planId}-day-${ordinal}`,
        ],
      );
    }
    await transaction.execute(
      `INSERT INTO owned_plan_schedule_overrides
        (id, schedule_id, local_date, selection_kind, plan_day_id, state,
         revision, consumed_opportunity_id, created_at_ms, consumed_at_ms)
       VALUES (?, ?, '2026-08-24', 'plan_day', ?, 'pending',
               1, NULL, 100, NULL)`,
      [
        `${planId}-override`,
        `${planId}-schedule`,
        `${planId}-day-0`,
      ],
    );
    await transaction.execute(
      `INSERT INTO workout_sessions
        (id, plan_id, plan_day_id, source, status, local_date, timezone,
         started_at_ms, completed_at_ms, active_session_exercise_id,
         active_set_id, revision)
       VALUES (?, ?, ?, 'scheduled_day', 'completed', '2026-08-17',
               'Asia/Singapore', 10, 20, NULL, NULL, 1)`,
      [`${planId}-history-session`, planId, `${planId}-day-0`],
    );
    await transaction.execute(
      `INSERT INTO session_exercises
        (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
         exercise_name, metric_profile, metric_contract_version,
         exercise_metric_generation, default_rest_seconds, target_revision,
         status, revision, effort, effort_recorded_at_ms)
       SELECT ?, ?, NULL, exercise_id, 0, 'History Exercise', 'load_reps',
              1, 1, 90, 1, 'completed', 1, NULL, NULL
       FROM owned_plan_day_exercises WHERE id = ?`,
      [
        `${planId}-history-exercise`,
        `${planId}-history-session`,
        `${planId}-occurrence-0`,
      ],
    );
    await transaction.execute(
      `INSERT INTO session_sets
        (id, session_exercise_id, set_kind, ordinal,
         source_plan_working_set_target_id, target_load_grams,
         target_min_reps, target_max_reps, target_json, unit_json,
         rule_type, rule_version, metric_profile, metric_contract_version,
         exercise_metric_generation, observed_load_grams, observed_reps,
         observed_json, status, draft_updated_at_ms, completed_at_ms,
         completion_idempotency_key, revision)
       VALUES (?, ?, 'working', 0, NULL, 20000, 8, 12, ?, ?,
               'manual_hold', 1, 'load_reps', 1, 1, 20000, 10, ?,
               'completed', 20, 20, ?, 1)`,
      [
        `${planId}-history-set`,
        `${planId}-history-exercise`,
        '{"version":1,"profile":"load_reps","loadGrams":20000,"minReps":8,"maxReps":12,"incrementGrams":2500,"perSide":false}',
        '{"version":1,"load":"grams","count":"repetitions"}',
        '{"version":1,"profile":"load_reps","loadGrams":20000,"reps":10,"source":"manual"}',
        `${planId}-history-complete`,
      ],
    );
  });
}

async function impactSetup(
  kernel: SqliteKernel,
  adapter: Phase2PlanContractAdapter,
  sourceExerciseId: string,
) {
  const planId = "phase2-impact-plan";
  const created = await createAndSaveOwnedPlan(
    kernel,
    adapter,
    sourceExerciseId,
    { id: planId, dayCount: 2 },
  );
  await seedReplacementExercise(kernel, {
    id: "phase2-compatible-replacement",
    name: "Compatible Incline Press",
    profile: "load_reps",
  });
  await seedReplacementExercise(kernel, {
    id: "phase2-incompatible-replacement",
    name: "Incompatible Push-Up",
    profile: "bodyweight_reps",
  });
  await seedImpactScheduleAndHistory(kernel, planId);
  return {
    planId,
    plan: created.plan,
    repository: createPlanImpactRepository(kernel, {}),
  };
}

const contractCases: Record<Phase2PlanContractCaseId, ContractCase> = {
  async "plan-library-section-preference"({ kernel }, adapter) {
    await prepareRuntime(kernel, adapter);
    let now = 1_787_000_000_000;
    const port = createLibrarySectionPreferencePort(kernel, () => now++);
    const initial = await port.read();
    const exercises = await port.write("exercises", 0);
    const replay = await port.write("exercises", 0);
    let staleRejected = false;
    try {
      await port.write("plans", 0);
    } catch {
      staleRejected = true;
    }
    const plans = await port.write("plans", exercises.revision);
    invariant(
      initial.section === "plans"
      && initial.revision === 0
      && exercises.section === "exercises"
      && exercises.revision === 1
      && JSON.stringify(replay) === JSON.stringify(exercises)
      && staleRejected
      && plans.section === "plans"
      && plans.revision === 2,
      "phase2_plan_library_preference_invalid",
    );
  },

  async "plan-custom-lifecycle"({ kernel }, adapter) {
    const { bundled } = await prepareRuntime(kernel, adapter);
    const repository = createCustomExerciseRepository(kernel);
    const created = await createCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "phase2-custom-create",
        exerciseId: "phase2-custom-sled",
        name: "雪橇推进",
        aliases: ["Sled Push"],
        exerciseType: "strongman",
        movementClass: "compound",
        primaryMuscles: ["quadriceps"],
        secondaryMuscles: ["glutes"],
        equipment: ["sled"],
        metricIdentity: {
          profile: "fixed_time",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
        defaultRestSeconds: 75,
        createdAtMs: 1_787_000_002_000,
      },
    });
    const hidden = await setExerciseHidden({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "phase2-bundled-hide",
        exerciseId: bundled.id,
        expectedPreferenceRevision: null,
        hidden: true,
        updatedAtMs: 1_787_000_003_000,
      },
    });
    const copied = await createCustomCopy({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "phase2-bundled-copy",
        sourceExerciseId: bundled.id,
        expectedSourceRevision: 1,
        exerciseId: "phase2-custom-copy",
        name: "Independent accepted copy",
        createdAtMs: 1_787_000_004_000,
      },
    });
    const preview = await previewCustomExerciseArchive({
      repository,
      input: {
        exerciseId: created.exercise.exerciseId,
        expectedExerciseRevision: created.exercise.revision,
      },
    });
    const archived = await archiveCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "phase2-custom-archive",
        exerciseId: created.exercise.exerciseId,
        expectedExerciseRevision: created.exercise.revision,
        expectedPreferenceRevision: preview.preferenceRevision,
        previewRevision: preview.previewRevision,
        updatedAtMs: 1_787_000_005_000,
      },
    });
    const restorePreview = await previewCustomExerciseArchive({
      repository,
      input: {
        exerciseId: created.exercise.exerciseId,
        expectedExerciseRevision: created.exercise.revision,
      },
    });
    const restored = await restoreCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "phase2-custom-restore",
        exerciseId: created.exercise.exerciseId,
        expectedExerciseRevision: created.exercise.revision,
        expectedPreferenceRevision: archived.preferenceRevision,
        previewRevision: restorePreview.previewRevision,
        updatedAtMs: 1_787_000_006_000,
      },
    });
    const source = await kernel.queryAll<{
      origin: string;
      source_namespace: string | null;
      upstream_id: string | null;
    }>(
      `SELECT origin, source_namespace, upstream_id FROM exercises
       WHERE id = 'phase2-custom-copy'`,
    );
    invariant(
      created.exercise.metricIdentity.profile === "fixed_time"
      && created.progression.kind === "manual_hold"
      && hidden.hidden
      && copied.exercise.exerciseId === "phase2-custom-copy"
      && source[0]?.origin === "custom"
      && source[0].source_namespace === null
      && source[0].upstream_id === null
      && archived.archived
      && !restored.archived,
      "phase2_plan_custom_lifecycle_invalid",
    );
  },

  async "plan-owned-aggregate-lifecycle"({ kernel }, adapter) {
    const { bundled } = await prepareRuntime(kernel, adapter);
    const { plan, repository, saved } = await createAndSaveOwnedPlan(
      kernel,
      adapter,
      bundled.id,
    );
    const reordered: OwnedPlanDraftInput = {
      ...plan,
      name: "Reordered Owner Plan",
      days: plan.days.map((day) => ({
        ...day,
        occurrences: day.occurrences.map((occurrence) => ({
          ...occurrence,
          targets: [
            { ...occurrence.targets[1]!, ordinal: 0 },
            { ...occurrence.targets[0]!, ordinal: 1 },
          ],
        })),
      })),
    };
    const updated = committed(await saveOwnedPlan({
      repository,
      invalidate: async () => undefined,
      sha256: adapter.sha256,
      input: {
        requestId: "phase2-owned-reorder",
        expectedRevision: saved.plan.revision,
        savedAtMs: 1_787_000_007_000,
        plan: reordered,
      },
    }));
    const duplicate = committed(await duplicateOwnedPlan({
      repository,
      invalidate: async () => undefined,
      sha256: adapter.sha256,
      input: {
        requestId: "phase2-owned-duplicate",
        sourcePlanId: plan.id,
        expectedRevision: updated.plan.revision,
        newPlanId: "phase2-owned-plan-copy",
        name: "Owner Plan Copy",
        duplicatedAtMs: 1_787_000_008_000,
      },
    }));
    const archived = committed(await archiveOwnedPlan({
      repository,
      invalidate: async () => undefined,
      sha256: adapter.sha256,
      input: {
        requestId: "phase2-owned-archive",
        planId: duplicate.plan.id,
        expectedRevision: duplicate.plan.revision,
        updatedAtMs: 1_787_000_009_000,
      },
    }));
    const restored = committed(await restoreOwnedPlan({
      repository,
      invalidate: async () => undefined,
      sha256: adapter.sha256,
      input: {
        requestId: "phase2-owned-restore",
        planId: duplicate.plan.id,
        expectedRevision: archived.plan.revision,
        updatedAtMs: 1_787_000_010_000,
      },
    }));
    const targets = await kernel.queryAll<{ id: string; ordinal: number }>(
      `SELECT target.id, target.ordinal
       FROM owned_plan_working_set_targets target
       JOIN owned_plan_day_exercises occurrence
         ON occurrence.id = target.plan_day_exercise_id
       JOIN plan_days day ON day.id = occurrence.plan_day_id
       WHERE day.plan_id = ?
       ORDER BY target.ordinal`,
      [plan.id],
    );
    invariant(
      saved.plan.graphStatus === "valid"
      && updated.plan.name === "Reordered Owner Plan"
      && targets.map(({ id }) => id).join(",")
        === `${plan.id}-target-0-b,${plan.id}-target-0-a`
      && duplicate.plan.id === "phase2-owned-plan-copy"
      && !duplicate.plan.isActive
      && archived.plan.lifecycle === "archived"
      && restored.plan.lifecycle === "ready",
      "phase2_plan_owned_lifecycle_invalid",
    );
  },

  async "plan-impact-previews"({ kernel }, adapter) {
    const { bundled } = await prepareRuntime(kernel, adapter);
    const setup = await impactSetup(kernel, adapter, bundled.id);
    const day = await previewDayRemoval({
      repository: setup.repository,
      sha256: adapter.sha256,
      nowMs: () => Date.UTC(2026, 7, 18),
      input: {
        planId: setup.planId,
        dayId: `${setup.planId}-day-0`,
      },
    });
    const replacement = await previewExerciseReplacement({
      repository: setup.repository,
      sha256: adapter.sha256,
      input: {
        planId: setup.planId,
        occurrenceId: `${setup.planId}-occurrence-0`,
      },
    });
    const compatibleIndex = replacement.candidates.findIndex(
      ({ exerciseId }) => exerciseId === "phase2-compatible-replacement",
    );
    const incompatibleIndex = replacement.candidates.findIndex(
      ({ exerciseId }) => exerciseId === "phase2-incompatible-replacement",
    );
    invariant(
      day.affectedBindings.length === 1
      && day.affectedDates.length === 1
      && day.replacementDays.map(({ id }) => id).includes(
        `${setup.planId}-day-1`,
      )
      && day.previewToken.startsWith("plan-impact-v1:")
      && compatibleIndex >= 0
      && incompatibleIndex > compatibleIndex
      && replacement.candidates[compatibleIndex]?.compatible === true
      && replacement.candidates[incompatibleIndex]?.compatible === false
      && replacement.occurrences.length === 2,
      "phase2_plan_impact_preview_invalid",
    );
  },

  async "plan-impact-stale-rollback"({ kernel }, adapter) {
    const { bundled } = await prepareRuntime(kernel, adapter);
    const setup = await impactSetup(kernel, adapter, bundled.id);
    const preview = await previewExerciseReplacement({
      repository: setup.repository,
      sha256: adapter.sha256,
      input: {
        planId: setup.planId,
        occurrenceId: `${setup.planId}-occurrence-0`,
      },
    });
    const occurrenceBefore = await kernel.queryAll(
      `SELECT id, exercise_id, revision FROM owned_plan_day_exercises
       WHERE plan_day_id IN (?, ?) ORDER BY id`,
      [`${setup.planId}-day-0`, `${setup.planId}-day-1`],
    );
    const historyBefore = await kernel.queryAll(
      `SELECT session.id AS session_id, exercise.exercise_id, set_row.target_json,
              set_row.observed_json
       FROM workout_sessions session
       JOIN session_exercises exercise ON exercise.session_id = session.id
       JOIN session_sets set_row ON set_row.session_exercise_id = exercise.id
       WHERE session.id = ?`,
      [`${setup.planId}-history-session`],
    );
    await kernel.write((transaction) =>
      transaction.execute(
        `UPDATE owned_plan_working_set_targets
         SET revision = revision + 1 WHERE id = ?`,
        [`${setup.planId}-target-0-a`],
      )
    );
    let staleRejected = false;
    try {
      await replacePlanExercise({
        repository: setup.repository,
        sha256: adapter.sha256,
        nowMs: () => 1_787_000_000_000,
        invalidate: async () => undefined,
        input: {
          requestId: "phase2-impact-stale",
          planId: setup.planId,
          sourceOccurrenceId: preview.sourceOccurrenceId,
          expectedPlanRevision: preview.planRevision,
          previewToken: preview.previewToken,
          scope: "this_occurrence",
          replacementExerciseId: "phase2-compatible-replacement",
          review: {
            targets: true,
            warmups: true,
            rest: true,
            progression: true,
            historyImmutable: true,
          },
          occurrences: [preview.occurrences[0]!],
        },
      });
    } catch {
      staleRejected = true;
    }
    const occurrenceAfter = await kernel.queryAll(
      `SELECT id, exercise_id, revision FROM owned_plan_day_exercises
       WHERE plan_day_id IN (?, ?) ORDER BY id`,
      [`${setup.planId}-day-0`, `${setup.planId}-day-1`],
    );
    const historyAfter = await kernel.queryAll(
      `SELECT session.id AS session_id, exercise.exercise_id, set_row.target_json,
              set_row.observed_json
       FROM workout_sessions session
       JOIN session_exercises exercise ON exercise.session_id = session.id
       JOIN session_sets set_row ON set_row.session_exercise_id = exercise.id
       WHERE session.id = ?`,
      [`${setup.planId}-history-session`],
    );
    invariant(
      staleRejected
      && JSON.stringify(occurrenceAfter) === JSON.stringify(occurrenceBefore)
      && JSON.stringify(historyAfter) === JSON.stringify(historyBefore),
      "phase2_plan_impact_rollback_invalid",
    );
  },

  async "plan-latest-schema-add-warmup"({ kernel }, adapter) {
    const { repository, sessionId, view } = await prepareActiveWorkout(
      kernel,
      adapter,
    );
    const exercise = view.currentExercise;
    const priorMaximum = Math.max(
      ...exercise.warmups.map(({ ordinal }) => ordinal),
    );
    const observation = {
      version: 1 as const,
      profile: "load_reps" as const,
      loadGrams: 25_000,
      reps: 6,
      source: "manual" as const,
    };
    const command = {
      sessionId,
      sessionExerciseId: exercise.id,
      setId: "phase2-contract-added-warmup",
      observation,
      nowMs: 1_787_000_021_000,
    };
    const added = await addWarmup({ repository, input: command });
    const row = await readContractSet(kernel, command.setId);
    const beforeReplay = await kernel.queryAll(
      `SELECT ${CONTRACT_SET_PROJECTION}, ws.revision AS session_revision
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ss.id = ?`,
      [command.setId],
    );
    const replayRejected = await rejectsWithCode(
      () => addWarmup({ repository, input: command }),
      "add_warmup_conflict",
    );
    const afterReplay = await kernel.queryAll(
      `SELECT ${CONTRACT_SET_PROJECTION}, ws.revision AS session_revision
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ss.id = ?`,
      [command.setId],
    );
    const count = await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM session_sets WHERE id = ?",
      [command.setId],
    );
    invariant(
      row.set_kind === "warmup"
      && row.ordinal === priorMaximum + 1
      && row.source_plan_working_set_target_id === null
      && row.source_owned_plan_working_set_target_id === null
      && row.target_load_grams === observation.loadGrams
      && row.target_min_reps === observation.reps
      && row.target_max_reps === observation.reps
      && row.metric_profile === exercise.metricIdentity.profile
      && row.metric_contract_version
        === exercise.metricIdentity.contractVersion
      && row.exercise_metric_generation
        === exercise.metricIdentity.exerciseMetricGeneration
      && sameJson(JSON.parse(row.observed_json ?? "null"), observation)
      && row.status === "draft"
      && row.draft_updated_at_ms === command.nowMs
      && row.completed_at_ms === null
      && row.completion_idempotency_key === null
      && row.revision === 1
      && added.revision === view.revision + 1
      && replayRejected
      && count[0]?.count === 1
      && sameJson(afterReplay, beforeReplay),
      "phase2_plan_latest_schema_add_warmup_invalid",
    );
  },

  async "plan-latest-schema-copy-warmup"({ kernel }, adapter) {
    const { repository, sessionId, view } = await prepareActiveWorkout(
      kernel,
      adapter,
    );
    const exercise = view.currentExercise;
    const source = exercise.warmups[0];
    invariant(
      source !== undefined
      && source.target.profile === "load_reps"
      && source.observation === null,
      "phase2_plan_copy_warmup_source_invalid",
    );
    const priorMaximum = Math.max(
      ...exercise.warmups.map(({ ordinal }) => ordinal),
    );
    const command = {
      sessionId,
      sourceSetId: source.id,
      setId: "phase2-contract-copied-warmup",
      nowMs: 1_787_000_022_000,
    };
    const copied = await copyPreviousWarmup({ repository, input: command });
    const row = await readContractSet(kernel, command.setId);
    const expectedObservation = {
      version: 1,
      profile: "load_reps",
      loadGrams: source.target.loadGrams,
      reps: source.target.maxReps,
      source: "manual",
    };
    const expectedTarget = {
      version: 1,
      profile: "load_reps",
      loadGrams: source.target.loadGrams,
      minReps: source.target.maxReps,
      maxReps: source.target.maxReps,
      incrementGrams: 1_000,
      perSide: false,
    };
    const beforeReplay = await kernel.queryAll(
      `SELECT ${CONTRACT_SET_PROJECTION}, ws.revision AS session_revision
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ss.id = ?`,
      [command.setId],
    );
    const replayRejected = await rejectsWithCode(
      () => copyPreviousWarmup({ repository, input: command }),
      "copy_warmup_conflict",
    );
    const afterReplay = await kernel.queryAll(
      `SELECT ${CONTRACT_SET_PROJECTION}, ws.revision AS session_revision
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ss.id = ?`,
      [command.setId],
    );
    invariant(
      row.set_kind === "warmup"
      && row.ordinal === priorMaximum + 1
      && row.source_plan_working_set_target_id === null
      && row.source_owned_plan_working_set_target_id === null
      && sameJson(JSON.parse(row.observed_json ?? "null"), expectedObservation)
      && sameJson(JSON.parse(row.target_json), expectedTarget)
      && sameJson(JSON.parse(row.unit_json), {
        version: 1,
        load: "grams",
        count: "repetitions",
      })
      && row.metric_profile === exercise.metricIdentity.profile
      && row.metric_contract_version
        === exercise.metricIdentity.contractVersion
      && row.exercise_metric_generation
        === exercise.metricIdentity.exerciseMetricGeneration
      && row.status === "draft"
      && row.revision === 1
      && copied.revision === view.revision + 1
      && replayRejected
      && sameJson(afterReplay, beforeReplay),
      "phase2_plan_latest_schema_copy_warmup_invalid",
    );
  },

  async "plan-latest-schema-add-working-set"({ kernel }, adapter) {
    const { repository, sessionId, view } = await prepareActiveWorkout(
      kernel,
      adapter,
    );
    const exercise = view.currentExercise;
    const source = exercise.workingSets.at(-1);
    invariant(
      source !== undefined,
      "phase2_plan_add_working_set_source_missing",
    );
    const sourceRow = await readContractSet(kernel, source.id);
    const priorMaximum = Math.max(
      ...exercise.workingSets.map(({ ordinal }) => ordinal),
    );
    const command = {
      sessionId,
      sessionExerciseId: exercise.id,
      sourceSetId: source.id,
      setId: "phase2-contract-added-working-set",
      nowMs: 1_787_000_023_000,
    };
    const added = await addWorkingSet({ repository, input: command });
    const row = await readContractSet(kernel, command.setId);
    const copiedObservation = JSON.parse(row.observed_json ?? "null") as
      Record<string, unknown> | null;
    const beforeReplay = await kernel.queryAll(
      `SELECT ${CONTRACT_SET_PROJECTION}, ws.revision AS session_revision
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ss.id = ?`,
      [command.setId],
    );
    const replayRejected = await rejectsWithCode(
      () => addWorkingSet({ repository, input: command }),
      "add_working_set_conflict",
    );
    const afterReplay = await kernel.queryAll(
      `SELECT ${CONTRACT_SET_PROJECTION}, ws.revision AS session_revision
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ss.id = ?`,
      [command.setId],
    );
    invariant(
      row.set_kind === "working"
      && row.ordinal === priorMaximum + 1
      && row.source_plan_working_set_target_id === null
      && row.source_owned_plan_working_set_target_id === null
      && row.target_load_grams === sourceRow.target_load_grams
      && row.target_min_reps === sourceRow.target_min_reps
      && row.target_max_reps === sourceRow.target_max_reps
      && row.target_json === sourceRow.target_json
      && row.unit_json === sourceRow.unit_json
      && row.rule_type === sourceRow.rule_type
      && row.rule_version === sourceRow.rule_version
      && sourceRow.metric_profile === exercise.metricIdentity.profile
      && sourceRow.metric_contract_version
        === exercise.metricIdentity.contractVersion
      && sourceRow.exercise_metric_generation
        === exercise.metricIdentity.exerciseMetricGeneration
      && row.metric_profile === sourceRow.metric_profile
      && row.metric_contract_version === sourceRow.metric_contract_version
      && row.exercise_metric_generation
        === sourceRow.exercise_metric_generation
      && row.metric_profile === exercise.metricIdentity.profile
      && row.metric_contract_version
        === exercise.metricIdentity.contractVersion
      && row.exercise_metric_generation
        === exercise.metricIdentity.exerciseMetricGeneration
      && copiedObservation?.profile === exercise.metricIdentity.profile
      && copiedObservation?.version
        === exercise.metricIdentity.contractVersion
      && copiedObservation?.source === "manual"
      && row.status === "draft"
      && row.revision === 1
      && added.revision === view.revision + 1
      && added.progress.totalWorkingSets
        === view.progress.totalWorkingSets + 1
      && replayRejected
      && sameJson(afterReplay, beforeReplay),
      "phase2_plan_latest_schema_add_working_set_invalid",
    );
  },

  async "plan-active-completed-set-revision"({ kernel }, adapter) {
    const { repository, sessionId, view } = await prepareActiveWorkout(
      kernel,
      adapter,
    );
    const first = view.currentExercise.workingSets[0];
    invariant(
      first !== undefined && view.activeSetId === first.id,
      "phase2_plan_revision_active_set_missing",
    );
    const completed = await completeSet({
      repository,
      haptics: { committed: async () => undefined },
      invalidate: async () => undefined,
      drainEffects: async () => undefined,
      input: {
        sessionId,
        setId: first.id,
        expectedSessionRevision: view.revision,
        expectedSetRevision: first.revision,
        completionIdempotencyKey: "phase2-contract-complete-for-correction",
        metricIdentity: first.metricIdentity,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          reps: 8,
          source: "manual",
        },
        completedAtMs: 1_787_000_024_000,
      },
    });
    invariant(
      completed.outcome === "committed",
      "phase2_plan_revision_completion_missing",
    );
    const completedSet = completed.view.exercises
      .flatMap(({ workingSets }) => workingSets)
      .find(({ id }) => id === first.id);
    invariant(
      completedSet !== undefined,
      "phase2_plan_revision_completed_set_missing",
    );
    const sessionBefore = await kernel.queryAll<Readonly<{
      id: string;
      status: string;
      active_session_exercise_id: string | null;
      active_set_id: string | null;
      revision: number;
    }>>(
      `SELECT id, status, active_session_exercise_id, active_set_id, revision
       FROM workout_sessions WHERE id = ?`,
      [sessionId],
    );
    const selectedBefore = await readContractSet(kernel, first.id);
    const restBefore = await kernel.queryAll(
      "SELECT * FROM session_rest_states WHERE session_id = ?",
      [sessionId],
    );
    const exerciseBefore = await kernel.queryAll(
      `SELECT * FROM session_exercises
       WHERE session_id = ? ORDER BY ordinal, id`,
      [sessionId],
    );
    const otherSetsBefore = await kernel.queryAll(
      `SELECT ${CONTRACT_SET_PROJECTION}
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       WHERE se.session_id = ? AND ss.id <> ?
       ORDER BY se.ordinal, ss.set_kind, ss.ordinal, ss.id`,
      [sessionId, first.id],
    );
    const undoBefore = await kernel.queryAll(
      `SELECT * FROM session_undo_snapshots
       WHERE session_id = ? ORDER BY id`,
      [sessionId],
    );
    const effectsBefore = await kernel.queryAll(
      `SELECT * FROM pending_effects
       WHERE subject_id = ? ORDER BY id`,
      [sessionId],
    );
    const correction = {
      sessionId,
      setId: first.id,
      expectedSessionRevision: completed.view.revision,
      expectedSetRevision: completedSet.revision,
      correctionIdempotencyKey: "phase2-contract-correction-r2",
      metricIdentity: first.metricIdentity,
      observation: {
        version: 1 as const,
        profile: "load_reps" as const,
        loadGrams: 62_500,
        reps: 7,
        source: "manual" as const,
      },
      revisedAtMs: 1_787_000_025_000,
    };
    const corrected = await reviseCompletedSet({
      repository,
      input: correction,
    });
    const selectedAfter = await readContractSet(kernel, first.id);
    const sessionAfter = await kernel.queryAll(
      `SELECT id, status, active_session_exercise_id, active_set_id, revision
       FROM workout_sessions WHERE id = ?`,
      [sessionId],
    );
    const unchangedAfter = await Promise.all([
      kernel.queryAll(
        "SELECT * FROM session_rest_states WHERE session_id = ?",
        [sessionId],
      ),
      kernel.queryAll(
        `SELECT * FROM session_exercises
         WHERE session_id = ? ORDER BY ordinal, id`,
        [sessionId],
      ),
      kernel.queryAll(
        `SELECT ${CONTRACT_SET_PROJECTION}
         FROM session_sets ss
         JOIN session_exercises se ON se.id = ss.session_exercise_id
         WHERE se.session_id = ? AND ss.id <> ?
         ORDER BY se.ordinal, ss.set_kind, ss.ordinal, ss.id`,
        [sessionId, first.id],
      ),
      kernel.queryAll(
        `SELECT * FROM session_undo_snapshots
         WHERE session_id = ? ORDER BY id`,
        [sessionId],
      ),
      kernel.queryAll(
        `SELECT * FROM pending_effects
         WHERE subject_id = ? ORDER BY id`,
        [sessionId],
      ),
    ]);
    const expectedSelected = {
      ...selectedBefore,
      observed_load_grams: correction.observation.loadGrams,
      observed_reps: correction.observation.reps,
      observed_json: JSON.stringify(correction.observation),
      draft_updated_at_ms: correction.revisedAtMs,
      revision: selectedBefore.revision + 1,
    };
    const sessionRowBefore = sessionBefore[0];
    invariant(
      sessionRowBefore !== undefined
      && sameJson(selectedAfter, expectedSelected)
      && sameJson(sessionAfter, [{
        ...sessionRowBefore,
        revision: sessionRowBefore.revision + 1,
      }])
      && corrected.status === "in_progress"
      && corrected.activeExerciseId === completed.view.activeExerciseId
      && corrected.activeSetId === completed.view.activeSetId
      && sameJson(unchangedAfter, [
        restBefore,
        exerciseBefore,
        otherSetsBefore,
        undoBefore,
        effectsBefore,
      ]),
      "phase2_plan_active_completed_set_revision_invalid",
    );
    const stateAfterCorrection = await Promise.all([
      repository.getActiveWorkout(sessionId),
      readContractSet(kernel, first.id),
      kernel.queryAll(
        `SELECT id, status, active_session_exercise_id, active_set_id, revision
         FROM workout_sessions WHERE id = ?`,
        [sessionId],
      ),
      kernel.queryAll(
        "SELECT * FROM session_rest_states WHERE session_id = ?",
        [sessionId],
      ),
      kernel.queryAll(
        `SELECT * FROM session_undo_snapshots
         WHERE session_id = ? ORDER BY id`,
        [sessionId],
      ),
      kernel.queryAll(
        `SELECT * FROM pending_effects
         WHERE subject_id = ? ORDER BY id`,
        [sessionId],
      ),
    ]);
    const replayRejected = await rejectsWithCode(
      () => reviseCompletedSet({ repository, input: correction }),
      "revise_completed_set_conflict",
    );
    const stateAfterReplay = await Promise.all([
      repository.getActiveWorkout(sessionId),
      readContractSet(kernel, first.id),
      kernel.queryAll(
        `SELECT id, status, active_session_exercise_id, active_set_id, revision
         FROM workout_sessions WHERE id = ?`,
        [sessionId],
      ),
      kernel.queryAll(
        "SELECT * FROM session_rest_states WHERE session_id = ?",
        [sessionId],
      ),
      kernel.queryAll(
        `SELECT * FROM session_undo_snapshots
         WHERE session_id = ? ORDER BY id`,
        [sessionId],
      ),
      kernel.queryAll(
        `SELECT * FROM pending_effects
         WHERE subject_id = ? ORDER BY id`,
        [sessionId],
      ),
    ]);
    invariant(
      replayRejected && sameJson(stateAfterReplay, stateAfterCorrection),
      "phase2_plan_completed_set_revision_replay_invalid",
    );
  },

  async "plan-rest-alert-preference-persistence"(runtime) {
    const storage = runtime.preferenceStorage;
    invariant(
      storage !== undefined,
      "phase2_plan_preference_storage_missing",
    );
    storage.removeItemSync?.(REST_ALERT_PREFERENCE_KEY);
    const initial = createSqliteRestAlertPreferenceStore(storage).read();
    const combinations: readonly RestAlertPreferences[] = [
      { soundEnabled: true, vibrationEnabled: true },
      { soundEnabled: true, vibrationEnabled: false },
      { soundEnabled: false, vibrationEnabled: true },
      { soundEnabled: false, vibrationEnabled: false },
    ];
    let combinationsPersisted = true;
    for (const preferences of combinations) {
      createSqliteRestAlertPreferenceStore(storage).write(preferences);
      const reopened = createSqliteRestAlertPreferenceStore(storage);
      combinationsPersisted &&= sameJson(reopened.read(), preferences)
        && storage.getItemSync(REST_ALERT_PREFERENCE_KEY)
          === JSON.stringify({ version: 1, ...preferences });
    }
    storage.setItemSync(REST_ALERT_PREFERENCE_KEY, "not-json");
    const malformedFallback = createSqliteRestAlertPreferenceStore(
      storage,
    ).read();
    storage.setItemSync(REST_ALERT_PREFERENCE_KEY, JSON.stringify({
      version: 2,
      soundEnabled: false,
      vibrationEnabled: false,
    }));
    const versionFallback = createSqliteRestAlertPreferenceStore(
      storage,
    ).read();
    let writeThrew = false;
    const unavailable = createSqliteRestAlertPreferenceStore({
      getItemSync() {
        throw new Error("injected_preference_read_failure");
      },
      setItemSync() {
        throw new Error("injected_preference_write_failure");
      },
    });
    const unavailableRead = unavailable.read();
    try {
      unavailable.write({ soundEnabled: false, vibrationEnabled: true });
    } catch {
      writeThrew = true;
    }
    invariant(
      sameJson(initial, DEFAULT_REST_ALERT_PREFERENCES)
      && combinationsPersisted
      && sameJson(malformedFallback, DEFAULT_REST_ALERT_PREFERENCES)
      && sameJson(versionFallback, DEFAULT_REST_ALERT_PREFERENCES)
      && sameJson(unavailableRead, DEFAULT_REST_ALERT_PREFERENCES)
      && !writeThrew,
      "phase2_plan_rest_alert_preference_persistence_invalid",
    );
  },

  async "plan-notification-failure-non-authority"(
    { kernel },
    adapter,
  ) {
    const { restRepository, sessionId, view } = await prepareActiveWorkout(
      kernel,
      adapter,
    );
    const running = await startManualRest({
      repository: restRepository,
      input: {
        sessionId,
        expectedSessionRevision: view.revision,
        expectedRestRevision: view.rest.revision,
        nowMs: 10_000,
      },
    });
    invariant(
      running.state.state === "running"
      && running.state.endsAtMs > 20_000,
      "phase2_plan_notification_running_rest_missing",
    );
    const authorityBefore = await Promise.all([
      kernel.queryAll(
        `SELECT id, status, active_session_exercise_id, active_set_id, revision
         FROM workout_sessions WHERE id = ?`,
        [sessionId],
      ),
      kernel.queryAll(
        "SELECT * FROM session_rest_states WHERE session_id = ?",
        [sessionId],
      ),
    ]);
    type FailurePoint = "channel" | "list" | "cancel" | "schedule";
    const attempts: ReadonlyArray<Readonly<{
      permission: "granted" | "denied" | "undetermined";
      failure?: FailurePoint;
      expectedOutcome:
        | "permission_denied"
        | "permission_undetermined"
        | "platform_failure";
      expectedPermission: "granted" | "denied" | "undetermined";
      expectedScheduleCalls: number;
    }>> = [
      {
        permission: "denied",
        expectedOutcome: "permission_denied",
        expectedPermission: "denied",
        expectedScheduleCalls: 0,
      },
      {
        permission: "undetermined",
        expectedOutcome: "permission_undetermined",
        expectedPermission: "undetermined",
        expectedScheduleCalls: 0,
      },
      {
        permission: "granted",
        failure: "channel",
        expectedOutcome: "platform_failure",
        expectedPermission: "undetermined",
        expectedScheduleCalls: 0,
      },
      {
        permission: "granted",
        failure: "list",
        expectedOutcome: "platform_failure",
        expectedPermission: "granted",
        expectedScheduleCalls: 0,
      },
      {
        permission: "granted",
        failure: "cancel",
        expectedOutcome: "platform_failure",
        expectedPermission: "granted",
        expectedScheduleCalls: 0,
      },
      {
        permission: "granted",
        failure: "schedule",
        expectedOutcome: "platform_failure",
        expectedPermission: "granted",
        expectedScheduleCalls: 1,
      },
    ];
    for (const attempt of attempts) {
      let scheduleCalls = 0;
      const notifications: RestNotificationPort = {
        async ensureChannel() {
          if (attempt.failure === "channel") {
            throw new Error("injected_channel_failure");
          }
        },
        permission: async () => attempt.permission,
        requestPermission: async () => attempt.permission,
        async listScheduled() {
          if (attempt.failure === "list") {
            throw new Error("injected_list_failure");
          }
          return attempt.failure === "cancel"
            ? [{
                identifier: `rest:${sessionId}:stale`,
                sessionId,
                restRevision: 0,
                endsAtMs: 0,
                channelId: null,
              }]
            : [];
        },
        async cancel() {
          if (attempt.failure === "cancel") {
            throw new Error("injected_cancel_failure");
          }
        },
        async schedule(input) {
          scheduleCalls += 1;
          if (attempt.failure === "schedule") {
            throw new Error("injected_schedule_failure");
          }
          return input.identifier;
        },
        openSettings: async () => undefined,
      };
      const result = await createRestNotificationReconciler({
        repository: restRepository,
        notifications,
        preferences: { read: () => DEFAULT_REST_ALERT_PREFERENCES },
        nowMs: () => 20_000,
      }).reconcile(sessionId);
      const authorityAfter = await Promise.all([
        kernel.queryAll(
          `SELECT id, status, active_session_exercise_id,
                  active_set_id, revision
           FROM workout_sessions WHERE id = ?`,
          [sessionId],
        ),
        kernel.queryAll(
          "SELECT * FROM session_rest_states WHERE session_id = ?",
          [sessionId],
        ),
      ]);
      invariant(
        result.outcome === attempt.expectedOutcome
        && result.permission === attempt.expectedPermission
        && scheduleCalls === attempt.expectedScheduleCalls
        && sameJson(authorityAfter, authorityBefore),
        "phase2_plan_notification_failure_authority_changed",
      );
    }
  },

  async "plan-foreground-feedback-attempt-once"({ kernel }, adapter) {
    const { restRepository, sessionId, view } = await prepareActiveWorkout(
      kernel,
      adapter,
    );
    const running = await startManualRest({
      repository: restRepository,
      input: {
        sessionId,
        expectedSessionRevision: view.revision,
        expectedRestRevision: view.rest.revision,
        nowMs: 10_000,
      },
    });
    const expired = await expireRestWithForegroundFeedback({
      repository: restRepository,
      input: {
        sessionId,
        expectedSessionRevision: running.sessionRevision,
        expectedRestRevision: running.state.revision,
        nowMs: 200_000,
        preferences: {
          soundEnabled: true,
          vibrationEnabled: true,
        },
      },
    });
    invariant(
      expired.state.state === "expired",
      "phase2_plan_foreground_expiry_missing",
    );
    const queued = await kernel.queryAll<Readonly<{
      session_id: string;
      rest_revision: number;
      sound_enabled: number;
      vibration_enabled: number;
      sound_status: string;
      vibration_status: string;
    }>>(
      `SELECT session_id, rest_revision, sound_enabled, vibration_enabled,
              sound_status, vibration_status
       FROM foreground_rest_feedback_attempts
       WHERE session_id = ? AND rest_revision = ?`,
      [sessionId, expired.state.revision],
    );
    let toneCalls = 0;
    let vibrationCalls = 0;
    const notifications: RestNotificationPort = {
      ensureChannel: async () => undefined,
      permission: async () => "granted",
      requestPermission: async () => "granted",
      listScheduled: async () => [],
      cancel: async () => undefined,
      schedule: async ({ identifier }) => identifier,
      openSettings: async () => undefined,
    };
    const lifecycle = createWorkoutLifecycle({
      kernel,
      restRepository,
      notifications,
      nowMs: () => 200_000,
      foregroundFeedbackStore: createForegroundRestFeedbackStore(kernel),
      foregroundFeedback: {
        async playTone() {
          toneCalls += 1;
          throw new Error("injected_tone_failure");
        },
        async vibrate() {
          vibrationCalls += 1;
          throw new Error("injected_vibration_failure");
        },
      },
    });
    const trigger = {
      foregroundExpiry: {
        sessionId,
        restRevision: expired.state.revision,
      },
    };
    const first = await lifecycle.trigger("post_commit", trigger);
    const firstFeedback = first.foregroundFeedback.find(
      ({ restRevision }) => restRevision === expired.state.revision,
    );
    const completed = await kernel.queryAll<Readonly<{
      sound_status: string;
      vibration_status: string;
    }>>(
      `SELECT sound_status, vibration_status
       FROM foreground_rest_feedback_attempts
       WHERE session_id = ? AND rest_revision = ?`,
      [sessionId, expired.state.revision],
    );
    const second = await lifecycle.trigger("post_commit", trigger);
    const secondFeedback = second.foregroundFeedback.find(
      ({ restRevision }) => restRevision === expired.state.revision,
    );
    const afterReplay = await kernel.queryAll<Readonly<{
      sound_status: string;
      vibration_status: string;
    }>>(
      `SELECT sound_status, vibration_status
       FROM foreground_rest_feedback_attempts
       WHERE session_id = ? AND rest_revision = ?`,
      [sessionId, expired.state.revision],
    );
    invariant(
      sameJson(queued, [{
        session_id: sessionId,
        rest_revision: expired.state.revision,
        sound_enabled: 1,
        vibration_enabled: 1,
        sound_status: "pending",
        vibration_status: "pending",
      }])
      && firstFeedback?.outcome === "attempted"
      && sameJson([...firstFeedback.diagnostics].sort(), [
        "tone_failed",
        "vibration_failed",
      ])
      && sameJson(completed, [{
        sound_status: "completed",
        vibration_status: "completed",
      }])
      && secondFeedback?.outcome === "already_attempted"
      && secondFeedback.diagnostics.length === 0
      && toneCalls === 1
      && vibrationCalls === 1
      && sameJson(afterReplay, completed),
      "phase2_plan_foreground_feedback_attempt_once_invalid",
    );
  },
};

export async function createExpoPhase2PlanContractAdapter(
  runId: string,
  onCaseStart?: (caseId: Phase2PlanContractCaseId) => void,
): Promise<Phase2PlanContractAdapter> {
  const {
    CryptoDigestAlgorithm,
    digestStringAsync,
  } = require("expo-crypto") as typeof import("expo-crypto");
  const { SQLiteStorage } = require("expo-sqlite/kv-store") as
    typeof import("expo-sqlite/kv-store");
  return {
    ...(onCaseStart === undefined ? {} : { onCaseStart }),
    async createRuntime(caseId) {
      const database = await openExerciseSearchFtsContractRuntime(
        `phase2-plan-${runId}-${caseId}.db`,
      );
      const preferenceStorage = new SQLiteStorage(
        `phase2-plan-${runId}-${caseId}-preferences.db`,
      );
      preferenceStorage.removeItemSync(REST_ALERT_PREFERENCE_KEY);
      return {
        kernel: database.kernel,
        preferenceStorage,
        async close() {
          try {
            preferenceStorage.removeItemSync(REST_ALERT_PREFERENCE_KEY);
            preferenceStorage.closeSync();
          } finally {
            await database.close();
          }
        },
      };
    },
    sha256: (value) =>
      digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
  };
}

export async function runPhase2PlanContract(
  adapter: Phase2PlanContractAdapter,
): Promise<Phase2PlanContractResult> {
  const startedAt = new Date().toISOString();
  const results: Phase2PlanContractCaseResult[] = [];
  for (const caseId of PHASE2_PLAN_CASE_IDS) {
    adapter.onCaseStart?.(caseId);
    const caseStartedAt = Date.now();
    let runtime: Phase2PlanContractRuntime | undefined;
    try {
      runtime = await adapter.createRuntime(caseId);
      await contractCases[caseId](runtime, adapter);
      results.push({
        id: caseId,
        status: "passed",
        durationMs: Date.now() - caseStartedAt,
      });
    } catch (error) {
      results.push({
        id: caseId,
        status: "failed",
        durationMs: Date.now() - caseStartedAt,
        errorCode: safeErrorCode(error),
      });
    } finally {
      await runtime?.close().catch(() => undefined);
    }
  }
  const passed = results.filter(({ status }) => status === "passed").length;
  const failed = results.length - passed;
  return {
    schemaVersion: 1,
    contractVersion: PHASE2_PLAN_CONTRACT_VERSION,
    status: failed === 0 ? "passed" : "failed",
    total: results.length,
    passed,
    failed,
    skipped: 0,
    cases: results,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

export function assertPhase2PlanContractResult(
  input: unknown,
): asserts input is Phase2PlanContractResult {
  const result = input as Partial<Phase2PlanContractResult> | null;
  const cases = Array.isArray(result?.cases) ? result.cases : [];
  if (
    result?.schemaVersion !== 1
    || result.contractVersion !== PHASE2_PLAN_CONTRACT_VERSION
    || result.status !== "passed"
    || result.total !== PHASE2_PLAN_CASE_IDS.length
    || result.passed !== PHASE2_PLAN_CASE_IDS.length
    || result.failed !== 0
    || result.skipped !== 0
    || cases.length !== PHASE2_PLAN_CASE_IDS.length
    || cases.some((contractCase, index) =>
      contractCase.id !== PHASE2_PLAN_CASE_IDS[index]
      || contractCase.status !== "passed"
      || contractCase.errorCode !== undefined
      || !Number.isFinite(contractCase.durationMs)
      || contractCase.durationMs < 0
    )
  ) {
    throw new Error("phase2_plan_contract_result_invalid");
  }
}

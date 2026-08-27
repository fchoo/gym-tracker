import {
  aggregateMetricObservations,
} from "../../domains/metrics/aggregates";
import {
  compareMetricObservations,
} from "../../domains/metrics/comparators";
import type {
  MetricIdentity,
  MetricObservation,
  MetricTarget,
} from "../../domains/metrics/contracts";
import {
  migrateCustomExerciseMetricProfile,
} from "../../domains/metrics/migrateCustomExerciseMetricProfile";
import {
  parseMetricObservation,
  parseMetricTarget,
  serializeMetricObservation,
  serializeMetricTarget,
} from "../../domains/metrics/observations";
import {
  getMetricContract,
  listMetricContracts,
} from "../../domains/metrics/registry";
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
  createMetricRepository,
} from "../../platform/sqlite/repositories/metricRepository";
import {
  openExerciseSearchFtsContractRuntime,
} from "../../platform/sqlite/repositories/exerciseSearchIndexRepository";
import type {
  SqliteKernel,
} from "../../platform/sqlite/sqliteKernel";
import type {
  Phase2ContractCaseMetadata,
} from "./phase2Content.contract";

export const PHASE2_METRICS_CONTRACT_VERSION = 1 as const;

export const PHASE2_METRICS_CASE_IDS = [
  "metrics-final-manifest-v12",
  "metrics-retained-v5-v6",
  "metrics-nine-profile-roundtrip",
  "metrics-profile-migration-rollback",
] as const;

export type Phase2MetricsContractCaseId =
  (typeof PHASE2_METRICS_CASE_IDS)[number];

export const PHASE2_METRICS_CASE_METADATA = [
  {
    id: "metrics-final-manifest-v12",
    requirement: "LIB-11",
    category: "migration-manifest",
    edgeIds: ["E-64"],
    sourceTest: "tests/sqlite-host/foreground-rest-feedback.test.ts#uses the full current migration manifest and atomically claims each revision once",
  },
  {
    id: "metrics-retained-v5-v6",
    requirement: "LIB-11",
    category: "legacy-persistence",
    edgeIds: ["E-65", "E-75"],
    sourceTest: "tests/sqlite-host/metric-profiles.test.ts#preserves legacy load/reps and timed-hold JSON bytes and seconds",
  },
  {
    id: "metrics-nine-profile-roundtrip",
    requirement: "LIB-12",
    category: "metric-contracts",
    edgeIds: [
      "E-66",
      "E-67",
      "E-68",
      "E-69",
      "E-70",
      "E-71",
      "E-72",
      "E-73",
      "E-74",
      "E-76",
      "E-77",
      "E-78",
    ],
    sourceTest: "src/domains/metrics/metricContracts.test.ts#metric identity comparator aggregate and exposure contracts",
  },
  {
    id: "metrics-profile-migration-rollback",
    requirement: "LIB-11",
    category: "profile-migration",
    edgeIds: ["E-64", "E-78"],
    sourceTest: "tests/integration/metric-profile-migration.test.ts#rolls back source targets policy baseline and event when commit fails",
  },
] as const satisfies readonly Phase2ContractCaseMetadata<
  Phase2MetricsContractCaseId
>[];

export type Phase2MetricsContractRuntime = Readonly<{
  kernel: SqliteKernel;
  close(): Promise<void>;
}>;

export interface Phase2MetricsContractAdapter {
  createRuntime(
    caseId: Phase2MetricsContractCaseId,
  ): Promise<Phase2MetricsContractRuntime>;
  sha256(value: string): Promise<string>;
}

export type Phase2MetricsContractCaseResult = Readonly<{
  id: Phase2MetricsContractCaseId;
  status: "passed" | "failed";
  durationMs: number;
  errorCode?: string;
}>;

export type Phase2MetricsContractResult = Readonly<{
  schemaVersion: 1;
  contractVersion: typeof PHASE2_METRICS_CONTRACT_VERSION;
  status: "passed" | "failed";
  total: number;
  passed: number;
  failed: number;
  skipped: 0;
  cases: readonly Phase2MetricsContractCaseResult[];
  startedAt: string;
  finishedAt: string;
}>;

type MetricFixture = Readonly<{
  identity: MetricIdentity;
  target: MetricTarget;
  observation: MetricObservation;
  worse: MetricObservation;
}>;

const METRIC_FIXTURES: readonly MetricFixture[] = [
  {
    identity: {
      profile: "load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target: {
      version: 1,
      profile: "load_reps",
      loadGrams: 10_000,
      minReps: 8,
      maxReps: 12,
      incrementGrams: 1_000,
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "load_reps",
      loadGrams: 10_000,
      reps: 10,
      source: "manual",
    },
    worse: {
      version: 1,
      profile: "load_reps",
      loadGrams: 9_000,
      reps: 10,
      source: "manual",
    },
  },
  {
    identity: {
      profile: "bodyweight_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "bodyweight_reps",
      minReps: 8,
      maxReps: 20,
      variationId: "standard",
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "bodyweight_reps",
      reps: 12,
      source: "manual",
    },
    worse: {
      version: 1,
      profile: "bodyweight_reps",
      reps: 11,
      source: "manual",
    },
  },
  {
    identity: {
      profile: "added_load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target: {
      version: 1,
      profile: "added_load_reps",
      addedLoadGrams: 10_000,
      minReps: 6,
      maxReps: 10,
      incrementGrams: 1_000,
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "added_load_reps",
      addedLoadGrams: 10_000,
      reps: 8,
      source: "manual",
    },
    worse: {
      version: 1,
      profile: "added_load_reps",
      addedLoadGrams: 9_000,
      reps: 8,
      source: "manual",
    },
  },
  {
    identity: {
      profile: "assisted_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target: {
      version: 1,
      profile: "assisted_reps",
      assistanceGrams: 20_000,
      minReps: 8,
      maxReps: 12,
      decrementGrams: 1_000,
      assistanceEquipmentId: "machine-stack",
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "assisted_reps",
      assistanceGrams: 19_000,
      reps: 8,
      source: "manual",
    },
    worse: {
      version: 1,
      profile: "assisted_reps",
      assistanceGrams: 20_000,
      reps: 8,
      source: "manual",
    },
  },
  {
    identity: {
      profile: "timed_hold",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target: {
      version: 1,
      profile: "timed_hold",
      durationSeconds: 45,
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "timed_hold",
      durationSeconds: 45,
      source: "manual",
    },
    worse: {
      version: 1,
      profile: "timed_hold",
      durationSeconds: 44,
      source: "manual",
    },
  },
  {
    identity: {
      profile: "timed_hold",
      contractVersion: 2,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 2,
      profile: "timed_hold",
      durationMs: 45_500,
      perSide: false,
    },
    observation: {
      version: 2,
      profile: "timed_hold",
      durationMs: 45_500,
      source: "manual",
    },
    worse: {
      version: 2,
      profile: "timed_hold",
      durationMs: 45_499,
      source: "manual",
    },
  },
  {
    identity: {
      profile: "fixed_distance",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target: {
      version: 1,
      profile: "fixed_distance",
      plannedDistanceMeters: 2_000,
    },
    observation: {
      version: 1,
      profile: "fixed_distance",
      distanceMeters: 2_000,
      durationMs: 700_000,
      source: "manual",
    },
    worse: {
      version: 1,
      profile: "fixed_distance",
      distanceMeters: 2_000,
      durationMs: 700_001,
      source: "manual",
    },
  },
  {
    identity: {
      profile: "fixed_time",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target: {
      version: 1,
      profile: "fixed_time",
      plannedDurationMs: 720_000,
    },
    observation: {
      version: 1,
      profile: "fixed_time",
      durationMs: 720_000,
      distanceMeters: 2_400,
      source: "manual",
    },
    worse: {
      version: 1,
      profile: "fixed_time",
      durationMs: 720_000,
      distanceMeters: 2_399,
      source: "manual",
    },
  },
  {
    identity: {
      profile: "intervals",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target: {
      version: 1,
      profile: "intervals",
      protocolId: "自行车_30_30_6",
      comparatorId: "rounds_then_work",
      comparatorVersion: 1,
      plannedRounds: 6,
      workIntervalMs: 30_000,
      restIntervalMs: 30_000,
    },
    observation: {
      version: 1,
      profile: "intervals",
      protocolId: "自行车_30_30_6",
      completedRounds: 6,
      completedWorkMs: 180_000,
      source: "manual",
    },
    worse: {
      version: 1,
      profile: "intervals",
      protocolId: "自行车_30_30_6",
      completedRounds: 5,
      completedWorkMs: 180_000,
      source: "manual",
    },
  },
  {
    identity: {
      profile: "unscored",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target: {
      version: 1,
      profile: "unscored",
      completionRequired: true,
    },
    observation: {
      version: 1,
      profile: "unscored",
      completed: true,
      source: "manual",
    },
    worse: {
      version: 1,
      profile: "unscored",
      completed: false,
      source: "manual",
    },
  },
];

type ContractCase = (
  runtime: Phase2MetricsContractRuntime,
  adapter: Phase2MetricsContractAdapter,
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
  return "phase2_metrics_contract_failed";
}

const recoveryBackup: RecoveryBackupPort = {
  async createAndValidate(request) {
    return {
      backupId: `phase2-contract-${request.fromVersion}-${request.toVersion}`,
      databaseName: request.databaseName,
      fromVersion: request.fromVersion,
      toVersion: request.toVersion,
      validated: true,
    };
  },
};

async function migrate(
  kernel: SqliteKernel,
  maximumVersion = migrations.at(-1)?.version ?? 0,
): Promise<readonly number[]> {
  const result = await createMigrationRunner({
    databaseName: "phase2-metrics.db",
    kernel,
    migrations: migrations.filter(({ version }) => version <= maximumVersion),
    recoveryBackup,
  }).run();
  return result.appliedVersions;
}

async function seedLegacyMetricRows(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO exercises
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         metric_profile, equipment, default_rest_seconds, revision)
       VALUES
        ('metric-load', NULL, 'custom', NULL, NULL, 'Metric Load',
         'load_reps', 'barbell', 90, 1),
        ('metric-hold', NULL, 'custom', NULL, NULL, 'Metric Hold',
         'timed_hold', 'bodyweight', 60, 1)`,
    );
    await transaction.execute(
      `INSERT INTO plans
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         days_per_week, audience, goal, estimate_minutes, attribution,
         is_active, revision)
       VALUES ('metric-plan', NULL, 'custom', NULL, NULL, 'Metric Plan',
               2, 'Owner', 'Test', 20, 'Owner', 0, 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_days(id, plan_id, ordinal, name, revision)
       VALUES
        ('metric-day-load', 'metric-plan', 0, 'Load', 1),
        ('metric-day-hold', 'metric-plan', 1, 'Hold', 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_day_exercises
        (id, plan_day_id, exercise_id, ordinal,
         between_exercise_rest_seconds, revision)
       VALUES
        ('metric-occurrence-load', 'metric-day-load', 'metric-load', 0, 90, 1),
        ('metric-occurrence-hold', 'metric-day-hold', 'metric-hold', 0, 60, 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_working_set_targets
        (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps,
         target_json, unit_json, revision)
       VALUES
        ('metric-target-load', 'metric-occurrence-load', 0, 10000, 8, 12,
         '{"version":1,"profile":"load_reps","loadGrams":10000,"minReps":8,"maxReps":12,"incrementGrams":1000,"perSide":false}',
         '{"version":1,"load":"grams","count":"repetitions"}', 1),
        ('metric-target-hold', 'metric-occurrence-hold', 0, 0, 0, 0,
         '{"version":1,"profile":"timed_hold","durationSeconds":45,"perSide":false}',
         '{"version":1,"duration":"seconds"}', 1)`,
    );
    await transaction.execute(
      `INSERT INTO progression_policies
        (id, plan_day_exercise_id, policy_type, policy_version,
         rule_json, revision)
       VALUES
        ('metric-policy-load', 'metric-occurrence-load', 'load_reps', 1,
         '{"version":1}', 1),
        ('metric-policy-hold', 'metric-occurrence-hold', 'manual_hold', 1,
         '{"version":1}', 1)`,
    );
  });
}

async function seedProfileMigrationGraph(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO exercises
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         metric_profile, metric_contract_version, exercise_metric_generation,
         equipment, default_rest_seconds, revision)
       VALUES ('metric-custom-hold', NULL, 'custom', NULL, NULL,
               'Custom Hold', 'timed_hold', 1, 1, 'bodyweight', 60, 3)`,
    );
    await transaction.execute(
      `INSERT INTO exercise_library_entries
        (exercise_id, origin, canonical_name, exercise_type, movement_class,
         metric_profile, metric_contract_version, exercise_metric_generation,
         availability, revision)
       VALUES ('metric-custom-hold', 'custom', 'Custom Hold', 'strength',
               'isolation', 'timed_hold', 1, 1, 'available', 3)`,
    );
    await transaction.execute(
      `INSERT INTO plans
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         days_per_week, audience, goal, estimate_minutes, attribution,
         is_active, revision)
       VALUES ('metric-owned-plan', NULL, 'custom', NULL, NULL,
               'Metric Owned Plan', 1, 'Owner', 'Test', 20, 'Owner', 0, 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_days(id, plan_id, ordinal, name, revision)
       VALUES ('metric-owned-day', 'metric-owned-plan', 0, 'Hold', 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_day_exercises
        (id, plan_day_id, exercise_id, ordinal,
         between_exercise_rest_seconds, metric_profile,
         metric_contract_version, exercise_metric_generation, revision)
       VALUES ('metric-owned-occurrence', 'metric-owned-day',
               'metric-custom-hold', 0, 60, 'timed_hold', 1, 1, 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_working_set_targets
        (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps,
         target_json, unit_json, metric_profile, metric_contract_version,
         exercise_metric_generation, revision)
       VALUES ('metric-owned-target', 'metric-owned-occurrence', 0, 0, 0, 0,
               '{"version":1,"profile":"timed_hold","durationSeconds":45,"perSide":false}',
               '{"version":1,"duration":"seconds"}',
               'timed_hold', 1, 1, 6)`,
    );
    await transaction.execute(
      `INSERT INTO progression_policies
        (id, plan_day_exercise_id, policy_type, policy_version, rule_json,
         metric_profile, metric_contract_version, exercise_metric_generation,
         status, invalidated_at_ms, revision)
       VALUES ('metric-owned-policy', 'metric-owned-occurrence',
               'manual_hold', 1, '{"version":1}',
               'timed_hold', 1, 1, 'active', NULL, 4)`,
    );
  });
}

const contractCases: Record<Phase2MetricsContractCaseId, ContractCase> = {
  async "metrics-final-manifest-v12"({ kernel }) {
    const applied = await migrate(kernel);
    const [version] = await kernel.queryAll<{ user_version: number }>(
      "PRAGMA user_version",
    );
    invariant(
      JSON.stringify(applied.slice(0, 11))
        === JSON.stringify([1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12])
      && applied.at(-1) === version?.user_version
      && version?.user_version !== undefined
      && version.user_version >= 12
      && migrations.slice(0, 11).map(({ version: value }) => value).join(",")
        === "1,2,3,4,5,6,8,9,10,11,12"
      && migrations.at(-1)?.version === version.user_version,
      "phase2_metrics_final_manifest_invalid",
    );
  },

  async "metrics-retained-v5-v6"({ kernel }) {
    await migrate(kernel, 5);
    await seedLegacyMetricRows(kernel);
    const before = await kernel.queryAll<{
      id: string;
      target_json: string;
      unit_json: string;
    }>(
      `SELECT id, target_json, unit_json
       FROM plan_working_set_targets ORDER BY id`,
    );
    await migrate(kernel, 6);
    const after = await kernel.queryAll<{
      id: string;
      target_json: string;
      unit_json: string;
      metric_profile: string;
      metric_contract_version: number;
      exercise_metric_generation: number;
    }>(
      `SELECT id, target_json, unit_json, metric_profile,
              metric_contract_version, exercise_metric_generation
       FROM plan_working_set_targets ORDER BY id`,
    );
    invariant(
      after.length === 2
      && after.every((row, index) =>
        row.target_json === before[index]?.target_json
        && row.unit_json === before[index]?.unit_json
        && row.metric_contract_version === 1
        && row.exercise_metric_generation === 1
      )
      && after.some(({ metric_profile, target_json }) =>
        metric_profile === "timed_hold"
        && target_json.includes("\"durationSeconds\":45")
        && !target_json.includes("durationMs")
      ),
      "phase2_metrics_legacy_bytes_changed",
    );
  },

  async "metrics-nine-profile-roundtrip"() {
    invariant(
      listMetricContracts().length === 10,
      "phase2_metrics_registry_incomplete",
    );
    for (const fixture of METRIC_FIXTURES) {
      invariant(
        getMetricContract(fixture.identity).identity.profile
          === fixture.identity.profile,
        "phase2_metrics_identity_missing",
      );
      const targetBytes = serializeMetricTarget(
        fixture.identity,
        fixture.target,
      );
      const observationBytes = serializeMetricObservation(
        fixture.identity,
        fixture.observation,
      );
      invariant(
        JSON.stringify(parseMetricTarget(fixture.identity, fixture.target))
          === JSON.stringify(fixture.target)
        && JSON.stringify(
          parseMetricObservation(fixture.identity, fixture.observation),
        ) === JSON.stringify(fixture.observation)
        && JSON.stringify(JSON.parse(targetBytes)) === JSON.stringify(
          fixture.target,
        )
        && JSON.stringify(JSON.parse(observationBytes)) === JSON.stringify(
          fixture.observation,
        )
        && compareMetricObservations({
          identity: fixture.identity,
          target: fixture.target,
          left: fixture.observation,
          right: fixture.worse,
        }) === "better"
        && aggregateMetricObservations(
          fixture.identity,
          [fixture.observation, fixture.worse],
        )?.sampleSize === 2,
        "phase2_metrics_profile_contract_invalid",
      );
    }
  },

  async "metrics-profile-migration-rollback"({ kernel }) {
    await migrate(kernel);
    await seedProfileMigrationGraph(kernel);
    const before = await kernel.queryAll(
      `SELECT * FROM plan_working_set_targets
       WHERE id = 'metric-owned-target'`,
    );
    let rejected = false;
    try {
      await migrateCustomExerciseMetricProfile({
        repository: createMetricRepository(kernel),
        input: {
          exerciseId: "metric-custom-hold",
          expectedExerciseRevision: 2,
          fromIdentity: {
            profile: "timed_hold",
            contractVersion: 1,
            exerciseMetricGeneration: 1,
          },
          toIdentity: {
            profile: "timed_hold",
            contractVersion: 2,
            exerciseMetricGeneration: 2,
          },
          replacements: [{
            targetId: "metric-owned-target",
            expectedTargetRevision: 6,
            target: {
              version: 2,
              profile: "timed_hold",
              durationMs: 45_000,
              perSide: false,
            },
            unit: {
              version: 2,
              duration: "milliseconds",
            },
          }],
          policyDecisions: [{
            planDayExerciseId: "metric-owned-occurrence",
            expectedPolicyRevision: 4,
            policy: {
              kind: "manual_hold",
              version: 1,
            },
          }],
          acknowledgedHistoryImmutable: true,
          idempotencyKey: "phase2-metric-rollback",
          migratedAtMs: 1_787_000_000_000,
        },
      });
    } catch {
      rejected = true;
    }
    const after = await kernel.queryAll(
      `SELECT * FROM plan_working_set_targets
       WHERE id = 'metric-owned-target'`,
    );
    const events = await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM metric_profile_migration_events",
    );
    invariant(
      rejected
      && JSON.stringify(after) === JSON.stringify(before)
      && events[0]?.count === 0,
      "phase2_metrics_profile_rollback_invalid",
    );
  },
};

export async function createExpoPhase2MetricsContractAdapter(
  runId: string,
): Promise<Phase2MetricsContractAdapter> {
  const {
    CryptoDigestAlgorithm,
    digestStringAsync,
  } = require("expo-crypto") as typeof import("expo-crypto");
  return {
    async createRuntime(caseId) {
      return openExerciseSearchFtsContractRuntime(
        `phase2-metrics-${runId}-${caseId}.db`,
      );
    },
    sha256: (value) =>
      digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
  };
}

export async function runPhase2MetricsContract(
  adapter: Phase2MetricsContractAdapter,
): Promise<Phase2MetricsContractResult> {
  const startedAt = new Date().toISOString();
  const results: Phase2MetricsContractCaseResult[] = [];
  for (const caseId of PHASE2_METRICS_CASE_IDS) {
    const caseStartedAt = Date.now();
    let runtime: Phase2MetricsContractRuntime | undefined;
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
    contractVersion: PHASE2_METRICS_CONTRACT_VERSION,
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

export function assertPhase2MetricsContractResult(
  input: unknown,
): asserts input is Phase2MetricsContractResult {
  const result = input as Partial<Phase2MetricsContractResult> | null;
  const cases = Array.isArray(result?.cases) ? result.cases : [];
  if (
    result?.schemaVersion !== 1
    || result.contractVersion !== PHASE2_METRICS_CONTRACT_VERSION
    || result.status !== "passed"
    || result.total !== PHASE2_METRICS_CASE_IDS.length
    || result.passed !== PHASE2_METRICS_CASE_IDS.length
    || result.failed !== 0
    || result.skipped !== 0
    || cases.length !== PHASE2_METRICS_CASE_IDS.length
    || cases.some((contractCase, index) =>
      contractCase.id !== PHASE2_METRICS_CASE_IDS[index]
      || contractCase.status !== "passed"
      || contractCase.errorCode !== undefined
      || !Number.isFinite(contractCase.durationMs)
      || contractCase.durationMs < 0
    )
  ) {
    throw new Error("phase2_metrics_contract_result_invalid");
  }
}

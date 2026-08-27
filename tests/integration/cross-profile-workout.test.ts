import {
  afterEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  DatabaseSync,
  type SQLInputValue,
} from "node:sqlite";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  MetricIdentity,
  MetricObservation,
  MetricProfile,
  MetricTarget,
} from "../../src/domains/metrics";
import {
  completeSet,
  skipWorkingSet,
  updateActiveSetDraft,
} from "../../src/domains/workout/setCommands";
import {
  finishCompleted,
} from "../../src/domains/workout/finishWorkout";
import {
  startWorkout,
} from "../../src/domains/workout/startWorkout";
import {
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
  configureSqliteConnection,
} from "../../src/platform/sqlite/connection";
import {
  createMigrationRunner,
} from "../../src/platform/sqlite/migrationRunner";
import {
  migrations,
} from "../../src/platform/sqlite/migrations";
import {
  createPlansWorkoutRepository,
} from "../../src/platform/sqlite/repositories/plansWorkoutRepository";
import {
  createWorkoutOutcomeRepository,
} from "../../src/platform/sqlite/repositories/workoutOutcomeRepository";
import {
  createWorkoutRepository,
} from "../../src/platform/sqlite/repositories/workoutRepository";
import {
  createSqliteKernel,
  type SqliteKernel,
} from "../../src/platform/sqlite/sqliteKernel";

class NodePreparedResult<Row extends Record<string, unknown>>
implements SqlitePreparedResult<Row> {
  constructor(
    readonly changes: number,
    readonly lastInsertRowId: number,
    private readonly rows: readonly Row[],
  ) {}

  async getAllAsync(): Promise<readonly Row[]> {
    return this.rows;
  }
}

class NodePreparedStatement implements SqlitePreparedStatement {
  constructor(
    private readonly statement: ReturnType<DatabaseSync["prepare"]>,
  ) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly SQLInputValue[] = [],
  ): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) {
      return new NodePreparedResult(
        0,
        0,
        this.statement.all(...parameters) as Row[],
      );
    }
    const result = this.statement.run(...parameters);
    return new NodePreparedResult(
      Number(result.changes),
      Number(result.lastInsertRowid),
      [],
    );
  }

  async finalizeAsync(): Promise<void> {}
}

class NodeSqliteConnection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    return new NodePreparedStatement(this.database.prepare(sql));
  }

  async isInTransactionAsync(): Promise<boolean> {
    return this.database.isTransaction;
  }

  async closeAsync(): Promise<void> {
    this.database.close();
  }
}

type ProfileCase = Readonly<{
  name: string;
  exerciseId: string;
  identity: MetricIdentity;
  target: MetricTarget;
  observation: MetricObservation;
}>;

const profileCases: readonly ProfileCase[] = [
  {
    name: "Load + reps",
    exerciseId: "cross-load-reps",
    identity: {
      profile: "load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target: {
      version: 1,
      profile: "load_reps",
      loadGrams: 60_000,
      minReps: 6,
      maxReps: 8,
      incrementGrams: 2_500,
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "load_reps",
      loadGrams: 60_000,
      reps: 8,
      source: "manual",
    },
  },
  {
    name: "Bodyweight reps",
    exerciseId: "cross-bodyweight-reps",
    identity: {
      profile: "bodyweight_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "bodyweight_reps",
      minReps: 8,
      maxReps: 12,
      variationId: "strict",
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "bodyweight_reps",
      reps: 12,
      source: "manual",
    },
  },
  {
    name: "Added load + reps",
    exerciseId: "cross-added-load-reps",
    identity: {
      profile: "added_load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 3,
    },
    target: {
      version: 1,
      profile: "added_load_reps",
      addedLoadGrams: 10_000,
      minReps: 6,
      maxReps: 8,
      incrementGrams: 2_500,
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "added_load_reps",
      addedLoadGrams: 10_000,
      reps: 8,
      source: "manual",
    },
  },
  {
    name: "Assisted reps",
    exerciseId: "cross-assisted-reps",
    identity: {
      profile: "assisted_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 4,
    },
    target: {
      version: 1,
      profile: "assisted_reps",
      assistanceGrams: 20_000,
      minReps: 6,
      maxReps: 8,
      decrementGrams: 2_500,
      assistanceEquipmentId: "machine-stack",
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "assisted_reps",
      assistanceGrams: 20_000,
      reps: 8,
      source: "manual",
    },
  },
  {
    name: "Timed hold legacy",
    exerciseId: "cross-timed-hold-v1",
    identity: {
      profile: "timed_hold",
      contractVersion: 1,
      exerciseMetricGeneration: 5,
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
  },
  {
    name: "Timed hold milliseconds",
    exerciseId: "cross-timed-hold-v2",
    identity: {
      profile: "timed_hold",
      contractVersion: 2,
      exerciseMetricGeneration: 6,
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
      durationMs: 45_250,
      source: "manual",
    },
  },
  {
    name: "Fixed distance",
    exerciseId: "cross-fixed-distance",
    identity: {
      profile: "fixed_distance",
      contractVersion: 1,
      exerciseMetricGeneration: 7,
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
      durationMs: 720_000,
      source: "manual",
    },
  },
  {
    name: "Fixed time",
    exerciseId: "cross-fixed-time",
    identity: {
      profile: "fixed_time",
      contractVersion: 1,
      exerciseMetricGeneration: 8,
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
  },
  {
    name: "Rounds / intervals",
    exerciseId: "cross-intervals",
    identity: {
      profile: "intervals",
      contractVersion: 1,
      exerciseMetricGeneration: 9,
    },
    target: {
      version: 1,
      profile: "intervals",
      protocolId: "bike_30_30_6",
      comparatorId: "rounds_then_work",
      comparatorVersion: 1,
      plannedRounds: 6,
      workIntervalMs: 30_000,
      restIntervalMs: 30_000,
    },
    observation: {
      version: 1,
      profile: "intervals",
      protocolId: "bike_30_30_6",
      completedRounds: 6,
      completedWorkMs: 180_000,
      source: "manual",
    },
  },
  {
    name: "Mobility / unscored",
    exerciseId: "cross-unscored",
    identity: {
      profile: "unscored",
      contractVersion: 1,
      exerciseMetricGeneration: 10,
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
  },
];

const repositoryRoot = join(__dirname, "../..");
const directories = new Set<string>();
const kernels = new Set<SqliteKernel>();

afterEach(async () => {
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  kernels.clear();
  for (const directory of directories) {
    rmSync(directory, { force: true, recursive: true });
  }
  directories.clear();
});

async function setupRuntime(): Promise<Readonly<{
  kernel: SqliteKernel;
  plans: ReturnType<typeof createPlansWorkoutRepository>;
}>> {
  const directory = mkdtempSync(join(tmpdir(), "gym-cross-profile-"));
  directories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixture = new DatabaseSync(databasePath);
  fixture.exec(readFileSync(
    join(repositoryRoot, "tests/migrations/fixtures/v6-metric-profiles.sql"),
    "utf8",
  ));
  fixture.close();

  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  kernels.add(kernel);
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations,
  }).run();
  await seedAllProfiles(kernel);
  return {
    kernel,
    plans: createPlansWorkoutRepository(kernel),
  };
}

function legacyColumns(target: MetricTarget): Readonly<{
  loadGrams: number;
  minReps: number;
  maxReps: number;
}> {
  switch (target.profile) {
    case "load_reps":
      return {
        loadGrams: target.loadGrams,
        minReps: target.minReps,
        maxReps: target.maxReps,
      };
    case "bodyweight_reps":
    case "added_load_reps":
    case "assisted_reps":
      return {
        loadGrams: 0,
        minReps: target.minReps,
        maxReps: target.maxReps,
      };
    default:
      return { loadGrams: 0, minReps: 0, maxReps: 0 };
  }
}

async function seedAllProfiles(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute("DELETE FROM pending_effects");
    await transaction.execute("DELETE FROM session_undo_snapshots");
    await transaction.execute("DELETE FROM session_rest_states");
    await transaction.execute("DELETE FROM session_sets");
    await transaction.execute("DELETE FROM session_exercises");
    await transaction.execute("DELETE FROM workout_sessions");
    await transaction.execute(
      `INSERT INTO plans
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         days_per_week, audience, goal, estimate_minutes, attribution,
         is_active, revision)
       VALUES ('plan-cross-profile', NULL, 'custom', NULL, NULL,
               'All Profile Plan', 1, 'Owner', 'Contract proof', 30,
               'Owner-authored', 0, 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
       VALUES ('day-cross-profile', 'plan-cross-profile', 0,
               'All Profiles', 1)`,
    );
    for (const [ordinal, profileCase] of profileCases.entries()) {
      await transaction.execute(
        `INSERT INTO exercises
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           metric_profile, metric_contract_version,
           exercise_metric_generation, equipment, default_rest_seconds,
           revision)
         VALUES (?, NULL, 'custom', NULL, NULL, ?, ?, ?, ?, 'Unspecified',
                 0, 1)`,
        [
          profileCase.exerciseId,
          profileCase.name,
          profileCase.identity.profile,
          profileCase.identity.contractVersion,
          profileCase.identity.exerciseMetricGeneration,
        ],
      );
      const occurrenceId = `occurrence-${profileCase.exerciseId}`;
      await transaction.execute(
        `INSERT INTO plan_day_exercises
          (id, plan_day_id, exercise_id, ordinal,
           between_exercise_rest_seconds, metric_profile,
           metric_contract_version, exercise_metric_generation, revision)
         VALUES (?, 'day-cross-profile', ?, ?, 0, ?, ?, ?, 1)`,
        [
          occurrenceId,
          profileCase.exerciseId,
          ordinal,
          profileCase.identity.profile,
          profileCase.identity.contractVersion,
          profileCase.identity.exerciseMetricGeneration,
        ],
      );
      if (profileCase.identity.profile === "load_reps") {
        await transaction.execute(
          `INSERT INTO plan_warmup_sets
            (id, plan_day_exercise_id, ordinal, load_grams, reps, revision)
           VALUES ('warmup-cross-load-reps', ?, 0, 20_000, 5, 1)`,
          [occurrenceId],
        );
      }
      const columns = legacyColumns(profileCase.target);
      await transaction.execute(
        `INSERT INTO plan_working_set_targets
          (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps,
           target_json, unit_json, metric_profile, metric_contract_version,
           exercise_metric_generation, revision)
         VALUES (?, ?, 0, ?, ?, ?, ?, '{"version":1}', ?, ?, ?, 1)`,
        [
          `target-${profileCase.exerciseId}`,
          occurrenceId,
          columns.loadGrams,
          columns.minReps,
          columns.maxReps,
          JSON.stringify(profileCase.target),
          profileCase.identity.profile,
          profileCase.identity.contractVersion,
          profileCase.identity.exerciseMetricGeneration,
        ],
      );
      await transaction.execute(
        `INSERT INTO progression_policies
          (id, plan_day_exercise_id, policy_type, policy_version, rule_json,
           metric_profile, metric_contract_version,
           exercise_metric_generation, status, invalidated_at_ms, revision)
         VALUES (?, ?, ?, 1, '{"version":1,"mode":"manual"}', ?, ?, ?,
                 'active', NULL, 1)`,
        [
          `policy-${profileCase.exerciseId}`,
          occurrenceId,
          profileCase.identity.profile,
          profileCase.identity.profile,
          profileCase.identity.contractVersion,
          profileCase.identity.exerciseMetricGeneration,
        ],
      );
    }
  });
}

async function startAllProfileWorkout(
  plans: ReturnType<typeof createPlansWorkoutRepository>,
  startedAtMs: number,
) {
  return startWorkout({
    repository: plans,
    request: {
      mode: "scheduled",
      planId: "plan-cross-profile",
      planDayId: "day-cross-profile",
      localDate: "2026-08-18",
      timezone: "Asia/Singapore",
      startedAtMs,
    },
  });
}

describe("authoritative cross-profile workout adapters", () => {
  it("snapshots, drafts, completes, details, and replays every profile", async () => {
    const { kernel, plans } = await setupRuntime();
    const session = await startAllProfileWorkout(plans, 1_786_858_000_000);
    const workout = createWorkoutRepository(kernel);
    let view = await workout.getActiveWorkout(session.id);

    expect(view.exercises).toHaveLength(profileCases.length);
    for (const [index, profileCase] of profileCases.entries()) {
      const exercise = view.exercises[index]!;
      const set = exercise.workingSets[0]!;
      expect(exercise.metricIdentity).toEqual(profileCase.identity);
      expect(set.metricIdentity).toEqual(profileCase.identity);
      expect(set.target).toEqual(profileCase.target);
      expect(JSON.stringify(set.target)).toBe(JSON.stringify(profileCase.target));

      view = await updateActiveSetDraft({
        repository: workout,
        input: {
          sessionId: session.id,
          setId: set.id,
          expectedSetRevision: set.revision,
          metricIdentity: set.metricIdentity,
          observation: profileCase.observation,
          updatedAtMs: 1_786_858_001_000 + index,
        },
      });
      const drafted = view.exercises[index]!.workingSets[0]!;
      expect(drafted.observation).toEqual(profileCase.observation);

      const assertCommitted = jest.fn(async () => {
        await expect(kernel.queryAll<{
          status: string;
          observed_json: string | null;
        }>(
          "SELECT status, observed_json FROM session_sets WHERE id = ?",
          [drafted.id],
        )).resolves.toEqual([{
          status: "completed",
          observed_json: JSON.stringify(profileCase.observation),
        }]);
      });
      const input = {
        sessionId: session.id,
        setId: drafted.id,
        expectedSessionRevision: view.revision,
        expectedSetRevision: drafted.revision,
        completionIdempotencyKey: `complete-${profileCase.exerciseId}`,
        metricIdentity: drafted.metricIdentity,
        observation: profileCase.observation,
        completedAtMs: 1_786_858_002_000 + index,
      };
      const completed = await completeSet({
        repository: workout,
        haptics: { committed: assertCommitted },
        invalidate: assertCommitted,
        drainEffects: assertCommitted,
        input,
      });
      expect(completed.outcome).toBe("committed");
      expect(assertCommitted).toHaveBeenCalledTimes(3);

      await expect(completeSet({
        repository: workout,
        haptics: { committed: jest.fn(async () => undefined) },
        invalidate: jest.fn(async () => undefined),
        drainEffects: jest.fn(async () => undefined),
        input,
      })).resolves.toMatchObject({ outcome: "already_completed" });
      view = completed.view;
    }

    const warmups = view.exercises.flatMap(({ warmups: rows }) => rows);
    expect(warmups).toHaveLength(1);
    expect(warmups[0]).toMatchObject({
      kind: "warmup",
      status: "planned",
      metricIdentity: profileCases[0]!.identity,
    });
    const outcome = createWorkoutOutcomeRepository(kernel);
    const finished = await finishCompleted({
      repository: outcome,
      input: {
        sessionId: session.id,
        expectedSessionRevision: view.revision,
        endedAtMs: 1_786_858_010_000,
      },
    });
    expect(finished.detail.workingSetProgress).toEqual({
      completed: profileCases.length,
      planned: profileCases.length,
      percent: 100,
    });
    expect(finished.detail.exercises).toHaveLength(profileCases.length);
    for (const [index, profileCase] of profileCases.entries()) {
      const detail = finished.detail.exercises[index]!;
      expect(detail.metricIdentity).toEqual(profileCase.identity);
      expect(detail.workingSets[0]).toMatchObject({
        target: profileCase.target,
        observation: profileCase.observation,
      });
    }
  });

  it("skips every profile without mutating immutable targets", async () => {
    const { kernel, plans } = await setupRuntime();
    const session = await startAllProfileWorkout(plans, 1_786_858_100_000);
    const workout = createWorkoutRepository(kernel);
    let view = await workout.getActiveWorkout(session.id);

    for (const [index, profileCase] of profileCases.entries()) {
      const set = view.exercises[index]!.workingSets[0]!;
      const targetBytes = JSON.stringify(set.target);
      view = await skipWorkingSet({
        repository: workout,
        input: {
          sessionId: session.id,
          setId: set.id,
          expectedSessionRevision: view.revision,
          expectedSetRevision: set.revision,
          metricIdentity: set.metricIdentity,
          skippedAtMs: 1_786_858_101_000 + index,
        },
      });
      const skipped = view.exercises[index]!.workingSets[0]!;
      expect(skipped).toMatchObject({
        status: "skipped",
        metricIdentity: profileCase.identity,
      });
      expect(JSON.stringify(skipped.target)).toBe(targetBytes);
      expect(skipped.observation).toBeNull();
    }
  });

  it("rejects a matching profile with a different snapshot generation", async () => {
    const { kernel, plans } = await setupRuntime();
    const session = await startAllProfileWorkout(plans, 1_786_858_200_000);
    const workout = createWorkoutRepository(kernel);
    const view = await workout.getActiveWorkout(session.id);
    const set = view.currentExercise.workingSets[0]!;

    await expect(updateActiveSetDraft({
      repository: workout,
      input: {
        sessionId: session.id,
        setId: set.id,
        expectedSetRevision: set.revision,
        metricIdentity: {
          ...set.metricIdentity,
          exerciseMetricGeneration:
            set.metricIdentity.exerciseMetricGeneration + 1,
        },
        observation: profileCases[0]!.observation,
        updatedAtMs: 1_786_858_201_000,
      },
    })).rejects.toThrow("active_set_draft_conflict");
    await expect(workout.getActiveWorkout(session.id)).resolves.toMatchObject({
      revision: view.revision,
      currentExercise: {
        workingSets: [
          expect.objectContaining({
            id: set.id,
            status: "planned",
            observation: null,
            revision: set.revision,
          }),
        ],
      },
    });
  });
});

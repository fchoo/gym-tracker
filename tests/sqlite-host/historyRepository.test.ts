import {
  afterEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  configureSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import {
  createMigrationRunner,
} from "../../src/platform/sqlite/migrationRunner";
import {
  migrations,
} from "../../src/platform/sqlite/migrations";
import type {
  RecoveryBackupPort,
} from "../../src/platform/sqlite/recoveryBackup";
import {
  createHistoryRepository,
  loadEffectiveHistoryProjectionSessions,
  metricSetsFromEffectiveSnapshot,
  type EffectiveSnapshot,
} from "../../src/platform/sqlite/repositories/historyRepository";
import {
  createHistoryCommandRepository,
} from "../../src/platform/sqlite/repositories/historyCommandRepository";
import {
  createPlansWorkoutRepository,
} from "../../src/platform/sqlite/repositories/plansWorkoutRepository";
import {
  createSqliteKernel,
  type SqliteKernel,
} from "../../src/platform/sqlite/sqliteKernel";

class Result<Row extends Record<string, unknown>>
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

class Statement implements SqlitePreparedStatement {
  constructor(
    private readonly statement: ReturnType<DatabaseSync["prepare"]>,
  ) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly (null | number | string | Uint8Array)[] = [],
  ): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) {
      return new Result(0, 0, this.statement.all(...parameters) as Row[]);
    }
    const result = this.statement.run(...parameters);
    return new Result(
      Number(result.changes),
      Number(result.lastInsertRowid),
      [],
    );
  }

  async finalizeAsync(): Promise<void> {}
}

class Connection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    return new Statement(this.database.prepare(sql));
  }

  async isInTransactionAsync(): Promise<boolean> {
    return this.database.isTransaction;
  }

  async closeAsync(): Promise<void> {
    this.database.close();
  }
}

const directories = new Set<string>();
const kernels: SqliteKernel[] = [];

afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  for (const directory of directories) {
    rmSync(directory, { force: true, recursive: true });
  }
  directories.clear();
});

async function open(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-history-repository-"));
  directories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  const recoveryBackup: RecoveryBackupPort = {
    createAndValidate: async (request) => ({
      backupId: "history-repository",
      databaseName: request.databaseName,
      fromVersion: request.fromVersion,
      toVersion: request.toVersion,
      validated: true,
    }),
  };
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations,
    recoveryBackup,
  }).run();
  kernels.push(kernel);
  return kernel;
}

const loadRepsTarget = JSON.stringify({
  version: 1,
  profile: "load_reps",
  loadGrams: 40_000,
  minReps: 8,
  maxReps: 10,
  incrementGrams: 2_500,
  perSide: false,
});

async function insertSession(
  kernel: SqliteKernel,
  input: Readonly<{
    id: string;
    source: "manual" | "scheduled_day";
    status: "completed" | "partial";
    localDate: string;
    timezone: string;
    startedAtMs: number;
    completedAtMs: number;
    exercises: readonly Readonly<{
      id: string;
      exerciseId?: string;
      status: "completed" | "planned";
      sets: readonly Readonly<{
        id: string;
        kind?: "warmup" | "working";
        status: "completed" | "planned";
        observation?: Readonly<{
          loadGrams: number;
          reps: number;
        }>;
        completedAtMs?: number;
      }>[];
    }>[];
  }>,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO workout_sessions
        (id, plan_id, plan_day_id, source, status, local_date, timezone,
         started_at_ms, completed_at_ms, revision)
       VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, 1)`,
      [
        input.id,
        input.source,
        input.status,
        input.localDate,
        input.timezone,
        input.startedAtMs,
        input.completedAtMs,
      ],
    );
    for (const [exerciseOrdinal, exercise] of input.exercises.entries()) {
      const exerciseId = exercise.exerciseId ?? `exercise-${exercise.id}`;
      await transaction.execute(
        `INSERT OR IGNORE INTO exercises
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           metric_profile, metric_contract_version, exercise_metric_generation,
           equipment, default_rest_seconds, revision)
         VALUES (?, NULL, 'custom', NULL, NULL, ?, 'load_reps', 1, 1,
                 'Barbell', 90, 1)`,
        [exerciseId, `Exercise ${exercise.id}`],
      );
      await transaction.execute(
        `INSERT INTO session_exercises
          (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
           exercise_name, metric_profile, metric_contract_version,
           exercise_metric_generation, default_rest_seconds, target_revision,
           status, revision)
         VALUES (?, ?, NULL, ?, ?, ?, 'load_reps', 1, 1, 90, 1, ?, 1)`,
        [
          exercise.id,
          input.id,
          exerciseId,
          exerciseOrdinal,
          `Exercise ${exercise.id}`,
          exercise.status,
        ],
      );
      for (const [setOrdinal, set] of exercise.sets.entries()) {
        const observation = set.observation === undefined
          ? null
          : JSON.stringify({
              version: 1,
              profile: "load_reps",
              loadGrams: set.observation.loadGrams,
              reps: set.observation.reps,
              source: "manual",
            });
        await transaction.execute(
          `INSERT INTO session_sets
            (id, session_exercise_id, set_kind, ordinal, target_load_grams,
             target_min_reps, target_max_reps, target_json, unit_json,
             rule_type, rule_version, metric_profile, metric_contract_version,
             exercise_metric_generation, observed_json, completed_at_ms,
             status, revision)
           VALUES (?, ?, ?, ?, 40000, 8, 10, ?, '{}', 'load_reps',
                   1, 'load_reps', 1, 1, ?, ?, ?, 1)`,
          [
            set.id,
            exercise.id,
            set.kind ?? "working",
            setOrdinal,
            loadRepsTarget,
            observation,
            set.completedAtMs ?? (set.status === "completed"
              ? input.completedAtMs
              : null),
            set.status,
          ],
        );
      }
    }
  });
}

describe("history repository Calendar reads", () => {
  it("derives effective metric facts only from completed working sets with valid identity-bound observations", () => {
    const snapshot: EffectiveSnapshot = {
      version: 1,
      session: {
        id: "effective-session",
        source: "manual",
        status: "completed",
        planName: null,
        dayName: null,
        localDate: "2026-08-24",
        timezone: "Asia/Singapore",
        startedAtMs: 1_724_428_800_000,
        completedAtMs: 1_724_429_160_000,
      },
      exercises: [
        {
          id: "missing-identity",
          exerciseId: "skip-me",
          name: "Skip me",
          ordinal: 0,
          status: "completed",
          sets: [],
        },
        {
          id: "effective-exercise",
          exerciseId: "bench-press",
          name: "Bench press",
          ordinal: 1,
          status: "completed",
          metricIdentity: {
            profile: "load_reps",
            contractVersion: 1,
            exerciseMetricGeneration: 1,
          },
          sets: [
            {
              id: "warmup",
              kind: "warmup",
              ordinal: 0,
              status: "completed",
              target: JSON.parse(loadRepsTarget),
              observation: {
                version: 1,
                profile: "load_reps",
                loadGrams: 20_000,
                reps: 10,
                source: "manual",
              },
              completedAtMs: 1_724_429_000_000,
            },
            {
              id: "incomplete",
              kind: "working",
              ordinal: 1,
              status: "planned",
              target: JSON.parse(loadRepsTarget),
            },
            {
              id: "missing-observation",
              kind: "working",
              ordinal: 2,
              status: "completed",
              target: JSON.parse(loadRepsTarget),
              completedAtMs: 1_724_429_100_000,
            },
            {
              id: "completed-working",
              kind: "working",
              ordinal: 3,
              status: "completed",
              target: JSON.parse(loadRepsTarget),
              observation: {
                version: 1,
                profile: "load_reps",
                loadGrams: 40_000,
                reps: 8,
                source: "manual",
              },
              completedAtMs: 1_724_429_160_000,
            },
          ],
        },
      ],
    };

    expect(metricSetsFromEffectiveSnapshot(snapshot)).toEqual([
      expect.objectContaining({
        setId: "warmup",
        setKind: "warmup",
        plannedWorkingSets: 3,
        completedWorkingSets: 2,
      }),
      expect.objectContaining({
        setId: "completed-working",
        setKind: "working",
        plannedWorkingSets: 3,
        completedWorkingSets: 2,
      }),
    ]);

    expect(metricSetsFromEffectiveSnapshot({
      ...snapshot,
      session: { ...snapshot.session, status: "manual_visit" },
    })).toEqual([]);
  });

  it("rejects invalid effective snapshot identity rather than projecting corrupted history", () => {
    const snapshot: EffectiveSnapshot = {
      version: 1,
      session: {
        id: "effective-session",
        source: "manual",
        status: "completed",
        planName: null,
        dayName: null,
        localDate: "2026-08-24",
        timezone: "Asia/Singapore",
        startedAtMs: 1_724_428_800_000,
        completedAtMs: 1_724_429_160_000,
      },
      exercises: [{
        id: "invalid-identity",
        exerciseId: "bench-press",
        name: "Bench press",
        ordinal: 0,
        status: "completed",
        metricIdentity: {
          profile: "load_reps",
          contractVersion: 99,
          exerciseMetricGeneration: 1,
        },
        sets: [{
          id: "invalid-identity-working",
          kind: "working",
          ordinal: 0,
          status: "completed",
          target: JSON.parse(loadRepsTarget),
          observation: {
            version: 1,
            profile: "load_reps",
            loadGrams: 40_000,
            reps: 8,
            source: "manual",
          },
          completedAtMs: 1_724_429_160_000,
        }],
      }],
    };

    expect(() => metricSetsFromEffectiveSnapshot(snapshot))
      .toThrow("history_effective_snapshot_invalid");
  });

  it("persists the creation offset for a new session at source creation time", async () => {
    const kernel = await open();
    const repository = createPlansWorkoutRepository(kernel);

    const session = await repository.startWorkout({
      mode: "empty",
      localDate: "2026-08-24",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_428_800_000,
    });

    await expect(kernel.queryAll(
      `SELECT creation_timezone_offset_minutes
       FROM workout_sessions
       WHERE id = ?`,
      [session.id],
    )).resolves.toEqual([{
      creation_timezone_offset_minutes: 480,
    }]);
  });

  it("lists a voided effective session for restoration while ordinary Calendar excludes it", async () => {
    const kernel = await open();
    await insertSession(kernel, {
      id: "removed-session",
      source: "manual",
      status: "completed",
      localDate: "2026-08-24",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_428_800_000,
      completedAtMs: 1_724_429_160_000,
      exercises: [{
        id: "removed-exercise",
        status: "completed",
        sets: [{
          id: "removed-working-set",
          status: "completed",
          observation: { loadGrams: 40_000, reps: 8 },
        }],
      }],
    });
    const commands = createHistoryCommandRepository(kernel);
    const editor = await commands.loadCorrectionSession("removed-session");
    await commands.correctSession({
      base: editor.snapshot,
      expectedEffectiveRevision: editor.effectiveRevision,
      next: {
        ...editor.snapshot,
        session: {
          ...editor.snapshot.session,
          localDate: "2026-08-25",
        },
      },
      nowMs: 1_724_429_165_000,
    });
    await commands.voidSession({
      sessionId: "removed-session",
      expectedEffectiveRevision: 2,
      confirmation: "remove_from_history",
      nowMs: 1_724_429_170_000,
    });

    const history = createHistoryRepository(kernel);
    const calendar = await history.loadCalendarMonth({
      month: "2026-08-01",
      selectedDate: "2026-08-25",
      today: "2026-08-24",
    });

    expect(calendar.sessions).toEqual([]);
    await expect(history.listRemovedSessions()).resolves.toEqual([{
      id: "removed-session",
      sourceLabel: "Manual visit",
      planName: null,
      dayName: null,
      localDate: "2026-08-25",
      timezone: "Asia/Singapore",
      effectiveRevision: 3,
      removedAtMs: 1_724_429_170_000,
      workingSetProgress: { completed: 1, planned: 1, percent: 100 },
    }]);
  });

  it("resolves effective civil facts and counts while retaining originals and excluding voids", async () => {
    const kernel = await open();
    await insertSession(kernel, {
      id: "partial-session",
      source: "scheduled_day",
      status: "partial",
      localDate: "2026-08-24",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_428_800_000,
      completedAtMs: 1_724_429_160_000,
      exercises: [{
        id: "partial-exercise",
        status: "completed",
        sets: [
          { id: "partial-set-1", status: "completed" },
          { id: "partial-set-2", status: "planned" },
        ],
      }],
    });
    await insertSession(kernel, {
      id: "manual-session",
      source: "manual",
      status: "completed",
      localDate: "2026-08-24",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_431_200_000,
      completedAtMs: 1_724_431_560_000,
      exercises: [{
        id: "manual-exercise",
        status: "completed",
        sets: [{ id: "manual-set", status: "completed" }],
      }],
    });
    await insertSession(kernel, {
      id: "corrected-session",
      source: "scheduled_day",
      status: "completed",
      localDate: "2026-08-23",
      timezone: "Pacific/Honolulu",
      startedAtMs: 1_724_420_800_000,
      completedAtMs: 1_724_421_160_000,
      exercises: [
        {
          id: "corrected-original-exercise",
          status: "completed",
          sets: [
            { id: "corrected-original-set-1", status: "completed" },
            { id: "corrected-original-set-2", status: "planned" },
          ],
        },
        {
          id: "corrected-planned-exercise",
          status: "planned",
          sets: [{ id: "corrected-planned-set", status: "planned" }],
        },
      ],
    });
    await insertSession(kernel, {
      id: "voided-session",
      source: "scheduled_day",
      status: "completed",
      localDate: "2026-08-24",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_430_000_000,
      completedAtMs: 1_724_430_360_000,
      exercises: [{
        id: "voided-exercise",
        status: "completed",
        sets: [{ id: "voided-set", status: "completed" }],
      }],
    });
    await kernel.write((transaction) => transaction.execute(
      `UPDATE workout_sessions
       SET creation_timezone_offset_minutes = -600
       WHERE id = 'corrected-session'`,
    ));

    const correctedSnapshot = {
      version: 1,
      session: {
        id: "corrected-session",
        source: "scheduled_day",
        status: "completed",
        planName: "Recovery plan",
        dayName: "Day A",
        localDate: "2026-08-24",
        timezone: "Asia/Singapore",
        startedAtMs: 1_724_430_720_000,
        completedAtMs: 1_724_431_080_000,
      },
      exercises: [{
        id: "corrected-replacement-exercise",
        exerciseId: "replacement-exercise",
        name: "Replacement exercise",
        ordinal: 0,
        status: "completed",
        sets: [{
          id: "corrected-replacement-set",
          kind: "working",
          ordinal: 0,
          status: "completed",
        }],
      }],
    };
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO history_session_overlays
          (session_id, effective_revision, lifecycle, snapshot_json,
           effective_local_date, effective_timezone, effective_started_at_ms,
           effective_completed_at_ms, created_at_ms, updated_at_ms)
         VALUES (?, 4, 'active', ?, '2026-08-24', 'Asia/Singapore',
                 ?, ?, 1, 2)`,
        [
          "corrected-session",
          JSON.stringify(correctedSnapshot),
          correctedSnapshot.session.startedAtMs,
          correctedSnapshot.session.completedAtMs,
        ],
      );
      await transaction.execute(
        `INSERT INTO history_session_overlays
          (session_id, effective_revision, lifecycle, snapshot_json,
           effective_local_date, effective_timezone, effective_started_at_ms,
           effective_completed_at_ms, created_at_ms, updated_at_ms)
         VALUES (?, 1, 'voided', '{}', '2026-08-24', 'Asia/Singapore',
                 ?, ?, 1, 2)`,
        ["voided-session", 1_724_430_000_000, 1_724_430_360_000],
      );
      await transaction.execute(
        `INSERT INTO plans
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           days_per_week, audience, goal, estimate_minutes, attribution,
           is_active, revision)
         VALUES ('opportunity-plan', NULL, 'custom', NULL, NULL,
                 'Opportunity plan', 3, 'General', 'Strength', 45,
                 'Owner', 1, 1)`,
      );
      await transaction.execute(
        `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
         VALUES ('opportunity-day', 'opportunity-plan', 0, 'Day', 1)`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedules
          (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms)
         VALUES ('opportunity-schedule', 'opportunity-plan', 'active', 1, 1, NULL)`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_versions
          (id, schedule_id, version_number, effective_local_date, mode,
           timezone, rotation_pointer, created_at_ms)
         VALUES ('opportunity-version', 'opportunity-schedule', 1,
                 '2026-08-01', 'weekday', 'Asia/Singapore', NULL, 1)`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_opportunities
          (id, schedule_id, schedule_version_id, local_date, source,
           plan_day_id, state, outcome, session_id, revision, consumed_at_ms)
         VALUES ('opportunity-1', 'opportunity-schedule', 'opportunity-version',
                 '2026-08-24', 'weekday', 'opportunity-day', 'consumed',
                 'planned_not_completed', NULL, 1, 1)`,
      );
    });

    const history = createHistoryRepository(kernel);
    const result = await history.loadCalendarMonth({
      month: "2026-08-01",
      selectedDate: "2026-08-24",
      today: "2026-08-24",
    });

    expect(result.days.find(({ localDate }) => localDate === "2026-08-24"))
      .toEqual({
        localDate: "2026-08-24",
        states: [
          "completed",
          "partial",
          "manual",
          "planned_not_completed",
          "today",
        ],
      });
    expect(result.sessions.map(({ id }) => id)).toEqual([
      "manual-session",
      "corrected-session",
      "partial-session",
    ]);

    const corrected = result.sessions.find(({ id }) => id === "corrected-session");
    expect(corrected).toMatchObject({
      original: {
        localDate: "2026-08-23",
        timezone: "Pacific/Honolulu",
        creationTimezoneOffsetMinutes: -600,
        startedAtMs: 1_724_420_800_000,
        completedAtMs: 1_724_421_160_000,
      },
      effective: {
        lifecycle: "active",
        localDate: "2026-08-24",
        timezone: "Asia/Singapore",
        revision: 4,
        startedAtMs: 1_724_430_720_000,
        completedAtMs: 1_724_431_080_000,
      },
      exerciseProgress: { completed: 1, planned: 1, percent: 100 },
      workingSetProgress: { completed: 1, planned: 1, percent: 100 },
    });
    expect(result.sessions.map(({ id }) => id)).not.toContain("voided-session");
  });

  it("projects active raw facts and active overlays while excluding voided evidence", async () => {
    const kernel = await open();
    await insertSession(kernel, {
      id: "active-source",
      source: "manual",
      status: "completed",
      localDate: "2026-08-24",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_428_800_000,
      completedAtMs: 1_724_429_160_000,
      exercises: [{
        id: "active-source-exercise",
        exerciseId: "bench-press",
        status: "completed",
        sets: [
          {
            id: "active-source-warmup",
            kind: "warmup",
            status: "completed",
            observation: { loadGrams: 20_000, reps: 10 },
          },
          {
            id: "active-source-working",
            status: "completed",
            observation: { loadGrams: 40_000, reps: 8 },
          },
          {
            id: "active-source-working-2",
            status: "completed",
            observation: { loadGrams: 42_500, reps: 8 },
          },
        ],
      }],
    });
    await insertSession(kernel, {
      id: "corrected-source",
      source: "scheduled_day",
      status: "completed",
      localDate: "2026-08-25",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_515_200_000,
      completedAtMs: 1_724_515_560_000,
      exercises: [{
        id: "corrected-source-exercise",
        exerciseId: "bench-press",
        status: "completed",
        sets: [{
          id: "corrected-source-working",
          status: "completed",
          observation: { loadGrams: 100_000, reps: 1 },
        }],
      }],
    });
    await insertSession(kernel, {
      id: "voided-source",
      source: "scheduled_day",
      status: "completed",
      localDate: "2026-08-26",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_601_600_000,
      completedAtMs: 1_724_601_960_000,
      exercises: [{
        id: "voided-source-exercise",
        exerciseId: "bench-press",
        status: "completed",
        sets: [{
          id: "voided-source-working",
          status: "completed",
          observation: { loadGrams: 200_000, reps: 1 },
        }],
      }],
    });

    const correctedSnapshot: EffectiveSnapshot = {
      version: 1,
      session: {
        id: "corrected-source",
        source: "scheduled_day",
        status: "partial",
        planName: null,
        dayName: null,
        localDate: "2026-08-27",
        timezone: "Asia/Singapore",
        startedAtMs: 1_724_688_000_000,
        completedAtMs: 1_724_688_360_000,
      },
      exercises: [{
        id: "corrected-effective-exercise",
        exerciseId: "bench-press",
        name: "Bench press",
        ordinal: 0,
        status: "completed",
        metricIdentity: {
          profile: "load_reps",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
        sets: [{
          id: "corrected-effective-working",
          kind: "working",
          ordinal: 0,
          status: "completed",
          target: JSON.parse(loadRepsTarget),
          observation: {
            version: 1,
            profile: "load_reps",
            loadGrams: 55_000,
            reps: 10,
            source: "manual",
          },
          completedAtMs: 1_724_688_360_000,
          sourcePlanWorkingSetTargetId: "overlay-target",
        }, {
          id: "corrected-effective-working-2",
          kind: "working",
          ordinal: 1,
          status: "completed",
          target: JSON.parse(loadRepsTarget),
          observation: {
            version: 1,
            profile: "load_reps",
            loadGrams: 57_500,
            reps: 8,
            source: "manual",
          },
          completedAtMs: 1_724_688_360_000,
          sourcePlanWorkingSetTargetId: "overlay-target-2",
        }],
      }],
    };
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO plans
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           days_per_week, audience, goal, estimate_minutes, attribution,
           is_active, revision)
         VALUES ('projection-plan', NULL, 'custom', NULL, NULL,
                 'Projection plan', 1, 'Test', 'History', 30, 'Test', 0, 1)`,
      );
      await transaction.execute(
        `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
         VALUES ('projection-day', 'projection-plan', 0, 'Day', 1)`,
      );
      await transaction.execute(
        `INSERT INTO plan_day_exercises
          (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds,
           metric_profile, metric_contract_version, exercise_metric_generation, revision)
         VALUES ('projection-occurrence', 'projection-day', 'bench-press', 0, 90,
                 'load_reps', 1, 1, 1)`,
      );
      for (const [targetId, ordinal] of [
        ["raw-target", 0],
        ["raw-target-2", 1],
        ["overlay-target", 2],
        ["overlay-target-2", 3],
        ["voided-target", 4],
      ] as const) {
        await transaction.execute(
          `INSERT INTO plan_working_set_targets
            (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps,
             target_json, unit_json, metric_profile, metric_contract_version,
             exercise_metric_generation, revision)
           VALUES (?, 'projection-occurrence', ?, 40000, 8, 10, ?, '{}',
                   'load_reps', 1, 1, 1)`,
          [targetId, ordinal, loadRepsTarget],
        );
      }
      await transaction.execute(
        `UPDATE session_sets
         SET source_plan_working_set_target_id = 'raw-target'
         WHERE id = 'active-source-working'`,
      );
      await transaction.execute(
        `UPDATE session_sets
         SET source_plan_working_set_target_id = 'raw-target-2'
         WHERE id = 'active-source-working-2'`,
      );
      await transaction.execute(
        `UPDATE session_sets
         SET source_plan_working_set_target_id = 'voided-target'
         WHERE id = 'voided-source-working'`,
      );
      await transaction.execute(
        `INSERT INTO history_session_overlays
          (session_id, effective_revision, lifecycle, snapshot_json,
           effective_local_date, effective_timezone, effective_started_at_ms,
           effective_completed_at_ms, created_at_ms, updated_at_ms)
         VALUES ('corrected-source', 2, 'active', ?, '2026-08-27',
                 'Asia/Singapore', 1724688000000, 1724688360000, 1, 2)`,
        [JSON.stringify(correctedSnapshot)],
      );
      await transaction.execute(
        `INSERT INTO history_session_overlays
          (session_id, effective_revision, lifecycle, snapshot_json,
           effective_local_date, effective_timezone, effective_started_at_ms,
           effective_completed_at_ms, created_at_ms, updated_at_ms)
         VALUES ('voided-source', 2, 'voided', '{}', '2026-08-26',
                 'Asia/Singapore', 1724601600000, 1724601960000, 1, 2)`,
      );
    });

    await expect(loadEffectiveHistoryProjectionSessions(kernel)).resolves.toEqual([
      expect.objectContaining({
        sessionId: "active-source",
        localDate: "2026-08-24",
        completedExercises: 1,
        plannedExercises: 1,
        completedWorkingSets: 2,
        plannedWorkingSets: 2,
        recommendationScopes: ["legacy:raw-target", "legacy:raw-target-2"],
        metricSets: expect.arrayContaining([
          expect.objectContaining({
            setId: "active-source-warmup",
            setKind: "warmup",
          }),
          expect.objectContaining({
            setId: "active-source-working",
            setKind: "working",
          }),
        ]),
      }),
      expect.objectContaining({
        sessionId: "corrected-source",
        localDate: "2026-08-27",
        completedExercises: 1,
        plannedExercises: 1,
        completedWorkingSets: 2,
        plannedWorkingSets: 2,
        recommendationScopes: [
          "legacy:overlay-target",
          "legacy:overlay-target-2",
        ],
        metricSets: expect.arrayContaining([
          expect.objectContaining({
            setId: "corrected-effective-working",
            sessionStatus: "partial",
            observation: expect.objectContaining({ loadGrams: 55_000, reps: 10 }),
          }),
          expect.objectContaining({
            setId: "corrected-effective-working-2",
            observation: expect.objectContaining({ loadGrams: 57_500, reps: 8 }),
          }),
        ]),
      }),
    ]);
  });

  it("uses corrected effective metric facts, excludes voids, and separates warm-ups", async () => {
    const kernel = await open();
    await insertSession(kernel, {
      id: "source-complete",
      source: "scheduled_day",
      status: "completed",
      localDate: "2026-08-24",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_428_800_000,
      completedAtMs: 1_724_429_160_000,
      exercises: [{
        id: "source-complete-exercise",
        exerciseId: "bench-press",
        status: "completed",
        sets: [{
          id: "source-complete-working",
          status: "completed",
          observation: { loadGrams: 40_000, reps: 8 },
        }],
      }],
    });
    await insertSession(kernel, {
      id: "partial-complete",
      source: "scheduled_day",
      status: "partial",
      localDate: "2026-08-25",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_515_200_000,
      completedAtMs: 1_724_515_560_000,
      exercises: [{
        id: "partial-complete-exercise",
        exerciseId: "bench-press",
        status: "completed",
        sets: [
          {
            id: "partial-complete-working-1",
            status: "completed",
            observation: { loadGrams: 42_500, reps: 8 },
          },
          {
            id: "partial-complete-working-2",
            status: "completed",
            observation: { loadGrams: 42_500, reps: 9 },
          },
        ],
      }],
    });
    await insertSession(kernel, {
      id: "partial-incomplete",
      source: "scheduled_day",
      status: "partial",
      localDate: "2026-08-26",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_601_600_000,
      completedAtMs: 1_724_601_960_000,
      exercises: [{
        id: "partial-incomplete-exercise",
        exerciseId: "bench-press",
        status: "planned",
        sets: [
          {
            id: "partial-incomplete-working-1",
            status: "completed",
            observation: { loadGrams: 90_000, reps: 20 },
          },
          { id: "partial-incomplete-working-2", status: "planned" },
        ],
      }],
    });
    await insertSession(kernel, {
      id: "warmup-session",
      source: "scheduled_day",
      status: "completed",
      localDate: "2026-08-27",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_688_000_000,
      completedAtMs: 1_724_688_360_000,
      exercises: [{
        id: "warmup-exercise",
        exerciseId: "bench-press",
        status: "completed",
        sets: [
          {
            id: "warmup-set",
            kind: "warmup",
            status: "completed",
            observation: { loadGrams: 20_000, reps: 12 },
          },
          {
            id: "warmup-session-working",
            status: "completed",
            observation: { loadGrams: 42_500, reps: 10 },
          },
        ],
      }],
    });
    await insertSession(kernel, {
      id: "corrected-session",
      source: "scheduled_day",
      status: "completed",
      localDate: "2026-08-28",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_774_400_000,
      completedAtMs: 1_724_774_760_000,
      exercises: [{
        id: "corrected-original-exercise",
        exerciseId: "wrong-exercise",
        status: "completed",
        sets: [{
          id: "corrected-original-working",
          status: "completed",
          observation: { loadGrams: 100_000, reps: 20 },
        }],
      }],
    });
    await insertSession(kernel, {
      id: "voided-session",
      source: "scheduled_day",
      status: "completed",
      localDate: "2026-08-29",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_860_800_000,
      completedAtMs: 1_724_861_160_000,
      exercises: [{
        id: "voided-exercise",
        exerciseId: "bench-press",
        status: "completed",
        sets: [{
          id: "voided-working",
          status: "completed",
          observation: { loadGrams: 200_000, reps: 20 },
        }],
      }],
    });

    const correctedSnapshot = {
      version: 1,
      session: {
        id: "corrected-session",
        source: "scheduled_day",
        status: "completed",
        planName: null,
        dayName: null,
        localDate: "2026-08-28",
        timezone: "Asia/Singapore",
        startedAtMs: 1_724_774_400_000,
        completedAtMs: 1_724_774_760_000,
      },
      exercises: [{
        id: "corrected-effective-exercise",
        exerciseId: "bench-press",
        name: "Bench press",
        ordinal: 0,
        status: "completed",
        metricIdentity: {
          profile: "load_reps",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
        sets: [{
          id: "corrected-effective-working",
          kind: "working",
          ordinal: 0,
          status: "completed",
          target: JSON.parse(loadRepsTarget),
          observation: {
            version: 1,
            profile: "load_reps",
            loadGrams: 55_000,
            reps: 10,
            source: "manual",
          },
          completedAtMs: 1_724_774_760_000,
        }],
      }],
    };
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO history_session_overlays
          (session_id, effective_revision, lifecycle, snapshot_json,
           effective_local_date, effective_timezone, effective_started_at_ms,
           effective_completed_at_ms, created_at_ms, updated_at_ms)
         VALUES (?, 2, 'active', ?, '2026-08-28', 'Asia/Singapore',
                 ?, ?, 1, 2)`,
        [
          "corrected-session",
          JSON.stringify(correctedSnapshot),
          correctedSnapshot.session.startedAtMs,
          correctedSnapshot.session.completedAtMs,
        ],
      );
      await transaction.execute(
        `INSERT INTO history_session_overlays
          (session_id, effective_revision, lifecycle, snapshot_json,
           effective_local_date, effective_timezone, effective_started_at_ms,
           effective_completed_at_ms, created_at_ms, updated_at_ms)
         VALUES (?, 1, 'voided', '{}', '2026-08-29', 'Asia/Singapore',
                 ?, ?, 1, 2)`,
        ["voided-session", 1_724_860_800_000, 1_724_861_160_000],
      );
    });

    const result = await createHistoryRepository(kernel).loadExerciseMetricHistory({
      exerciseId: "bench-press",
    });

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]?.comparableSets.map(({ setId }) => setId)).toEqual([
      "corrected-effective-working",
      "warmup-session-working",
      "partial-complete-working-1",
      "partial-complete-working-2",
      "source-complete-working",
    ]);
    expect(result.segments[0]?.best?.setId).toBe("corrected-effective-working");
    expect(result.segments[0]?.last?.setId).toBe("corrected-effective-working");
    expect(result.segments[0]?.average).toMatchObject({
      profile: "load_reps",
      sampleSize: 5,
    });
    expect(result.warmupVisits.map(({ setId }) => setId)).toEqual(["warmup-set"]);
  });
});

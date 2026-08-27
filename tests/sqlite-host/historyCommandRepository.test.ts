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
  createSqliteKernel,
  type SqliteKernel,
} from "../../src/platform/sqlite/sqliteKernel";
import {
  type HistoryCorrectionSnapshot,
} from "../../src/domains/history/correctionContracts";
import {
  createHistoryCommandRepository,
} from "../../src/platform/sqlite/repositories/historyCommandRepository";
import {
  createWorkoutOutcomeRepository,
} from "../../src/platform/sqlite/repositories/workoutOutcomeRepository";

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
    return new Result(Number(result.changes), Number(result.lastInsertRowid), []);
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
  const directory = mkdtempSync(join(tmpdir(), "gym-history-command-"));
  directories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  const recoveryBackup: RecoveryBackupPort = {
    createAndValidate: async (request) => ({
      backupId: "history-command",
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

async function seed(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO workout_sessions
        (id, plan_id, plan_day_id, source, status, local_date, timezone,
         started_at_ms, completed_at_ms, revision, creation_timezone_offset_minutes)
       VALUES ('session-1', NULL, NULL, 'manual', 'completed',
               '2026-08-24', 'Asia/Singapore', 1724428800000,
               1724429160000, 7, 480)`,
    );
    await transaction.execute(
      `INSERT INTO exercises
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         metric_profile, metric_contract_version, exercise_metric_generation,
         equipment, default_rest_seconds, revision)
       VALUES ('bench-press', NULL, 'custom', NULL, NULL, 'Bench press',
               'load_reps', 1, 1, 'Barbell', 90, 1)`,
    );
    await transaction.execute(
      `INSERT INTO session_exercises
        (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
         exercise_name, metric_profile, metric_contract_version,
         exercise_metric_generation, default_rest_seconds, target_revision,
         status, effort, effort_recorded_at_ms, revision)
       VALUES ('session-exercise-1', 'session-1', NULL, 'bench-press', 0,
               'Bench press', 'load_reps', 1, 1, 90, 1, 'completed',
               'on_target', 1724429160000, 1)`,
    );
    await transaction.execute(
      `INSERT INTO plans
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         days_per_week, audience, goal, estimate_minutes, attribution, is_active, revision)
       VALUES ('history-plan', NULL, 'custom', NULL, NULL, 'History plan',
               1, 'Test', 'History', 30, 'Test', 0, 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
       VALUES ('history-day', 'history-plan', 0, 'History', 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_day_exercises
        (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds,
         metric_profile, metric_contract_version, exercise_metric_generation, revision)
       VALUES ('history-occurrence', 'history-day', 'bench-press', 0, 90,
               'load_reps', 1, 1, 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_working_set_targets
        (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps,
         target_json, unit_json, metric_profile, metric_contract_version,
         exercise_metric_generation, revision)
       VALUES ('target-1', 'history-occurrence', 0, 40000, 8, 10, ?, '{}',
               'load_reps', 1, 1, 1)`,
      [JSON.stringify({
        version: 1, profile: 'load_reps', loadGrams: 40_000, minReps: 8,
        maxReps: 10, incrementGrams: 2_500, perSide: false,
      })],
    );
    await transaction.execute(
      `INSERT INTO session_sets
        (id, session_exercise_id, set_kind, ordinal, target_load_grams,
         target_min_reps, target_max_reps, target_json, unit_json, rule_type,
         rule_version, metric_profile, metric_contract_version,
         exercise_metric_generation, observed_json, completed_at_ms, status, revision)
       VALUES ('working-set-1', 'session-exercise-1', 'working', 0, 40000,
               8, 10, ?, '{}', 'load_reps', 1, 'load_reps', 1, 1, ?,
               1724429160000, 'completed', 1)`,
      [
        JSON.stringify({
          version: 1, profile: "load_reps", loadGrams: 40_000, minReps: 8,
          maxReps: 10, incrementGrams: 2_500, perSide: false,
        }),
        JSON.stringify({
          version: 1, profile: "load_reps", loadGrams: 40_000, reps: 8,
          source: "manual",
        }),
      ],
    );
    await transaction.execute(
      `UPDATE session_sets
       SET source_plan_working_set_target_id = 'target-1'
       WHERE id = 'working-set-1'`,
    );
    await transaction.execute(
      `INSERT INTO progression_recommendations
        (id, plan_working_set_target_id, exercise_id, rule_type, rule_version,
         evidence_version, evidence_json, current_target_json, proposed_target_json,
         metric_profile, metric_contract_version, exercise_metric_generation,
         status, source_revision, target_revision, created_at_ms, decided_at_ms)
       VALUES ('pending-recommendation', 'target-1', 'bench-press', 'load_reps', 1,
               1, '{}', '{}', '{}', 'load_reps', 1, 1, 'pending', 1, 1, 1, NULL)`,
    );
  });
}

function snapshot(
  note: string | null = null,
  sessionOverrides: Partial<HistoryCorrectionSnapshot["session"]> = {},
): HistoryCorrectionSnapshot {
  return {
    version: 1,
    session: {
      id: "session-1", source: "manual", status: "completed",
      planId: null, planDayId: null, planName: null, dayName: null,
      localDate: "2026-08-24", timezone: "Asia/Singapore",
      startedAtMs: 1_724_428_800_000, completedAtMs: 1_724_429_160_000,
      ownerNote: note,
      ...sessionOverrides,
    },
    exercises: [{
      id: "session-exercise-1", exerciseId: "bench-press", name: "Bench press",
      ordinal: 0, status: "completed",
      metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
      effort: "on_target",
      sets: [{
        id: "working-set-1", kind: "working", ordinal: 0, status: "completed",
        target: {
          version: 1, profile: "load_reps", loadGrams: 40_000, minReps: 8,
          maxReps: 10, incrementGrams: 2_500, perSide: false,
        },
        observation: {
          version: 1, profile: "load_reps", loadGrams: 40_000, reps: 8,
          source: "manual",
        },
        completedAtMs: 1_724_429_160_000,
        sourcePlanWorkingSetTargetId: "target-1",
      }],
    }],
  };
}

describe("history command repository corrections", () => {
  it("writes the full overlay, immutable audit, scoped invalidation, revisions, and rebuild effects atomically", async () => {
    const kernel = await open();
    await seed(kernel);
    const repository = createHistoryCommandRepository(kernel);
    const before = snapshot();
    const next = snapshot("Grip felt uneven");

    const result = await repository.correctSession({
      base: before,
      expectedEffectiveRevision: 7,
      next,
      nowMs: 1_724_429_170_000,
    });

    expect(result.effectiveRevision).toBe(8);
    expect(await kernel.queryAll(
      "SELECT status, local_date, revision FROM workout_sessions WHERE id = 'session-1'",
    )).toEqual([{ status: "completed", local_date: "2026-08-24", revision: 7 }]);
    expect(await kernel.queryAll(
      `SELECT effective_revision, lifecycle, snapshot_json
       FROM history_session_overlays WHERE session_id = 'session-1'`,
    )).toEqual([expect.objectContaining({
      effective_revision: 8, lifecycle: "active", snapshot_json: JSON.stringify(next),
    })]);
    expect(await kernel.queryAll(
      `SELECT event_type, field_identity, effective_revision
       FROM history_audit_events WHERE session_id = 'session-1'`,
    )).toEqual([expect.objectContaining({
      event_type: "correction", field_identity: "session.ownerNote", effective_revision: 8,
    })]);
    expect(await kernel.queryAll(
      "SELECT status FROM progression_recommendations WHERE id = 'pending-recommendation'",
    )).toEqual([{ status: "invalidated" }]);
    expect(await kernel.queryAll(
      `SELECT COUNT(*) AS count FROM history_rebuild_effects
       WHERE status = 'pending'`,
    )).toEqual([{ count: 6 }]);
  });

  it("returns corrected effective history from ordinary Session Detail reads", async () => {
    const kernel = await open();
    await seed(kernel);
    const corrections = createHistoryCommandRepository(kernel);
    const base = snapshot();
    const next: HistoryCorrectionSnapshot = {
      ...base,
      session: {
        ...base.session,
        localDate: "2026-08-25",
        startedAtMs: 1_724_515_200_000,
        completedAtMs: 1_724_515_560_000,
        ownerNote: "Paused between sets for setup",
      },
      exercises: [{
        ...base.exercises[0]!,
        exerciseId: "incline-press",
        name: "Incline press",
        effort: "hard",
        sets: [{
          ...base.exercises[0]!.sets[0]!,
          target: {
            version: 1, profile: "load_reps", loadGrams: 42_500, minReps: 6,
            maxReps: 8, incrementGrams: 2_500, perSide: false,
          },
          observation: {
            version: 1, profile: "load_reps", loadGrams: 42_500, reps: 7,
            source: "manual",
          },
          completedAtMs: 1_724_515_560_000,
        }],
      }],
    };

    await corrections.correctSession({
      base,
      expectedEffectiveRevision: 7,
      next,
      nowMs: 1_724_515_570_000,
    });

    await expect(createWorkoutOutcomeRepository(kernel).getSessionDetail(
      "session-1",
    )).resolves.toMatchObject({
      id: "session-1",
      corrected: true,
      revision: 8,
      localDate: "2026-08-25",
      startedAtMs: 1_724_515_200_000,
      endedAtMs: 1_724_515_560_000,
      ownerNote: "Paused between sets for setup",
      exercises: [expect.objectContaining({
        id: "session-exercise-1",
        exerciseId: "incline-press",
        name: "Incline press",
        effort: "hard",
        workingSets: [expect.objectContaining({
          id: "working-set-1",
          value: "42.5 kg × 7",
        })],
      })],
    });
  });

  it("loads effective editor snapshots, decoded audit facts, and available replacement exercises", async () => {
    const kernel = await open();
    await seed(kernel);
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO exercise_library_entries
          (exercise_id, origin, canonical_name, exercise_type, movement_class,
           metric_profile, metric_contract_version,
           exercise_metric_generation, availability, revision)
         VALUES ('bench-press', 'custom', 'Bench press', 'strength', 'compound',
                 'load_reps', 1, 1, 'available', 1)`,
      );
      await transaction.execute(
        `INSERT INTO exercises
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           metric_profile, metric_contract_version, exercise_metric_generation,
           equipment, default_rest_seconds, revision)
         VALUES ('incline-press', NULL, 'custom', NULL, NULL, 'Incline press',
                 'load_reps', 1, 1, 'Barbell', 90, 1)`,
      );
      await transaction.execute(
        `INSERT INTO exercise_library_entries
          (exercise_id, origin, canonical_name, exercise_type, movement_class,
           metric_profile, metric_contract_version,
           exercise_metric_generation, availability, revision)
         VALUES ('incline-press', 'custom', 'Incline press', 'strength', 'compound',
                 'load_reps', 1, 1, 'available', 1)`,
      );
    });
    const repository = createHistoryCommandRepository(kernel);

    await repository.correctSession({
      base: snapshot(),
      expectedEffectiveRevision: 7,
      next: snapshot("Decoded audit note"),
      nowMs: 1_724_429_170_000,
    });

    await expect(repository.loadCorrectionSession("session-1"))
      .resolves.toMatchObject({
        effectiveRevision: 8,
        snapshot: {
          session: { ownerNote: "Decoded audit note" },
        },
        auditEvents: [expect.objectContaining({
          eventType: "correction",
          fieldIdentity: "session.ownerNote",
          before: null,
          after: "Decoded audit note",
        })],
      });
    await expect(repository.listAvailableCorrectionExercises()).resolves.toEqual([
      {
        exerciseId: "bench-press",
        name: "Bench press",
        metricIdentity: {
          profile: "load_reps",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
      },
      {
        exerciseId: "incline-press",
        name: "Incline press",
        metricIdentity: {
          profile: "load_reps",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
      },
    ]);
  });

  it("voids and restores completed history atomically without rewriting the original facts", async () => {
    const kernel = await open();
    await seed(kernel);
    const repository = createHistoryCommandRepository(kernel);

    await expect(repository.voidSession({
      sessionId: "session-1",
      expectedEffectiveRevision: 7,
      confirmation: "remove_from_history",
      nowMs: 1_724_429_170_000,
    })).resolves.toEqual({ effectiveRevision: 8, lifecycle: "voided" });
    expect(await kernel.queryAll(
      `SELECT status, local_date, revision FROM workout_sessions WHERE id = 'session-1'`,
    )).toEqual([{ status: "completed", local_date: "2026-08-24", revision: 7 }]);
    expect(await kernel.queryAll(
      `SELECT effective_revision, lifecycle, snapshot_json
       FROM history_session_overlays WHERE session_id = 'session-1'`,
    )).toEqual([expect.objectContaining({
      effective_revision: 8,
      lifecycle: "voided",
      snapshot_json: JSON.stringify(snapshot()),
    })]);
    expect(await kernel.queryAll(
      `SELECT event_type, field_identity, before_json, after_json
       FROM history_audit_events WHERE session_id = 'session-1'`,
    )).toEqual([expect.objectContaining({
      event_type: "void",
      field_identity: "session.lifecycle",
      before_json: JSON.stringify("active"),
      after_json: JSON.stringify("voided"),
    })]);
    expect(await kernel.queryAll(
      "SELECT status FROM progression_recommendations WHERE id = 'pending-recommendation'",
    )).toEqual([{ status: "invalidated" }]);

    await expect(repository.restoreSession({
      sessionId: "session-1",
      expectedEffectiveRevision: 8,
      confirmation: "restore_history",
      nowMs: 1_724_429_180_000,
    })).resolves.toEqual({ effectiveRevision: 9, lifecycle: "active" });
    expect(await kernel.queryAll(
      `SELECT effective_revision, lifecycle FROM history_session_overlays
       WHERE session_id = 'session-1'`,
    )).toEqual([{ effective_revision: 9, lifecycle: "active" }]);
    expect(await kernel.queryAll(
      `SELECT event_type, field_identity
       FROM history_audit_events WHERE session_id = 'session-1'
       ORDER BY effective_revision`,
    )).toEqual([
      { event_type: "void", field_identity: "session.lifecycle" },
      { event_type: "restore", field_identity: "session.lifecycle" },
    ]);
    await expect(repository.loadCorrectionSession("session-1"))
      .resolves.toMatchObject({
        effectiveRevision: 9,
        auditEvents: [
          expect.objectContaining({
            eventType: "restore",
            before: "voided",
            after: "active",
          }),
          expect.objectContaining({
            eventType: "void",
            before: "active",
            after: "voided",
          }),
        ],
      });
  });

  it("rejects stale or invalid lifecycle transitions without retaining partial facts", async () => {
    const kernel = await open();
    await seed(kernel);
    const repository = createHistoryCommandRepository(kernel);

    await expect(repository.restoreSession({
      sessionId: "session-1",
      expectedEffectiveRevision: 7,
      confirmation: "restore_history",
      nowMs: 1_724_429_170_000,
    })).rejects.toEqual(expect.objectContaining({
      code: "history_restore_requires_void",
    }));
    await expect(repository.voidSession({
      sessionId: "session-1",
      expectedEffectiveRevision: 6,
      confirmation: "remove_from_history",
      nowMs: 1_724_429_170_000,
    })).rejects.toEqual(expect.objectContaining({
      code: "history_lifecycle_conflict",
    }));
    expect(await kernel.queryAll(
      "SELECT * FROM history_session_overlays WHERE session_id = 'session-1'",
    )).toEqual([]);
    expect(await kernel.queryAll(
      "SELECT * FROM history_audit_events WHERE session_id = 'session-1'",
    )).toEqual([]);

    await repository.voidSession({
      sessionId: "session-1",
      expectedEffectiveRevision: 7,
      confirmation: "remove_from_history",
      nowMs: 1_724_429_180_000,
    });
    await expect(repository.voidSession({
      sessionId: "session-1",
      expectedEffectiveRevision: 8,
      confirmation: "remove_from_history",
      nowMs: 1_724_429_190_000,
    })).rejects.toEqual(expect.objectContaining({
      code: "history_remove_requires_active",
    }));
    await expect(repository.loadCorrectionSession("session-1"))
      .rejects.toEqual(expect.objectContaining({
        code: "history_correction_removed",
      }));
  });

  it("rejects a stale effective revision without persisting a partial source or derivative write", async () => {
    const kernel = await open();
    await seed(kernel);
    const repository = createHistoryCommandRepository(kernel);

    await expect(repository.correctSession({
      base: snapshot(),
      expectedEffectiveRevision: 6,
      next: snapshot("No write"),
      nowMs: 1_724_429_170_000,
    })).rejects.toEqual(expect.objectContaining({
      code: "history_correction_conflict",
    }));
    expect(await kernel.queryAll(
      "SELECT * FROM history_session_overlays WHERE session_id = 'session-1'",
    )).toEqual([]);
    expect(await kernel.queryAll(
      "SELECT * FROM history_audit_events WHERE session_id = 'session-1'",
    )).toEqual([]);
    expect(await kernel.queryAll(
      "SELECT status FROM progression_recommendations WHERE id = 'pending-recommendation'",
    )).toEqual([{ status: "pending" }]);
  });

  it("rejects a plan/day association that is not present in the source plan graph", async () => {
    const kernel = await open();
    await seed(kernel);
    const repository = createHistoryCommandRepository(kernel);
    const base = snapshot();

    await expect(repository.correctSession({
      base,
      expectedEffectiveRevision: 7,
      next: snapshot("Associated", {
        ...base.session,
        planId: "history-plan",
        planDayId: "different-day",
      }),
      nowMs: 1_724_429_170_000,
    })).rejects.toEqual(expect.objectContaining({
      code: "history_correction_association_invalid",
    }));
    expect(await kernel.queryAll(
      "SELECT * FROM history_session_overlays WHERE session_id = 'session-1'",
    )).toEqual([]);
  });

  it("rolls every correction fact and effect back when an audit insert fails", async () => {
    const kernel = await open();
    await seed(kernel);
    await kernel.write((transaction) => transaction.execute(
      `CREATE TRIGGER fail_history_correction
       BEFORE INSERT ON history_audit_events
       BEGIN SELECT RAISE(ABORT, 'audit_failure'); END`,
    ));
    const repository = createHistoryCommandRepository(kernel);

    await expect(repository.correctSession({
      base: snapshot(),
      expectedEffectiveRevision: 7,
      next: snapshot("No write"),
      nowMs: 1_724_429_170_000,
    })).rejects.toThrow("sqlite_transaction_failed");
    expect(await kernel.queryAll(
      "SELECT * FROM history_session_overlays WHERE session_id = 'session-1'",
    )).toEqual([]);
    expect(await kernel.queryAll(
      "SELECT * FROM history_audit_events WHERE session_id = 'session-1'",
    )).toEqual([]);
    expect(await kernel.queryAll(
      "SELECT status FROM progression_recommendations WHERE id = 'pending-recommendation'",
    )).toEqual([{ status: "pending" }]);
    expect(await kernel.queryAll(
      "SELECT * FROM history_rebuild_effects",
    )).toEqual([]);
  });

  it("cannot mutate or delete a correction audit record at SQLite level", async () => {
    const kernel = await open();
    await seed(kernel);
    const repository = createHistoryCommandRepository(kernel);
    await repository.correctSession({
      base: snapshot(), expectedEffectiveRevision: 7, next: snapshot("Audited"),
      nowMs: 1_724_429_170_000,
    });

    await expect(kernel.write((transaction) => transaction.execute(
      "UPDATE history_audit_events SET after_json = 'null'",
    ))).rejects.toThrow();
    await expect(kernel.write((transaction) => transaction.execute(
      "DELETE FROM history_audit_events",
    ))).rejects.toThrow();
  });
});

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
  createCsvExportRepository,
} from "../../src/platform/sqlite/repositories/csvExportRepository";
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
    return new Result(Number(result.changes), Number(result.lastInsertRowid), []);
  }

  async finalizeAsync(): Promise<void> {}
}

class Connection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}
  async execAsync(sql: string): Promise<void> { this.database.exec(sql); }
  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    return new Statement(this.database.prepare(sql));
  }
  async isInTransactionAsync(): Promise<boolean> { return this.database.isTransaction; }
  async closeAsync(): Promise<void> { this.database.close(); }
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
  const directory = mkdtempSync(join(tmpdir(), "gym-csv-export-"));
  directories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  const recoveryBackup: RecoveryBackupPort = {
    createAndValidate: async (request) => ({
      backupId: "csv-export",
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

const target = JSON.stringify({
  version: 1,
  profile: "load_reps",
  loadGrams: 40_500,
  minReps: 8,
  maxReps: 10,
  incrementGrams: 2_500,
  perSide: false,
});
const observation = JSON.stringify({
  version: 1,
  profile: "load_reps",
  loadGrams: 40_500,
  reps: 9,
  source: "manual",
});

function correctedSnapshot(sessionId: string) {
  return {
    version: 1,
    session: {
      id: sessionId,
      source: "manual",
      status: "completed",
      planId: null,
      planDayId: null,
      planName: null,
      dayName: null,
      localDate: "2026-08-25",
      timezone: "Asia/Singapore",
      startedAtMs: 1_777_000_000_000,
      completedAtMs: 1_777_000_060_000,
      ownerNote: "Corrected",
    },
    exercises: [{
      id: `${sessionId}-exercise`,
      exerciseId: "custom-exercise",
      name: "=Café, press",
      ordinal: 0,
      status: "completed",
      metricIdentity: {
        profile: "load_reps",
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      effort: "on_target",
      sets: [{
        id: `${sessionId}-warmup`,
        kind: "warmup",
        ordinal: 0,
        status: "completed",
        target: JSON.parse(target),
        observation: JSON.parse(observation),
        completedAtMs: 1_777_000_030_000,
        sourcePlanWorkingSetTargetId: "target-1",
      }, {
        id: `${sessionId}-working`,
        kind: "working",
        ordinal: 1,
        status: "completed",
        target: JSON.parse(target),
        observation: JSON.parse(observation),
        completedAtMs: 1_777_000_060_000,
        sourcePlanWorkingSetTargetId: "target-1",
      }],
    }],
  };
}

async function seed(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO exercises
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         metric_profile, metric_contract_version, exercise_metric_generation,
         equipment, default_rest_seconds, revision)
       VALUES ('custom-exercise', NULL, 'custom', NULL, NULL, ?,
               'load_reps', 1, 1, 'Barbell', 90, 1)`,
      ["=Café, \"press\"\n第二行"],
    );
    await transaction.execute(
      `INSERT INTO plans
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         days_per_week, audience, goal, estimate_minutes, attribution,
         is_active, revision)
       VALUES ('plan-1', NULL, 'custom', NULL, NULL, 'Owner plan',
               1, 'Owner', 'Strength', 45, 'Owner', 1, 1)`,
    );
    await transaction.execute(
      "INSERT INTO plan_days (id, plan_id, ordinal, name, revision) VALUES ('day-1', 'plan-1', 0, 'Day 1', 1)",
    );
    await transaction.execute(
      `INSERT INTO exercise_library_entries
        (exercise_id, origin, canonical_name, exercise_type, movement_class,
         metric_profile, metric_contract_version, exercise_metric_generation,
         availability, revision)
       VALUES ('custom-exercise', 'custom', 'Custom exercise', 'strength',
               'compound', 'load_reps', 1, 1, 'available', 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_day_exercises
        (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds,
         metric_profile, metric_contract_version, exercise_metric_generation,
         revision)
       VALUES ('occurrence-1', 'day-1', 'custom-exercise', 0, 90,
               'load_reps', 1, 1, 1)`,
    );
    for (const [id, ordinal] of [["target-1", 0], ["target-2", 1]] as const) {
      await transaction.execute(
        `INSERT INTO plan_working_set_targets
          (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps,
           target_json, unit_json, metric_profile, metric_contract_version,
           exercise_metric_generation, revision)
         VALUES (?, 'occurrence-1', ?, 40500, 8, 10, ?, '{}',
                 'load_reps', 1, 1, 1)`,
        [id, ordinal, target],
      );
    }
    await transaction.execute(
      `INSERT INTO owned_plan_day_exercises
        (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds,
         metric_profile, metric_contract_version, exercise_metric_generation,
         revision)
       VALUES ('owned-occurrence-1', 'day-1', 'custom-exercise', 0, 90,
               'load_reps', 1, 1, 1)`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_working_set_targets
        (id, plan_day_exercise_id, ordinal, target_json, unit_json,
         metric_profile, metric_contract_version, exercise_metric_generation,
         revision)
       VALUES ('owned-target-1', 'owned-occurrence-1', 0, ?, '{}',
               'load_reps', 1, 1, 1)`,
      [target],
    );

    for (const [sessionId, lifecycle] of [
      ["session-active", "active"],
      ["session-voided", "voided"],
    ] as const) {
      await transaction.execute(
        `INSERT INTO workout_sessions
          (id, plan_id, plan_day_id, source, status, local_date, timezone,
           started_at_ms, completed_at_ms, revision,
           creation_timezone_offset_minutes)
         VALUES (?, 'plan-1', 'day-1', 'manual', 'completed', '2026-08-24',
                 'Asia/Singapore', 1777000000000, 1777000060000, 1, 480)`,
        [sessionId],
      );
      await transaction.execute(
        `INSERT INTO session_exercises
          (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
           exercise_name, metric_profile, metric_contract_version,
           exercise_metric_generation, default_rest_seconds, target_revision,
           status, revision)
         VALUES (?, ?, 'occurrence-1', 'custom-exercise', 0, ?,
                 'load_reps', 1, 1, 90, 1, 'completed', 1)`,
        [`${sessionId}-exercise`, sessionId, "=Historical name"],
      );
      for (const [kind, ordinal] of [["warmup", 0], ["working", 0]] as const) {
        await transaction.execute(
          `INSERT INTO session_sets
            (id, session_exercise_id, set_kind, ordinal,
             source_plan_working_set_target_id, target_load_grams,
             target_min_reps, target_max_reps, target_json, unit_json,
             rule_type, rule_version, metric_profile, metric_contract_version,
             exercise_metric_generation, observed_json, completed_at_ms,
             status, revision)
           VALUES (?, ?, ?, ?, 'target-1', 40500, 8, 10, ?, '{}',
                   'load_reps', 1, 'load_reps', 1, 1, ?, 1777000060000,
                   'completed', 1)`,
          [
            `${sessionId}-${kind}`,
            `${sessionId}-exercise`,
            kind,
            ordinal,
            target,
            observation,
          ],
        );
      }
      const snapshot = JSON.stringify(correctedSnapshot(sessionId));
      await transaction.execute(
        `INSERT INTO history_session_overlays
          (session_id, effective_revision, lifecycle, snapshot_json,
           effective_local_date, effective_timezone, effective_started_at_ms,
           effective_completed_at_ms, created_at_ms, updated_at_ms)
         VALUES (?, 3, ?, ?, '2026-08-25', 'Asia/Singapore',
                 1777000000000, 1777000060000, 1777000061000, 1777000063000)`,
        [sessionId, lifecycle, snapshot],
      );
    }

    for (const event of [
      ["audit-correction", "session-active", 2, "correction", "session.localDate", '"2026-08-24"', '"2026-08-25"', 1_777_000_061_000],
      ["audit-void", "session-active", 2, "void", "session.lifecycle", '"active"', '"voided"', 1_777_000_062_000],
      ["audit-restore", "session-active", 3, "restore", "session.lifecycle", '"voided"', '"active"', 1_777_000_063_000],
      ["audit-current-void", "session-voided", 3, "void", "session.lifecycle", '"active"', '"voided"', 1_777_000_064_000],
    ] as const) {
      await transaction.execute(
        `INSERT INTO history_audit_events
          (id, session_id, effective_revision, event_type, field_identity,
           before_json, after_json, occurred_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        event,
      );
    }

    const evidence = (decision: string, reason: string) => JSON.stringify({
      decision,
      reasonCode: "upper_bound_complete",
      reason,
      confidence: "high",
      source: { sessionId: "session-active" },
    });
    await transaction.execute(
      `INSERT INTO progression_recommendations
        (id, exercise_id, plan_working_set_target_id, rule_type, rule_version,
         evidence_version, evidence_json, current_target_json,
         proposed_target_json, metric_profile, metric_contract_version,
         exercise_metric_generation, status, source_revision, target_revision,
         created_at_ms, decided_at_ms)
       VALUES
        ('recommendation-pending', 'custom-exercise', 'target-1', 'load_reps',
         1, 1, ?, ?, ?, 'load_reps', 1, 1, 'pending', 1, 1,
         1777000065000, NULL),
        ('recommendation-decided', 'custom-exercise', 'target-2', 'load_reps',
         1, 1, ?, ?, ?, 'load_reps', 1, 1, 'accepted', 1, 1,
         1777000066000, 1777000067000)`,
      [
        evidence("increase", "Pending review"),
        target,
        target,
        evidence("hold", "Owner kept this readable"),
        target,
        target,
      ],
    );
    for (const [id, status, decidedAtMs] of [
      ["recommendation-rejected", "rejected", 1_777_000_068_000],
      ["recommendation-invalidated", "invalidated", 1_777_000_069_000],
      ["recommendation-superseded", "superseded", 1_777_000_070_000],
    ] as const) {
      await transaction.execute(
        `INSERT INTO progression_recommendations
          (id, exercise_id, plan_working_set_target_id, rule_type, rule_version,
           evidence_version, evidence_json, current_target_json,
           proposed_target_json, metric_profile, metric_contract_version,
           exercise_metric_generation, status, source_revision, target_revision,
           created_at_ms, decided_at_ms)
         VALUES (?, 'custom-exercise', 'target-2', 'load_reps', 1, 1, ?, ?, ?,
                 'load_reps', 1, 1, ?, 1, 1, ?, ?)`,
        [
          id,
          status === "invalidated"
            ? "[]"
            : status === "rejected"
              ? JSON.stringify({
                  sessionId: "session-active",
                  sessionExerciseId: "session-active-exercise",
                  setIds: ["session-active-working"],
                  rule: { id: "load_reps.double_progression.v1", version: 1 },
                  decision: "hold",
                })
              : JSON.stringify({
                  source: { sessionId: "session-active", setIds: [1] },
                  decision: "hold",
                }),
          target,
          target,
          status,
          decidedAtMs - 500,
          decidedAtMs,
        ],
      );
    }
    await transaction.execute(
      `INSERT INTO owned_progression_recommendations
        (id, exercise_id, owned_plan_working_set_target_id, rule_type,
         rule_version, evidence_version, evidence_json, current_target_json,
         proposed_target_json, metric_profile, metric_contract_version,
         exercise_metric_generation, status, source_revision, target_revision,
         created_at_ms, decided_at_ms)
       VALUES ('recommendation-owned', 'custom-exercise', 'owned-target-1',
               'load_reps', 1, 1, ?, ?, ?, 'load_reps', 1, 1, 'accepted',
               1, 1, 1777000071000, 1777000072000)`,
      [evidence("increase", "Owned graph decision"), target, target],
    );
    await transaction.execute(
      `INSERT INTO workout_sessions
        (id, plan_id, plan_day_id, source, status, local_date, timezone,
         started_at_ms, completed_at_ms, revision,
         creation_timezone_offset_minutes)
       VALUES ('session-raw', NULL, NULL, 'manual', 'partial', '2026-08-26',
               'UTC', 1777000100000, NULL, 2, 0)`,
    );
    await transaction.execute(
      `INSERT INTO session_exercises
        (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
         exercise_name, metric_profile, metric_contract_version,
         exercise_metric_generation, default_rest_seconds, target_revision,
         status, revision)
       VALUES ('session-raw-exercise', 'session-raw', NULL, 'custom-exercise',
               0, 'Raw exercise', 'load_reps', 1, 1, 90, 1, 'active', 1)`,
    );
    await transaction.execute(
      `INSERT INTO session_exercises
        (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
         exercise_name, metric_profile, metric_contract_version,
         exercise_metric_generation, default_rest_seconds, target_revision,
         status, revision)
       VALUES ('session-raw-empty', 'session-raw', NULL, 'custom-exercise',
               1, 'No sets', 'load_reps', 1, 1, 90, 1, 'planned', 1)`,
    );
    await transaction.execute(
      `INSERT INTO session_sets
        (id, session_exercise_id, set_kind, ordinal, target_load_grams,
         target_min_reps, target_max_reps, target_json, unit_json, rule_type,
         rule_version, metric_profile, metric_contract_version,
         exercise_metric_generation, observed_json, completed_at_ms, status,
         revision, source_owned_plan_working_set_target_id)
       VALUES
        ('session-raw-planned', 'session-raw-exercise', 'warmup', 0, 40500,
         8, 10, ?, '{}', 'load_reps', 1, 'load_reps', 1, 1, NULL, NULL,
         'planned', 1, NULL),
        ('session-raw-owned', 'session-raw-exercise', 'working', 1, 40500,
         8, 10, ?, '{}', 'load_reps', 1, 'load_reps', 1, 1, ?,
         1777000101000, 'completed', 1, 'owned-target-1')`,
      [target, target, observation],
    );
  });
}

describe("CSV export SQLite read model", () => {
  it("returns an empty deterministic v1 dataset without writes", async () => {
    const kernel = await open();
    const before = await kernel.queryAll<{ changes: number }>("SELECT total_changes() AS changes");
    const repository = createCsvExportRepository({
      ...kernel,
      queryAll: async () => { throw new Error("csv_export_read_outside_snapshot"); },
      write: (command) => kernel.write((transaction) => command({
        queryAll: transaction.queryAll,
        execute: async () => { throw new Error("csv_export_source_mutation"); },
      })),
    });

    await expect(repository.readRows()).resolves.toEqual([]);
    await expect(kernel.queryAll<{ changes: number }>("SELECT total_changes() AS changes"))
      .resolves.toEqual(before);
  });

  it("reads corrected, voided/restored, warmup/working, and recommendation facts in stable source order", async () => {
    const kernel = await open();
    await seed(kernel);
    const repository = createCsvExportRepository(kernel);

    const first = await repository.readRows();
    const second = await repository.readRows();
    expect(second).toEqual(first);
    expect(first.map(({ record_type }) => record_type)).toEqual(
      expect.arrayContaining([
        "session", "session_exercise", "session_set",
        "history_audit", "recommendation",
      ]),
    );

    expect(first).toEqual(expect.arrayContaining([
      expect.objectContaining({
        record_type: "session_set",
        session_id: "session-active",
        session_lifecycle: "active",
        session_original_local_date: "2026-08-24",
        session_original_timezone: "Asia/Singapore",
        session_original_started_at_epoch_ms: 1_777_000_000_000,
        session_effective_local_date: "2026-08-25",
        session_effective_timezone: "Asia/Singapore",
        session_corrected: true,
        exercise_name: "=Café, press",
        set_kind: "warmup",
        target_load_grams: 40_500,
        observed_load_grams: 40_500,
        observed_reps: 9,
        source_target_graph: "legacy",
        source_target_id: "target-1",
      }),
      expect.objectContaining({
        record_type: "session",
        session_id: "session-voided",
        session_lifecycle: "voided",
        session_corrected: false,
      }),
      expect.objectContaining({
        record_type: "history_audit",
        audit_event_type: "restore",
        audit_before_json: '"voided"',
        audit_after_json: '"active"',
      }),
      expect.objectContaining({
        record_type: "recommendation",
        recommendation_id: "recommendation-pending",
        recommendation_status: "pending",
        recommendation_decision: "increase",
        recommendation_decided_at_utc: null,
      }),
      expect.objectContaining({
        record_type: "recommendation",
        recommendation_id: "recommendation-decided",
        recommendation_status: "accepted",
        recommendation_decision: "hold",
        recommendation_decided_at_utc: expect.stringMatching(/Z$/u),
      }),
      expect.objectContaining({
        record_type: "recommendation",
        recommendation_id: "recommendation-owned",
        recommendation_target_graph: "owned",
        recommendation_status: "accepted",
      }),
    ]));
    expect(first.filter(({ record_type }) => record_type === "recommendation")
      .map(({ recommendation_status }) => recommendation_status))
      .toEqual(expect.arrayContaining([
        "pending", "accepted", "rejected", "invalidated", "superseded",
      ]));
    expect(first.filter(({ record_type }) => record_type === "session_set"))
      .toHaveLength(6);
    expect(first.filter(({ record_type, session_id }) =>
      record_type === "session_set" && session_id === "session-active"
    ).map(({ set_id }) => set_id)).toEqual([
      "session-active-warmup",
      "session-active-working",
    ]);
    expect(first).toEqual(expect.arrayContaining([
      expect.objectContaining({
        session_id: "session-raw",
        session_corrected: false,
        session_original_completed_at_utc: null,
        set_id: "session-raw-planned",
        observation_json: null,
        source_target_graph: null,
      }),
      expect.objectContaining({
        set_id: "session-raw-owned",
        source_target_graph: "owned",
        source_target_id: "owned-target-1",
      }),
    ]));
    expect(first.some(({ exercise_name }) =>
      exercise_name === "=Historical name"
    )).toBe(false);

    const csv = await repository.serialize();
    expect(new TextDecoder().decode(csv)).toContain("'=Café");
    await expect(repository.serialize()).resolves.toEqual(csv);
  });

  it("maps malformed source values to one safe repository error", async () => {
    const kernel = await open();
    const repository = createCsvExportRepository({
      ...kernel,
      write: async (command) => command({
        execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
        queryAll: async (sql) => {
          if (sql.includes("FROM workout_sessions")) {
            return [{
              id: "broken", source: "manual", status: "completed",
              local_date: "2026-08-24", timezone: "UTC",
              creation_timezone_offset_minutes: 0, started_at_ms: 9e15,
              completed_at_ms: null, revision: 1, effective_revision: null,
              lifecycle: null, snapshot_json: null,
            }] as never;
          }
          return [] as never;
        },
      }),
    });
    await expect(repository.readRows()).rejects.toEqual(expect.objectContaining({
      code: "csv_export_collection_failed",
      correlationCode: "GT-CSV02",
    }));

    const unsafeTimestamp = createCsvExportRepository({
      ...kernel,
      write: async (command) => command({
        execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
        queryAll: async (sql) => sql.includes("FROM workout_sessions")
          ? [{
              id: "broken", source: "manual", status: "completed",
              local_date: "2026-08-24", timezone: "UTC",
              creation_timezone_offset_minutes: 0,
              started_at_ms: Number.MAX_VALUE, completed_at_ms: null,
              revision: 1, effective_revision: null, lifecycle: null,
              snapshot_json: null,
            }] as never
          : [] as never,
      }),
    });
    await expect(unsafeTimestamp.readRows()).rejects.toEqual(
      expect.objectContaining({ code: "csv_export_collection_failed" }),
    );

    const malformedEvidence = createCsvExportRepository({
      ...kernel,
      write: async (command) => command({
        execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
        queryAll: async (sql) => sql.includes("FROM progression_recommendations")
          ? [{
              target_graph: "legacy", id: "bad-evidence",
              exercise_id: "exercise", target_id: "target",
              rule_type: "load_reps", rule_version: 1, evidence_json: "{",
              current_target_json: "{}", proposed_target_json: "{}",
              status: "invalidated", created_at_ms: 1, decided_at_ms: null,
            }] as never
          : [] as never,
      }),
    });
    await expect(malformedEvidence.readRows()).rejects.toEqual(
      expect.objectContaining({ code: "csv_export_collection_failed" }),
    );

    const wrongOverlayIdentity = createCsvExportRepository({
      ...kernel,
      write: async (command) => command({
        execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
        queryAll: async (sql) => sql.includes("FROM workout_sessions")
          ? [{
              id: "source", source: "manual", status: "completed",
              local_date: "2026-08-24", timezone: "UTC",
              creation_timezone_offset_minutes: 0, started_at_ms: 1,
              completed_at_ms: 2, revision: 1, effective_revision: 2,
              lifecycle: "active",
              snapshot_json: JSON.stringify(correctedSnapshot("other")),
            }] as never
          : [] as never,
      }),
    });
    await expect(wrongOverlayIdentity.readRows()).rejects.toEqual(
      expect.objectContaining({ code: "csv_export_collection_failed" }),
    );
  });
});

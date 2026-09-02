import {
  afterEach,
  describe,
  expect,
  it,
  jest,
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
import {
  createExerciseSearchIndexRepository,
} from "../../src/platform/sqlite/repositories/exerciseSearchIndexRepository";
import {
  createEffectStore,
} from "../../src/platform/sqlite/effects/effectStore";
import {
  createHistoryProjectionRepository,
  type HistoryProjectionRepository,
} from "../../src/platform/sqlite/repositories/historyProjectionRepository";
import {
  createRestoreReconciliationRepository,
} from "../../src/platform/sqlite/repositories/restoreReconciliationRepository";
import {
  createSqliteKernel,
  type SqliteStatementResult,
  type SqliteKernel,
  type SqliteTransactionExecutor,
} from "../../src/platform/sqlite/sqliteKernel";
import type {
  RecoveryBackupPort,
} from "../../src/platform/sqlite/recoveryBackup";

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

  async isInTransactionAsync(): Promise<boolean> {
    return this.database.isTransaction;
  }

  async closeAsync(): Promise<void> { this.database.close(); }
}

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

async function open(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-restore-reconciliation-"));
  directories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  kernels.add(kernel);
  const recoveryBackup: RecoveryBackupPort = {
    createAndValidate: async (request) => ({
      backupId: "restore-reconciliation",
      databaseName: request.databaseName,
      fromVersion: request.fromVersion,
      toVersion: request.toVersion,
      validated: true,
    }),
  };
  await createMigrationRunner({
    databaseName: databasePath,
    kernel,
    migrations,
    recoveryBackup,
  }).run();
  return kernel;
}

async function seedRestoredSource(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO exercises
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         metric_profile, metric_contract_version, exercise_metric_generation,
         equipment, default_rest_seconds, revision)
       VALUES ('owner-bench', NULL, 'custom', NULL, NULL, 'Owner bench',
               'load_reps', 1, 1, 'Barbell', 90, 1)`,
    );
    await transaction.execute(
      `INSERT INTO exercise_library_entries
        (exercise_id, origin, canonical_name, exercise_type, movement_class,
         metric_profile, metric_contract_version, exercise_metric_generation,
         availability, revision)
       VALUES ('owner-bench', 'custom', 'Owner bench', 'strength', 'compound',
               'load_reps', 1, 1, 'available', 1)`,
    );
    await transaction.execute(
      `INSERT INTO exercise_search_terms
        (exercise_id, kind, ordinal, display_text, normalized_text)
       VALUES ('owner-bench', 'canonical', 0, 'Owner bench', 'owner bench')`,
    );
    await transaction.execute(
      `INSERT INTO workout_sessions
        (id, plan_id, plan_day_id, source, status, local_date, timezone,
         started_at_ms, completed_at_ms, revision,
         creation_timezone_offset_minutes)
       VALUES ('restored-session', NULL, NULL, 'manual', 'completed',
               '2026-08-24', 'Asia/Singapore', 1724428800000,
               1724429160000, 1, 480)`,
    );
    await transaction.execute(
      `INSERT INTO session_exercises
        (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
         exercise_name, metric_profile, metric_contract_version,
         exercise_metric_generation, default_rest_seconds, target_revision,
         status, revision)
       VALUES ('restored-session-exercise', 'restored-session', NULL,
               'owner-bench', 0, 'Owner bench', 'load_reps', 1, 1, 90, 1,
               'completed', 1)`,
    );
    await transaction.execute(
      `INSERT INTO session_sets
        (id, session_exercise_id, set_kind, ordinal, target_load_grams,
         target_min_reps, target_max_reps, target_json, unit_json, rule_type,
         rule_version, metric_profile, metric_contract_version,
         exercise_metric_generation, observed_json, completed_at_ms, status,
         revision)
       VALUES ('restored-working-set', 'restored-session-exercise', 'working',
               0, 40000, 8, 10,
               '{"version":1,"profile":"load_reps","loadGrams":40000,"minReps":8,"maxReps":10,"incrementGrams":2500,"perSide":false}',
               '{}', 'load_reps', 1, 'load_reps', 1, 1,
               '{"version":1,"profile":"load_reps","loadGrams":40000,"reps":8,"source":"manual"}',
               1724429160000, 'completed', 1)`,
    );
    await transaction.execute(
      `UPDATE portability_restore_state
       SET state = 'rebuild_pending', updated_at_ms = 1
       WHERE id = 1`,
    );
  });
}

async function sourceFacts(kernel: SqliteKernel): Promise<unknown> {
  const [exercises, sessions, sets] = await Promise.all([
    kernel.queryAll("SELECT id, origin, name FROM exercises ORDER BY id"),
    kernel.queryAll("SELECT id, status, local_date FROM workout_sessions ORDER BY id"),
    kernel.queryAll("SELECT id, session_exercise_id, observed_json FROM session_sets ORDER BY id"),
  ]);
  return { exercises, sessions, sets };
}

async function seedPreRestoreEffects(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    for (const [id, effectType, status] of [
      ["stale-recommendation", "regenerate_load_reps_recommendation", "pending"],
      ["stale-rest", "reconcile_rest_notification", "processing"],
      ["completed-audit", "reconcile_rest_notification", "completed"],
    ] as const) {
      const processing = status === "processing";
      await transaction.execute(
        `INSERT INTO pending_effects
          (id, effect_type, payload_version, payload_json, idempotency_key,
           subject_id, expected_revision, status, attempt_count, next_attempt_at_ms,
           claimed_at_ms, lease_expires_at_ms, last_error_code, created_at_ms,
           updated_at_ms)
         VALUES (?, ?, 1, ?, ?, 'restored-session', ?, ?, 1, 1, ?, ?,
                 ?, 1, ?)`,
        [
          id,
          effectType,
          JSON.stringify({ version: 1, sessionId: "restored-session", sessionRevision: 1 }),
          `restore:${id}`,
          status === "completed" ? 2 : 1,
          status,
          processing ? 1 : null,
          processing ? 31_000 : null,
          status === "completed" ? "completed_before_restore" : null,
          status === "completed" ? 2 : 1,
        ],
      );
    }
  });
}

function repository(kernel: SqliteKernel, failSearch = false) {
  const search = createExerciseSearchIndexRepository(kernel);
  return createRestoreReconciliationRepository(kernel, {
    history: createHistoryProjectionRepository(kernel),
    nowMs: () => 99,
    search: failSearch
      ? {
          rebuildSearchIndex: async () => { throw new Error("injected_search_rebuild_failure"); },
          verifyParity: search.verifyParity,
        }
      : search,
  });
}

function fakeTransactionExecutor(
  onExecute?: (sql: string) => SqliteStatementResult,
): SqliteTransactionExecutor {
  return {
    execute: async (sql) => onExecute?.(sql) ?? { changes: 1, lastInsertRowId: 0 },
    queryAll: async () => [],
  };
}

function fakeKernel(
  queryAll: (
    sql: string,
  ) => Promise<readonly Record<string, unknown>[]>,
  onExecute?: (sql: string) => SqliteStatementResult,
): SqliteKernel {
  return {
    write: async <Result>(
      command: (transaction: SqliteTransactionExecutor) => Promise<Result>,
    ) => command(fakeTransactionExecutor(onExecute)),
    queryAll: async <Row extends Record<string, unknown>>(sql: string) =>
      await queryAll(sql) as unknown as readonly Row[],
    connectionConfiguration: async () => ({
      reader: {
        busyTimeoutMs: 0,
        foreignKeys: true,
        journalMode: "delete",
        recursiveTriggers: true,
      },
      writer: {
        busyTimeoutMs: 0,
        foreignKeys: true,
        journalMode: "delete",
        recursiveTriggers: true,
      },
    }),
    close: async () => undefined,
  };
}

function stubHistoryRepository(
  dumpProjectionRows: HistoryProjectionRepository["dumpProjectionRows"],
): HistoryProjectionRepository {
  return {
    advanceAndEnqueue: async () => [],
    currentRevision: async () => null,
    freshness: async () => "current",
    rebuildSubject: async () => "applied",
    rebuildAll: async () => undefined,
    dumpProjectionRows,
    loadFreshness: async () => "current",
  };
}

function loadRepsTarget(loadGrams: number): string {
  return JSON.stringify({
    version: 1,
    profile: "load_reps",
    loadGrams,
    minReps: 8,
    maxReps: 10,
    incrementGrams: 2500,
    perSide: false,
  });
}

function loadRepsObservation(loadGrams: number, reps: number): string {
  return JSON.stringify({
    version: 1,
    profile: "load_reps",
    loadGrams,
    reps,
    source: "manual",
  });
}

describe("restore reconciliation repository", () => {
  it("rebuilds local FTS and all history/progress/recommendation derivatives from committed source facts", async () => {
    const kernel = await open();
    await seedRestoredSource(kernel);

    await expect(repository(kernel).reconcileAndRebuild()).resolves.toEqual({
      outcome: "rebuilt",
      state: "ready",
      unavailableCatalogReferences: 0,
    });
    await expect(kernel.queryAll(
      "SELECT state, updated_at_ms FROM portability_restore_state",
    )).resolves.toEqual([{ state: "ready", updated_at_ms: 99 }]);
    await expect(createExerciseSearchIndexRepository(kernel).verifyParity())
      .resolves.toMatchObject({ exact: true });
    await expect(kernel.queryAll(
      "SELECT applied_revision FROM history_projection_freshness ORDER BY subject_id",
    )).resolves.toHaveLength(5);
    await expect(kernel.queryAll(
      "SELECT set_id FROM history_projection_comparable_exposures",
    )).resolves.toEqual([{ set_id: "restored-working-set" }]);
    await expect(kernel.queryAll(
      "SELECT local_date, completed_working_sets FROM history_projection_period_inputs",
    )).resolves.toHaveLength(2);
  });

  it("retains retryable pending state and committed source facts when any post-commit rebuild fails", async () => {
    const kernel = await open();
    await seedRestoredSource(kernel);
    const before = await sourceFacts(kernel);

    await expect(repository(kernel, true).reconcileAndRebuild()).resolves.toEqual({
      outcome: "retryable_failure",
      state: "rebuild_pending",
      unavailableCatalogReferences: 0,
    });
    await expect(kernel.queryAll(
      "SELECT state FROM portability_restore_state",
    )).resolves.toEqual([{ state: "rebuild_pending" }]);
    await expect(sourceFacts(kernel)).resolves.toEqual(before);

    await expect(repository(kernel).reconcileAndRebuild()).resolves.toMatchObject({
      outcome: "rebuilt",
      state: "ready",
    });
  });

  it("supersedes imported replayable effects before rebuild, retaining terminal audit history across a retry", async () => {
    const kernel = await open();
    await seedRestoredSource(kernel);
    await seedPreRestoreEffects(kernel);
    const before = await sourceFacts(kernel);

    await expect(repository(kernel, true).reconcileAndRebuild()).resolves.toEqual({
      outcome: "retryable_failure",
      state: "rebuild_pending",
      unavailableCatalogReferences: 0,
    });
    await expect(sourceFacts(kernel)).resolves.toEqual(before);
    await expect(kernel.queryAll(
      `SELECT id, status, claimed_at_ms, lease_expires_at_ms, last_error_code, updated_at_ms
       FROM pending_effects
       ORDER BY id`,
    )).resolves.toEqual([
      {
        id: "completed-audit",
        status: "completed",
        claimed_at_ms: null,
        lease_expires_at_ms: null,
        last_error_code: "completed_before_restore",
        updated_at_ms: 2,
      },
      {
        id: "stale-recommendation",
        status: "superseded",
        claimed_at_ms: null,
        lease_expires_at_ms: null,
        last_error_code: "restore_source_replaced",
        updated_at_ms: 99,
      },
      {
        id: "stale-rest",
        status: "superseded",
        claimed_at_ms: null,
        lease_expires_at_ms: null,
        last_error_code: "restore_source_replaced",
        updated_at_ms: 99,
      },
    ]);
    await expect(kernel.queryAll(
      "SELECT state FROM portability_restore_state",
    )).resolves.toEqual([{ state: "rebuild_pending" }]);

    await expect(repository(kernel).reconcileAndRebuild()).resolves.toMatchObject({
      outcome: "rebuilt",
      state: "ready",
    });
    await expect(sourceFacts(kernel)).resolves.toEqual(before);
    await expect(createEffectStore(kernel).claimNext({
      nowMs: 100, leaseDurationMs: 30_000, maxAttempts: 5,
    })).resolves.toBeNull();
    await expect(kernel.queryAll(
      `SELECT id, status, updated_at_ms FROM pending_effects ORDER BY id`,
    )).resolves.toEqual([
      { id: "completed-audit", status: "completed", updated_at_ms: 2 },
      { id: "stale-recommendation", status: "superseded", updated_at_ms: 99 },
      { id: "stale-rest", status: "superseded", updated_at_ms: 99 },
    ]);
  });

  it("does not import or replace bundled authority while reporting unavailable local references", async () => {
    const kernel = await open();
    await seedRestoredSource(kernel);
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO content_pack_revisions
          (id, namespace, revision, source_commit, pack_sha256,
           manifest_sha256, license_sha256, review_status, accepted_at_ms)
         VALUES ('local-catalog-revision', 'gym-tracker.catalog', 7, 'commit',
                 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                 'accepted', 1)`,
      );
      await transaction.execute(
        `INSERT INTO exercise_library_entries
          (exercise_id, origin, canonical_name, exercise_type, movement_class,
           metric_profile, metric_contract_version, exercise_metric_generation,
           availability, revision)
         VALUES ('retained-unavailable', 'bundled', 'Retained unavailable',
                 'strength', 'compound', 'load_reps', 1, 1, 'unavailable', 7)`,
      );
      await transaction.execute(
        `INSERT INTO exercise_catalog_sources
          (exercise_id, content_revision_id, source_namespace, source_revision,
           upstream_id, canonical_name, exercise_type, movement_class,
           metric_profile, metric_contract_version, exercise_metric_generation,
           availability, license, attribution, legacy_link_status,
           linked_upstream_id, revision)
         VALUES ('retained-unavailable', 'local-catalog-revision',
                 'gym-tracker.catalog', '7', 'retained-unavailable',
                 'Retained unavailable', 'strength', 'compound', 'load_reps',
                 1, 1, 'unavailable', 'CC0', 'Gym Tracker',
                 'not_applicable', NULL, 7)`,
      );
      await transaction.execute(
        `INSERT INTO exercise_owner_preferences
          (exercise_id, favorite, hidden, archived, revision, updated_at_ms)
         VALUES ('retained-unavailable', 1, 0, 0, 1, 1)`,
      );
    });

    await expect(repository(kernel).reconcileAndRebuild()).resolves.toEqual({
      outcome: "rebuilt",
      state: "ready",
      unavailableCatalogReferences: 1,
    });
    await expect(kernel.queryAll(
      "SELECT exercise_id, origin, availability, revision FROM exercise_library_entries WHERE exercise_id = 'retained-unavailable'",
    )).resolves.toEqual([{
      exercise_id: "retained-unavailable",
      origin: "bundled",
      availability: "unavailable",
      revision: 7,
    }]);
  });

  it("does no derivative work when the committed restore state is already ready", async () => {
    const kernel = await open();
    const search = createExerciseSearchIndexRepository(kernel);
    const history = createHistoryProjectionRepository(kernel);
    const rebuildSearchIndex = jest.fn(search.rebuildSearchIndex);
    const rebuildAll = jest.fn(history.rebuildAll);

    await expect(createRestoreReconciliationRepository(kernel, {
      history: { ...history, rebuildAll },
      nowMs: () => 99,
      search: { ...search, rebuildSearchIndex },
    }).reconcileAndRebuild()).resolves.toEqual({
      outcome: "already_ready",
      state: "ready",
      unavailableCatalogReferences: 0,
    });
    expect(rebuildSearchIndex).not.toHaveBeenCalled();
    expect(rebuildAll).not.toHaveBeenCalled();
  });

  it("keeps a pending restore retryable when the singleton state is malformed", async () => {
    const kernel = {
      queryAll: jest.fn(async () => []),
    } as unknown as SqliteKernel;

    await expect(repository(kernel).reconcileAndRebuild()).resolves
      .toEqual({
        outcome: "retryable_failure",
        state: "rebuild_pending",
        unavailableCatalogReferences: 0,
      });
  });

  it("retains pending state when final freshness or parity cannot be proven", async () => {
    const kernel = await open();
    await seedRestoredSource(kernel);
    const search = createExerciseSearchIndexRepository(kernel);

    await expect(createRestoreReconciliationRepository(kernel, {
      history: {
        ...createHistoryProjectionRepository(kernel),
        dumpProjectionRows: async () => ({
          recordCandidates: [],
          comparableExposures: [],
          metricAggregates: [],
          periodInputs: [],
          recommendationScopes: [],
        }),
      },
      nowMs: () => 99,
      search,
    }).reconcileAndRebuild()).resolves.toEqual({
      outcome: "retryable_failure",
      state: "rebuild_pending",
      unavailableCatalogReferences: 0,
    });
    await expect(kernel.queryAll(
      "SELECT state FROM portability_restore_state",
    )).resolves.toEqual([{ state: "rebuild_pending" }]);
  });

  it("retries fail-closed when unavailable catalog reconciliation count is malformed", async () => {
    const kernel = fakeKernel(async (sql) => {
      if (sql.includes("FROM portability_restore_state")) {
        return [{ state: "rebuild_pending", updated_at_ms: 7 }];
      }
      if (sql.includes("COUNT(DISTINCT source.exercise_id)")) {
        return [{ count: -1 }];
      }
      return [];
    });

    await expect(createRestoreReconciliationRepository(kernel, {
      history: stubHistoryRepository(async () => ({
        recordCandidates: [],
        comparableExposures: [],
        metricAggregates: [],
        periodInputs: [],
        recommendationScopes: [],
      })),
      nowMs: () => 99,
      search: {
        rebuildSearchIndex: async () => ({
          sourceTermCount: 0,
          indexedTermCount: 0,
          missingSourceTermIds: [],
          extraIndexedTermIds: [],
          integrityOk: true,
          exact: true,
        }),
        verifyParity: async () => ({
          sourceTermCount: 0,
          indexedTermCount: 0,
          missingSourceTermIds: [],
          extraIndexedTermIds: [],
          integrityOk: true,
          exact: true,
        }),
      },
    }).reconcileAndRebuild()).resolves.toEqual({
      outcome: "retryable_failure",
      state: "rebuild_pending",
      unavailableCatalogReferences: 0,
    });
  });

  it("covers recommendation subjects and projection tie-breakers while failing closed on parity mismatch", async () => {
    const exerciseA = "bench-e\u0301";
    const exerciseB = "bench-é";
    const scopeA = "legacy:cafe\u0301";
    const scopeB = "legacy:café";
    const revisionRows = [
      {
        subject_id: "history-subject/v1:[\"date\",\"2026-08-24\"]",
        revision: 1,
        applied_revision: 1,
      },
    ];
    let projectionWasCompared = false;
    const kernel = fakeKernel(
      async (sql) => {
        if (sql.includes("FROM portability_restore_state")) {
          return [{ state: "rebuild_pending", updated_at_ms: 11 }];
        }
        if (sql.includes("COUNT(DISTINCT source.exercise_id)")) {
          return [{ count: 0 }];
        }
        if (sql.includes("FROM workout_sessions ws")) {
          return [
            {
              id: "session-z",
              source: "manual",
              status: "completed",
              local_date: "2026-08-26",
              timezone: "Asia/Singapore",
              started_at_ms: 10,
              completed_at_ms: 20,
              creation_timezone_offset_minutes: 480,
              revision: 1,
              plan_name: null,
              day_name: null,
              effective_revision: null,
              lifecycle: null,
              snapshot_json: null,
              effective_local_date: null,
              effective_timezone: null,
              effective_started_at_ms: null,
              effective_completed_at_ms: null,
            },
            {
              id: "session-a",
              source: "manual",
              status: "completed",
              local_date: "2026-08-24",
              timezone: "Asia/Singapore",
              started_at_ms: 30,
              completed_at_ms: 40,
              creation_timezone_offset_minutes: 480,
              revision: 1,
              plan_name: null,
              day_name: null,
              effective_revision: null,
              lifecycle: null,
              snapshot_json: null,
              effective_local_date: null,
              effective_timezone: null,
              effective_started_at_ms: null,
              effective_completed_at_ms: null,
            },
            {
              id: "session-b",
              source: "manual",
              status: "completed",
              local_date: "2026-08-25",
              timezone: "Asia/Singapore",
              started_at_ms: 50,
              completed_at_ms: 60,
              creation_timezone_offset_minutes: 480,
              revision: 1,
              plan_name: null,
              day_name: null,
              effective_revision: null,
              lifecycle: null,
              snapshot_json: null,
              effective_local_date: null,
              effective_timezone: null,
              effective_started_at_ms: null,
              effective_completed_at_ms: null,
            },
          ];
        }
        if (sql.includes("SELECT se.session_id,")) {
          return [
            {
              session_id: "session-z",
              completed_exercises: 0,
              planned_exercises: 0,
              completed_working_sets: 0,
              planned_working_sets: 0,
            },
            {
              session_id: "session-a",
              completed_exercises: 1,
              planned_exercises: 1,
              completed_working_sets: 1,
              planned_working_sets: 1,
            },
            {
              session_id: "session-b",
              completed_exercises: 1,
              planned_exercises: 1,
              completed_working_sets: 1,
              planned_working_sets: 1,
            },
          ];
        }
        if (sql.includes("FROM workout_sessions session")) {
          return [
            {
              session_id: "session-a",
              local_date: "2026-08-24",
              session_status: "completed",
              exercise_id: exerciseA,
              exercise_name: "Bench A",
              metric_profile: "load_reps",
              metric_contract_version: 1,
              exercise_metric_generation: 1,
              set_id: "set-z",
              set_kind: "working",
              set_ordinal: 1,
              set_status: "completed",
              target_json: loadRepsTarget(40000),
              observed_json: loadRepsObservation(40000, 8),
              completed_at_ms: 1_724_083_200_000,
              planned_working_sets: 1,
              completed_working_sets: 1,
            },
            {
              session_id: "session-b",
              local_date: "2026-08-25",
              session_status: "completed",
              exercise_id: exerciseB,
              exercise_name: "Bench B",
              metric_profile: "load_reps",
              metric_contract_version: 1,
              exercise_metric_generation: 1,
              set_id: "set-a",
              set_kind: "working",
              set_ordinal: 0,
              set_status: "completed",
              target_json: loadRepsTarget(42000),
              observed_json: loadRepsObservation(42000, 9),
              completed_at_ms: 1_724_169_600_000,
              planned_working_sets: 1,
              completed_working_sets: 1,
            },
          ];
        }
        if (sql.includes("'legacy:' || set_row.source_plan_working_set_target_id")) {
          return [
            { session_id: "session-a", scope_id: scopeA },
            { session_id: "session-b", scope_id: scopeB },
          ];
        }
        if (sql.includes("FROM history_subject_revisions subject")) {
          projectionWasCompared = true;
          return revisionRows;
        }
        return [];
      },
      (sql) => ({
        changes: sql.includes("UPDATE portability_restore_state") ? 1 : 1,
        lastInsertRowId: 0,
      }),
    );

    await expect(createRestoreReconciliationRepository(kernel, {
      history: stubHistoryRepository(async () => ({
        recordCandidates: [],
        comparableExposures: [],
        metricAggregates: [],
        periodInputs: [],
        recommendationScopes: [],
      })),
      nowMs: () => 99,
      search: {
        rebuildSearchIndex: async () => ({
          sourceTermCount: 2,
          indexedTermCount: 2,
          missingSourceTermIds: [],
          extraIndexedTermIds: [],
          integrityOk: true,
          exact: true,
        }),
        verifyParity: async () => ({
          sourceTermCount: 2,
          indexedTermCount: 2,
          missingSourceTermIds: [],
          extraIndexedTermIds: [],
          integrityOk: true,
          exact: true,
        }),
      },
    }).reconcileAndRebuild()).resolves.toEqual({
      outcome: "retryable_failure",
      state: "rebuild_pending",
      unavailableCatalogReferences: 0,
    });
    expect(projectionWasCompared).toBe(true);
  });
});

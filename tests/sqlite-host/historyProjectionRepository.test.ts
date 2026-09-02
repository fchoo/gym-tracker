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
  HistoryProjectionEffectError,
  createHistoryProjectionEffectRunner,
  createHistoryProjectionEffectStore,
} from "../../src/platform/sqlite/effects/historyProjectionEffects";
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
  advanceHistoryProjectionSubjects,
  createHistoryProjectionRepository,
  invalidateAndAdvanceHistoryProjectionSubjects,
  invalidateHistoryRecommendationScopes,
} from "../../src/platform/sqlite/repositories/historyProjectionRepository";
import {
  createSqliteKernel,
  type SqliteKernel,
  SqliteStorageError,
} from "../../src/platform/sqlite/sqliteKernel";
import {
  collectHistorySubjects,
  type EffectiveHistorySubjectSnapshot,
} from "../../src/domains/history/historySubjects";
import type {
  MetricTarget,
} from "../../src/domains/metrics";

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
  constructor(
    private readonly database: DatabaseSync,
    private readonly onPrepare?: (sql: string) => void,
    private readonly onExec?: (sql: string) => void,
  ) {}

  async execAsync(sql: string): Promise<void> {
    this.onExec?.(sql);
    this.database.exec(sql);
  }

  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    this.onPrepare?.(sql);
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

async function open(input: Readonly<{
  onWriterPrepare?: (sql: string) => void;
  onWriterExec?: (sql: string) => void;
}> = {}): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-history-projection-"));
  directories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const writer = new Connection(
    new DatabaseSync(databasePath),
    input.onWriterPrepare,
    input.onWriterExec,
  );
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  const recoveryBackup: RecoveryBackupPort = {
    createAndValidate: async (request) => ({
      backupId: "history-projection",
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

const target: MetricTarget = {
  version: 1,
  profile: "load_reps",
  loadGrams: 40_000,
  minReps: 8,
  maxReps: 10,
  incrementGrams: 2_500,
  perSide: false,
};

const subjectSnapshot: EffectiveHistorySubjectSnapshot = {
  sessionId: "session-1",
  localDate: "2026-08-24",
  lifecycle: "active",
  exercises: [{
    exerciseId: "bench-press",
    identity: {
      profile: "load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target,
    recommendationTargetIds: [],
  }],
};

const ALL_PERIOD_SUBJECT_ID = 'history-subject/v1:["period","all"]';

async function insertEffectiveSource(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO workout_sessions
        (id, plan_id, plan_day_id, source, status, local_date, timezone,
         started_at_ms, completed_at_ms, revision,
         creation_timezone_offset_minutes)
       VALUES ('session-1', NULL, NULL, 'manual', 'completed',
               '2026-08-24', 'Asia/Singapore', 1724428800000,
               1724429160000, 1, 480)`,
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
         status, revision)
       VALUES ('session-exercise-1', 'session-1', NULL, 'bench-press', 0,
               'Bench press', 'load_reps', 1, 1, 90, 1, 'completed', 1)`,
    );
    for (const [id, kind, loadGrams, reps] of [
      ["working-set", "working", 40_000, 8],
      ["warmup-set", "warmup", 20_000, 12],
    ] as const) {
      await transaction.execute(
        `INSERT INTO session_sets
          (id, session_exercise_id, set_kind, ordinal, target_load_grams,
           target_min_reps, target_max_reps, target_json, unit_json,
           rule_type, rule_version, metric_profile, metric_contract_version,
           exercise_metric_generation, observed_json, completed_at_ms,
           status, revision)
         VALUES (?, 'session-exercise-1', ?, 0, ?, 8, 10, ?, '{}',
                 'load_reps', 1, 'load_reps', 1, 1, ?, 1724429160000,
                 'completed', 1)`,
        [
          id,
          kind,
          loadGrams,
          JSON.stringify({ ...target, loadGrams }),
          JSON.stringify({
            version: 1,
            profile: "load_reps",
            loadGrams,
            reps,
            source: "manual",
          }),
        ],
      );
    }
  });
}

function subjects() {
  return collectHistorySubjects({
    oldSnapshot: subjectSnapshot,
    newSnapshot: subjectSnapshot,
  });
}

async function insertRecommendationScopeFixtures(
  kernel: SqliteKernel,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO plans
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         days_per_week, audience, goal, estimate_minutes, attribution,
         is_active, revision)
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
    for (const [id, ordinal] of [
      ['legacy-target', 0],
      ['legacy-target-other', 1],
    ] as const) {
      await transaction.execute(
        `INSERT INTO plan_working_set_targets
          (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps,
           target_json, unit_json, metric_profile, metric_contract_version,
           exercise_metric_generation, revision)
         VALUES (?, 'history-occurrence', ?, 40000, 8, 10, ?, '{}',
                 'load_reps', 1, 1, 1)`,
        [id, ordinal, JSON.stringify(target)],
      );
    }
    await transaction.execute(
      `INSERT INTO exercise_library_entries
        (exercise_id, origin, canonical_name, exercise_type, movement_class,
         metric_profile, metric_contract_version,
         exercise_metric_generation, availability, revision)
       VALUES ('bench-press', 'custom', 'Bench press', 'strength', 'compound',
               'load_reps', 1, 1, 'available', 1)`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_day_exercises
        (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds,
         metric_profile, metric_contract_version, exercise_metric_generation, revision)
       VALUES ('owned-history-occurrence', 'history-day', 'bench-press', 0, 90,
               'load_reps', 1, 1, 1)`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_working_set_targets
        (id, plan_day_exercise_id, ordinal, target_json, unit_json,
         metric_profile, metric_contract_version, exercise_metric_generation, revision)
       VALUES ('owned-target', 'owned-history-occurrence', 0, ?, '{}',
               'load_reps', 1, 1, 1)`,
      [JSON.stringify(target)],
    );

    for (const [sessionId, legacyTargetId, ownedTargetId] of [
      ['session-1', 'legacy-target', null],
      ['owned-session', null, 'owned-target'],
      ['unrelated-session', 'legacy-target-other', null],
    ] as const) {
      if (sessionId !== 'session-1') {
        await transaction.execute(
          `INSERT INTO workout_sessions
            (id, plan_id, plan_day_id, source, status, local_date, timezone,
             started_at_ms, completed_at_ms, revision,
             creation_timezone_offset_minutes)
           VALUES (?, NULL, NULL, 'manual', 'completed',
                   '2026-08-24', 'Asia/Singapore', 1724428800000,
                   1724429160000, 1, 480)`,
          [sessionId],
        );
        await transaction.execute(
          `INSERT INTO session_exercises
            (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
             exercise_name, metric_profile, metric_contract_version,
             exercise_metric_generation, default_rest_seconds, target_revision,
             status, revision)
           VALUES (?, ?, NULL, 'bench-press', 0, 'Bench press',
                   'load_reps', 1, 1, 90, 1, 'completed', 1)`,
          [`${sessionId}-exercise`, sessionId],
        );
      }
      const sessionExerciseId = sessionId === 'session-1'
        ? 'session-exercise-1'
        : `${sessionId}-exercise`;
      await transaction.execute(
        `UPDATE session_sets
         SET source_plan_working_set_target_id = ?,
             source_owned_plan_working_set_target_id = ?
         WHERE id = ?`,
        [legacyTargetId, ownedTargetId, sessionId === 'session-1'
          ? 'working-set'
          : `${sessionId}-set`],
      );
      if (sessionId !== 'session-1') {
        await transaction.execute(
          `INSERT INTO session_sets
            (id, session_exercise_id, set_kind, ordinal,
             source_plan_working_set_target_id,
             source_owned_plan_working_set_target_id, target_load_grams,
             target_min_reps, target_max_reps, target_json, unit_json, rule_type,
             rule_version, metric_profile, metric_contract_version,
             exercise_metric_generation, observed_json, completed_at_ms,
             status, revision)
           VALUES (?, ?, 'working', 0, ?, ?, 40000, 8, 10, ?, '{}',
                   'load_reps', 1, 'load_reps', 1, 1, ?, 1724429160000,
                   'completed', 1)`,
          [
            `${sessionId}-set`,
            sessionExerciseId,
            legacyTargetId,
            ownedTargetId,
            JSON.stringify(target),
            JSON.stringify({
              version: 1,
              profile: 'load_reps',
              loadGrams: 40_000,
              reps: 8,
              source: 'manual',
            }),
          ],
        );
      }
    }

    for (const [id, targetId] of [
      ['legacy-recommendation', 'legacy-target'],
      ['legacy-other-recommendation', 'legacy-target-other'],
    ] as const) {
      await transaction.execute(
        `INSERT INTO progression_recommendations
          (id, exercise_id, plan_working_set_target_id, rule_type, rule_version,
           evidence_version, evidence_json, current_target_json, proposed_target_json,
           metric_profile, metric_contract_version, exercise_metric_generation, status,
           source_revision, target_revision, created_at_ms, decided_at_ms)
         SELECT ?, occurrence.exercise_id, target.id, 'load_reps', 1, 1, '{}',
                target.target_json, target.target_json, target.metric_profile,
                target.metric_contract_version, target.exercise_metric_generation,
                'pending', target.revision, target.revision, 1, NULL
         FROM plan_working_set_targets target
         JOIN plan_day_exercises occurrence
           ON occurrence.id = target.plan_day_exercise_id
         WHERE target.id = ?`,
        [id, targetId],
      );
    }
    await transaction.execute(
      `INSERT INTO owned_progression_recommendations
        (id, exercise_id, owned_plan_working_set_target_id, rule_type, rule_version,
         evidence_version, evidence_json, current_target_json, proposed_target_json,
         metric_profile, metric_contract_version, exercise_metric_generation, status,
         source_revision, target_revision, created_at_ms, decided_at_ms)
       SELECT 'owned-recommendation', occurrence.exercise_id, target.id,
              'load_reps', 1, 1, '{}', target.target_json, target.target_json,
              target.metric_profile, target.metric_contract_version,
              target.exercise_metric_generation, 'pending', target.revision,
              target.revision, 1, NULL
       FROM owned_plan_working_set_targets target
       JOIN owned_plan_day_exercises occurrence
         ON occurrence.id = target.plan_day_exercise_id
       WHERE target.id = 'owned-target'`,
    );

    for (const [id, subjectId, status] of [
      ['effect-legacy', 'session-1', 'pending'],
      ['effect-owned', 'owned-session', 'processing'],
      ['effect-unrelated', 'unrelated-session', 'pending'],
    ] as const) {
      const processing = status === 'processing';
      await transaction.execute(
        `INSERT INTO pending_effects
          (id, effect_type, payload_version, payload_json, idempotency_key,
           subject_id, expected_revision, status, attempt_count, next_attempt_at_ms,
           claimed_at_ms, lease_expires_at_ms, last_error_code, created_at_ms,
           updated_at_ms)
         VALUES (?, 'regenerate_load_reps_recommendation', 1, ?, ?, ?, 1, ?, 0,
                 1, ?, ?, NULL, 1, 1)`,
        [
          id,
          JSON.stringify({ version: 1, sessionId: subjectId, sessionRevision: 1 }),
          `recommend:${subjectId}:1`,
          subjectId,
          status,
          processing ? 1 : null,
          processing ? 31_000 : null,
        ],
      );
    }
  });
}

describe("history projection repository", () => {
  it("keeps subject revisions and rebuild effects inside the caller transaction", async () => {
    const kernel = await open();
    const repository = createHistoryProjectionRepository(kernel);
    const fanout = subjects();

    await expect(kernel.write(async (transaction) => {
      await advanceHistoryProjectionSubjects(transaction, {
        subjects: fanout,
        nowMs: 100,
      });
      throw new Error('rollback_projection_subjects');
    })).rejects.toMatchObject({ code: 'sqlite_transaction_failed' });

    await expect(repository.currentRevision(fanout[0]!.id)).resolves.toBeNull();
    await expect(kernel.queryAll<{ count: number }>(
      'SELECT COUNT(*) AS count FROM history_rebuild_effects',
    )).resolves.toEqual([{ count: 0 }]);
  });

  it("returns bounded freshness only when every requested subject has its current watermark", async () => {
    const kernel = await open();
    await insertEffectiveSource(kernel);
    const repository = createHistoryProjectionRepository(kernel);
    const store = createHistoryProjectionEffectStore(kernel);
    const runner = createHistoryProjectionEffectRunner({ repository, store });
    const fanout = subjects();

    expect(await repository.loadFreshness({ subjectIds: [] })).toBe('unavailable');
    expect(await repository.loadFreshness({
      subjectIds: ['history-subject/v1:["session","missing"]'],
    })).toBe('unavailable');

    await repository.advanceAndEnqueue({ subjects: fanout, nowMs: 100 });
    expect(await repository.loadFreshness({
      subjectIds: [fanout[0]!.id, fanout[1]!.id, fanout[0]!.id],
    })).toBe('updating');
    await runner.drain({ nowMs: 200, limit: 32 });
    expect(await repository.loadFreshness({
      subjectIds: [fanout[0]!.id, fanout[1]!.id],
    })).toBe('current');

    await repository.advanceAndEnqueue({ subjects: [fanout[0]!], nowMs: 300 });
    expect(await repository.loadFreshness({
      subjectIds: [fanout[0]!.id, fanout[1]!.id],
    })).toBe('updating');
    expect(await repository.loadFreshness({
      subjectIds: [fanout[1]!.id, 'history-subject/v1:["session","missing"]'],
    })).toBe('unavailable');
  });

  it("invalidates only matching recommendation targets and their active source-session effects", async () => {
    const kernel = await open();
    await insertEffectiveSource(kernel);
    await insertRecommendationScopeFixtures(kernel);

    await kernel.write((transaction) => invalidateHistoryRecommendationScopes(
      transaction,
      {
        scopes: ['legacy:legacy-target', 'owned:owned-target'],
        nowMs: 500,
      },
    ));

    await expect(kernel.queryAll(
      `SELECT id, status, decided_at_ms
       FROM progression_recommendations
       ORDER BY id`,
    )).resolves.toEqual([
      { id: 'legacy-other-recommendation', status: 'pending', decided_at_ms: null },
      { id: 'legacy-recommendation', status: 'invalidated', decided_at_ms: 500 },
    ]);
    await expect(kernel.queryAll(
      `SELECT id, status, decided_at_ms
       FROM owned_progression_recommendations
       ORDER BY id`,
    )).resolves.toEqual([{
      id: 'owned-recommendation',
      status: 'invalidated',
      decided_at_ms: 500,
    }]);
    await expect(kernel.queryAll(
      `SELECT id, status, claimed_at_ms, lease_expires_at_ms, last_error_code
       FROM pending_effects
       ORDER BY id`,
    )).resolves.toEqual([
      {
        id: 'effect-legacy',
        status: 'superseded',
        claimed_at_ms: null,
        lease_expires_at_ms: null,
        last_error_code: 'history_source_changed',
      },
      {
        id: 'effect-owned',
        status: 'superseded',
        claimed_at_ms: null,
        lease_expires_at_ms: null,
        last_error_code: 'history_source_changed',
      },
      {
        id: 'effect-unrelated',
        status: 'pending',
        claimed_at_ms: null,
        lease_expires_at_ms: null,
        last_error_code: null,
      },
    ]);
  });

  it("normalizes duplicate out-of-order legacy and owned invalidation scopes", async () => {
    const kernel = await open();
    await insertEffectiveSource(kernel);
    await insertRecommendationScopeFixtures(kernel);
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO owned_plan_working_set_targets
          (id, plan_day_exercise_id, ordinal, target_json, unit_json,
           metric_profile, metric_contract_version, exercise_metric_generation,
           revision)
         SELECT 'owned-target-second', plan_day_exercise_id, 1, target_json,
                unit_json, metric_profile, metric_contract_version,
                exercise_metric_generation, revision
         FROM owned_plan_working_set_targets
         WHERE id = 'owned-target'`,
      );
      await transaction.execute(
        `INSERT INTO owned_progression_recommendations
          (id, exercise_id, owned_plan_working_set_target_id, rule_type,
           rule_version, evidence_version, evidence_json, current_target_json,
           proposed_target_json, metric_profile, metric_contract_version,
           exercise_metric_generation, status, source_revision, target_revision,
           created_at_ms, decided_at_ms)
         SELECT 'owned-second-recommendation', exercise_id,
                'owned-target-second', rule_type, rule_version, evidence_version,
                evidence_json, current_target_json, proposed_target_json,
                metric_profile, metric_contract_version,
                exercise_metric_generation, 'pending', source_revision,
                target_revision, created_at_ms, NULL
         FROM owned_progression_recommendations
         WHERE id = 'owned-recommendation'`,
      );
    });

    await kernel.write((transaction) => invalidateHistoryRecommendationScopes(
      transaction,
      {
        scopes: [
          'owned:owned-target-second',
          'legacy:legacy-target-other',
          'owned:owned-target',
          'legacy:legacy-target',
          'owned:owned-target-second',
          'legacy:legacy-target',
          'legacy:',
          'unknown:ignored',
        ],
        nowMs: 600,
      },
    ));

    await expect(kernel.queryAll(
      `SELECT id, status, decided_at_ms
       FROM progression_recommendations
       ORDER BY id`,
    )).resolves.toEqual([
      {
        id: 'legacy-other-recommendation',
        status: 'invalidated',
        decided_at_ms: 600,
      },
      {
        id: 'legacy-recommendation',
        status: 'invalidated',
        decided_at_ms: 600,
      },
    ]);
    await expect(kernel.queryAll(
      `SELECT id, status, decided_at_ms
       FROM owned_progression_recommendations
       ORDER BY id`,
    )).resolves.toEqual([
      {
        id: 'owned-recommendation',
        status: 'invalidated',
        decided_at_ms: 600,
      },
      {
        id: 'owned-second-recommendation',
        status: 'invalidated',
        decided_at_ms: 600,
      },
    ]);
  });

  it("rolls back recommendation invalidation with its subject fan-out", async () => {
    const kernel = await open();
    await insertEffectiveSource(kernel);
    await insertRecommendationScopeFixtures(kernel);
    const repository = createHistoryProjectionRepository(kernel);
    const fanout = subjects();

    await expect(kernel.write(async (transaction) => {
      await invalidateAndAdvanceHistoryProjectionSubjects(transaction, {
        subjects: fanout,
        recommendationScopes: ['legacy:legacy-target', 'owned:owned-target'],
        nowMs: 500,
      });
      throw new Error('rollback_history_fanout');
    })).rejects.toMatchObject({ code: 'sqlite_transaction_failed' });

    await expect(kernel.queryAll(
      `SELECT status FROM progression_recommendations
       WHERE id = 'legacy-recommendation'`,
    )).resolves.toEqual([{ status: 'pending' }]);
    await expect(kernel.queryAll(
      `SELECT status FROM owned_progression_recommendations
       WHERE id = 'owned-recommendation'`,
    )).resolves.toEqual([{ status: 'pending' }]);
    await expect(repository.currentRevision(fanout[0]!.id)).resolves.toBeNull();
    await expect(kernel.queryAll<{ count: number }>(
      'SELECT COUNT(*) AS count FROM history_rebuild_effects',
    )).resolves.toEqual([{ count: 0 }]);
  });

  it("drains revision-fenced targeted effects and exactly matches a full canonical rebuild", async () => {
    let sourceProjectionQueries = 0;
    let writerTransactions = 0;
    const kernel = await open({
      onWriterPrepare(sql) {
        if (sql.includes("FROM workout_sessions ws")) {
          sourceProjectionQueries += 1;
        }
      },
      onWriterExec(sql) {
        if (sql === "BEGIN IMMEDIATE") {
          writerTransactions += 1;
        }
      },
    });
    await insertEffectiveSource(kernel);
    const repository = createHistoryProjectionRepository(kernel);
    const effectStore = createHistoryProjectionEffectStore(kernel);
    const runner = createHistoryProjectionEffectRunner({
      repository,
      store: effectStore,
    });
    const fanout = subjects();

    await repository.advanceAndEnqueue({ subjects: fanout, nowMs: 100 });
    writerTransactions = 0;
    expect(await repository.freshness(fanout[0]!.id)).toBe("updating");
    const drained = await runner.drain({ nowMs: 200, limit: 32 });
    expect(drained.claimed).toBe(fanout.length);
    expect(sourceProjectionQueries).toBe(1);
    expect(writerTransactions).toBe(3);
    expect(await kernel.queryAll<{ status: string; last_error_code: string | null }>(
      `SELECT status, last_error_code
       FROM history_rebuild_effects
       ORDER BY id`,
    )).toEqual(Array.from({ length: fanout.length }, () => ({
      status: "completed",
      last_error_code: null,
    })));

    const targeted = await repository.dumpProjectionRows();
    expect(targeted.comparableExposures).toHaveLength(1);
    expect(targeted.comparableExposures[0]).toMatchObject({
      set_id: "working-set",
      exercise_id: "bench-press",
    });
    expect(targeted.recordCandidates).toHaveLength(1);
    expect(targeted.metricAggregates).toHaveLength(1);
    expect(targeted.periodInputs).toEqual([
      expect.objectContaining({
        subject_id: 'history-subject/v1:["period","2026-08-24"]',
        local_date: "2026-08-24",
        comparable_exposure_count: 1,
      }),
      expect.objectContaining({
        subject_id: ALL_PERIOD_SUBJECT_ID,
        local_date: "2026-08-24",
        comparable_exposure_count: 1,
      }),
    ]);
    await expect(kernel.queryAll(
      `SELECT local_date, comparable_exposure_count
       FROM history_projection_period_inputs
       WHERE subject_id = ?`,
      [ALL_PERIOD_SUBJECT_ID],
    )).resolves.toEqual([{
      local_date: '2026-08-24',
      comparable_exposure_count: 1,
    }]);

    await repository.rebuildAll({ nowMs: 300 });
    expect(await repository.dumpProjectionRows()).toEqual(targeted);
    expect(await repository.freshness(fanout[0]!.id)).toBe("current");
  });

  it("supersedes a stale claimed effect before it can write projection rows or freshness", async () => {
    const kernel = await open();
    await insertEffectiveSource(kernel);
    const repository = createHistoryProjectionRepository(kernel);
    const store = createHistoryProjectionEffectStore(kernel);
    const runner = createHistoryProjectionEffectRunner({ repository, store });
    const fanout = subjects();

    await repository.advanceAndEnqueue({ subjects: fanout, nowMs: 100 });
    const claimed = await store.claimNext({
      nowMs: 101,
      leaseDurationMs: 30_000,
      maxAttempts: 5,
    });
    expect(claimed).not.toBeNull();

    await repository.advanceAndEnqueue({ subjects: fanout, nowMs: 102 });
    const replacement = await repository.rebuildSubject({
      subjectId: claimed!.subjectId,
      expectedRevision: claimed!.expectedRevision,
      nowMs: 103,
    });
    expect(replacement).toBe("stale");
    await store.supersede(claimed!.id, "stale_source_revision", 103);
    expect(await repository.dumpProjectionRows()).toEqual({
      comparableExposures: [],
      metricAggregates: [],
      periodInputs: [],
      recommendationScopes: [],
      recordCandidates: [],
    });

    const result = await runner.drain({ nowMs: 104, limit: 64 });
    expect(result.completed).toBe(fanout.length);
    expect(await repository.freshness(claimed!.subjectId)).toBe("current");
    expect((await store.findById(claimed!.id))?.status).toBe("superseded");
  });

  it("maps mixed batch outcomes to completed and superseded effect terminals", async () => {
    const kernel = await open();
    await insertEffectiveSource(kernel);
    const repository = createHistoryProjectionRepository(kernel);
    const store = createHistoryProjectionEffectStore(kernel);
    const runner = createHistoryProjectionEffectRunner({ repository, store });
    const [staleSubject, currentSubject] = subjects();

    await repository.advanceAndEnqueue({
      subjects: [staleSubject!, currentSubject!],
      nowMs: 100,
    });
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE history_subject_revisions
         SET revision = 2, updated_at_ms = 101
         WHERE subject_id = ?`,
        [staleSubject!.id],
      );
    });

    await expect(runner.drain({ nowMs: 200, limit: 2 })).resolves.toEqual({
      claimed: 2,
      completed: 1,
      permanentFailures: 0,
      retried: 0,
      superseded: 1,
    });
    await expect(kernel.queryAll(
      `SELECT subject_id, status, last_error_code
       FROM history_rebuild_effects
       ORDER BY subject_id`,
    )).resolves.toEqual([
      {
        subject_id: currentSubject!.id,
        status: "completed",
        last_error_code: null,
      },
      {
        subject_id: staleSubject!.id,
        status: "superseded",
        last_error_code: "stale_source_revision",
      },
    ].sort((left, right) => left.subject_id.localeCompare(right.subject_id)));
    await expect(repository.freshness(staleSubject!.id)).resolves.toBe("updating");
    await expect(repository.freshness(currentSubject!.id)).resolves.toBe("current");
  });

  it("isolates a failed batch through revision-fenced single-subject rebuilds", async () => {
    const kernel = await open();
    await insertEffectiveSource(kernel);
    const repository = createHistoryProjectionRepository(kernel);
    const store = createHistoryProjectionEffectStore(kernel);
    const [appliedSubject, staleSubject, transientSubject] = subjects();
    const runner = createHistoryProjectionEffectRunner({
      repository: {
        ...repository,
        rebuildSubjects: async () => {
          throw new Error("batch_rebuild_failed");
        },
        rebuildSubject: async (input) => {
          if (input.subjectId === transientSubject!.id) {
            throw new SqliteStorageError(
              "sqlite_begin_failed",
              new Error("database_busy"),
            );
          }
          return repository.rebuildSubject(input);
        },
      },
      store,
    });

    await repository.advanceAndEnqueue({
      subjects: [appliedSubject!, staleSubject!, transientSubject!],
      nowMs: 100,
    });
    await kernel.write((transaction) => transaction.execute(
      `UPDATE history_subject_revisions
       SET revision = 2, updated_at_ms = 101
       WHERE subject_id = ?`,
      [staleSubject!.id],
    ));

    await expect(runner.drain({ nowMs: 200, limit: 3 })).resolves.toEqual({
      claimed: 3,
      completed: 1,
      permanentFailures: 0,
      retried: 1,
      superseded: 1,
    });
    await expect(kernel.queryAll(
      `SELECT subject_id, status, last_error_code, next_attempt_at_ms
       FROM history_rebuild_effects
       ORDER BY subject_id`,
    )).resolves.toEqual([
      {
        subject_id: appliedSubject!.id,
        status: "completed",
        last_error_code: null,
        next_attempt_at_ms: 100,
      },
      {
        subject_id: staleSubject!.id,
        status: "superseded",
        last_error_code: "stale_source_revision",
        next_attempt_at_ms: 100,
      },
      {
        subject_id: transientSubject!.id,
        status: "pending",
        last_error_code: "sqlite_begin_failed",
        next_attempt_at_ms: 1_200,
      },
    ].sort((left, right) => left.subject_id.localeCompare(right.subject_id)));
    await expect(repository.freshness(appliedSubject!.id)).resolves.toBe("current");
    await expect(repository.freshness(staleSubject!.id)).resolves.toBe("updating");
    await expect(repository.freshness(transientSubject!.id)).resolves.toBe("updating");
  });

  it("keeps rebuilt work lease-recoverable when a terminal queue write fails", async () => {
    const kernel = await open();
    await insertEffectiveSource(kernel);
    const repository = createHistoryProjectionRepository(kernel);
    const store = createHistoryProjectionEffectStore(kernel);
    const [subject] = subjects();
    await repository.advanceAndEnqueue({ subjects: [subject!], nowMs: 100 });
    const runner = createHistoryProjectionEffectRunner({
      repository,
      store: {
        ...store,
        settleBatch: async () => {
          throw new Error("terminal_write_failed");
        },
      },
    });

    await expect(runner.drain({ nowMs: 200, limit: 1 })).resolves.toEqual({
      claimed: 1,
      completed: 0,
      permanentFailures: 0,
      retried: 0,
      superseded: 0,
    });
    await expect(store.findById(`history-rebuild:${subject!.id}:1`))
      .resolves.toMatchObject({
        status: "processing",
        attemptCount: 1,
      });
    await expect(repository.freshness(subject!.id)).resolves.toBe("current");
    await expect(store.resetExpiredClaims(30_200)).resolves.toBe(1);
    await expect(store.findById(`history-rebuild:${subject!.id}:1`))
      .resolves.toMatchObject({ status: "pending" });
  });

  it("rolls back every terminal update when batch settlement cannot complete", async () => {
    const kernel = await open();
    await insertEffectiveSource(kernel);
    const repository = createHistoryProjectionRepository(kernel);
    const store = createHistoryProjectionEffectStore(kernel);
    const [first, second] = subjects();

    await repository.advanceAndEnqueue({ subjects: [first!, second!], nowMs: 100 });
    const claimed = await store.claimBatch!({
      nowMs: 200,
      leaseDurationMs: 30_000,
      maxAttempts: 5,
      limit: 2,
    });
    await expect(store.settleBatch!({
      settlements: [
        { id: claimed[0]!.id, outcome: "completed" },
        { id: "missing-effect", outcome: "completed" },
      ],
      nowMs: 201,
    })).rejects.toMatchObject({ code: "sqlite_transaction_failed" });

    await expect(kernel.queryAll(
      `SELECT id, status FROM history_rebuild_effects
       WHERE id IN (?, ?)
       ORDER BY id`,
      claimed.map(({ id }) => id),
    )).resolves.toEqual(claimed
      .map(({ id }) => ({ id, status: "processing" }))
      .sort((left, right) => left.id.localeCompare(right.id)));
  });

  it("recovers an expired lease and converges its revision-fenced rebuild", async () => {
    const kernel = await open();
    await insertEffectiveSource(kernel);
    const repository = createHistoryProjectionRepository(kernel);
    const store = createHistoryProjectionEffectStore(kernel);
    const runner = createHistoryProjectionEffectRunner({ repository, store });
    const fanout = subjects();

    await repository.advanceAndEnqueue({ subjects: fanout, nowMs: 100 });
    const claimed = await store.claimNext({
      nowMs: 101,
      leaseDurationMs: 30_000,
      maxAttempts: 5,
    });
    expect(claimed).not.toBeNull();
    expect(await store.resetExpiredClaims(30_101)).toBe(1);

    expect(await runner.drain({ nowMs: 30_101, limit: 32 })).toMatchObject({
      completed: fanout.length,
      permanentFailures: 0,
      retried: 0,
    });
    expect(await repository.freshness(claimed!.subjectId)).toBe('current');
    expect((await store.findById(claimed!.id))?.status).toBe('completed');
  });

  it("does not recover an expired claim after the maximum attempt budget", async () => {
    const kernel = await open();
    await insertEffectiveSource(kernel);
    const repository = createHistoryProjectionRepository(kernel);
    const store = createHistoryProjectionEffectStore(kernel);
    const [subject] = subjects();

    await repository.advanceAndEnqueue({ subjects: [subject!], nowMs: 100 });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const claimed = await store.claimNext({
        nowMs: 100 + attempt * 31_000,
        leaseDurationMs: 30_000,
        maxAttempts: 5,
      });
      expect(claimed).not.toBeNull();
      expect(await store.resetExpiredClaims(
        130_101 + attempt * 31_000,
      )).toBe(1);
    }
    const stored = await store.findById(
      `history-rebuild:${subject!.id}:1`,
    );
    expect(stored).toMatchObject({
      status: 'permanent_failure',
      attemptCount: 5,
      lastErrorCode: 'history_projection_attempts_exhausted',
    });
  });

  it("retries a transient rebuild failure before publishing a current watermark", async () => {
    const kernel = await open();
    await insertEffectiveSource(kernel);
    const repository = createHistoryProjectionRepository(kernel);
    const store = createHistoryProjectionEffectStore(kernel);
    const fanout = subjects();
    let failOnce = true;
    const runner = createHistoryProjectionEffectRunner({
      repository: {
        ...repository,
        rebuildSubjects: undefined,
        rebuildSubject: async (input) => {
          if (failOnce) {
            failOnce = false;
            throw new HistoryProjectionEffectError(
              'transient',
              'projection_retry',
            );
          }
          return repository.rebuildSubject(input);
        },
      },
      store,
    });

    await repository.advanceAndEnqueue({ subjects: [fanout[0]!], nowMs: 100 });
    expect(await runner.drain({ nowMs: 200, limit: 1 })).toEqual({
      claimed: 1,
      completed: 0,
      permanentFailures: 0,
      retried: 1,
      superseded: 0,
    });
    expect(await repository.freshness(fanout[0]!.id)).toBe('updating');

    expect(await runner.drain({ nowMs: 1_200, limit: 1 })).toEqual({
      claimed: 1,
      completed: 1,
      permanentFailures: 0,
      retried: 0,
      superseded: 0,
    });
    expect(await repository.freshness(fanout[0]!.id)).toBe('current');
  });

  it("records bounded permanent failures from unknown and explicit permanent rebuild errors", async () => {
    const kernel = await open();
    await insertEffectiveSource(kernel);
    const repository = createHistoryProjectionRepository(kernel);
    const store = createHistoryProjectionEffectStore(kernel);
    const [subject] = subjects();
    let calls = 0;
    const runner = createHistoryProjectionEffectRunner({
      repository: {
        ...repository,
        rebuildSubjects: undefined,
        rebuildSubject: async () => {
          calls += 1;
          if (calls === 1) {
            throw new Error("database failure with spaces and punctuation!");
          }
          throw new HistoryProjectionEffectError(
            "permanent",
            "invalid code / with punctuation",
          );
        },
      },
      store,
    });

    await repository.advanceAndEnqueue({ subjects: [subject!], nowMs: 100 });
    expect(await runner.drain({ nowMs: 200, limit: 1 })).toEqual({
      claimed: 1,
      completed: 0,
      permanentFailures: 1,
      retried: 0,
      superseded: 0,
    });
    expect(await store.findById(`history-rebuild:${subject!.id}:1`))
      .toMatchObject({
        status: "permanent_failure",
        lastErrorCode: "database_failure_with_spaces_and_punctuation_",
      });

    await repository.advanceAndEnqueue({ subjects: [subject!], nowMs: 300 });
    expect(await runner.drain({ nowMs: 400, limit: 1 })).toEqual({
      claimed: 1,
      completed: 0,
      permanentFailures: 1,
      retried: 0,
      superseded: 0,
    });
    expect(await store.findById(`history-rebuild:${subject!.id}:2`))
      .toMatchObject({
        status: "permanent_failure",
        lastErrorCode: "history_projection_effect_failed",
      });
  });

  it("marks a rebuild stale when its source revision changes after a claim", async () => {
    const kernel = await open();
    await insertEffectiveSource(kernel);
    const repository = createHistoryProjectionRepository(kernel);
    const store = createHistoryProjectionEffectStore(kernel);
    const [subject] = subjects();
    const runner = createHistoryProjectionEffectRunner({
      repository: {
        ...repository,
        rebuildSubjects: undefined,
        currentRevision: async (subjectId) =>
          (await repository.currentRevision(subjectId))! + 1,
      },
      store,
    });

    await repository.advanceAndEnqueue({ subjects: [subject!], nowMs: 100 });
    const result = await runner.drain({ nowMs: 200, limit: 1 });

    expect(result).toEqual({
      claimed: 1,
      completed: 0,
      permanentFailures: 0,
      retried: 0,
      superseded: 1,
    });
    expect(await store.findById(`history-rebuild:${subject!.id}:1`))
      .toMatchObject({
        status: "superseded",
        lastErrorCode: "stale_source_revision",
      });
  });
});

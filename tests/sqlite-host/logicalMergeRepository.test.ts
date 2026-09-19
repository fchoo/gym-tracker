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
import { createHash } from "node:crypto";

import {
  canonicalMergeValue,
  portableMergeSessionAggregate,
  type StoredMergePreflight,
} from "../../src/domains/portability/mergeCommands";
import {
  createLogicalBackupRepository,
} from "../../src/platform/sqlite/repositories/logicalBackupRepository";
import {
  createLogicalMergeRepository,
  type LogicalMergeFaultStage,
} from "../../src/platform/sqlite/repositories/logicalMergeRepository";
import {
  createSqliteMergeLocalFactsPort,
} from "../../src/platform/sqlite/repositories/restorePreflightAdapters";
import {
  configureSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import {
  createSqliteKernel,
  type SqliteKernel,
} from "../../src/platform/sqlite/sqliteKernel";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(
    readonly changes: number,
    readonly lastInsertRowId: number,
    private readonly rows: readonly Row[],
  ) {}
  async getAllAsync(): Promise<readonly Row[]> { return this.rows; }
}

class Statement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}
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
  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> { return new Statement(this.database.prepare(sql)); }
  async isInTransactionAsync(): Promise<boolean> { return this.database.isTransaction; }
  async closeAsync(): Promise<void> { this.database.close(); }
}

const directories = new Set<string>();
const kernels = new Set<SqliteKernel>();

afterEach(async () => {
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  kernels.clear();
  for (const directory of directories) rmSync(directory, { force: true, recursive: true });
  directories.clear();
});

async function open(name: string): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), `gym-merge-${name}-`));
  directories.add(directory);
  const path = join(directory, "gym.db");
  const writer = new Connection(new DatabaseSync(path));
  const reader = new Connection(new DatabaseSync(path));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  kernels.add(kernel);
  await createMigrationRunner({
    databaseName: path,
    kernel,
    migrations,
    recoveryBackup: {
      createAndValidate: async (request) => ({
        backupId: "logical-merge",
        databaseName: request.databaseName,
        fromVersion: request.fromVersion,
        toVersion: request.toVersion,
        validated: true,
      }),
    },
  }).run();
  return kernel;
}

async function seedBundledExercise(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO exercises (id, content_pack_id, origin, source_namespace, upstream_id, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision) VALUES ('bundled', NULL, 'bundled', 'catalog', 'bundled', 'Bundled', 'load_reps', 1, 1, 'Unspecified', 90, 1)",
    );
    await transaction.execute(
      "INSERT INTO exercise_library_entries (exercise_id, origin, canonical_name, exercise_type, movement_class, metric_profile, metric_contract_version, exercise_metric_generation, availability, revision) VALUES ('bundled', 'bundled', 'Bundled', 'strength', 'compound', 'load_reps', 1, 1, 'available', 1)",
    );
  });
}

async function seedSession(
  kernel: SqliteKernel,
  input: Readonly<{ id: string; portableId: string; modifiedAtMs: number }>,
): Promise<void> {
  await seedBundledExercise(kernel);
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO workout_sessions (id, plan_id, plan_day_id, source, status, local_date, timezone, started_at_ms, completed_at_ms, active_session_exercise_id, active_set_id, revision, portable_id, merge_modified_at_ms) VALUES (?, NULL, NULL, 'manual', 'completed', '2026-09-20', 'Asia/Singapore', 1, 2, NULL, NULL, 1, ?, ?)",
      [input.id, input.portableId, input.modifiedAtMs],
    );
    await transaction.execute(
      "INSERT INTO session_exercises (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal, origin, display_ordinal, exercise_name, metric_profile, metric_contract_version, exercise_metric_generation, advanced_timing_default_json, default_rest_seconds, target_revision, status, revision) VALUES (?, ?, NULL, 'bundled', 0, 'planned', 0, 'Bundled', 'load_reps', 1, 1, '{\"version\":1,\"mode\":\"off\"}', 90, 1, 'completed', 1)",
      [`exercise-${input.id}`, input.id],
    );
    await transaction.execute(
      "INSERT INTO session_sets (id, session_exercise_id, set_kind, ordinal, source_plan_working_set_target_id, source_owned_plan_working_set_target_id, advanced_timing_override_json, advanced_timing_resolved_json, target_load_grams, target_min_reps, target_max_reps, target_json, unit_json, rule_type, rule_version, metric_profile, metric_contract_version, exercise_metric_generation, status, completed_at_ms, revision) VALUES (?, ?, 'working', 0, NULL, NULL, NULL, '{\"version\":1,\"mode\":\"off\"}', 10000, 8, 10, '{}', '{}', 'load_reps', 1, 'load_reps', 1, 1, 'completed', 2, 1)",
      [`set-${input.id}`, `exercise-${input.id}`],
    );
  });
}

async function snapshot(kernel: SqliteKernel) {
  return createLogicalBackupRepository(kernel).collect({
    createdAtMs: 1,
    snapshotId: "merge-fixture",
  });
}

function sha256(value: string): Promise<string> {
  return Promise.resolve(createHash("sha256").update(value).digest("hex"));
}

async function preflight(
  kernel: SqliteKernel,
  archive: Awaited<ReturnType<typeof snapshot>>,
): Promise<StoredMergePreflight> {
  const local = await createSqliteMergeLocalFactsPort(kernel).read();
  return {
    archiveDigest: "a".repeat(64),
    localFingerprint: await sha256(canonicalMergeValue(local)),
    operation: { kind: "archive_won", portableId: "a".repeat(32) },
    snapshot: archive,
  };
}

async function canonicalState(kernel: SqliteKernel): Promise<unknown> {
  return {
    backup: await snapshot(kernel),
    state: await kernel.queryAll("SELECT state, updated_at_ms FROM portability_restore_state"),
    schema: await kernel.queryAll("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('trigger', 'index') ORDER BY type, name"),
    userVersion: await kernel.queryAll("PRAGMA user_version"),
  };
}

describe("logical merge repository", () => {
  it("replaces one older local session aggregate with the newer archive aggregate in one writer transaction", async () => {
    const archiveKernel = await open("archive");
    await seedSession(archiveKernel, {
      id: "archive-session",
      portableId: "a".repeat(32),
      modifiedAtMs: 20,
    });
    const archive = await snapshot(archiveKernel);
    const localKernel = await open("local");
    await seedSession(localKernel, {
      id: "local-session",
      portableId: "a".repeat(32),
      modifiedAtMs: 10,
    });

    await expect(createLogicalMergeRepository(localKernel, { sha256 })
      .commit(await preflight(localKernel, archive)))
      .resolves.toEqual({ state: "rebuild_pending" });
    await expect(localKernel.queryAll("SELECT id, portable_id, merge_modified_at_ms FROM workout_sessions"))
      .resolves.toEqual([{
        id: "archive-session",
        portable_id: "a".repeat(32),
        merge_modified_at_ms: 20,
      }]);
    await expect(localKernel.queryAll("SELECT session_id FROM session_exercises"))
      .resolves.toEqual([{ session_id: "archive-session" }]);
  });

  it("rolls back authoritative rows, schema metadata, and portability state after every writer fault stage", async () => {
    const stages: readonly LogicalMergeFaultStage[] = [
      "fingerprint_checked",
      "trigger_drop:history_audit_events_immutable_delete",
      "trigger_drop:workout_session_exercise_edit_receipts_immutable_delete",
      "trigger_drop:workout_session_exercise_reorder_receipts_immutable_delete",
      "delete:session_advanced_timing_states",
      "delete:session_undo_snapshots",
      "delete:session_rest_states",
      "delete:history_session_overlays",
      "delete:history_audit_events",
      "delete:workout_session_exercise_edit_receipts",
      "delete:workout_session_exercise_reorder_receipts",
      "delete:session_sets",
      "delete:session_exercises",
      "delete:workout_sessions",
      "insert:workout_sessions",
      "insert:session_exercises",
      "insert:session_sets",
      "insert:session_rest_states",
      "insert:session_advanced_timing_states",
      "insert:session_undo_snapshots",
      "insert:history_session_overlays",
      "insert:history_audit_events",
      "insert:workout_session_exercise_edit_receipts",
      "insert:workout_session_exercise_reorder_receipts",
      "trigger_recreate:history_audit_events_immutable_delete",
      "trigger_recreate:workout_session_exercise_edit_receipts_immutable_delete",
      "trigger_recreate:workout_session_exercise_reorder_receipts_immutable_delete",
      "verified",
      "state_updated",
    ];
    for (const stage of stages) {
      const archiveKernel = await open(`archive-${stage}`);
      await seedSession(archiveKernel, {
        id: "archive-session",
        portableId: "a".repeat(32),
        modifiedAtMs: 20,
      });
      const archive = await snapshot(archiveKernel);
      const localKernel = await open(`local-${stage}`);
      await seedSession(localKernel, {
        id: "local-session",
        portableId: "a".repeat(32),
        modifiedAtMs: 10,
      });
      const before = await canonicalState(localKernel);

      await expect(createLogicalMergeRepository(localKernel, {
        sha256,
        faultAfter: async (actual) => {
          if (actual === stage) throw new Error("fault");
        },
      }).commit(await preflight(localKernel, archive)))
        .rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
      await expect(canonicalState(localKernel)).resolves.toEqual(before);
    }
  }, 90_000);

  it("rejects a stale preflight without changing the newer local source facts", async () => {
    const archiveKernel = await open("stale-archive");
    await seedSession(archiveKernel, {
      id: "archive-session",
      portableId: "a".repeat(32),
      modifiedAtMs: 20,
    });
    const archive = await snapshot(archiveKernel);
    const localKernel = await open("stale-local");
    await seedSession(localKernel, {
      id: "local-session",
      portableId: "a".repeat(32),
      modifiedAtMs: 10,
    });
    const planned = await preflight(localKernel, archive);
    await localKernel.write((transaction) => transaction.execute(
      "UPDATE workout_sessions SET revision = revision + 1 WHERE id = 'local-session'",
    ));
    const before = await canonicalState(localKernel);

    await expect(createLogicalMergeRepository(localKernel, { sha256 })
      .commit(planned))
      .rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(canonicalState(localKernel)).resolves.toEqual(before);
  });

  it("rechecks a local-wins no-op token inside the writer transaction", async () => {
    const archiveKernel = await open("local-wins-archive");
    await seedSession(archiveKernel, {
      id: "archive-session",
      portableId: "a".repeat(32),
      modifiedAtMs: 10,
    });
    const archive = await snapshot(archiveKernel);
    const localKernel = await open("local-wins-local");
    await seedSession(localKernel, {
      id: "local-session",
      portableId: "a".repeat(32),
      modifiedAtMs: 20,
    });
    const planned = {
      ...await preflight(localKernel, archive),
      operation: { kind: "local_won" as const, portableId: "a".repeat(32) },
    };
    await localKernel.write((transaction) => transaction.execute(
      "UPDATE workout_sessions SET revision = revision + 1 WHERE id = 'local-session'",
    ));
    const before = await canonicalState(localKernel);

    await expect(createLogicalMergeRepository(localKernel, { sha256 })
      .commit(planned))
      .rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(canonicalState(localKernel)).resolves.toEqual(before);
  });
});

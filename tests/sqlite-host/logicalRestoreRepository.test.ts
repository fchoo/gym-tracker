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
import {
  tmpdir,
} from "node:os";
import {
  join,
} from "node:path";

import {
  LOGICAL_BACKUP_FORMAT_VERSION,
  LOGICAL_BACKUP_TABLES,
  type LogicalBackupSnapshot,
} from "../../src/domains/portability/backupContracts";
import {
  createLogicalBackupRepository,
} from "../../src/platform/sqlite/repositories/logicalBackupRepository";
import {
  createLogicalRestoreRepository,
  LOGICAL_RESTORE_DELETE_TRIGGER_NAMES,
  type LogicalRestoreFaultStage,
} from "../../src/platform/sqlite/repositories/logicalRestoreRepository";
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
import type {
  SqliteTransactionExecutor,
} from "../../src/platform/sqlite/sqliteKernel";
import type { RecoveryBackupPort } from "../../src/platform/sqlite/recoveryBackup";
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

async function open(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-logical-restore-"));
  directories.add(directory);
  const databasePath = join(directory, "gym.db");
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  kernels.add(kernel);
  await createMigrationRunner({
    databaseName: databasePath, kernel, migrations,
    recoveryBackup: {
      createAndValidate: async (request) => ({
        backupId: "logical-restore", databaseName: request.databaseName,
        fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true,
      }),
    } satisfies RecoveryBackupPort,
  }).run();
  return kernel;
}

async function snapshot(kernel: SqliteKernel): Promise<LogicalBackupSnapshot> {
  return createLogicalBackupRepository(kernel).collect({
    createdAtMs: 1, snapshotId: "restore-fixture",
  });
}

function emptySnapshot(): LogicalBackupSnapshot {
  return {
    version: LOGICAL_BACKUP_FORMAT_VERSION,
    snapshotId: "empty-restore-fixture",
    createdAtMs: 1,
    schemaVersion: 16,
    manifest: {
      catalogReferenceCount: 0,
      rowCounts: Object.fromEntries(LOGICAL_BACKUP_TABLES.map((table) => [table, 0])),
      totalRows: 0,
    },
    tables: Object.fromEntries(LOGICAL_BACKUP_TABLES.map((table) => [table, []])),
    catalogReferences: [],
  } as LogicalBackupSnapshot;
}

function fakeKernel(
  transaction: SqliteTransactionExecutor,
  write?: () => Promise<never>,
): SqliteKernel {
  return {
    write: async <Result>(command: (executor: SqliteTransactionExecutor) => Promise<Result>) =>
      write === undefined ? command(transaction) : write(),
    queryAll: async () => [],
    connectionConfiguration: async () => ({
      reader: { busyTimeoutMs: 0, foreignKeys: true, journalMode: "delete", recursiveTriggers: true },
      writer: { busyTimeoutMs: 0, foreignKeys: true, journalMode: "delete", recursiveTriggers: true },
    }),
    close: async () => undefined,
  };
}

function triggerRows(
  names: readonly (string | number | Uint8Array | null)[] = LOGICAL_RESTORE_DELETE_TRIGGER_NAMES,
  suffix = "",
): readonly Record<string, unknown>[] {
  return names.map((name) => ({
    name: String(name),
    sql: `CREATE TRIGGER ${String(name)} ${suffix}`,
  }));
}

function fakeTransaction(
  query: (sql: string, parameters: readonly (string | number | Uint8Array | null)[]) => readonly Record<string, unknown>[],
  changes = 1,
): SqliteTransactionExecutor {
  return {
    execute: async () => ({ changes, lastInsertRowId: 0 }),
    queryAll: async <Row extends Record<string, unknown>>(
      sql: string,
      parameters: readonly (string | number | Uint8Array | null)[] = [],
    ) =>
      query(sql, parameters) as readonly Row[],
  };
}

async function canonicalState(kernel: SqliteKernel): Promise<unknown> {
  const backup = await snapshot(kernel);
  const restore = await kernel.queryAll("SELECT state, updated_at_ms FROM portability_restore_state");
  const schema = await kernel.queryAll(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('trigger', 'index') ORDER BY type, name",
  );
  const foreignKeys = await kernel.queryAll("PRAGMA foreign_keys");
  const deferredForeignKeys = await kernel.queryAll("PRAGMA defer_foreign_keys");
  const foreignKeyCheck = await kernel.queryAll("PRAGMA foreign_key_check");
  const userVersion = await kernel.queryAll("PRAGMA user_version");
  const sqliteSequencePresent = await kernel.queryAll(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'",
  );
  const sequence = sqliteSequencePresent.length === 0
    ? []
    : await kernel.queryAll("SELECT name, seq FROM sqlite_sequence ORDER BY name");
  return { backup, deferredForeignKeys, foreignKeyCheck, foreignKeys, restore, schema, sequence, userVersion };
}

async function insertBundledExercise(
  kernel: SqliteKernel,
  id: string,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO exercises (id, content_pack_id, origin, source_namespace, upstream_id, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision) VALUES (?, NULL, 'bundled', 'catalog', ?, ?, 'load_reps', 1, 1, 'Unspecified', 90, 1)",
      [id, id, id],
    );
    await transaction.execute(
      "INSERT INTO exercise_library_entries (exercise_id, origin, canonical_name, exercise_type, movement_class, metric_profile, metric_contract_version, exercise_metric_generation, availability, revision) VALUES (?, 'bundled', ?, 'strength', 'compound', 'load_reps', 1, 1, 'available', 1)",
      [id, id],
    );
  });
}

async function seed(kernel: SqliteKernel, suffix: string): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO exercises (id, content_pack_id, origin, source_namespace, upstream_id, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision) VALUES (?, NULL, 'custom', NULL, NULL, ?, 'load_reps', 1, 1, 'Unspecified', 90, 1)",
      [`exercise-${suffix}`, `Exercise ${suffix}`],
    );
    await transaction.execute(
      "INSERT INTO exercise_library_entries (exercise_id, origin, canonical_name, exercise_type, movement_class, metric_profile, metric_contract_version, exercise_metric_generation, availability, revision) VALUES (?, 'custom', ?, 'unspecified', 'unspecified', 'load_reps', 1, 1, 'available', 1)",
      [`exercise-${suffix}`, `Exercise ${suffix}`],
    );
    await transaction.execute(
      "INSERT INTO taxonomy_terms (kind, slug, display_name) VALUES ('equipment', ?, ?)",
      [`equipment-${suffix}`, `Equipment ${suffix}`],
    );
    await transaction.execute(
      "INSERT INTO exercise_taxonomy (exercise_id, kind, slug, relation, ordinal) VALUES (?, 'equipment', ?, 'equipment', 0)",
      [`exercise-${suffix}`, `equipment-${suffix}`],
    );
    await transaction.execute(
      "INSERT INTO plans (id, content_pack_id, origin, source_namespace, upstream_id, name, days_per_week, audience, goal, estimate_minutes, attribution, is_active, revision) VALUES (?, NULL, 'custom', NULL, NULL, ?, 1, 'Unspecified', 'Unspecified', 1, 'Unspecified', 0, 1)",
      [`plan-${suffix}`, `Plan ${suffix}`],
    );
    await transaction.execute(
      "INSERT INTO plan_days (id, plan_id, name, ordinal, revision) VALUES (?, ?, 'Day', 0, 1)",
      [`day-${suffix}`, `plan-${suffix}`],
    );
    await transaction.execute(
      "INSERT INTO plan_day_exercises (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds, metric_profile, metric_contract_version, exercise_metric_generation, revision) VALUES (?, ?, ?, 0, NULL, 'load_reps', 1, 1, 1)",
      [`occurrence-${suffix}`, `day-${suffix}`, `exercise-${suffix}`],
    );
    await transaction.execute(
      "INSERT INTO plan_working_set_targets (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps, target_json, unit_json, metric_profile, metric_contract_version, exercise_metric_generation, revision) VALUES (?, ?, 0, 10000, 8, 10, '{}', '{}', 'load_reps', 1, 1, 1)",
      [`target-${suffix}`, `occurrence-${suffix}`],
    );
    await transaction.execute(
      "INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms) VALUES (?, 1, '{}', 1, 1)",
      [`setting-${suffix}`],
    );
  });
}

describe("logical restore repository", () => {
  it("replaces user-owned source facts in one transaction and leaves rebuild pending", async () => {
    const kernel = await open();
    await seed(kernel, "archive");
    const archive = await snapshot(kernel);
    await seed(kernel, "current");

    const restored = await createLogicalRestoreRepository(kernel, { nowMs: () => 99 })
      .restore(archive)
      .catch((error: { cause?: unknown }) => { throw error.cause; });
    expect(restored).toEqual({ state: "rebuild_pending" });

    expect(await snapshot(kernel)).toEqual(archive);
    await expect(kernel.queryAll("SELECT state, updated_at_ms FROM portability_restore_state"))
      .resolves.toEqual([{ state: "rebuild_pending", updated_at_ms: 99 }]);
    await expect(kernel.queryAll("PRAGMA foreign_keys"))
      .resolves.toEqual([{ foreign_keys: 1 }]);
  });

  it("rolls back the complete source state, triggers, restore singleton, and foreign-key setting when an insert fails", async () => {
    const kernel = await open();
    await seed(kernel, "archive");
    const archive = await snapshot(kernel);
    await seed(kernel, "current");
    const before = await canonicalState(kernel);
    const broken = {
      ...archive,
      tables: {
        ...archive.tables,
        app_settings: [{
          ...(archive.tables.app_settings![0] as Record<string, unknown>),
          value_json: "not json",
        }],
      },
    } as LogicalBackupSnapshot;

    await expect(createLogicalRestoreRepository(kernel).restore(broken))
      .rejects.toEqual(expect.objectContaining({ code: "logical_restore_failed" }));
    await expect(canonicalState(kernel)).resolves.toEqual(before);
  });

  it.each([
    ["an invalid column identifier", (row: Record<string, unknown>) => ({ ...row, "bad-column": 1 })],
    ["an invalid scalar value", (row: Record<string, unknown>) => ({ ...row, revision: true })],
  ])("rolls back when an allegedly prevalidated snapshot carries %s", async (_name, mutate) => {
    const kernel = await open();
    await seed(kernel, "archive");
    const archive = await snapshot(kernel);
    await seed(kernel, "current");
    const before = await canonicalState(kernel);
    const broken = {
      ...archive,
      tables: {
        ...archive.tables,
        app_settings: [mutate(archive.tables.app_settings![0] as Record<string, unknown>)],
      },
    } as LogicalBackupSnapshot;

    await expect(createLogicalRestoreRepository(kernel).restore(broken))
      .rejects.toEqual(expect.objectContaining({ code: "logical_restore_failed" }));
    await expect(canonicalState(kernel)).resolves.toEqual(before);
  });

  it("does not overwrite a retained taxonomy term with a custom snapshot collision", async () => {
    const kernel = await open();
    await seed(kernel, "archive");
    const archive = await snapshot(kernel);
    await kernel.write((transaction) => transaction.execute(
      "INSERT INTO exercises (id, content_pack_id, origin, source_namespace, upstream_id, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision) VALUES ('bundled-exercise', NULL, 'bundled', 'catalog', 'bundled', 'Bundled', 'load_reps', 1, 1, 'Unspecified', 90, 1)",
    ));
    await kernel.write((transaction) => transaction.execute(
      "INSERT INTO exercise_library_entries (exercise_id, origin, canonical_name, exercise_type, movement_class, metric_profile, metric_contract_version, exercise_metric_generation, availability, revision) VALUES ('bundled-exercise', 'bundled', 'Bundled', 'strength', 'compound', 'load_reps', 1, 1, 'available', 1)",
    ));
    await kernel.write((transaction) => transaction.execute(
      "INSERT INTO exercise_taxonomy (exercise_id, kind, slug, relation, ordinal) VALUES ('bundled-exercise', 'equipment', 'equipment-archive', 'equipment', 0)",
    ));
    await kernel.write((transaction) => transaction.execute(
      "UPDATE taxonomy_terms SET display_name = 'Bundled metadata' WHERE kind = 'equipment' AND slug = 'equipment-archive'",
    ));
    const before = await canonicalState(kernel);

    await expect(createLogicalRestoreRepository(kernel).restore(archive))
      .rejects.toEqual(expect.objectContaining({ code: "logical_restore_failed" }));
    await expect(canonicalState(kernel)).resolves.toEqual(before);
  });

  it("replaces every user-owned bundled preference without changing retained exercise rows", async () => {
    const kernel = await open();
    await seed(kernel, "archive");
    await insertBundledExercise(kernel, "bundled-archive");
    await kernel.write((transaction) => transaction.execute(
      "INSERT INTO exercise_owner_preferences (exercise_id, favorite, hidden, archived, revision, updated_at_ms) VALUES ('bundled-archive', 1, 0, 0, 1, 1)",
    ));
    const archive = await snapshot(kernel);
    await insertBundledExercise(kernel, "bundled-current");
    await kernel.write((transaction) => transaction.execute(
      "INSERT INTO exercise_owner_preferences (exercise_id, favorite, hidden, archived, revision, updated_at_ms) VALUES ('bundled-current', 0, 1, 0, 1, 2)",
    ));

    await createLogicalRestoreRepository(kernel).restore(archive);
    await expect(kernel.queryAll("SELECT exercise_id FROM exercise_owner_preferences ORDER BY exercise_id"))
      .resolves.toEqual([{ exercise_id: "bundled-archive" }]);
    await expect(kernel.queryAll("SELECT id, origin FROM exercises WHERE id = 'bundled-current'"))
      .resolves.toEqual([{ id: "bundled-current", origin: "bundled" }]);
  });

  it("keeps unreferenced retained catalog terms while removing only captured stale custom-only terms", async () => {
    const kernel = await open();
    await seed(kernel, "archive");
    const archive = await snapshot(kernel);
    await kernel.write(async (transaction) => {
      await transaction.execute("INSERT INTO taxonomy_terms (kind, slug, display_name) VALUES ('equipment', 'catalog-unused', 'Catalog unused')");
      await transaction.execute("INSERT INTO taxonomy_terms (kind, slug, display_name) VALUES ('equipment', 'current-custom', 'Current custom')");
      await transaction.execute("INSERT INTO exercises (id, content_pack_id, origin, source_namespace, upstream_id, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision) VALUES ('current-custom', NULL, 'custom', NULL, NULL, 'Current', 'load_reps', 1, 1, 'Unspecified', 90, 1)");
      await transaction.execute("INSERT INTO exercise_library_entries (exercise_id, origin, canonical_name, exercise_type, movement_class, metric_profile, metric_contract_version, exercise_metric_generation, availability, revision) VALUES ('current-custom', 'custom', 'Current', 'unspecified', 'unspecified', 'load_reps', 1, 1, 'available', 1)");
      await transaction.execute("INSERT INTO exercise_taxonomy (exercise_id, kind, slug, relation, ordinal) VALUES ('current-custom', 'equipment', 'current-custom', 'equipment', 0)");
    });

    await createLogicalRestoreRepository(kernel).restore(archive);
    await expect(kernel.queryAll("SELECT slug FROM taxonomy_terms WHERE kind = 'equipment' ORDER BY slug"))
      .resolves.toEqual(expect.arrayContaining([{ slug: "catalog-unused" }, { slug: "equipment-archive" }]));
    await expect(kernel.queryAll("SELECT slug FROM taxonomy_terms WHERE slug = 'current-custom'"))
      .resolves.toEqual([]);
  });

  it("rolls back canonical facts and schema after every named transactional fault stage", async () => {
    const stages: readonly LogicalRestoreFaultStage[] = [
      "captured_current_ownership",
      ...LOGICAL_RESTORE_DELETE_TRIGGER_NAMES.map((name) => `trigger_drop:${name}` as const),
      ...LOGICAL_BACKUP_TABLES.map((table) => `delete:${table}` as LogicalRestoreFaultStage),
      ...LOGICAL_BACKUP_TABLES.map((table) => `insert:${table}` as LogicalRestoreFaultStage),
      ...LOGICAL_RESTORE_DELETE_TRIGGER_NAMES.map((name) => `trigger_recreate:${name}` as const),
      "verified",
      "state_updated",
    ];
    for (const stage of stages) {
      const kernel = await open();
      await seed(kernel, "archive");
      const archive = await snapshot(kernel);
      await seed(kernel, "current");
      const before = await canonicalState(kernel);
      await expect(createLogicalRestoreRepository(kernel, {
        nowMs: () => 5,
        faultAfter: async (actual) => { if (actual === stage) throw new Error("fault"); },
      }).restore(archive)).rejects.toEqual(expect.objectContaining({ code: "logical_restore_failed" }));
      await expect(canonicalState(kernel)).resolves.toEqual(before);
    }
  }, 90_000);

  it("keeps the complete logical table registry under restore coverage", () => {
    expect(LOGICAL_BACKUP_TABLES).toContain("history_audit_events");
    expect(LOGICAL_BACKUP_FORMAT_VERSION).toBe(1);
    expect(LOGICAL_RESTORE_DELETE_TRIGGER_NAMES).not.toContain("starter_plan_sources_immutable_delete");
    expect(LOGICAL_RESTORE_DELETE_TRIGGER_NAMES).not.toContain("session_sets_target_graph_insert");
    expect(LOGICAL_RESTORE_DELETE_TRIGGER_NAMES).not.toContain("progression_recommendations_actionable_evidence_insert");
  });

  it("wraps missing trigger capture and generic writer errors in the safe storage error", async () => {
    const missingTriggers = fakeTransaction((sql: string) => {
      if (sql === "PRAGMA foreign_keys") return [{ foreign_keys: 1 }];
      if (sql.includes("FROM sqlite_master")) return [];
      return [];
    });
    await expect(createLogicalRestoreRepository(fakeKernel(missingTriggers)).restore(emptySnapshot()))
      .rejects.toEqual(expect.objectContaining({ code: "logical_restore_failed" }));

    const genericWriterFailure = fakeKernel(missingTriggers, async () => {
      throw new Error("driver detail must not escape");
    });
    await expect(createLogicalRestoreRepository(genericWriterFailure).restore(emptySnapshot()))
      .rejects.toEqual(expect.objectContaining({
        cause: expect.any(Error),
        code: "logical_restore_failed",
      }));
  });

  it("uses the default clock only after source replacement has passed every integrity check", async () => {
    let captures = 0;
    const transaction = fakeTransaction((sql, parameters) => {
      if (sql === "PRAGMA foreign_keys") return [{ foreign_keys: 1 }];
      if (sql.includes("FROM sqlite_master")) return triggerRows(parameters, captures++ > 0 ? "" : "");
      if (sql === "PRAGMA foreign_key_check") return [];
      if (sql.includes("SELECT updated_at_ms FROM portability_restore_state")) return [{ updated_at_ms: 1 }];
      if (sql.includes("SELECT state FROM portability_restore_state")) return [{ state: "rebuild_pending" }];
      return [];
    });
    await expect(createLogicalRestoreRepository(fakeKernel(transaction)).restore(emptySnapshot()))
      .resolves.toEqual({ state: "rebuild_pending" });
  });

  it("uses nowMs when it is ahead of the previous rebuild_pending timestamp before rejecting a malformed readback", async () => {
    let captures = 0;
    const updatedAtMs: number[] = [];
    const transaction: SqliteTransactionExecutor = {
      execute: async (
        sql: string,
        parameters: readonly (null | number | string | Uint8Array)[] = [],
      ) => {
        if (sql.includes("UPDATE portability_restore_state")) {
          updatedAtMs.push(parameters[0] as number);
        }
        return { changes: 1, lastInsertRowId: 0 };
      },
      queryAll: async <Row extends Record<string, unknown>>(
        sql: string,
        parameters: readonly (string | number | Uint8Array | null)[] = [],
      ) => {
        if (sql === "PRAGMA foreign_keys") return [{ foreign_keys: 1 }] as unknown as readonly Row[];
        if (sql.includes("FROM sqlite_master")) {
          captures += 1;
          return triggerRows(parameters, captures > 1 ? "" : "") as unknown as readonly Row[];
        }
        if (sql === "PRAGMA foreign_key_check") return [] as unknown as readonly Row[];
        if (sql.includes("SELECT updated_at_ms FROM portability_restore_state")) {
          return [{ updated_at_ms: 41 }] as unknown as readonly Row[];
        }
        if (sql.includes("SELECT state FROM portability_restore_state")) return [] as unknown as readonly Row[];
        return [] as readonly Row[];
      },
    };

    await expect(createLogicalRestoreRepository(fakeKernel(transaction), {
      nowMs: () => 99,
    }).restore(emptySnapshot())).rejects.toEqual(expect.objectContaining({ code: "logical_restore_failed" }));
    expect(updatedAtMs).toEqual([99]);
  });

  it.each([
    ["invalid captured trigger identifier", "bad-trigger"],
    ["duplicate taxonomy term", "taxonomy-duplicate"],
    ["mismatched retained taxonomy term", "taxonomy-mismatch"],
    ["a nonempty foreign-key check", "foreign-key-check"],
  ])("rejects %s before a logical state can be returned", async (_name, scenario) => {
    const term = { kind: "equipment", slug: "fixture", display_name: "Fixture" };
    const base = emptySnapshot();
    const snapshot = scenario.startsWith("taxonomy") ? {
      ...base,
      manifest: {
        ...base.manifest,
        rowCounts: { ...base.manifest.rowCounts, taxonomy_terms: 1 },
        totalRows: 1,
      },
      tables: { ...base.tables, taxonomy_terms: [term] },
    } as LogicalBackupSnapshot : base;
    let captures = 0;
    const transaction = fakeTransaction((sql, parameters) => {
      if (sql === "PRAGMA foreign_keys") return [{ foreign_keys: 1 }];
      if (sql.includes("FROM sqlite_master")) {
        captures += 1;
        return scenario === "bad-trigger"
          ? triggerRows(parameters.map(() => "bad-trigger"))
          : triggerRows(parameters, captures > 1 ? "" : "");
      }
      if (sql.includes("SELECT * FROM taxonomy_terms WHERE kind")) {
        return scenario === "taxonomy-duplicate" ? [term, term]
          : scenario === "taxonomy-mismatch" ? [{ ...term, display_name: "Different" }]
            : [];
      }
      if (sql.includes("SELECT * FROM taxonomy_terms WHERE EXISTS")) return [term];
      if (sql === "PRAGMA foreign_key_check") return scenario === "foreign-key-check" ? [{ table: "facts" }] : [];
      if (sql.includes("SELECT updated_at_ms FROM portability_restore_state")) return [{ updated_at_ms: 1 }];
      if (sql.includes("SELECT state FROM portability_restore_state")) return [{ state: "rebuild_pending" }];
      return [];
    });
    await expect(createLogicalRestoreRepository(fakeKernel(transaction)).restore(snapshot))
      .rejects.toEqual(expect.objectContaining({ code: "logical_restore_failed" }));
  });

  it.each([
    ["retains an exactly matching taxonomy term", "compatible"],
    ["rejects an empty row before generating SQL", "empty-row"],
    ["rejects a non-scalar row value", "invalid-value"],
    ["rejects a failed fact insert count", "insert-count"],
    ["rejects a failed rebuild-state update count", "state-count"],
  ])("%s", async (_name, scenario) => {
    const term = { kind: "equipment", slug: "fixture", display_name: "Fixture" };
    const setting = scenario === "empty-row" ? {}
      : scenario === "invalid-value" ? { key: "setting", value_version: true, value_json: "{}", revision: 1, updated_at_ms: 1 }
        : { key: "setting", value_version: 1, value_json: "{}", revision: 1, updated_at_ms: 1 };
    const base = emptySnapshot();
    const snapshot = scenario === "compatible" ? {
      ...base,
      manifest: { ...base.manifest, rowCounts: { ...base.manifest.rowCounts, taxonomy_terms: 1 }, totalRows: 1 },
      tables: { ...base.tables, taxonomy_terms: [term] },
    } as LogicalBackupSnapshot : {
      ...base,
      manifest: { ...base.manifest, rowCounts: { ...base.manifest.rowCounts, app_settings: 1 }, totalRows: 1 },
      tables: { ...base.tables, app_settings: [setting] },
    } as LogicalBackupSnapshot;
    let captures = 0;
    const transaction: SqliteTransactionExecutor = {
      execute: async (sql: string) => ({
        changes: scenario === "insert-count" && sql.includes("INSERT INTO \"app_settings\"")
          ? 0
          : scenario === "state-count" && sql.includes("UPDATE portability_restore_state")
            ? 0
            : 1,
        lastInsertRowId: 0,
      }),
      queryAll: async <Row extends Record<string, unknown>>(
        sql: string,
        parameters: readonly (string | number | Uint8Array | null)[] = [],
      ) => {
        if (sql === "PRAGMA foreign_keys") return [{ foreign_keys: 1 }] as unknown as readonly Row[];
        if (sql.includes("FROM sqlite_master")) {
          captures += 1;
          return triggerRows(parameters, captures > 1 ? "" : "") as readonly Row[];
        }
        if (sql.includes("SELECT * FROM taxonomy_terms WHERE kind")) {
          return (scenario === "compatible" ? [term] : []) as unknown as readonly Row[];
        }
        if (sql.includes("SELECT * FROM taxonomy_terms WHERE EXISTS")) return [term] as unknown as readonly Row[];
        if (sql.includes("SELECT * FROM \"app_settings\"")) {
          return (scenario === "compatible" ? [] : [setting]) as unknown as readonly Row[];
        }
        if (sql === "PRAGMA foreign_key_check") return [] as unknown as readonly Row[];
        if (sql.includes("SELECT updated_at_ms FROM portability_restore_state")) return [{ updated_at_ms: 1 }] as unknown as readonly Row[];
        if (sql.includes("SELECT state FROM portability_restore_state")) return [{ state: "rebuild_pending" }] as unknown as readonly Row[];
        return [] as readonly Row[];
      },
    };
    const result = createLogicalRestoreRepository(fakeKernel(transaction)).restore(snapshot);
    if (scenario === "compatible") {
      await expect(result).resolves.toEqual({ state: "rebuild_pending" });
    } else {
      await expect(result).rejects.toEqual(expect.objectContaining({ code: "logical_restore_failed" }));
    }
  });

  it.each([
    ["missing captured trigger SQL", "capture-empty-sql"],
    ["a missing trigger after recreation", "recreate-count"],
    ["changed trigger SQL after recreation", "recreate-sql"],
  ])("rejects %s without committing", async (_name, scenario) => {
    let captures = 0;
    const transaction = fakeTransaction((sql, parameters) => {
      if (sql === "PRAGMA foreign_keys") return [{ foreign_keys: 1 }];
      if (sql.includes("FROM sqlite_master")) {
        captures += 1;
        if (scenario === "capture-empty-sql") {
          return triggerRows(parameters).map((row, index) => index === 0 ? { ...row, sql: "" } : row);
        }
        if (captures === 2 && scenario === "recreate-count") return triggerRows(parameters.slice(1));
        return triggerRows(parameters, captures === 2 && scenario === "recreate-sql" ? "changed" : "");
      }
      return [];
    });
    await expect(createLogicalRestoreRepository(fakeKernel(transaction)).restore(emptySnapshot()))
      .rejects.toEqual(expect.objectContaining({ code: "logical_restore_failed" }));
  });

  it.each([
    ["taxonomy identity", { taxonomy_terms: [{ kind: "equipment", slug: "missing", display_name: "Missing" }] }, "taxonomy"],
    ["ordinary source identity", { app_settings: [{ key: "setting", value_version: 1, value_json: "{}", revision: 1, updated_at_ms: 1 }] }, "ordinary"],
  ])("rejects a post-insert %s mismatch", async (_name, rows, scenario) => {
    const empty = emptySnapshot();
    const snapshot = {
      ...empty,
      manifest: {
        ...empty.manifest,
        rowCounts: { ...empty.manifest.rowCounts, ...Object.fromEntries(Object.entries(rows).map(([table, values]) => [table, values.length])) },
        totalRows: Object.values(rows).reduce((total, values) => total + values.length, 0),
      },
      tables: { ...empty.tables, ...rows },
    } as LogicalBackupSnapshot;
    let captures = 0;
    const transaction = fakeTransaction((sql, parameters) => {
      if (sql === "PRAGMA foreign_keys") return [{ foreign_keys: 1 }];
      if (sql.includes("FROM sqlite_master")) return triggerRows(parameters, captures++ > 0 ? "" : "");
      if (sql.includes("SELECT * FROM taxonomy_terms WHERE kind")) return [];
      if (sql.includes("SELECT * FROM taxonomy_terms WHERE EXISTS")) return scenario === "taxonomy" ? [] : [];
      if (sql.includes("SELECT * FROM \"app_settings\"")) return scenario === "ordinary" ? [] : [];
      return [];
    });
    await expect(createLogicalRestoreRepository(fakeKernel(transaction)).restore(snapshot))
      .rejects.toEqual(expect.objectContaining({ code: "logical_restore_failed" }));
  });

  it.each([
    ["disabled foreign keys", "foreign-keys"],
    ["a malformed updated singleton", "state"],
    ["a failed source insert count", "changes"],
  ])("rejects %s through the typed transactional boundary", async (_name, scenario) => {
    let captures = 0;
    const transaction = fakeTransaction((sql, parameters) => {
      if (sql === "PRAGMA foreign_keys") return [{ foreign_keys: scenario === "foreign-keys" ? 0 : 1 }];
      if (sql.includes("FROM sqlite_master")) return triggerRows(parameters, captures++ > 0 ? "" : "");
      if (sql.includes("SELECT updated_at_ms FROM portability_restore_state")) return scenario === "state" ? [] : [{ updated_at_ms: 1 }];
      if (sql.includes("SELECT state FROM portability_restore_state")) return scenario === "state" ? [] : [{ state: "rebuild_pending" }];
      return [];
    }, scenario === "changes" ? 0 : 1);
    const snapshot = scenario === "changes" ? {
      ...emptySnapshot(),
      manifest: {
        ...emptySnapshot().manifest,
        rowCounts: { ...emptySnapshot().manifest.rowCounts, app_settings: 1 },
        totalRows: 1,
      },
      tables: {
        ...emptySnapshot().tables,
        app_settings: [{ key: "setting", value_version: 1, value_json: "{}", revision: 1, updated_at_ms: 1 }],
      },
    } as LogicalBackupSnapshot : emptySnapshot();
    await expect(createLogicalRestoreRepository(fakeKernel(transaction)).restore(snapshot))
      .rejects.toEqual(expect.objectContaining({ code: "logical_restore_failed" }));
  });
});

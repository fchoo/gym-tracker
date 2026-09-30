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
  portableMergeArchiveSessionAggregate,
  portableMergeSessionAggregate,
  type StoredMergePreflight,
} from "../../src/domains/portability/mergeCommands";
import {
  buildPortableMergePlan,
  type PortableMergePlan,
} from "../../src/domains/portability/mergePlan";
import {
  createLogicalBackupRepository,
} from "../../src/platform/sqlite/repositories/logicalBackupRepository";
import {
  LOGICAL_BACKUP_TABLE_DEFINITIONS,
  type LogicalBackupRow,
} from "../../src/domains/portability/backupContracts";
import {
  __logicalMergeRepositoryTestOnly,
  createFullPlanLogicalMergeWriter,
  createLogicalMergeRepository,
  type LogicalMergeFaultStage,
} from "../../src/platform/sqlite/repositories/logicalMergeRepository";
import {
  createSqliteMergeLocalFactsPort,
} from "../../src/platform/sqlite/repositories/restorePreflightAdapters";
import type {
  MergeLocalFacts,
} from "../../src/domains/portability/mergeCommands";
import {
  createExerciseSearchIndexRepository,
} from "../../src/platform/sqlite/repositories/exerciseSearchIndexRepository";
import {
  createHistoryProjectionRepository,
} from "../../src/platform/sqlite/repositories/historyProjectionRepository";
import {
  createRestoreReconciliationRepository,
} from "../../src/platform/sqlite/repositories/restoreReconciliationRepository";
import {
  configureSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import {
  createSqliteKernel,
  type SqliteKernel,
  type SqliteTransactionExecutor,
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

async function seedOwnedPlan(
  kernel: SqliteKernel,
  input: Readonly<{ id: string; portableId: string; dayId: string }>,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO plans (id, content_pack_id, origin, source_namespace, upstream_id, name, days_per_week, audience, goal, estimate_minutes, attribution, is_active, revision, portable_id) VALUES (?, NULL, 'custom', NULL, NULL, 'Portable plan', 1, 'Owner', 'Strength', 30, 'Owner', 0, 1, ?)",
      [input.id, input.portableId],
    );
    await transaction.execute(
      "INSERT INTO plan_days (id, plan_id, ordinal, name, revision) VALUES (?, ?, 0, 'Day one', 1)",
      [input.dayId, input.id],
    );
    await transaction.execute(
      "INSERT INTO owned_plan_aggregate_states (plan_id, lifecycle, graph_status, missing_requirement_code, missing_requirement, created_at_ms, updated_at_ms, archived_at_ms) VALUES (?, 'draft', 'missing_valid_target', 'owned_plan_missing_valid_target', 'Add at least one exercise with valid targets before scheduling or activating.', 1, 1, NULL)",
      [input.id],
    );
  });
}

async function seedOwnedPlanExerciseGraph(
  kernel: SqliteKernel,
  input: Readonly<{ planId: string; dayId: string }>,
): Promise<void> {
  await seedBundledExercise(kernel);
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO plan_day_exercises (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds, metric_profile, metric_contract_version, exercise_metric_generation, revision) VALUES ('legacy-occurrence', ?, 'bundled', 0, NULL, 'load_reps', 1, 1, 1)",
      [input.dayId],
    );
    await transaction.execute(
      "INSERT INTO plan_working_set_targets (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps, target_json, unit_json, metric_profile, metric_contract_version, exercise_metric_generation, revision) VALUES ('legacy-target', 'legacy-occurrence', 0, 10000, 8, 10, '{}', '{}', 'load_reps', 1, 1, 1)",
    );
    await transaction.execute(
      "INSERT INTO owned_plan_day_exercises (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds, metric_profile, metric_contract_version, exercise_metric_generation, revision) VALUES ('owned-occurrence', ?, 'bundled', 0, 60, 'load_reps', 1, 1, 1)",
      [input.dayId],
    );
    await transaction.execute(
      "INSERT INTO owned_plan_working_set_targets (id, plan_day_exercise_id, ordinal, target_json, unit_json, metric_profile, metric_contract_version, exercise_metric_generation, revision) VALUES ('owned-target', 'owned-occurrence', 0, '{}', '{}', 'load_reps', 1, 1, 1)",
    );
    await transaction.execute(
      "INSERT INTO owned_plan_schedules (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms) VALUES ('owned-schedule', ?, 'inactive', 1, 1, 1)",
      [input.planId],
    );
    await transaction.execute(
      "INSERT INTO owned_plan_schedule_versions (id, schedule_id, version_number, effective_local_date, mode, timezone, rotation_pointer, created_at_ms) VALUES ('owned-version', 'owned-schedule', 1, '2026-09-20', 'weekday', 'Asia/Singapore', NULL, 1)",
    );
    await transaction.execute(
      "INSERT INTO owned_plan_schedule_bindings (id, schedule_version_id, mode, ordinal, week_index, weekday, plan_day_id) VALUES ('owned-binding', 'owned-version', 'weekday', 0, 0, 'Monday', ?)",
      [input.dayId],
    );
    await transaction.execute(
      "INSERT INTO owned_plan_day_sources (plan_day_id, plan_id, source_day_id, source_ordinal) VALUES (?, ?, 'source-day', 1)",
      [input.dayId, input.planId],
    );
    await transaction.execute(
      "INSERT INTO owned_plan_occurrence_sources (plan_day_exercise_id, plan_day_id, source_occurrence_id, source_exercise_id, source_ordinal, catalog_metric_profile, catalog_metric_contract_version, catalog_exercise_metric_generation, metric_override_json, content_rationale) VALUES ('owned-occurrence', ?, 'source-occurrence', 'source-exercise', 1, 'load_reps', 1, 1, NULL, 'Source')",
      [input.dayId],
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

function reconciliation(kernel: SqliteKernel) {
  return createRestoreReconciliationRepository(kernel, {
    history: createHistoryProjectionRepository(kernel),
    nowMs: () => 100,
    search: createExerciseSearchIndexRepository(kernel),
  });
}

async function fullPlanFixture(kernel: SqliteKernel) {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms) VALUES ('appearance', 1, ?, 1, 1)",
      ['"light"'],
    );
    await transaction.execute(
      "INSERT INTO exercises (id, content_pack_id, origin, source_namespace, upstream_id, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision, portable_id) VALUES ('local-exercise', NULL, 'custom', NULL, NULL, 'Local', 'load_reps', 1, 1, 'Unspecified', 90, 1, ?)",
      ["a".repeat(32)],
    );
    await transaction.execute(
      "INSERT INTO exercise_library_entries (exercise_id, origin, canonical_name, exercise_type, movement_class, metric_profile, metric_contract_version, exercise_metric_generation, availability, revision) VALUES ('local-exercise', 'custom', 'Local', 'strength', 'compound', 'load_reps', 1, 1, 'available', 1)",
    );
    await transaction.execute(
      "INSERT INTO taxonomy_terms (kind, slug, display_name) VALUES ('exercise_type', 'strength', 'Strength')",
    );
  });
  const local = await createSqliteMergeLocalFactsPort(kernel).read();
  const archive = {
    version: 2 as const,
    schemaVersion: 22,
    tables: {
      ...local.tables,
      portable_owner_identity: [{ id: 1, owner_namespace: local.ownerNamespace }],
      app_settings: [
        { key: "appearance", value_version: 1, value_json: '"dark"', revision: 1, updated_at_ms: 2 },
        { key: "units", value_version: 1, value_json: '"metric"', revision: 1, updated_at_ms: 2 },
      ],
      exercises: [{
        id: "archive-exercise",
        content_pack_id: null,
        origin: "custom",
        source_namespace: null,
        upstream_id: null,
        name: "Archive",
        metric_profile: "load_reps",
        metric_contract_version: 1,
        exercise_metric_generation: 1,
        equipment: "Unspecified",
        default_rest_seconds: 90,
        revision: 1,
        portable_id: "b".repeat(32),
      }],
      exercise_library_entries: [{
        exercise_id: "archive-exercise",
        origin: "custom",
        canonical_name: "Archive",
        exercise_type: "strength",
        movement_class: "compound",
        metric_profile: "load_reps",
        metric_contract_version: 1,
        exercise_metric_generation: 1,
        availability: "available",
        revision: 1,
      }],
      exercise_aliases: [{
        id: 101,
        exercise_id: "archive-exercise",
        ordinal: 0,
        display_text: "Archive alias",
        normalized_text: "archive alias",
      }],
      exercise_search_terms: [{
        id: 201,
        exercise_id: "archive-exercise",
        kind: "canonical",
        ordinal: 0,
        display_text: "Archive",
        normalized_text: "archive",
      }],
      exercise_taxonomy: [
        {
          exercise_id: "archive-exercise",
          kind: "exercise_type",
          slug: "strength",
          relation: "type",
          ordinal: 0,
        },
        {
          exercise_id: "archive-exercise",
          kind: "movement_class",
          slug: "compound",
          relation: "movement",
          ordinal: 0,
        },
      ],
      taxonomy_terms: [
        { kind: "exercise_type", slug: "strength", display_name: "Strength" },
        { kind: "movement_class", slug: "compound", display_name: "Compound" },
      ],
      exercise_owner_preferences: [{
        exercise_id: "archive-exercise",
        favorite: 1,
        hidden: 0,
        archived: 0,
        revision: 1,
        updated_at_ms: 2,
      }],
      exercise_metric_baselines: [{
        exercise_id: "archive-exercise",
        metric_profile: "load_reps",
        metric_contract_version: 1,
        exercise_metric_generation: 1,
        status: "awaiting_comparable_observation",
        established_at_ms: 2,
      }],
    },
  };
  const plan = await buildPortableMergePlan({
    archive,
    local: {
      version: 2,
      ...local,
      tables: {
        ...local.tables,
        portable_owner_identity: [{ id: 1, owner_namespace: local.ownerNamespace }],
      },
    },
    payloadDigest: sha256,
  });
  return {
    local,
    plan,
  };
}

async function fullSessionPlanFixture() {
  const archiveKernel = await open("full-plan-session-archive");
  await seedSession(archiveKernel, {
    id: "archive-session",
    portableId: "c".repeat(32),
    modifiedAtMs: 20,
  });
  const archive = await snapshot(archiveKernel);
  const localKernel = await open("full-plan-session-local");
  await seedSession(localKernel, {
    id: "local-session",
    portableId: "c".repeat(32),
    modifiedAtMs: 10,
  });
  const local = await createSqliteMergeLocalFactsPort(localKernel).read();
  const plan = await buildPortableMergePlan({
    archive: {
      ...archive,
      version: 2 as const,
      tables: {
        ...archive.tables,
        portable_owner_identity: [{ id: 1, owner_namespace: local.ownerNamespace }],
      },
    },
    local: {
      version: 2,
      ...local,
      tables: {
        ...local.tables,
        portable_owner_identity: [{ id: 1, owner_namespace: local.ownerNamespace }],
      },
    },
    payloadDigest: sha256,
  });
  return {
    local,
    localKernel,
    plan,
  };
}

async function fullOwnedPlanFixture() {
  const archiveKernel = await open("full-plan-owned-archive");
  await seedOwnedPlan(archiveKernel, {
    id: "archive-plan",
    portableId: "d".repeat(32),
    dayId: "archive-day",
  });
  await seedOwnedPlanExerciseGraph(archiveKernel, {
    planId: "archive-plan",
    dayId: "archive-day",
  });
  const archive = await snapshot(archiveKernel);
  const localKernel = await open("full-plan-owned-local");
  await seedBundledExercise(localKernel);
  const local = await createSqliteMergeLocalFactsPort(localKernel).read();
  const plan = await buildPortableMergePlan({
    archive: {
      ...archive,
      version: 2 as const,
      tables: {
        ...archive.tables,
        portable_owner_identity: [{ id: 1, owner_namespace: local.ownerNamespace }],
      },
    },
    local: {
      version: 2,
      ...local,
      tables: {
        ...local.tables,
        portable_owner_identity: [{ id: 1, owner_namespace: local.ownerNamespace }],
      },
    },
    payloadDigest: sha256,
  });
  return { local, localKernel, plan };
}

async function expectRejectedFullPlan(
  kernel: SqliteKernel,
  local: MergeLocalFacts,
  plan: PortableMergePlan,
): Promise<void> {
  const before = await canonicalState(kernel);
  await expect(createFullPlanLogicalMergeWriter(kernel, { sha256 })
    .commitFullPlan({
      localFingerprint: await sha256(canonicalMergeValue(local)),
      plan,
    }))
    .rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
  await expect(canonicalState(kernel)).resolves.toEqual(before);
}

function transactionStub(input: Readonly<{
  execute?: (sql: string, parameters: readonly (null | number | string | Uint8Array)[]) => Promise<Readonly<{ changes: number; lastInsertRowId: number }>>;
  queryAll?: (sql: string, parameters: readonly (null | number | string | Uint8Array)[]) => Promise<readonly Record<string, unknown>[]>;
}> = {}): SqliteTransactionExecutor {
  return {
    execute: async (sql, parameters = []) => input.execute?.(sql, parameters) ?? { changes: 1, lastInsertRowId: 0 },
    queryAll: async <Row extends Record<string, unknown>>(sql: string, parameters = []) =>
      (input.queryAll?.(sql, parameters) ?? []) as readonly Row[],
  };
}

function verificationTransaction(plan: PortableMergePlan): SqliteTransactionExecutor {
  const rowsByPrimaryKey = new Map<string, Record<string, unknown>>();
  const addRow = (table: keyof typeof LOGICAL_BACKUP_TABLE_DEFINITIONS, row: Record<string, unknown>) => {
    const primaryKey = LOGICAL_BACKUP_TABLE_DEFINITIONS[table].primaryKey;
    rowsByPrimaryKey.set(String(table) + "@@" + JSON.stringify(primaryKey.map((column) => row[column])), row);
  };
  for (const setting of plan.settings) addRow("app_settings", { ...setting });
  for (const aggregate of plan.aggregates) {
    for (const [table, rows] of Object.entries(aggregate.tables)) {
      if (!(table in LOGICAL_BACKUP_TABLE_DEFINITIONS)) continue;
      for (const row of rows) {
        addRow(table as keyof typeof LOGICAL_BACKUP_TABLE_DEFINITIONS, { ...row });
      }
    }
  }
  return transactionStub({
    queryAll: async (sql, parameters) => {
      if (sql.includes("PRAGMA foreign_key_check")) return [];
      if (sql.includes("FROM workout_sessions")) return [];
      const table = Object.keys(LOGICAL_BACKUP_TABLE_DEFINITIONS).find((name) => sql.includes("FROM \"" + name + "\""));
      if (table === undefined) return [];
      const primaryKey = LOGICAL_BACKUP_TABLE_DEFINITIONS[table as keyof typeof LOGICAL_BACKUP_TABLE_DEFINITIONS].primaryKey;
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; offset < parameters.length; offset += primaryKey.length) {
        const row = rowsByPrimaryKey.get(table + "@@" + JSON.stringify(parameters.slice(offset, offset + primaryKey.length)));
        if (row !== undefined) rows.push(row);
      }
      return rows;
    },
  });
}

function fullReadbackTransaction(
  plan: PortableMergePlan,
  input: Readonly<{
    foreignKeyRows?: readonly Record<string, unknown>[];
    workoutSessions?: readonly Record<string, unknown>[];
  }> = {},
): SqliteTransactionExecutor {
  const rowsByTable = new Map<string, readonly Record<string, unknown>[]>();
  for (const aggregate of plan.aggregates) {
    for (const [table, rows] of Object.entries(aggregate.tables)) {
      rowsByTable.set(table, rows);
    }
  }
  if (input.workoutSessions !== undefined) {
    rowsByTable.set("workout_sessions", input.workoutSessions);
  }
  return transactionStub({
    queryAll: async (sql) => {
      if (sql.includes("PRAGMA user_version")) return [{ user_version: 22 }];
      if (sql.includes("FROM portable_owner_identity")) {
        return [{ owner_namespace: "9".repeat(32) }];
      }
      if (sql.includes("PRAGMA foreign_key_check")) return input.foreignKeyRows ?? [];
      const table = Object.keys(LOGICAL_BACKUP_TABLE_DEFINITIONS).find((name) =>
        sql.includes(`FROM \"${name}\"`));
      if (table === undefined) return [];
      return rowsByTable.get(table) ?? [];
    },
  });
}

function transactionKernel(transaction: SqliteTransactionExecutor): SqliteKernel {
  return {
    write: async <Result>(command: (input: SqliteTransactionExecutor) => Promise<Result>) => command(transaction),
  } as SqliteKernel;
}

function mergeTransaction(
  local: MergeLocalFacts,
  input: Readonly<{
    afterWrite?: MergeLocalFacts;
    foreignKeyRows?: readonly Record<string, unknown>[];
    foreignKeys?: number;
  }> = {},
): SqliteTransactionExecutor {
  const triggerNames = [
    "history_audit_events_immutable_delete",
    "workout_session_exercise_edit_receipts_immutable_delete",
    "workout_session_exercise_reorder_receipts_immutable_delete",
  ];
  let reads = 0;
  return transactionStub({
    queryAll: async (sql) => {
      if (sql.includes("PRAGMA user_version")) {
        reads += 1;
        return [{ user_version: local.schemaVersion }];
      }
      if (sql.includes("FROM portable_owner_identity")) {
        return [{ owner_namespace: local.ownerNamespace }];
      }
      if (sql.includes("PRAGMA foreign_keys")) {
        return [{ foreign_keys: input.foreignKeys ?? 1 }];
      }
      if (sql.includes("FROM sqlite_master")) {
        return triggerNames.map((name) => ({
          name,
          sql: `CREATE TRIGGER ${name} AFTER DELETE ON workout_sessions BEGIN SELECT 1; END`,
        }));
      }
      if (sql.includes("PRAGMA foreign_key_check")) return input.foreignKeyRows ?? [];
      const table = Object.keys(LOGICAL_BACKUP_TABLE_DEFINITIONS).find((name) =>
        sql.includes(`FROM \"${name}\"`));
      if (table === undefined) return [];
      const source = reads > 1 ? input.afterWrite ?? local : local;
      return source.tables[table] ?? [];
    },
  });
}

function operationPlan(operations: PortableMergePlan["operations"]): PortableMergePlan {
  return {
    operations,
    idRemaps: [],
    idMappings: [],
    settings: [],
    aggregates: [],
    preview: {
      inserted: 0, duplicates: 0, archiveWon: 0, localWon: 0,
      keptBoth: 0, remapped: 0, conflicts: 0,
    },
  };
}

function maximalOwnedPlanAggregate() {
  const portableId = "6".repeat(32);
  const operation = {
    aggregateClass: "owned_plan" as const,
    kind: "insert" as const,
    portableId,
    archiveId: "plan",
    localId: "plan",
  };
  const aggregate = {
    aggregateClass: "owned_plan" as const,
    portableId,
    tables: {
      plans: [{ id: "plan", portable_id: portableId, origin: "custom" }],
      plan_days: [{ id: "day", plan_id: "plan" }],
      plan_schedules: [{ id: "legacy-schedule", plan_id: "plan" }],
      plan_schedule_bindings: [{ id: "legacy-binding", schedule_id: "legacy-schedule", plan_day_id: "day" }],
      plan_day_exercises: [{ id: "legacy-occurrence", plan_day_id: "day" }],
      plan_warmup_sets: [{ id: "legacy-warmup", plan_day_exercise_id: "legacy-occurrence" }],
      plan_working_set_targets: [{ id: "legacy-target", plan_day_exercise_id: "legacy-occurrence" }],
      progression_policies: [{ id: "legacy-policy", plan_day_exercise_id: "legacy-occurrence" }],
      progression_recommendations: [{ id: "legacy-recommendation", plan_working_set_target_id: "legacy-target" }],
      owned_plan_aggregate_states: [{ plan_id: "plan" }],
      owned_plan_starter_sources: [{ plan_id: "plan" }],
      owned_plan_day_sources: [{ plan_day_id: "day", plan_id: "plan" }],
      owned_plan_day_exercises: [{ id: "owned-occurrence", plan_day_id: "day" }],
      owned_plan_warmup_sets: [{ id: "owned-warmup", plan_day_exercise_id: "owned-occurrence" }],
      owned_plan_working_set_targets: [{ id: "owned-target", plan_day_exercise_id: "owned-occurrence" }],
      owned_plan_progression_policies: [{ id: "owned-policy", plan_day_exercise_id: "owned-occurrence" }],
      owned_plan_occurrence_sources: [{ plan_day_exercise_id: "owned-occurrence", plan_day_id: "day" }],
      owned_plan_schedules: [{ id: "owned-schedule", plan_id: "plan" }],
      owned_plan_schedule_versions: [{ id: "owned-version", schedule_id: "owned-schedule" }],
      owned_plan_schedule_bindings: [{ id: "owned-binding", schedule_version_id: "owned-version", plan_day_id: "day" }],
      owned_plan_schedule_overrides: [{ id: "owned-override", schedule_id: "owned-schedule" }],
      owned_plan_schedule_opportunities: [{ id: "owned-opportunity", schedule_id: "owned-schedule" }],
      owned_plan_schedule_events: [{ id: "owned-event", schedule_id: "owned-schedule" }],
      owned_plan_mutation_requests: [{ request_id: "mutation" }],
      starter_plan_activation_requests: [{ request_id: "activation" }],
      owned_progression_recommendations: [{ id: "owned-recommendation", owned_plan_working_set_target_id: "owned-target" }],
    },
  };
  return { aggregate, operation };
}

describe("logical merge repository", () => {
  it("adopts one namespace in the same transaction as a full merge", async () => {
    const kernel = await open("full-plan-adoption");
    const { local, plan } = await fullPlanFixture(kernel);
    await kernel.write(async (transaction) => {
      await transaction.execute(
        "UPDATE automatic_backup_state SET permission_id = 'permission', connection_generation = 4, environment = 'development-test' WHERE id = 1",
      );
    });
    const receiptId = "adoption-receipt";
    const newNamespace = "d".repeat(32);
    const adoption = {
      receiptId,
      permissionId: "permission",
      connectionGeneration: 4,
      environment: "development-test" as const,
      oldNamespace: local.ownerNamespace,
      newNamespace,
      localFingerprint: await sha256(canonicalMergeValue(local)),
      remoteSnapshotSha256: "e".repeat(64),
      expiresAtMs: Date.now() + 60_000,
    };

    await expect(createFullPlanLogicalMergeWriter(kernel, { sha256 }).commitFullPlan({
      localFingerprint: adoption.localFingerprint,
      plan,
      adoption,
    })).resolves.toEqual({ state: "rebuild_pending" });

    await expect(kernel.queryAll("SELECT owner_namespace FROM portable_owner_identity"))
      .resolves.toEqual([{ owner_namespace: newNamespace }]);
    await expect(kernel.queryAll("SELECT receipt_id, consumed_at_ms FROM automatic_backup_namespace_adoption"))
      .resolves.toEqual([{ receipt_id: receiptId, consumed_at_ms: expect.any(Number) }]);
    await expect(createFullPlanLogicalMergeWriter(kernel, { sha256 }).commitFullPlan({
      localFingerprint: adoption.localFingerprint,
      plan,
      adoption,
    })).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("rolls namespace adoption and its receipt back with a failed merge", async () => {
    const kernel = await open("full-plan-adoption-rollback");
    const { local, plan } = await fullPlanFixture(kernel);
    await kernel.write(async (transaction) => {
      await transaction.execute(
        "UPDATE automatic_backup_state SET permission_id = 'permission' WHERE id = 1",
      );
    });
    const adoption = {
      receiptId: "rollback-receipt",
      permissionId: "permission",
      connectionGeneration: 0,
      environment: "production" as const,
      oldNamespace: local.ownerNamespace,
      newNamespace: "f".repeat(32),
      localFingerprint: await sha256(canonicalMergeValue(local)),
      remoteSnapshotSha256: "1".repeat(64),
      expiresAtMs: Date.now() + 60_000,
    };

    await expect(createFullPlanLogicalMergeWriter(kernel, {
      sha256,
      faultAfter: async (stage) => {
        if (stage === "adoption_consumed") throw new Error("fault");
      },
    }).commitFullPlan({ localFingerprint: adoption.localFingerprint, plan, adoption }))
      .rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(kernel.queryAll("SELECT owner_namespace FROM portable_owner_identity"))
      .resolves.toEqual([{ owner_namespace: local.ownerNamespace }]);
    await expect(kernel.queryAll("SELECT receipt_id FROM automatic_backup_namespace_adoption"))
      .resolves.toEqual([]);
  });

  it("accepts matching live local facts for every full-plan operation class", () => {
    const operations: PortableMergePlan["operations"] = [
      { aggregateClass: "app_setting", kind: "insert", key: "new-setting" },
      { aggregateClass: "app_setting", kind: "local_won", key: "existing-setting" },
      { aggregateClass: "workout_session", kind: "insert", portableId: "a".repeat(32), archiveId: "new-session", localId: "new-session" },
      { aggregateClass: "workout_session", kind: "archive_won", portableId: "b".repeat(32), archiveId: "archive-session", localId: "local-session" },
      { aggregateClass: "owned_plan", kind: "duplicate", portableId: "c".repeat(32), archiveId: "archive-dup-plan", localId: "local-dup-plan" },
      { aggregateClass: "owned_plan", kind: "insert", portableId: "d".repeat(32), archiveId: "new-plan", localId: "new-plan" },
      { aggregateClass: "owned_plan", kind: "keep_both", portableId: "e".repeat(32), archiveId: "physical-plan", localId: "new-physical-plan" },
      { aggregateClass: "custom_exercise", kind: "duplicate", portableId: "f".repeat(32), archiveId: "archive-dup-exercise", localId: "local-dup-exercise" },
      { aggregateClass: "custom_exercise", kind: "insert", portableId: "1".repeat(32), archiveId: "new-exercise", localId: "new-exercise" },
      { aggregateClass: "custom_exercise", kind: "keep_both", portableId: "2".repeat(32), archiveId: "physical-exercise", localId: "new-physical-exercise" },
    ];
    const local: MergeLocalFacts = {
      ownerNamespace: "9".repeat(32), schemaVersion: 22,
      tables: {
        app_settings: [{ key: "existing-setting" }],
        workout_sessions: [{ id: "local-session", portable_id: "b".repeat(32) }],
        plans: [
          { id: "local-dup-plan", origin: "custom", portable_id: "c".repeat(32) },
          { id: "physical-plan", origin: "copied", portable_id: "8".repeat(32) },
        ],
        exercises: [
          { id: "local-dup-exercise", origin: "custom", portable_id: "f".repeat(32) },
          { id: "physical-exercise", origin: "copied", portable_id: "7".repeat(32) },
        ],
      },
    };

    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanMatchesLocal(operationPlan(operations), local))
      .not.toThrow();
  });

  it("accepts optional child tables and a remapped owned-plan aggregate through direct validation", () => {
    const portableId = "a".repeat(32);
    const minimalCustom = {
      aggregateClass: "custom_exercise" as const,
      portableId,
      tables: {
        exercises: [{ id: "exercise", portable_id: portableId, origin: "custom" }],
        exercise_library_entries: [{ exercise_id: "exercise" }],
      },
    };
    expect(() => __logicalMergeRepositoryTestOnly.assertCustomExerciseAggregate(minimalCustom, {
      aggregateClass: "custom_exercise", kind: "insert", portableId, archiveId: "exercise", localId: "exercise",
    })).not.toThrow();

    const minimalSession = {
      aggregateClass: "workout_session" as const,
      portableId,
      tables: {
        workout_sessions: [{
          id: "session",
          portable_id: portableId,
          active_session_exercise_id: null,
          active_set_id: null,
        }],
        session_rest_states: [{ session_id: "session", next_set_id: null }],
      },
    };
    expect(() => __logicalMergeRepositoryTestOnly.assertSessionAggregate(minimalSession, {
      aggregateClass: "workout_session", kind: "insert", portableId, archiveId: "session", localId: "session",
    })).not.toThrow();

    const owned = maximalOwnedPlanAggregate();
    const operation = { ...owned.operation, kind: "keep_both" as const, archiveId: "archive-plan" };
    const remappedPlan: PortableMergePlan = {
      ...operationPlan([operation]),
      aggregates: [owned.aggregate],
      idMappings: [{ recordClass: "owned_plan", archiveId: operation.archiveId, localId: operation.localId }],
      idRemaps: [{ recordClass: "owned_plan", archiveId: operation.archiveId, localId: operation.localId }],
    };
    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanSlice(remappedPlan))
      .not.toThrow();

    const sessionOperation = {
      aggregateClass: "workout_session" as const,
      kind: "insert" as const,
      portableId: "b".repeat(32),
      archiveId: "archive-session",
      localId: "local-session",
    };
    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanSlice({
      ...operationPlan([sessionOperation]),
      aggregates: [{
        aggregateClass: "workout_session",
        portableId: sessionOperation.portableId,
        tables: { workout_sessions: [{ id: sessionOperation.localId, portable_id: sessionOperation.portableId }] },
      }],
      idMappings: [{ recordClass: "workout_session", archiveId: sessionOperation.archiveId, localId: sessionOperation.localId }],
      idRemaps: [{ recordClass: "workout_session", archiveId: sessionOperation.archiveId, localId: sessionOperation.localId }],
    })).not.toThrow();
  });

  it("rejects direct full-plan and live-local routing fallthroughs", () => {
    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanSlice({
      ...operationPlan([{ aggregateClass: "unknown", kind: "insert" } as never]),
      aggregates: [{ aggregateClass: "unknown", portableId: "unknown", tables: {} } as never],
    })).toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanSlice({
      ...operationPlan([]),
      aggregates: [{ aggregateClass: "unknown", portableId: "unknown", tables: {} } as never],
    })).toThrow(expect.objectContaining({ code: "logical_merge_failed" }));

    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanMatchesLocal(operationPlan([]), {
      ownerNamespace: "9".repeat(32), schemaVersion: 22, tables: {},
    })).not.toThrow();
    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanMatchesLocal(operationPlan([]), {
      ownerNamespace: "9".repeat(32), schemaVersion: 22, tables: { app_settings: [{ key: " " }] },
    })).toThrow(expect.objectContaining({ code: "logical_merge_failed" }));

    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanMatchesLocal(operationPlan([{
      aggregateClass: "workout_session", kind: "archive_won", portableId: "b".repeat(32), archiveId: "archive", localId: "local",
    }]), {
      ownerNamespace: "9".repeat(32), schemaVersion: 22,
      tables: { workout_sessions: [{ id: "wrong-local", portable_id: "b".repeat(32) }] },
    })).toThrow(expect.objectContaining({ code: "logical_merge_failed" }));

    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanMatchesLocal(operationPlan([{
      aggregateClass: "owned_plan", kind: "duplicate", portableId: "c".repeat(32), archiveId: "archive", localId: "local",
    }]), {
      ownerNamespace: "9".repeat(32), schemaVersion: 22,
      tables: { plans: [{ id: "wrong-local", origin: "custom", portable_id: "c".repeat(32) }] },
    })).toThrow(expect.objectContaining({ code: "logical_merge_failed" }));

    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanMatchesLocal(operationPlan([{
      aggregateClass: "custom_exercise", kind: "duplicate", portableId: "d".repeat(32), archiveId: "archive", localId: "local",
    }]), {
      ownerNamespace: "9".repeat(32), schemaVersion: 22,
      tables: { exercises: [{ id: "wrong-local", origin: "custom", portable_id: "d".repeat(32) }] },
    })).toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("covers private table classification, keying, and primitive identity guards", () => {
    expect(__logicalMergeRepositoryTestOnly.fullPlanTable("exercises")).toBe(true);
    expect(__logicalMergeRepositoryTestOnly.fullPlanTable("plans")).toBe(false);
    expect(__logicalMergeRepositoryTestOnly.ownedPlanTable("plans")).toBe(true);
    expect(__logicalMergeRepositoryTestOnly.ownedPlanTable("exercises")).toBe(false);
    expect(__logicalMergeRepositoryTestOnly.aggregateKey({ aggregateClass: "custom_exercise", portableId: "id", tables: {} }))
      .toBe("custom_exercise\u0000id");
    expect(__logicalMergeRepositoryTestOnly.plannedRootOperationKey({
      aggregateClass: "workout_session", kind: "insert", portableId: "id", archiveId: "archive", localId: "local",
    })).toBe("workout_session\u0000archive\u0000local");
    expect(__logicalMergeRepositoryTestOnly.textId("text")).toBe("text");
    expect(() => __logicalMergeRepositoryTestOnly.textId(" "))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("covers valid and fault-injected per-table aggregate insertion hooks", async () => {
    const stages: string[] = [];
    const transaction = transactionStub({ execute: async () => ({ changes: 1, lastInsertRowId: 0 }) });
    await __logicalMergeRepositoryTestOnly.insertArchiveAggregate(
      transaction,
      { workout_sessions: [{ id: "session" }], session_sets: [{ id: "set" }] },
      async (stage) => { stages.push(stage); },
    );
    await __logicalMergeRepositoryTestOnly.insertFullPlanSettings(
      transaction,
      { ...operationPlan([]), settings: [{ key: "units" }] },
      async (stage) => { stages.push(stage); },
    );
    expect(stages).toContain("insert:workout_sessions");
    expect(stages).toContain("insert:session_sets");
    expect(stages).toContain("full_plan_insert:app_settings");

    await expect(__logicalMergeRepositoryTestOnly.insertArchiveAggregate(
      transaction,
      { workout_sessions: [{ id: "session" }] },
      async () => { throw new Error("fault"); },
    )).rejects.toThrow("fault");
  });

  it("batches rows under the conservative bind limit and rejects unsafe batches", async () => {
    const statements: string[] = [];
    const parameterCounts: number[] = [];
    const transaction = transactionStub({
      execute: async (sql, parameters) => {
        statements.push(sql);
        parameterCounts.push(parameters.length);
        return { changes: parameters.length, lastInsertRowId: 0 };
      },
    });
    const rows = Array.from({ length: 4_001 }, (_, index) => ({ id: `row-${index}` }));

    await expect(__logicalMergeRepositoryTestOnly.insertRows(
      transaction,
      "workout_sessions",
      rows,
    )).resolves.toBeUndefined();
    expect(statements).toHaveLength(2);
    expect(parameterCounts).toEqual([4_000, 1]);
    expect(statements[0]).toContain('INSERT INTO "workout_sessions" ("id")');

    await expect(__logicalMergeRepositoryTestOnly.insertRows(
      transactionStub(),
      "workout_sessions",
      [],
    )).resolves.toBeUndefined();
    await expect(__logicalMergeRepositoryTestOnly.insertRows(
      transactionStub(),
      "workout_sessions",
      [{}],
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(__logicalMergeRepositoryTestOnly.insertRows(
      transactionStub(),
      "workout_sessions",
      [{ id: "one" }, { id: "two", extra: "unexpected" }],
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(__logicalMergeRepositoryTestOnly.insertRows(
      transactionStub({ execute: async () => ({ changes: 0, lastInsertRowId: 0 }) }),
      "workout_sessions",
      [{ id: "one" }],
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("verifies primary-key batches with exact row values", async () => {
    const rows = Array.from({ length: 4_001 }, (_, index) => ({
      key: `setting-${index}`,
      value_json: `"${index}"`,
    }));
    const reads: number[] = [];
    const byKey = new Map(rows.map((row) => [row.key, row]));
    const transaction = transactionStub({
      queryAll: async (_sql, parameters) => {
        reads.push(parameters.length);
        return parameters.map((key) => byKey.get(String(key))!);
      },
    });
    await expect(__logicalMergeRepositoryTestOnly.verifyRows(
      transaction,
      "app_settings",
      rows,
    )).resolves.toBeUndefined();
    expect(reads).toEqual([4_000, 1]);
    await expect(__logicalMergeRepositoryTestOnly.verifyRows(
      transactionStub(),
      "app_settings",
      [],
    )).resolves.toBeUndefined();
    await expect(__logicalMergeRepositoryTestOnly.verifyRows(
      transactionStub({ queryAll: async () => [] }),
      "app_settings",
      [{ key: "missing", value_json: "{}" }],
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(__logicalMergeRepositoryTestOnly.verifyRows(
      transactionStub({ queryAll: async () => [{ key: "same", value_json: "wrong" }] }),
      "app_settings",
      [{ key: "same", value_json: "right" }],
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(__logicalMergeRepositoryTestOnly.verifyRows(
      transactionStub({ queryAll: async () => [{ key: "other", value_json: "right" }] }),
      "app_settings",
      [{ key: "same", value_json: "right" }],
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(__logicalMergeRepositoryTestOnly.verifyRows(
      transactionStub(),
      "app_settings",
      [{ key: "duplicate" }, { key: "duplicate" }],
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));

    await expect(__logicalMergeRepositoryTestOnly.readRowsByPrimaryKey(
      transactionStub(),
      "app_settings",
      [],
    )).resolves.toEqual(new Map());
    await expect(__logicalMergeRepositoryTestOnly.readRowsByPrimaryKey(
      transactionStub({ queryAll: async () => [
        { key: "duplicate", value_json: "{}" },
        { key: "duplicate", value_json: "{}" },
      ] }),
      "app_settings",
      [{ key: "duplicate", value_json: "{}" }],
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    expect(() => __logicalMergeRepositoryTestOnly.assertExactRows(
      "app_settings",
      [{ key: "duplicate", value_json: "{}" }],
      [
        { key: "duplicate", value_json: "{}" },
        { key: "duplicate", value_json: "{}" },
      ],
    )).toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("deletes every session child before its root and exposes exact fault stages", async () => {
    const statements: string[] = [];
    const stages: string[] = [];
    const transaction = transactionStub({
      execute: async (sql) => { statements.push(sql); return { changes: 1, lastInsertRowId: 0 }; },
    });
    await __logicalMergeRepositoryTestOnly.deleteLocalAggregate(
      transaction,
      "session",
      async (stage) => { stages.push(stage); },
    );
    expect(statements).toHaveLength(10);
    expect(statements.at(-1)).toContain('DELETE FROM "workout_sessions"');
    expect(stages).toEqual(expect.arrayContaining([
      "delete:session_advanced_timing_states",
      "delete:workout_sessions",
    ]));
  });

  it("accepts exact state advancement and taxonomy insertion through direct helpers", async () => {
    let stateRead = 0;
    const stateTransaction = transactionStub({
      execute: async () => ({ changes: 1, lastInsertRowId: 0 }),
      queryAll: async (sql) => {
        if (sql.includes("portability_restore_state")) {
          stateRead += 1;
          return stateRead === 1 ? [{ updated_at_ms: 5 }] : [{ state: "rebuild_pending" }];
        }
        return [];
      },
    });
    await expect(__logicalMergeRepositoryTestOnly.markRebuildPending(stateTransaction, 1))
      .resolves.toBeUndefined();

    const inserts: string[] = [];
    const taxonomyTransaction = transactionStub({
      execute: async (sql) => { inserts.push(sql); return { changes: 1, lastInsertRowId: 0 }; },
      queryAll: async () => [],
    });
    await expect(__logicalMergeRepositoryTestOnly.insertFullPlanTaxonomyTerm(
      taxonomyTransaction,
      { kind: "equipment", slug: "bar", display_name: "Bar" },
    )).resolves.toBeUndefined();
    expect(inserts[0]).toContain('"taxonomy_terms"');
  });

  it("rejects exact verification helper faults", async () => {
    const kernel = await open("verification-helper-faults");
    const { plan } = await fullPlanFixture(kernel);
    const missingPrimaryKey = {
      ...plan,
      settings: [{ value_json: '"metric"' }],
    };
    await expect(__logicalMergeRepositoryTestOnly.verifyFullPlanSlice(
      transactionStub(),
      missingPrimaryKey,
      undefined,
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));

    const mismatch = verificationTransaction(plan);
    await expect(__logicalMergeRepositoryTestOnly.verifyFullPlanSlice(
      mismatch,
      {
        ...plan,
        settings: plan.settings.map((row) => ({ ...row, value_json: '"different"' })),
      },
      undefined,
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
  });
  it("rejects malformed private SQL values and row mutations before they reach SQLite", async () => {
    const transaction = transactionStub();

    expect(() => __logicalMergeRepositoryTestOnly.identifier("plans; DROP TABLE plans"))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
    expect(() => __logicalMergeRepositoryTestOnly.scalar(true))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(__logicalMergeRepositoryTestOnly.insertRow(
      transaction,
      "workout_sessions",
      {},
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(__logicalMergeRepositoryTestOnly.insertFullPlanRow(
      transaction,
      "app_settings",
      { key: "units", value_json: true },
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("rejects invalid trigger metadata and external session references before replacement", async () => {
    const missingTriggerMetadata = transactionStub({
      queryAll: async () => [],
    });
    await expect(__logicalMergeRepositoryTestOnly.captureDeleteTriggers(missingTriggerMetadata))
      .rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));

    const referencedSession = transactionStub({
      queryAll: async () => [{ count: 1 }],
    });
    await expect(__logicalMergeRepositoryTestOnly.assertNoExternalSessionReferences(referencedSession, "session"))
      .rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("rejects incomplete trigger maps and trigger recreation drift", async () => {
    const incomplete = new Map<string, string>();
    await expect(__logicalMergeRepositoryTestOnly.dropDeleteTriggers(
      transactionStub(),
      incomplete,
      undefined,
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));

    const triggerNames = [
      "history_audit_events_immutable_delete",
      "workout_session_exercise_edit_receipts_immutable_delete",
      "workout_session_exercise_reorder_receipts_immutable_delete",
    ];
    const complete = new Map(triggerNames.map((name) => [name, `CREATE TRIGGER ${name} AFTER DELETE ON workout_sessions BEGIN SELECT 1; END`]));
    const recreatedWithDrift = transactionStub({
      queryAll: async () => triggerNames.map((name) => ({ name, sql: "different trigger SQL" })),
    });
    await expect(__logicalMergeRepositoryTestOnly.recreateDeleteTriggers(
      recreatedWithDrift,
      complete,
      undefined,
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(__logicalMergeRepositoryTestOnly.recreateDeleteTriggers(
      transactionStub(),
      new Map(),
      undefined,
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("rejects taxonomy conflicts and non-single-row writes", async () => {
    const duplicateTaxonomy = transactionStub({
      queryAll: async () => [{ kind: "equipment", slug: "bar" }, { kind: "equipment", slug: "bar" }],
    });
    await expect(__logicalMergeRepositoryTestOnly.insertFullPlanTaxonomyTerm(
      duplicateTaxonomy,
      { kind: "equipment", slug: "bar", display_name: "Bar" },
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));

    const noChange = transactionStub({
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
    });
    await expect(__logicalMergeRepositoryTestOnly.insertFullPlanRow(
      noChange,
      "app_settings",
      { key: "units", value_json: '"metric"' },
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(__logicalMergeRepositoryTestOnly.insertFullPlanRow(
      transactionStub(),
      "app_settings",
      {},
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(__logicalMergeRepositoryTestOnly.insertFullPlanTaxonomyTerm(
      transactionStub(),
      { slug: "bar" },
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(__logicalMergeRepositoryTestOnly.insertRow(
      noChange,
      "workout_sessions",
      { id: "session" },
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(__logicalMergeRepositoryTestOnly.insertFullPlanTaxonomyTerm(
      transactionStub({ queryAll: async () => [{ kind: "equipment", slug: "bar", display_name: "Different" }] }),
      { kind: "equipment", slug: "bar", display_name: "Bar" },
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("captures, recreates, and fault-checks the complete immutable trigger set", async () => {
    const triggerNames = [
      "history_audit_events_immutable_delete",
      "workout_session_exercise_edit_receipts_immutable_delete",
      "workout_session_exercise_reorder_receipts_immutable_delete",
    ];
    const triggers = new Map(triggerNames.map((name) => [name, `CREATE TRIGGER ${name} AFTER DELETE ON workout_sessions BEGIN SELECT 1; END`]));
    const executed: string[] = [];
    const transaction = transactionStub({
      execute: async (sql) => { executed.push(sql); return { changes: 1, lastInsertRowId: 0 }; },
      queryAll: async () => triggerNames.map((name) => ({ name, sql: triggers.get(name)! })),
    });
    const captured = await __logicalMergeRepositoryTestOnly.captureDeleteTriggers(transaction);
    await __logicalMergeRepositoryTestOnly.dropDeleteTriggers(transaction, captured, undefined);
    await __logicalMergeRepositoryTestOnly.recreateDeleteTriggers(transaction, captured, undefined);

    expect(captured).toEqual(triggers);
    expect(executed.filter((sql) => sql.startsWith("DROP TRIGGER"))).toHaveLength(3);
    expect(executed.filter((sql) => sql.startsWith("CREATE TRIGGER"))).toHaveLength(3);
  });

  it("inserts source rows, existing taxonomy rows, and all aggregate table families", async () => {
    const statements: string[] = [];
    const transaction = transactionStub({
      execute: async (sql) => { statements.push(sql); return { changes: 1, lastInsertRowId: 0 }; },
      queryAll: async (sql) => sql.includes("FROM taxonomy_terms")
        ? [{ kind: "equipment", slug: "bar", display_name: "Bar" }]
        : [],
    });
    await __logicalMergeRepositoryTestOnly.insertRow(transaction, "workout_sessions", { id: "session" });
    await __logicalMergeRepositoryTestOnly.insertFullPlanTaxonomyTerm(transaction, { kind: "equipment", slug: "bar", display_name: "Bar" });
    const custom = {
      aggregateClass: "custom_exercise" as const, portableId: "a".repeat(32),
      tables: { exercises: [{ id: "exercise" }], taxonomy_terms: [{ kind: "equipment", slug: "bar", display_name: "Bar" }] },
    };
    const session = {
      aggregateClass: "workout_session" as const, portableId: "b".repeat(32),
      tables: { workout_sessions: [{ id: "session" }] },
    };
    const owned = {
      aggregateClass: "owned_plan" as const, portableId: "c".repeat(32),
      tables: { plans: [{ id: "plan" }] },
    };
    await __logicalMergeRepositoryTestOnly.insertCustomExerciseAggregate(transaction, custom, undefined);
    await __logicalMergeRepositoryTestOnly.insertFullPlanSessionAggregate(transaction, session, undefined);
    await __logicalMergeRepositoryTestOnly.insertOwnedPlanAggregate(transaction, owned, undefined);
    await __logicalMergeRepositoryTestOnly.insertFullPlanSettings(transaction, { ...operationPlan([]), settings: [{ key: "units" }] }, undefined);
    await __logicalMergeRepositoryTestOnly.insertArchiveAggregate(transaction, { workout_sessions: [{ id: "legacy-session" }] }, undefined);

    expect(statements.some((sql) => sql.includes('"workout_sessions"'))).toBe(true);
    expect(statements.some((sql) => sql.includes('"plans"'))).toBe(true);
    expect(statements.some((sql) => sql.includes('"app_settings"'))).toBe(true);
  });

  it("rejects verification and rebuild-state readbacks that are not exact", async () => {
    const kernel = await open("full-plan-verification-guards");
    const { plan } = await fullPlanFixture(kernel);
    const verificationMiss = transactionStub({
      queryAll: async () => [],
    });
    await expect(__logicalMergeRepositoryTestOnly.verifyFullPlanSlice(verificationMiss, plan, undefined))
      .rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));

    const invalidState = transactionStub({
      queryAll: async () => [{ updated_at_ms: -1 }],
    });
    await expect(__logicalMergeRepositoryTestOnly.markRebuildPending(invalidState, 1))
      .rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(__logicalMergeRepositoryTestOnly.markRebuildPending(
      transactionStub({
        execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
        queryAll: async () => [{ updated_at_ms: 1 }],
      }),
      1,
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    let stateReads = 0;
    await expect(__logicalMergeRepositoryTestOnly.markRebuildPending(
      transactionStub({
        queryAll: async () => {
          stateReads += 1;
          return stateReads === 1 ? [{ updated_at_ms: 1 }] : [{ state: "ready" }];
        },
      }),
      1,
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("rejects malformed verification roots, session readbacks, and foreign-key rows", async () => {
    const customKernel = await open("verify-custom-root");
    const { plan: customPlan } = await fullPlanFixture(customKernel);
    const customWithoutRoot = {
      ...customPlan,
      aggregates: customPlan.aggregates.map((aggregate) => aggregate.aggregateClass === "custom_exercise"
        ? { ...aggregate, tables: { ...aggregate.tables, exercises: [] } }
        : aggregate),
    };
    await expect(__logicalMergeRepositoryTestOnly.verifyFullPlanSlice(
      verificationTransaction(customPlan),
      customWithoutRoot,
      undefined,
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));

    const { plan: ownedPlan } = await fullOwnedPlanFixture();
    const ownedWithWrongRoot = {
      ...ownedPlan,
      aggregates: ownedPlan.aggregates.map((aggregate) => aggregate.aggregateClass === "owned_plan"
        ? { ...aggregate, tables: { ...aggregate.tables, plans: [{ ...aggregate.tables.plans![0]!, id: "wrong-plan" }] } }
        : aggregate),
    };
    await expect(__logicalMergeRepositoryTestOnly.verifyFullPlanSlice(
      verificationTransaction(ownedPlan),
      ownedWithWrongRoot,
      undefined,
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));

    const { plan: sessionPlan } = await fullSessionPlanFixture();
    const sessionWithWrongRoot = {
      ...sessionPlan,
      aggregates: sessionPlan.aggregates.map((aggregate) => aggregate.aggregateClass === "workout_session"
        ? { ...aggregate, tables: { ...aggregate.tables, workout_sessions: [{ ...aggregate.tables.workout_sessions![0]!, id: "wrong-session" }] } }
        : aggregate),
    };
    await expect(__logicalMergeRepositoryTestOnly.verifyFullPlanSlice(
      fullReadbackTransaction(sessionPlan),
      sessionWithWrongRoot,
      undefined,
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    const sessionAggregate = sessionPlan.aggregates.find((aggregate) => aggregate.aggregateClass === "workout_session")!;
    await expect(__logicalMergeRepositoryTestOnly.verifyFullPlanSlice(
      fullReadbackTransaction(sessionPlan, {
        workoutSessions: [{ ...sessionAggregate.tables.workout_sessions![0]!, portable_id: "wrong-portable" }],
      }),
      sessionPlan,
      undefined,
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(__logicalMergeRepositoryTestOnly.verifyFullPlanSlice(
      verificationTransaction(customPlan),
      customPlan,
      undefined,
    )).resolves.toBeUndefined();
    await expect(__logicalMergeRepositoryTestOnly.verifyFullPlanSlice(
      fullReadbackTransaction({ ...sessionPlan, aggregates: [] }, { foreignKeyRows: [{ table: "orphan" }] }),
      { ...sessionPlan, aggregates: [] },
      undefined,
    )).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("rejects disabled foreign keys before a full-plan write can begin", async () => {
    const kernel = await open("full-plan-disabled-foreign-keys");
    const { local, plan } = await fullPlanFixture(kernel);

    await expect(createFullPlanLogicalMergeWriter(
      transactionKernel(mergeTransaction(local, { foreignKeys: 0 })),
      { sha256 },
    ).commitFullPlan({
      localFingerprint: await sha256(canonicalMergeValue(local)),
      plan,
    })).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("fails closed for every rejected legacy transaction precondition", async () => {
    const archiveKernel = await open("legacy-transaction-edges-archive");
    await seedSession(archiveKernel, {
      id: "archive-session",
      portableId: "a".repeat(32),
      modifiedAtMs: 20,
    });
    const archive = await snapshot(archiveKernel);
    const localKernel = await open("legacy-transaction-edges-local");
    const local = await createSqliteMergeLocalFactsPort(localKernel).read();
    const archiveSession = archive.tables.workout_sessions![0]!;
    const archivePortableId = archiveSession.portable_id as string;
    const baseInput = async (facts: MergeLocalFacts, operation: StoredMergePreflight["operation"]) => ({
      archiveDigest: "archive",
      localFingerprint: await sha256(canonicalMergeValue(facts)),
      operation,
      snapshot: archive,
    });

    const duplicateLocal: MergeLocalFacts = {
      ...local,
      tables: {
        ...local.tables,
        workout_sessions: [
          { id: "first", portable_id: archivePortableId },
          { id: "second", portable_id: archivePortableId },
        ],
      },
    };
    await expect(createLogicalMergeRepository(
      transactionKernel(mergeTransaction(duplicateLocal)),
      { sha256 },
    ).commit(await baseInput(duplicateLocal, {
      kind: "insert",
      portableId: archivePortableId,
    }))).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));

    await expect(createLogicalMergeRepository(
      transactionKernel(mergeTransaction(local)),
      { sha256 },
    ).commit(await baseInput(local, {
      kind: "insert",
      portableId: "b".repeat(32),
    }))).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));

    await expect(createLogicalMergeRepository(
      transactionKernel(mergeTransaction(local, { foreignKeys: 0 })),
      { sha256 },
    ).commit(await baseInput(local, {
      kind: "insert",
      portableId: archivePortableId,
    }))).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));

    const malformedIdLocal: MergeLocalFacts = {
      ...local,
      tables: {
        ...local.tables,
        workout_sessions: [{ id: 1, portable_id: archivePortableId }],
      },
    };
    await expect(createLogicalMergeRepository(
      transactionKernel(mergeTransaction(malformedIdLocal)),
      { sha256 },
    ).commit(await baseInput(malformedIdLocal, {
      kind: "archive_won",
      portableId: archivePortableId,
    }))).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));

    const afterInsert: MergeLocalFacts = {
      ...local,
      tables: {
        ...local.tables,
        ...portableMergeArchiveSessionAggregate(archive).tables,
      },
    };
    await expect(createLogicalMergeRepository(
      transactionKernel(mergeTransaction(local)),
      { sha256 },
    ).commit(await baseInput(local, {
      kind: "insert",
      portableId: archivePortableId,
    }))).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(createLogicalMergeRepository(
      transactionKernel(mergeTransaction(local, {
        afterWrite: afterInsert,
        foreignKeyRows: [{ table: "orphan" }],
      })),
      { sha256 },
    ).commit(await baseInput(local, {
      kind: "insert",
      portableId: archivePortableId,
    }))).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("verifies a populated full-plan row graph and clean foreign-key check", async () => {
    const kernel = await open("full-plan-verification-success");
    const { plan } = await fullPlanFixture(kernel);
    await expect(__logicalMergeRepositoryTestOnly.verifyFullPlanSlice(
      verificationTransaction(plan),
      { ...plan, aggregates: plan.aggregates.filter((aggregate) => aggregate.aggregateClass !== "workout_session") },
      undefined,
    )).resolves.toBeUndefined();
  });

  it("exposes no production writer path through the full-plan validation test seam", async () => {
    const kernel = await open("full-plan-test-seam");
    const { plan } = await fullPlanFixture(kernel);

    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanSlice(plan))
      .not.toThrow();
  });

  it("supplies production secure merge with only the full-plan writer capability", () => {
    const writer = createFullPlanLogicalMergeWriter(
      transactionKernel(transactionStub()),
      { sha256 },
    );

    expect(writer).toEqual({ commitFullPlan: expect.any(Function) });
    expect("commit" in writer).toBe(false);
  });

  it("accepts each FK-closed aggregate class through its direct validator", async () => {
    const customKernel = await open("direct-valid-custom");
    const { plan: customPlan } = await fullPlanFixture(customKernel);
    const customAggregate = customPlan.aggregates.find((value) => value.aggregateClass === "custom_exercise")!;
    const customOperation = customPlan.operations.find((value) => value.aggregateClass === "custom_exercise")!;
    expect(() => __logicalMergeRepositoryTestOnly.assertCustomExerciseAggregate(customAggregate, customOperation as never))
      .not.toThrow();

    const { plan: sessionPlan } = await fullSessionPlanFixture();
    const sessionAggregate = sessionPlan.aggregates.find((value) => value.aggregateClass === "workout_session")!;
    const sessionOperation = sessionPlan.operations.find((value) => value.aggregateClass === "workout_session")!;
    expect(() => __logicalMergeRepositoryTestOnly.assertSessionAggregate(sessionAggregate, sessionOperation as never))
      .not.toThrow();

    const { plan: ownedPlan } = await fullOwnedPlanFixture();
    const ownedAggregate = ownedPlan.aggregates.find((value) => value.aggregateClass === "owned_plan")!;
    const ownedOperation = ownedPlan.operations.find((value) => value.aggregateClass === "owned_plan")!;
    expect(() => __logicalMergeRepositoryTestOnly.assertOwnedPlanAggregate(ownedAggregate, ownedOperation as never))
      .not.toThrow();

    const maximal = maximalOwnedPlanAggregate();
    expect(() => __logicalMergeRepositoryTestOnly.assertOwnedPlanAggregate(maximal.aggregate, maximal.operation))
      .not.toThrow();
  });

  it("accepts a combined all-class plan with matching aggregate mappings", async () => {
    const customKernel = await open("combined-plan-custom");
    const { plan: customPlan } = await fullPlanFixture(customKernel);
    const { plan: sessionPlan } = await fullSessionPlanFixture();
    const { plan: ownedPlan } = await fullOwnedPlanFixture();
    const combined: PortableMergePlan = {
      operations: [...customPlan.operations, ...sessionPlan.operations, ...ownedPlan.operations],
      idMappings: [...customPlan.idMappings, ...sessionPlan.idMappings, ...ownedPlan.idMappings],
      idRemaps: [...customPlan.idRemaps, ...sessionPlan.idRemaps, ...ownedPlan.idRemaps],
      settings: customPlan.settings,
      aggregates: [...customPlan.aggregates, ...sessionPlan.aggregates, ...ownedPlan.aggregates],
      preview: { inserted: 0, duplicates: 0, archiveWon: 0, localWon: 0, keptBoth: 0, remapped: 0, conflicts: 0 },
    };

    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanSlice(combined))
      .not.toThrow();
  });

  it.each([
    ["an unsupported operation class", (plan: PortableMergePlan) => ({
      ...plan,
      operations: [...plan.operations, { aggregateClass: "unsupported", kind: "insert" } as never],
    })],
    ["an unsupported aggregate class", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: [...plan.aggregates, { aggregateClass: "unsupported", portableId: "x", tables: {} } as never],
    })],
    ["a mapping with an unsupported record class", (plan: PortableMergePlan) => ({
      ...plan,
      idMappings: [...plan.idMappings, { recordClass: "unsupported", archiveId: "x", localId: "x" } as never],
    })],
    ["an unmatched required custom remap", (plan: PortableMergePlan) => {
      const custom = plan.operations.find((operation) => operation.aggregateClass === "custom_exercise")!;
      return {
        ...plan,
        operations: plan.operations.map((operation) => operation === custom
          ? { ...operation, kind: "keep_both" as const }
          : operation),
        idRemaps: [],
      };
    }],
  ] as Array<[string, (plan: PortableMergePlan) => PortableMergePlan]>)("rejects %s in direct full-plan validation", async (_label, mutate) => {
    const kernel = await open(`direct-plan-${_label}`);
    const { plan } = await fullPlanFixture(kernel);
    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanSlice(mutate(plan)))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it.each([
    ["a blank local setting key", operationPlan([]), { app_settings: [{ key: " " }] }],
    ["a session winner without its local identity", operationPlan([{
      aggregateClass: "workout_session", kind: "archive_won", portableId: "a".repeat(32), archiveId: "archive", localId: "local",
    }]), { workout_sessions: [] }],
    ["an owned insert whose archive and local physical ids differ", operationPlan([{
      aggregateClass: "owned_plan", kind: "insert", portableId: "b".repeat(32), archiveId: "archive", localId: "local",
    }]), { plans: [] }],
    ["an owned keep-both whose archive physical id is absent", operationPlan([{
      aggregateClass: "owned_plan", kind: "keep_both", portableId: "c".repeat(32), archiveId: "archive", localId: "local",
    }]), { plans: [] }],
    ["a custom insert whose archive and local physical ids differ", operationPlan([{
      aggregateClass: "custom_exercise", kind: "insert", portableId: "d".repeat(32), archiveId: "archive", localId: "local",
    }]), { exercises: [] }],
    ["a custom keep-both whose archive physical id is absent", operationPlan([{
      aggregateClass: "custom_exercise", kind: "keep_both", portableId: "e".repeat(32), archiveId: "archive", localId: "local",
    }]), { exercises: [] }],
  ] as Array<[string, PortableMergePlan, Record<string, readonly LogicalBackupRow[]>]>)("rejects live local facts with %s", (_label, plan, tables) => {
    const local: MergeLocalFacts = { ownerNamespace: "9".repeat(32), schemaVersion: 22, tables };
    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanMatchesLocal(plan, local))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it.each([
    ["a custom aggregate missing its root", (plan: PortableMergePlan) => ({
      ...plan, aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "custom_exercise"
        ? { ...aggregate, tables: { ...aggregate.tables, exercises: [] } }
        : aggregate),
    })],
    ["a custom aggregate with a non-array table", (plan: PortableMergePlan) => ({
      ...plan, aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "custom_exercise"
        ? { ...aggregate, tables: { ...aggregate.tables, exercise_aliases: {} as never } }
        : aggregate),
    })],
    ["a custom aggregate whose taxonomy term has a blank kind", (plan: PortableMergePlan) => ({
      ...plan, aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "custom_exercise"
        ? { ...aggregate, tables: { ...aggregate.tables, taxonomy_terms: [{ kind: " ", slug: "strength" }] } }
        : aggregate),
    })],
  ] as Array<[string, (plan: PortableMergePlan) => PortableMergePlan]>)("rejects %s through direct custom aggregate validation", async (_label, mutate) => {
    const kernel = await open(`direct-custom-${_label}`);
    const { plan } = await fullPlanFixture(kernel);
    const invalid = mutate(plan);
    const aggregate = invalid.aggregates.find((value) => value.aggregateClass === "custom_exercise")!;
    const operation = invalid.operations.find((value) => value.aggregateClass === "custom_exercise")!;

    expect(() => __logicalMergeRepositoryTestOnly.assertCustomExerciseAggregate(aggregate, operation as never))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it.each([
    ["a session aggregate with an unsupported table", (plan: PortableMergePlan) => ({
      ...plan, aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "workout_session"
        ? { ...aggregate, tables: { ...aggregate.tables, app_settings: [] } }
        : aggregate),
    })],
    ["a session aggregate with a blank exercise id", (plan: PortableMergePlan) => ({
      ...plan, aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "workout_session"
        ? { ...aggregate, tables: { ...aggregate.tables, session_exercises: (aggregate.tables.session_exercises ?? []).map((row) => ({ ...row, id: " " })) } }
        : aggregate),
    })],
    ["a session aggregate with a rest pointer outside its set graph", (plan: PortableMergePlan) => ({
      ...plan, aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "workout_session"
        ? { ...aggregate, tables: { ...aggregate.tables, session_rest_states: [{ session_id: "local-session", next_set_id: "missing" }] } }
        : aggregate),
    })],
  ] as Array<[string, (plan: PortableMergePlan) => PortableMergePlan]>)("rejects %s through direct session aggregate validation", async (_label, mutate) => {
    const { plan } = await fullSessionPlanFixture();
    const invalid = mutate(plan);
    const aggregate = invalid.aggregates.find((value) => value.aggregateClass === "workout_session")!;
    const operation = invalid.operations.find((value) => value.aggregateClass === "workout_session")!;

    expect(() => __logicalMergeRepositoryTestOnly.assertSessionAggregate(aggregate, operation as never))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it.each([
    ["an unsupported owned-plan table", (plan: PortableMergePlan) => ({
      ...plan, aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "owned_plan"
        ? { ...aggregate, tables: { ...aggregate.tables, exercises: [] } }
        : aggregate),
    })],
    ["a legacy schedule binding outside its schedule/day graph", (plan: PortableMergePlan) => ({
      ...plan, aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "owned_plan"
        ? { ...aggregate, tables: { ...aggregate.tables, plan_schedule_bindings: [{ id: "binding", schedule_id: "missing", plan_day_id: "missing" }] } }
        : aggregate),
    })],
    ["a legacy target outside its occurrence graph", (plan: PortableMergePlan) => ({
      ...plan, aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "owned_plan"
        ? { ...aggregate, tables: { ...aggregate.tables, plan_working_set_targets: [{ id: "target", plan_day_exercise_id: "missing" }] } }
        : aggregate),
    })],
    ["an owned schedule version outside its schedule graph", (plan: PortableMergePlan) => ({
      ...plan, aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "owned_plan"
        ? { ...aggregate, tables: { ...aggregate.tables, owned_plan_schedule_versions: [{ id: "version", schedule_id: "missing" }] } }
        : aggregate),
    })],
    ["an owned schedule override outside its schedule graph", (plan: PortableMergePlan) => ({
      ...plan, aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "owned_plan"
        ? { ...aggregate, tables: { ...aggregate.tables, owned_plan_schedule_overrides: [{ id: "override", schedule_id: "missing" }] } }
        : aggregate),
    })],
  ] as Array<[string, (plan: PortableMergePlan) => PortableMergePlan]>)("rejects %s through direct owned-plan aggregate validation", async (_label, mutate) => {
    const { plan } = await fullOwnedPlanFixture();
    const invalid = mutate(plan);
    const aggregate = invalid.aggregates.find((value) => value.aggregateClass === "owned_plan")!;
    const operation = invalid.operations.find((value) => value.aggregateClass === "owned_plan")!;

    expect(() => __logicalMergeRepositoryTestOnly.assertOwnedPlanAggregate(aggregate, operation as never))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("rejects aggregate selection with missing planned operations", async () => {
    const { plan } = await fullOwnedPlanFixture();
    const orphaned: PortableMergePlan = {
      ...plan,
      operations: plan.operations.filter((operation) => operation.aggregateClass !== "owned_plan"),
    };
    expect(() => __logicalMergeRepositoryTestOnly.ownedPlanAggregatesForFullPlan(orphaned))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));

    const { plan: sessionPlan } = await fullSessionPlanFixture();
    const orphanedSession: PortableMergePlan = {
      ...sessionPlan,
      operations: sessionPlan.operations.filter((operation) => operation.aggregateClass !== "workout_session"),
    };
    expect(() => __logicalMergeRepositoryTestOnly.sessionAggregatesForFullPlan(orphanedSession))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("rejects non-canonical full-plan snapshots before the writer can start", async () => {
    expect(() => __logicalMergeRepositoryTestOnly.snapshotFullPlan({
      circular: undefined,
      toJSON: () => undefined,
    } as unknown as PortableMergePlan)).toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => __logicalMergeRepositoryTestOnly.snapshotFullPlan(cyclic as PortableMergePlan))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
    expect(() => __logicalMergeRepositoryTestOnly.snapshotFullPlan({
      createdAt: new Date(),
    } as unknown as PortableMergePlan)).toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
    expect(__logicalMergeRepositoryTestOnly.aggregateRows({}, "session_sets")).toEqual([]);
  });

  it.each([
    ["a custom root with the wrong physical id", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "custom_exercise"
        ? {
          ...aggregate,
          tables: {
            ...aggregate.tables,
            exercises: aggregate.tables.exercises!.map((row) => ({ ...row, id: "wrong-id" })),
          },
        }
        : aggregate),
    })],
    ["a non-owned custom root", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "custom_exercise"
        ? {
          ...aggregate,
          tables: {
            ...aggregate.tables,
            exercises: aggregate.tables.exercises!.map((row) => ({ ...row, origin: "bundled" })),
          },
        }
        : aggregate),
    })],
    ["a custom aggregate with a blank taxonomy slug", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "custom_exercise"
        ? {
          ...aggregate,
          tables: {
            ...aggregate.tables,
            exercise_taxonomy: (aggregate.tables.exercise_taxonomy ?? []).map((row) => ({ ...row, slug: " " })),
          },
        }
        : aggregate),
    })],
  ] as Array<[string, (plan: PortableMergePlan) => PortableMergePlan]>)("rejects %s through full-plan aggregate validation", async (_label, mutate) => {
    const kernel = await open(`full-plan-seam-custom-${_label}`);
    const { plan } = await fullPlanFixture(kernel);

    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanSlice(mutate(plan)))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("rejects full-plan setting operations that drift from the live local keys", async () => {
    const kernel = await open("full-plan-live-settings");
    const { local, plan } = await fullPlanFixture(kernel);
    const settings = local.tables.app_settings ?? [];
    const localWithImportedKey: MergeLocalFacts = {
      ...local,
      tables: {
        ...local.tables,
        app_settings: [...settings, { key: "units" }],
      },
    };
    const localWithoutExistingKey: MergeLocalFacts = {
      ...local,
      tables: {
        ...local.tables,
        app_settings: settings.filter((row) => row.key !== "appearance"),
      },
    };

    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanMatchesLocal(plan, localWithImportedKey))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanMatchesLocal(plan, localWithoutExistingKey))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("rejects a session insert operation when the live identity already exists", async () => {
    const { local, plan } = await fullSessionPlanFixture();
    const forged: PortableMergePlan = {
      ...plan,
      operations: plan.operations.map((operation) => operation.aggregateClass === "workout_session"
        ? { ...operation, kind: "insert" as const }
        : operation),
    };

    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanMatchesLocal(forged, local))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it.each([
    ["custom exercise", async () => {
      const kernel = await open("full-plan-live-custom");
      const { local, plan } = await fullPlanFixture(kernel);
      return {
        local,
        plan: {
          ...plan,
          operations: plan.operations.map((operation) => operation.aggregateClass === "custom_exercise"
            ? { ...operation, kind: "duplicate" as const }
            : operation),
        } as PortableMergePlan,
      };
    }],
    ["owned plan", async () => {
      const { local, plan } = await fullOwnedPlanFixture();
      return {
        local,
        plan: {
          ...plan,
          operations: plan.operations.map((operation) => operation.aggregateClass === "owned_plan"
            ? { ...operation, kind: "duplicate" as const }
            : operation),
        } as PortableMergePlan,
      };
    }],
  ] as Array<[string, () => Promise<Readonly<{ local: MergeLocalFacts; plan: PortableMergePlan }>>]>)("rejects a forged duplicate %s operation against live local identities", async (_label, fixture) => {
    const { local, plan } = await fixture();

    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanMatchesLocal(plan, local))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it.each([
    ["a session root with an unmatched active exercise pointer", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "workout_session"
        ? {
          ...aggregate,
          tables: {
            ...aggregate.tables,
            workout_sessions: aggregate.tables.workout_sessions!.map((row) => ({
              ...row, active_session_exercise_id: "missing-exercise",
            })),
          },
        }
        : aggregate),
    })],
    ["a duplicate session exercise child id", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "workout_session"
        ? {
          ...aggregate,
          tables: {
            ...aggregate.tables,
            session_exercises: [
              ...(aggregate.tables.session_exercises ?? []),
              aggregate.tables.session_exercises![0]!,
            ],
          },
        }
        : aggregate),
    })],
    ["a session set linked to an absent exercise", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "workout_session"
        ? {
          ...aggregate,
          tables: {
            ...aggregate.tables,
            session_sets: (aggregate.tables.session_sets ?? []).map((row) => ({
              ...row, session_exercise_id: "missing-exercise",
            })),
          },
        }
        : aggregate),
    })],
    ["a child from another session", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "workout_session"
        ? {
          ...aggregate,
          tables: {
            ...aggregate.tables,
            session_exercises: (aggregate.tables.session_exercises ?? []).map((row) => ({
              ...row, session_id: "other-session",
            })),
          },
        }
        : aggregate),
    })],
  ] as Array<[string, (plan: PortableMergePlan) => PortableMergePlan]>)("rejects %s through session aggregate validation", async (_label, mutate) => {
    const { plan } = await fullSessionPlanFixture();

    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanSlice(mutate(plan)))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it.each([
    ["a non-owned plan root", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "owned_plan"
        ? { ...aggregate, tables: { ...aggregate.tables, plans: aggregate.tables.plans!.map((row) => ({ ...row, origin: "bundled" })) } }
        : aggregate),
    })],
    ["an aggregate state owned by another plan", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "owned_plan"
        ? { ...aggregate, tables: { ...aggregate.tables, owned_plan_aggregate_states: (aggregate.tables.owned_plan_aggregate_states ?? []).map((row) => ({ ...row, plan_id: "other-plan" })) } }
        : aggregate),
    })],
    ["a schedule with a duplicate id", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "owned_plan"
        ? { ...aggregate, tables: { ...aggregate.tables, owned_plan_schedules: [...(aggregate.tables.owned_plan_schedules ?? []), aggregate.tables.owned_plan_schedules![0]!] } }
        : aggregate),
    })],
    ["an occurrence source outside the owned graph", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "owned_plan"
        ? { ...aggregate, tables: { ...aggregate.tables, owned_plan_occurrence_sources: (aggregate.tables.owned_plan_occurrence_sources ?? []).map((row) => ({ ...row, plan_day_id: "missing-day" })) } }
        : aggregate),
    })],
  ] as Array<[string, (plan: PortableMergePlan) => PortableMergePlan]>)("rejects %s through owned-plan aggregate validation", async (_label, mutate) => {
    const { plan } = await fullOwnedPlanFixture();

    expect(() => __logicalMergeRepositoryTestOnly.assertFullPlanSlice(mutate(plan)))
      .toThrow(expect.objectContaining({ code: "logical_merge_failed" }));
  });

  it("applies a precomputed custom-exercise aggregate and missing setting atomically", async () => {
    const kernel = await open("full-plan");
    const { local, plan } = await fullPlanFixture(kernel);

    await expect(createFullPlanLogicalMergeWriter(kernel, { sha256 })
      .commitFullPlan({
        localFingerprint: await sha256(canonicalMergeValue(local)),
        plan,
      }))
      .resolves.toEqual({ state: "rebuild_pending" });
    await expect(kernel.queryAll(
      "SELECT key, value_json FROM app_settings ORDER BY key",
    )).resolves.toEqual([
      { key: "appearance", value_json: '"light"' },
      { key: "units", value_json: '"metric"' },
    ]);
    await expect(kernel.queryAll(
      "SELECT id, portable_id FROM exercises WHERE origin = 'custom' ORDER BY id",
    )).resolves.toEqual([
      { id: "archive-exercise", portable_id: "b".repeat(32) },
      { id: "local-exercise", portable_id: "a".repeat(32) },
    ]);
    await expect(kernel.queryAll(
      "SELECT exercise_id, canonical_name FROM exercise_library_entries WHERE exercise_id = 'archive-exercise'",
    )).resolves.toEqual([{ exercise_id: "archive-exercise", canonical_name: "Archive" }]);
    await expect(kernel.queryAll(
      "SELECT kind, slug FROM taxonomy_terms WHERE (kind = 'exercise_type' AND slug = 'strength') OR (kind = 'movement_class' AND slug = 'compound') ORDER BY kind",
    )).resolves.toEqual([
      { kind: "exercise_type", slug: "strength" },
      { kind: "movement_class", slug: "compound" },
    ]);
    await expect(kernel.queryAll(
      "SELECT exercise_id, ordinal FROM exercise_aliases WHERE exercise_id = 'archive-exercise'",
    )).resolves.toEqual([{ exercise_id: "archive-exercise", ordinal: 0 }]);
    await expect(kernel.queryAll(
      "SELECT exercise_id, ordinal FROM exercise_search_terms WHERE exercise_id = 'archive-exercise'",
    )).resolves.toEqual([{ exercise_id: "archive-exercise", ordinal: 0 }]);
    await expect(kernel.queryAll(
      "SELECT exercise_id, kind, relation FROM exercise_taxonomy WHERE exercise_id = 'archive-exercise' ORDER BY kind",
    )).resolves.toEqual([
      { exercise_id: "archive-exercise", kind: "exercise_type", relation: "type" },
      { exercise_id: "archive-exercise", kind: "movement_class", relation: "movement" },
    ]);
    await expect(kernel.queryAll(
      "SELECT exercise_id, favorite FROM exercise_owner_preferences WHERE exercise_id = 'archive-exercise'",
    )).resolves.toEqual([{ exercise_id: "archive-exercise", favorite: 1 }]);
    await expect(kernel.queryAll(
      "SELECT exercise_id, status FROM exercise_metric_baselines WHERE exercise_id = 'archive-exercise'",
    )).resolves.toEqual([{
      exercise_id: "archive-exercise",
      status: "awaiting_comparable_observation",
    }]);
  });

  it("applies a precomputed archive-wins session aggregate under its local physical ID", async () => {
    const { local, localKernel, plan } = await fullSessionPlanFixture();

    await expect(createFullPlanLogicalMergeWriter(localKernel, { sha256 })
      .commitFullPlan({
        localFingerprint: await sha256(canonicalMergeValue(local)),
        plan,
      }).catch((error: unknown) => {
        throw (error as Readonly<{ cause?: unknown }>).cause ?? error;
      }))
      .resolves.toEqual({ state: "rebuild_pending" });
    await expect(localKernel.queryAll(
      "SELECT id, portable_id, merge_modified_at_ms FROM workout_sessions",
    )).resolves.toEqual([{
      id: "local-session",
      portable_id: "c".repeat(32),
      merge_modified_at_ms: 20,
    }]);
    await expect(localKernel.queryAll(
      "SELECT id, session_id FROM session_exercises",
    )).resolves.toEqual([{
      id: "exercise-archive-session",
      session_id: "local-session",
    }]);
  });

  it("applies a precomputed owned-plan root, day, and aggregate state atomically", async () => {
    const { local, localKernel, plan } = await fullOwnedPlanFixture();

    await expect(createFullPlanLogicalMergeWriter(localKernel, { sha256 })
      .commitFullPlan({
        localFingerprint: await sha256(canonicalMergeValue(local)),
        plan,
      }))
      .resolves.toEqual({ state: "rebuild_pending" });
    await expect(localKernel.queryAll(
      "SELECT id, portable_id FROM plans WHERE origin = 'custom'",
    )).resolves.toEqual([{ id: "archive-plan", portable_id: "d".repeat(32) }]);
    await expect(localKernel.queryAll(
      "SELECT id, plan_id FROM plan_days WHERE plan_id = 'archive-plan'",
    )).resolves.toEqual([{ id: "archive-day", plan_id: "archive-plan" }]);
    await expect(localKernel.queryAll(
      "SELECT plan_id, graph_status FROM owned_plan_aggregate_states WHERE plan_id = 'archive-plan'",
    )).resolves.toEqual([{ plan_id: "archive-plan", graph_status: "missing_valid_target" }]);
    await expect(localKernel.queryAll(
      "SELECT plan_day_id FROM plan_day_exercises WHERE id = 'legacy-occurrence'",
    )).resolves.toEqual([{ plan_day_id: "archive-day" }]);
    await expect(localKernel.queryAll(
      "SELECT plan_day_exercise_id FROM plan_working_set_targets WHERE id = 'legacy-target'",
    )).resolves.toEqual([{ plan_day_exercise_id: "legacy-occurrence" }]);
    await expect(localKernel.queryAll(
      "SELECT plan_day_id FROM owned_plan_day_exercises WHERE id = 'owned-occurrence'",
    )).resolves.toEqual([{ plan_day_id: "archive-day" }]);
    await expect(localKernel.queryAll(
      "SELECT plan_day_exercise_id FROM owned_plan_working_set_targets WHERE id = 'owned-target'",
    )).resolves.toEqual([{ plan_day_exercise_id: "owned-occurrence" }]);
    await expect(localKernel.queryAll(
      "SELECT plan_id FROM owned_plan_schedules WHERE id = 'owned-schedule'",
    )).resolves.toEqual([{ plan_id: "archive-plan" }]);
    await expect(localKernel.queryAll(
      "SELECT plan_day_id FROM owned_plan_schedule_bindings WHERE id = 'owned-binding'",
    )).resolves.toEqual([{ plan_day_id: "archive-day" }]);
  });

  it("rolls back every admitted owned-plan insertion stage", async () => {
    const stages: readonly LogicalMergeFaultStage[] = [
      "fingerprint_checked",
      "full_plan_insert:plans",
      "full_plan_insert:plan_days",
      "full_plan_insert:plan_schedules",
      "full_plan_insert:plan_schedule_bindings",
      "full_plan_insert:plan_day_exercises",
      "full_plan_insert:plan_warmup_sets",
      "full_plan_insert:plan_working_set_targets",
      "full_plan_insert:progression_policies",
      "full_plan_insert:progression_recommendations",
      "full_plan_insert:owned_plan_aggregate_states",
      "full_plan_insert:owned_plan_starter_sources",
      "full_plan_insert:owned_plan_day_sources",
      "full_plan_insert:owned_plan_day_exercises",
      "full_plan_insert:owned_plan_warmup_sets",
      "full_plan_insert:owned_plan_working_set_targets",
      "full_plan_insert:owned_plan_progression_policies",
      "full_plan_insert:owned_plan_occurrence_sources",
      "full_plan_insert:owned_plan_schedules",
      "full_plan_insert:owned_plan_schedule_versions",
      "full_plan_insert:owned_plan_schedule_bindings",
      "full_plan_insert:owned_plan_schedule_overrides",
      "full_plan_insert:owned_plan_schedule_opportunities",
      "full_plan_insert:owned_plan_schedule_events",
      "full_plan_insert:owned_plan_mutation_requests",
      "full_plan_insert:starter_plan_activation_requests",
      "full_plan_insert:owned_progression_recommendations",
      "verified",
      "state_updated",
    ];

    for (const stage of stages) {
      const { local, localKernel, plan } = await fullOwnedPlanFixture();
      const before = await canonicalState(localKernel);

      await expect(createFullPlanLogicalMergeWriter(localKernel, {
        sha256,
        faultAfter: async (actual) => {
          if (actual === stage) throw new Error("fault");
        },
      }).commitFullPlan({
        localFingerprint: await sha256(canonicalMergeValue(local)),
        plan,
      })).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
      await expect(canonicalState(localKernel)).resolves.toEqual(before);
    }
  }, 90_000);

  it("rolls back every admitted full-plan session write fault", async () => {
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
      const { local, localKernel, plan } = await fullSessionPlanFixture();
      const before = await canonicalState(localKernel);

      await expect(createFullPlanLogicalMergeWriter(localKernel, {
        sha256,
        faultAfter: async (actual) => {
          if (actual === stage) throw new Error("fault");
        },
      }).commitFullPlan({
        localFingerprint: await sha256(canonicalMergeValue(local)),
        plan,
      })).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
      await expect(canonicalState(localKernel)).resolves.toEqual(before);
    }
  }, 90_000);

  it("rolls back the admitted full-plan slice after every injected write fault", async () => {
    const stages: readonly LogicalMergeFaultStage[] = [
      "fingerprint_checked",
      "full_plan_insert:app_settings",
      "full_plan_insert:taxonomy_terms",
      "full_plan_insert:exercises",
      "full_plan_insert:exercise_library_entries",
      "full_plan_insert:exercise_aliases",
      "full_plan_insert:exercise_search_terms",
      "full_plan_insert:exercise_taxonomy",
      "full_plan_insert:exercise_owner_preferences",
      "full_plan_insert:exercise_metric_baselines",
      "full_plan_insert:metric_profile_migration_events",
      "verified",
      "state_updated",
    ];

    for (const stage of stages) {
      const kernel = await open(`full-plan-fault-${stage}`);
      const { local, plan } = await fullPlanFixture(kernel);
      const before = await canonicalState(kernel);

      await expect(createFullPlanLogicalMergeWriter(kernel, {
        sha256,
        faultAfter: async (actual) => {
          if (actual === stage) throw new Error("fault");
        },
      }).commitFullPlan({
        localFingerprint: await sha256(canonicalMergeValue(local)),
        plan,
      })).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
      await expect(canonicalState(kernel)).resolves.toEqual(before);
    }
  }, 90_000);

  it("rejects a stale full-plan fingerprint before changing source facts", async () => {
    const kernel = await open("full-plan-stale");
    const { local, plan } = await fullPlanFixture(kernel);
    await kernel.write((transaction) => transaction.execute(
      "UPDATE app_settings SET revision = revision + 1 WHERE key = 'appearance'",
    ));
    const before = await canonicalState(kernel);

    await expect(createFullPlanLogicalMergeWriter(kernel, { sha256 })
      .commitFullPlan({
        localFingerprint: await sha256(canonicalMergeValue(local)),
        plan,
      }))
      .rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(canonicalState(kernel)).resolves.toEqual(before);
  });

  it("rejects unsupported aggregate classes before the full-plan writer opens", async () => {
    const kernel = await open("full-plan-unsupported");
    const { local, plan } = await fullPlanFixture(kernel);
    const unsupportedPlan = {
      ...plan,
      operations: [
        ...plan.operations,
        {
          aggregateClass: "workout_session" as const,
          kind: "insert" as const,
          portableId: "c".repeat(32),
          archiveId: "archive-session",
          localId: "archive-session",
        },
      ],
    };
    const before = await canonicalState(kernel);

    await expect(createFullPlanLogicalMergeWriter(kernel, { sha256 })
      .commitFullPlan({
        localFingerprint: await sha256(canonicalMergeValue(local)),
        plan: unsupportedPlan,
      }))
      .rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(canonicalState(kernel)).resolves.toEqual(before);
  });

  it("rejects a local-wins setting whose key is absent from the current database", async () => {
    const kernel = await open("full-plan-setting-mismatch");
    const { local, plan } = await fullPlanFixture(kernel);
    const mismatchedPlan = {
      ...plan,
      operations: [{
        aggregateClass: "app_setting" as const,
        kind: "local_won" as const,
        key: "absent",
      }],
      idMappings: [],
      idRemaps: [],
      settings: [],
      aggregates: [],
    };
    const before = await canonicalState(kernel);

    await expect(createFullPlanLogicalMergeWriter(kernel, { sha256 })
      .commitFullPlan({
        localFingerprint: await sha256(canonicalMergeValue(local)),
        plan: mismatchedPlan,
      }))
      .rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(canonicalState(kernel)).resolves.toEqual(before);
  });

  it("rejects a custom-exercise aggregate that writes a child into another exercise", async () => {
    const kernel = await open("full-plan-cross-aggregate");
    const { local, plan } = await fullPlanFixture(kernel);
    const aggregate = plan.aggregates[0]!;
    const aliases = aggregate.tables.exercise_aliases ?? [];
    const mismatchedPlan = {
      ...plan,
      aggregates: [{
        ...aggregate,
        tables: {
          ...aggregate.tables,
          exercise_aliases: aliases.map((alias) => ({
            ...alias,
            exercise_id: "local-exercise",
          })),
        },
      }],
    };
    const before = await canonicalState(kernel);

    await expect(createFullPlanLogicalMergeWriter(kernel, { sha256 })
      .commitFullPlan({
        localFingerprint: await sha256(canonicalMergeValue(local)),
        plan: mismatchedPlan,
      }))
      .rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(canonicalState(kernel)).resolves.toEqual(before);
  });

  it("rejects an owned-plan aggregate that contains a day from another root", async () => {
    const { local, localKernel, plan } = await fullOwnedPlanFixture();
    const aggregate = plan.aggregates.find((value) =>
      value.aggregateClass === "owned_plan",
    )!;
    const mismatchedPlan = {
      ...plan,
      aggregates: [{
        ...aggregate,
        tables: {
          ...aggregate.tables,
          plan_days: [
            ...(aggregate.tables.plan_days ?? []),
            { id: "other-day", plan_id: "other-plan", ordinal: 0, name: "Other", revision: 1 },
          ],
        },
      }],
    };
    const before = await canonicalState(localKernel);

    await expect(createFullPlanLogicalMergeWriter(localKernel, { sha256 })
      .commitFullPlan({
        localFingerprint: await sha256(canonicalMergeValue(local)),
        plan: mismatchedPlan,
      }))
      .rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(canonicalState(localKernel)).resolves.toEqual(before);
  });

  it("rejects an owned-plan legacy occurrence that targets a retained plan day", async () => {
    const { local, localKernel, plan } = await fullOwnedPlanFixture();
    await seedOwnedPlan(localKernel, {
      id: "retained-plan",
      portableId: "e".repeat(32),
      dayId: "retained-day",
    });
    const aggregate = plan.aggregates.find((value) =>
      value.aggregateClass === "owned_plan",
    )!;
    const mismatchedPlan = {
      ...plan,
      aggregates: [{
        ...aggregate,
        tables: {
          ...aggregate.tables,
          plan_day_exercises: [
            ...(aggregate.tables.plan_day_exercises ?? []),
            {
              id: "retained-occurrence",
              plan_day_id: "retained-day",
              exercise_id: "bundled",
              ordinal: 1,
              metric_profile: "load_reps",
              metric_contract_version: 1,
              exercise_metric_generation: 1,
            },
          ],
        },
      }],
    };
    const before = await canonicalState(localKernel);

    await expect(createFullPlanLogicalMergeWriter(localKernel, { sha256 })
      .commitFullPlan({
        localFingerprint: await sha256(canonicalMergeValue(local)),
        plan: mismatchedPlan,
      }))
      .rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(canonicalState(localKernel)).resolves.toEqual(before);
  });

  it("accepts separate custom-exercise and owned-plan identity namespaces", async () => {
    const kernel = await open("full-plan-cross-class-identities");
    const { local, plan } = await fullPlanFixture(kernel);
    const customAggregate = plan.aggregates.find((value) =>
      value.aggregateClass === "custom_exercise",
    )!;
    const customOperation = plan.operations.find((value) =>
      value.aggregateClass === "custom_exercise",
    )!;
    const ownedPlanAggregate = {
      aggregateClass: "owned_plan" as const,
      portableId: customAggregate.portableId,
      tables: {
        plans: [{
          id: "archive-exercise",
          origin: "custom",
          portable_id: customAggregate.portableId,
          name: "Independent plan",
          days_per_week: 1,
          audience: "Owner",
          goal: "Strength",
          estimate_minutes: 30,
          attribution: "Owner",
          is_active: 0,
          revision: 1,
          content_pack_id: null,
          source_namespace: null,
          upstream_id: null,
        }],
      },
    };
    const crossClassPlan = {
      ...plan,
      operations: [
        ...plan.operations,
        {
          aggregateClass: "owned_plan" as const,
          kind: "insert" as const,
          portableId: customAggregate.portableId,
          archiveId: customOperation.archiveId,
          localId: customOperation.localId,
        },
      ],
      idMappings: [
        ...plan.idMappings,
        {
          recordClass: "owned_plan" as const,
          archiveId: customOperation.archiveId,
          localId: customOperation.localId,
        },
      ],
      aggregates: [...plan.aggregates, ownedPlanAggregate],
    };

    await expect(createFullPlanLogicalMergeWriter(kernel, { sha256 })
      .commitFullPlan({
        localFingerprint: await sha256(canonicalMergeValue(local)),
        plan: crossClassPlan,
      }))
      .resolves.toEqual({ state: "rebuild_pending" });
    await expect(kernel.queryAll(
      "SELECT id FROM exercises WHERE id = 'archive-exercise' UNION ALL SELECT id FROM plans WHERE id = 'archive-exercise' ORDER BY id",
    )).resolves.toEqual([{ id: "archive-exercise" }, { id: "archive-exercise" }]);
  });

  it("rejects non-custom mapping metadata before the full-plan writer opens", async () => {
    const kernel = await open("full-plan-mapping-mismatch");
    const { local, plan } = await fullPlanFixture(kernel);
    const mismatchedPlan = {
      ...plan,
      idMappings: [...plan.idMappings, {
        recordClass: "owned_plan" as const,
        archiveId: "archive-plan",
        localId: "archive-plan",
      }],
    };
    const before = await canonicalState(kernel);

    await expect(createFullPlanLogicalMergeWriter(kernel, { sha256 })
      .commitFullPlan({
        localFingerprint: await sha256(canonicalMergeValue(local)),
        plan: mismatchedPlan,
      }))
      .rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(canonicalState(kernel)).resolves.toEqual(before);
  });

  const fullPlanInvariantCases: Array<[string, (plan: PortableMergePlan) => PortableMergePlan]> = [
    ["duplicate setting insert operation", (plan: PortableMergePlan) => ({
      ...plan,
      operations: [...plan.operations, plan.operations.find((operation) =>
        operation.aggregateClass === "app_setting" && operation.kind === "insert")!],
    })],
    ["setting row without its insert operation", (plan: PortableMergePlan) => ({
      ...plan,
      operations: plan.operations.filter((operation) =>
        operation.aggregateClass !== "app_setting" || operation.kind !== "insert"),
    })],
    ["duplicate aggregate key", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: [...plan.aggregates, plan.aggregates[0]!],
    })],
    ["aggregate attached to a duplicate operation", (plan: PortableMergePlan) => {
      const operation = plan.operations.find((value) => value.aggregateClass === "custom_exercise")!;
      return {
        ...plan,
        operations: plan.operations.map((value) => value === operation
          ? { ...value, kind: "duplicate" as const }
          : value),
      };
    }],
    ["missing required identity mapping", (plan: PortableMergePlan) => ({
      ...plan,
      idMappings: plan.idMappings.slice(1),
    })],
    ["duplicate identity mapping", (plan: PortableMergePlan) => ({
      ...plan,
      idMappings: [...plan.idMappings, plan.idMappings[0]!],
    })],
  ];
  it.each(fullPlanInvariantCases)("rejects a full plan with %s before source mutation", async (_label, mutate) => {
    const kernel = await open(`full-plan-invariant-${_label}`);
    const { local, plan } = await fullPlanFixture(kernel);

    await expectRejectedFullPlan(kernel, local, mutate(plan));
  });

  const customAggregateCases: Array<[string, (plan: PortableMergePlan) => PortableMergePlan]> = [
    ["missing custom library entry", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "custom_exercise"
        ? { ...aggregate, tables: { ...aggregate.tables, exercise_library_entries: [] } }
        : aggregate),
    })],
    ["unsupported custom table", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "custom_exercise"
        ? { ...aggregate, tables: { ...aggregate.tables, app_settings: [] } }
        : aggregate),
    })],
    ["taxonomy term outside exercise taxonomy", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "custom_exercise"
        ? {
          ...aggregate,
          tables: {
            ...aggregate.tables,
            taxonomy_terms: [{ kind: "equipment", slug: "barbell", display_name: "Barbell" }],
          },
        }
        : aggregate),
    })],
  ];
  it.each(customAggregateCases)("rejects custom aggregate %s before source mutation", async (_label, mutate) => {
    const kernel = await open(`full-plan-custom-${_label}`);
    const { local, plan } = await fullPlanFixture(kernel);

    await expectRejectedFullPlan(kernel, local, mutate(plan));
  });

  const ownedPlanAggregateCases: Array<[string, (plan: PortableMergePlan) => PortableMergePlan]> = [
    ["duplicate day id", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "owned_plan"
        ? {
          ...aggregate,
          tables: {
            ...aggregate.tables,
            plan_days: [...(aggregate.tables.plan_days ?? []), aggregate.tables.plan_days![0]!],
          },
        }
        : aggregate),
    })],
    ["binding with unknown schedule version", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "owned_plan"
        ? {
          ...aggregate,
          tables: {
            ...aggregate.tables,
            owned_plan_schedule_bindings: (aggregate.tables.owned_plan_schedule_bindings ?? []).map((row) => ({
              ...row,
              schedule_version_id: "missing-version",
            })),
          },
        }
        : aggregate),
    })],
    ["owned target with unknown occurrence", (plan: PortableMergePlan) => ({
      ...plan,
      aggregates: plan.aggregates.map((aggregate) => aggregate.aggregateClass === "owned_plan"
        ? {
          ...aggregate,
          tables: {
            ...aggregate.tables,
            owned_plan_working_set_targets: (aggregate.tables.owned_plan_working_set_targets ?? []).map((row) => ({
              ...row,
              plan_day_exercise_id: "missing-occurrence",
            })),
          },
        }
        : aggregate),
    })],
  ];
  it.each(ownedPlanAggregateCases)("rejects owned-plan aggregate %s before source mutation", async (_label, mutate) => {
    const { local, localKernel, plan } = await fullOwnedPlanFixture();

    await expectRejectedFullPlan(localKernel, local, mutate(plan));
  });

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

  it("returns ready for fresh legacy duplicate and local-won tracer operations", async () => {
    const archiveKernel = await open("legacy-noop-archive");
    await seedSession(archiveKernel, { id: "archive-session", portableId: "a".repeat(32), modifiedAtMs: 20 });
    const archive = await snapshot(archiveKernel);
    const localKernel = await open("legacy-noop-local");
    await seedSession(localKernel, { id: "local-session", portableId: "a".repeat(32), modifiedAtMs: 20 });
    const base = await preflight(localKernel, archive);

    await expect(createLogicalMergeRepository(localKernel, { sha256 }).commit({
      ...base, operation: { kind: "duplicate", portableId: "a".repeat(32) },
    })).resolves.toEqual({ state: "ready" });
    await expect(createLogicalMergeRepository(localKernel, { sha256 }).commit({
      ...base, operation: { kind: "local_won", portableId: "a".repeat(32) },
    })).resolves.toEqual({ state: "ready" });
  });

  it("accepts a planner-produced local-won-only full plan without changing canonical SQLite state", async () => {
    const archiveKernel = await open("full-plan-duplicate-archive");
    await seedSession(archiveKernel, {
      id: "archive-session", portableId: "a".repeat(32), modifiedAtMs: 20,
    });
    const archive = await snapshot(archiveKernel);
    const localKernel = await open("full-plan-duplicate-local");
    await seedSession(localKernel, {
      id: "local-session", portableId: "a".repeat(32), modifiedAtMs: 20,
    });
    const local = await createSqliteMergeLocalFactsPort(localKernel).read();
    const plan = await buildPortableMergePlan({
      archive: {
        ...archive,
        version: 2,
        tables: {
          ...archive.tables,
          portable_owner_identity: [{ id: 1, owner_namespace: local.ownerNamespace }],
        },
      },
      local: {
        version: 2,
        ...local,
        tables: {
          ...local.tables,
          portable_owner_identity: [{ id: 1, owner_namespace: local.ownerNamespace }],
        },
      },
      payloadDigest: sha256,
    });
    expect(plan).toEqual(expect.objectContaining({
      settings: [],
      aggregates: [],
      preview: expect.objectContaining({ localWon: 1 }),
    }));
    const before = await canonicalState(localKernel);

    await expect(createFullPlanLogicalMergeWriter(localKernel, { sha256 }).commitFullPlan({
      localFingerprint: await sha256(canonicalMergeValue(local)),
      plan,
    })).resolves.toEqual({ state: "ready" });

    await expect(canonicalState(localKernel)).resolves.toEqual(before);
  });

  it.each([
    ["archive_wins without a matching local session", async () => {
      const archiveKernel = await open("legacy-missing-local-archive");
      await seedSession(archiveKernel, { id: "archive-session", portableId: "a".repeat(32), modifiedAtMs: 20 });
      const localKernel = await open("legacy-missing-local");
      return { localKernel, preflight: await preflight(localKernel, await snapshot(archiveKernel)) };
    }, "archive_won" as const],
    ["insert with an existing local session", async () => {
      const archiveKernel = await open("legacy-existing-local-archive");
      await seedSession(archiveKernel, { id: "archive-session", portableId: "a".repeat(32), modifiedAtMs: 20 });
      const localKernel = await open("legacy-existing-local");
      await seedSession(localKernel, { id: "local-session", portableId: "a".repeat(32), modifiedAtMs: 10 });
      return { localKernel, preflight: await preflight(localKernel, await snapshot(archiveKernel)) };
    }, "insert" as const],
  ] as Array<[string, () => Promise<Readonly<{ localKernel: SqliteKernel; preflight: StoredMergePreflight }>>, "archive_won" | "insert"]>)("rejects legacy %s", async (_label, fixture, kind) => {
    const { localKernel, preflight: preflightValue } = await fixture();
    const before = await canonicalState(localKernel);
    await expect(createLogicalMergeRepository(localKernel, { sha256 }).commit({
      ...preflightValue, operation: { kind, portableId: "a".repeat(32) },
    })).rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
    await expect(canonicalState(localKernel)).resolves.toEqual(before);
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

  it("rebuilds deterministic derivatives after an archive-wins merge", async () => {
    const archiveKernel = await open("reconcile-archive");
    await seedSession(archiveKernel, {
      id: "archive-session",
      portableId: "a".repeat(32),
      modifiedAtMs: 20,
    });
    const archive = await snapshot(archiveKernel);
    const localKernel = await open("reconcile-local");
    await seedSession(localKernel, {
      id: "local-session",
      portableId: "a".repeat(32),
      modifiedAtMs: 10,
    });

    await createLogicalMergeRepository(localKernel, { sha256 })
      .commit(await preflight(localKernel, archive));
    await expect(reconciliation(localKernel).reconcileAndRebuild())
      .resolves.toMatchObject({ outcome: "rebuilt", state: "ready" });
    const first = {
      history: await createHistoryProjectionRepository(localKernel).dumpProjectionRows(),
      search: await createExerciseSearchIndexRepository(localKernel).verifyParity(),
      state: await localKernel.queryAll("SELECT state FROM portability_restore_state"),
    };
    await expect(reconciliation(localKernel).reconcileAndRebuild())
      .resolves.toMatchObject({ outcome: "already_ready", state: "ready" });
    expect({
      history: await createHistoryProjectionRepository(localKernel).dumpProjectionRows(),
      search: await createExerciseSearchIndexRepository(localKernel).verifyParity(),
      state: await localKernel.queryAll("SELECT state FROM portability_restore_state"),
    }).toEqual(first);
  });

  it("allows replayable pending effects to be superseded after an archive-wins merge", async () => {
    const archiveKernel = await open("effects-archive");
    await seedSession(archiveKernel, {
      id: "archive-session",
      portableId: "a".repeat(32),
      modifiedAtMs: 20,
    });
    const archive = await snapshot(archiveKernel);
    const localKernel = await open("effects-local");
    await seedSession(localKernel, {
      id: "local-session",
      portableId: "a".repeat(32),
      modifiedAtMs: 10,
    });
    await localKernel.write((transaction) => transaction.execute(
      `INSERT INTO pending_effects
        (id, effect_type, payload_version, payload_json, idempotency_key,
         subject_id, expected_revision, status, attempt_count, next_attempt_at_ms,
         claimed_at_ms, lease_expires_at_ms, last_error_code, created_at_ms, updated_at_ms)
       VALUES ('merge-pending-effect', 'reconcile_rest_notification', 1,
               '{"version":1,"sessionId":"local-session","sessionRevision":1}',
               'merge:pending', 'local-session', 1, 'pending', 0, 1, NULL, NULL, NULL, 1, 1)`,
    ));

    await expect(createLogicalMergeRepository(localKernel, { sha256 })
      .commit(await preflight(localKernel, archive)))
      .resolves.toEqual({ state: "rebuild_pending" });
    await expect(reconciliation(localKernel).reconcileAndRebuild())
      .resolves.toMatchObject({ outcome: "rebuilt", state: "ready" });
    await expect(localKernel.queryAll(
      "SELECT status, last_error_code FROM pending_effects WHERE id = 'merge-pending-effect'",
    )).resolves.toEqual([{
      status: "superseded",
      last_error_code: "restore_source_replaced",
    }]);
  });
});

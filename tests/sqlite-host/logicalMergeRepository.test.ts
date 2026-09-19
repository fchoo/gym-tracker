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
  buildPortableMergePlan,
  type PortableMergePlan,
} from "../../src/domains/portability/mergePlan";
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
  await expect(createLogicalMergeRepository(kernel, { sha256 })
    .commitFullPlan({
      localFingerprint: await sha256(canonicalMergeValue(local)),
      plan,
    }))
    .rejects.toEqual(expect.objectContaining({ code: "logical_merge_failed" }));
  await expect(canonicalState(kernel)).resolves.toEqual(before);
}

describe("logical merge repository", () => {
  it("applies a precomputed custom-exercise aggregate and missing setting atomically", async () => {
    const kernel = await open("full-plan");
    const { local, plan } = await fullPlanFixture(kernel);

    await expect(createLogicalMergeRepository(kernel, { sha256 })
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

    await expect(createLogicalMergeRepository(localKernel, { sha256 })
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

    await expect(createLogicalMergeRepository(localKernel, { sha256 })
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

      await expect(createLogicalMergeRepository(localKernel, {
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

      await expect(createLogicalMergeRepository(localKernel, {
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

      await expect(createLogicalMergeRepository(kernel, {
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

    await expect(createLogicalMergeRepository(kernel, { sha256 })
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

    await expect(createLogicalMergeRepository(kernel, { sha256 })
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

    await expect(createLogicalMergeRepository(kernel, { sha256 })
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

    await expect(createLogicalMergeRepository(kernel, { sha256 })
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

    await expect(createLogicalMergeRepository(localKernel, { sha256 })
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

    await expect(createLogicalMergeRepository(localKernel, { sha256 })
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

    await expect(createLogicalMergeRepository(kernel, { sha256 })
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

    await expect(createLogicalMergeRepository(kernel, { sha256 })
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

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
  LOGICAL_BACKUP_TABLES,
  type LogicalBackupSnapshot,
} from "../../src/domains/portability/backupContracts";
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
  createLogicalBackupRepository,
  LOGICAL_BACKUP_TABLE_FILTERS,
} from "../../src/platform/sqlite/repositories/logicalBackupRepository";
import {
  LOGICAL_BACKUP_REFERENCE_DEFINITIONS,
} from "../../src/domains/portability/restoreCommands";
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
const hash = "a".repeat(64);
const targetJson = "{\"version\":1,\"profile\":\"load_reps\",\"loadGrams\":40000,\"minReps\":8,\"maxReps\":10,\"incrementGrams\":2500,\"perSide\":false}";

afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  for (const directory of directories) {
    rmSync(directory, { force: true, recursive: true });
  }
  directories.clear();
});

async function open(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-logical-backup-"));
  directories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  const recoveryBackup: RecoveryBackupPort = {
    createAndValidate: async (request) => ({
      backupId: "logical-backup",
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
    await transaction.execute("INSERT INTO content_packs (id, namespace, version, source_revision, installed_at_ms) VALUES ('catalog', 'gym-tracker.catalog', 1, 7, 1)");
    await transaction.execute("INSERT INTO content_pack_revisions (id, namespace, revision, source_commit, pack_sha256, manifest_sha256, license_sha256, review_status, accepted_at_ms) VALUES ('catalog-revision', 'gym-tracker.catalog', 7, 'commit', ?, ?, ?, 'accepted', 1)", [hash, hash, hash]);
    await transaction.execute("INSERT INTO exercises (id, content_pack_id, origin, source_namespace, upstream_id, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision) VALUES ('bundled-exercise', 'catalog', 'bundled', 'gym-tracker.catalog', 'barbell-row', 'Barbell row', 'load_reps', 1, 1, 'Barbell', 90, 1), ('bundled-plan-only', 'catalog', 'bundled', 'gym-tracker.catalog', 'plan-only-row', 'Plan-only row', 'load_reps', 1, 1, 'Barbell', 90, 1), ('copied-exercise', NULL, 'copied', 'copy-source', 'copied-row', 'Copied row', 'load_reps', 1, 1, 'Cable', 90, 1), ('custom-exercise', NULL, 'custom', NULL, NULL, 'Custom row', 'load_reps', 1, 1, 'Cable', 90, 1)");
    await transaction.execute("INSERT INTO exercise_library_entries (exercise_id, origin, canonical_name, exercise_type, movement_class, metric_profile, metric_contract_version, exercise_metric_generation, availability, revision) VALUES ('bundled-exercise', 'bundled', 'Barbell row', 'strength', 'compound', 'load_reps', 1, 1, 'available', 1), ('bundled-plan-only', 'bundled', 'Plan-only row', 'strength', 'compound', 'load_reps', 1, 1, 'available', 1), ('copied-exercise', 'copied', 'Copied row', 'strength', 'compound', 'load_reps', 1, 1, 'available', 1), ('custom-exercise', 'custom', 'Custom row', 'strength', 'compound', 'load_reps', 1, 1, 'available', 1)");
    await transaction.execute("INSERT INTO exercise_catalog_sources (exercise_id, content_revision_id, source_namespace, source_revision, upstream_id, canonical_name, exercise_type, movement_class, metric_profile, metric_contract_version, exercise_metric_generation, availability, license, attribution, legacy_link_status, linked_upstream_id, revision) VALUES ('bundled-exercise', 'catalog-revision', 'gym-tracker.catalog', '7', 'barbell-row', 'Barbell row', 'strength', 'compound', 'load_reps', 1, 1, 'available', 'CC0', 'Gym Tracker', 'not_applicable', NULL, 1), ('bundled-plan-only', 'catalog-revision', 'gym-tracker.catalog', '7', 'plan-only-row', 'Plan-only row', 'strength', 'compound', 'load_reps', 1, 1, 'available', 'CC0', 'Gym Tracker', 'not_applicable', NULL, 1)");
    await transaction.execute("INSERT INTO exercise_owner_preferences (exercise_id, favorite, hidden, archived, revision, updated_at_ms) VALUES ('bundled-exercise', 1, 0, 0, 1, 10), ('custom-exercise', 0, 0, 0, 1, 10)");
    await transaction.execute("INSERT INTO exercise_aliases (exercise_id, ordinal, display_text, normalized_text) VALUES ('custom-exercise', 0, 'Cable pull', 'cable pull')");
    await transaction.execute("INSERT INTO exercise_search_terms (exercise_id, kind, ordinal, display_text, normalized_text) VALUES ('custom-exercise', 'canonical', 0, 'Custom row', 'custom row')");
    await transaction.execute("INSERT INTO taxonomy_terms (kind, slug, display_name) VALUES ('exercise_type', 'strength', 'Strength'), ('movement_class', 'compound', 'Compound'), ('equipment', 'cable', 'Cable')");
    await transaction.execute("INSERT INTO exercise_taxonomy (exercise_id, kind, slug, relation, ordinal) VALUES ('custom-exercise', 'exercise_type', 'strength', 'type', 0), ('custom-exercise', 'movement_class', 'compound', 'movement', 0), ('custom-exercise', 'equipment', 'cable', 'equipment', 0)");
    await transaction.execute("INSERT INTO metric_profile_migration_events (idempotency_key, exercise_id, from_metric_profile, from_metric_contract_version, from_exercise_metric_generation, to_metric_profile, to_metric_contract_version, to_exercise_metric_generation, migrated_target_count, invalidated_recommendation_count, invalidated_policy_count, invalidated_effect_count, exercise_revision, request_json, result_json, acknowledged_history_immutable, migrated_at_ms) VALUES ('metric-migration', 'custom-exercise', 'load_reps', 1, 1, 'load_reps', 1, 2, 0, 0, 0, 0, 1, '{}', '{}', 1, 10)");
    await transaction.execute("INSERT INTO exercise_metric_baselines (exercise_id, metric_profile, metric_contract_version, exercise_metric_generation, status, established_at_ms) VALUES ('custom-exercise', 'load_reps', 1, 1, 'awaiting_comparable_observation', 10)");
    await transaction.execute("INSERT INTO plans (id, content_pack_id, origin, source_namespace, upstream_id, name, days_per_week, audience, goal, estimate_minutes, attribution, is_active, revision) VALUES ('copied-plan', NULL, 'copied', 'gym-tracker.starters', 'starter-template', 'Copied plan', 1, 'Owner', 'Strength', 45, 'Owner', 1, 1), ('custom-plan', NULL, 'custom', NULL, NULL, 'Custom plan', 1, 'Owner', 'Strength', 45, 'Owner', 0, 1)");
    await transaction.execute("INSERT INTO plan_days (id, plan_id, ordinal, name, revision) VALUES ('copied-day', 'copied-plan', 0, 'Copied day', 1), ('custom-day', 'custom-plan', 0, 'Custom day', 1)");
    await transaction.execute("INSERT INTO plan_schedules (id, plan_id, mode, start_local_date, timezone, cycle_length_weeks, revision) VALUES ('legacy-schedule', 'custom-plan', 'weekday', '2026-08-24', 'Asia/Singapore', 1, 1)");
    await transaction.execute("INSERT INTO plan_schedule_bindings (id, schedule_id, week_index, weekday, plan_day_id, revision) VALUES ('legacy-binding', 'legacy-schedule', 0, 1, 'custom-day', 1)");
    await transaction.execute("INSERT INTO plan_day_exercises (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds, metric_profile, metric_contract_version, exercise_metric_generation, revision) VALUES ('legacy-occurrence', 'custom-day', 'custom-exercise', 0, 90, 'load_reps', 1, 1, 1)");
    await transaction.execute("INSERT INTO plan_warmup_sets (id, plan_day_exercise_id, ordinal, load_grams, reps, revision) VALUES ('legacy-warmup', 'legacy-occurrence', 0, 20000, 10, 1)");
    await transaction.execute("INSERT INTO plan_working_set_targets (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps, target_json, unit_json, metric_profile, metric_contract_version, exercise_metric_generation, revision) VALUES ('legacy-target', 'legacy-occurrence', 0, 40000, 8, 10, ?, '{}', 'load_reps', 1, 1, 1)", [targetJson]);
    await transaction.execute("INSERT INTO progression_policies (id, plan_day_exercise_id, policy_type, policy_version, rule_json, metric_profile, metric_contract_version, exercise_metric_generation, status, invalidated_at_ms, revision) VALUES ('legacy-policy', 'legacy-occurrence', 'load_reps', 1, '{}', 'load_reps', 1, 1, 'active', NULL, 1)");
    await transaction.execute("INSERT INTO progression_recommendations (id, exercise_id, plan_working_set_target_id, rule_type, rule_version, evidence_version, evidence_json, current_target_json, proposed_target_json, metric_profile, metric_contract_version, exercise_metric_generation, status, source_revision, target_revision, created_at_ms, decided_at_ms) VALUES ('legacy-recommendation', 'custom-exercise', 'legacy-target', 'load_reps', 1, 1, '{}', ?, ?, 'load_reps', 1, 1, 'accepted', 1, 1, 11, 12)", [targetJson, targetJson]);
    await transaction.execute("INSERT INTO starter_plan_sources (source_namespace, template_id, source_revision, asset_sha256, display_name, template_json, accepted_at_ms) VALUES ('gym-tracker.starters', 'starter-template', 2, ?, 'Starter', '{}', 1)", [hash]);
    await transaction.execute("INSERT INTO owned_plan_aggregate_states (plan_id, lifecycle, graph_status, missing_requirement_code, missing_requirement, created_at_ms, updated_at_ms, archived_at_ms) VALUES ('copied-plan', 'ready', 'valid', NULL, NULL, 1, 1, NULL)");
    await transaction.execute("INSERT INTO owned_plan_mutation_requests (request_id, request_sha256, operation, source_plan_id, result_plan_id, expected_revision, result_revision, result_json, committed_at_ms) VALUES ('owned-mutation', ?, 'create', NULL, 'copied-plan', NULL, 1, '{}', 2)", [hash]);
    await transaction.execute("INSERT INTO owned_plan_starter_sources (plan_id, source_namespace, template_id, source_revision, asset_sha256, cloned_day_count, cloned_occurrence_count, cloned_at_ms) VALUES ('copied-plan', 'gym-tracker.starters', 'starter-template', 2, ?, 1, 1, 2)", [hash]);
    await transaction.execute("INSERT INTO owned_plan_day_sources (plan_day_id, plan_id, source_day_id, source_ordinal) VALUES ('copied-day', 'copied-plan', 'template-day', 1)");
    await transaction.execute("INSERT INTO owned_plan_day_exercises (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds, metric_profile, metric_contract_version, exercise_metric_generation, revision) VALUES ('owned-occurrence', 'copied-day', 'custom-exercise', 0, 90, 'load_reps', 1, 1, 1)");
    await transaction.execute("INSERT INTO owned_plan_day_exercises (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds, metric_profile, metric_contract_version, exercise_metric_generation, revision) VALUES ('owned-catalog-occurrence', 'copied-day', 'bundled-plan-only', 1, 90, 'load_reps', 1, 1, 1)");
    await transaction.execute("INSERT INTO owned_plan_warmup_sets (id, plan_day_exercise_id, ordinal, load_grams, reps, revision) VALUES ('owned-warmup', 'owned-occurrence', 0, 20000, 10, 1)");
    await transaction.execute("INSERT INTO owned_plan_working_set_targets (id, plan_day_exercise_id, ordinal, target_json, unit_json, metric_profile, metric_contract_version, exercise_metric_generation, revision) VALUES ('owned-target', 'owned-occurrence', 0, ?, '{}', 'load_reps', 1, 1, 1)", [targetJson]);
    await transaction.execute("INSERT INTO owned_plan_progression_policies (id, plan_day_exercise_id, policy_kind, policy_id, policy_version, rule_json, metric_profile, metric_contract_version, exercise_metric_generation, status, revision) VALUES ('owned-policy', 'owned-occurrence', 'manual_hold', 'manual-hold', 1, '{}', 'load_reps', 1, 1, 'active', 1)");
    await transaction.execute("INSERT INTO owned_plan_occurrence_sources (plan_day_exercise_id, plan_day_id, source_occurrence_id, source_exercise_id, source_ordinal, catalog_metric_profile, catalog_metric_contract_version, catalog_exercise_metric_generation, metric_override_json, content_rationale) VALUES ('owned-occurrence', 'copied-day', 'template-occurrence', 'template-exercise', 1, 'load_reps', 1, 1, NULL, 'Owner adjustment')");
    await transaction.execute("INSERT INTO owned_plan_occurrence_sources (plan_day_exercise_id, plan_day_id, source_occurrence_id, source_exercise_id, source_ordinal, catalog_metric_profile, catalog_metric_contract_version, catalog_exercise_metric_generation, metric_override_json, content_rationale) VALUES ('owned-catalog-occurrence', 'copied-day', 'template-catalog-occurrence', 'plan-only-row', 2, 'load_reps', 1, 1, NULL, 'Owner catalog reference')");
    await transaction.execute("INSERT INTO owned_plan_schedules (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms) VALUES ('owned-schedule', 'copied-plan', 'active', 1, 3, NULL)");
    await transaction.execute("INSERT INTO owned_plan_schedule_versions (id, schedule_id, version_number, effective_local_date, mode, timezone, rotation_pointer, created_at_ms) VALUES ('owned-version', 'owned-schedule', 1, '2026-08-24', 'weekday', 'Asia/Singapore', NULL, 3)");
    await transaction.execute("INSERT INTO owned_plan_schedule_bindings (id, schedule_version_id, mode, ordinal, week_index, weekday, plan_day_id) VALUES ('owned-binding', 'owned-version', 'weekday', 0, 0, 'Monday', 'copied-day')");
    await transaction.execute("INSERT INTO owned_plan_schedule_overrides (id, schedule_id, local_date, selection_kind, plan_day_id, state, revision, consumed_opportunity_id, created_at_ms, consumed_at_ms) VALUES ('owned-override', 'owned-schedule', '2026-08-25', 'plan_day', 'copied-day', 'pending', 1, NULL, 3, NULL)");
    await transaction.execute("INSERT INTO owned_plan_schedule_opportunities (id, schedule_id, schedule_version_id, local_date, source, plan_day_id, state, outcome, session_id, revision, consumed_at_ms) VALUES ('owned-opportunity', 'owned-schedule', 'owned-version', '2026-08-24', 'weekday', 'copied-day', 'pending', NULL, NULL, 1, NULL)");
    await transaction.execute("INSERT INTO owned_plan_schedule_events (id, schedule_id, event_type, local_date, payload_json, schedule_revision, created_at_ms) VALUES ('owned-event', 'owned-schedule', 'activated', '2026-08-24', '{}', 1, 3)");
    await transaction.execute("INSERT INTO starter_plan_activation_requests (request_id, request_sha256, source_namespace, template_id, source_revision, expected_active_schedule_revision, choice, selected_plan_id, result_plan_id, result_schedule_id, result_json, committed_at_ms) VALUES ('starter-request', ?, 'gym-tracker.starters', 'starter-template', 2, NULL, 'initial', NULL, 'copied-plan', 'owned-schedule', '{}', 3)", [hash]);
    await transaction.execute("INSERT INTO owned_progression_recommendations (id, exercise_id, owned_plan_working_set_target_id, rule_type, rule_version, evidence_version, evidence_json, current_target_json, proposed_target_json, metric_profile, metric_contract_version, exercise_metric_generation, status, source_revision, target_revision, created_at_ms, decided_at_ms) VALUES ('owned-recommendation', 'custom-exercise', 'owned-target', 'load_reps', 1, 1, '{}', ?, ?, 'load_reps', 1, 1, 'accepted', 1, 1, 11, 12)", [targetJson, targetJson]);
    await transaction.execute("INSERT INTO workout_sessions (id, plan_id, plan_day_id, source, status, local_date, timezone, started_at_ms, completed_at_ms, revision, creation_timezone_offset_minutes) VALUES ('session', 'custom-plan', 'custom-day', 'scheduled_day', 'completed', '2026-08-24', 'Asia/Singapore', 100, 200, 1, 480)");
    await transaction.execute("INSERT INTO session_exercises (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal, exercise_name, metric_profile, metric_contract_version, exercise_metric_generation, default_rest_seconds, target_revision, status, revision) VALUES ('session-custom', 'session', NULL, 'custom-exercise', 0, 'Custom row', 'load_reps', 1, 1, 90, 1, 'completed', 1), ('session-bundled', 'session', NULL, 'bundled-exercise', 1, 'Barbell row', 'load_reps', 1, 1, 90, 1, 'completed', 1)");
    await transaction.execute("INSERT INTO session_sets (id, session_exercise_id, set_kind, ordinal, source_plan_working_set_target_id, target_load_grams, target_min_reps, target_max_reps, target_json, unit_json, rule_type, rule_version, metric_profile, metric_contract_version, exercise_metric_generation, observed_json, status, completed_at_ms, revision) VALUES ('set', 'session-custom', 'working', 0, 'legacy-target', 40000, 8, 10, ?, '{}', 'load_reps', 1, 'load_reps', 1, 1, '{\"version\":1,\"profile\":\"load_reps\",\"loadGrams\":40000,\"reps\":8,\"source\":\"manual\"}', 'completed', 200, 1)", [targetJson]);
    await transaction.execute("INSERT INTO session_rest_states (session_id, state_version, status, started_at_ms, ends_at_ms, remaining_ms, expired_at_ms, next_set_id, revision) VALUES ('session', 1, 'idle', NULL, NULL, NULL, NULL, NULL, 1)");
    await transaction.execute("INSERT INTO session_undo_snapshots (id, session_id, completed_set_id, idempotency_key, snapshot_version, snapshot_json, undo_until_ms, consumed_at_ms, created_at_ms) VALUES ('undo', 'session', 'set', 'undo-key', 1, '{}', 300, NULL, 200)");
    await transaction.execute("INSERT INTO history_session_overlays (session_id, effective_revision, lifecycle, snapshot_json, effective_local_date, effective_timezone, effective_started_at_ms, effective_completed_at_ms, created_at_ms, updated_at_ms) VALUES ('session', 1, 'active', '{}', '2026-08-24', 'Asia/Singapore', 100, 200, 200, 200)");
    await transaction.execute("INSERT INTO history_audit_events (id, session_id, effective_revision, event_type, field_identity, before_json, after_json, occurred_at_ms) VALUES ('audit-correction', 'session', 1, 'correction', 'session', '{}', '{}', 201), ('audit-void', 'session', 1, 'void', 'session', '{}', '{}', 202), ('audit-restore', 'session', 1, 'restore', 'session', '{}', '{}', 203)");
    await transaction.execute("INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms) VALUES ('library.section', 1, '{\"section\":\"plans\"}', 1, 5)");
  });
}

function collect(kernel: SqliteKernel): Promise<LogicalBackupSnapshot> {
  return createLogicalBackupRepository(kernel).collect({
    snapshotId: "backup-test",
    createdAtMs: 1_786_853_900_000,
  });
}

describe("logical backup repository", () => {
  it("keeps every logical-table foreign key represented by the restore reference registry", async () => {
    const kernel = await open();
    const actual: string[] = [];
    for (const childTable of LOGICAL_BACKUP_TABLES) {
      const rows = await kernel.queryAll<{
        id: number;
        seq: number;
        table: string;
        from: string;
        to: string;
      }>("PRAGMA foreign_key_list(" + childTable + ")");
      const groups = new Map<number, typeof rows>();
      for (const row of rows) groups.set(row.id, [...(groups.get(row.id) ?? []), row]);
      for (const group of groups.values()) {
        const ordered = [...group].sort((left, right) => left.seq - right.seq);
        actual.push(JSON.stringify({
          childTable,
          childColumns: ordered.map(({ from }) => from),
          parentTable: ordered[0]!.table,
          parentColumns: ordered.map(({ to }) => to),
        }));
      }
    }
    const declared = LOGICAL_BACKUP_REFERENCE_DEFINITIONS.map((definition) => JSON.stringify({
      childTable: definition.childTable,
      childColumns: definition.childColumns,
      parentTable: definition.parentTable,
      parentColumns: definition.parentColumns,
    }));
    expect(new Set(declared)).toEqual(new Set(actual));
  });
  it("uses an explicit source filter for every logical backup table", () => {
    expect(Object.keys(LOGICAL_BACKUP_TABLE_FILTERS).sort()).toEqual(
      [...LOGICAL_BACKUP_TABLES],
    );
  });

  it("collects a manifest-complete empty logical snapshot without raw database data", async () => {
    const snapshot = await collect(await open());

    expect(snapshot.tables).toEqual(
      Object.fromEntries(LOGICAL_BACKUP_TABLES.map((table) => [table, []])),
    );
    expect(snapshot.manifest).toEqual({
      catalogReferenceCount: 0,
      rowCounts: Object.fromEntries(LOGICAL_BACKUP_TABLES.map((table) => [table, 0])),
      totalRows: 0,
    });
    expect(snapshot.catalogReferences).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toMatch(/\.db|sqlite_master|pending_effects/i);
  });

  it("collects every user-owned source category deterministically without bundled authority", async () => {
    const kernel = await open();
    await seed(kernel);

    const first = await collect(kernel);
    const second = await collect(kernel);

    expect(second).toEqual(first);
    expect(first.tables.exercises!.map(({ id }) => id)).toEqual([
      "copied-exercise",
      "custom-exercise",
    ]);
    expect(first.tables.exercise_owner_preferences!.map(({ exercise_id }) => exercise_id)).toEqual([
      "bundled-exercise",
      "custom-exercise",
    ]);
    expect(first.tables.plans!.map(({ id }) => id)).toEqual([
      "copied-plan",
      "custom-plan",
    ]);
    expect(first.tables.history_audit_events!.map(({ event_type }) => event_type)).toEqual([
      "correction",
      "restore",
      "void",
    ]);
    expect(Object.keys(first.tables).sort()).toEqual([...LOGICAL_BACKUP_TABLES]);
    expect(first.manifest.totalRows).toBe(
      Object.values(first.manifest.rowCounts).reduce((total, count) => total + count, 0),
    );
    expect(first.catalogReferences).toEqual([
      {
        kind: "exercise",
        sourceNamespace: "gym-tracker.catalog",
        upstreamId: "barbell-row",
        sourceRevision: "7",
      },
      {
        kind: "exercise",
        sourceNamespace: "gym-tracker.catalog",
        upstreamId: "plan-only-row",
        sourceRevision: "7",
      },
      {
        kind: "plan",
        sourceNamespace: "gym-tracker.starters",
        upstreamId: "starter-template",
        sourceRevision: "2",
      },
    ]);
    expect(JSON.stringify(first)).not.toMatch(
      /content_pack_revisions|exercise_catalog_sources|exercise_search_terms_fts|pending_effects|history_projection_|history_rebuild_effects|foreground_rest_feedback/,
    );
  });

  it("does not change source facts when collection fails", async () => {
    const kernel = await open();
    await seed(kernel);
    const before = await kernel.queryAll("SELECT id, revision FROM exercises ORDER BY id");
    const failingKernel: SqliteKernel = {
      ...kernel,
      write: (command) => kernel.write(async (transaction) => command({
        ...transaction,
        queryAll: async function queryAll<Row extends Record<string, unknown>>(
          sql: string,
          parameters: readonly (null | number | string | Uint8Array)[] = [],
        ) {
          if (sql.includes("FROM plans")) {
            throw new Error("fixture failure");
          }
          return transaction.queryAll<Row>(sql, parameters);
        },
      })),
    };

    await expect(collect(failingKernel)).rejects.toThrow("logical_backup_collection_failed");
    await expect(kernel.queryAll("SELECT id, revision FROM exercises ORDER BY id")).resolves.toEqual(before);
  });

  it("fails closed when SQLite returns an invalid source value, reference, or schema version", async () => {
    const kernel = await open();
    const invalidValueKernel: SqliteKernel = {
      ...kernel,
      write: (command) => kernel.write(async (transaction) => command({
        ...transaction,
        queryAll: async function queryAll<Row extends Record<string, unknown>>(
          sql: string,
          parameters: readonly (null | number | string | Uint8Array)[] = [],
        ) {
          if (sql.includes('FROM "app_settings"')) {
            return [{ key: "invalid", payload: 1.5 }] as unknown as Row[];
          }
          return transaction.queryAll<Row>(sql, parameters);
        },
      })),
    };
    await expect(collect(invalidValueKernel)).rejects.toThrow(
      "logical_backup_collection_failed",
    );

    const invalidSchemaKernel: SqliteKernel = {
      ...kernel,
      write: (command) => kernel.write(async (transaction) => command({
        ...transaction,
        queryAll: async function queryAll<Row extends Record<string, unknown>>(
          sql: string,
          parameters: readonly (null | number | string | Uint8Array)[] = [],
        ) {
          if (sql === "PRAGMA user_version") {
            return [{ user_version: 1.5 }] as unknown as Row[];
          }
          return transaction.queryAll<Row>(sql, parameters);
        },
      })),
    };
    await expect(collect(invalidSchemaKernel)).rejects.toThrow(
      "logical_backup_collection_failed",
    );

    const referenceKernel: SqliteKernel = {
      ...kernel,
      write: (command) => kernel.write(async (transaction) => command({
        ...transaction,
        queryAll: async function queryAll<Row extends Record<string, unknown>>(
          sql: string,
          parameters: readonly (null | number | string | Uint8Array)[] = [],
        ) {
          if (sql.includes("FROM exercise_catalog_sources")) {
            return [{
              kind: "exercise",
              source_namespace: " ",
              upstream_id: "exercise",
              source_revision: "1",
            }] as unknown as Row[];
          }
          return transaction.queryAll<Row>(sql, parameters);
        },
      })),
    };
    await expect(collect(referenceKernel)).rejects.toThrow(
      "logical_backup_collection_failed",
    );
  });
});

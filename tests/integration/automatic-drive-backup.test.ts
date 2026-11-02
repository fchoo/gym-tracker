import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAutomaticBackupCoordinator } from "../../src/domains/backup/automaticBackupCoordinator";
import { reconstructedDriveManifestBytes } from "../../src/domains/backup/automaticBackupContracts";
import { LOGICAL_BACKUP_TABLES } from "../../src/domains/portability/backupContracts";
import {
  configureSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { MULTI_PLAN_RUNNING_FOUNDATION_TABLES } from "../../src/platform/sqlite/migrations/0028_multi_plan_running_foundation";
import { IMPORTED_ACTIVITY_EVIDENCE_TABLES } from "../../src/platform/sqlite/migrations/0030_imported_activity_evidence";
import { BODYWEIGHT_SOURCE_HISTORY_TABLES } from "../../src/platform/sqlite/migrations/0031_bodyweight_source_history";
import { RUNNING_ACTIVITY_MATCH_LEDGER_TABLES } from "../../src/platform/sqlite/migrations/0034_running_activity_match_ledger";
import { createExerciseSearchIndexRepository } from "../../src/platform/sqlite/repositories/exerciseSearchIndexRepository";
import { createHistoryProjectionRepository } from "../../src/platform/sqlite/repositories/historyProjectionRepository";
import { createRestoreReconciliationRepository } from "../../src/platform/sqlite/repositories/restoreReconciliationRepository";
import { createRunningPlanRepository } from "../../src/platform/sqlite/repositories/runningPlanRepository";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";

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
  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    return new Statement(this.database.prepare(sql));
  }
  async isInTransactionAsync(): Promise<boolean> { return this.database.isTransaction; }
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

async function migratedRuntime(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-automatic-backup-garmin-"));
  directories.add(directory);
  const databasePath = join(directory, "gym.db");
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ writer, reader });
  kernels.add(kernel);
  await createMigrationRunner({
    databaseName: databasePath,
    kernel,
    migrations,
    recoveryBackup: {
      createAndValidate: async (request) => ({
        backupId: "automatic-backup-garmin",
        databaseName: request.databaseName,
        fromVersion: request.fromVersion,
        toVersion: request.toVersion,
        validated: true,
      }),
    },
  }).run();
  return kernel;
}

async function generation(kernel: SqliteKernel): Promise<number> {
  const [row] = await kernel.queryAll<{ mutation_generation: number }>(
    "SELECT mutation_generation FROM automatic_backup_state WHERE id = 1",
  );
  if (row === undefined) throw new Error("automatic_backup_state_missing");
  return row.mutation_generation;
}

async function expectGenerationOnce(
  kernel: SqliteKernel,
  sql: string,
  parameters: readonly (null | number | string | Uint8Array)[] = [],
): Promise<void> {
  const before = await generation(kernel);
  await kernel.write((transaction) => transaction.execute(sql, parameters));
  expect(await generation(kernel)).toBe(before + 1);
}

describe("automatic Drive backup integration", () => {
  it("keeps every Phase 13 authoritative source family in the trigger-owning migrations while excluding rebuilt current relations", () => {
    expect(MULTI_PLAN_RUNNING_FOUNDATION_TABLES).toEqual(expect.arrayContaining([
      "imported_activities", "imported_activity_payloads", "imported_activity_removal_events",
      "running_match_events", "bodyweight_revisions", "bodyweight_tombstones",
    ]));
    expect(IMPORTED_ACTIVITY_EVIDENCE_TABLES).toEqual(expect.arrayContaining([
      "imported_activity_identities", "imported_activity_events", "imported_activity_match_invalidations",
    ]));
    expect(BODYWEIGHT_SOURCE_HISTORY_TABLES).toEqual([
      "bodyweight_entries", "bodyweight_entry_events", "bodyweight_command_receipts",
    ]);
    expect(RUNNING_ACTIVITY_MATCH_LEDGER_TABLES).toEqual(expect.arrayContaining([
      "running_activity_match_events", "running_activity_match_receipts",
    ]));
    expect(RUNNING_ACTIVITY_MATCH_LEDGER_TABLES).toContain("running_activity_current_matches");
    expect([
      ...MULTI_PLAN_RUNNING_FOUNDATION_TABLES,
      ...IMPORTED_ACTIVITY_EVIDENCE_TABLES,
      ...BODYWEIGHT_SOURCE_HISTORY_TABLES,
    ]).not.toContain("running_activity_current_matches");
  });

  it("reconstructs complete descriptors that remain usable for recovery", async () => {
    const candidate = {
      kind: "current" as const,
      ownerNamespace: "a".repeat(32),
      writerEpoch: 3,
      mutationGeneration: 9,
      createdAtMs: 10,
      snapshotId: "snapshot-latest",
      fileId: "latest",
      objectSha256: "b".repeat(64),
      byteLength: 1,
    };
    const manifest = reconstructedDriveManifestBytes({ latest: candidate, previous: null });
    const parseSnapshot = jest.fn(async () => ({}));
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: {
        read: async () => ({ environment: "development-test" as const, permissionId: "p", connectionGeneration: 2, writerEpoch: 2, mutationGeneration: 2, backedUpGeneration: 1, authorityState: "quarantine" as const, manifestId: "manifest" }),
        persistAttempt: async () => undefined,
        acknowledgeReceipt: async () => false,
      },
      drive: {
        createSnapshot: async () => "snapshot",
        download: async () => new Uint8Array([1]),
        updateManifest: async () => "etag",
        readManifest: async () => ({ fileId: "manifest", bytes: manifest, etag: "etag" }),
      },
      validate: () => true,
      nowMs: () => 1,
      candidateId: () => "attempt",
      recovery: {
        parseSnapshot,
        localIsEmpty: async () => true,
        prepareMerge: async () => ({ token: "merge", ownerSummary: "owner", adoptionRequired: false }),
        restore: async () => ({ state: "ready" as const }),
        commitMerge: async () => ({ state: "ready" as const }),
      },
    });

    await expect(coordinator.prepareRecovery({ candidate: "latest" })).resolves.toMatchObject({ kind: "empty_direct" });
    expect(parseSnapshot).toHaveBeenCalledWith(new Uint8Array([1]), {
      fileId: "latest", objectSha256: "b".repeat(64), byteLength: 1,
      snapshotId: "snapshot-latest", writerEpoch: 3, mutationGeneration: 9,
    });
  });

  it("advances once per retained Garmin source row while reads and projection rebuilds stay generation-neutral", async () => {
    const kernel = await migratedRuntime();
    await expectGenerationOnce(
      kernel,
      "INSERT INTO imported_activities(id, source, source_activity_id, started_at_ms, aggregate_json, imported_at_ms) VALUES ('backup-garmin-activity', 'garmin_connect_account:backup-owner', '4242', 1, '{}', 1)",
    );
    await expectGenerationOnce(
      kernel,
      "INSERT INTO imported_activity_identities(activity_id, source_kind, account_namespace, external_activity_id, aggregate_revision, accepted_normalized_sha256, removal_state) VALUES ('backup-garmin-activity', 'garmin_connect_account', 'backup-owner', '4242', 1, ?, 'active')",
      ["a".repeat(64)],
    );
    await expectGenerationOnce(
      kernel,
      "INSERT INTO imported_activity_payloads(id, activity_id, payload_json, sha256) VALUES ('backup-garmin-payload', 'backup-garmin-activity', '{}', ?)",
      ["a".repeat(64)],
    );
    await expectGenerationOnce(
      kernel,
      "INSERT INTO imported_activity_events(id, activity_id, aggregate_revision, event_type, payload_json, created_at_ms) VALUES ('backup-garmin-event', 'backup-garmin-activity', 1, 'imported', '{}', 1)",
    );
    await expectGenerationOnce(
      kernel,
      "INSERT INTO imported_activity_receipts(id, activity_id, request_sha256, committed_at_ms) VALUES ('backup-garmin-receipt', 'backup-garmin-activity', ?, 1)",
      ["b".repeat(64)],
    );

    const runningPlans = createRunningPlanRepository(kernel);
    await runningPlans.createInactiveMinimum({
      planId: "backup-running-plan",
      planName: "Backup Running",
      anchorDayId: "backup-running-anchor",
      scheduleId: "backup-running-schedule",
      scheduleVersionId: "backup-running-version",
      scheduleBindingId: "backup-running-binding",
      createdAtMs: 2,
      effectiveLocalDate: "2026-10-05",
      timezone: "Asia/Singapore",
      recoveryRevisionId: "backup-running-session",
      slots: [{
        id: "backup-running-slot",
        weekday: "Monday",
        ordinal: 0,
        sessionRevisionId: "backup-running-session",
      }],
    });
    await runningPlans.activateMinimum({
      planId: "backup-running-plan",
      scheduleId: "backup-running-schedule",
      expectedPlanRevision: 1,
      expectedScheduleRevision: 1,
      activatedAtMs: 3,
    });
    await runningPlans.materializeOccurrences({
      planId: "backup-running-plan",
      scheduleId: "backup-running-schedule",
      scheduleVersionId: "backup-running-version",
      localDate: "2026-10-05",
      timezone: "Asia/Singapore",
      createdAtMs: 4,
      occurrenceIds: ["backup-running-opportunity"],
    });
    await expectGenerationOnce(
      kernel,
      `INSERT INTO running_activity_match_events
        (id, activity_id, opportunity_id, prior_opportunity_id, action,
         activity_revision, opportunity_revision, prior_relation_revision,
         relation_revision, request_sha256, created_at_ms)
       VALUES ('backup-match-event', 'backup-garmin-activity',
         'backup-running-opportunity', NULL, 'matched', 1, 1, 0, 1, ?, 5)`,
      ["c".repeat(64)],
    );
    await expectGenerationOnce(
      kernel,
      `INSERT INTO running_activity_match_receipts
        (request_id, request_sha256, activity_id, opportunity_id,
         relation_revision, result_kind, committed_at_ms)
       VALUES ('backup-match-receipt', ?, 'backup-garmin-activity',
         'backup-running-opportunity', 1, 'matched', 5)`,
      ["c".repeat(64)],
    );

    const beforeProjection = await generation(kernel);
    await kernel.write((transaction) => transaction.execute(
      "INSERT INTO running_activity_current_matches(opportunity_id, activity_id, relation_revision, event_id) VALUES ('backup-running-opportunity', 'backup-garmin-activity', 1, 'backup-match-event')",
    ));
    await kernel.queryAll("SELECT accepted_normalized_sha256 FROM imported_activity_identities");
    expect(await generation(kernel)).toBe(beforeProjection);

    await kernel.write((transaction) => transaction.execute(
      "UPDATE portability_restore_state SET state = 'rebuild_pending', updated_at_ms = 6 WHERE id = 1",
    ));
    const beforeRebuild = await generation(kernel);
    const reconciliation = createRestoreReconciliationRepository(kernel, {
      history: createHistoryProjectionRepository(kernel),
      nowMs: () => 7,
      search: createExerciseSearchIndexRepository(kernel),
    });
    await expect(reconciliation.reconcileAndRebuild()).resolves.toMatchObject({
      outcome: "rebuilt",
      state: "ready",
    });
    await expect(reconciliation.reconcileAndRebuild()).resolves.toMatchObject({
      outcome: "already_ready",
      state: "ready",
    });
    expect(await generation(kernel)).toBe(beforeRebuild);
  });

  it("keeps authorization and native transient state outside the logical archive allowlist", () => {
    expect(LOGICAL_BACKUP_TABLES.some((table) =>
      /(garmin.*(?:token|connection|cursor|staging)|native.*staging|authorization)/iu.test(table)))
      .toBe(false);
  });

  it("keeps a stale writer quarantined after a conditional manifest conflict", async () => {
    const states: string[] = [];
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 2, sourceDigest: "a".repeat(64), bytes: new Uint8Array([1]) }),
      state: {
        read: async () => ({ environment: "development-test" as const, permissionId: "p", connectionGeneration: 2, writerEpoch: 4, mutationGeneration: 2, backedUpGeneration: 1 }),
        persistAttempt: async () => undefined,
        acknowledgeReceipt: async () => true,
        markStaleWriter: async () => { states.push("stale_writer"); return true; },
      },
      drive: {
        createSnapshot: async () => "immutable-candidate",
        download: async () => new Uint8Array([1]),
        updateManifest: async () => { throw new Error("drive_manifest_conflict"); },
        readManifest: async () => null,
      },
      validate: () => true,
      nowMs: () => 1,
      candidateId: () => "candidate",
    });

    await expect(coordinator.backup()).resolves.toEqual({ status: "stale_writer" });
    expect(states).toEqual(["stale_writer"]);
  });
});

import { afterEach, describe, expect, it } from "@jest/globals";
import { DatabaseSync } from "node:sqlite";

import { createAutomaticBackupStateRepository } from "../../src/platform/sqlite/repositories/automaticBackupStateRepository";
import { createAutomaticBackupCoordinator } from "../../src/domains/backup/automaticBackupCoordinator";
import type { SqliteConnection, SqlitePreparedResult, SqlitePreparedStatement } from "../../src/platform/sqlite/connection";
import { configureSqliteConnection } from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(readonly changes: number, readonly lastInsertRowId: number, private readonly rows: readonly Row[]) {}
  async getAllAsync(): Promise<readonly Row[]> { return this.rows; }
}

class Statement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}
  async executeAsync<Row extends Record<string, unknown>>(parameters: readonly (null | number | string | Uint8Array)[] = []): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) return new Result(0, 0, this.statement.all(...parameters) as Row[]);
    const result = this.statement.run(...parameters);
    return new Result(Number(result.changes), Number(result.lastInsertRowid), []);
  }
  async finalizeAsync(): Promise<void> {}
}

class Connection implements SqliteConnection {
  private closed = false;
  constructor(private readonly database: DatabaseSync) {}
  async execAsync(sql: string): Promise<void> { this.database.exec(sql); }
  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> { return new Statement(this.database.prepare(sql)); }
  async isInTransactionAsync(): Promise<boolean> { return this.database.isTransaction; }
  async closeAsync(): Promise<void> { if (!this.closed) { this.database.close(); this.closed = true; } }
}

const kernels = new Set<SqliteKernel>();
afterEach(async () => { await Promise.all([...kernels].map((kernel) => kernel.close())); kernels.clear(); });

async function open(): Promise<SqliteKernel> {
  const writer = new Connection(new DatabaseSync(":memory:"));
  const reader = writer;
  await configureSqliteConnection(writer, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  kernels.add(kernel);
  await createMigrationRunner({
    databaseName: "automatic-backup-host", kernel, migrations,
    recoveryBackup: { createAndValidate: async (request) => ({ backupId: "host", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true }) },
  }).run();
  return kernel;
}

describe("automatic backup state repository host SQLite", () => {
  it("persists quarantine and rejects a receipt after an account/epoch fence changes", async () => {
    const kernel = await open();
    const repository = createAutomaticBackupStateRepository(kernel);
    await repository.beginQuarantine({ environment: "development-test", permissionId: "permission-a", connectionGeneration: 1, accountDisplayLabel: "…@example.com" });
    await repository.beginQuarantine({ environment: "development-test", permissionId: "permission-a", connectionGeneration: 1 });
    expect(await repository.read()).toMatchObject({ accountDisplayLabel: "…@example.com" });
    expect(await repository.activateWriter({ manifestId: "manifest", manifestEtag: "etag", writerEpoch: 2, permissionId: "permission-a", connectionGeneration: 1 })).toBe(true);
    await repository.persistAttempt({ environment: "development-test", permissionId: "permission-a", connectionGeneration: 1, writerEpoch: 2, capturedGeneration: 0, sourceDigest: "a".repeat(64), snapshotId: "snapshot", manifestId: "manifest", manifestEtag: "etag", candidateId: "candidate", nowMs: 1 });
    await expect(repository.acknowledgeReceipt({ environment: "development-test", permissionId: "permission-a", connectionGeneration: 1, writerEpoch: 2, capturedGeneration: 0, sourceDigest: "a".repeat(64), snapshotId: "snapshot", manifestId: "manifest", manifestEtag: "next-etag" })).resolves.toBe(true);
    expect(await repository.read()).toMatchObject({ manifestEtag: "next-etag", lastAttemptMs: 1, lastSuccessMs: 1 });
    await repository.beginQuarantine({ environment: "development-test", permissionId: "permission-b", connectionGeneration: 2, accountDisplayLabel: "…@example.com" });
    await expect(repository.acknowledgeReceipt({ environment: "development-test", permissionId: "permission-a", connectionGeneration: 1, writerEpoch: 2, capturedGeneration: 0, sourceDigest: "a".repeat(64), snapshotId: "snapshot", manifestId: "manifest", manifestEtag: "etag" })).resolves.toBe(false);
    expect(await repository.read()).toMatchObject({ permissionId: "permission-b", authorityState: "quarantine", connectionGeneration: 2 });
  });

  it("keeps a fresh-auth higher-epoch takeover quarantined for recovery", async () => {
    const kernel = await open();
    const repository = createAutomaticBackupStateRepository(kernel);
    await repository.beginQuarantine({
      environment: "development-test",
      permissionId: "permission-a",
      connectionGeneration: 1,
    });
    expect(await repository.activateWriter({
      manifestId: "manifest",
      manifestEtag: "local-etag",
      writerEpoch: 2,
      permissionId: "permission-a",
      connectionGeneration: 1,
    })).toBe(true);
    expect(await repository.markStaleWriter(2)).toBe(true);

    const manifest = new TextEncoder().encode(JSON.stringify({
      kind: "active",
      writer_epoch: 3,
      latest: {
        fileId: "latest",
        object_sha256: "a".repeat(64),
        byteLength: 1,
        snapshotId: "snapshot-latest",
        writerEpoch: 3,
        mutationGeneration: 0,
      },
      previous: null,
    }));
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      auth: {
        connect: async () => null,
        reauthenticate: async () => ({ permissionId: "permission-a", displayEmail: null }),
        disconnect: async () => undefined,
      },
      capture: async () => ({
        generation: 0,
        sourceDigest: "a".repeat(64),
        bytes: new Uint8Array(),
      }),
      state: repository,
      drive: {
        createSnapshot: async () => "snapshot",
        download: async () => new Uint8Array([1]),
        updateManifest: async () => "next-etag",
        readManifest: async () => ({ fileId: "manifest", bytes: manifest, etag: "remote-etag" }),
      },
      validate: () => true,
      validateManifest: () => ({
        writerEpoch: 3,
        latest: { fileId: "latest", object_sha256: "a".repeat(64) },
        previous: null,
      }),
      nowMs: () => 1,
      candidateId: () => "attempt",
      recovery: {
        parseSnapshot: async () => ({}),
        localIsEmpty: async () => true,
        prepareMerge: async () => ({ token: "merge", ownerSummary: "owner", adoptionRequired: false }),
        restore: async () => ({ state: "ready" as const }),
        commitMerge: async () => ({ state: "ready" as const }),
      },
    });

    await expect(coordinator.takeOver()).resolves.toEqual({ status: "quarantined" });
    await expect(repository.read()).resolves.toMatchObject({
      authorityState: "quarantine",
      writerEpoch: 2,
      connectionGeneration: 2,
    });
    await expect(coordinator.prepareRecovery({ candidate: "latest" }))
      .resolves.toMatchObject({ kind: "empty_direct" });
  });

  it("resets completed deletion atomically and blocks disconnect during a pending sweep", async () => {
    const kernel = await open();
    const repository = createAutomaticBackupStateRepository(kernel);
    await repository.beginQuarantine({
      environment: "development-test",
      permissionId: "permission-a",
      connectionGeneration: 1,
    });
    expect(await repository.beginDeletionSweep({
      environment: "development-test",
      permissionId: "permission-a",
      connectionGeneration: 1,
      manifestId: "manifest",
      manifestEtag: "tombstone-etag",
      successorWriterEpoch: 2,
    })).toBe(true);
    expect(await repository.completeDeletionSweep({
      environment: "development-test",
      permissionId: "permission-a",
      connectionGeneration: 1,
    })).toBe(true);

    await repository.beginQuarantine({
      environment: "development-test",
      permissionId: "permission-a",
      connectionGeneration: 2,
    });
    await expect(repository.read()).resolves.toMatchObject({
      authorityState: "quarantine",
      deletionProgress: "none",
    });

    expect(await repository.beginDeletionSweep({
      environment: "development-test",
      permissionId: "permission-a",
      connectionGeneration: 2,
      manifestId: "manifest",
      manifestEtag: "tombstone-etag-2",
      successorWriterEpoch: 3,
    })).toBe(true);
    await expect(repository.disconnectLocal()).rejects.toThrow("sqlite_transaction_failed");
    await expect(repository.read()).resolves.toMatchObject({
      authorityState: "deleted",
      deletionProgress: "sweep_pending",
    });
  });
});

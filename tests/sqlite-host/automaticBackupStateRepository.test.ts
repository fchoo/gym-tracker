import { afterEach, describe, expect, it } from "@jest/globals";
import { DatabaseSync } from "node:sqlite";

import { createAutomaticBackupStateRepository } from "../../src/platform/sqlite/repositories/automaticBackupStateRepository";
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
});

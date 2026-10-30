import { afterEach, describe, expect, it } from "@jest/globals";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  configureSqliteConnection,
  type SqliteConnection,
  type SqliteParameter,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import type { RecoveryBackupPort } from "../../src/platform/sqlite/recoveryBackup";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";
import {
  collectPhase20QualityWorkloadProof,
  seedPhase20QualityWorkloadFixture,
} from "../../src/testing/phase20QualityWorkload";

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(readonly changes: number, readonly lastInsertRowId: number, private readonly rows: readonly Row[]) {}
  async getAllAsync(): Promise<readonly Row[]> { return this.rows; }
}

class Connection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}
  async execAsync(sql: string): Promise<void> { this.database.exec(sql); }
  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    const statement = this.database.prepare(sql);
    return { executeAsync: async <Row extends Record<string, unknown>>(parameters: readonly SqliteParameter[] = []) => {
      if (statement.columns().length > 0) return new Result(0, 0, statement.all(...parameters) as Row[]);
      const result = statement.run(...parameters);
      return new Result(Number(result.changes), Number(result.lastInsertRowid), []);
    }, finalizeAsync: async () => undefined };
  }
  async isInTransactionAsync(): Promise<boolean> { return this.database.isTransaction; }
  async closeAsync(): Promise<void> { this.database.close(); }
}

const directories = new Set<string>();
const kernels: SqliteKernel[] = [];
afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  for (const directory of directories) rmSync(directory, { force: true, recursive: true });
  directories.clear();
});

async function open(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-phase20-quality-"));
  directories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  const recoveryBackup: RecoveryBackupPort = { createAndValidate: async (request) => ({
    backupId: "phase20-quality", databaseName: request.databaseName, fromVersion: request.fromVersion,
    toVersion: request.toVersion, validated: true,
  }) };
  await createMigrationRunner({ databaseName: "gym-tracker.db", kernel, migrations, recoveryBackup }).run();
  kernels.push(kernel);
  return kernel;
}

describe("Phase 20 declared performance workload", () => {
  it("seeds and proves exactly 15,000 sets, 200 corrections, and both plan kinds in real SQLite", async () => {
    const kernel = await open();
    await seedPhase20QualityWorkloadFixture(kernel);
    const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
    const proof = await collectPhase20QualityWorkloadProof({ kernel, sha256 });
    expect(proof).toMatchObject({
      producer: "phase20-quality-workload-proof/v1",
      set_count: 15_000,
      correction_count: 200,
      plan_count: 3,
      plan_kinds: ["running", "strength"],
    });
    for (const digest of [proof.set_digest_sha256, proof.correction_digest_sha256, proof.plan_digest_sha256, proof.workload_digest_sha256]) {
      expect(digest).toMatch(/^[a-f0-9]{64}$/u);
    }
    await seedPhase20QualityWorkloadFixture(kernel);
    await expect(collectPhase20QualityWorkloadProof({ kernel, sha256 })).resolves.toEqual(proof);
  });
});

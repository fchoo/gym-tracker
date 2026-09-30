import {
  afterEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  PHASE12_MAX_SNAPSHOT_BYTES,
  PHASE12_MAX_SNAPSHOT_ROWS,
  seedMaximumHistory,
} from "../../src/bootstrap/phase12BackupBenchmark";
import {
  buildPortableMergePlan,
} from "../../src/domains/portability/mergePlan";
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
} from "../../src/platform/sqlite/repositories/logicalBackupRepository";
import {
  createSqliteMergeLocalFactsPort,
} from "../../src/platform/sqlite/repositories/restorePreflightAdapters";
import {
  createSqliteKernel,
  type SqliteKernel,
} from "../../src/platform/sqlite/sqliteKernel";

jest.mock("expo-sqlite", () => ({
  deleteDatabaseAsync: jest.fn(),
}));

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

afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  for (const directory of directories) {
    rmSync(directory, { force: true, recursive: true });
  }
  directories.clear();
});

async function migratedKernel(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "phase12-benchmark-"));
  directories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  const recoveryBackup: RecoveryBackupPort = {
    createAndValidate: async (request) => ({
      backupId: "phase12-benchmark",
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

it("seeds a maximum fixture accepted by the fully migrated schema", async () => {
  const kernel = await migratedKernel();

  await expect(seedMaximumHistory(kernel)).resolves.toBeUndefined();

  const snapshot = await createLogicalBackupRepository(kernel).collect({
    snapshotId: "phase12-writer-00",
    createdAtMs: 100,
  });
  expect({
    rows: snapshot.manifest.totalRows,
    bytes: new TextEncoder().encode(JSON.stringify(snapshot)).byteLength,
  }).toEqual({ rows: PHASE12_MAX_SNAPSHOT_ROWS, bytes: PHASE12_MAX_SNAPSHOT_BYTES });

  const live = await createSqliteMergeLocalFactsPort(kernel).read();
  await expect(buildPortableMergePlan({
    archive: { version: 2, schemaVersion: live.schemaVersion, tables: live.tables },
    local: { version: 2, ...live },
    payloadDigest: async () => "a".repeat(64),
  })).resolves.toBeDefined();
}, 120_000);

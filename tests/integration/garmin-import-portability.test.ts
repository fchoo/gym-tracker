import {
  afterEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
import {
  runPortableMergeContract,
  type PortableMergeContractAdapter,
} from "../../src/testing/contracts/portableMerge.contract";

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

function createHostAdapter(): PortableMergeContractAdapter {
  return {
    async createRuntime(databaseKey, observer = {}) {
      const directory = mkdtempSync(join(tmpdir(), `gym-garmin-portability-${databaseKey}-`));
      directories.add(directory);
      const databasePath = join(directory, "gym.db");
      const writer = new Connection(new DatabaseSync(databasePath));
      const reader = new Connection(new DatabaseSync(databasePath));
      await configureSqliteConnection(writer, { enableWal: true });
      await configureSqliteConnection(reader, { enableWal: false });
      const kernel = createSqliteKernel({ reader, writer }, observer);
      kernels.add(kernel);
      return {
        databaseName: databasePath,
        kernel,
        close: async () => undefined,
      };
    },
    recoveryBackup: {
      createAndValidate: async (request) => ({
        backupId: "garmin-portability-host",
        databaseName: request.databaseName,
        fromVersion: request.fromVersion,
        toVersion: request.toVersion,
        validated: true,
      }),
    },
    sha256: async (value) => createHash("sha256").update(value).digest("hex"),
  };
}

describe("Garmin import portability integration", () => {
  it("clean-restores one accepted account activity and confirmed match without authorization", async () => {
    const result = await runPortableMergeContract(createHostAdapter());
    const tracer = result.cases.find(({ id }) => id === "portable-merge-garmin-clean-restore");

    expect(tracer).toEqual(expect.objectContaining({
      id: "portable-merge-garmin-clean-restore",
      status: "passed",
    }));
    expect(result.cases.filter(({ id }) => id.startsWith("portable-merge-garmin-")))
      .toEqual([
        "portable-merge-garmin-clean-restore",
        "portable-merge-garmin-exact-repeat-noop",
        "portable-merge-garmin-conflict-isolation",
        "portable-merge-garmin-remap-tombstone-match",
        "portable-merge-garmin-tamper-capacity-rollback",
      ].map((id) => expect.objectContaining({ id, status: "passed" })));
  });
});

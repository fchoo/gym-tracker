import {
  afterEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
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
} from "../../platform/sqlite/connection";
import {
  createSqliteKernel,
  type SqliteKernel,
} from "../../platform/sqlite/sqliteKernel";
import {
  PORTABLE_MERGE_CONTRACT_CASES,
  runPortableMergeContract,
  type PortableMergeContractAdapter,
} from "./portableMerge.contract";

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

function createHostAdapter(): PortableMergeContractAdapter {
  return {
    async createRuntime(databaseKey, observer = {}) {
      const directory = mkdtempSync(join(tmpdir(), `gym-portable-merge-${databaseKey}-`));
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
        backupId: "portable-merge-host",
        databaseName: request.databaseName,
        fromVersion: request.fromVersion,
        toVersion: request.toVersion,
        validated: true,
      }),
    },
    sha256: async (value) => createHash("sha256").update(value).digest("hex"),
  };
}

describe("portable merge contract", () => {
  it("runs every source-owned merge case against host SQLite without skips", async () => {
    const result = await runPortableMergeContract(createHostAdapter());

    expect(PORTABLE_MERGE_CONTRACT_CASES).toEqual([
      "portable-merge-mixed-full-plan-success",
      "portable-merge-same-name-keep-both",
      "portable-merge-same-identity-dedup-remap",
      "portable-merge-session-history-newest-wins",
      "portable-merge-settings-existing-wins",
      "portable-merge-stale-preview-rollback",
      "portable-merge-unmappable-graph",
      "portable-merge-insert-rollback",
      "portable-merge-replace-rollback",
      "portable-merge-verification-rollback",
      "portable-merge-commit-rollback",
      "portable-merge-deterministic-derivative-parity",
    ]);
    expect(result.cases.filter((item) => item.status === "failed")).toEqual([]);
    expect(result.status).toBe("passed");
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.total).toBe(PORTABLE_MERGE_CONTRACT_CASES.length);
    expect(result.cases.map((item) => item.id)).toEqual(PORTABLE_MERGE_CONTRACT_CASES);
    expect(result.cases).toEqual(
      PORTABLE_MERGE_CONTRACT_CASES.map((id) =>
        expect.objectContaining({ id, status: "passed" })),
    );
  });

  it("keeps the Phase 11 manifest-bound native route and device command registered", () => {
    const repositoryRoot = join(__dirname, "../../..");
    const route = readFileSync(
      join(repositoryRoot, "app/__native-contracts.tsx"),
      "utf8",
    );
    const runner = readFileSync(
      join(repositoryRoot, "scripts/run-native-sqlite-contracts.mjs"),
      "utf8",
    );
    const packageJson = JSON.parse(readFileSync(
      join(repositoryRoot, "package.json"),
      "utf8",
    )) as { scripts?: Record<string, string> };

    expect(route).toContain("portable-merge");
    expect(route).toContain("runPortableMergeContract");
    expect(route).toContain("parameters.suite");
    expect(route).toContain("configuredSuite === \"phase11\"");
    expect(runner).toContain("PORTABLE_MERGE_CASE_IDS");
    expect(runner).toContain("manifestSuite === 'phase11'");
    expect(runner).toContain("requestedSuite === 'portable-merge'");
    expect(runner).toContain("&suite=${encodeURIComponent(suite)}");
    expect(runner).toContain("const deepLink = `gymtracker-devtest://__native-contracts?runId=${runId}&suite=${encodeURIComponent(suite)}`;");
    expect(runner).toContain("].map(shellQuote).join(' ')");
    expect(packageJson.scripts?.["test:sqlite:device"]).toContain("portable-merge");
  });
});

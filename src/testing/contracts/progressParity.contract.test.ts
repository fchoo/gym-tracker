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
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

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
  PROGRESS_PARITY_CONTRACT_CASES,
  PROGRESS_PARITY_REQUIREMENT_BY_CASE,
  runProgressParityContract,
  type ProgressParityContractAdapter,
} from "./progressParity.contract";

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
const kernels = new Set<SqliteKernel>();

afterEach(async () => {
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  kernels.clear();
  for (const directory of directories) {
    rmSync(directory, { force: true, recursive: true });
  }
  directories.clear();
});

function createHostAdapter(): ProgressParityContractAdapter {
  return {
    async createRuntime(databaseKey) {
      const directory = mkdtempSync(join(tmpdir(), `gym-progress-parity-${databaseKey}-`));
      directories.add(directory);
      const databasePath = join(directory, "gym.db");
      const writer = new Connection(new DatabaseSync(databasePath));
      const reader = new Connection(new DatabaseSync(databasePath));
      await configureSqliteConnection(writer, { enableWal: true });
      await configureSqliteConnection(reader, { enableWal: false });
      const kernel = createSqliteKernel({ reader, writer });
      kernels.add(kernel);
      return {
        databaseName: databasePath,
        kernel,
        close: async () => undefined,
      };
    },
    recoveryBackup: {
      createAndValidate: async (request) => ({
        backupId: "progress-parity-host",
        databaseName: request.databaseName,
        fromVersion: request.fromVersion,
        toVersion: request.toVersion,
        validated: true,
      }),
    },
    sha256: async (value) => createHash("sha256").update(value).digest("hex"),
  };
}

describe("Progress parity contract", () => {
  it("runs the factual Running read and lost-acknowledgement target replay against real SQLite", async () => {
    expect(PROGRESS_PARITY_CONTRACT_CASES).toHaveLength(18);
    expect(Object.values(PROGRESS_PARITY_REQUIREMENT_BY_CASE)).toEqual(
      Array.from({ length: 18 }, (_, index) =>
        `PRO-${String(index + 1).padStart(2, "0")}`),
    );

    const result = await runProgressParityContract(createHostAdapter());
    if (result.status !== "passed") {
      throw new Error(JSON.stringify(result));
    }

    expect(result).toMatchObject({
      schemaVersion: 1,
      contractVersion: 1,
      status: "passed",
      total: 18,
      passed: 18,
      failed: 0,
      skipped: 0,
    });
    for (const [index, contractCase] of result.cases.entries()) {
      expect(contractCase).toMatchObject({
        id: PROGRESS_PARITY_CONTRACT_CASES[index],
        requirement: `PRO-${String(index + 1).padStart(2, "0")}`,
        status: "passed",
        code: "progress_contract_case_passed",
        counts: {
          snapshots: index === 0 ? 4 : index === 1 || index === 2 ? 2 : 1,
          runningFacts: 1,
          goalRevisions: 2,
          receiptRows: 1,
          receiptReplays: 1,
        },
      });
      expect(contractCase.timings.durationMs).toBeGreaterThanOrEqual(0);
      expect(contractCase.hashes).toEqual({
        source: expect.stringMatching(/^[a-f0-9]{64}$/u),
        projection: expect.stringMatching(/^[a-f0-9]{64}$/u),
        receipt: expect.stringMatching(/^[a-f0-9]{64}$/u),
      });
      expect(new Set(Object.values(contractCase.hashes)).size).toBe(3);
    }
    expect(new Set(result.cases.map(({ hashes }) => hashes.projection)).size).toBe(18);

    const resultPath = process.env.PHASE19_CONTRACT_RESULT_PATH;
    if (resultPath !== undefined) {
      writeFileSync(resultPath, `${JSON.stringify(result)}\n`);
    }

    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "activityId", "bodyweight_kg", "coordinates", "filename", "heartRate",
      "owner", "provider", "route", "sql", "targetDurationMs", "workout",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("keeps the host/native suite registration source-owned and explicit", () => {
    const repositoryRoot = join(__dirname, "../../..");
    const route = readFileSync(join(repositoryRoot, "app/__native-contracts.tsx"), "utf8");
    const runner = readFileSync(join(repositoryRoot, "scripts/run-native-sqlite-contracts.mjs"), "utf8");
    const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(route).toContain("progress-parity");
    expect(route).toContain("runProgressParityContract");
    expect(runner).toContain("PROGRESS_PARITY_CONTRACT_CASES");
    expect(runner).toContain("'progress-parity'");
    expect(runner).toContain("assertProgressParityContractResult");
    expect(packageJson.scripts?.["test:sqlite:progress-parity:device"]).toContain(
      "--suite progress-parity",
    );
    expect(packageJson.scripts?.["test:sqlite:progress-parity:host"]).toContain(
      "progressParity.contract.test.ts",
    );
  });
});

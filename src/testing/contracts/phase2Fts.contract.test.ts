import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  DatabaseSync,
  type SQLInputValue,
} from "node:sqlite";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
  configureSqliteConnection,
} from "../../platform/sqlite/connection";
import {
  createExerciseSearchIndexRepository,
  openExerciseSearchFtsContractRuntime,
} from "../../platform/sqlite/repositories/exerciseSearchIndexRepository";
import {
  createSqliteKernel,
  type SqliteKernel,
  type SqliteKernelTestObserver,
  type SqliteTransactionExecutor,
} from "../../platform/sqlite/sqliteKernel";
import {
  assertPhase2FtsContractResult,
  PHASE2_FTS_CASE_IDS,
  runPhase2FtsContract,
  type Phase2FtsContractAdapter,
} from "./phase2Fts.contract";

jest.mock("expo-sqlite", () => ({
  deleteDatabaseAsync: jest.fn(),
  openDatabaseAsync: jest.fn(),
}));

type MockExpoStatement = Readonly<{
  executeAsync: jest.MockedFunction<
    (...parameters: unknown[]) => Promise<Readonly<{
      changes: number;
      lastInsertRowId: number;
      getAllAsync(): Promise<readonly Record<string, unknown>[]>;
    }>>
  >;
  finalizeAsync: jest.MockedFunction<() => Promise<void>>;
}>;

type MockExpoDatabase = Readonly<{
  closeAsync: jest.MockedFunction<() => Promise<void>>;
  execAsync: jest.MockedFunction<(sql: string) => Promise<void>>;
  isInTransactionAsync: jest.MockedFunction<() => Promise<boolean>>;
  prepareAsync: jest.MockedFunction<(sql: string) => Promise<MockExpoStatement>>;
  statements: MockExpoStatement[];
}>;

const expoSqliteMock = jest.requireMock("expo-sqlite") as {
  deleteDatabaseAsync: jest.MockedFunction<(name: string) => Promise<void>>;
  openDatabaseAsync: jest.MockedFunction<
    (
      name: string,
      options: Readonly<{
        useNewConnection: true;
        finalizeUnusedStatementsBeforeClosing: false;
      }>,
    ) => Promise<MockExpoDatabase>
  >;
};

function createMockExpoDatabase(input: Readonly<{
  failExec?: RegExp;
  failClose?: boolean;
}> = {}): MockExpoDatabase {
  const statements: MockExpoStatement[] = [];
  return {
    statements,
    closeAsync: jest.fn(async () => {
      if (input.failClose) {
        throw new Error("mock_close_failed");
      }
    }),
    execAsync: jest.fn(async (sql: string) => {
      if (input.failExec?.test(sql)) {
        throw new Error("mock_exec_failed");
      }
    }),
    isInTransactionAsync: jest.fn(async () => false),
    prepareAsync: jest.fn(async (sql: string) => {
      const rows = sql === "PRAGMA journal_mode"
        ? [{ journal_mode: "wal" }]
        : sql === "PRAGMA foreign_keys"
          ? [{ foreign_keys: 1 }]
          : sql === "PRAGMA busy_timeout"
            ? [{ timeout: 1_000 }]
            : sql === "SELECT contract_value"
              ? [{ contract_value: "ready" }]
              : [];
      const statement = {
        executeAsync: jest.fn(async () => ({
          changes: 1,
          lastInsertRowId: 2,
          getAllAsync: async () => rows,
        })),
        finalizeAsync: jest.fn(async () => undefined),
      };
      statements.push(statement);
      return statement;
    }),
  };
}

class NodePreparedResult<Row extends Record<string, unknown>>
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

class NodePreparedStatement implements SqlitePreparedStatement {
  constructor(
    private readonly statement: ReturnType<DatabaseSync["prepare"]>,
  ) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly SQLInputValue[] = [],
  ): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) {
      return new NodePreparedResult(
        0,
        0,
        this.statement.all(...parameters) as Row[],
      );
    }
    const result = this.statement.run(...parameters);
    return new NodePreparedResult(
      Number(result.changes),
      Number(result.lastInsertRowid),
      [],
    );
  }

  async finalizeAsync(): Promise<void> {}
}

class NodeSqliteConnection implements SqliteConnection {
  constructor(
    private readonly database: DatabaseSync,
    private readonly closeDatabase = true,
  ) {}

  async execAsync(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    return new NodePreparedStatement(this.database.prepare(sql));
  }

  async isInTransactionAsync(): Promise<boolean> {
    return this.database.isTransaction;
  }

  async closeAsync(): Promise<void> {
    if (this.closeDatabase) {
      this.database.close();
    }
  }
}

function createHostAdapter(): Phase2FtsContractAdapter {
  return {
    async createRuntime(
      _caseId,
      observer: SqliteKernelTestObserver = {},
    ) {
      const directory = mkdtempSync(join(tmpdir(), "gym-phase2-fts-contract-"));
      const databasePath = join(directory, "contract.db");
      const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
      const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
      await configureSqliteConnection(writer, { enableWal: true });
      await configureSqliteConnection(reader, { enableWal: false });
      const kernel = createSqliteKernel({ reader, writer }, observer);
      return {
        kernel,
        async close() {
          await kernel.close();
          rmSync(directory, { force: true, recursive: true });
        },
      };
    },
  };
}

describe("Phase 2 packaged FTS prerequisite", () => {
  beforeEach(() => {
    expoSqliteMock.deleteDatabaseAsync.mockReset();
    expoSqliteMock.openDatabaseAsync.mockReset();
    expoSqliteMock.deleteDatabaseAsync.mockResolvedValue();
  });

  it("exports the exact bounded, parity, integrity, and rebuild cases", () => {
    expect(PHASE2_FTS_CASE_IDS).toEqual([
      "sqlite-fts5-capability",
      "trigram-substring",
      "short-query-relational-bound",
      "punctuation-unicode-bound-match",
      "source-trigger-rollback",
      "stable-id-parity",
      "integrity-check",
      "idempotent-rebuild",
    ]);
  });

  it("runs every shared case against host SQLite without skipped results", async () => {
    const result = await runPhase2FtsContract(createHostAdapter());

    expect(result.cases.filter(({ status }) => status === "failed")).toEqual([]);
    expect(result.status).toBe("passed");
    expect(result.total).toBe(PHASE2_FTS_CASE_IDS.length);
    expect(result.passed).toBe(PHASE2_FTS_CASE_IDS.length);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.cases.map(({ id }) => id)).toEqual(PHASE2_FTS_CASE_IDS);
    expect(() => assertPhase2FtsContractResult(result)).not.toThrow();
  });

  it.each([
    {
      label: "failed",
      patch: { failed: 1, passed: PHASE2_FTS_CASE_IDS.length - 1 },
    },
    {
      label: "skipped",
      patch: { skipped: 1 },
    },
    {
      label: "malformed count",
      patch: { total: PHASE2_FTS_CASE_IDS.length - 1 },
    },
    {
      label: "malformed IDs",
      patch: {
        cases: PHASE2_FTS_CASE_IDS.slice(1).map((id) => ({
          id,
          status: "passed",
          durationMs: 0,
        })),
      },
    },
  ])("rejects $label native result payloads", ({ patch }) => {
    const valid = {
      schemaVersion: 1,
      contractVersion: 1,
      status: "passed",
      total: PHASE2_FTS_CASE_IDS.length,
      passed: PHASE2_FTS_CASE_IDS.length,
      failed: 0,
      skipped: 0,
      cases: PHASE2_FTS_CASE_IDS.map((id) => ({
        id,
        status: "passed",
        durationMs: 0,
      })),
      startedAt: new Date(0).toISOString(),
      finishedAt: new Date(1).toISOString(),
    };

    expect(() => assertPhase2FtsContractResult({
      ...valid,
      ...patch,
    })).toThrow("phase2_fts_contract_result_invalid");
  });

  it("routes phase2-fts with source-derived counts while preserving Phase 1 suites", () => {
    const repositoryRoot = join(__dirname, "../../..");
    const route = readFileSync(
      join(repositoryRoot, "app/__native-contracts.tsx"),
      "utf8",
    );
    const runner = readFileSync(
      join(repositoryRoot, "scripts/run-native-sqlite-contracts.mjs"),
      "utf8",
    );
    const verifier = readFileSync(
      join(repositoryRoot, "scripts/verify-native-evidence.mjs"),
      "utf8",
    );
    const packageJson = JSON.parse(readFileSync(
      join(repositoryRoot, "package.json"),
      "utf8",
    )) as { scripts?: Record<string, string> };
    const deviceCommand = packageJson.scripts?.["test:sqlite:device"] ?? "";

    expect(route).toContain("phase2-fts");
    expect(route).toContain("runPhase2FtsContract");
    expect(route).toContain("sqlite-kernel");
    expect(route).toContain("migrations-effects");
    expect(runner).toContain("PHASE2_FTS_CASE_IDS");
    expect(runner).toContain("assertPhase2FtsContractResult");
    const platformRuntime = readFileSync(
      join(
        repositoryRoot,
        "src/platform/sqlite/repositories/exerciseSearchIndexRepository.ts",
      ),
      "utf8",
    );
    expect(platformRuntime).toContain(
      "finalizeUnusedStatementsBeforeClosing: false",
    );
    expect(verifier).toContain("PHASE2_FTS_CASE_IDS");
    expect(verifier).toContain("phase2-fts");
    expect(deviceCommand).toContain("--suite");
    expect(deviceCommand).toContain("migrations-effects");
    expect(deviceCommand).toContain("sqlite-kernel");
  });

  it("keeps parity and rebuild behind the private serialized kernel writer", () => {
    const calls: string[] = [];
    const kernel: SqliteKernel = {
      async write<Result>(
        command: (
          transaction: SqliteTransactionExecutor,
        ) => Promise<Result>,
      ): Promise<Result> {
        calls.push("write");
        return command({
          async execute(sql: string) {
            calls.push(sql);
            return { changes: 0, lastInsertRowId: 0 };
          },
          async queryAll<Row extends Record<string, unknown>>(sql: string) {
            calls.push(sql);
            if (sql.includes("_docsize")) {
              return [] as Row[];
            }
            return [] as Row[];
          },
        });
      },
      async queryAll() {
        throw new Error("public_reader_must_not_verify_or_rebuild");
      },
      async connectionConfiguration() {
        throw new Error("unused");
      },
      async close() {},
    };
    const repository = createExerciseSearchIndexRepository(kernel);

    return repository.rebuildSearchIndex().then(() => {
      expect(calls[0]).toBe("write");
      expect(calls.join("\n")).toContain("VALUES ('rebuild')");
      expect(calls.join("\n")).toContain("VALUES ('integrity-check', 1)");
    });
  });

  it("reports missing and extra shadow IDs and refuses an incomplete rebuild", async () => {
    const kernel: SqliteKernel = {
      async write<Result>(
        command: (
          transaction: SqliteTransactionExecutor,
        ) => Promise<Result>,
      ): Promise<Result> {
        return command({
          async execute(sql: string) {
            if (sql.includes("integrity-check")) {
              throw new Error("integrity_failed");
            }
            return { changes: 0, lastInsertRowId: 0 };
          },
          async queryAll<Row extends Record<string, unknown>>(sql: string) {
            const rows = sql.includes("COUNT(*)")
              ? [{ count: sql.includes("_docsize") ? 2 : 1 }]
              : sql.includes("WHERE fts_doc.id IS NULL")
                ? [{ id: 11 }]
                : sql.includes("WHERE source.id IS NULL")
                  ? [{ id: 12 }]
                  : [];
            return rows as unknown as Row[];
          },
        });
      },
      async queryAll() {
        throw new Error("unused");
      },
      async connectionConfiguration() {
        throw new Error("unused");
      },
      async close() {},
    };
    const repository = createExerciseSearchIndexRepository(kernel);

    await expect(repository.verifyParity()).resolves.toEqual({
      sourceTermCount: 1,
      indexedTermCount: 2,
      missingSourceTermIds: [11],
      extraIndexedTermIds: [12],
      integrityOk: false,
      exact: false,
    });
    await expect(repository.rebuildSearchIndex()).rejects.toThrow(
      "exercise_search_fts_rebuild_incomplete",
    );
  });

  it("opens FTS contract connections with Expo cleanup disabled and closes them", async () => {
    const writer = createMockExpoDatabase();
    const reader = createMockExpoDatabase();
    expoSqliteMock.openDatabaseAsync
      .mockResolvedValueOnce(writer)
      .mockResolvedValueOnce(reader);

    const runtime = await openExerciseSearchFtsContractRuntime(
      "phase2-fts-wrapper.db",
    );
    await expect(runtime.isWriterInTransaction()).resolves.toBe(false);
    expect(await runtime.kernel.queryAll(
      "SELECT contract_value",
    )).toEqual([{ contract_value: "ready" }]);
    await runtime.kernel.write(async (transaction) => {
      await transaction.execute("INSERT contract_value");
    });
    await expect(runtime.kernel.connectionConfiguration()).resolves.toEqual({
      writer: {
        busyTimeoutMs: 1_000,
        foreignKeys: true,
        journalMode: "wal",
      },
      reader: {
        busyTimeoutMs: 1_000,
        foreignKeys: true,
        journalMode: "wal",
      },
    });
    await runtime.close();

    const openOptions = {
      useNewConnection: true,
      finalizeUnusedStatementsBeforeClosing: false,
    };
    expect(expoSqliteMock.openDatabaseAsync).toHaveBeenNthCalledWith(
      1,
      "phase2-fts-wrapper.db",
      openOptions,
    );
    expect(expoSqliteMock.openDatabaseAsync).toHaveBeenNthCalledWith(
      2,
      "phase2-fts-wrapper.db",
      openOptions,
    );
    expect(writer.statements.every(
      (statement) => statement.finalizeAsync.mock.calls.length === 1,
    )).toBe(true);
    expect(reader.statements.every(
      (statement) => statement.finalizeAsync.mock.calls.length === 1,
    )).toBe(true);
    expect(writer.closeAsync).toHaveBeenCalledTimes(1);
    expect(reader.closeAsync).toHaveBeenCalledTimes(1);
    expect(expoSqliteMock.deleteDatabaseAsync).toHaveBeenCalledTimes(2);
  });

  it("treats post-close contract database deletion as best-effort cleanup", async () => {
    const writer = createMockExpoDatabase();
    const reader = createMockExpoDatabase();
    expoSqliteMock.openDatabaseAsync
      .mockResolvedValueOnce(writer)
      .mockResolvedValueOnce(reader);
    expoSqliteMock.deleteDatabaseAsync
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("mock_delete_failed"));

    const runtime = await openExerciseSearchFtsContractRuntime(
      "phase2-fts-delete-failure.db",
    );

    await expect(runtime.close()).resolves.toBeUndefined();
    expect(writer.closeAsync).toHaveBeenCalledTimes(1);
    expect(reader.closeAsync).toHaveBeenCalledTimes(1);
    expect(expoSqliteMock.deleteDatabaseAsync).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      label: "writer configuration",
      writer: createMockExpoDatabase({
        failExec: /journal_mode/u,
        failClose: true,
      }),
      reader: undefined,
      expectedWriterClose: 1,
      expectedReaderClose: 0,
    },
    {
      label: "reader configuration",
      writer: createMockExpoDatabase({ failClose: true }),
      reader: createMockExpoDatabase({
        failExec: /foreign_keys/u,
        failClose: true,
      }),
      expectedWriterClose: 1,
      expectedReaderClose: 1,
    },
  ])(
    "cleans up after $label failure",
    async ({
      writer,
      reader,
      expectedWriterClose,
      expectedReaderClose,
    }) => {
      expoSqliteMock.deleteDatabaseAsync.mockRejectedValue(
        new Error("mock_delete_failed"),
      );
      expoSqliteMock.openDatabaseAsync.mockResolvedValueOnce(writer);
      if (reader !== undefined) {
        expoSqliteMock.openDatabaseAsync.mockResolvedValueOnce(reader);
      }

      await expect(openExerciseSearchFtsContractRuntime(
        "phase2-fts-failure.db",
      )).rejects.toThrow("mock_exec_failed");
      expect(writer.closeAsync).toHaveBeenCalledTimes(expectedWriterClose);
      expect(reader?.closeAsync.mock.calls.length ?? 0).toBe(
        expectedReaderClose,
      );
      expect(expoSqliteMock.deleteDatabaseAsync).toHaveBeenCalledTimes(2);
    },
  );
});

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  DatabaseSync,
  SQLInputValue,
} from "node:sqlite";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import {
  tmpdir,
} from "node:os";
import {
  join,
} from "node:path";

import {
  SQLITE_BUSY_TIMEOUT_MS,
  SqliteConnection,
  SqlitePreparedResult,
  SqlitePreparedStatement,
  configureSqliteConnection,
  openConfiguredSqliteConnections,
} from "../../src/platform/sqlite/connection";
import {
  SqliteStorageError,
  SqliteStorageErrorCode,
  createSqliteKernel,
  openSqliteKernel,
  openSqliteKernelTestRuntime,
} from "../../src/platform/sqlite/sqliteKernel";
import {
  SQLITE_KERNEL_CONTRACT_CASES,
  SQLITE_KERNEL_CONTRACT_VERSION,
  defineSqliteKernelContract,
  runSqliteKernelContract,
} from "../../src/testing/contracts/sqliteKernel.contract";

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
  prepareAsync: jest.MockedFunction<
    (sql: string) => Promise<MockExpoStatement>
  >;
  statements: MockExpoStatement[];
}>;

const expoSqliteMock = jest.requireMock("expo-sqlite") as {
  openDatabaseAsync: jest.MockedFunction<
    (
      databaseName: string,
      options: Readonly<{ useNewConnection: true }>,
    ) => Promise<MockExpoDatabase>
  >;
};

function createMockExpoDatabase(options: {
  execFailure?: RegExp;
  execFailureMessage?: string;
  closeFailure?: boolean;
  transactionOpen?: boolean;
  rowsBySql?: Readonly<Record<string, readonly Record<string, unknown>[]>>;
} = {}): MockExpoDatabase {
  const statements: MockExpoStatement[] = [];
  return {
    statements,
    execAsync: jest.fn<(sql: string) => Promise<void>>(async (sql) => {
      if (options.execFailure?.test(sql)) {
        throw new Error(options.execFailureMessage ?? "mock exec failed");
      }
    }),
    prepareAsync: jest.fn<(sql: string) => Promise<MockExpoStatement>>(
      async (sql) => {
      const rows = options.rowsBySql?.[sql]
        ?? (sql === "PRAGMA journal_mode"
          ? [{ journal_mode: "wal" }]
          : sql === "PRAGMA foreign_keys"
            ? [{ foreign_keys: 1 }]
            : sql === "PRAGMA busy_timeout"
              ? [{ timeout: SQLITE_BUSY_TIMEOUT_MS }]
              : []);
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
      },
    ),
    isInTransactionAsync: jest.fn<() => Promise<boolean>>(async () => (
      options.transactionOpen ?? false
    )),
    closeAsync: jest.fn<() => Promise<void>>(async () => {
      if (options.closeFailure) {
        throw new Error("mock close failed");
      }
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
    const columns = this.statement.columns();
    if (columns.length > 0) {
      const rows = this.statement.all(...parameters) as Row[];
      return new NodePreparedResult(0, 0, rows);
    }

    const result = this.statement.run(...parameters);
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
      async getAllAsync() {
        return [];
      },
    };
  }

  async finalizeAsync(): Promise<void> {}
}

class NodeSqliteConnection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}

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
    this.database.close();
  }
}

type FakeFailurePoint =
  | "begin"
  | "commit"
  | "finalize"
  | "rollback"
  | "statement";

const statementFailureCases: Array<
  [FakeFailurePoint, SqliteStorageErrorCode]
> = [
  ["statement", "sqlite_transaction_failed"],
  ["commit", "sqlite_commit_failed"],
  ["finalize", "sqlite_statement_finalize_failed"],
];

class FakeSqliteConnection implements SqliteConnection {
  readonly events: string[] = [];
  activeStatements = 0;
  failAt: FakeFailurePoint | undefined;
  failFinalize = false;
  commitGate: Promise<void> | undefined;

  async execAsync(sql: string): Promise<void> {
    this.events.push(sql);
    const normalized = sql.trim().toUpperCase();
    if (normalized === "BEGIN IMMEDIATE" && this.failAt === "begin") {
      throw new Error("begin failed");
    }
    if (normalized === "COMMIT") {
      await this.commitGate;
      if (this.failAt === "commit") {
        throw new Error("commit failed");
      }
    }
    if (normalized === "ROLLBACK" && this.failAt === "rollback") {
      throw new Error("rollback failed");
    }
  }

  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    this.events.push(`prepare:${sql}`);
    this.activeStatements += 1;
    let finalized = false;
    return {
      executeAsync: async <Row extends Record<string, unknown>>() => {
        this.events.push(`execute:${sql}`);
        if (this.failAt === "statement") {
          throw new Error("statement failed");
        }
        return new NodePreparedResult<Row>(1, 1, []);
      },
      finalizeAsync: async () => {
        this.events.push(`finalize:${sql}`);
        if (!finalized) {
          finalized = true;
          this.activeStatements -= 1;
        }
        if (this.failAt === "finalize" || this.failFinalize) {
          throw new Error("finalize failed");
        }
      },
    };
  }

  async isInTransactionAsync(): Promise<boolean> {
    const lastTransactionEvent = this.events.findLast((event) => (
      event === "BEGIN IMMEDIATE"
      || event === "COMMIT"
      || event === "ROLLBACK"
    ));
    return lastTransactionEvent === "BEGIN IMMEDIATE";
  }

  async closeAsync(): Promise<void> {
    this.events.push("close");
  }
}

const temporaryDirectories: string[] = [];

beforeEach(() => {
  expoSqliteMock.openDatabaseAsync.mockReset();
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("Expo SQLite connection adapter", () => {
  it("opens distinct configured connections and finalizes every statement", async () => {
    const writer = createMockExpoDatabase();
    const reader = createMockExpoDatabase();
    expoSqliteMock.openDatabaseAsync
      .mockResolvedValueOnce(writer)
      .mockResolvedValueOnce(reader);

    const connections = await openConfiguredSqliteConnections("adapter.db");
    const kernel = createSqliteKernel(connections);
    try {
      await expect(kernel.connectionConfiguration()).resolves.toEqual({
        writer: {
          busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS,
          foreignKeys: true,
          journalMode: "wal",
        },
        reader: {
          busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS,
          foreignKeys: true,
          journalMode: "wal",
        },
      });
      await expect(
        kernel.write(async (transaction) => transaction.execute(
          "INSERT INTO adapter_probe VALUES (?)",
          ["value"],
        )),
      ).resolves.toEqual({ changes: 1, lastInsertRowId: 2 });
      await expect(
        kernel.queryAll<{ value: string }>("SELECT value FROM adapter_probe"),
      ).resolves.toEqual([]);
    } finally {
      await kernel.close();
    }

    expect(expoSqliteMock.openDatabaseAsync).toHaveBeenNthCalledWith(
      1,
      "adapter.db",
      { useNewConnection: true },
    );
    expect(expoSqliteMock.openDatabaseAsync).toHaveBeenNthCalledWith(
      2,
      "adapter.db",
      { useNewConnection: true },
    );
    expect(writer.statements.every(
      (statement) => statement.finalizeAsync.mock.calls.length === 1,
    )).toBe(true);
    expect(reader.statements.every(
      (statement) => statement.finalizeAsync.mock.calls.length === 1,
    )).toBe(true);
    expect(writer.closeAsync).toHaveBeenCalledTimes(1);
    expect(reader.closeAsync).toHaveBeenCalledTimes(1);
  });

  it("closes both owned connections when reader configuration fails", async () => {
    const writer = createMockExpoDatabase();
    const reader = createMockExpoDatabase({
      execFailure: /foreign_keys/u,
      closeFailure: true,
    });
    expoSqliteMock.openDatabaseAsync
      .mockResolvedValueOnce(writer)
      .mockResolvedValueOnce(reader);

    await expect(
      openConfiguredSqliteConnections("reader-failure.db"),
    ).rejects.toThrow("mock exec failed");
    expect(reader.closeAsync).toHaveBeenCalledTimes(1);
    expect(writer.closeAsync).toHaveBeenCalledTimes(1);
  });

  it("closes the writer when writer configuration fails", async () => {
    const writer = createMockExpoDatabase({
      execFailure: /journal_mode/u,
      closeFailure: true,
    });
    expoSqliteMock.openDatabaseAsync.mockResolvedValueOnce(writer);

    await expect(
      openConfiguredSqliteConnections("writer-failure.db"),
    ).rejects.toThrow("mock exec failed");
    expect(writer.closeAsync).toHaveBeenCalledTimes(1);
  });
});

function createNodeConnections() {
  const directory = mkdtempSync(join(tmpdir(), "gym-sqlite-kernel-"));
  temporaryDirectories.push(directory);
  const databasePath = join(directory, "kernel.sqlite");
  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  return { reader, writer };
}

function openNodeConnection(databasePath: string) {
  return new NodeSqliteConnection(new DatabaseSync(databasePath));
}

async function createConfiguredNodeKernel() {
  const connections = createNodeConnections();
  await configureSqliteConnection(connections.writer, { enableWal: true });
  await configureSqliteConnection(connections.reader, { enableWal: false });
  return {
    ...connections,
    kernel: createSqliteKernel(connections),
  };
}

describe("production SQLite kernel host behavior", () => {
  it("configures writer and reader for WAL, foreign keys, and the bounded timeout", async () => {
    const { kernel } = await createConfiguredNodeKernel();

    try {
      const configuration = await kernel.connectionConfiguration();
      expect(configuration).toEqual({
        writer: {
          busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS,
          foreignKeys: true,
          journalMode: "wal",
        },
        reader: {
          busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS,
          foreignKeys: true,
          journalMode: "wal",
        },
      });
    } finally {
      await kernel.close();
    }
  });

  it("starts and settles concurrent mutations in FIFO order", async () => {
    const { kernel } = await createConfiguredNodeKernel();
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    try {
      await kernel.write(async (transaction) => {
        await transaction.execute(
          "CREATE TABLE queue_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
        );
      });

      const first = kernel.write(async (transaction) => {
        events.push("first:start");
        await firstGate;
        await transaction.execute(
          "INSERT INTO queue_probe (value) VALUES (?)",
          ["first"],
        );
        events.push("first:end");
        return "first";
      });
      const second = kernel.write(async (transaction) => {
        events.push("second:start");
        await transaction.execute(
          "INSERT INTO queue_probe (value) VALUES (?)",
          ["second"],
        );
        events.push("second:end");
        return "second";
      });

      await new Promise((resolve) => setImmediate(resolve));
      expect(events).toEqual(["first:start"]);
      releaseFirst?.();
      await expect(Promise.all([first, second])).resolves.toEqual([
        "first",
        "second",
      ]);
      expect(events).toEqual([
        "first:start",
        "first:end",
        "second:start",
        "second:end",
      ]);
    } finally {
      await kernel.close();
    }
  });

  it("rolls back every statement when a command fails", async () => {
    const { kernel } = await createConfiguredNodeKernel();

    try {
      await kernel.write(async (transaction) => {
        await transaction.execute(
          "CREATE TABLE rollback_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
        );
      });

      await expect(
        kernel.write(async (transaction) => {
          await transaction.execute(
            "INSERT INTO rollback_probe (value) VALUES (?)",
            ["must-rollback"],
          );
          throw new Error("injected command failure");
        }),
      ).rejects.toMatchObject({
        code: "sqlite_transaction_failed",
        retryable: false,
      });
      await expect(
        kernel.queryAll<{ value: string }>(
          "SELECT value FROM rollback_probe",
        ),
      ).resolves.toEqual([]);
    } finally {
      await kernel.close();
    }
  });

  it("keeps readers on committed state while a short write transaction is open", async () => {
    const { kernel } = await createConfiguredNodeKernel();
    let releaseWriter: (() => void) | undefined;
    const writerGate = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });

    try {
      await kernel.write(async (transaction) => {
        await transaction.execute(
          "CREATE TABLE reader_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
        );
      });
      const pendingWrite = kernel.write(async (transaction) => {
        await transaction.execute(
          "INSERT INTO reader_probe (value) VALUES (?)",
          ["pending"],
        );
        await writerGate;
      });

      await new Promise((resolve) => setImmediate(resolve));
      await expect(
        kernel.queryAll<{ value: string }>("SELECT value FROM reader_probe"),
      ).resolves.toEqual([]);
      releaseWriter?.();
      await pendingWrite;
      await expect(
        kernel.queryAll<{ value: string }>("SELECT value FROM reader_probe"),
      ).resolves.toEqual([{ value: "pending" }]);
    } finally {
      await kernel.close();
    }
  });

  it("returns bounded SQLITE_BUSY for competing write intent", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gym-sqlite-kernel-busy-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "kernel.sqlite");
    const writer = openNodeConnection(databasePath);
    const reader = openNodeConnection(databasePath);
    const competing = openNodeConnection(databasePath);
    await configureSqliteConnection(writer, { enableWal: true });
    await configureSqliteConnection(reader, { enableWal: false });
    await configureSqliteConnection(competing, { enableWal: false });
    const kernel = createSqliteKernel({ reader, writer });

    try {
      await kernel.write(async (transaction) => {
        await transaction.execute(
          "CREATE TABLE busy_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
        );
      });
      await writer.execAsync("BEGIN IMMEDIATE");
      const startedAt = Date.now();

      await expect(competing.execAsync("BEGIN IMMEDIATE")).rejects.toThrow(
        /busy|locked/i,
      );
      expect(Date.now() - startedAt).toBeLessThan(SQLITE_BUSY_TIMEOUT_MS + 750);
      await writer.execAsync("ROLLBACK");
    } finally {
      await competing.closeAsync();
      await kernel.close();
    }
  });
});

describe("serialized writer failure behavior", () => {
  it("does not resolve authoritative state until COMMIT settles", async () => {
    const writer = new FakeSqliteConnection();
    const reader = new FakeSqliteConnection();
    let releaseCommit: (() => void) | undefined;
    writer.commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const kernel = createSqliteKernel({ reader, writer });
    let settled = false;

    const command = kernel.write(async (transaction) => {
      await transaction.execute("INSERT INTO source_fact VALUES (?)", ["fact"]);
      await transaction.queryAll("SELECT 1");
      return { revision: 7 };
    });
    command.finally(() => {
      settled = true;
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(writer.events).toContain("COMMIT");
    expect(settled).toBe(false);
    releaseCommit?.();
    await expect(command).resolves.toEqual({ revision: 7 });
    expect(settled).toBe(true);
  });

  it.each(statementFailureCases)(
    "finalizes prepared statements when %s fails",
    async (failurePoint, expectedCode) => {
      const writer = new FakeSqliteConnection();
      const kernel = createSqliteKernel({
        reader: new FakeSqliteConnection(),
        writer,
      });
      writer.failAt = failurePoint;

      await expect(
        kernel.write(async (transaction) => {
          await transaction.execute("INSERT INTO probe VALUES (?)", [1]);
          return "must-not-resolve";
        }),
      ).rejects.toMatchObject({
        code: expectedCode,
      } satisfies Partial<SqliteStorageError>);
      expect(writer.events).toContain("finalize:INSERT INTO probe VALUES (?)");
      expect(writer.activeStatements).toBe(0);
    },
  );

  it("reports rollback failure after preserving the original transaction failure", async () => {
    const writer = new FakeSqliteConnection();
    const kernel = createSqliteKernel({
      reader: new FakeSqliteConnection(),
      writer,
    });
    writer.failAt = "rollback";

    await expect(
      kernel.write(async (transaction) => {
        await transaction.execute("INSERT INTO probe VALUES (?)", [1]);
        throw new Error("command failed");
      }),
    ).rejects.toMatchObject({
      code: "sqlite_rollback_failed",
    } satisfies Partial<SqliteStorageError>);
    expect(writer.events).toEqual([
      "BEGIN IMMEDIATE",
      "prepare:INSERT INTO probe VALUES (?)",
      "execute:INSERT INTO probe VALUES (?)",
      "finalize:INSERT INTO probe VALUES (?)",
      "ROLLBACK",
    ]);
    expect(writer.activeStatements).toBe(0);
  });

  it("preserves the operation failure when statement finalization also fails", async () => {
    const writer = new FakeSqliteConnection();
    const kernel = createSqliteKernel({
      reader: new FakeSqliteConnection(),
      writer,
    });
    writer.failAt = "statement";
    writer.failFinalize = true;

    await expect(
      kernel.write(async (transaction) => {
        await transaction.execute("INSERT INTO probe VALUES (?)", [1]);
      }),
    ).rejects.toMatchObject({
      code: "sqlite_transaction_failed",
    } satisfies Partial<SqliteStorageError>);
    expect(
      writer.events.filter(
        (event) => event === "finalize:INSERT INTO probe VALUES (?)",
      ),
    ).toHaveLength(1);
    expect(writer.events).toContain("ROLLBACK");
    expect(writer.activeStatements).toBe(0);
  });

  it("reports begin failure without entering or leaking a transaction", async () => {
    const writer = new FakeSqliteConnection();
    const kernel = createSqliteKernel({
      reader: new FakeSqliteConnection(),
      writer,
    });
    writer.failAt = "begin";

    await expect(
      kernel.write(async () => "must-not-run"),
    ).rejects.toMatchObject({
      code: "sqlite_begin_failed",
    } satisfies Partial<SqliteStorageError>);
    expect(writer.events).toEqual(["BEGIN IMMEDIATE"]);
    expect(writer.activeStatements).toBe(0);
  });

  it("maps reader statement, finalization, configuration, and close failures", async () => {
    const readerStatementFailure = new FakeSqliteConnection();
    readerStatementFailure.failAt = "statement";
    const statementKernel = createSqliteKernel({
      reader: readerStatementFailure,
      writer: new FakeSqliteConnection(),
    });
    await expect(
      statementKernel.queryAll("SELECT 1"),
    ).rejects.toMatchObject({
      code: "sqlite_query_failed",
    } satisfies Partial<SqliteStorageError>);

    const readerFinalizeFailure = new FakeSqliteConnection();
    readerFinalizeFailure.failAt = "finalize";
    const finalizeKernel = createSqliteKernel({
      reader: readerFinalizeFailure,
      writer: new FakeSqliteConnection(),
    });
    await expect(
      finalizeKernel.queryAll("SELECT 1"),
    ).rejects.toMatchObject({
      code: "sqlite_statement_finalize_failed",
    } satisfies Partial<SqliteStorageError>);

    const configurationFailure = new FakeSqliteConnection();
    configurationFailure.failAt = "statement";
    const configurationKernel = createSqliteKernel({
      reader: configurationFailure,
      writer: new FakeSqliteConnection(),
    });
    await expect(
      configurationKernel.connectionConfiguration(),
    ).rejects.toMatchObject({
      code: "sqlite_query_failed",
    } satisfies Partial<SqliteStorageError>);

    const closeFailure: SqliteConnection = {
      ...new FakeSqliteConnection(),
      execAsync: async () => undefined,
      prepareAsync: async () => new FakeSqliteConnection().prepareAsync("SELECT 1"),
      isInTransactionAsync: async () => false,
      closeAsync: async () => {
        throw new Error("close failed");
      },
    };
    const closeKernel = createSqliteKernel({
      reader: closeFailure,
      writer: new FakeSqliteConnection(),
    });
    await expect(closeKernel.close()).rejects.toMatchObject({
      code: "sqlite_query_failed",
    } satisfies Partial<SqliteStorageError>);
  });

  it("closes owned reader and writer connections sequentially", async () => {
    let releaseReader: (() => void) | undefined;
    const reader = new FakeSqliteConnection();
    const writer = new FakeSqliteConnection();
    reader.closeAsync = jest.fn(() =>
      new Promise<void>((resolve) => {
        releaseReader = resolve;
      })
    );
    writer.closeAsync = jest.fn(async () => undefined);
    const kernel = createSqliteKernel({ reader, writer });

    const closing = kernel.close();
    await Promise.resolve();

    expect(reader.closeAsync).toHaveBeenCalledTimes(1);
    expect(writer.closeAsync).not.toHaveBeenCalled();

    releaseReader?.();
    await closing;

    expect(writer.closeAsync).toHaveBeenCalledTimes(1);
  });
});

describe("shared ten-case SQLite kernel contract", () => {
  it("publishes the exact reviewed contract case list", () => {
    const contract = defineSqliteKernelContract();

    expect(contract.version).toBe(SQLITE_KERNEL_CONTRACT_VERSION);
    expect(contract.cases).toEqual(SQLITE_KERNEL_CONTRACT_CASES);
    expect(contract.cases).toEqual([
      "connection-configuration",
      "foreign-key-enforcement",
      "fifo-write-serialization",
      "bounded-write-contention",
      "reader-committed-isolation",
      "rollback-fixture-matrix",
      "commit-latch",
      "duplicate-idempotency",
      "prepared-statement-cleanup",
      "private-boundary",
    ]);
    expect(contract.cases).toHaveLength(10);
  });

  it("runs all ten cases against the production kernel shape", async () => {
    const result = await runSqliteKernelContract({
      async createRuntime(caseId, observer) {
        const directory = mkdtempSync(join(tmpdir(), `gym-contract-${caseId}-`));
        temporaryDirectories.push(directory);
        const databasePath = join(directory, "kernel.sqlite");
        const writer = openNodeConnection(databasePath);
        const reader = openNodeConnection(databasePath);
        await configureSqliteConnection(writer, { enableWal: true });
        await configureSqliteConnection(reader, { enableWal: false });
        const kernel = createSqliteKernel({ reader, writer }, observer);

        return {
          kernel,
          async competeForWriteIntent() {
            const competing = openNodeConnection(databasePath);
            await configureSqliteConnection(competing, { enableWal: false });
            const startedAt = Date.now();
            try {
              await competing.execAsync("BEGIN IMMEDIATE");
              await competing.execAsync("ROLLBACK");
              return {
                code: "unexpected_success",
                durationMs: Date.now() - startedAt,
              };
            } catch (error) {
              return {
                code: /busy|locked/i.test(String(error))
                  ? "sqlite_busy"
                  : "unexpected_error",
                durationMs: Date.now() - startedAt,
              };
            } finally {
              await competing.closeAsync();
            }
          },
          isWriterInTransaction: () => writer.isInTransactionAsync(),
          close: () => kernel.close(),
        };
      },
    });

    expect(
      result.cases.filter((contractCase) => contractCase.status === "failed"),
    ).toEqual([]);
    expect(result.status).toBe("passed");
    expect(result.total).toBe(10);
    expect(result.passed).toBe(10);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.cases).toHaveLength(10);
    expect(result.cases.every((contractCase) => (
      contractCase.status === "passed"
    ))).toBe(true);
  });

  it("declares the native build, runner, verifier, and guarded route", () => {
    const repositoryRoot = join(__dirname, "../..");
    const packageJson = JSON.parse(
      readFileSync(join(repositoryRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toEqual(expect.objectContaining({
      "android:devtest:fresh": "sh scripts/build-current-native-test-apk.sh",
      "test:sqlite:device": expect.stringContaining(
        "node scripts/run-native-sqlite-contracts.mjs",
      ),
      "verify:native:evidence": "node scripts/verify-native-evidence.mjs",
    }));

    for (const relativePath of [
      "app/__native-contracts.tsx",
      "scripts/run-native-sqlite-contracts.mjs",
      "scripts/build-current-native-test-apk.sh",
      "scripts/verify-native-evidence.mjs",
    ]) {
      expect(existsSync(join(repositoryRoot, relativePath))).toBe(true);
    }

    const route = readFileSync(
      join(repositoryRoot, "app/__native-contracts.tsx"),
      "utf8",
    );
    const nativeRunner = readFileSync(
      join(repositoryRoot, "scripts/run-native-sqlite-contracts.mjs"),
      "utf8",
    );
    expect(route).toContain("nativeContractsEnabled");
    expect(route).toContain("GYM_TRACKER_SQLITE_CONTRACT_RESULT:");
    expect(route).not.toMatch(/from\s+["'][^"']*platform\/sqlite/);
    expect(nativeRunner).toContain("logcat");
    expect(nativeRunner).not.toContain("uiautomator");
    expect(nativeRunner).toContain("timeoutMs");
    expect(nativeRunner).toContain("'force-stop'");
    expect(nativeRunner.indexOf("'force-stop'")).toBeLessThan(
      nativeRunner.indexOf("'android.intent.action.VIEW'"),
    );
    expect(nativeRunner).toContain("manifest.build_variant !== 'release'");
    expect(nativeRunner).toContain("manifest.js_bundle?.embedded !== true");
    expect(nativeRunner).not.toContain("'expo',\n      'start'");
    expect(nativeRunner).not.toContain("restoreSourceFiles");
  });
});

describe("Expo SQLite native contract runtime seam", () => {
  it.each([
    ["database is locked", "sqlite_busy"],
    ["unexpected native error", "unexpected_error"],
  ])(
    "classifies competing write failure %s as %s",
    async (message, expectedCode) => {
      const writer = createMockExpoDatabase();
      const reader = createMockExpoDatabase();
      const competing = createMockExpoDatabase({
        execFailure: /BEGIN IMMEDIATE/u,
        execFailureMessage: message,
      });
      expoSqliteMock.openDatabaseAsync
        .mockResolvedValueOnce(writer)
        .mockResolvedValueOnce(reader)
        .mockResolvedValueOnce(competing);

      const runtime = await openSqliteKernelTestRuntime("runtime.db");
      try {
        await expect(runtime.competeForWriteIntent()).resolves.toMatchObject({
          code: expectedCode,
        });
        await expect(runtime.isWriterInTransaction()).resolves.toBe(false);
      } finally {
        await runtime.close();
      }
      expect(competing.closeAsync).toHaveBeenCalledTimes(1);
    },
  );

  it("reports unexpected competing write success after rolling it back", async () => {
    const writer = createMockExpoDatabase();
    const reader = createMockExpoDatabase();
    const competing = createMockExpoDatabase();
    expoSqliteMock.openDatabaseAsync
      .mockResolvedValueOnce(writer)
      .mockResolvedValueOnce(reader)
      .mockResolvedValueOnce(competing);

    const runtime = await openSqliteKernelTestRuntime("runtime-success.db");
    try {
      await expect(runtime.competeForWriteIntent()).resolves.toMatchObject({
        code: "unexpected_success",
      });
    } finally {
      await runtime.close();
    }
    expect(competing.execAsync).toHaveBeenCalledWith("ROLLBACK");
    expect(competing.closeAsync).toHaveBeenCalledTimes(1);
  });

  it("opens the public production kernel through configured connections", async () => {
    const writer = createMockExpoDatabase();
    const reader = createMockExpoDatabase();
    expoSqliteMock.openDatabaseAsync
      .mockResolvedValueOnce(writer)
      .mockResolvedValueOnce(reader);

    const kernel = await openSqliteKernel("public.db");
    await expect(kernel.connectionConfiguration()).resolves.toMatchObject({
      writer: { journalMode: "wal" },
      reader: { journalMode: "wal" },
    });
    await kernel.close();
  });
});

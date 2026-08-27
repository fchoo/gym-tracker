export const SQLITE_KERNEL_CONTRACT_VERSION = 1 as const;

import {
  SQLITE_BUSY_TIMEOUT_MS,
} from "../../platform/sqlite";
import * as publicSqliteSurface from "../../platform/sqlite";
import {
  SqliteKernel,
  SqliteKernelTestRuntime,
  SqliteKernelTestObserver,
  openSqliteKernelTestRuntime,
} from "../../platform/sqlite/sqliteKernel";

export const SQLITE_KERNEL_CONTRACT_CASES = [
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
] as const;

export type SqliteKernelContractCaseId =
  (typeof SQLITE_KERNEL_CONTRACT_CASES)[number];

export type SqliteKernelContract = Readonly<{
  version: typeof SQLITE_KERNEL_CONTRACT_VERSION;
  cases: typeof SQLITE_KERNEL_CONTRACT_CASES;
}>;

export function defineSqliteKernelContract(): SqliteKernelContract {
  return {
    version: SQLITE_KERNEL_CONTRACT_VERSION,
    cases: SQLITE_KERNEL_CONTRACT_CASES,
  };
}

export type SqliteContentionResult = Readonly<{
  code: "sqlite_busy" | "unexpected_error" | "unexpected_success";
  durationMs: number;
}>;

export interface SqliteKernelContractRuntime {
  kernel: SqliteKernel;
  competeForWriteIntent(): Promise<SqliteContentionResult>;
  isWriterInTransaction(): Promise<boolean>;
  close(): Promise<void>;
}

export async function createExpoSqliteContractAdapter(
  runId: string,
  onCaseStart?: (caseId: SqliteKernelContractCaseId) => void,
): Promise<SqliteKernelContractAdapter> {
  const { deleteDatabaseAsync } = require("expo-sqlite") as typeof import("expo-sqlite");
  return {
    ...(onCaseStart === undefined ? {} : { onCaseStart }),
    async createRuntime(caseId, observer) {
      const databaseName = `sqlite-contract-${runId}-${caseId}.db`;
      await deleteDatabaseAsync(databaseName).catch(() => undefined);
      const runtime: SqliteKernelTestRuntime = await openSqliteKernelTestRuntime(
        databaseName,
        observer,
      );
      return {
        ...runtime,
        async close() {
          await runtime.close();
          await deleteDatabaseAsync(databaseName).catch(() => undefined);
        },
      };
    },
  };
}

export interface SqliteKernelContractAdapter {
  onCaseStart?(caseId: SqliteKernelContractCaseId): void;
  createRuntime(
    caseId: SqliteKernelContractCaseId,
    observer: SqliteKernelTestObserver,
  ): Promise<SqliteKernelContractRuntime>;
}

export type SqliteKernelContractCaseResult = Readonly<{
  id: SqliteKernelContractCaseId;
  status: "passed" | "failed";
  durationMs: number;
  errorCode?: string;
}>;

export type SqliteKernelContractResult = Readonly<{
  schemaVersion: 1;
  contractVersion: typeof SQLITE_KERNEL_CONTRACT_VERSION;
  status: "passed" | "failed";
  total: number;
  passed: number;
  failed: number;
  skipped: 0;
  cases: readonly SqliteKernelContractCaseResult[];
  startedAt: string;
  finishedAt: string;
}>;

type ContractCase = (
  runtime: SqliteKernelContractRuntime,
) => Promise<void>;

const FIXTURE_TABLES = [
  "source_facts",
  "pending_effects",
  "subject_revisions",
  "active_pointer",
  "rest_state",
] as const;

const FIXTURE_INSERTS = [
  [
    "INSERT INTO source_facts (id, value) VALUES (?, ?)",
    ["source-1", "value-1"],
  ],
  [
    "INSERT INTO pending_effects (id, idempotency_key) VALUES (?, ?)",
    ["effect-1", "effect-key-1"],
  ],
  [
    "INSERT INTO subject_revisions (subject_id, revision) VALUES (?, ?)",
    ["subject-1", 1],
  ],
  [
    "INSERT INTO active_pointer (singleton, source_id) VALUES (?, ?)",
    [1, "source-1"],
  ],
  [
    "INSERT INTO rest_state (session_id, status) VALUES (?, ?)",
    ["session-1", "running"],
  ],
  [
    "PRAGMA user_version = 7",
    [],
  ],
] as const;

function invariant(value: unknown, code: string): asserts value {
  if (!value) {
    throw new Error(code);
  }
}

function errorCode(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
  ) {
    return error.code.slice(0, 80);
  }
  if (error instanceof Error && /^[a-z0-9_:-]{3,80}$/iu.test(error.message)) {
    return error.message;
  }
  return "sqlite_contract_failed";
}

async function waitFor(
  predicate: () => boolean,
  code: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(code);
}

async function waitForAsync(
  predicate: () => Promise<boolean>,
  code: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(code);
}

async function createFixtureSchema(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "CREATE TABLE source_facts (id TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    await transaction.execute(
      "CREATE TABLE pending_effects (id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE)",
    );
    await transaction.execute(
      "CREATE TABLE subject_revisions (subject_id TEXT PRIMARY KEY, revision INTEGER NOT NULL)",
    );
    await transaction.execute(
      "CREATE TABLE active_pointer (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), source_id TEXT NOT NULL)",
    );
    await transaction.execute(
      "CREATE TABLE rest_state (session_id TEXT PRIMARY KEY, status TEXT NOT NULL)",
    );
  });
}

async function assertFixtureEmpty(kernel: SqliteKernel): Promise<void> {
  for (const table of FIXTURE_TABLES) {
    const [row] = await kernel.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${table}`,
    );
    invariant(row?.count === 0, `rollback_leaked_${table}`);
  }
  const [version] = await kernel.queryAll<{ user_version: number }>(
    "PRAGMA user_version",
  );
  invariant(version?.user_version === 0, "rollback_leaked_user_version");
}

const contractCases: Record<SqliteKernelContractCaseId, ContractCase> = {
  async "connection-configuration"({ kernel }) {
    const configuration = await kernel.connectionConfiguration();
    for (const connection of [configuration.writer, configuration.reader]) {
      invariant(connection.journalMode === "wal", "journal_mode_not_wal");
      invariant(connection.foreignKeys, "foreign_keys_disabled");
      invariant(
        connection.busyTimeoutMs === SQLITE_BUSY_TIMEOUT_MS,
        "busy_timeout_mismatch",
      );
    }
  },

  async "foreign-key-enforcement"({ kernel }) {
    await kernel.write(async (transaction) => {
      await transaction.execute(
        "CREATE TABLE parent_rows (id TEXT PRIMARY KEY)",
      );
      await transaction.execute(
        "CREATE TABLE child_rows (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parent_rows(id))",
      );
    });
    let rejected = false;
    try {
      await kernel.write(async (transaction) => {
        await transaction.execute(
          "INSERT INTO child_rows (id, parent_id) VALUES (?, ?)",
          ["child-1", "missing-parent"],
        );
      });
    } catch {
      rejected = true;
    }
    invariant(rejected, "foreign_key_write_succeeded");
    const [row] = await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM child_rows",
    );
    invariant(row?.count === 0, "foreign_key_row_leaked");
  },

  async "fifo-write-serialization"({ kernel }) {
    await kernel.write(async (transaction) => {
      await transaction.execute(
        "CREATE TABLE fifo_probe (id INTEGER PRIMARY KEY, label TEXT NOT NULL)",
      );
    });
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = kernel.write(async (transaction) => {
      events.push("first:start");
      await firstGate;
      await transaction.execute(
        "INSERT INTO fifo_probe (label) VALUES (?)",
        ["first"],
      );
      events.push("first:end");
      return "first";
    });
    const second = kernel.write(async (transaction) => {
      events.push("second:start");
      await transaction.execute(
        "INSERT INTO fifo_probe (label) VALUES (?)",
        ["second"],
      );
      events.push("second:end");
      return "second";
    });
    try {
      await waitFor(() => events.length === 1, "fifo_first_did_not_start");
      invariant(events[0] === "first:start", "fifo_first_not_first");
    } finally {
      releaseFirst?.();
    }
    const values = await Promise.all([first, second]);
    invariant(values.join(",") === "first,second", "fifo_result_order");
    invariant(
      events.join(",") === "first:start,first:end,second:start,second:end",
      "fifo_execution_order",
    );
  },

  async "bounded-write-contention"(runtime) {
    await runtime.kernel.write(async (transaction) => {
      await transaction.execute(
        "CREATE TABLE contention_probe (id INTEGER PRIMARY KEY)",
      );
    });
    let releaseWriter: (() => void) | undefined;
    const writerGate = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    const pendingWrite = runtime.kernel.write(async (transaction) => {
      await transaction.execute(
        "INSERT INTO contention_probe DEFAULT VALUES",
      );
      await writerGate;
    });
    try {
      await waitForAsync(
        () => runtime.isWriterInTransaction(),
        "writer_transaction_not_open",
      );
      const contention = await runtime.competeForWriteIntent();
      invariant(contention.code === "sqlite_busy", "contention_not_busy");
      invariant(
        contention.durationMs <= SQLITE_BUSY_TIMEOUT_MS + 750,
        "contention_not_bounded",
      );
    } finally {
      releaseWriter?.();
      await pendingWrite.catch(() => undefined);
    }
  },

  async "reader-committed-isolation"({ kernel }) {
    await kernel.write(async (transaction) => {
      await transaction.execute(
        "CREATE TABLE isolation_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
      );
    });
    let inserted = false;
    let releaseWriter: (() => void) | undefined;
    const writerGate = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    const pendingWrite = kernel.write(async (transaction) => {
      await transaction.execute(
        "INSERT INTO isolation_probe (value) VALUES (?)",
        ["pending"],
      );
      inserted = true;
      await writerGate;
    });
    try {
      await waitFor(() => inserted, "isolation_write_not_started");
      const beforeCommit = await kernel.queryAll<{ value: string }>(
        "SELECT value FROM isolation_probe",
      );
      invariant(beforeCommit.length === 0, "reader_saw_uncommitted_row");
    } finally {
      releaseWriter?.();
    }
    await pendingWrite;
    const afterCommit = await kernel.queryAll<{ value: string }>(
      "SELECT value FROM isolation_probe",
    );
    invariant(
      afterCommit.length === 1 && afterCommit[0]?.value === "pending",
      "reader_missed_committed_row",
    );
  },

  async "rollback-fixture-matrix"({ kernel }) {
    await createFixtureSchema(kernel);
    for (
      let injectionPoint = 0;
      injectionPoint <= FIXTURE_INSERTS.length * 2;
      injectionPoint += 1
    ) {
      let step = 0;
      try {
        await kernel.write(async (transaction) => {
          for (const [sql, parameters] of FIXTURE_INSERTS) {
            if (step === injectionPoint) {
              throw new Error("injected_before_statement");
            }
            step += 1;
            await transaction.execute(sql, parameters);
            if (step === injectionPoint) {
              throw new Error("injected_after_statement");
            }
            step += 1;
          }
          throw new Error("injected_after_fixture_matrix");
        });
      } catch {
        await assertFixtureEmpty(kernel);
      }
    }
  },

  async "commit-latch"({ kernel }) {
    let callbackReturned = false;
    let commandSettled = false;
    const command = kernel.write(async (transaction) => {
      await transaction.execute(
        "CREATE TABLE commit_latch_probe (id INTEGER PRIMARY KEY)",
      );
      callbackReturned = true;
      return { revision: 1 };
    });
    command.then(
      () => {
        commandSettled = true;
      },
      () => {
        commandSettled = true;
      },
    );
    await waitFor(() => callbackReturned, "commit_callback_not_returned");
    invariant(!commandSettled, "command_resolved_before_commit");
    const committed = await command;
    invariant(committed.revision === 1, "committed_state_mismatch");
  },

  async "duplicate-idempotency"({ kernel }) {
    await kernel.write(async (transaction) => {
      await transaction.execute(
        "CREATE TABLE completed_sets (id TEXT PRIMARY KEY, source_revision INTEGER NOT NULL)",
      );
      await transaction.execute(
        "CREATE TABLE duplicate_effects (id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE)",
      );
    });
    async function completeSet() {
      return kernel.write(async (transaction) => {
        const inserted = await transaction.execute(
          "INSERT OR IGNORE INTO completed_sets (id, source_revision) VALUES (?, ?)",
          ["set-1", 1],
        );
        if (inserted.changes === 1) {
          await transaction.execute(
            "INSERT INTO duplicate_effects (id, idempotency_key) VALUES (?, ?)",
            ["effect-1", "complete:set-1"],
          );
        }
        const [row] = await transaction.queryAll<{
          id: string;
          source_revision: number;
        }>(
          "SELECT id, source_revision FROM completed_sets WHERE id = ?",
          ["set-1"],
        );
        invariant(row !== undefined, "duplicate_missing_committed_state");
        return row;
      });
    }
    const [first, second] = await Promise.all([completeSet(), completeSet()]);
    invariant(first.id === second.id, "duplicate_state_mismatch");
    const [sets] = await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM completed_sets",
    );
    const [effects] = await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM duplicate_effects",
    );
    invariant(sets?.count === 1, "duplicate_source_rows");
    invariant(effects?.count === 1, "duplicate_effect_rows");
  },

  async "prepared-statement-cleanup"(runtime) {
    await runtime.kernel.write(async (transaction) => {
      await transaction.execute(
        "CREATE TABLE cleanup_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
      );
    });
    for (let iteration = 0; iteration < 25; iteration += 1) {
      try {
        await runtime.kernel.write(async (transaction) => {
          await transaction.execute(
            "INSERT INTO cleanup_probe (value) VALUES (?)",
            [`value-${iteration}`],
          );
          if (iteration % 2 === 0) {
            throw new Error("injected_cleanup_failure");
          }
        });
      } catch {
        invariant(
          !(await runtime.isWriterInTransaction()),
          "cleanup_transaction_leaked",
        );
      }
      await runtime.kernel.queryAll<{ count: number }>(
        "SELECT COUNT(*) AS count FROM cleanup_probe",
      );
    }
    invariant(
      !(await runtime.isWriterInTransaction()),
      "cleanup_final_transaction_leaked",
    );
  },

  async "private-boundary"() {
    for (const forbidden of [
      "createSqliteKernel",
      "openConfiguredSqliteConnections",
      "SerializedWriteExecutor",
    ]) {
      invariant(
        !(forbidden in publicSqliteSurface),
        "raw_sqlite_surface_exported",
      );
    }
  },
};

export async function runSqliteKernelContract(
  adapter: SqliteKernelContractAdapter,
): Promise<SqliteKernelContractResult> {
  const startedAt = new Date().toISOString();
  const results: SqliteKernelContractCaseResult[] = [];

  for (const caseId of SQLITE_KERNEL_CONTRACT_CASES) {
    adapter.onCaseStart?.(caseId);
    const caseStartedAt = Date.now();
    let releaseCommit: (() => void) | undefined;
    let commitReached = false;
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const observer: SqliteKernelTestObserver = caseId === "commit-latch"
      ? {
          async beforeCommit() {
            commitReached = true;
            await commitGate;
          },
        }
      : {};
    let runtime: SqliteKernelContractRuntime | undefined;

    try {
      runtime = await adapter.createRuntime(caseId, observer);
      const execution = contractCases[caseId](runtime);
      if (caseId === "commit-latch") {
        await waitFor(() => commitReached, "commit_hook_not_reached");
        await new Promise((resolve) => setTimeout(resolve, 20));
        releaseCommit?.();
      }
      await execution;
      results.push({
        id: caseId,
        status: "passed",
        durationMs: Date.now() - caseStartedAt,
      });
    } catch (error) {
      releaseCommit?.();
      results.push({
        id: caseId,
        status: "failed",
        durationMs: Date.now() - caseStartedAt,
        errorCode: errorCode(error),
      });
    } finally {
      if (runtime !== undefined) {
        try {
          await runtime.close();
        } catch (error) {
          const lastResult = results.at(-1);
          if (lastResult?.id === caseId && lastResult.status === "passed") {
            results[results.length - 1] = {
              id: caseId,
              status: "failed",
              durationMs: Date.now() - caseStartedAt,
              errorCode: errorCode(error),
            };
          }
        }
      }
    }
  }

  const passed = results.filter((result) => result.status === "passed").length;
  const failed = results.length - passed;
  return {
    schemaVersion: 1,
    contractVersion: SQLITE_KERNEL_CONTRACT_VERSION,
    status: failed === 0 ? "passed" : "failed",
    total: results.length,
    passed,
    failed,
    skipped: 0,
    cases: results,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { configureSqliteConnection, type SqliteConnection, type SqlitePreparedStatement } from "../../platform/sqlite/connection";
import { createSqliteKernel, type SqliteKernel } from "../../platform/sqlite/sqliteKernel";
import * as migrationContracts from "./migrationsEffects.contract";
import * as portableContracts from "./portableMerge.contract";
import {
  MULTI_PLAN_RUNNING_CONTRACT_CASES,
  PHASE13_STATEMENT_FAILURE_CUT,
  createExpoMultiPlanRunningContractAdapter,
  runMultiPlanRunningContract,
  runMultiPlanRunningContractOnKernel,
} from "./multiPlanRunning.contract";

class Connection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}
  async execAsync(sql: string): Promise<void> { this.database.exec(sql); }
  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    const statement = this.database.prepare(sql);
    return {
      async executeAsync(parameters = []) {
        const rows = statement.columns().length > 0 ? statement.all(...parameters) : undefined;
        const result = rows === undefined ? statement.run(...parameters) : undefined;
        return { changes: Number(result?.changes ?? 0), lastInsertRowId: Number(result?.lastInsertRowid ?? 0), getAllAsync: async () => rows ?? [] } as never;
      },
      finalizeAsync: async () => undefined,
    };
  }
  async isInTransactionAsync(): Promise<boolean> { return this.database.isTransaction; }
  async closeAsync(): Promise<void> { this.database.close(); }
}

const directories = new Set<string>();
const kernels = new Set<SqliteKernel>();
afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  kernels.clear();
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  directories.clear();
});

function hostBase(events: string[]): migrationContracts.MigrationsEffectsContractAdapter {
  const directory = mkdtempSync(join(tmpdir(), "gym-native-progress-adapter-"));
  directories.add(directory);
  const paths = new Map<string, string>();
  return {
    async createRuntime(key, observer = {}) {
      events.push(`open:${key}`);
      const path = paths.get(key) ?? join(directory, `${paths.size}.db`);
      paths.set(key, path);
      const writer = new Connection(new DatabaseSync(path));
      const reader = new Connection(new DatabaseSync(path));
      await configureSqliteConnection(writer, { enableWal: true });
      await configureSqliteConnection(reader, { enableWal: false });
      const baseKernel = createSqliteKernel({ reader, writer }, observer);
      kernels.add(baseKernel);
      const kernel: SqliteKernel = {
        ...baseKernel,
        queryAll: async (...args) => {
          events.push(`query:${key}:${args[0] === "PRAGMA user_version" ? "version" : "tables"}`);
          return baseKernel.queryAll(...args);
        },
      };
      return { databaseName: key, kernel, close: async () => { await baseKernel.close(); kernels.delete(baseKernel); events.push(`close:${key}`); } };
    },
    recoveryBackup: { createAndValidate: async (request) => ({ backupId: "host", ...request, validated: true }) },
    insertForeignKeyViolation: async () => { throw new Error("not_used"); },
    cleanup: async () => { events.push("cleanup"); },
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => { resolve = finish; });
  return { promise, resolve };
}

describe("multi-plan Running lifecycle contract", () => {
  it("executes the actual Expo three-cut adapter against SQLite and waits for close before reopen", async () => {
    const events: string[] = [];
    const base = hostBase(events);
    const entered = deferred();
    const release = deferred();
    let opens = 0;
    jest.spyOn(migrationContracts, "createExpoMigrationsEffectsContractAdapter").mockResolvedValue({
      ...base,
      createRuntime: async (...args) => {
        const runtime = await base.createRuntime(...args);
        opens += 1;
        const first = opens === 1;
        return { ...runtime, close: async () => {
          if (first) { entered.resolve(); await release.promise; }
          await runtime.close();
        } };
      },
    });
    const adapter = await createExpoMultiPlanRunningContractAdapter("finite-cuts", (stage) => {
      events.push(stage);
      throw new Error("observer_failed");
    });
    const pending = adapter.runCase("phase13-migration-failure-cuts");
    await entered.promise;
    expect(opens).toBe(1);
    expect(events.at(-1)).toBe("cut-statement:close:start");
    expect(events).not.toContain("cut-statement:close:done");
    expect(events).not.toContain("cut-statement:reopen:start");
    release.resolve();
    await expect(pending).resolves.toBeUndefined();
    expect(opens).toBe(6);
    expect(events.filter((event) => event.startsWith("close:"))).toHaveLength(6);
    expect(events.filter((event) => event.startsWith("cut-"))).toEqual(
      ["statement", "verify", "commit"].flatMap((cut) => [
        `cut-${cut}:open:start`, `cut-${cut}:open:done`,
        `cut-${cut}:migration:start`, `cut-${cut}:migration:failed`,
        `cut-${cut}:close:start`, `cut-${cut}:close:done`,
        `cut-${cut}:reopen:start`, `cut-${cut}:reopen:done`,
        `cut-${cut}:readback:start`, `cut-${cut}:readback:done`,
        `cut-${cut}:reclose:start`, `cut-${cut}:reclose:done`,
      ]),
    );
    for (const cut of ["statement", "verify", "commit"]) {
      const key = `phase13-migration-failure-cuts-${cut}`;
      const close = events.indexOf(`close:${key}`);
      const reopen = events.indexOf(`cut-${cut}:reopen:start`);
      expect(reopen).toBeGreaterThan(close);
      const readback = events.indexOf(`cut-${cut}:readback:start`);
      expect(events.indexOf(`query:${key}:version`, readback)).toBeGreaterThan(readback);
      expect(events.indexOf(`query:${key}:tables`, readback)).toBeGreaterThan(readback);
      expect(events.indexOf(`cut-${cut}:reclose:done`)).toBeGreaterThan(events.indexOf(`cut-${cut}:readback:done`));
    }
    await adapter.cleanup?.();
    expect(events.at(-1)).toBe("cleanup");
  });

  it("keeps failed readback pending until rejection and still finalizes the reopened runtime", async () => {
    const events: string[] = [];
    const base = hostBase(events);
    const entered = deferred();
    let reject!: (error: Error) => void;
    const gate = new Promise<never>((_resolve, fail) => { reject = fail; });
    let opens = 0;
    jest.spyOn(migrationContracts, "createExpoMigrationsEffectsContractAdapter").mockResolvedValue({
      ...base,
      createRuntime: async (...args) => {
        const runtime = await base.createRuntime(...args);
        opens += 1;
        return opens === 2 ? { ...runtime, kernel: { ...runtime.kernel, queryAll: async () => { entered.resolve(); return gate; } } } : runtime;
      },
    });
    const adapter = await createExpoMultiPlanRunningContractAdapter("readback-pending", (stage) => { events.push(stage); });
    const pending = adapter.runCase("phase13-migration-failure-cuts");
    await entered.promise;
    expect(events.at(-1)).toBe("cut-statement:readback:start");
    const failure = new Error("readback_failed");
    const rejected = expect(pending).rejects.toBe(failure);
    reject(failure);
    await rejected;
    expect(events).not.toContain("cut-statement:readback:done");
    expect(events.at(-1)).toBe("cut-statement:reclose:done");
    expect(events.filter((event) => event.startsWith("close:"))).toHaveLength(2);
  });

  it("does not report a normal setup migration completed while its read is pending or rejected", async () => {
    const events: string[] = [];
    const base = hostBase(events);
    const entered = deferred();
    let reject!: (error: Error) => void;
    const gate = new Promise<never>((_resolve, fail) => { reject = fail; });
    jest.spyOn(migrationContracts, "createExpoMigrationsEffectsContractAdapter").mockResolvedValue({
      ...base,
      createRuntime: async (...args) => {
        const runtime = await base.createRuntime(...args);
        return { ...runtime, kernel: { ...runtime.kernel, queryAll: async () => { entered.resolve(); return gate; } } };
      },
    });
    const adapter = await createExpoMultiPlanRunningContractAdapter("migration-pending", (stage) => { events.push(stage); throw new Error("observer_failed"); });
    const pending = adapter.runCase("phase13-map01-activation");
    await entered.promise;
    expect(events.at(-1)).toBe("case-2:migration:start");
    const failure = new Error("migration_read_failed");
    const rejected = expect(pending).rejects.toBe(failure);
    reject(failure);
    await rejected;
    expect(events).not.toContain("case-2:migration:done");
    expect(events).not.toContain("case-2:assertions:start");
    expect(events.at(-1)).toBe("case-2:close:done");
  });

  it("scopes the nested real 19-case portable matrix to the enclosing native run", async () => {
    const events: string[] = [];
    const base = hostBase(events);
    jest.spyOn(migrationContracts, "createExpoMigrationsEffectsContractAdapter").mockResolvedValue(base);
    const mergeAdapter = jest.spyOn(portableContracts, "createExpoPortableMergeContractAdapter").mockResolvedValue({
      createRuntime: base.createRuntime,
      recoveryBackup: base.recoveryBackup,
      sha256: async (value) => createHash("sha256").update(value).digest("hex"),
    });
    const mergeRun = jest.spyOn(portableContracts, "runPortableMergeContract");
    const adapter = await createExpoMultiPlanRunningContractAdapter("enclosing-run", (stage) => { events.push(stage); throw new Error("observer_failed"); });
    await expect(adapter.runCase("phase13-merge-rebuild")).resolves.toBeUndefined();
    expect(mergeAdapter).toHaveBeenCalledWith("multi-plan-running-enclosing-run-merge-rebuild");
    expect(mergeRun).toHaveBeenCalledTimes(1);
    const result = await (mergeRun.mock.results[0]!.value as ReturnType<typeof portableContracts.runPortableMergeContract>);
    expect(result).toMatchObject({ status: "passed", total: 19, passed: 19, failed: 0, skipped: 0 });
    expect(result.cases.map(({ id }) => id)).toEqual(portableContracts.PORTABLE_MERGE_CONTRACT_CASES);
    expect(events.filter((stage) => stage.startsWith("portable-merge:"))).toEqual(
      portableContracts.PORTABLE_MERGE_CONTRACT_CASES.flatMap((_id, index) => [`portable-merge:case-${index + 1}:start`, `portable-merge:case-${index + 1}:passed`]),
    );
    expect(events.indexOf("case-11:migration:done")).toBeLessThan(events.indexOf("portable-merge:case-1:start"));
    expect(events.at(-1)).toBe("case-11:close:done");
    expect(events.every((stage) => !stage.startsWith("case-") || stage.length < 80)).toBe(true);
  });

  it("keeps immutable, unique case IDs for every Phase 13 lifecycle boundary", () => {
    expect(MULTI_PLAN_RUNNING_CONTRACT_CASES).toEqual([
      "phase13-migration-failure-cuts",
      "phase13-map01-activation",
      "phase13-running-two-slots",
      "phase13-strength-completion-retry",
      "phase13-import-normalized-identity",
      "phase13-import-remove-restore",
      "phase13-match-invalidation",
      "phase13-stale-replay-no-resurrection",
      "phase13-bodyweight-correction-delete",
      "phase13-backup-clean-restore",
      "phase13-merge-rebuild",
      "phase13-source-generation-neutrality",
      "phase13-tim01-retirement",
    ]);
    expect(new Set(MULTI_PLAN_RUNNING_CONTRACT_CASES).size).toBe(MULTI_PLAN_RUNNING_CONTRACT_CASES.length);
  });

  it("injects the migration statement failure after the first schema write", () => {
    expect(PHASE13_STATEMENT_FAILURE_CUT).toEqual({ phase: "after", statementIndex: 0 });
  });

  it("dispatches every native lifecycle case independently and preserves only its own failure", async () => {
    const failedId = "phase13-import-remove-restore" as const;
    const calls: string[] = [];
    const stages: string[] = [];
    const result = await runMultiPlanRunningContract({
      async runCase(id) {
        calls.push(id);
        if (id === failedId) throw new Error("phase13_remove_restore_invalid");
      },
      cleanup: async () => { stages.push("cleanup"); },
    }, (stage) => { stages.push(stage); throw new Error("observer_failed"); });
    expect(stages).toEqual([
      ...MULTI_PLAN_RUNNING_CONTRACT_CASES.flatMap((id, index) => [`case-${index + 1}:start`, `case-${index + 1}:${id === failedId ? "failed" : "passed"}`]),
      "cleanup",
    ]);
    const cleanupFailure = new Error("cleanup_must_propagate");
    await expect(runMultiPlanRunningContract({
      runCase: async () => undefined,
      cleanup: async () => { throw cleanupFailure; },
    }, () => { throw new Error("observer_failed"); })).rejects.toBe(cleanupFailure);

    expect(calls).toEqual(MULTI_PLAN_RUNNING_CONTRACT_CASES);
    expect(result).toMatchObject({
      status: "failed",
      total: MULTI_PLAN_RUNNING_CONTRACT_CASES.length,
      passed: MULTI_PLAN_RUNNING_CONTRACT_CASES.length - 1,
      failed: 1,
      skipped: 0,
    });
    expect(result.cases).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: failedId, status: "failed", errorCode: "phase13_remove_restore_invalid" }),
      expect.objectContaining({ id: "phase13-map01-activation", status: "passed" }),
      expect.objectContaining({ id: "phase13-tim01-retirement", status: "passed" }),
    ]));
    expect(result.cases.map(({ id }) => id)).toEqual(MULTI_PLAN_RUNNING_CONTRACT_CASES);
    expect(JSON.stringify(result)).not.toContain("account_namespace");
    expect(JSON.stringify(result)).not.toContain("owner_request");
  });

  it("runs the canonical wrapper through a fresh kernel runtime per case and always closes it", async () => {
    const opened: string[] = [];
    const closed: string[] = [];
    const result = await runMultiPlanRunningContractOnKernel(async (caseId) => {
      opened.push(caseId);
      return {
        kernel: {
          queryAll: async <Row extends Record<string, unknown>>(sql: string) => (
            sql === "PRAGMA user_version" ? [{ user_version: 45 }] : []
          ) as unknown as readonly Row[],
          write: async <Result,>(command: (transaction: never) => Promise<Result>) => command({} as never),
        } as never,
        close: async () => { closed.push(caseId); },
      };
    });

    expect(opened).toEqual(MULTI_PLAN_RUNNING_CONTRACT_CASES);
    expect(closed).toEqual(MULTI_PLAN_RUNNING_CONTRACT_CASES);
    expect(result.total).toBe(MULTI_PLAN_RUNNING_CONTRACT_CASES.length);
    expect(result.failed).toBeGreaterThan(0);
    expect(result.skipped).toBe(0);
  });
});

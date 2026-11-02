import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { deleteDatabaseAsync } from "expo-sqlite";
import { createMigrationRunner } from "../platform/sqlite/migrationRunner";
import { openSqliteKernel, type SqliteKernel } from "../platform/sqlite/sqliteKernel";

import { createV12ProductionRecoveryNativeExecutor } from "./v12ProductionRecoveryNative";
import {
  collectV12ProductionRecoveryPhase,
  type V12RecoveryDurableSnapshot,
  type V12RecoveryExecutionIdentity,
} from "./v12ProductionRecovery";

jest.mock("expo-sqlite", () => ({
  deleteDatabaseAsync: jest.fn(),
}));
jest.mock("../platform/sqlite/migrationRunner", () => ({ createMigrationRunner: jest.fn() }));
jest.mock("../platform/sqlite/sqliteKernel", () => ({
  ...jest.requireActual<typeof import("../platform/sqlite/sqliteKernel")>("../platform/sqlite/sqliteKernel"),
  openSqliteKernel: jest.fn(),
}));

const identity: V12RecoveryExecutionIdentity = {
  nonce: "a".repeat(32),
  caseId: "queued-callback",
  stepId: "queued-set-commit",
  cutId: "offline",
  signal: { aborted: false },
  progress: () => undefined,
};

function snapshot(): V12RecoveryDurableSnapshot {
  const digest = "a".repeat(64);
  return {
    source_count: 0,
    receipt_count: 0,
    effect_count: 0,
    pointer_count: 0,
    rest_count: 0,
    history_count: 0,
    timing_count: 0,
    restore_count: 0,
    merge_receipt_count: 0,
    cue_count: 0,
    source_sha256: digest,
    receipt_sha256: digest,
    effect_sha256: digest,
    pointer_sha256: digest,
    rest_sha256: digest,
    history_sha256: digest,
    timing_sha256: digest,
    restore_sha256: digest,
    merge_receipt_sha256: digest,
    cue_sha256: digest,
    command_receipt_facts: [],
    effect_facts: [],
    pointer_facts: [],
    rest_facts: [],
    timing_facts: [],
    history_facts: [],
    restore_facts: [],
    merge_receipt_facts: [],
  };
}

function armFailureFixture(stage: "setup" | "command" | "barrier" | "validation" | "publication" | "retry-publication") {
  const events: string[] = [];
  const closeable = (name: string) => ({
    close: jest.fn(async () => {
      events.push(`close:${name}`);
    }),
  });
  const setupTarget = closeable("setup-target");
  const setupSource = closeable("setup-source");
  const baseline = closeable("baseline");
  const runtime = { kernel: {}, ...closeable("runtime") };
  let migration = 0;
  let reads = 0;
  const executor = createV12ProductionRecoveryNativeExecutor({
    deleteDatabase: async (name) => {
      events.push(`delete:${name.startsWith("v12-recovery-source-") ? "source" : "target"}`);
    },
    migrateDatabase: async () => {
      migration += 1;
      return (migration === 1 ? setupTarget : setupSource) as never;
    },
    setupDatabase: async () => {
      events.push("setup");
      if (stage === "setup") throw new Error("setup_failed");
    },
    openKernel: async () => baseline as never,
    openTestRuntime: async () => runtime as never,
    readSnapshot: async () => {
      reads += 1;
      if (stage === "barrier" && reads === 2) throw new Error("barrier_failed");
      return stage === "validation" && reads === 2
        ? { ...snapshot(), receipt_count: -1 }
        : snapshot();
    },
    runOperation: async () => {
      events.push("command");
      if (stage === "command") throw new Error("command_failed");
      if (stage === "retry-publication") throw new Error("v12_recovery_first_attempt_failed");
      return "completed";
    },
  });
  return { baseline, events, executor, runtime, setupSource, setupTarget };
}

describe("v1.2 production Recovery native cleanup", () => {
  beforeEach(() => {
    jest.mocked(deleteDatabaseAsync).mockReset();
    jest.mocked(openSqliteKernel).mockReset();
    jest.mocked(createMigrationRunner).mockReset();
  });

  it.each(["pre-transaction", "retry"] as const)(
    "closes native resources when awaited %s ARMED publication rejects",
    async (cutId) => {
      const fixture = armFailureFixture(cutId === "retry" ? "retry-publication" : "publication");
      const failure = new Error("publication_failed");
      await expect(fixture.executor.arm({
        ...identity, caseId: "restore", stepId: "restore-commit", cutId,
        progress: async () => { throw failure; },
      })).rejects.toBe(failure);
      expect(fixture.runtime.close).toHaveBeenCalledTimes(1);
      expect(fixture.events.at(-1)).toBe("close:runtime");
    },
  );

  it.each(["pre-transaction", "relaunch", "post-acknowledgement"] as const)(
    "keeps the runtime open while successful %s publication is pending",
    async (cutId) => {
      const fixture = armFailureFixture("publication");
      let finishPublication!: () => void;
      const pending = new Promise<void>((resolve) => { finishPublication = resolve; });
      const progress = jest.fn(() => pending);
      void fixture.executor.arm({
        ...identity, caseId: "restore", stepId: "restore-commit", cutId, progress,
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(progress).toHaveBeenCalledTimes(1);
      const expectedClosed = cutId === "relaunch" ? 1 : 0;
      expect(fixture.runtime.close).toHaveBeenCalledTimes(expectedClosed);
      finishPublication();
      await new Promise((resolve) => setImmediate(resolve));
      expect(fixture.runtime.close).toHaveBeenCalledTimes(expectedClosed);
    },
  );

  it("accepts only Expo's missing-database result for fresh nonce-owned cleanup", async () => {
    jest.mocked(deleteDatabaseAsync).mockRejectedValue(Object.assign(new Error("Database not found"), { code: "ERR_DATABASE_NOT_FOUND" }));
    await expect(createV12ProductionRecoveryNativeExecutor().cleanup(identity)).resolves.toBeUndefined();
    expect(deleteDatabaseAsync).toHaveBeenCalledTimes(2);
  });

  it.each(["ERR_DELETE_DATABASE", "ERR_DELETE_DATABASE_FILE", "ERR_INTERNAL_SQLITE_ERROR", undefined])(
    "preserves strict cleanup failure for %s", async (code) => {
      const failure = Object.assign(new Error("delete failed"), code === undefined ? {} : { code });
      jest.mocked(deleteDatabaseAsync).mockRejectedValue(failure);
      await expect(createV12ProductionRecoveryNativeExecutor().cleanup(identity)).rejects.toBe(failure);
      expect(deleteDatabaseAsync).toHaveBeenCalledTimes(2);
    },
  );

  it.each([null, "ERR_DATABASE_NOT_FOUND", { code: "ERR_DATABASE_NOT_FOUND" }])(
    "does not suppress non-Error cleanup rejection %j", async (failure) => {
      jest.mocked(deleteDatabaseAsync).mockRejectedValue(failure);
      await expect(createV12ProductionRecoveryNativeExecutor().cleanup(identity)).rejects.toBe(failure);
      expect(deleteDatabaseAsync).toHaveBeenCalledTimes(2);
    },
  );

  it("reaches native migration after both fresh nonce databases are absent", async () => {
    jest.mocked(deleteDatabaseAsync).mockRejectedValue(Object.assign(new Error("Database not found"), { code: "ERR_DATABASE_NOT_FOUND" }));
    const reachedMigration = new Error("migration_reached");
    const migrateDatabase = jest.fn(async () => { throw reachedMigration; });
    const executor = createV12ProductionRecoveryNativeExecutor({ migrateDatabase });
    await expect(executor.arm(identity)).rejects.toBe(reachedMigration);
    expect(migrateDatabase).toHaveBeenCalledTimes(1);
    expect(deleteDatabaseAsync).toHaveBeenCalledTimes(2);
  });

  it("reports actual setup transitions without changing a migration rejection", async () => {
    jest.mocked(deleteDatabaseAsync).mockResolvedValue(undefined);
    const failure = new Error("migration_failed");
    const stages: string[] = [];
    const executor = createV12ProductionRecoveryNativeExecutor({ migrateDatabase: async () => { throw failure; } });
    await expect(executor.arm({ ...identity, setupStage: (stage) => { stages.push(stage); } })).rejects.toBe(failure);
    expect(stages).toEqual(["delete:start", "delete:done", "migrate-target:start", "migrate-target:failed"]);
  });

  it("keeps a throwing setup observer outside the native operation outcome", async () => {
    jest.mocked(deleteDatabaseAsync).mockResolvedValue(undefined);
    const failure = new Error("migration_failed");
    const executor = createV12ProductionRecoveryNativeExecutor({ migrateDatabase: async () => { throw failure; } });
    await expect(executor.arm({ ...identity, setupStage: () => { throw new Error("observer_failed"); } })).rejects.toBe(failure);
  });

  function migrationFixture() {
    const stages: string[] = [];
    const afterMigration = new Error("stop_after_migration");
    const close = jest.fn<SqliteKernel["close"]>(async () => undefined);
    const kernel = { close } as unknown as SqliteKernel;
    const run = jest.fn<ReturnType<typeof createMigrationRunner>["run"]>(async () => ({
      appliedVersions: [], currentVersion: 47, recoveryBackup: null,
    }));
    jest.mocked(deleteDatabaseAsync).mockResolvedValue(undefined);
    jest.mocked(openSqliteKernel).mockResolvedValue(kernel);
    jest.mocked(createMigrationRunner).mockReturnValue({ run });
    const executor = createV12ProductionRecoveryNativeExecutor({
      setupDatabase: async () => { throw afterMigration; },
    });
    const start = (setupStage = (stage: string) => { stages.push(stage); }) => executor.arm({
      ...identity, caseId: "between-set-rest-pointer", stepId: "between-set-commit",
      cutId: "post-commit-before-ack", setupStage,
    });
    return { afterMigration, close, kernel, run, stages, start };
  }

  it("reports completed default kernel open and migration run before rich seeding", async () => {
    const f = migrationFixture();
    await expect(f.start()).rejects.toBe(f.afterMigration);
    expect(f.stages).toEqual([
      "delete:start", "delete:done", "migrate-target:start", "target-open:start", "target-open:done",
      "target-run:start", "target-run:done", "migrate-target:done", "seed:start", "seed:failed",
    ]);
    expect(jest.mocked(openSqliteKernel)).toHaveBeenCalledWith(
      `v12-recovery-${identity.nonce}-between-set-rest-pointer-between-set-commit-post-commit-before-ack.db`,
    );
    expect(jest.mocked(createMigrationRunner)).toHaveBeenCalledWith(expect.objectContaining({ kernel: f.kernel }));
    expect(f.run).toHaveBeenCalledTimes(1);
    expect(f.close).toHaveBeenCalledTimes(1);
  });

  it("emits no invented progress while default kernel open is pending", async () => {
    const f = migrationFixture();
    const failure = new Error("open_failed");
    let rejectOpen!: (error: Error) => void;
    jest.mocked(openSqliteKernel).mockReturnValue(new Promise((_resolve, reject) => { rejectOpen = reject; }));
    const outcome = f.start().catch((error: unknown) => error);
    await new Promise((resolve) => setImmediate(resolve));
    expect(f.stages).toEqual(["delete:start", "delete:done", "migrate-target:start", "target-open:start"]);
    expect(f.run).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
    rejectOpen(failure);
    expect(await outcome).toBe(failure);
    expect(f.stages.slice(-2)).toEqual(["target-open:failed", "migrate-target:failed"]);
    expect(jest.mocked(createMigrationRunner)).not.toHaveBeenCalled();
  });

  it("emits no completed run marker until the default migration promise resolves", async () => {
    const f = migrationFixture();
    let finishRun!: () => void;
    f.run.mockImplementation(() => new Promise((resolve) => {
      finishRun = () => resolve({ appliedVersions: [], currentVersion: 47, recoveryBackup: null });
    }));
    const outcome = f.start().catch((error: unknown) => error);
    await new Promise((resolve) => setImmediate(resolve));
    expect(f.stages).toEqual([
      "delete:start", "delete:done", "migrate-target:start", "target-open:start", "target-open:done", "target-run:start",
    ]);
    expect(f.close).not.toHaveBeenCalled();
    finishRun();
    expect(await outcome).toBe(f.afterMigration);
    expect(f.stages).toContain("target-run:done");
  });

  it("reports a rejected run before waiting for native error cleanup and preserves the original rejection", async () => {
    const f = migrationFixture();
    const failure = new Error("migration_failed");
    let finishClose!: () => void;
    f.run.mockRejectedValue(failure);
    f.close.mockImplementation(() => new Promise((resolve) => { finishClose = resolve; }));
    let settled = false;
    const outcome = f.start().catch((error: unknown) => { settled = true; return error; });
    await new Promise((resolve) => setImmediate(resolve));
    expect(f.stages).toEqual([
      "delete:start", "delete:done", "migrate-target:start", "target-open:start", "target-open:done",
      "target-run:start", "target-run:failed", "target-error-close:start",
    ]);
    expect(settled).toBe(false);
    finishClose();
    expect(await outcome).toBe(failure);
    expect(f.stages.slice(-2)).toEqual(["target-error-close:done", "migrate-target:failed"]);
    expect(f.close).toHaveBeenCalledTimes(1);
  });

  it("reports native error-close failure while retaining the existing close rejection outcome", async () => {
    const f = migrationFixture();
    const closeFailure = new Error("native_close_failed");
    f.run.mockRejectedValue(new Error("migration_failed"));
    f.close.mockRejectedValue(closeFailure);
    await expect(f.start()).rejects.toBe(closeFailure);
    expect(f.stages.slice(-4)).toEqual([
      "target-run:failed", "target-error-close:start", "target-error-close:failed", "migrate-target:failed",
    ]);
  });

  it.each(["completed", "rejected"] as const)(
    "a throwing inner migration observer does not change a %s migration outcome", async (mode) => {
      const f = migrationFixture();
      const failure = new Error("migration_failed");
      if (mode === "rejected") f.run.mockRejectedValue(failure);
      const observer = jest.fn(() => { throw new Error("observer_failed"); });
      await expect(f.start(observer)).rejects.toBe(mode === "rejected" ? failure : f.afterMigration);
      expect(observer).toHaveBeenCalledWith("target-open:start");
      expect(observer).toHaveBeenCalledWith(mode === "rejected" ? "target-error-close:done" : "target-run:done");
      expect(f.close).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["setup", "command", "barrier", "validation"] as const)(
    "closes every native connection before database cleanup after %s failure",
    async (stage) => {
      const fixture = armFailureFixture(stage);
      const restoreIdentity = {
        ...identity,
        caseId: "restore",
        stepId: "restore-commit",
        cutId: stage === "command" ? "post-acknowledgement" : "pre-transaction",
      };
      const lines: string[] = [];

      await expect(collectV12ProductionRecoveryPhase({
        identity: {
          packageName: "com.fchoo.gymtracker.devtest",
          buildProfile: "development-test",
          nativeContractsEnabled: true,
          suite: "v1.2-acceptance",
          ...restoreIdentity,
        },
        phase: "arm",
        emit: (line) => lines.push(line),
        signal: restoreIdentity.signal,
        executor: fixture.executor,
      })).rejects.toThrow(stage === "validation" ? "v12_recovery_progress_invalid" : `${stage}_failed`);

      const firstFinalDelete = fixture.events.findIndex((event, index) => (
        event === "delete:target" && index >= 2
      ));
      const closes = fixture.events
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => event.startsWith("close:"));
      expect(closes.length).toBeGreaterThan(0);
      expect(closes.every(({ index }) => index < firstFinalDelete)).toBe(true);
      expect(fixture.events.slice(firstFinalDelete)).toEqual(["delete:target", "delete:source"]);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every((line) => line.startsWith("GYM_TRACKER_V12_RECOVERY_SETUP:"))).toBe(true);
    },
  );

  it("waits for strict target and source deletion before surfacing a cleanup failure", async () => {
    const targetFailure = new Error("target_delete_failed");
    let finishSourceDelete: (() => void) | undefined;
    jest.mocked(deleteDatabaseAsync)
      .mockRejectedValueOnce(targetFailure)
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        finishSourceDelete = resolve;
      }));
    let settled = false;
    const cleanup = createV12ProductionRecoveryNativeExecutor()
      .cleanup(identity)
      .finally(() => {
        settled = true;
      });

    await new Promise((resolve) => setImmediate(resolve));
    expect(deleteDatabaseAsync).toHaveBeenCalledTimes(2);
    expect(jest.mocked(deleteDatabaseAsync).mock.calls.map(([name]) => name)).toEqual([
      `v12-recovery-${identity.nonce}-${identity.caseId}-${identity.stepId}-${identity.cutId}.db`,
      `v12-recovery-source-${identity.nonce}-${identity.caseId}-${identity.stepId}-${identity.cutId}.db`,
    ]);
    expect(settled).toBe(false);

    finishSourceDelete?.();
    await expect(cleanup).rejects.toBe(targetFailure);
    expect(settled).toBe(true);
  });
});

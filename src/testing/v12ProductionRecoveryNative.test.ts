import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { deleteDatabaseAsync } from "expo-sqlite";

import { createV12ProductionRecoveryNativeExecutor } from "./v12ProductionRecoveryNative";
import {
  collectV12ProductionRecoveryPhase,
  type V12RecoveryDurableSnapshot,
  type V12RecoveryExecutionIdentity,
} from "./v12ProductionRecovery";

jest.mock("expo-sqlite", () => ({
  deleteDatabaseAsync: jest.fn(),
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

function armFailureFixture(stage: "setup" | "command" | "barrier" | "validation") {
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
      return "completed";
    },
  });
  return { baseline, events, executor, runtime, setupSource, setupTarget };
}

describe("v1.2 production Recovery native cleanup", () => {
  beforeEach(() => {
    jest.mocked(deleteDatabaseAsync).mockReset();
  });

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
      expect(lines).toEqual([]);
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

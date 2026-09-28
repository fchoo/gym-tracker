import { describe, expect, it, jest } from "@jest/globals";

import {
  createAutomaticBackupRuntime,
  type AutomaticBackupRuntimeCommands,
} from "./automaticBackupRuntime";
import type { AutomaticBackupPresentationInput } from "../domains/backup/automaticBackupPresentation";

const base = () => ({
  status: "backup_pending" as const,
  mutationGeneration: 2,
  backedUpGeneration: 1,
  nowMs: 1,
});

function commands(): jest.Mocked<AutomaticBackupRuntimeCommands> {
  return {
    connect: jest.fn(async () => undefined),
    deferRestore: jest.fn(async () => undefined),
    cancelChecking: jest.fn(async () => undefined),
    checkAgain: jest.fn(async () => undefined),
    continueRestore: jest.fn(async () => undefined),
    prepareRecovery: jest.fn(async () => ({ kind: "empty_direct" as const, attemptId: "attempt" })),
    commitRecovery: jest.fn(async () => undefined),
    finishSetup: jest.fn(async () => undefined),
    backupNow: jest.fn(async () => undefined),
    retryBackup: jest.fn(async () => undefined),
    useCellularThisTime: jest.fn(async () => undefined),
    setDataUsePolicy: jest.fn(async () => undefined),
    takeOver: jest.fn(async () => undefined),
    disconnect: jest.fn(async () => undefined),
    deleteCloudBackup: jest.fn(async () => undefined),
    finishDeletingCloudBackup: jest.fn(async () => undefined),
    startNewCloudBackup: jest.fn(async () => undefined),
  };
}

describe("automatic backup runtime", () => {
  it("publishes newest reads after commands and rejects stale completions", async () => {
    let resolveFirst: ((value: AutomaticBackupPresentationInput) => void) | undefined;
    let calls = 0;
    const read = jest.fn(async (): Promise<AutomaticBackupPresentationInput> => {
      calls += 1;
      if (calls === 1) return new Promise<AutomaticBackupPresentationInput>((resolve) => { resolveFirst = resolve; });
      return { ...base(), status: "idle", mutationGeneration: 2, backedUpGeneration: 2 };
    });
    const port = commands();
    const runtime = createAutomaticBackupRuntime({ read, commands: port });
    const seen: string[] = [];
    runtime.subscribe((model) => seen.push(model.status));

    const first = runtime.refresh();
    await runtime.backupNow();
    resolveFirst?.(base());
    await first;

    expect(port.backupNow).toHaveBeenCalledTimes(1);
    expect(runtime.current().status).toBe("idle");
    expect(seen).toEqual(["idle"]);
  });

  it("latches duplicate commands, refreshes after all typed commands, and disposes subscribers", async () => {
    let resolve: (() => void) | undefined;
    const port = commands();
    port.connect.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
    const read = jest.fn(async () => base());
    const runtime = createAutomaticBackupRuntime({ read, commands: port });
    const listener = jest.fn();
    runtime.subscribe(listener);

    const one = runtime.connect();
    const two = runtime.connect();
    resolve?.();
    await Promise.all([one, two]);
    runtime.dispose();
    await runtime.refresh();

    expect(port.connect).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the production composition omits a command", async () => {
    const runtime = createAutomaticBackupRuntime({ read: async () => base() });
    await expect(runtime.connect()).rejects.toThrow("automatic_backup_unavailable");
    expect(runtime.current()).toMatchObject({ status: "paused", reason: "unavailable" });
  });
});

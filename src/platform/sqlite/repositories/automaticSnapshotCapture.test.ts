import { describe, expect, it, jest } from "@jest/globals";

import type { LogicalBackupSnapshot } from "../../../domains/portability/backupContracts";
import {
  AUTOMATIC_SNAPSHOT_LEASE_MAX_AGE_MS,
  AUTOMATIC_SNAPSHOT_LEASE_PREFIX,
  AutomaticSnapshotCaptureError,
  createAutomaticSnapshotCapture,
  type AutomaticSnapshotCaptureDependencies,
} from "./automaticSnapshotCapture";

const snapshot = {
  version: 2,
  snapshotId: "snapshot",
  createdAtMs: 100,
  schemaVersion: 26,
  manifest: { catalogReferenceCount: 0, rowCounts: {}, totalRows: 0 },
  tables: {},
  catalogReferences: [],
} as const satisfies LogicalBackupSnapshot;

function dependencies(
  overrides: Partial<AutomaticSnapshotCaptureDependencies> = {},
): AutomaticSnapshotCaptureDependencies {
  const copiedKernel = {
    queryAll: jest.fn(async () => [{ mutation_generation: 7 }]),
    close: jest.fn(async () => undefined),
  } as never;
  return {
    sourceDatabaseName: "gym-tracker.db",
    nowMs: () => 2 * AUTOMATIC_SNAPSHOT_LEASE_MAX_AGE_MS,
    leaseId: () => "lease-1",
    listLeaseFiles: async () => [],
    removeLeaseFile: async () => undefined,
    copyDatabase: async () => undefined,
    openCopiedKernel: async () => copiedKernel,
    collect: async () => snapshot,
    ...overrides,
  };
}

describe("automatic snapshot capture", () => {
  it("copies first, reads generation and facts from the copy, then removes every lease file", async () => {
    const events: string[] = [];
    const copiedKernel = {
      queryAll: jest.fn(async () => {
        events.push("generation");
        return [{ mutation_generation: 7 }];
      }),
      close: jest.fn(async () => { events.push("close"); }),
    } as never;
    const removeLeaseFile = jest.fn(async (name: string) => { events.push(`remove:${name}`); });
    const capture = createAutomaticSnapshotCapture(dependencies({
      listLeaseFiles: async () => [
        { name: `${AUTOMATIC_SNAPSHOT_LEASE_PREFIX}stale.db`, modifiedAtMs: 0 },
        { name: `${AUTOMATIC_SNAPSHOT_LEASE_PREFIX}fresh.db`, modifiedAtMs: 2 * AUTOMATIC_SNAPSHOT_LEASE_MAX_AGE_MS },
        { name: "gym-tracker.db", modifiedAtMs: 0 },
      ],
      removeLeaseFile,
      copyDatabase: async (source, destination) => { events.push(`copy:${source}:${destination}`); },
      openCopiedKernel: async () => { events.push("open"); return copiedKernel; },
      collect: async (_kernel, input) => { events.push(`collect:${input.snapshotId}`); return snapshot; },
    }));

    await expect(capture.capture({ snapshotId: "snapshot", createdAtMs: 100 }))
      .resolves.toEqual({ generation: 7, snapshot });
    expect(events).toEqual([
      `remove:${AUTOMATIC_SNAPSHOT_LEASE_PREFIX}stale.db`,
      `remove:${AUTOMATIC_SNAPSHOT_LEASE_PREFIX}stale.db-wal`,
      `remove:${AUTOMATIC_SNAPSHOT_LEASE_PREFIX}stale.db-shm`,
      `copy:gym-tracker.db:${AUTOMATIC_SNAPSHOT_LEASE_PREFIX}lease-1.db`,
      "open",
      "generation",
      "collect:snapshot",
      "close",
      `remove:${AUTOMATIC_SNAPSHOT_LEASE_PREFIX}lease-1.db`,
      `remove:${AUTOMATIC_SNAPSHOT_LEASE_PREFIX}lease-1.db-wal`,
      `remove:${AUTOMATIC_SNAPSHOT_LEASE_PREFIX}lease-1.db-shm`,
    ]);
    expect(removeLeaseFile).toHaveBeenCalledTimes(6);
  });

  it("bounds orphan cleanup and ignores unrelated, fresh, and malformed names", async () => {
    const removeLeaseFile = jest.fn(async () => undefined);
    const now = 3 * AUTOMATIC_SNAPSHOT_LEASE_MAX_AGE_MS;
    const stale = Array.from({ length: 40 }, (_, index) => ({
      name: `${AUTOMATIC_SNAPSHOT_LEASE_PREFIX}${index}.db${index % 2 === 0 ? "-wal" : ""}`,
      modifiedAtMs: index,
    }));
    const capture = createAutomaticSnapshotCapture(dependencies({
      nowMs: () => now,
      listLeaseFiles: async () => [
        ...stale,
        { name: `${AUTOMATIC_SNAPSHOT_LEASE_PREFIX}fresh.db`, modifiedAtMs: now },
        { name: `${AUTOMATIC_SNAPSHOT_LEASE_PREFIX}bad.sqlite`, modifiedAtMs: 0 },
        { name: "gym-tracker.db", modifiedAtMs: 0 },
      ],
      removeLeaseFile,
    }));

    await expect(capture.sweepOrphans()).resolves.toBe(32);
    const removedNames = removeLeaseFile.mock.calls as unknown as readonly [string][];
    expect(new Set(removedNames.map(([name]) => name)).size).toBe(96);
    expect(removeLeaseFile).not.toHaveBeenCalledWith("gym-tracker.db");
  });

  it.each([
    ["copy", { copyDatabase: async () => { throw new Error("copy"); } }],
    ["open", { openCopiedKernel: async () => { throw new Error("open"); } }],
    ["generation", { openCopiedKernel: async () => ({ queryAll: async () => [], close: async () => undefined }) as never }],
    ["collect", { collect: async () => { throw new Error("collect"); } }],
    ["close", { openCopiedKernel: async () => ({ queryAll: async () => [{ mutation_generation: 1 }], close: async () => { throw new Error("close"); } }) as never }],
    ["remove", { removeLeaseFile: async (name: string) => { if (name.endsWith("lease-1.db")) throw new Error("remove"); } }],
  ])("fails closed and attempts cleanup after a %s failure", async (_stage, override) => {
    const removeLeaseFile = jest.fn(
      "removeLeaseFile" in override
        ? override.removeLeaseFile
        : async () => undefined,
    );
    const capture = createAutomaticSnapshotCapture(dependencies({ ...override, removeLeaseFile }));

    await expect(capture.capture({ snapshotId: "snapshot", createdAtMs: 100 }))
      .rejects.toEqual(new AutomaticSnapshotCaptureError("automatic_snapshot_capture_failed"));
    expect(removeLeaseFile).toHaveBeenCalledWith(`${AUTOMATIC_SNAPSHOT_LEASE_PREFIX}lease-1.db`);
  });

  it("rejects unsafe lease identifiers before copying", async () => {
    const copyDatabase = jest.fn(async () => undefined);
    const capture = createAutomaticSnapshotCapture(dependencies({
      leaseId: () => "../escape",
      copyDatabase,
    }));

    await expect(capture.capture({ snapshotId: "snapshot", createdAtMs: 100 }))
      .rejects.toEqual(new AutomaticSnapshotCaptureError("automatic_snapshot_capture_failed"));
    expect(copyDatabase).not.toHaveBeenCalled();
  });
});

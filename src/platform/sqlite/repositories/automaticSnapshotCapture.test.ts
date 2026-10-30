import { describe, expect, it, jest } from "@jest/globals";

import type { LogicalBackupSnapshot } from "../../../domains/portability/backupContracts";
import {
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
const MISSING_GENERATION = Symbol("missing-generation");

function dependencies(
  generation: unknown = 7,
  overrides: Partial<AutomaticSnapshotCaptureDependencies> = {},
): AutomaticSnapshotCaptureDependencies {
  const transaction = {
    queryAll: jest.fn(async () => generation === MISSING_GENERATION
      ? []
      : [{ mutation_generation: generation }]),
  };
  return {
    kernel: {
      readSnapshot: async (query: (value: typeof transaction) => Promise<unknown>) =>
        query(transaction),
    } as never,
    collect: async () => snapshot,
    ...overrides,
  };
}

describe("automatic snapshot capture", () => {
  it("reads generation and logical facts inside one reader snapshot", async () => {
    const events: string[] = [];
    const transaction = {
      queryAll: jest.fn(async () => {
        events.push("generation");
        return [{ mutation_generation: 7 }];
      }),
    };
    const readSnapshot = jest.fn(async (
      query: (value: typeof transaction) => Promise<unknown>,
    ) => {
      events.push("begin");
      const result = await query(transaction);
      events.push("commit");
      return result;
    });
    const capture = createAutomaticSnapshotCapture(dependencies(7, {
      kernel: { readSnapshot } as never,
      onSnapshotStart: () => { events.push("started"); },
      collect: async (_transaction, input) => {
        events.push(`collect:${input.snapshotId}`);
        return snapshot;
      },
    }));

    await expect(capture.capture({ snapshotId: "snapshot", createdAtMs: 100 }))
      .resolves.toEqual({ generation: 7, snapshot });
    expect(events).toEqual([
      "begin", "generation", "started", "collect:snapshot", "commit",
    ]);
    expect(readSnapshot).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing", MISSING_GENERATION],
    ["negative", -1],
    ["fractional", 1.5],
    ["text", "7"],
  ])("rejects a %s copied generation before collection", async (_label, generation) => {
    const collect = jest.fn(async () => snapshot);
    const capture = createAutomaticSnapshotCapture(dependencies(generation, { collect }));

    await expect(capture.capture({ snapshotId: "snapshot", createdAtMs: 100 }))
      .rejects.toEqual(new AutomaticSnapshotCaptureError("automatic_snapshot_capture_failed"));
    expect(collect).not.toHaveBeenCalled();
  });

  it.each([
    ["reader", { kernel: { readSnapshot: async () => { throw new Error("reader"); } } as never }],
    ["collector", { collect: async () => { throw new Error("collector"); } }],
  ])("maps a %s failure to one safe retryable error", async (_label, override) => {
    const capture = createAutomaticSnapshotCapture(dependencies(7, override));

    await expect(capture.capture({ snapshotId: "snapshot", createdAtMs: 100 }))
      .rejects.toEqual(expect.objectContaining({
        code: "automatic_snapshot_capture_failed",
        retryable: true,
        correlationCode: "GT-BACKUP-CAPTURE01",
      }));
  });
});

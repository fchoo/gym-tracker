import { createHash } from "node:crypto";
import { describe, expect, it } from "@jest/globals";

import type { LogicalBackupSnapshot } from "../domains/portability/backupContracts";
import type {
  SqliteKernel,
  SqliteReadTransactionExecutor,
} from "../platform/sqlite/sqliteKernel";
import {
  collectPhase14SourceStateProof,
} from "./phase14SourceStateProof";

function snapshotWithTables(
  tables: LogicalBackupSnapshot["tables"],
): LogicalBackupSnapshot {
  const rowCounts = Object.fromEntries(
    Object.entries(tables).map(([table, rows]) => [table, rows.length]),
  );
  return {
    version: 3,
    snapshotId: "ignored-by-test-collector",
    createdAtMs: 99,
    schemaVersion: 30,
    manifest: {
      catalogReferenceCount: 0,
      rowCounts,
      totalRows: Object.values(rowCounts).reduce((total, count) => total + count, 0),
    },
    tables,
    catalogReferences: [],
  } as LogicalBackupSnapshot;
}

function kernelWithSnapshotRead(): SqliteKernel {
  return {
    readSnapshot: async <Result,>(
      read: (transaction: SqliteReadTransactionExecutor) => Promise<Result>,
    ): Promise<Result> => read({ queryAll: async () => [] }),
  } as unknown as SqliteKernel;
}

const sha256 = async (value: string): Promise<string> =>
  createHash("sha256").update(value).digest("hex");

describe("collectPhase14SourceStateProof", () => {
  it("uses fixed snapshot metadata and returns only bounded aggregate source facts", async () => {
    const privateValue = "private workout note that must never leave the app";
    let collectedMetadata: Readonly<{
      snapshotId: string;
      createdAtMs: number;
    }> | undefined;
    const collect = async (
      _reader: SqliteReadTransactionExecutor,
      metadata: Readonly<{ snapshotId: string; createdAtMs: number }>,
    ): Promise<LogicalBackupSnapshot> => {
      collectedMetadata = metadata;
      return snapshotWithTables({
        app_settings: [{ key: "private", value: privateValue }],
        workout_sessions: [{ id: "private-session" }, { id: "another-session" }],
      } as LogicalBackupSnapshot["tables"]);
    };

    const proof = await collectPhase14SourceStateProof({
      collect,
      kernel: kernelWithSnapshotRead(),
      sha256,
    });

    expect(collectedMetadata).toEqual({
      createdAtMs: 0,
      snapshotId: "phase14-source-state-proof",
    });
    expect(Object.keys(proof).sort()).toEqual([
      "digest_sha256",
      "row_count",
      "schema_version",
      "table_count",
    ]);
    expect(proof).toMatchObject({
      row_count: 3,
      schema_version: 30,
      table_count: 2,
    });
    expect(proof.digest_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(proof)).not.toContain(privateValue);
    expect(JSON.stringify(proof)).not.toContain("private-session");
  });

  it("hashes a stable canonical representation independent of object insertion order", async () => {
    const left = snapshotWithTables({
      workout_sessions: [{ z: 2, a: 1 }],
      app_settings: [{ value: "dark", key: "appearance" }],
    } as LogicalBackupSnapshot["tables"]);
    const right = snapshotWithTables({
      app_settings: [{ key: "appearance", value: "dark" }],
      workout_sessions: [{ a: 1, z: 2 }],
    } as LogicalBackupSnapshot["tables"]);
    let collectionCount = 0;
    const collect = async (): Promise<LogicalBackupSnapshot> => {
      const snapshots = [left, right] as const;
      const snapshot = snapshots[collectionCount];
      collectionCount += 1;
      if (snapshot === undefined) throw new Error("unexpected_collection");
      return snapshot;
    };

    const first = await collectPhase14SourceStateProof({
      collect,
      kernel: kernelWithSnapshotRead(),
      sha256,
    });
    const second = await collectPhase14SourceStateProof({
      collect,
      kernel: kernelWithSnapshotRead(),
      sha256,
    });

    expect(first).toEqual(second);
  });

  it("fails closed when the runtime kernel cannot provide one logical read snapshot", async () => {
    const kernel = {} as SqliteKernel;

    await expect(collectPhase14SourceStateProof({ kernel, sha256 }))
      .rejects.toThrow("phase14_source_state_snapshot_unavailable");
  });
});

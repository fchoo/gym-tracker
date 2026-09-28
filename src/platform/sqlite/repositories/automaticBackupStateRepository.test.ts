import { describe, expect, it } from "@jest/globals";
import type { SqliteKernel, SqliteTransactionExecutor } from "../sqliteKernel";
import { createAutomaticBackupStateRepository } from "./automaticBackupStateRepository";

describe("automatic backup state repository", () => {
  it("persists bounded recovery status, data-use policy, and local-only disconnect", async () => {
    const statements: string[] = [];
    const repository = createAutomaticBackupStateRepository({
      queryAll: async () => [{ environment: "development-test", permission_id: "permission", display_email: null, connection_generation: 2, writer_epoch: 3, mutation_generation: 6, backed_up_generation: 4 }],
      write: async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) => command({
        execute: async (sql: string) => { statements.push(sql); return { changes: 1, lastInsertRowId: 0 }; },
        queryAll: async () => [],
      }), connectionConfiguration: async () => undefined, close: async () => undefined,
    } as unknown as SqliteKernel);

    await repository.setRecoveryStatus("restore_pending");
    await repository.setDataUsePolicy("wifi-only");
    await repository.beginQuarantine({ environment: "development-test", permissionId: "permission", connectionGeneration: 3, accountDisplayLabel: "…@example.com" });
    await repository.disconnectLocal();

    expect(statements.join("\n")).toContain("status_code");
    expect(statements.join("\n")).toContain("data_use_policy");
    expect(statements.join("\n")).toContain("permission_id = NULL");
    expect(statements.join("\n")).toContain("account_display_label");
  });
  it("returns only bounded state and conditionally acknowledges captured generation", async () => {
    const repository = createAutomaticBackupStateRepository({
      queryAll: async () => [{ environment: "development-test", permission_id: "permission", display_email: "…@example.com", connection_generation: 2, writer_epoch: 3, mutation_generation: 5, backed_up_generation: 4 }],
      write: async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) => command({ execute: async () => ({ changes: 1, lastInsertRowId: 0 }), queryAll: async () => [] }), connectionConfiguration: async () => undefined, close: async () => undefined,
    } as unknown as SqliteKernel);
    await expect(repository.read()).resolves.toMatchObject({ environment: "development-test", mutationGeneration: 5 });
    await expect(repository.acknowledge({ environment: "development-test", permissionId: "permission", writerEpoch: 3, capturedGeneration: 5 })).resolves.toBe(true);
  });

  it("rejects a receipt when any persisted fence no longer matches", async () => {
    const repository = createAutomaticBackupStateRepository({
      queryAll: async () => [{ environment: "development-test", permission_id: "permission", display_email: null, connection_generation: 2, writer_epoch: 3, mutation_generation: 6, backed_up_generation: 4, manifest_file_id: "manifest", manifest_etag: "etag", authority_state: "active", dirty_since_ms: 7, last_attempt_ms: null, last_success_ms: null, data_use_policy: "any-network", status_code: "idle", error_code: null, claim_id: null, claim_expires_at_ms: null }],
      write: async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) => command({
        execute: async (sql: string) => ({ changes: sql.includes("manifest_file_id") ? 1 : 0, lastInsertRowId: 0 }),
        queryAll: async () => [],
      }), connectionConfiguration: async () => undefined, close: async () => undefined,
    } as unknown as SqliteKernel);

    await expect(repository.acknowledgeReceipt({
      environment: "development-test", permissionId: "permission", connectionGeneration: 2,
      writerEpoch: 3, capturedGeneration: 5, sourceDigest: "a".repeat(64),
      snapshotId: "snapshot", manifestId: "manifest", manifestEtag: "etag",
    })).resolves.toBe(true);
  });

  it("persists a fenced tombstone sweep without confusing it with ordinary pause", async () => {
    const statements: string[] = [];
    const repository = createAutomaticBackupStateRepository({
      queryAll: async () => [],
      write: async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) => command({
        execute: async (sql: string) => { statements.push(sql); return { changes: 1, lastInsertRowId: 0 }; }, queryAll: async () => [],
      }), connectionConfiguration: async () => undefined, close: async () => undefined,
    } as unknown as SqliteKernel);
    const fence = { environment: "development-test" as const, permissionId: "permission", connectionGeneration: 2 };
    await expect(repository.beginDeletionSweep(fence)).resolves.toBe(true);
    await expect(repository.completeDeletionSweep(fence)).resolves.toBe(true);
    expect(statements.join("\n")).toContain("deletion_progress = 'sweep_pending'");
    expect(statements.join("\n")).toContain("deletion_progress = 'complete'");
    expect(statements.join("\n")).toContain("connection_generation = ?");
  });
});

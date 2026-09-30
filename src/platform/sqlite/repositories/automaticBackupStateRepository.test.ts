import { describe, expect, it } from "@jest/globals";
import type { SqliteKernel, SqliteTransactionExecutor } from "../sqliteKernel";
import { createAutomaticBackupStateRepository } from "./automaticBackupStateRepository";
import { AUTOMATIC_BACKUP_GENERATION_TRIGGER_STATEMENTS, automaticDriveBackupMigration } from "../migrations/0023_automatic_drive_backup";

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
    expect(statements.join("\n")).toContain("COALESCE(?, account_display_label)");
  });

  it("persists and reads one bounded pending handover claim", async () => {
    const statements: string[] = [];
    const repository = createAutomaticBackupStateRepository({
      queryAll: async (sql: string) => sql.includes("automatic_backup_receipt_state")
        ? [{
          attempt_id: "attempt", environment: "development-test", permission_id: "permission",
          connection_generation: 4, manifest_file_id: "manifest", manifest_etag: "etag",
          remote_writer_epoch: 7, snapshot_id: "snapshot", source_digest: "a".repeat(64),
        }]
        : [],
      write: async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) => command({
        execute: async (sql: string) => { statements.push(sql); return { changes: 1, lastInsertRowId: 0 }; },
        queryAll: async () => [],
      }), connectionConfiguration: async () => undefined, close: async () => undefined,
    } as unknown as SqliteKernel);
    const pending = {
      attemptId: "attempt", environment: "development-test" as const, permissionId: "permission",
      connectionGeneration: 4, manifestId: "manifest", manifestEtag: "etag",
      remoteWriterEpoch: 7, snapshotId: "snapshot", sourceDigest: "a".repeat(64), nowMs: 100,
    };

    await repository.persistPendingHandover(pending);
    await expect(repository.readPendingHandover()).resolves.toEqual({
      attemptId: "attempt", environment: "development-test", permissionId: "permission",
      connectionGeneration: 4, manifestId: "manifest", manifestEtag: "etag",
      remoteWriterEpoch: 7, snapshotId: "snapshot", sourceDigest: "a".repeat(64),
    });
    expect(statements.join("\n")).toContain("status_code = 'finishing'");
    expect(statements.join("\n")).toContain("automatic_backup_receipt_state");
  });
  it("returns only bounded state and conditionally acknowledges captured generation", async () => {
    const repository = createAutomaticBackupStateRepository({
      queryAll: async () => [{ environment: "development-test", permission_id: "permission", display_email: "…@example.com", connection_generation: 2, writer_epoch: 3, mutation_generation: 5, backed_up_generation: 4, last_attempt_ms: 10, last_success_ms: 11 }],
      write: async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) => command({ execute: async () => ({ changes: 1, lastInsertRowId: 0 }), queryAll: async () => [] }), connectionConfiguration: async () => undefined, close: async () => undefined,
    } as unknown as SqliteKernel);
    await expect(repository.read()).resolves.toMatchObject({ environment: "development-test", mutationGeneration: 5, lastAttemptMs: 10, lastSuccessMs: 11 });
    await expect(repository.acknowledge({ environment: "development-test", permissionId: "permission", writerEpoch: 3, capturedGeneration: 5 })).resolves.toBe(true);
  });

  it("fails closed for missing, stale, and malformed pending handover state", async () => {
    const pendingRow = {
      attempt_id: "attempt", environment: "development-test", permission_id: "permission",
      connection_generation: 4, manifest_file_id: "manifest", manifest_etag: "etag",
      remote_writer_epoch: 7, snapshot_id: "snapshot", source_digest: "a".repeat(64),
    };
    const repository = (changes: readonly number[], rows: readonly Record<string, unknown>[]) => {
      let index = 0;
      return createAutomaticBackupStateRepository({
        queryAll: async () => rows,
        write: async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) => command({
          execute: async () => ({ changes: changes[index++] ?? 1, lastInsertRowId: 0 }),
          queryAll: async () => [],
        }), connectionConfiguration: async () => undefined, close: async () => undefined,
      } as unknown as SqliteKernel);
    };
    const pending = {
      attemptId: "attempt", environment: "development-test" as const, permissionId: "permission",
      connectionGeneration: 4, manifestId: "manifest", manifestEtag: "etag",
      remoteWriterEpoch: 7, snapshotId: "snapshot", sourceDigest: "a".repeat(64), nowMs: 100,
    };
    await expect(repository([0], []).persistPendingHandover(pending))
      .rejects.toThrow("automatic_backup_receipt_missing");
    await expect(repository([1, 0], []).persistPendingHandover(pending))
      .rejects.toThrow("automatic_backup_state_fence_changed");
    await expect(repository([], []).readPendingHandover()).resolves.toBeNull();
    await expect(repository([], [{ ...pendingRow, source_digest: "bad" }]).readPendingHandover())
      .rejects.toThrow("automatic_backup_pending_handover_invalid");
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
    const fence = {
      environment: "development-test" as const,
      permissionId: "permission",
      connectionGeneration: 2,
      manifestId: "manifest",
      manifestEtag: "tombstone-etag",
      successorWriterEpoch: 4,
    };
    await expect(repository.beginDeletionSweep(fence)).resolves.toBe(true);
    await expect(repository.completeDeletionSweep(fence)).resolves.toBe(true);
    expect(statements.join("\n")).toContain("deletion_progress = 'sweep_pending'");
    expect(statements.join("\n")).toContain("manifest_file_id = ?");
    expect(statements.join("\n")).toContain("writer_epoch = ?");
    expect(statements.join("\n")).toContain("deletion_progress = 'complete'");
    expect(statements.join("\n")).toContain("connection_generation = ?");
  });

  it("accepts only the complete bounded persisted state domain", async () => {
    const valid = {
      environment: "production", permission_id: "permission", display_email: "owner@example.com", account_display_label: "…@example.com",
      connection_generation: 2, writer_epoch: 3, mutation_generation: 6, backed_up_generation: 4,
      manifest_file_id: "manifest", manifest_etag: "etag", authority_state: "deleted", dirty_since_ms: 7,
      data_use_policy: "wifi-only", claim_id: "claim", claim_expires_at_ms: 9, status_code: "paused", deletion_progress: "complete",
    };
    const make = (rows: unknown[]) => createAutomaticBackupStateRepository({
      queryAll: async () => rows, write: async () => ({ changes: 1, lastInsertRowId: 0 }), connectionConfiguration: async () => undefined, close: async () => undefined,
    } as unknown as SqliteKernel);
    await expect(make([valid]).read()).resolves.toMatchObject({ environment: "production", accountDisplayLabel: "…@example.com", deletionProgress: "complete" });
    await expect(make([{ ...valid, permission_id: null, display_email: null }]).read()).resolves.toMatchObject({ permissionId: null, displayEmail: null });
    for (const row of [
      {}, { ...valid, environment: "other" }, { ...valid, connection_generation: 1.5 }, { ...valid, authority_state: "other" },
      { ...valid, data_use_policy: "offline" }, { ...valid, status_code: "other" }, { ...valid, deletion_progress: "other" },
      { ...valid, deletion_progress: "complete", authority_state: "active" }, { ...valid, account_display_label: "raw@example.com" },
    ]) await expect(make([row]).read()).rejects.toThrow("automatic_backup_state_invalid");
    await expect(make([]).read()).rejects.toThrow("automatic_backup_state_invalid");
    await expect(make([valid, valid]).read()).rejects.toThrow("automatic_backup_state_invalid");
  });

  it("executes every conditional state mutation and propagates missing-row fences", async () => {
    let changes = 1;
    const sql: string[] = [];
    const repository = createAutomaticBackupStateRepository({
      queryAll: async () => [],
      write: async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) => command({
        execute: async (statement: string) => { sql.push(statement); return { changes, lastInsertRowId: 0 }; }, queryAll: async () => [],
      }), connectionConfiguration: async () => undefined, close: async () => undefined,
    } as unknown as SqliteKernel);
    const receipt = { environment: "development-test" as const, permissionId: "permission", connectionGeneration: 2, writerEpoch: 3, capturedGeneration: 5, sourceDigest: "a".repeat(64), snapshotId: "snapshot", manifestId: "manifest", manifestEtag: "etag" };
    await repository.persistAttempt({ ...receipt, candidateId: "candidate", resumableLocation: "https://www.googleapis.com/upload/session", resumableUploadedBytes: 3, nowMs: 1 });
    await expect(repository.acquireLease({ leaseId: "lease", nowMs: 1, expiresAtMs: 2 })).resolves.toBe(true);
    await expect(repository.recoverExpiredLease(2)).resolves.toBe(true);
    await expect(repository.activateWriter({ manifestId: "manifest", manifestEtag: "etag", writerEpoch: 4, permissionId: "permission", connectionGeneration: 2 })).resolves.toBe(true);
    await expect(repository.markStaleWriter(4)).resolves.toBe(true);
    await expect(repository.clearExpiredClaim(2)).resolves.toBe(true);
    expect(sql.join("\n")).toContain("resumable_location");
    expect(sql.join("\n")).toContain("last_attempt_ms");
    expect(sql.join("\n")).toContain("accepted_manifest_etag = ?");
    changes = 0;
    await expect(repository.acknowledge({ environment: "development-test", permissionId: "permission", writerEpoch: 3, capturedGeneration: 5 })).resolves.toBe(false);
    await expect(repository.acknowledgeReceipt(receipt)).resolves.toBe(false);
    await expect(repository.acquireLease({ leaseId: "lease", nowMs: 1, expiresAtMs: 2 })).resolves.toBe(false);
    await expect(repository.recoverExpiredLease(2)).resolves.toBe(false);
    await expect(repository.activateWriter({ manifestId: "manifest", manifestEtag: "etag", writerEpoch: 4, permissionId: "permission", connectionGeneration: 2 })).resolves.toBe(false);
    await expect(repository.markStaleWriter(4)).resolves.toBe(false);
    await expect(repository.clearExpiredClaim(2)).resolves.toBe(false);
    await expect(repository.persistAttempt({ ...receipt, candidateId: "candidate", nowMs: 1 })).rejects.toThrow("automatic_backup_state_fence_changed");
    await expect(repository.setRecoveryStatus("idle")).rejects.toThrow("automatic_backup_state_missing");
    await expect(repository.setDataUsePolicy("any-network")).rejects.toThrow("automatic_backup_state_missing");
    await expect(repository.beginQuarantine({ environment: "development-test", permissionId: "permission", connectionGeneration: 2 })).rejects.toThrow("automatic_backup_state_missing");
    await expect(repository.disconnectLocal()).rejects.toThrow("automatic_backup_state_missing");

    const missingReceipt = createAutomaticBackupStateRepository({
      queryAll: async () => [],
      write: async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) => {
        let call = 0;
        return command({
          execute: async () => ({ changes: call++ === 0 ? 1 : 0, lastInsertRowId: 0 }),
          queryAll: async () => [],
        });
      },
      connectionConfiguration: async () => undefined,
      close: async () => undefined,
    } as unknown as SqliteKernel);
    await expect(missingReceipt.persistAttempt({
      ...receipt,
      candidateId: "candidate",
      nowMs: 1,
    })).rejects.toThrow("automatic_backup_receipt_missing");
  });

  it("creates every automatic-backup durable boundary and rejects incomplete schema verification", async () => {
    const statements: string[] = [];
    const transaction = {
      execute: async (sql: string) => { statements.push(sql); return { changes: 1, lastInsertRowId: 0 }; },
      queryAll: async (sql: string) => sql.includes("automatic_backup_state")
        ? [{ id: 1, mutation_generation: 3, backed_up_generation: 2 }]
        : AUTOMATIC_BACKUP_GENERATION_TRIGGER_STATEMENTS.map((_, index) => ({ name: `automatic_backup_generation_${index}` })),
    };
    await automaticDriveBackupMigration.up(transaction as SqliteTransactionExecutor);
    expect(statements.filter((sql) => sql.startsWith("CREATE TRIGGER automatic_backup_generation_")).length).toBe(AUTOMATIC_BACKUP_GENERATION_TRIGGER_STATEMENTS.length);
    await expect(automaticDriveBackupMigration.verify(transaction as SqliteTransactionExecutor)).resolves.toBeUndefined();
    await expect(automaticDriveBackupMigration.verify({ ...transaction, queryAll: async () => [] } as unknown as SqliteTransactionExecutor)).rejects.toThrow("automatic_backup_schema_incomplete");
    await expect(automaticDriveBackupMigration.verify({ ...transaction, queryAll: async (sql: string) => sql.includes("automatic_backup_state") ? [{ id: 1, mutation_generation: 1, backed_up_generation: 2 }] : [] } as unknown as SqliteTransactionExecutor)).rejects.toThrow("automatic_backup_schema_incomplete");
    await expect(automaticDriveBackupMigration.verify({ ...transaction, queryAll: async (sql: string) => sql.includes("automatic_backup_state") ? [{ id: 1, mutation_generation: 2, backed_up_generation: 2 }] : [] } as unknown as SqliteTransactionExecutor)).rejects.toThrow("automatic_backup_schema_incomplete");
  });
});

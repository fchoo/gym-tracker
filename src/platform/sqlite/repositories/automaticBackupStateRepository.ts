import type { SqliteKernel } from "../sqliteKernel";

export type AutomaticBackupState = Readonly<{
  environment: "production" | "development-test"; permissionId: string | null; displayEmail: string | null;
  connectionGeneration: number; writerEpoch: number; mutationGeneration: number; backedUpGeneration: number;
}>;

export type AutomaticBackupReceipt = Readonly<{
  environment: AutomaticBackupState["environment"]; permissionId: string; connectionGeneration: number;
  writerEpoch: number; capturedGeneration: number; sourceDigest: string; snapshotId: string;
  manifestId: string; manifestEtag: string;
}>;

export function createAutomaticBackupStateRepository(kernel: SqliteKernel): Readonly<{
  read(): Promise<AutomaticBackupState>;
  acknowledge(input: Readonly<{ environment: AutomaticBackupState["environment"]; permissionId: string; writerEpoch: number; capturedGeneration: number }>): Promise<boolean>;
  acknowledgeReceipt(input: AutomaticBackupReceipt): Promise<boolean>;
  persistAttempt(input: AutomaticBackupReceipt & Readonly<{ candidateId: string; resumableLocation?: string; resumableUploadedBytes?: number; nowMs: number }>): Promise<void>;
  acquireLease(input: Readonly<{ leaseId: string; nowMs: number; expiresAtMs: number }>): Promise<boolean>;
  recoverExpiredLease(nowMs: number): Promise<boolean>;
}> {
  return Object.freeze({
    async read() {
      const rows = await kernel.queryAll<Record<string, unknown>>("SELECT environment, permission_id, display_email, connection_generation, writer_epoch, mutation_generation, backed_up_generation FROM automatic_backup_state WHERE id = 1");
      const row = rows[0];
      if (rows.length !== 1 || row === undefined || (row.environment !== "production" && row.environment !== "development-test") || !Number.isSafeInteger(row.connection_generation) || !Number.isSafeInteger(row.writer_epoch) || !Number.isSafeInteger(row.mutation_generation) || !Number.isSafeInteger(row.backed_up_generation)) throw new Error("automatic_backup_state_invalid");
      const environment = row.environment as AutomaticBackupState["environment"];
      const connectionGeneration = row.connection_generation as number;
      const writerEpoch = row.writer_epoch as number;
      const mutationGeneration = row.mutation_generation as number;
      const backedUpGeneration = row.backed_up_generation as number;
      return Object.freeze({ environment, permissionId: typeof row.permission_id === "string" ? row.permission_id : null, displayEmail: typeof row.display_email === "string" ? row.display_email : null, connectionGeneration, writerEpoch, mutationGeneration, backedUpGeneration });
    },
    async acknowledge(input: Readonly<{ environment: AutomaticBackupState["environment"]; permissionId: string; writerEpoch: number; capturedGeneration: number }>) {
      const outcome = await kernel.write((transaction) => transaction.execute(
        `UPDATE automatic_backup_state SET backed_up_generation = ? WHERE id = 1
         AND environment = ? AND permission_id = ? AND writer_epoch = ? AND mutation_generation >= ?`,
        [input.capturedGeneration, input.environment, input.permissionId, input.writerEpoch, input.capturedGeneration],
      ));
      return outcome.changes === 1;
    },
    async acknowledgeReceipt(input) {
      const outcome = await kernel.write((transaction) => transaction.execute(
        `UPDATE automatic_backup_state SET backed_up_generation = ?, dirty_since_ms = CASE
           WHEN mutation_generation = ? THEN NULL ELSE dirty_since_ms END, last_success_ms = last_attempt_ms
         WHERE id = 1 AND environment = ? AND permission_id = ? AND connection_generation = ?
           AND writer_epoch = ? AND mutation_generation >= ?
           AND EXISTS (SELECT 1 FROM automatic_backup_receipt_state receipt WHERE receipt.id = 1
             AND receipt.environment = ? AND receipt.permission_id = ? AND receipt.connection_generation = ?
             AND receipt.writer_epoch = ? AND receipt.captured_generation = ? AND receipt.source_digest = ?
             AND receipt.snapshot_id = ? AND receipt.manifest_file_id = ? AND receipt.accepted_manifest_etag = ?)`,
        [input.capturedGeneration, input.capturedGeneration, input.environment, input.permissionId,
          input.connectionGeneration, input.writerEpoch, input.capturedGeneration, input.environment,
          input.permissionId, input.connectionGeneration, input.writerEpoch, input.capturedGeneration,
          input.sourceDigest, input.snapshotId, input.manifestId, input.manifestEtag],
      ));
      return outcome.changes === 1;
    },
    async persistAttempt(input) {
      await kernel.write(async (transaction) => {
        const outcome = await transaction.execute(
          `UPDATE automatic_backup_receipt_state SET permission_id = ?, environment = ?, connection_generation = ?,
             writer_epoch = ?, captured_generation = ?, source_digest = ?, snapshot_id = ?, manifest_file_id = ?,
             accepted_manifest_etag = ?, candidate_id = ?, resumable_location = ?, resumable_uploaded_bytes = ?,
             updated_at_ms = ? WHERE id = 1`,
          [input.permissionId, input.environment, input.connectionGeneration, input.writerEpoch,
            input.capturedGeneration, input.sourceDigest, input.snapshotId, input.manifestId, input.manifestEtag,
            input.candidateId, input.resumableLocation ?? null, input.resumableUploadedBytes ?? 0, input.nowMs],
        );
        if (outcome.changes !== 1) throw new Error("automatic_backup_receipt_missing");
      });
    },
    async acquireLease(input) {
      const outcome = await kernel.write((transaction) => transaction.execute(
        `UPDATE automatic_backup_receipt_state SET lease_id = ?, lease_expires_at_ms = ?, updated_at_ms = ?
         WHERE id = 1 AND (lease_id IS NULL OR lease_expires_at_ms IS NULL OR lease_expires_at_ms <= ?)`,
        [input.leaseId, input.expiresAtMs, input.nowMs, input.nowMs],
      ));
      return outcome.changes === 1;
    },
    async recoverExpiredLease(nowMs) {
      const outcome = await kernel.write((transaction) => transaction.execute(
        `UPDATE automatic_backup_receipt_state SET lease_id = NULL, lease_expires_at_ms = NULL
         WHERE id = 1 AND lease_id IS NOT NULL AND lease_expires_at_ms <= ?`, [nowMs],
      ));
      return outcome.changes === 1;
    },
  });
}

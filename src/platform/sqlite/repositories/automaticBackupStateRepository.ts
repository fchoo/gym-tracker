import type { SqliteKernel } from "../sqliteKernel";

export type AutomaticBackupState = Readonly<{
  environment: "production" | "development-test"; permissionId: string | null; displayEmail: string | null; accountDisplayLabel: string | null;
  connectionGeneration: number; writerEpoch: number; mutationGeneration: number; backedUpGeneration: number;
  manifestId: string | null; manifestEtag: string | null;
  authorityState: "quarantine" | "active" | "stale_writer" | "deleted";
  dirtySinceMs: number | null; lastAttemptMs: number | null; lastSuccessMs: number | null;
  dataUsePolicy: "any-network" | "wifi-only";
  claimId: string | null; claimExpiresAtMs: number | null;
  statusCode: AutomaticBackupRecoveryStatus;
  deletionProgress: "none" | "sweep_pending" | "complete";
}>;

export type AutomaticBackupReceipt = Readonly<{
  environment: AutomaticBackupState["environment"]; permissionId: string; connectionGeneration: number;
  writerEpoch: number; capturedGeneration: number; sourceDigest: string; snapshotId: string;
  manifestId: string; manifestEtag: string;
}>;

export type AutomaticBackupPendingHandover = Readonly<{
  attemptId: string;
  environment: AutomaticBackupState["environment"];
  permissionId: string;
  connectionGeneration: number;
  manifestId: string;
  manifestEtag: string;
  remoteWriterEpoch: number;
  snapshotId: string;
  sourceDigest: string;
}>;
export type AutomaticBackupPendingUpload = AutomaticBackupReceipt & Readonly<{
  candidateId: string;
  resumableLocation: string | null;
  resumableUploadedBytes: number;
  updatedAtMs: number;
}>;

export type AutomaticBackupRecoveryStatus =
  | "idle"
  | "checking"
  | "restore_pending"
  | "restoring"
  | "finishing"
  | "paused";

export function createAutomaticBackupStateRepository(kernel: SqliteKernel): Readonly<{
  read(): Promise<AutomaticBackupState>;
  acknowledge(input: Readonly<{ environment: AutomaticBackupState["environment"]; permissionId: string; writerEpoch: number; capturedGeneration: number }>): Promise<boolean>;
  acknowledgeReceipt(input: AutomaticBackupReceipt): Promise<boolean>;
  persistAttempt(input: AutomaticBackupReceipt & Readonly<{ candidateId: string; resumableLocation?: string; resumableUploadedBytes?: number; nowMs: number }>): Promise<void>;
  readPendingUpload(input: Readonly<{ environment: AutomaticBackupState["environment"]; permissionId: string; connectionGeneration: number; writerEpoch: number }>): Promise<AutomaticBackupPendingUpload | null>;
  updateResumableUpload(input: Readonly<{ candidateId: string; location: string; uploadedBytes: number; nowMs: number }>): Promise<boolean>;
  acquireLease(input: Readonly<{ leaseId: string; nowMs: number; expiresAtMs: number }>): Promise<boolean>;
  recoverExpiredLease(nowMs: number): Promise<boolean>;
  releaseLease(leaseId: string): Promise<boolean>;
  beginQuarantine(input: Readonly<{ environment: AutomaticBackupState["environment"]; permissionId: string; connectionGeneration: number; accountDisplayLabel?: string | null }>): Promise<void>;
  activateWriter(input: Readonly<{ manifestId: string; manifestEtag: string; writerEpoch: number; permissionId: string; connectionGeneration: number }>): Promise<boolean>;
  markStaleWriter(writerEpoch: number): Promise<boolean>;
  clearExpiredClaim(nowMs: number): Promise<boolean>;
  setRecoveryStatus(status: AutomaticBackupRecoveryStatus): Promise<void>;
  setDataUsePolicy(policy: AutomaticBackupState["dataUsePolicy"]): Promise<void>;
  persistPendingHandover(input: AutomaticBackupPendingHandover & Readonly<{ nowMs: number }>): Promise<void>;
  readPendingHandover(): Promise<AutomaticBackupPendingHandover | null>;
  beginDeletionSweep(input: Readonly<{
    environment: AutomaticBackupState["environment"];
    permissionId: string;
    connectionGeneration: number;
    manifestId: string;
    manifestEtag: string;
    successorWriterEpoch: number;
  }>): Promise<boolean>;
  completeDeletionSweep(input: Readonly<{ environment: AutomaticBackupState["environment"]; permissionId: string; connectionGeneration: number }>): Promise<boolean>;
  /** Clears only this installation's authority; it never calls a Drive delete operation. */
  disconnectLocal(): Promise<void>;
}> {
  return Object.freeze({
    async read() {
      const rows = await kernel.queryAll<Record<string, unknown>>("SELECT environment, permission_id, display_email, account_display_label, connection_generation, manifest_file_id, manifest_etag, writer_epoch, authority_state, mutation_generation, backed_up_generation, dirty_since_ms, last_attempt_ms, last_success_ms, data_use_policy, claim_id, claim_expires_at_ms, status_code, deletion_progress FROM automatic_backup_state WHERE id = 1");
      const row = rows[0];
      if (rows.length !== 1 || row === undefined || (row.environment !== "production" && row.environment !== "development-test") || !Number.isSafeInteger(row.connection_generation) || !Number.isSafeInteger(row.writer_epoch) || !Number.isSafeInteger(row.mutation_generation) || !Number.isSafeInteger(row.backed_up_generation)) throw new Error("automatic_backup_state_invalid");
      const environment = row.environment as AutomaticBackupState["environment"];
      const connectionGeneration = row.connection_generation as number;
      const writerEpoch = row.writer_epoch as number;
      const mutationGeneration = row.mutation_generation as number;
      const backedUpGeneration = row.backed_up_generation as number;
      // Older read-only test doubles intentionally expose only the v23 fence
      // columns. The persisted schema always contains these defaults; retaining
      // them here keeps the repository boundary backward compatible.
      const authorityState = row.authority_state ?? "quarantine";
      const dataUsePolicy = row.data_use_policy ?? "any-network";
      if (authorityState !== "quarantine" && authorityState !== "active" && authorityState !== "stale_writer" && authorityState !== "deleted") throw new Error("automatic_backup_state_invalid");
      if (dataUsePolicy !== "any-network" && dataUsePolicy !== "wifi-only") throw new Error("automatic_backup_state_invalid");
      const statusCode = row.status_code ?? "idle";
      if (statusCode !== "idle" && statusCode !== "checking" && statusCode !== "restore_pending" && statusCode !== "restoring" && statusCode !== "finishing" && statusCode !== "paused") throw new Error("automatic_backup_state_invalid");
      const deletionProgress = row.deletion_progress ?? "none";
      if (deletionProgress !== "none" && deletionProgress !== "sweep_pending" && deletionProgress !== "complete") throw new Error("automatic_backup_state_invalid");
      if (deletionProgress !== "none" && authorityState !== "deleted") throw new Error("automatic_backup_state_invalid");
      const accountDisplayLabel = typeof row.account_display_label === "string" ? row.account_display_label : null;
      if (accountDisplayLabel !== null && (!/^…@[^@\r\n]{1,315}$/u.test(accountDisplayLabel))) throw new Error("automatic_backup_state_invalid");
      return Object.freeze({ environment, permissionId: typeof row.permission_id === "string" ? row.permission_id : null, displayEmail: typeof row.display_email === "string" ? row.display_email : null, accountDisplayLabel, connectionGeneration, writerEpoch, mutationGeneration, backedUpGeneration, manifestId: typeof row.manifest_file_id === "string" ? row.manifest_file_id : null, manifestEtag: typeof row.manifest_etag === "string" ? row.manifest_etag : null, authorityState, dirtySinceMs: typeof row.dirty_since_ms === "number" ? row.dirty_since_ms : null, lastAttemptMs: typeof row.last_attempt_ms === "number" ? row.last_attempt_ms : null, lastSuccessMs: typeof row.last_success_ms === "number" ? row.last_success_ms : null, dataUsePolicy, claimId: typeof row.claim_id === "string" ? row.claim_id : null, claimExpiresAtMs: typeof row.claim_expires_at_ms === "number" ? row.claim_expires_at_ms : null, statusCode, deletionProgress });
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
      return kernel.write(async (transaction) => {
        const receipt = await transaction.execute(
          `UPDATE automatic_backup_receipt_state SET accepted_manifest_etag = ?, candidate_id = NULL,
             resumable_location = NULL, resumable_uploaded_bytes = 0, lease_id = NULL, lease_expires_at_ms = NULL
           WHERE id = 1 AND environment = ? AND permission_id = ? AND connection_generation = ?
             AND writer_epoch = ? AND captured_generation = ? AND source_digest = ?
             AND snapshot_id = ? AND manifest_file_id = ?`,
          [input.manifestEtag, input.environment, input.permissionId,
            input.connectionGeneration, input.writerEpoch, input.capturedGeneration,
            input.sourceDigest, input.snapshotId, input.manifestId],
        );
        if (receipt.changes !== 1) return false;
        const outcome = await transaction.execute(
          `UPDATE automatic_backup_state SET backed_up_generation = ?, dirty_since_ms = CASE
             WHEN mutation_generation = ? THEN NULL ELSE dirty_since_ms END,
             last_success_ms = last_attempt_ms, manifest_etag = ?
           WHERE id = 1 AND environment = ? AND permission_id = ? AND connection_generation = ?
             AND writer_epoch = ? AND mutation_generation >= ?
             AND EXISTS (SELECT 1 FROM automatic_backup_receipt_state receipt WHERE receipt.id = 1
               AND receipt.environment = ? AND receipt.permission_id = ? AND receipt.connection_generation = ?
               AND receipt.writer_epoch = ? AND receipt.captured_generation = ? AND receipt.source_digest = ?
               AND receipt.snapshot_id = ? AND receipt.manifest_file_id = ? AND receipt.accepted_manifest_etag = ?)`,
          [input.capturedGeneration, input.capturedGeneration, input.manifestEtag,
            input.environment, input.permissionId,
            input.connectionGeneration, input.writerEpoch, input.capturedGeneration, input.environment,
            input.permissionId, input.connectionGeneration, input.writerEpoch, input.capturedGeneration,
            input.sourceDigest, input.snapshotId, input.manifestId, input.manifestEtag],
        );
        return outcome.changes === 1;
      });
    },
    async readPendingUpload(input) {
      const rows = await kernel.queryAll<Record<string, unknown>>(
        `SELECT environment, permission_id, connection_generation, writer_epoch,
           captured_generation, source_digest, snapshot_id, manifest_file_id,
           accepted_manifest_etag, candidate_id, resumable_location,
           resumable_uploaded_bytes, updated_at_ms
         FROM automatic_backup_receipt_state
         WHERE id = 1 AND environment = ? AND permission_id = ?
           AND connection_generation = ? AND writer_epoch = ? AND candidate_id IS NOT NULL`,
        [input.environment, input.permissionId, input.connectionGeneration, input.writerEpoch],
      );
      if (rows.length === 0) return null;
      const row = rows[0]!;
      const location = row.resumable_location;
      const valid = rows.length === 1
        && row.environment === input.environment && row.permission_id === input.permissionId
        && row.connection_generation === input.connectionGeneration && row.writer_epoch === input.writerEpoch
        && Number.isSafeInteger(row.captured_generation) && (row.captured_generation as number) >= 0
        && typeof row.source_digest === "string" && /^[a-f0-9]{64}$/u.test(row.source_digest)
        && typeof row.snapshot_id === "string" && row.snapshot_id.length > 0
        && typeof row.manifest_file_id === "string" && row.manifest_file_id.length > 0
        && typeof row.accepted_manifest_etag === "string" && row.accepted_manifest_etag.length > 0
        && typeof row.candidate_id === "string" && row.candidate_id.length > 0
        && (location === null || (typeof location === "string" && location.length <= 2048
          && new URL(location).origin === "https://www.googleapis.com"))
        && Number.isSafeInteger(row.resumable_uploaded_bytes) && (row.resumable_uploaded_bytes as number) >= 0
        && Number.isSafeInteger(row.updated_at_ms) && (row.updated_at_ms as number) >= 0;
      if (!valid) throw new Error("automatic_backup_pending_upload_invalid");
      return Object.freeze({
        environment: row.environment as AutomaticBackupState["environment"],
        permissionId: row.permission_id as string,
        connectionGeneration: row.connection_generation as number,
        writerEpoch: row.writer_epoch as number,
        capturedGeneration: row.captured_generation as number,
        sourceDigest: row.source_digest as string,
        snapshotId: row.snapshot_id as string,
        manifestId: row.manifest_file_id as string,
        manifestEtag: row.accepted_manifest_etag as string,
        candidateId: row.candidate_id as string,
        resumableLocation: location as string | null,
        resumableUploadedBytes: row.resumable_uploaded_bytes as number,
        updatedAtMs: row.updated_at_ms as number,
      });
    },
    async updateResumableUpload(input) {
      const outcome = await kernel.write((transaction) => transaction.execute(
        `UPDATE automatic_backup_receipt_state SET resumable_location = ?, resumable_uploaded_bytes = ?, updated_at_ms = ?
         WHERE id = 1 AND candidate_id = ? AND accepted_manifest_etag IS NOT NULL`,
        [input.location, input.uploadedBytes, input.nowMs, input.candidateId],
      ));
      return outcome.changes === 1;
    },
    async persistAttempt(input) {
      await kernel.write(async (transaction) => {
        const state = await transaction.execute(
          `UPDATE automatic_backup_state SET last_attempt_ms = ?
           WHERE id = 1 AND environment = ? AND permission_id = ? AND connection_generation = ?`,
          [input.nowMs, input.environment, input.permissionId, input.connectionGeneration],
        );
        if (state.changes !== 1) throw new Error("automatic_backup_state_fence_changed");
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
    async releaseLease(leaseId) {
      const outcome = await kernel.write((transaction) => transaction.execute(
        `UPDATE automatic_backup_receipt_state SET lease_id = NULL, lease_expires_at_ms = NULL
         WHERE id = 1 AND lease_id = ?`, [leaseId],
      ));
      return outcome.changes === 1;
    },
    async beginQuarantine(input) {
      await kernel.write(async (transaction) => {
        const outcome = await transaction.execute(
          `UPDATE automatic_backup_state SET environment = ?, permission_id = ?,
             account_display_label = COALESCE(?, account_display_label), connection_generation = ?,
             authority_state = 'quarantine', deletion_progress = 'none', claim_id = NULL, claim_expires_at_ms = NULL
           WHERE id = 1 AND (authority_state <> 'deleted' OR deletion_progress = 'complete')`,
          [input.environment, input.permissionId, input.accountDisplayLabel ?? null, input.connectionGeneration],
        );
        if (outcome.changes !== 1) throw new Error("automatic_backup_state_missing");
      });
    },
    async activateWriter(input) {
      const outcome = await kernel.write((transaction) => transaction.execute(
        `UPDATE automatic_backup_state SET manifest_file_id = ?, manifest_etag = ?, writer_epoch = ?,
           permission_id = ?, connection_generation = ?, authority_state = 'active', claim_id = NULL,
           claim_expires_at_ms = NULL WHERE id = 1 AND authority_state = 'quarantine'
             AND permission_id = ? AND connection_generation = ?`,
        [input.manifestId, input.manifestEtag, input.writerEpoch, input.permissionId,
          input.connectionGeneration, input.permissionId, input.connectionGeneration],
      ));
      return outcome.changes === 1;
    },
    async markStaleWriter(writerEpoch) {
      const outcome = await kernel.write((transaction) => transaction.execute(
        "UPDATE automatic_backup_state SET authority_state = 'stale_writer' WHERE id = 1 AND writer_epoch = ?",
        [writerEpoch],
      ));
      return outcome.changes === 1;
    },
    async clearExpiredClaim(nowMs) {
      const outcome = await kernel.write((transaction) => transaction.execute(
        "UPDATE automatic_backup_state SET claim_id = NULL, claim_expires_at_ms = NULL WHERE id = 1 AND claim_id IS NOT NULL AND claim_expires_at_ms <= ?",
        [nowMs],
      ));
      return outcome.changes === 1;
    },
    async setRecoveryStatus(status) {
      await kernel.write(async (transaction) => {
        const outcome = await transaction.execute(
          "UPDATE automatic_backup_state SET status_code = ? WHERE id = 1",
          [status],
        );
        if (outcome.changes !== 1) throw new Error("automatic_backup_state_missing");
      });
    },
    async setDataUsePolicy(policy) {
      await kernel.write(async (transaction) => {
        const outcome = await transaction.execute(
          "UPDATE automatic_backup_state SET data_use_policy = ? WHERE id = 1",
          [policy],
        );
        if (outcome.changes !== 1) throw new Error("automatic_backup_state_missing");
      });
    },
    async persistPendingHandover(input) {
      await kernel.write(async (transaction) => {
        const receipt = await transaction.execute(
          `UPDATE automatic_backup_receipt_state SET permission_id = ?, environment = ?,
             connection_generation = ?, writer_epoch = ?, captured_generation = NULL,
             source_digest = ?, snapshot_id = ?, manifest_file_id = ?, accepted_manifest_etag = NULL,
             candidate_id = ?, resumable_location = NULL, resumable_uploaded_bytes = 0, updated_at_ms = ?
           WHERE id = 1`,
          [input.permissionId, input.environment, input.connectionGeneration,
            input.remoteWriterEpoch, input.sourceDigest, input.snapshotId,
            input.manifestId, input.attemptId, input.nowMs],
        );
        if (receipt.changes !== 1) throw new Error("automatic_backup_receipt_missing");
        const state = await transaction.execute(
          `UPDATE automatic_backup_state SET claim_id = ?, claim_expires_at_ms = NULL,
             status_code = 'finishing', manifest_file_id = ?, manifest_etag = ?
           WHERE id = 1 AND environment = ? AND permission_id = ?
             AND connection_generation = ? AND authority_state = 'quarantine'`,
          [input.attemptId, input.manifestId, input.manifestEtag, input.environment,
            input.permissionId, input.connectionGeneration],
        );
        if (state.changes !== 1) throw new Error("automatic_backup_state_fence_changed");
      });
    },
    async readPendingHandover() {
      const rows = await kernel.queryAll<Record<string, unknown>>(
        `SELECT state.claim_id AS attempt_id, state.environment, state.permission_id,
           state.connection_generation, receipt.manifest_file_id, state.manifest_etag,
           receipt.writer_epoch AS remote_writer_epoch, receipt.snapshot_id, receipt.source_digest
         FROM automatic_backup_state state
         JOIN automatic_backup_receipt_state receipt ON receipt.id = 1
           AND receipt.candidate_id = state.claim_id
         WHERE state.id = 1 AND state.status_code = 'finishing'
           AND state.authority_state = 'quarantine'`,
      );
      if (rows.length === 0) return null;
      const row = rows[0]!;
      const valid = rows.length === 1
        && typeof row.attempt_id === "string" && row.attempt_id.length > 0
        && (row.environment === "production" || row.environment === "development-test")
        && typeof row.permission_id === "string" && row.permission_id.length > 0
        && Number.isSafeInteger(row.connection_generation) && (row.connection_generation as number) >= 0
        && typeof row.manifest_file_id === "string" && row.manifest_file_id.length > 0
        && typeof row.manifest_etag === "string" && row.manifest_etag.length > 0
        && Number.isSafeInteger(row.remote_writer_epoch) && (row.remote_writer_epoch as number) >= 1
        && typeof row.snapshot_id === "string" && row.snapshot_id.length > 0
        && typeof row.source_digest === "string" && /^[a-f0-9]{64}$/u.test(row.source_digest);
      if (!valid) throw new Error("automatic_backup_pending_handover_invalid");
      return Object.freeze({
        attemptId: row.attempt_id as string,
        environment: row.environment as AutomaticBackupState["environment"],
        permissionId: row.permission_id as string,
        connectionGeneration: row.connection_generation as number,
        manifestId: row.manifest_file_id as string,
        manifestEtag: row.manifest_etag as string,
        remoteWriterEpoch: row.remote_writer_epoch as number,
        snapshotId: row.snapshot_id as string,
        sourceDigest: row.source_digest as string,
      });
    },
    async beginDeletionSweep(input) {
      const outcome = await kernel.write((transaction) => transaction.execute(
        `UPDATE automatic_backup_state SET authority_state = 'deleted', deletion_progress = 'sweep_pending', status_code = 'paused',
           manifest_file_id = ?, manifest_etag = ?, writer_epoch = ?
         WHERE id = 1 AND environment = ? AND permission_id = ? AND connection_generation = ? AND authority_state <> 'stale_writer'`,
        [input.manifestId, input.manifestEtag, input.successorWriterEpoch,
          input.environment, input.permissionId, input.connectionGeneration],
      ));
      return outcome.changes === 1;
    },
    async completeDeletionSweep(input) {
      const outcome = await kernel.write((transaction) => transaction.execute(
        `UPDATE automatic_backup_state SET deletion_progress = 'complete', status_code = 'idle'
         WHERE id = 1 AND environment = ? AND permission_id = ? AND connection_generation = ?
           AND authority_state = 'deleted' AND deletion_progress = 'sweep_pending'`,
        [input.environment, input.permissionId, input.connectionGeneration],
      ));
      return outcome.changes === 1;
    },
    async disconnectLocal() {
      await kernel.write(async (transaction) => {
        const outcome = await transaction.execute(
          `UPDATE automatic_backup_state SET permission_id = NULL, display_email = NULL, account_display_label = NULL,
             manifest_file_id = NULL, manifest_etag = NULL, writer_epoch = 0,
             authority_state = 'quarantine', claim_id = NULL, claim_expires_at_ms = NULL,
             status_code = 'idle', deletion_progress = 'none'
           WHERE id = 1 AND NOT (authority_state = 'deleted' AND deletion_progress = 'sweep_pending')`,
        );
        if (outcome.changes !== 1) {
          const rows = await transaction.queryAll<Record<string, unknown>>(
            "SELECT authority_state, deletion_progress FROM automatic_backup_state WHERE id = 1",
          );
          if (rows[0]?.authority_state === "deleted" && rows[0]?.deletion_progress === "sweep_pending") {
            throw new Error("automatic_backup_deletion_in_progress");
          }
          throw new Error("automatic_backup_state_missing");
        }
      });
    },
  });
}

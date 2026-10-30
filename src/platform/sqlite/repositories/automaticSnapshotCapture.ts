import type {
  LogicalBackupSnapshot,
} from "../../../domains/portability/backupContracts";
import type {
  SqliteKernel,
  SqliteReadTransactionExecutor,
  SqliteSnapshotKernel,
} from "../sqliteKernel";

export type AutomaticSnapshotCaptureDependencies = Readonly<{
  kernel: SqliteSnapshotKernel;
  onSnapshotStart?(): void;
  collect(
    transaction: SqliteReadTransactionExecutor,
    input: Readonly<{ snapshotId: string; createdAtMs: number }>,
  ): Promise<LogicalBackupSnapshot>;
}>;

export type AutomaticSnapshotCapturePort = Readonly<{
  capture(input: Readonly<{
    snapshotId: string;
    createdAtMs: number;
  }>): Promise<Readonly<{
    generation: number;
    snapshot: LogicalBackupSnapshot;
  }>>;
}>;

export class AutomaticSnapshotCaptureError extends Error {
  readonly kind = "storage" as const;
  readonly retryable = true;
  readonly correlationCode = "GT-BACKUP-CAPTURE01" as const;

  constructor(readonly code: "automatic_snapshot_capture_failed") {
    super(code);
    this.name = "AutomaticSnapshotCaptureError";
  }
}

export function createAutomaticSnapshotCapture(
  dependencies: AutomaticSnapshotCaptureDependencies,
): AutomaticSnapshotCapturePort {
  return Object.freeze({
    async capture(input) {
      try {
        return await dependencies.kernel.readSnapshot(async (transaction) => {
          const rows = await transaction.queryAll<{ mutation_generation: number }>(
            "SELECT mutation_generation FROM automatic_backup_state WHERE id = 1",
          );
          const generation = rows.length === 1 ? rows[0]?.mutation_generation : undefined;
          if (!Number.isSafeInteger(generation) || generation! < 0) {
            throw new AutomaticSnapshotCaptureError("automatic_snapshot_capture_failed");
          }
          dependencies.onSnapshotStart?.();
          const snapshot = await dependencies.collect(transaction, input);
          return Object.freeze({ generation: generation!, snapshot });
        });
      } catch {
        throw new AutomaticSnapshotCaptureError("automatic_snapshot_capture_failed");
      }
    },
  });
}

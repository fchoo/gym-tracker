import type {
  LogicalBackupSnapshot,
} from "../../../domains/portability/backupContracts";
import type {
  SqliteKernel,
} from "../sqliteKernel";

export const AUTOMATIC_SNAPSHOT_LEASE_PREFIX =
  "gym-tracker-automatic-snapshot-v1-" as const;
export const AUTOMATIC_SNAPSHOT_LEASE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const MAX_ORPHAN_LEASES_PER_SWEEP = 32;

export type AutomaticSnapshotCaptureDependencies = Readonly<{
  sourceDatabaseName: string;
  nowMs(): number;
  leaseId(): string;
  listLeaseFiles(): Promise<readonly Readonly<{
    name: string;
    modifiedAtMs: number;
  }>[]>;
  removeLeaseFile(name: string): Promise<void>;
  copyDatabase(sourceDatabaseName: string, destinationDatabaseName: string): Promise<void>;
  openCopiedKernel(databaseName: string): Promise<SqliteKernel>;
  collect(
    kernel: SqliteKernel,
    input: Readonly<{ snapshotId: string; createdAtMs: number }>,
  ): Promise<LogicalBackupSnapshot>;
}>;

export type AutomaticSnapshotCapturePort = Readonly<{
  sweepOrphans(): Promise<number>;
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

function leaseFileNames(databaseName: string): readonly string[] {
  return Object.freeze([databaseName, `${databaseName}-wal`, `${databaseName}-shm`]);
}

function leaseDatabaseName(fileName: string): string | null {
  const match = new RegExp(
    `^${AUTOMATIC_SNAPSHOT_LEASE_PREFIX}([A-Za-z0-9-]+)\\.db(?:-(?:wal|shm))?$`,
    "u",
  ).exec(fileName);
  return match === null
    ? null
    : `${AUTOMATIC_SNAPSHOT_LEASE_PREFIX}${match[1]!}.db`;
}

async function removeLease(
  dependencies: AutomaticSnapshotCaptureDependencies,
  databaseName: string,
): Promise<void> {
  const results = await Promise.allSettled(
    leaseFileNames(databaseName).map((name) => dependencies.removeLeaseFile(name)),
  );
  if (results.some(({ status }) => status === "rejected")) {
    throw new AutomaticSnapshotCaptureError("automatic_snapshot_capture_failed");
  }
}

export function createAutomaticSnapshotCapture(
  dependencies: AutomaticSnapshotCaptureDependencies,
): AutomaticSnapshotCapturePort {
  const sweepOrphans = async (): Promise<number> => {
    try {
      const nowMs = dependencies.nowMs();
      const leases = new Map<string, number>();
      for (const file of await dependencies.listLeaseFiles()) {
        const databaseName = leaseDatabaseName(file.name);
        if (databaseName === null || !Number.isFinite(file.modifiedAtMs)) continue;
        leases.set(
          databaseName,
          Math.max(leases.get(databaseName) ?? 0, file.modifiedAtMs),
        );
      }
      const stale = [...leases]
        .filter(([, modifiedAtMs]) => nowMs - modifiedAtMs >= AUTOMATIC_SNAPSHOT_LEASE_MAX_AGE_MS)
        .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
        .slice(0, MAX_ORPHAN_LEASES_PER_SWEEP);
      for (const [databaseName] of stale) {
        await removeLease(dependencies, databaseName);
      }
      return stale.length;
    } catch {
      throw new AutomaticSnapshotCaptureError("automatic_snapshot_capture_failed");
    }
  };

  return Object.freeze({
    sweepOrphans,
    async capture(input) {
      let copiedKernel: SqliteKernel | undefined;
      let failure: unknown;
      const leaseId = dependencies.leaseId();
      const databaseName = `${AUTOMATIC_SNAPSHOT_LEASE_PREFIX}${leaseId}.db`;
      try {
        if (!/^[A-Za-z0-9-]{1,128}$/u.test(leaseId)) {
          throw new AutomaticSnapshotCaptureError("automatic_snapshot_capture_failed");
        }
        await sweepOrphans();
        await dependencies.copyDatabase(dependencies.sourceDatabaseName, databaseName);
        copiedKernel = await dependencies.openCopiedKernel(databaseName);
        const rows = await copiedKernel.queryAll<{ mutation_generation: number }>(
          "SELECT mutation_generation FROM automatic_backup_state WHERE id = 1",
        );
        const generation = rows.length === 1 ? rows[0]?.mutation_generation : undefined;
        if (!Number.isSafeInteger(generation) || generation! < 0) {
          throw new AutomaticSnapshotCaptureError("automatic_snapshot_capture_failed");
        }
        const snapshot = await dependencies.collect(copiedKernel, input);
        return Object.freeze({ generation: generation!, snapshot });
      } catch (error) {
        failure = error;
        throw new AutomaticSnapshotCaptureError("automatic_snapshot_capture_failed");
      } finally {
        const closeResult = copiedKernel === undefined
          ? undefined
          : await copiedKernel.close().then(
            () => undefined,
            (error) => error,
          );
        const removeResult = await removeLease(dependencies, databaseName).then(
          () => undefined,
          (error) => error,
        );
        if (failure === undefined && (closeResult !== undefined || removeResult !== undefined)) {
          throw new AutomaticSnapshotCaptureError("automatic_snapshot_capture_failed");
        }
      }
    },
  });
}

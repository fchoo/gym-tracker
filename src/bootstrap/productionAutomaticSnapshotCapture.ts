import {
  createAutomaticSnapshotCapture,
  type AutomaticSnapshotCapturePort,
} from "../platform/sqlite/repositories/automaticSnapshotCapture";
import {
  collectLogicalBackupSnapshot,
} from "../platform/sqlite/repositories/logicalBackupRepository";
import type {
  SqliteKernel,
} from "../platform/sqlite";

export function createProductionAutomaticSnapshotCapture(input: Readonly<{
  kernel: SqliteKernel;
  onSnapshotStart?(): void;
}>): AutomaticSnapshotCapturePort {
  if (input.kernel.readSnapshot === undefined) {
    throw new Error("automatic_snapshot_reader_unavailable");
  }
  return createAutomaticSnapshotCapture({
    kernel: input.kernel as import("../platform/sqlite").SqliteSnapshotKernel,
    ...(input.onSnapshotStart === undefined
      ? {}
      : { onSnapshotStart: input.onSnapshotStart }),
    collect: collectLogicalBackupSnapshot,
  });
}

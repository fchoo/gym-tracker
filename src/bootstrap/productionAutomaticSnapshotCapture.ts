import {
  createAutomaticSnapshotCapture,
  type AutomaticSnapshotCapturePort,
} from "../platform/sqlite/repositories/automaticSnapshotCapture";
import {
  createLogicalBackupRepository,
} from "../platform/sqlite/repositories/logicalBackupRepository";
import {
  openSqliteKernel,
} from "../platform/sqlite";

export function createProductionAutomaticSnapshotCapture(input: Readonly<{
  sourceDatabaseName: string;
  nowMs(): number;
  leaseId(): string;
  onCopyStart?(): void;
}>): AutomaticSnapshotCapturePort {
  const {
    Directory,
    File,
  } = require("expo-file-system") as typeof import("expo-file-system");
  const {
    backupDatabaseAsync,
    defaultDatabaseDirectory,
    openDatabaseAsync,
  } = require("expo-sqlite") as typeof import("expo-sqlite");
  const options = {
    useNewConnection: true,
    finalizeUnusedStatementsBeforeClosing: false,
  } as const;

  return createAutomaticSnapshotCapture({
    ...input,
    async listLeaseFiles() {
      return new Directory(defaultDatabaseDirectory).list().map((entry) => ({
        name: entry.name,
        modifiedAtMs: "modificationTime" in entry
          ? entry.modificationTime ?? Number.NaN
          : Number.NaN,
      }));
    },
    async removeLeaseFile(name) {
      const file = new File(defaultDatabaseDirectory, name);
      if (file.exists) file.delete();
    },
    async copyDatabase(sourceName, destinationName) {
      const source = await openDatabaseAsync(sourceName, options);
      let destination: Awaited<ReturnType<typeof openDatabaseAsync>> | undefined;
      try {
        destination = await openDatabaseAsync(destinationName, options);
        input.onCopyStart?.();
        await backupDatabaseAsync({ sourceDatabase: source, destDatabase: destination });
      } finally {
        await Promise.allSettled([source.closeAsync(), destination?.closeAsync()]);
      }
    },
    openCopiedKernel: openSqliteKernel,
    collect: (copiedKernel, captureInput) =>
      createLogicalBackupRepository(copiedKernel).collect(captureInput),
  });
}

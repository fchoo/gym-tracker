import {
  createMigrationRunner,
} from "../platform/sqlite/migrationRunner";
import {
  migrations,
} from "../platform/sqlite/migrations";
import {
  createExpoRecoveryBackupPort,
  type RecoveryBackupManifest,
  type RecoveryBackupPort,
} from "../platform/sqlite/recoveryBackup";
import {
  openSqliteKernel,
  type SqliteKernel,
} from "../platform/sqlite";

type BenchmarkSuite = "phase1" | "phase2";

const retainedValidationKernels: SqliteKernel[] = [];

export type BenchmarkRecoveryDependencies = Readonly<{
  openSource(databaseName: string): Promise<unknown>;
  openDestination(databaseName: string): Promise<unknown>;
  backup(options: Readonly<{
    sourceDatabase: unknown;
    destDatabase: unknown;
  }>): Promise<void>;
  close(database: unknown): Promise<void>;
  validate(databaseName: string): Promise<SqliteKernel>;
  retainValidationKernel(kernel: SqliteKernel): void;
  remove(databaseName: string): Promise<void>;
  writeManifest(
    suite: BenchmarkSuite,
    manifest: RecoveryBackupManifest,
  ): Promise<void>;
  runMigrations(input: Readonly<{
    databaseName: string;
    kernel: SqliteKernel;
    recoveryBackup: RecoveryBackupPort;
  }>): Promise<void>;
}>;

const productionDependencies: BenchmarkRecoveryDependencies = {
  openSource(databaseName) {
    const {
      openDatabaseAsync,
    } = require("expo-sqlite") as typeof import("expo-sqlite");
    return openDatabaseAsync(databaseName, { useNewConnection: true });
  },
  openDestination(databaseName) {
    const {
      openDatabaseAsync,
    } = require("expo-sqlite") as typeof import("expo-sqlite");
    return openDatabaseAsync(databaseName, { useNewConnection: true });
  },
  backup({ sourceDatabase, destDatabase }) {
    const {
      backupDatabaseAsync,
    } = require("expo-sqlite") as typeof import("expo-sqlite");
    return backupDatabaseAsync({
      sourceDatabase: sourceDatabase as Parameters<
        typeof backupDatabaseAsync
      >[0]["sourceDatabase"],
      destDatabase: destDatabase as Parameters<
        typeof backupDatabaseAsync
      >[0]["destDatabase"],
    });
  },
  close(database) {
    return (
      database as Awaited<
        ReturnType<typeof import("expo-sqlite")["openDatabaseAsync"]>
      >
    ).closeAsync();
  },
  validate: openSqliteKernel,
  retainValidationKernel(kernel) {
    retainedValidationKernels.push(kernel);
  },
  remove(databaseName) {
    const {
      deleteDatabaseAsync,
    } = require("expo-sqlite") as typeof import("expo-sqlite");
    return deleteDatabaseAsync(databaseName);
  },
  async writeManifest(suite, manifest) {
    const {
      Directory,
      File,
      Paths,
    } = require("expo-file-system") as typeof import("expo-file-system");
    const directory = new Directory(
      Paths.document,
      "benchmark-recovery",
    );
    directory.create({ idempotent: true, intermediates: true });
    const file = new File(directory, `${manifest.backupId}.json`);
    if (file.exists) {
      file.delete();
    }
    file.create({ intermediates: true, overwrite: true });
    file.write(JSON.stringify({ suite, ...manifest }));
  },
  async runMigrations({ databaseName, kernel, recoveryBackup }) {
    await createMigrationRunner({
      databaseName,
      kernel,
      migrations,
      recoveryBackup,
    }).run();
  },
};

export async function migrateBenchmarkDatabaseWithDependencies(
  suite: BenchmarkSuite,
  databaseName: string,
  kernel: SqliteKernel,
  dependencies: BenchmarkRecoveryDependencies,
): Promise<void> {
  const recoveryBackup = createExpoRecoveryBackupPort({
    backupIdPrefix: `${suite}-benchmark-`,
    retainValidationKernel: dependencies.retainValidationKernel,
    openSource: dependencies.openSource,
    openDestination: dependencies.openDestination,
    backup: dependencies.backup,
    close: dependencies.close,
    validate: dependencies.validate,
    remove: dependencies.remove,
    writeManifest: (manifest) =>
      dependencies.writeManifest(suite, manifest),
  });
  await dependencies.runMigrations({
    databaseName,
    kernel,
    recoveryBackup,
  });
}

export async function migrateBenchmarkDatabase(
  suite: BenchmarkSuite,
  databaseName: string,
  kernel: SqliteKernel,
): Promise<void> {
  await migrateBenchmarkDatabaseWithDependencies(
    suite,
    databaseName,
    kernel,
    productionDependencies,
  );
}

import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  migrateBenchmarkDatabaseWithDependencies,
  type BenchmarkRecoveryDependencies,
} from "./benchmarkRecovery";

describe("benchmark migration recovery", () => {
  it("supplies a namespaced validated recovery port to benchmark migrations", async () => {
    const source = {};
    const destination = {};
    const backupKernel = {
      queryAll: jest.fn(async (sql: string) => {
        if (sql === "PRAGMA user_version") {
          return [{ user_version: 0 }];
        }
        if (sql === "PRAGMA foreign_key_check") {
          return [];
        }
        return [{ integrity_check: "ok" }];
      }),
      close: jest.fn(async () => undefined),
    };
    const runMigrations = jest.fn<
      BenchmarkRecoveryDependencies["runMigrations"]
    >(async ({ recoveryBackup }) => {
      await recoveryBackup.createAndValidate({
        databaseName: "gym-tracker-phase2-benchmark.db",
        fromVersion: 0,
        toVersion: 10,
      });
    });
    const writeManifest = jest.fn(async () => undefined);
    const retainValidationKernel = jest.fn(() => undefined);
    const dependencies: BenchmarkRecoveryDependencies = {
      openSource: jest.fn(async () => source),
      openDestination: jest.fn(async () => destination),
      backup: jest.fn(async () => undefined),
      close: jest.fn(async () => undefined),
      validate: jest.fn(async () => backupKernel as never),
      retainValidationKernel,
      remove: jest.fn(async () => undefined),
      writeManifest,
      runMigrations,
    };

    await migrateBenchmarkDatabaseWithDependencies(
      "phase2",
      "gym-tracker-phase2-benchmark.db",
      {} as never,
      dependencies,
    );

    expect(runMigrations).toHaveBeenCalledTimes(1);
    expect(dependencies.openDestination).toHaveBeenCalledWith(
      "phase2-benchmark-migration-recovery-v0-to-v10.db",
    );
    expect(writeManifest).toHaveBeenCalledWith(
      "phase2",
      expect.objectContaining({
        backupId: "phase2-benchmark-migration-recovery-v0-to-v10",
        validated: true,
      }),
    );
    expect(retainValidationKernel).toHaveBeenCalledWith(backupKernel);
    expect(backupKernel.close).not.toHaveBeenCalled();
  });
});

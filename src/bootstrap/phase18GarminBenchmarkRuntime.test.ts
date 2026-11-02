import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  createPhase18GarminBenchmarkBoundedSync,
  createPhase18GarminBenchmarkDriver,
  phase18GarminBenchmarkDatabaseName,
  withPhase18GarminBenchmarkTemporaryDatabase,
  withPhase18GarminBenchmarkTemporaryDatabaseDependencies,
  type Phase18GarminBenchmarkDatabaseDependencies,
} from "./phase18GarminBenchmarkRuntime";
import type { ImportedActivityCommandRepository } from "../domains/activities/importCommands";
import { deleteDatabaseAsync } from "expo-sqlite";
import { openSqliteKernel } from "../platform/sqlite";
import { createMigrationRunner } from "../platform/sqlite/migrationRunner";
import { createImportedActivityRepository } from "../platform/sqlite/repositories/importedActivityRepository";

jest.mock("expo-sqlite", () => ({ deleteDatabaseAsync: jest.fn() }));
jest.mock("../platform/sqlite", () => ({ openSqliteKernel: jest.fn() }));
jest.mock("../platform/sqlite/migrationRunner", () => ({ createMigrationRunner: jest.fn() }));
jest.mock("../platform/sqlite/repositories/importedActivityRepository", () => ({
  createImportedActivityRepository: jest.fn(),
}));

const NONCE = "1".repeat(32);

type FakeKernel = Readonly<{
  databaseName: string;
  close: jest.MockedFunction<() => Promise<void>>;
}>;

function dependencies() {
  const mainDatabase = { importedActivities: 17 };
  const opened: FakeKernel[] = [];
  const removed: string[] = [];
  const migrated: string[] = [];
  const sampleRuns: string[] = [];
  const removeDatabase = jest.fn<
    Phase18GarminBenchmarkDatabaseDependencies["removeDatabase"]
  >(async (databaseName) => {
    removed.push(databaseName);
  });
  const openKernel = jest.fn<
    Phase18GarminBenchmarkDatabaseDependencies["openKernel"]
  >(async (databaseName) => {
    const kernel = {
      databaseName,
      close: jest.fn<() => Promise<void>>(async () => undefined),
    };
    opened.push(kernel);
    return kernel as never;
  });
  const migrate = jest.fn<
    Phase18GarminBenchmarkDatabaseDependencies["migrate"]
  >(async (databaseName) => {
    migrated.push(databaseName);
  });
  const createRepository = jest.fn<
    Phase18GarminBenchmarkDatabaseDependencies["createRepository"]
  >((kernel) => ({
    databaseName: (kernel as unknown as FakeKernel).databaseName,
  }) as never);
  const createBoundedSync = jest.fn<
    Phase18GarminBenchmarkDatabaseDependencies["createBoundedSync"]
  >(({ nonce, repository }) => {
    const databaseName = (repository as unknown as { databaseName: string }).databaseName;
    return async (sampleSequence: number) => {
      const sample = `${databaseName}:${nonce}:${sampleSequence}`;
      sampleRuns.push(sample);
      return { kind: "success", sample } as never;
    };
  });
  const ports: Phase18GarminBenchmarkDatabaseDependencies = {
    removeDatabase,
    openKernel,
    migrate,
    createRepository,
    createBoundedSync,
  };
  return {
    mainDatabase,
    migrated,
    opened,
    ports,
    removed,
    sampleRuns,
  };
}

const sha256 = async () => "a".repeat(64);

describe("Phase 18 Garmin benchmark database runtime", () => {
  it("rejects database identities that are not exact benchmark nonces", () => {
    expect(() => phase18GarminBenchmarkDatabaseName("../../gym-tracker.db"))
      .toThrow("phase18_garmin_benchmark_database_identity_invalid");
  });

  it("runs all bounded sync samples in a dedicated migrated database without touching the main database", async () => {
    const fixture = dependencies();
    const expectedDatabaseName = phase18GarminBenchmarkDatabaseName(NONCE);

    const samples = await withPhase18GarminBenchmarkTemporaryDatabaseDependencies({
      nonce: NONCE,
      sha256,
      run: async ({ databaseName, runBoundedSync }) => {
        expect(databaseName).toBe(expectedDatabaseName);
        return Promise.all(
          Array.from({ length: 5 }, (_, index) => runBoundedSync(index + 1)),
        );
      },
    }, fixture.ports);

    expect(samples).toHaveLength(5);
    expect(fixture.mainDatabase.importedActivities).toBe(17);
    expect(fixture.opened.map(({ databaseName }) => databaseName))
      .toEqual([expectedDatabaseName]);
    expect(fixture.migrated).toEqual([expectedDatabaseName]);
    expect(fixture.opened[0]?.close).toHaveBeenCalledTimes(1);
    expect(fixture.removed).toEqual([expectedDatabaseName, expectedDatabaseName]);
  });

  it("wires the production open, migration, repository, and cleanup path", async () => {
    const close = jest.fn<() => Promise<void>>(async () => undefined);
    const kernel = { close } as never;
    const repository = {
      confirmGarminImport: jest.fn(async () => ({
        kind: "imported" as const,
        activityId: "activity-1",
        aggregateRevision: 1,
      })),
    };
    jest.mocked(deleteDatabaseAsync).mockResolvedValue(undefined);
    jest.mocked(openSqliteKernel).mockResolvedValue(kernel);
    jest.mocked(createImportedActivityRepository).mockReturnValue(repository as never);
    jest.mocked(createMigrationRunner).mockImplementation((options) => ({
      run: async () => {
        await expect(options.recoveryBackup!.createAndValidate({
          databaseName: "wrong.db",
          fromVersion: 0,
        } as never)).rejects.toThrow("phase18_garmin_benchmark_recovery_invalid");
        await expect(options.recoveryBackup!.createAndValidate({
          databaseName: phase18GarminBenchmarkDatabaseName(NONCE),
          fromVersion: 1,
        } as never)).rejects.toThrow("phase18_garmin_benchmark_recovery_invalid");
        await expect(options.recoveryBackup!.createAndValidate({
          databaseName: phase18GarminBenchmarkDatabaseName(NONCE),
          fromVersion: 0,
        } as never)).resolves.toMatchObject({
          backupId: `${phase18GarminBenchmarkDatabaseName(NONCE)}:empty-database`,
          validated: true,
        });
      },
    } as never));

    await expect(withPhase18GarminBenchmarkTemporaryDatabase({
      nonce: NONCE,
      sha256,
      run: async ({ databaseName }) => databaseName,
    })).resolves.toBe(phase18GarminBenchmarkDatabaseName(NONCE));

    expect(openSqliteKernel).toHaveBeenCalledWith(phase18GarminBenchmarkDatabaseName(NONCE));
    expect(createImportedActivityRepository).toHaveBeenCalledWith(kernel);
    expect(close).toHaveBeenCalledTimes(1);
    expect(deleteDatabaseAsync).toHaveBeenCalledTimes(2);
  });

  it.each(["failure", "cancellation"] as const)(
    "closes and deletes the temporary database after %s",
    async (outcome) => {
      const fixture = dependencies();
      const controller = new AbortController();
      const result = withPhase18GarminBenchmarkTemporaryDatabaseDependencies({
        nonce: NONCE,
        sha256,
        signal: controller.signal,
        run: async ({ runBoundedSync }) => {
          if (outcome === "cancellation") controller.abort();
          if (outcome === "failure") throw new Error("measurement_failed");
          return runBoundedSync(1);
        },
      }, fixture.ports);

      await expect(result).rejects.toThrow(
        outcome === "failure"
          ? "measurement_failed"
          : "phase18_garmin_benchmark_cancelled",
      );
      expect(fixture.opened[0]?.close).toHaveBeenCalledTimes(1);
      expect(fixture.removed).toEqual([
        phase18GarminBenchmarkDatabaseName(NONCE),
        phase18GarminBenchmarkDatabaseName(NONCE),
      ]);
    },
  );

  it("starts retries from the same clean database identity and produces deterministic samples", async () => {
    const fixture = dependencies();
    const runOnce = () => withPhase18GarminBenchmarkTemporaryDatabaseDependencies({
      nonce: NONCE,
      sha256,
      run: async ({ runBoundedSync }) => Promise.all([
        runBoundedSync(1),
        runBoundedSync(2),
      ]),
    }, fixture.ports);

    const first = await runOnce();
    const second = await runOnce();

    expect(second).toEqual(first);
    expect(fixture.opened.map(({ databaseName }) => databaseName)).toEqual([
      phase18GarminBenchmarkDatabaseName(NONCE),
      phase18GarminBenchmarkDatabaseName(NONCE),
    ]);
    expect(fixture.opened.every(({ close }) => close.mock.calls.length === 1)).toBe(true);
    expect(fixture.removed).toHaveLength(4);
    expect(fixture.mainDatabase.importedActivities).toBe(17);
  });

  it("cleans up without opening when cancellation is already requested", async () => {
    const fixture = dependencies();
    const controller = new AbortController();
    controller.abort();

    await expect(withPhase18GarminBenchmarkTemporaryDatabaseDependencies({
      nonce: NONCE,
      sha256,
      signal: controller.signal,
      run: async () => "not-run",
    }, fixture.ports)).rejects.toThrow("phase18_garmin_benchmark_cancelled");

    expect(fixture.ports.openKernel).not.toHaveBeenCalled();
    expect(fixture.removed).toEqual([
      phase18GarminBenchmarkDatabaseName(NONCE),
      phase18GarminBenchmarkDatabaseName(NONCE),
    ]);
  });

  it("cancels after a bounded sync finishes and still closes the database", async () => {
    const fixture = dependencies();
    const controller = new AbortController();
    jest.mocked(fixture.ports.createBoundedSync).mockReturnValueOnce(async () => {
      controller.abort();
      return { kind: "success" } as never;
    });

    await expect(withPhase18GarminBenchmarkTemporaryDatabaseDependencies({
      nonce: NONCE,
      sha256,
      signal: controller.signal,
      run: async ({ runBoundedSync }) => runBoundedSync(1),
    }, fixture.ports)).rejects.toThrow("phase18_garmin_benchmark_cancelled");

    expect(fixture.opened[0]?.close).toHaveBeenCalledTimes(1);
    expect(fixture.ports.removeDatabase).toHaveBeenCalledTimes(2);
  });

  it.each(["open", "migration", "repository", "sync factory"] as const)(
    "cleans up after a %s failure",
    async (failure) => {
      const fixture = dependencies();
      if (failure === "open") {
        jest.mocked(fixture.ports.openKernel).mockRejectedValueOnce(new Error("open_failed"));
      } else if (failure === "migration") {
        jest.mocked(fixture.ports.migrate).mockRejectedValueOnce(new Error("migration_failed"));
      } else if (failure === "repository") {
        jest.mocked(fixture.ports.createRepository).mockImplementationOnce(() => {
          throw new Error("repository_failed");
        });
      } else {
        jest.mocked(fixture.ports.createBoundedSync).mockImplementationOnce(() => {
          throw new Error("sync_factory_failed");
        });
      }

      await expect(withPhase18GarminBenchmarkTemporaryDatabaseDependencies({
        nonce: NONCE,
        sha256,
        run: async () => "not-run",
      }, fixture.ports)).rejects.toThrow(`${failure.replace(" ", "_")}_failed`);

      expect(fixture.ports.removeDatabase).toHaveBeenCalledTimes(2);
      expect(fixture.opened[0]?.close.mock.calls.length ?? 0).toBe(failure === "open" ? 0 : 1);
    },
  );

  it.each(["close", "delete"] as const)(
    "fails closed while still attempting all cleanup when %s fails",
    async (failure) => {
      const fixture = dependencies();
      const close = jest.fn<() => Promise<void>>(async () => {
        if (failure === "close") throw new Error("close_failed");
      });
      jest.mocked(fixture.ports.openKernel).mockResolvedValueOnce({ close } as never);
      if (failure === "delete") {
        jest.mocked(fixture.ports.removeDatabase)
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error("delete_failed"));
      }

      await expect(withPhase18GarminBenchmarkTemporaryDatabaseDependencies({
        nonce: NONCE,
        sha256,
        run: async () => "passed",
      }, fixture.ports)).rejects.toThrow(
        "phase18_garmin_benchmark_database_cleanup_failed",
      );

      expect(close).toHaveBeenCalledTimes(1);
      expect(fixture.ports.removeDatabase).toHaveBeenCalledTimes(2);
    },
  );

  it("runs the bounded production adapter and rejects invalid or incomplete samples", async () => {
    expect(() => createPhase18GarminBenchmarkBoundedSync({
      nonce: "wrong",
      repository: {} as never,
      sha256,
    })).toThrow("phase18_garmin_benchmark_marker_invalid");

    const importedRepository: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn<ImportedActivityCommandRepository["confirmGarminImport"]>(async (input) => ({
        kind: "imported" as const,
        activityId: input.activityId,
        aggregateRevision: 1,
      })),
    };
    const runImported = createPhase18GarminBenchmarkBoundedSync({
      nonce: NONCE,
      repository: importedRepository,
      sha256,
    });
    for (const sequence of [0, 1.5, 100]) {
      await expect(runImported(sequence)).rejects.toThrow(
        "phase18_bounded_sync_sequence_invalid",
      );
    }
    await expect(runImported(1)).resolves.toMatchObject({
      kind: "success",
      counts: {
        discoveredActivities: 100,
        newActivities: 100,
      },
    });
    expect(importedRepository.confirmGarminImport).toHaveBeenCalledTimes(100);

    const replayedRepository: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn<ImportedActivityCommandRepository["confirmGarminImport"]>(async (input) => ({
        kind: "replayed" as const,
        activityId: input.activityId,
        aggregateRevision: 1,
      })),
    };
    const runReplayed = createPhase18GarminBenchmarkBoundedSync({
      nonce: NONCE,
      repository: replayedRepository,
      sha256,
    });
    await expect(runReplayed(2)).rejects.toThrow("phase18_bounded_sync_incomplete");
  });

  it("exposes every bounded native driver operation with deterministic data", async () => {
    const driver = createPhase18GarminBenchmarkDriver(NONCE, 1);
    await expect(driver.connectionState()).resolves.toMatchObject({ status: "ok" });
    await expect(driver.restoreSession()).resolves.toMatchObject({ status: "ok" });
    await expect(driver.login({ email: "ignored", password: "ignored" })).resolves.toMatchObject({ status: "ok" });
    await expect(driver.resumeMfa({ challengeHandle: "ignored", code: "ignored" })).resolves.toMatchObject({ status: "ok" });
    await expect(driver.logout()).resolves.toMatchObject({ status: "ok" });
    await expect(driver.getActivities({ start: 0, limit: 20, activityType: "running" })).resolves.toMatchObject({
      status: "ok",
      data: { nextStart: 20 },
    });
    await expect(driver.getActivities({ start: 80, limit: 20, activityType: "running" })).resolves.toMatchObject({
      status: "ok",
      data: { items: expect.any(Array) },
    });
    await expect(driver.getActivity({ externalActivityId: "1" })).resolves.toMatchObject({ status: "ok" });
    await expect(driver.getActivitySplits({ externalActivityId: "1" })).resolves.toMatchObject({ status: "ok" });
    await expect(driver.getActivityDetails({ externalActivityId: "1", maxchart: 2000, maxpoly: 4000 })).resolves.toMatchObject({ status: "ok" });
  });
});

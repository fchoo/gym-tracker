import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  phase18GarminBenchmarkDatabaseName,
  withPhase18GarminBenchmarkTemporaryDatabaseDependencies,
  type Phase18GarminBenchmarkDatabaseDependencies,
} from "./phase18GarminBenchmarkRuntime";

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
});

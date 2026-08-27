import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  boundedPhase2BenchmarkSamples,
  phase2BenchmarkStartupAction,
  performPhase2BenchmarkWithDependencies,
  type Phase2BenchmarkDependencies,
} from "./phase2Benchmark";

function dependencies(): Phase2BenchmarkDependencies & Readonly<{
  close: jest.MockedFunction<() => Promise<void>>;
  performWorkingSet: jest.MockedFunction<
    Phase2BenchmarkDependencies["performWorkingSet"]
  >;
  removeDatabase: jest.MockedFunction<
    Phase2BenchmarkDependencies["removeDatabase"]
  >;
  search: jest.MockedFunction<Phase2BenchmarkDependencies["search"]>;
}> {
  const close = jest.fn(async () => undefined);
  const removeDatabase = jest.fn(async () => undefined);
  const search = jest.fn<Phase2BenchmarkDependencies["search"]>(async () => ({
    state: "page" as const,
    items: [{ exerciseId: "exercise-1" }] as never,
    nextCursor: null,
    diagnostic: {} as never,
  }));
  const performWorkingSet = jest.fn(async (samples: number) => ({
    schemaVersion: 1 as const,
    suite: "phase1" as const,
    status: "passed" as const,
    measurement: "completeSet command to committed UI transition",
    samplesRequested: samples,
    samplesCompleted: samples,
    durationsMs: Array.from({ length: samples }, () => 2),
    maxJsTaskMs: 1,
    startedAt: "2026-08-19T00:00:00.000Z",
    finishedAt: "2026-08-19T00:00:01.000Z",
  }));
  let monotonic = 0;
  return {
    close,
    removeDatabase,
    search,
    performWorkingSet,
    openKernel: jest.fn(async () => ({ close }) as never),
    migrate: jest.fn(async () => undefined),
    installCatalog: jest.fn(async () => undefined),
    createSearch: jest.fn(() => ({ searchExercises: search }) as never),
    now: jest.fn(() => {
      monotonic += 0.5;
      return monotonic;
    }),
    yield: jest.fn(async () => undefined),
  };
}

describe("Phase 2 native benchmark application", () => {
  it("gates startup on the root runtime reaching trusted state", () => {
    const cases = [
      [false, "booting", false, "disabled"],
      [true, "booting", false, "wait"],
      [true, "failed", false, "fail"],
      [true, "trusted", false, "start"],
      [true, "trusted", true, "wait"],
    ] as const;
    for (const [enabled, launchState, started, expected] of cases) {
      expect(phase2BenchmarkStartupAction({
        enabled,
        launchState,
        started,
      })).toBe(expected);
    }
  });

  it.each([
    [undefined, 100],
    ["invalid", 100],
    [["125"], 125],
    ["40", 100],
    ["900", 500],
  ])("bounds sample input %p", (value, expected) => {
    expect(boundedPhase2BenchmarkSamples(value)).toBe(expected);
  });

  it("records one hundred real search-page and working-set samples", async () => {
    const ports = dependencies();

    const result = await performPhase2BenchmarkWithDependencies(100, ports);

    expect(result).toMatchObject({
      schemaVersion: 1,
      suite: "phase2",
      status: "passed",
      measurements: [
        {
          id: "search-page",
          samplesRequested: 100,
          samplesCompleted: 100,
        },
        {
          id: "working-set-commit",
          samplesRequested: 100,
          samplesCompleted: 100,
        },
      ],
    });
    expect(result.measurements[0]?.durationsMs).toHaveLength(100);
    expect(result.measurements[1]?.durationsMs).toHaveLength(100);
    expect(ports.search).toHaveBeenCalledTimes(100);
    expect(ports.performWorkingSet).toHaveBeenCalledWith(100);
    expect(ports.close).not.toHaveBeenCalled();
    expect(ports.removeDatabase).toHaveBeenCalledTimes(1);
  });

  it("leaves the disposable search kernel process-scoped when a sample fails", async () => {
    const ports = dependencies();
    ports.search.mockRejectedValueOnce(new Error("search_failed"));

    await expect(
      performPhase2BenchmarkWithDependencies(100, ports),
    ).rejects.toThrow("search_failed");
    expect(ports.close).not.toHaveBeenCalled();
    expect(ports.removeDatabase).toHaveBeenCalledTimes(1);
    expect(ports.performWorkingSet).not.toHaveBeenCalled();
  });
});

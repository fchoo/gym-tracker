import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  boundedPhase1BenchmarkSamples,
  performPhase1BenchmarkWithDependencies,
  type Phase1BenchmarkDependencies,
} from "./phase1Benchmark";

function dependencies(): Phase1BenchmarkDependencies & Readonly<{
  close: jest.MockedFunction<() => Promise<void>>;
  complete: jest.MockedFunction<Phase1BenchmarkDependencies["complete"]>;
  migrate: jest.MockedFunction<Phase1BenchmarkDependencies["migrate"]>;
  removeDatabase: jest.MockedFunction<
    Phase1BenchmarkDependencies["removeDatabase"]
  >;
  start: jest.MockedFunction<Phase1BenchmarkDependencies["start"]>;
  undo: jest.MockedFunction<Phase1BenchmarkDependencies["undo"]>;
  completedAtMs: number[];
  undoNowMs: number[];
}> {
  const close = jest.fn(async () => undefined);
  const removeDatabase = jest.fn(async () => undefined);
  const migrate = jest.fn(async () => undefined);
  const start = jest.fn<Phase1BenchmarkDependencies["start"]>(
    async (_repository, request) => ({
      id: `session-${request.startedAtMs}`,
      source: "scheduled_day",
      status: "in_progress",
      planId: "plan-1",
      planDayId: "day-1",
      revision: 1,
    }),
  );
  const completedAtMs: number[] = [];
  const undoNowMs: number[] = [];
  const complete = jest.fn<Phase1BenchmarkDependencies["complete"]>(
    async (input) => {
      completedAtMs.push(input.input.completedAtMs);
      await input.invalidate();
      await input.drainEffects();
      return {
        outcome: "committed",
        view: { revision: 2 },
      } as never;
    },
  );
  const undo = jest.fn<Phase1BenchmarkDependencies["undo"]>(
    async (input) => {
      undoNowMs.push(input.input.nowMs);
      return {
      outcome: "undone",
      view: {
        id: "session-benchmark",
        revision: 1,
        currentExercise: {
          workingSets: [{
            id: "set-session-benchmark",
            revision: 1,
          }],
        },
      },
      } as never;
    },
  );
  let monotonic = 0;
  return {
    close,
    removeDatabase,
    migrate,
    start,
    complete,
    completedAtMs,
    undo,
    undoNowMs,
    openKernel: jest.fn(async () => ({ close }) as never),
    createPlans: jest.fn(() => ({} as never)),
    createWorkout: jest.fn(() => ({
      getActiveWorkout: jest.fn(async (sessionId: string) => ({
        id: sessionId,
        revision: 1,
        currentExercise: {
          workingSets: [{
            id: `set-${sessionId}`,
            revision: 1,
          }],
        },
      })),
    } as never)),
    activate: jest.fn(async () => ({
      plan: { id: "plan-1" },
      days: [{ id: "day-1" }],
    }) as never),
    now: jest.fn(() => {
      monotonic += 0.25;
      return monotonic;
    }),
    yield: jest.fn(async () => undefined),
  };
}

describe("Phase 1 native benchmark application", () => {
  it.each([
    [undefined, 100],
    ["invalid", 100],
    [["125"], 125],
    ["40", 100],
    ["900", 500],
  ])("bounds sample input %p", (value, expected) => {
    expect(boundedPhase1BenchmarkSamples(value)).toBe(expected);
  });

  it("records at least one hundred production command-to-dock samples", async () => {
    const ports = dependencies();

    const result = await performPhase1BenchmarkWithDependencies(100, ports);

    expect(result).toMatchObject({
      status: "passed",
      samplesRequested: 100,
      samplesCompleted: 100,
      measurement: expect.stringContaining("completeSet"),
    });
    expect(result.durationsMs).toHaveLength(100);
    expect(result.durationsMs.every((duration) => duration > 0)).toBe(true);
    expect(ports.start).toHaveBeenCalledTimes(1);
    expect(ports.complete).toHaveBeenCalledTimes(100);
    expect(ports.undo).toHaveBeenCalledTimes(100);
    expect(new Set(ports.completedAtMs).size).toBe(100);
    expect(ports.undoNowMs).toEqual(
      ports.completedAtMs.map((completedAtMs) => completedAtMs + 1),
    );
    expect(ports.migrate).toHaveBeenCalledTimes(1);
    expect(ports.close).not.toHaveBeenCalled();
    expect(ports.removeDatabase).toHaveBeenCalledTimes(1);
  });

  it("leaves the disposable benchmark kernel process-scoped when a sample fails", async () => {
    const ports = dependencies();
    ports.complete.mockRejectedValueOnce(new Error("sample_failed"));

    await expect(
      performPhase1BenchmarkWithDependencies(100, ports),
    ).rejects.toThrow("sample_failed");
    expect(ports.close).not.toHaveBeenCalled();
    expect(ports.removeDatabase).toHaveBeenCalledTimes(1);
  });
});

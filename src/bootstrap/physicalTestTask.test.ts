import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

jest.mock("../../modules/argon2-kdf/src", () => ({
  ARGON2_KDF_CONTRACT_VERSION: 1,
  deriveArgon2id: jest.fn(),
}));

import {
  ARGON2_FEASIBILITY_RESULT_MARKER,
  type Argon2FeasibilityOptions,
  type Argon2FeasibilityResult,
} from "../testing/contracts/argon2Feasibility.contract";
import {
  PHASE1_BENCHMARK_RESULT_MARKER,
  type Phase1BenchmarkResult,
} from "./phase1Benchmark";
import {
  PHYSICAL_TEST_TASK_NAME,
  runPhysicalTestTaskWithDependencies,
  type PhysicalTestTaskDependencies,
} from "./physicalTestTask";

function dependencies(): PhysicalTestTaskDependencies {
  return {
    benchmark: jest.fn(async (
      samples: number,
    ): Promise<Phase1BenchmarkResult> => ({
      schemaVersion: 1,
      suite: "phase1",
      status: "passed",
      measurement: "completeSet",
      samplesRequested: samples,
      samplesCompleted: samples,
      durationsMs: Array.from({ length: samples }, () => 10),
      maxJsTaskMs: 1,
      startedAt: "2026-08-17T00:00:00.000Z",
      finishedAt: "2026-08-17T00:00:01.000Z",
    })),
    argon2: jest.fn(async (
      options: Argon2FeasibilityOptions = {},
    ): Promise<Argon2FeasibilityResult> => ({
      schemaVersion: 1,
      status: "passed",
      katId: "owasp-floor-bc-1.85.2-v1",
      katPassed: true,
      responsive: true,
      samplesMs: Array.from({ length: options.samples ?? 3 }, () => 300),
      provider: "Bouncy Castle",
      providerVersion: "1.85.2",
      parameters: {
        memoryKiB: options.memoryKiB ?? 19_456,
        iterations: options.iterations ?? 2,
        parallelism: 1,
      },
    })),
    log: jest.fn(),
  };
}

describe("development-test physical Headless JS task", () => {
  it("dispatches a bounded benchmark and logs only the result marker", async () => {
    const ports = dependencies();

    await runPhysicalTestTaskWithDependencies(
      { suite: "benchmark", samples: 100 },
      ports,
    );

    expect(PHYSICAL_TEST_TASK_NAME).toBe("GymTrackerPhysicalTest");
    expect(ports.benchmark).toHaveBeenCalledWith(100);
    expect(ports.log).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(`^${PHASE1_BENCHMARK_RESULT_MARKER}`),
      ),
    );
  });

  it("dispatches only bounded Argon2 calibration parameters", async () => {
    const ports = dependencies();

    await runPhysicalTestTaskWithDependencies(
      {
        suite: "argon2",
        samples: 10,
        memoryKiB: 19_456,
        iterations: 2,
      },
      ports,
    );

    expect(ports.argon2).toHaveBeenCalledWith({
      samples: 10,
      memoryKiB: 19_456,
      iterations: 2,
    });
    expect(ports.log).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(`^${ARGON2_FEASIBILITY_RESULT_MARKER}`),
      ),
    );
  });

  it("rejects unknown suites and out-of-range inputs", async () => {
    const ports = dependencies();

    await expect(runPhysicalTestTaskWithDependencies(
      { suite: "unknown" },
      ports,
    )).rejects.toThrow("physical_test_suite_invalid");
    await expect(runPhysicalTestTaskWithDependencies(
      { suite: "argon2", samples: 11 },
      ports,
    )).rejects.toThrow("physical_test_input_invalid");
  });
});

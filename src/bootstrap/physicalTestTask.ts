import {
  PHASE1_BENCHMARK_RESULT_MARKER,
  performPhase1Benchmark,
} from "./phase1Benchmark";
import {
  ARGON2_FEASIBILITY_RESULT_MARKER,
  performArgon2Feasibility,
} from "../testing/contracts/argon2Feasibility.contract";

export const PHYSICAL_TEST_TASK_NAME = "GymTrackerPhysicalTest" as const;

type PhysicalTestTaskData = Readonly<Record<string, unknown>>;

export type PhysicalTestTaskDependencies = Readonly<{
  benchmark: typeof performPhase1Benchmark;
  argon2: typeof performArgon2Feasibility;
  log(message: string): void;
}>;

const productionDependencies: PhysicalTestTaskDependencies = {
  benchmark: performPhase1Benchmark,
  argon2: performArgon2Feasibility,
  log: console.log,
};

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return fallback;
  }
  if (parsed < minimum || parsed > maximum) {
    throw new TypeError("physical_test_input_invalid");
  }
  return parsed;
}

export async function runPhysicalTestTask(
  data: PhysicalTestTaskData,
): Promise<void> {
  return runPhysicalTestTaskWithDependencies(data, productionDependencies);
}

export async function runPhysicalTestTaskWithDependencies(
  data: PhysicalTestTaskData,
  dependencies: PhysicalTestTaskDependencies,
): Promise<void> {
  if (data.suite === "benchmark") {
    const samples = boundedInteger(data.samples, 100, 100, 500);
    const result = await dependencies.benchmark(samples);
    dependencies.log(
      `${PHASE1_BENCHMARK_RESULT_MARKER}${JSON.stringify(result)}`,
    );
    return;
  }
  if (data.suite === "argon2") {
    const samples = boundedInteger(data.samples, 10, 3, 10);
    const memoryKiB = boundedInteger(
      data.memoryKiB,
      19_456,
      19_456,
      65_536,
    );
    const iterations = boundedInteger(data.iterations, 2, 2, 4);
    const result = await dependencies.argon2({
      samples,
      memoryKiB,
      iterations,
    });
    dependencies.log(
      `${ARGON2_FEASIBILITY_RESULT_MARKER}${JSON.stringify(result)}`,
    );
    return;
  }
  throw new TypeError("physical_test_suite_invalid");
}

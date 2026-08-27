import {
  deleteDatabaseAsync,
} from "expo-sqlite";

import fullBodyFoundationAsset from "../../assets/content/full-body-foundation.v1.json";
import benchmarkFixture from "../../maestro/fixtures/phase1-benchmark.json";
import {
  parseFullBodyFoundation,
} from "../domains/content";
import {
  activateStarterPlan,
} from "../domains/plans";
import {
  completeSet,
  startWorkout,
  undoCompletedSet,
} from "../domains/workout";
import {
  createPlansWorkoutRepository,
} from "../platform/sqlite/repositories/plansWorkoutRepository";
import {
  createWorkoutRepository,
} from "../platform/sqlite/repositories/workoutRepository";
import {
  openSqliteKernel,
} from "../platform/sqlite";
import {
  migrateBenchmarkDatabase,
} from "./benchmarkRecovery";

export const PHASE1_BENCHMARK_RESULT_MARKER =
  "GYM_TRACKER_PHASE1_BENCHMARK_RESULT:" as const;

const DATABASE_NAME = "gym-tracker-phase1-benchmark.db";

export type Phase1BenchmarkResult = Readonly<{
  schemaVersion: 1;
  suite: "phase1";
  status: "passed";
  measurement: string;
  samplesRequested: number;
  samplesCompleted: number;
  durationsMs: readonly number[];
  maxJsTaskMs: number;
  startedAt: string;
  finishedAt: string;
}>;

type BenchmarkKernel = Awaited<ReturnType<typeof openSqliteKernel>>;

export type Phase1BenchmarkDependencies = Readonly<{
  removeDatabase(): Promise<void>;
  openKernel(): Promise<BenchmarkKernel>;
  migrate(kernel: BenchmarkKernel): Promise<void>;
  createPlans(kernel: BenchmarkKernel): ReturnType<
    typeof createPlansWorkoutRepository
  >;
  createWorkout(kernel: BenchmarkKernel): ReturnType<
    typeof createWorkoutRepository
  >;
  activate(
    repository: ReturnType<typeof createPlansWorkoutRepository>,
  ): ReturnType<typeof activateStarterPlan>;
  start(
    repository: ReturnType<typeof createPlansWorkoutRepository>,
    input: Parameters<typeof startWorkout>[0]["request"],
  ): ReturnType<typeof startWorkout>;
  complete(
    input: Parameters<typeof completeSet>[0],
  ): ReturnType<typeof completeSet>;
  undo(
    input: Parameters<typeof undoCompletedSet>[0],
  ): ReturnType<typeof undoCompletedSet>;
  now(): number;
  yield(): Promise<void>;
}>;

const productionDependencies: Phase1BenchmarkDependencies = {
  removeDatabase: () =>
    deleteDatabaseAsync(DATABASE_NAME).catch(() => undefined),
  openKernel: () => openSqliteKernel(DATABASE_NAME),
  migrate: (kernel) =>
    migrateBenchmarkDatabase("phase1", DATABASE_NAME, kernel),
  createPlans: createPlansWorkoutRepository,
  createWorkout: createWorkoutRepository,
  activate: (repository) =>
    activateStarterPlan({
      fixture: parseFullBodyFoundation(fullBodyFoundationAsset),
      repository,
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    }),
  start: (repository, request) => startWorkout({ repository, request }),
  complete: completeSet,
  undo: undoCompletedSet,
  now: () => performance.now(),
  yield: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
};

export function boundedPhase1BenchmarkSamples(
  value: string | string[] | undefined,
): number {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = Number(candidate);
  if (!Number.isInteger(parsed)) {
    return benchmarkFixture.minimumSamples;
  }
  return Math.min(500, Math.max(benchmarkFixture.minimumSamples, parsed));
}

export async function performPhase1Benchmark(
  samples: number,
): Promise<Phase1BenchmarkResult> {
  return performPhase1BenchmarkWithDependencies(
    samples,
    productionDependencies,
  );
}

export async function performPhase1BenchmarkWithDependencies(
  samples: number,
  dependencies: Phase1BenchmarkDependencies,
): Promise<Phase1BenchmarkResult> {
  const startedAt = new Date().toISOString();
  await dependencies.removeDatabase();
  const kernel = await dependencies.openKernel();
  await dependencies.migrate(kernel);
  const plans = dependencies.createPlans(kernel);
  const workout = dependencies.createWorkout(kernel);
  const activation = await dependencies.activate(plans);
  const durationsMs: number[] = [];
  let maxJsTaskMs = 0;
  const sampleBaseMs = 1_786_900_000_000;
  const session = await dependencies.start(
    plans,
    {
      mode: "scheduled",
      planId: activation.plan.id,
      planDayId: activation.days[0]!.id,
      localDate: "2026-08-18",
      timezone: "Asia/Singapore",
      startedAtMs: sampleBaseMs,
    },
  );
  let view = await workout.getActiveWorkout(session.id);

  for (let index = 0; index < samples; index += 1) {
    const set = view.currentExercise.workingSets[0]!;
    const completedAtMs = sampleBaseMs + (index * 10_000) + 1_000;
    let dockTransitionAt = 0;
    const commandStartedAt = dependencies.now();
    const result = await dependencies.complete({
      repository: workout,
      haptics: {
        committed: async () => undefined,
      },
      invalidate: async () => {
        const callbackStartedAt = dependencies.now();
        dockTransitionAt = callbackStartedAt;
        maxJsTaskMs = Math.max(
          maxJsTaskMs,
          dependencies.now() - callbackStartedAt,
        );
      },
      drainEffects: async () => {
        const callbackStartedAt = dependencies.now();
        maxJsTaskMs = Math.max(
          maxJsTaskMs,
          dependencies.now() - callbackStartedAt,
        );
      },
      input: {
        sessionId: session.id,
        setId: set.id,
        expectedSessionRevision: view.revision,
        expectedSetRevision: set.revision,
        completionIdempotencyKey: `benchmark_${index}`,
        metricIdentity: set.metricIdentity,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: benchmarkFixture.profile.observation.loadGrams,
          reps: benchmarkFixture.profile.observation.reps,
          source: "manual",
        },
        completedAtMs,
      },
    });
    if (result.outcome !== "committed" || dockTransitionAt === 0) {
      throw new Error("benchmark_sample_not_committed");
    }
    durationsMs.push(dockTransitionAt - commandStartedAt);
    const undone = await dependencies.undo({
      repository: workout,
      input: {
        sessionId: session.id,
        completedSetId: set.id,
        nowMs: completedAtMs + 1,
      },
    });
    if (undone.outcome !== "undone") {
      throw new Error("benchmark_sample_not_undone");
    }
    view = undone.view;
    await dependencies.yield();
  }

  return {
    schemaVersion: 1,
    suite: "phase1",
    status: "passed",
    measurement: benchmarkFixture.measurement,
    samplesRequested: samples,
    samplesCompleted: durationsMs.length,
    durationsMs,
    maxJsTaskMs,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

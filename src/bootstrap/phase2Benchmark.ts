import {
  deleteDatabaseAsync,
} from "expo-sqlite";

import exerciseCatalogAsset from "../../assets/content/exercise-library.v1.json";
import exerciseCatalogAcceptanceAsset from "../../artifacts/review/phase2/exercise-library-acceptance.json";
import exerciseCatalogManifestAsset from "../../assets/content/exercise-library.v1.manifest.json";
import {
  parseExerciseCatalog,
} from "../domains/content/catalog";
import {
  createContentRepository,
} from "../platform/sqlite/repositories/contentRepository";
import {
  createLibrarySearchRepository,
  type LibrarySearchRepository,
} from "../platform/sqlite/repositories/librarySearchRepository";
import {
  openSqliteKernel,
} from "../platform/sqlite";
import {
  performPhase1Benchmark,
  type Phase1BenchmarkResult,
} from "./phase1Benchmark";
import {
  migrateBenchmarkDatabase,
} from "./benchmarkRecovery";

export const PHASE2_BENCHMARK_RESULT_MARKER =
  "GYM_TRACKER_PHASE2_BENCHMARK_RESULT:" as const;
export const PHASE2_BENCHMARK_RESULT_CHUNK_MARKER =
  "GYM_TRACKER_PHASE2_BENCHMARK_RESULT_CHUNK:" as const;
export const PHASE2_BENCHMARK_ERROR_MARKER =
  "GYM_TRACKER_PHASE2_BENCHMARK_ERROR:" as const;

const DATABASE_NAME = "gym-tracker-phase2-benchmark.db";
const MINIMUM_SAMPLES = 100;
const MAXIMUM_SAMPLES = 500;

type BenchmarkKernel = Awaited<ReturnType<typeof openSqliteKernel>>;

export type Phase2BenchmarkMeasurement = Readonly<{
  id: "search-page" | "working-set-commit";
  measurement: string;
  samplesRequested: number;
  samplesCompleted: number;
  durationsMs: readonly number[];
  maxJsTaskMs: number;
}>;

export type Phase2BenchmarkResult = Readonly<{
  schemaVersion: 1;
  suite: "phase2";
  status: "passed";
  measurements: readonly [
    Phase2BenchmarkMeasurement,
    Phase2BenchmarkMeasurement,
  ];
  startedAt: string;
  finishedAt: string;
}>;

export type Phase2BenchmarkDependencies = Readonly<{
  removeDatabase(): Promise<void>;
  openKernel(): Promise<BenchmarkKernel>;
  migrate(kernel: BenchmarkKernel): Promise<void>;
  installCatalog(kernel: BenchmarkKernel): Promise<void>;
  createSearch(kernel: BenchmarkKernel): LibrarySearchRepository;
  search(
    repository: LibrarySearchRepository,
    sampleIndex: number,
  ): ReturnType<LibrarySearchRepository["searchExercises"]>;
  performWorkingSet(samples: number): Promise<Phase1BenchmarkResult>;
  now(): number;
  yield(): Promise<void>;
  observeSample?(sample: Readonly<{
    operation: "search-page" | "ordinary-js-task";
    sequence: number;
    startMs: number;
    endMs: number;
  }>): void;
}>;

export function phase2BenchmarkStartupAction({
  enabled,
  launchState,
  started,
}: Readonly<{
  enabled: boolean;
  launchState: "booting" | "trusted" | "failed";
  started: boolean;
}>): "disabled" | "wait" | "fail" | "start" {
  if (!enabled) {
    return "disabled";
  }
  if (started || launchState === "booting") {
    return "wait";
  }
  return launchState === "trusted" ? "start" : "fail";
}

const prettyBytes = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function productionDependencies(databaseName: string): Phase2BenchmarkDependencies {
  return {
  removeDatabase: () =>
    deleteDatabaseAsync(databaseName).catch(() => undefined),
  openKernel: () => openSqliteKernel(databaseName),
  migrate: (kernel) =>
    migrateBenchmarkDatabase("phase2", databaseName, kernel),
  installCatalog: async (kernel) => {
    const {
      CryptoDigestAlgorithm,
      digestStringAsync,
    } = require("expo-crypto") as typeof import("expo-crypto");
    const catalog = await parseExerciseCatalog({
      catalogBytes: prettyBytes(exerciseCatalogAsset),
      manifestBytes: prettyBytes(exerciseCatalogManifestAsset),
      acceptanceBytes: prettyBytes(exerciseCatalogAcceptanceAsset),
      sha256: (value) =>
        digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
    });
    await createContentRepository(kernel).importAcceptedCatalog({ catalog });
  },
  createSearch: createLibrarySearchRepository,
  search: (repository) =>
    repository.searchExercises({
      query: "press",
      filters: {
        equipment: ["barbell"],
      },
    }),
  performWorkingSet: performPhase1Benchmark,
  now: () => performance.now(),
  yield: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
  };
}

/** Deterministic CPU work over the real search result; its output is consumed so engines cannot discard it. */
export function executePhase2OrdinaryJsTask(value: unknown, sequence: number): number {
  const bytes = JSON.stringify({ sequence, value });
  let checksum = 2_166_136_261;
  for (let pass = 0; pass < 32; pass += 1) {
    for (let index = 0; index < bytes.length; index += 1) {
      checksum = Math.imul(checksum ^ bytes.charCodeAt(index), 16_777_619) >>> 0;
    }
  }
  return checksum;
}

export function boundedPhase2BenchmarkSamples(
  value: string | string[] | undefined,
): number {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = Number(candidate);
  if (!Number.isInteger(parsed)) {
    return MINIMUM_SAMPLES;
  }
  return Math.min(MAXIMUM_SAMPLES, Math.max(MINIMUM_SAMPLES, parsed));
}

export async function performPhase2Benchmark(
  samples: number,
  observeSample?: Phase2BenchmarkDependencies["observeSample"],
  databaseName = DATABASE_NAME,
): Promise<Phase2BenchmarkResult> {
  return performPhase2BenchmarkWithDependencies(
    samples,
    { ...productionDependencies(databaseName), ...(observeSample === undefined ? {} : { observeSample }) },
  );
}

export async function performPhase2BenchmarkWithDependencies(
  samples: number,
  dependencies: Phase2BenchmarkDependencies,
): Promise<Phase2BenchmarkResult> {
  const startedAt = new Date().toISOString();
  await dependencies.removeDatabase();
  const kernel = await dependencies.openKernel();
  await dependencies.migrate(kernel);
  await dependencies.installCatalog(kernel);
  const repository = dependencies.createSearch(kernel);
  const searchDurationsMs: number[] = [];
  let searchMaxJsTaskMs = 0;
  let ordinaryJsChecksum = 0;

  for (let index = 0; index < samples; index += 1) {
    const sampleStartedAt = dependencies.now();
    const result = await dependencies.search(repository, index);
    const responseAt = dependencies.now();
    if (result.state !== "page" || result.items.length < 1) {
      throw new Error("phase2_search_benchmark_page_missing");
    }
    searchDurationsMs.push(responseAt - sampleStartedAt);
    dependencies.observeSample?.({
      operation: "search-page",
      sequence: index + 1,
      startMs: sampleStartedAt,
      endMs: responseAt,
    });
    const jsTaskStartedAt = responseAt;
    ordinaryJsChecksum ^= executePhase2OrdinaryJsTask(result, index + 1);
    const jsTaskFinishedAt = dependencies.now();
    searchMaxJsTaskMs = Math.max(
      searchMaxJsTaskMs,
      jsTaskFinishedAt - jsTaskStartedAt,
    );
    dependencies.observeSample?.({
      operation: "ordinary-js-task",
      sequence: index + 1,
      startMs: jsTaskStartedAt,
      endMs: jsTaskFinishedAt,
    });
    await dependencies.yield();
  }
  if (!Number.isSafeInteger(ordinaryJsChecksum)) {
    throw new Error("phase2_ordinary_js_task_invalid");
  }

  const workingSet = await dependencies.performWorkingSet(samples);
  if (
    workingSet.status !== "passed"
    || workingSet.samplesCompleted !== samples
    || workingSet.durationsMs.length !== samples
  ) {
    throw new Error("phase2_working_set_benchmark_incomplete");
  }

  return {
    schemaVersion: 1,
    suite: "phase2",
    status: "passed",
    measurements: [
      {
        id: "search-page",
        measurement:
          "accepted-catalog filtered search request to complete page",
        samplesRequested: samples,
        samplesCompleted: searchDurationsMs.length,
        durationsMs: searchDurationsMs,
        maxJsTaskMs: searchMaxJsTaskMs,
      },
      {
        id: "working-set-commit",
        measurement: workingSet.measurement,
        samplesRequested: workingSet.samplesRequested,
        samplesCompleted: workingSet.samplesCompleted,
        durationsMs: workingSet.durationsMs,
        maxJsTaskMs: workingSet.maxJsTaskMs,
      },
    ],
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

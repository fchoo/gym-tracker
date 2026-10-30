import { deleteDatabaseAsync } from "expo-sqlite";

import type {
  GarminSha256,
  ImportedActivityCommandRepository,
} from "../domains/activities/importCommands";
import { canonicalJson } from "../domains/activities/importContracts";
import {
  createGarminActivityAdapter,
  type GarminNativeDriver,
} from "../platform/garmin/garminActivityAdapter";
import {
  createGarminSharedImportCommitter,
  createGarminSyncCoordinator,
} from "../platform/garmin/garminSyncCoordinator";
import {
  GARMIN_SYNC_DEFAULT_LIMITS,
  type GarminSyncResult,
} from "../platform/garmin/garminSyncContracts";
import { normalizeGarminActivity } from "../platform/garmin/normalizeGarminActivity";
import {
  openSqliteKernel,
  type SqliteKernel,
} from "../platform/sqlite";
import { createMigrationRunner } from "../platform/sqlite/migrationRunner";
import { migrations } from "../platform/sqlite/migrations";
import { createImportedActivityRepository } from "../platform/sqlite/repositories/importedActivityRepository";
import { PHASE18_GARMIN_BENCHMARK_MAX_FIXTURE } from "../testing/phase18GarminAcceptance";

const BENCHMARK_NONCE = /^[a-f0-9]{32}$/u;
const BENCHMARK_DATABASE_PREFIX = "gym-tracker-phase18-garmin-benchmark-";

type BoundedSync = ReturnType<typeof createPhase18GarminBenchmarkBoundedSync>;

export type Phase18GarminBenchmarkDatabaseDependencies = Readonly<{
  removeDatabase(databaseName: string): Promise<void>;
  openKernel(databaseName: string): Promise<SqliteKernel>;
  migrate(databaseName: string, kernel: SqliteKernel): Promise<void>;
  createRepository(kernel: SqliteKernel): ImportedActivityCommandRepository;
  createBoundedSync(input: Readonly<{
    nonce: string;
    repository: ImportedActivityCommandRepository;
    sha256: GarminSha256;
  }>): BoundedSync;
}>;

type BenchmarkAbortSignal = Readonly<{ aborted: boolean }>;

const productionDatabaseDependencies: Phase18GarminBenchmarkDatabaseDependencies = Object.freeze({
  removeDatabase: deleteDatabaseAsync,
  openKernel: openSqliteKernel,
  async migrate(databaseName, kernel) {
    await createMigrationRunner({
      databaseName,
      kernel,
      migrations,
      recoveryBackup: {
        async createAndValidate(request) {
          if (request.databaseName !== databaseName || request.fromVersion !== 0) {
            throw new Error("phase18_garmin_benchmark_recovery_invalid");
          }
          return Object.freeze({
            backupId: `${databaseName}:empty-database`,
            ...request,
            validated: true as const,
          });
        },
      },
    }).run();
  },
  createRepository: createImportedActivityRepository,
  createBoundedSync: createPhase18GarminBenchmarkBoundedSync,
});

export function phase18GarminBenchmarkDatabaseName(nonce: string): string {
  if (!BENCHMARK_NONCE.test(nonce)) {
    throw new Error("phase18_garmin_benchmark_database_identity_invalid");
  }
  return `${BENCHMARK_DATABASE_PREFIX}${nonce}.db`;
}

function assertBenchmarkActive(signal: BenchmarkAbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new Error("phase18_garmin_benchmark_cancelled");
  }
}

export async function withPhase18GarminBenchmarkTemporaryDatabaseDependencies<Result>(
  input: Readonly<{
    nonce: string;
    sha256: GarminSha256;
    signal?: BenchmarkAbortSignal;
    run(session: Readonly<{
      databaseName: string;
      runBoundedSync: BoundedSync;
    }>): Promise<Result>;
  }>,
  dependencies: Phase18GarminBenchmarkDatabaseDependencies,
): Promise<Result> {
  const databaseName = phase18GarminBenchmarkDatabaseName(input.nonce);
  let kernel: SqliteKernel | undefined;
  await dependencies.removeDatabase(databaseName);
  try {
    assertBenchmarkActive(input.signal);
    kernel = await dependencies.openKernel(databaseName);
    await dependencies.migrate(databaseName, kernel);
    assertBenchmarkActive(input.signal);
    const runBoundedSync = dependencies.createBoundedSync({
      nonce: input.nonce,
      repository: dependencies.createRepository(kernel),
      sha256: input.sha256,
    });
    return await input.run(Object.freeze({
      databaseName,
      runBoundedSync: async (sampleSequence) => {
        assertBenchmarkActive(input.signal);
        const result = await runBoundedSync(sampleSequence);
        assertBenchmarkActive(input.signal);
        return result;
      },
    }));
  } finally {
    let cleanupFailed = false;
    try {
      await kernel?.close();
    } catch {
      cleanupFailed = true;
    }
    try {
      await dependencies.removeDatabase(databaseName);
    } catch {
      cleanupFailed = true;
    }
    if (cleanupFailed) {
      throw new Error("phase18_garmin_benchmark_database_cleanup_failed");
    }
  }
}

export function withPhase18GarminBenchmarkTemporaryDatabase<Result>(input: Readonly<{
  nonce: string;
  sha256: GarminSha256;
  signal?: BenchmarkAbortSignal;
  run(session: Readonly<{
    databaseName: string;
    runBoundedSync: BoundedSync;
  }>): Promise<Result>;
}>): Promise<Result> {
  return withPhase18GarminBenchmarkTemporaryDatabaseDependencies(
    input,
    productionDatabaseDependencies,
  );
}

function boundedExternalActivityId(
  nonce: string,
  sampleSequence: number,
  activityIndex: number,
): string {
  const noncePrefix = String(Number.parseInt(nonce.slice(0, 8), 16) + 1).padStart(10, "0");
  return `1${noncePrefix}${String(sampleSequence).padStart(2, "0")}${String(activityIndex + 1).padStart(3, "0")}`;
}

function benchmarkNativeSuccess(data: unknown) {
  return Object.freeze({ status: "ok" as const, generation: 1, data });
}

export function createPhase18GarminBenchmarkDriver(
  nonce: string,
  sampleSequence: number,
): GarminNativeDriver {
  const activityIds = Object.freeze(Array.from(
    { length: PHASE18_GARMIN_BENCHMARK_MAX_FIXTURE.activity_count },
    (_, index) => boundedExternalActivityId(nonce, sampleSequence, index),
  ));
  const activity = (externalActivityId: string) => Object.freeze({
    activityId: Number(externalActivityId),
    activityTypeDTO: Object.freeze({ typeKey: "running" }),
    summaryDTO: Object.freeze({
      startTimeGMT: "2026-01-01T00:00:00.000Z",
      startTimeLocal: "2026-01-01T08:00:00",
      timeZoneId: "Asia/Singapore",
      distance: 5_000,
      duration: 1_500,
      elapsedDuration: 1_560,
      movingDuration: 1_475,
      averageHR: 152,
    }),
  });
  return Object.freeze({
    connectionState: async () => benchmarkNativeSuccess(Object.freeze({
      kind: "connected",
      account_namespace: `garmin:${nonce}`,
    })),
    restoreSession: async () => benchmarkNativeSuccess(Object.freeze({
      kind: "connected",
      account_namespace: `garmin:${nonce}`,
    })),
    login: async () => benchmarkNativeSuccess(Object.freeze({ kind: "disconnected" })),
    resumeMfa: async () => benchmarkNativeSuccess(Object.freeze({ kind: "disconnected" })),
    logout: async () => benchmarkNativeSuccess(Object.freeze({ kind: "disconnected" })),
    getActivities: async ({ start, limit }) => {
      const selected = activityIds.slice(start, start + limit);
      const nextStart = start + selected.length;
      return benchmarkNativeSuccess(Object.freeze({
        items: Object.freeze(selected.map((externalActivityId) => Object.freeze({
          activityId: Number(externalActivityId),
          activityType: Object.freeze({ typeKey: "running" }),
        }))),
        ...(nextStart >= activityIds.length ? {} : { nextStart }),
      }));
    },
    getActivity: async ({ externalActivityId }) =>
      benchmarkNativeSuccess(activity(externalActivityId)),
    getActivitySplits: async () => benchmarkNativeSuccess(Object.freeze({
      lapDTOs: PHASE18_GARMIN_BENCHMARK_MAX_FIXTURE.laps,
    })),
    getActivityDetails: async () => benchmarkNativeSuccess(Object.freeze({
      metricDescriptors: Object.freeze([]),
      activityDetailMetrics: Object.freeze([]),
      geoPolylineDTO: Object.freeze({
        polyline: PHASE18_GARMIN_BENCHMARK_MAX_FIXTURE.route,
      }),
    })),
  });
}

export function createPhase18GarminBenchmarkBoundedSync(input: Readonly<{
  nonce: string;
  repository: ImportedActivityCommandRepository;
  sha256: GarminSha256;
}>): (sampleSequence: number) => Promise<GarminSyncResult> {
  if (!BENCHMARK_NONCE.test(input.nonce)
    || PHASE18_GARMIN_BENCHMARK_MAX_FIXTURE.activity_count !== GARMIN_SYNC_DEFAULT_LIMITS.maxActivities) {
    throw new Error("phase18_garmin_benchmark_marker_invalid");
  }
  return async (sampleSequence) => {
    if (!Number.isSafeInteger(sampleSequence) || sampleSequence < 1 || sampleSequence > 99) {
      throw new Error("phase18_bounded_sync_sequence_invalid");
    }
    const accountNamespace = `garmin:${input.nonce}`;
    const source = createGarminActivityAdapter({
      driver: createPhase18GarminBenchmarkDriver(input.nonce, sampleSequence),
      mapper: {
        fromActivity: (activity) => normalizeGarminActivity({
          account_namespace: accountNamespace,
          ...activity,
        }, input.sha256),
      },
    });
    const importActivity = createGarminSharedImportCommitter({
      repository: input.repository,
      sha256: input.sha256,
      requestFor: async (prepared) => {
        const identitySha256 = await input.sha256(canonicalJson({
          source_kind: prepared.envelope.source_kind,
          account_namespace: prepared.envelope.account_namespace,
          external_activity_id: prepared.envelope.external_activity_id,
        }));
        const requestSha256 = await input.sha256(canonicalJson({
          identity_sha256: identitySha256,
          normalized_json_sha256: prepared.envelope.normalized_json_sha256,
          sample_sequence: sampleSequence,
        }));
        return Object.freeze({
          requestId: `garmin-benchmark:${requestSha256.slice(0, 48)}`,
          requestSha256,
          activityId: `activity-${identitySha256.slice(0, 48)}`,
          expectedAggregateRevision: 0,
          confirmedLocalDate: "2026-01-01",
        });
      },
    });
    const result = await createGarminSyncCoordinator({
      source,
      importActivity,
      limits: GARMIN_SYNC_DEFAULT_LIMITS,
    }).syncNow();
    if (result.kind !== "success"
      || result.counts.discoveredActivities !== GARMIN_SYNC_DEFAULT_LIMITS.maxActivities
      || result.counts.newActivities !== GARMIN_SYNC_DEFAULT_LIMITS.maxActivities) {
      throw new Error("phase18_bounded_sync_incomplete");
    }
    return result;
  };
}

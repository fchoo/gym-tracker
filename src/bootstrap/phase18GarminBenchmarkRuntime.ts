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
import { PHASE18_GARMIN_BENCHMARK_MAX_FIXTURE } from "../testing/phase18GarminAcceptance";

const BENCHMARK_NONCE = /^[a-f0-9]{32}$/u;

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

function createBoundedBenchmarkDriver(
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
      driver: createBoundedBenchmarkDriver(input.nonce, sampleSequence),
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

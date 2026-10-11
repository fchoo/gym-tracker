import { createHash } from "node:crypto";

const sha256 = (value: unknown): string => createHash("sha256")
  .update(JSON.stringify(value))
  .digest("hex");

export const GARMIN_JSON_FIXTURE_PAYLOADS = Object.freeze({
  "synthetic-outdoor-bounded-v1": Object.freeze({
    activity: Object.freeze({
      activityId: 18_001,
      activityTypeDTO: Object.freeze({ typeKey: "running" }),
      summaryDTO: Object.freeze({
        startTimeGMT: "2026-01-01T00:00:00.000Z",
        distance: 5_000,
        duration: 1_500,
        elapsedDuration: 1_560,
        movingDuration: 1_475,
      }),
    }),
    splits: Object.freeze({
      lapDTOs: Object.freeze([
        Object.freeze({ lapIndex: 1, distance: 1_000, duration: 300 }),
        Object.freeze({ lapIndex: 2, distance: 1_000, duration: 298 }),
      ]),
    }),
    details: Object.freeze({
      metricDescriptors: Object.freeze([]),
      activityDetailMetrics: Object.freeze([]),
      geoPolylineDTO: Object.freeze({
        polyline: Object.freeze([
          Object.freeze({ lat: 1.3000, lon: 103.8000 }),
          Object.freeze({ lat: 1.3001, lon: 103.8001 }),
        ]),
      }),
    }),
  }),
  "synthetic-treadmill-bounded-v1": Object.freeze({
    activity: Object.freeze({
      activityId: 18_002,
      activityTypeDTO: Object.freeze({ typeKey: "treadmill_running" }),
      summaryDTO: Object.freeze({
        startTimeGMT: "2026-01-02T00:00:00.000Z",
        distance: 3_200,
        duration: 1_200,
        elapsedDuration: 1_220,
        movingDuration: 1_195,
      }),
    }),
    splits: Object.freeze({
      lapDTOs: Object.freeze([
        Object.freeze({ lapIndex: 1, distance: 1_600, duration: 600 }),
        Object.freeze({ lapIndex: 2, distance: 1_600, duration: 600 }),
      ]),
    }),
    details: Object.freeze({
      metricDescriptors: Object.freeze([]),
      activityDetailMetrics: Object.freeze([]),
    }),
  }),
  "synthetic-revision-bounded-v1": Object.freeze({
    activity: Object.freeze({
      activityId: 18_003,
      activityTypeDTO: Object.freeze({ typeKey: "running" }),
      summaryDTO: Object.freeze({
        startTimeGMT: "2026-01-03T00:00:00.000Z",
        distance: 10_000,
        duration: 3_000,
        elapsedDuration: 3_060,
        movingDuration: 2_980,
      }),
    }),
    splits: Object.freeze({ lapDTOs: Object.freeze([]) }),
    details: Object.freeze({
      metricDescriptors: Object.freeze([]),
      activityDetailMetrics: Object.freeze([]),
    }),
  }),
});

const definitions = [
  Object.freeze({
    id: "synthetic-outdoor-bounded-v1" as const,
    fidelity: "source_sampled" as const,
    expected_normalized_summary: Object.freeze({
      sport: "running" as const,
      subtype: "outdoor",
      distance_meters: 5_000,
      elapsed_ms: 1_560_000,
      timer_ms: 1_500_000,
      moving_ms: 1_475_000,
      lap_count: 2,
      route: "sampled" as const,
    }),
  }),
  Object.freeze({
    id: "synthetic-treadmill-bounded-v1" as const,
    fidelity: "source_summary" as const,
    expected_normalized_summary: Object.freeze({
      sport: "running" as const,
      subtype: "treadmill",
      distance_meters: 3_200,
      elapsed_ms: 1_220_000,
      timer_ms: 1_200_000,
      moving_ms: 1_195_000,
      lap_count: 2,
      route: "none" as const,
    }),
  }),
  Object.freeze({
    id: "synthetic-revision-bounded-v1" as const,
    fidelity: "source_summary" as const,
    expected_normalized_summary: Object.freeze({
      sport: "running" as const,
      subtype: "outdoor",
      distance_meters: 10_000,
      elapsed_ms: 3_060_000,
      timer_ms: 3_000_000,
      moving_ms: 2_980_000,
      lap_count: 0,
      route: "none" as const,
    }),
  }),
] as const;

export const GARMIN_JSON_FIXTURE_MANIFEST = Object.freeze(
  definitions.map((definition) => {
    const payload = GARMIN_JSON_FIXTURE_PAYLOADS[definition.id];
    return Object.freeze({
      ...definition,
      component_sha256: Object.freeze({
        activity: sha256(payload.activity),
        splits: sha256(payload.splits),
        details: sha256(payload.details),
      }),
    });
  }),
);

export const GARMIN_JSON_FIXTURE_MANIFEST_SHA256 = sha256(
  GARMIN_JSON_FIXTURE_MANIFEST,
);

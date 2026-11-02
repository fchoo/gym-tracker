import { createHash } from "node:crypto";
import { canonicalizeGarminPayload } from "../../../src/platform/garmin/canonicalGarminPayload.ts";

const sha256 = (value: unknown): string => createHash("sha256")
  .update(canonicalizeGarminPayload(value))
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
    expected_sample_fidelity: "sampled" as const,
    expected_fidelity_by_channel: Object.freeze({
      summary: "source_summary" as const,
      laps: "source_laps" as const,
      route: "sampled" as const,
      exact_effort_basis: "source_laps" as const,
    }),
    expected_normalized: Object.freeze({
      version: 1 as const,
      started_at_ms: 1_767_225_600_000,
      sport: "running" as const,
      subtype: "outdoor" as const,
      distance_meters: 5_000,
      elapsed_ms: 1_560_000,
      timer_ms: 1_500_000,
      moving_ms: 1_475_000,
      laps: Object.freeze([
        Object.freeze({ ordinal: 0, timer_ms: 300_000, distance_meters: 1_000 }),
        Object.freeze({ ordinal: 1, timer_ms: 298_000, distance_meters: 1_000 }),
      ]),
      route: Object.freeze([
        Object.freeze({ latitude_e6: 1_300_000, longitude_e6: 103_800_000 }),
        Object.freeze({ latitude_e6: 1_300_100, longitude_e6: 103_800_100 }),
      ]),
    }),
  }),
  Object.freeze({
    id: "synthetic-treadmill-bounded-v1" as const,
    expected_sample_fidelity: "source_laps" as const,
    expected_fidelity_by_channel: Object.freeze({
      summary: "source_summary" as const,
      laps: "source_laps" as const,
      exact_effort_basis: "source_laps" as const,
    }),
    expected_normalized: Object.freeze({
      version: 1 as const,
      started_at_ms: 1_767_312_000_000,
      sport: "running" as const,
      subtype: "treadmill" as const,
      distance_meters: 3_200,
      elapsed_ms: 1_220_000,
      timer_ms: 1_200_000,
      moving_ms: 1_195_000,
      laps: Object.freeze([
        Object.freeze({ ordinal: 0, timer_ms: 600_000, distance_meters: 1_600 }),
        Object.freeze({ ordinal: 1, timer_ms: 600_000, distance_meters: 1_600 }),
      ]),
    }),
  }),
  Object.freeze({
    id: "synthetic-revision-bounded-v1" as const,
    expected_sample_fidelity: "source_summary" as const,
    expected_fidelity_by_channel: Object.freeze({
      summary: "source_summary" as const,
      exact_effort_basis: "source_summary" as const,
    }),
    expected_normalized: Object.freeze({
      version: 1 as const,
      started_at_ms: 1_767_398_400_000,
      sport: "running" as const,
      subtype: "outdoor" as const,
      distance_meters: 10_000,
      elapsed_ms: 3_060_000,
      timer_ms: 3_000_000,
      moving_ms: 2_980_000,
      laps: Object.freeze([]),
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
      normalized_sha256: sha256({
        normalization_version: 1,
        normalized: definition.expected_normalized,
      }),
    });
  }),
);

export const GARMIN_JSON_FIXTURE_MANIFEST_SHA256 = sha256(
  GARMIN_JSON_FIXTURE_MANIFEST,
);

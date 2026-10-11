import { createHash } from "node:crypto";
import { describe, expect, it } from "@jest/globals";

import { canonicalJson } from "../../domains/activities/importContracts";
import {
  GARMIN_NORMALIZATION_VERSION,
  normalizeGarminActivity,
} from "./normalizeGarminActivity";

const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");

function outdoorFixture(fetchTime = "2026-10-11T07:00:00.000Z") {
  return {
    account_namespace: "account-fixture",
    external_activity_id: "987654321",
    activity: {
      activityId: 987654321,
      activityTypeDTO: { typeKey: "running", ignoredLabel: "Running" },
      summaryDTO: {
        startTimeGMT: "2026-10-05T23:30:00.000Z",
        distance: 5_000,
        duration: 1_500,
        elapsedDuration: 1_560,
        movingDuration: 1_475,
        averageHR: 152,
      },
      fetchTime,
    },
    splits: {
      lapDTOs: [
        {
          lapIndex: 1,
          distance: 1_000,
          duration: 300,
          elapsedDuration: 310,
          movingDuration: 295,
          averageHR: 148,
        },
        {
          lapIndex: 2,
          distance: 4_000,
          duration: 1_200,
          elapsedDuration: 1_250,
          movingDuration: 1_180,
          averageHR: 153,
        },
      ],
      fetchTime,
    },
    details: {
      metricDescriptors: [
        { key: "directHeartRate", metricsIndex: 2 },
        { key: "sumElapsedDuration", metricsIndex: 0 },
        { key: "sumDistance", metricsIndex: 1 },
      ],
      activityDetailMetrics: [
        { metrics: [0, 0, 140] },
        { metrics: [300, 1_000, 148] },
        { metrics: [1_560, 5_000, 155] },
      ],
      geoPolylineDTO: {
        polyline: [
          { lat: 1.3521, lon: 103.8198, elapsedDuration: 0 },
          { lat: 1.3532, lon: 103.8211, elapsedDuration: 300 },
        ],
      },
      fetchTime,
    },
  } as const;
}

const expectedNormalized = {
  version: 1 as const,
  started_at_ms: Date.UTC(2026, 9, 5, 23, 30),
  sport: "running" as const,
  subtype: "outdoor",
  distance_meters: 5_000,
  elapsed_ms: 1_560_000,
  timer_ms: 1_500_000,
  moving_ms: 1_475_000,
  average_heart_rate_bpm: 152,
  laps: [
    {
      ordinal: 0,
      elapsed_ms: 310_000,
      timer_ms: 300_000,
      moving_ms: 295_000,
      distance_meters: 1_000,
      average_heart_rate_bpm: 148,
    },
    {
      ordinal: 1,
      elapsed_ms: 1_250_000,
      timer_ms: 1_200_000,
      moving_ms: 1_180_000,
      distance_meters: 4_000,
      average_heart_rate_bpm: 153,
    },
  ],
  samples: [
    { elapsed_ms: 0, distance_meters: 0, heart_rate_bpm: 140 },
    { elapsed_ms: 300_000, distance_meters: 1_000, heart_rate_bpm: 148 },
    { elapsed_ms: 1_560_000, distance_meters: 5_000, heart_rate_bpm: 155 },
  ],
  route: [
    { latitude_e6: 1_352_100, longitude_e6: 103_819_800, elapsed_ms: 0 },
    { latitude_e6: 1_353_200, longitude_e6: 103_821_100, elapsed_ms: 300_000 },
  ],
};

describe("normalize Garmin activity", () => {
  it("maps one outdoor summary/splits/details triple into the exact shared envelope", async () => {
    const envelope = await normalizeGarminActivity(outdoorFixture(), sha256);

    expect(envelope).toEqual({
      version: 1,
      source_kind: "garmin_connect_account",
      account_namespace: "account-fixture",
      external_activity_id: "987654321",
      normalization_version: GARMIN_NORMALIZATION_VERSION,
      normalized_json_sha256: await sha256(canonicalJson({
        normalization_version: GARMIN_NORMALIZATION_VERSION,
        normalized: expectedNormalized,
      })),
      raw_component_sha256: {
        activity: expect.stringMatching(/^[a-f0-9]{64}$/u),
        splits: expect.stringMatching(/^[a-f0-9]{64}$/u),
        details: expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
      sample_fidelity: "source_laps",
      normalized: expectedNormalized,
    });
    expect(envelope).not.toHaveProperty("fit_sha256");
  });

  it("keeps semantic identity stable across key/fetch-time changes and changes it with content", async () => {
    const first = outdoorFixture("2026-10-11T07:00:00.000Z");
    const reordered = outdoorFixture("2026-10-11T08:00:00.000Z");
    const second = {
      ...reordered,
      activity: {
        fetchTime: reordered.activity.fetchTime,
        summaryDTO: { ...reordered.activity.summaryDTO },
        activityTypeDTO: { ...reordered.activity.activityTypeDTO },
        activityId: reordered.activity.activityId,
      },
    };
    const changed = {
      ...second,
      activity: {
        ...second.activity,
        summaryDTO: { ...second.activity.summaryDTO, distance: 5_001 },
      },
    };

    const [firstEnvelope, secondEnvelope, changedEnvelope] = await Promise.all([
      normalizeGarminActivity(first, sha256),
      normalizeGarminActivity(second, sha256),
      normalizeGarminActivity(changed, sha256),
    ]);

    expect(secondEnvelope.normalized_json_sha256).toBe(firstEnvelope.normalized_json_sha256);
    expect(secondEnvelope.raw_component_sha256).toEqual(firstEnvelope.raw_component_sha256);
    expect(changedEnvelope.normalized_json_sha256).not.toBe(firstEnvelope.normalized_json_sha256);
    expect(changedEnvelope.raw_component_sha256.activity).not.toBe(
      firstEnvelope.raw_component_sha256.activity,
    );
  });
});

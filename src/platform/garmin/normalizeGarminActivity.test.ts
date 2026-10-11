import { createHash } from "node:crypto";
import { describe, expect, it } from "@jest/globals";

import { canonicalJson } from "../../domains/activities/importContracts";
import {
  GARMIN_NORMALIZATION_VERSION,
  isExactGarminEffortEligible,
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
  };
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

  it("preserves present zero separately from absent duration, HR, route, laps, and samples", async () => {
    const fixture = outdoorFixture();
    fixture.activity.summaryDTO.duration = 0;
    delete (fixture.activity.summaryDTO as Partial<typeof fixture.activity.summaryDTO>).elapsedDuration;
    delete (fixture.activity.summaryDTO as Partial<typeof fixture.activity.summaryDTO>).movingDuration;
    delete (fixture.activity.summaryDTO as Partial<typeof fixture.activity.summaryDTO>).averageHR;
    fixture.splits.lapDTOs = [];
    fixture.details.metricDescriptors = [];
    fixture.details.activityDetailMetrics = [];
    delete (fixture.details as Partial<typeof fixture.details>).geoPolylineDTO;

    const envelope = await normalizeGarminActivity(fixture, sha256);

    expect(envelope.sample_fidelity).toBe("source_summary");
    expect(envelope.normalized).toMatchObject({ timer_ms: 0, distance_meters: 5_000, laps: [] });
    for (const key of ["elapsed_ms", "moving_ms", "average_heart_rate_bpm", "samples", "route"] as const) {
      expect(envelope.normalized).not.toHaveProperty(key);
    }
  });

  it("keeps treadmill positions out of route while retaining descriptor-selected samples", async () => {
    const fixture = outdoorFixture();
    fixture.activity.activityTypeDTO.typeKey = "treadmill_running";
    fixture.splits.lapDTOs = [];

    const envelope = await normalizeGarminActivity(fixture, sha256);

    expect(envelope.normalized.subtype).toBe("treadmill");
    expect(envelope.normalized).not.toHaveProperty("route");
    expect(envelope.normalized.samples).toEqual(expectedNormalized.samples);
  });

  it("uses descriptor keys rather than fixed positions and preserves repeated nonuniform samples", async () => {
    const first = outdoorFixture();
    first.splits.lapDTOs = [];
    first.details.activityDetailMetrics = [
      { metrics: [0, 0, 140] },
      { metrics: [300, 1_000, null] },
      { metrics: [300, 1_000, 148] },
      { metrics: [1_560, 5_000, 155] },
    ] as unknown as typeof first.details.activityDetailMetrics;
    const reordered = outdoorFixture();
    reordered.splits.lapDTOs = [];
    reordered.details.metricDescriptors = [
      { key: "sumDistance", metricsIndex: 0 },
      { key: "directHeartRate", metricsIndex: 1 },
      { key: "sumElapsedDuration", metricsIndex: 2 },
    ];
    reordered.details.activityDetailMetrics = [
      { metrics: [0, 140, 0] },
      { metrics: [1_000, null, 300] },
      { metrics: [1_000, 148, 300] },
      { metrics: [5_000, 155, 1_560] },
    ] as unknown as typeof reordered.details.activityDetailMetrics;

    const [firstEnvelope, reorderedEnvelope] = await Promise.all([
      normalizeGarminActivity(first, sha256),
      normalizeGarminActivity(reordered, sha256),
    ]);

    expect(reorderedEnvelope.normalized.samples).toEqual(firstEnvelope.normalized.samples);
    expect(reorderedEnvelope.normalized_json_sha256).toBe(firstEnvelope.normalized_json_sha256);
    expect(reorderedEnvelope.raw_component_sha256.details).not.toBe(firstEnvelope.raw_component_sha256.details);
  });

  it("marks sample-derived distance as sampled and never promotes it to an exact effort", async () => {
    const fixture = outdoorFixture();
    delete (fixture.activity.summaryDTO as Partial<typeof fixture.activity.summaryDTO>).distance;
    fixture.splits.lapDTOs = [];

    const envelope = await normalizeGarminActivity(fixture, sha256);

    expect(envelope.sample_fidelity).toBe("sampled");
    expect(envelope.normalized.distance_meters).toBe(5_000);
    expect(isExactGarminEffortEligible(envelope, 5_000)).toBe(false);
  });

  it("allows exact total summary or source-lap effort only when source time evidence exists", async () => {
    const sourceLaps = await normalizeGarminActivity(outdoorFixture(), sha256);
    const sourceSummaryFixture = outdoorFixture();
    sourceSummaryFixture.splits.lapDTOs = [];
    const sourceSummary = await normalizeGarminActivity(sourceSummaryFixture, sha256);
    const noTimeFixture = outdoorFixture();
    noTimeFixture.splits.lapDTOs = [];
    delete (noTimeFixture.activity.summaryDTO as Partial<typeof noTimeFixture.activity.summaryDTO>).duration;
    delete (noTimeFixture.activity.summaryDTO as Partial<typeof noTimeFixture.activity.summaryDTO>).elapsedDuration;
    delete (noTimeFixture.activity.summaryDTO as Partial<typeof noTimeFixture.activity.summaryDTO>).movingDuration;
    const noTime = await normalizeGarminActivity(noTimeFixture, sha256);

    expect(isExactGarminEffortEligible(sourceLaps, 1_000)).toBe(true);
    expect(isExactGarminEffortEligible(sourceLaps, 5_000)).toBe(true);
    expect(isExactGarminEffortEligible(sourceLaps, 2_400)).toBe(false);
    expect(isExactGarminEffortEligible(sourceSummary, 5_000)).toBe(true);
    expect(isExactGarminEffortEligible(noTime, 5_000)).toBe(false);
    expect(isExactGarminEffortEligible(sourceSummary, 0)).toBe(false);
    expect(isExactGarminEffortEligible(sourceSummary, 1.5)).toBe(false);
  });

  it("keeps zero source distance truthful instead of falling back to sampled distance", async () => {
    const fixture = outdoorFixture();
    fixture.activity.summaryDTO.distance = 0;
    fixture.splits.lapDTOs = [];

    const envelope = await normalizeGarminActivity(fixture, sha256);

    expect(envelope.sample_fidelity).toBe("source_summary");
    expect(envelope.normalized.distance_meters).toBe(0);
  });

  it.each([
    ["malformed account namespace", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, account_namespace: "account namespace" })],
    ["malformed external ID", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, external_activity_id: "activity/1" })],
    ["mismatched activity ID", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, external_activity_id: "123" })],
    ["unsupported sport", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, activity: { ...fixture.activity, activityTypeDTO: { typeKey: "cycling" } } })],
    ["invalid GMT start", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, activity: { ...fixture.activity, summaryDTO: { ...fixture.activity.summaryDTO, startTimeGMT: "2026-02-30T10:00:00.000Z" } } })],
    ["unsafe number", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, activity: { ...fixture.activity, summaryDTO: { ...fixture.activity.summaryDTO, distance: Number.POSITIVE_INFINITY } } })],
    ["too many laps", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, splits: { lapDTOs: Array(1_001).fill(fixture.splits.lapDTOs[0]) } })],
    ["too many detail samples", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, details: { ...fixture.details, activityDetailMetrics: Array(2_001).fill(fixture.details.activityDetailMetrics[0]) } })],
    ["too many route points", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, details: { ...fixture.details, geoPolylineDTO: { polyline: Array(4_001).fill(fixture.details.geoPolylineDTO.polyline[0]) } } })],
    ["duplicate descriptor index", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, details: { ...fixture.details, metricDescriptors: [{ key: "sumDistance", metricsIndex: 0 }, { key: "directHeartRate", metricsIndex: 0 }] } })],
    ["positional metrics without descriptors", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, details: { ...fixture.details, metricDescriptors: [] } })],
    ["invalid route coordinate", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, details: { ...fixture.details, geoPolylineDTO: { polyline: [{ lat: 91, lon: 0 }] } } })],
    ["invalid source heart rate", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, activity: { ...fixture.activity, summaryDTO: { ...fixture.activity.summaryDTO, averageHR: 0 } } })],
    ["missing all distance evidence", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, activity: { ...fixture.activity, summaryDTO: { startTimeGMT: fixture.activity.summaryDTO.startTimeGMT } }, splits: { lapDTOs: [] }, details: { metricDescriptors: [], activityDetailMetrics: [] } })],
  ])("rejects %s", async (_label, mutate) => {
    await expect(normalizeGarminActivity(mutate(outdoorFixture()), sha256)).rejects.toThrow(/garmin_(?:source_invalid|sport_unsupported|json_)/u);
  });

  it("uses the exact normalization version in semantic identity", async () => {
    const envelope = await normalizeGarminActivity(outdoorFixture(), sha256);
    expect(GARMIN_NORMALIZATION_VERSION).toBe(1);
    expect(envelope.normalization_version).toBe(1);
    expect(envelope.normalized_json_sha256).toBe(await sha256(canonicalJson({
      normalization_version: 1,
      normalized: envelope.normalized,
    })));
  });
});

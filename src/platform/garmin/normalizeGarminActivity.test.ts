import { createHash } from "node:crypto";
import { describe, expect, it, jest } from "@jest/globals";

import { canonicalJson, CanonicalGarminPayloadSchema } from "../../domains/activities/importContracts";
import { canonicalizeGarminPayload, GARMIN_CANONICAL_LIMITS } from "./canonicalGarminPayload";
import {
  GARMIN_NORMALIZATION_VERSION,
  isExactGarminEffortEligible,
  normalizeGarminActivity,
} from "./normalizeGarminActivity";

const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");

function columnarDetails() {
  return {
    transportProjectionVersion: 1,
    metricDescriptors: [
      { key: "directHeartRate", metricsIndex: 2, sourceMetricsIndex: 4 },
      { key: "sumElapsedDuration", metricsIndex: 0, sourceMetricsIndex: 0 },
      { key: "sumDistance", metricsIndex: 1, sourceMetricsIndex: 2 },
    ],
    sourceMetricDescriptorCount: 5,
    activityDetailMetricColumns: [[0, 300, 300, 1560], [null, null, null, 5000], [null, 148, 148, 155]],
    sourceMetricCounts: [1, 5, 5, 5],
    geoPolylineDTO: { polyline: [[1.3521, 103.8198, 0], [1.3532, 103.8211, 300]] },
  };
}

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
  it("matches legacy row semantics with sparse source indexes, duplicate samples, nulls and route durations", async () => {
    const legacy = outdoorFixture();
    legacy.details.metricDescriptors = [
      { key: "directHeartRate", metricsIndex: 4 }, { key: "sumElapsedDuration", metricsIndex: 0 }, { key: "sumDistance", metricsIndex: 2 },
    ];
    legacy.details.activityDetailMetrics = [{ metrics: [0] }, { metrics: [300, 1, null, 3, 148] }, { metrics: [300, 1, null, 3, 148] }, { metrics: [1560, 1, 5000, 3, 155] }] as unknown as typeof legacy.details.activityDetailMetrics;
    const expected = await normalizeGarminActivity(legacy, sha256);
    const compact = await normalizeGarminActivity({ ...legacy, details: columnarDetails() }, sha256);
    expect(compact.normalized).toEqual(expected.normalized);
    expect(compact.normalized_json_sha256).toBe(expected.normalized_json_sha256);
    expect(compact.fidelity_by_channel).toEqual(expected.fidelity_by_channel);
    expect(compact.raw_component_sha256.details).not.toBe(expected.raw_component_sha256.details);
    expect(compact.normalized.samples).toHaveLength(4);
    expect(compact.normalized.route).toEqual(expectedNormalized.route);
  });

  it("preserves every full-capacity compact sample and timed route point without changing limits", async () => {
    const details = columnarDetails();
    details.sourceMetricDescriptorCount = 128;
    details.metricDescriptors[0]!.sourceMetricsIndex = 127;
    details.metricDescriptors[1]!.sourceMetricsIndex = 1;
    details.metricDescriptors[2]!.sourceMetricsIndex = 63;
    details.sourceMetricCounts = Array.from({ length: 2000 }, () => 128);
    details.activityDetailMetricColumns = [Array.from({ length: 2000 }, (_, ordinal) => ordinal), Array.from({ length: 2000 }, (_, ordinal) => ordinal * 2), Array.from({ length: 2000 }, () => 140)];
    details.geoPolylineDTO.polyline = Array.from({ length: 4000 }, (_, ordinal) => [ordinal / 10000, -ordinal / 10000, ordinal]);
    const envelope = await normalizeGarminActivity({ ...outdoorFixture(), details }, sha256);
    expect(envelope.normalized.samples).toHaveLength(2000);
    expect(envelope.normalized.route).toHaveLength(4000);
    expect(envelope.normalized.samples?.[1999]).toEqual({ elapsed_ms: 1999000, distance_meters: 3998, heart_rate_bpm: 140 });
    expect(envelope.normalized.route?.[3999]).toEqual({ latitude_e6: 399900, longitude_e6: -399900, elapsed_ms: 3999000 });
  });

  it("preserves compact null/absent/empty channels and tuple missing/null/zero time", async () => {
    for (const state of ["missing", "null", "empty"] as const) {
      const details: Record<string, unknown> = { transportProjectionVersion: 1,
        geoPolylineDTO: { polyline: [[0, 0], [0, 0, null], [0, 0, 0]] } };
      if (state === "null") Object.assign(details, { metricDescriptors: null, sourceMetricCounts: null, activityDetailMetricColumns: null });
      if (state === "empty") Object.assign(details, { metricDescriptors: [], sourceMetricDescriptorCount: 0, sourceMetricCounts: [], activityDetailMetricColumns: [] });
      const envelope = await normalizeGarminActivity({ ...outdoorFixture(), details }, sha256);
      expect(envelope.normalized).not.toHaveProperty("samples");
      expect(envelope.normalized.route).toEqual([{ latitude_e6: 0, longitude_e6: 0 }, { latitude_e6: 0, longitude_e6: 0 }, { latitude_e6: 0, longitude_e6: 0, elapsed_ms: 0 }]);
    }
    const details = columnarDetails(); details.activityDetailMetricColumns = [[], [], []]; details.sourceMetricCounts = [];
    expect((await normalizeGarminActivity({ ...outdoorFixture(), details }, sha256)).normalized).not.toHaveProperty("samples");
    details.activityDetailMetricColumns = [[null], [null], [null]]; details.sourceMetricCounts = [0];
    expect((await normalizeGarminActivity({ ...outdoorFixture(), details }, sha256)).normalized).not.toHaveProperty("samples");
  });

  it("retains nonuniform sample order and original layout hashes without promoting sampled effort", async () => {
    const details = columnarDetails(); details.activityDetailMetricColumns[0] = [300, 0, 300, 1560];
    details.sourceMetricDescriptorCount = 3; // Three sparse original descriptors can legitimately reference slot four.
    const fixture = outdoorFixture(); delete (fixture.activity.summaryDTO as Partial<typeof fixture.activity.summaryDTO>).distance; fixture.splits.lapDTOs = [];
    const envelope = await normalizeGarminActivity({ ...fixture, details }, sha256);
    expect(envelope.normalized.samples?.map(sample => sample.elapsed_ms)).toEqual([300000, 0, 300000, 1560000]);
    expect(isExactGarminEffortEligible(envelope, 5000)).toBe(false);
    const wider = { ...details, sourceMetricCounts: [2, 6, 6, 6] };
    const changed = await normalizeGarminActivity({ ...fixture, details: wider }, sha256);
    expect(changed.normalized).toEqual(envelope.normalized);
    expect(changed.raw_component_sha256.details).not.toBe(envelope.raw_component_sha256.details);
  });

  it.each([
    ["unknown version", (d: Record<string, unknown>) => { d.transportProjectionVersion = 2; }],
    ["boolean version", (d: Record<string, unknown>) => { d.transportProjectionVersion = true; }],
    ["missing version", (d: Record<string, unknown>) => { delete d.transportProjectionVersion; }],
    ["mixed legacy rows", (d: Record<string, unknown>) => { d.activityDetailMetrics = []; }],
    ["mixed null legacy rows", (d: Record<string, unknown>) => { d.activityDetailMetrics = null; }],
    ["missing counts", (d: Record<string, unknown>) => { delete d.sourceMetricCounts; }],
    ["missing columns", (d: Record<string, unknown>) => { delete d.activityDetailMetricColumns; }],
    ["null counts only", (d: Record<string, unknown>) => { d.sourceMetricCounts = null; }],
    ["null columns only", (d: Record<string, unknown>) => { d.activityDetailMetricColumns = null; }],
    ["non-array counts", (d: Record<string, unknown>) => { d.sourceMetricCounts = {}; }],
    ["too many rows", (d: Record<string, unknown>) => { d.sourceMetricCounts = Array.from({ length: 2001 }, () => 128); }],
    ["non-array columns", (d: Record<string, unknown>) => { d.activityDetailMetricColumns = {}; }],
    ["wrong column count", (d: Record<string, unknown>) => { d.activityDetailMetricColumns = []; }],
    ["non-array column", (d: Record<string, unknown>) => { d.activityDetailMetricColumns = [{}, [], []]; }],
    ["short column", (d: Record<string, unknown>) => { d.activityDetailMetricColumns = [[0], [], []]; }],
    ["missing descriptor count", (d: Record<string, unknown>) => { delete d.sourceMetricDescriptorCount; }],
    ["low descriptor count", (d: Record<string, unknown>) => { d.sourceMetricDescriptorCount = 2; }],
    ["high descriptor count", (d: Record<string, unknown>) => { d.sourceMetricDescriptorCount = 129; }],
    ["boolean descriptor count", (d: Record<string, unknown>) => { d.sourceMetricDescriptorCount = true; }],
    ["null descriptors with count", (d: Record<string, unknown>) => { d.metricDescriptors = null; }],
    ["unreviewed descriptor", (d: Record<string, unknown>) => { (d.metricDescriptors as Record<string, unknown>[])[0]!.key = "unreviewed"; }],
    ["too many descriptors", (d: Record<string, unknown>) => { (d.metricDescriptors as Record<string, unknown>[]).push({ key: "other", metricsIndex: 3, sourceMetricsIndex: 6 }); }],
    ["non-dense compact index", (d: Record<string, unknown>) => { (d.metricDescriptors as Record<string, unknown>[])[0]!.metricsIndex = 3; }],
    ["duplicate original index", (d: Record<string, unknown>) => { (d.metricDescriptors as Record<string, unknown>[])[0]!.sourceMetricsIndex = 2; }],
    ["negative original index", (d: Record<string, unknown>) => { (d.metricDescriptors as Record<string, unknown>[])[0]!.sourceMetricsIndex = -1; }],
    ["large original index", (d: Record<string, unknown>) => { (d.metricDescriptors as Record<string, unknown>[])[0]!.sourceMetricsIndex = 128; }],
    ["boolean original index", (d: Record<string, unknown>) => { (d.metricDescriptors as Record<string, unknown>[])[0]!.sourceMetricsIndex = true; }],
    ["unordered original indexes", (d: Record<string, unknown>) => { (d.metricDescriptors as Record<string, unknown>[])[1]!.sourceMetricsIndex = 3; }],
    ["negative width", (d: Record<string, unknown>) => { d.sourceMetricCounts = [-1, 5, 5, 5]; }],
    ["large width", (d: Record<string, unknown>) => { d.sourceMetricCounts = [129, 5, 5, 5]; }],
    ["boolean width", (d: Record<string, unknown>) => { d.sourceMetricCounts = [false, 5, 5, 5]; }],
    ["fractional width", (d: Record<string, unknown>) => { d.sourceMetricCounts = [1.5, 5, 5, 5]; }],
    ["absent source with a value", (d: Record<string, unknown>) => { (d.activityDetailMetricColumns as unknown[][])[1]![0] = 9; }],
    ["boolean metric", (d: Record<string, unknown>) => { (d.activityDetailMetricColumns as unknown[][])[0]![0] = true; }],
    ["NaN metric", (d: Record<string, unknown>) => { (d.activityDetailMetricColumns as unknown[][])[0]![0] = NaN; }],
    ["mixed route objects", (d: Record<string, unknown>) => { d.geoPolylineDTO = { polyline: [{ lat: 0, lon: 0 }] }; }],
    ["short route tuple", (d: Record<string, unknown>) => { d.geoPolylineDTO = { polyline: [[0]] }; }],
    ["long route tuple", (d: Record<string, unknown>) => { d.geoPolylineDTO = { polyline: [[0, 0, 0, 0]] }; }],
    ["null route coordinate", (d: Record<string, unknown>) => { d.geoPolylineDTO = { polyline: [[null, 0]] }; }],
    ["unsafe route coordinate", (d: Record<string, unknown>) => { d.geoPolylineDTO = { polyline: [[NaN, 0]] }; }],
    ["boolean route duration", (d: Record<string, unknown>) => { d.geoPolylineDTO = { polyline: [[0, 0, true]] }; }],
  ])("rejects compact corruption before hashing: %s", async (_label, mutate) => {
    const details = columnarDetails() as unknown as Record<string, unknown>; mutate(details);
    const hash = jest.fn(sha256);
    await expect(normalizeGarminActivity({ ...outdoorFixture(), details }, hash)).rejects.toThrow();
    expect(hash).not.toHaveBeenCalled();
  });

  it("rejects nonempty undescribed compact rows and metadata-only unknown-version forms", async () => {
    for (const details of [{ transportProjectionVersion: 1, metricDescriptors: [], sourceMetricDescriptorCount: 0, activityDetailMetricColumns: [], sourceMetricCounts: [0] },
      { sourceMetricDescriptorCount: 0 }, { transportProjectionVersion: 1, metricDescriptors: null, sourceMetricDescriptorCount: 0 }]) {
      await expect(normalizeGarminActivity({ ...outdoorFixture(), details }, sha256)).rejects.toThrow();
    }
  });

  it("keeps canonical identity bytes and digest behavior for previously accepted inputs", async () => {
    const seen: string[] = [];
    const envelope = await normalizeGarminActivity(outdoorFixture(), async value => { seen.push(value); return sha256(value); });
    const identity = { normalization_version: 1, normalized: envelope.normalized };
    const canonical = canonicalizeGarminPayload(identity);
    expect(canonicalJson(identity)).toBe(canonical);
    expect(seen).toContain(canonical);
    expect(envelope.normalized_json_sha256).toBe(await sha256(canonical));
    await expect(normalizeGarminActivity(outdoorFixture(), async value => value.startsWith('{"normalization_version"') ? "invalid" : sha256(value))).rejects.toMatchObject({ code: "garmin_digest_invalid" });
  });

  it("preserves the generic 10000-key limit and proves the generated strict schema bounds", () => {
    expect(GARMIN_CANONICAL_LIMITS.maxTotalKeys).toBe(10000);
    expect(() => canonicalizeGarminPayload({ geoPolylineDTO: { polyline: Array.from({ length: 4000 }, () => ({ lat: 0, lon: 0, elapsedDuration: 0 })) } })).toThrow("garmin_json_limit");
    const shape = CanonicalGarminPayloadSchema.shape;
    expect(Object.keys(shape)).toHaveLength(15);
    expect(Object.keys(shape.laps.element.shape)).toHaveLength(6);
    expect(Object.keys(shape.samples.unwrap().element.shape)).toHaveLength(5);
    expect(Object.keys(shape.route.unwrap().element.shape)).toHaveLength(3);
    const largest = CanonicalGarminPayloadSchema.parse({ ...expectedNormalized,
      subtype: "\uffff".repeat(512), source_local_date_time: "2026-10-05T23:30:00.000", source_time_zone: "a".repeat(120), source_utc_offset_minutes: 840,
      laps: Array.from({ length: 1000 }, (_, ordinal) => ({ ordinal, elapsed_ms: 31536000000, timer_ms: 31536000000, moving_ms: 31536000000, distance_meters: 100000000, average_heart_rate_bpm: 300 })),
      samples: Array.from({ length: 2000 }, () => ({ elapsed_ms: 31536000000, distance_meters: 100000000, heart_rate_bpm: 300, latitude_e6: -180000000, longitude_e6: -180000000 })),
      route: Array.from({ length: 4000 }, () => ({ latitude_e6: -180000000, longitude_e6: -180000000, elapsed_ms: 31536000000 })),
    });
    expect(Buffer.byteLength(canonicalJson({ normalization_version: 1, normalized: largest }), "utf8")).toBeLessThan(GARMIN_CANONICAL_LIMITS.maxCanonicalBytes);
  });

  it.each([
    ["undefined", (f: ReturnType<typeof outdoorFixture>) => { (f.activity.summaryDTO as Record<string, unknown>).invalid = undefined; }],
    ["object getter", (f: ReturnType<typeof outdoorFixture>) => { Object.defineProperty(f.activity.summaryDTO, "distance", { enumerable: true, get: () => { throw new Error("getter must not run"); } }); }],
    ["symbol", (f: ReturnType<typeof outdoorFixture>) => { Object.defineProperty(f.activity.summaryDTO, Symbol("controlled"), { enumerable: true, value: 1 }); }],
    ["non-enumerable", (f: ReturnType<typeof outdoorFixture>) => { Object.defineProperty(f.activity.summaryDTO, "hidden", { enumerable: false, value: 1 }); }],
    ["prototype", (f: ReturnType<typeof outdoorFixture>) => { Object.setPrototypeOf(f.activity.summaryDTO, { controlled: true }); }],
    ["sparse array", (f: ReturnType<typeof outdoorFixture>) => { delete f.details.activityDetailMetrics[0]!.metrics[0]; }],
    ["cycle", (f: ReturnType<typeof outdoorFixture>) => { (f.activity.summaryDTO as Record<string, unknown>).cycle = f.activity.summaryDTO; }],
  ])("rejects malformed raw properties before construction or hashing: %s", async (_label, mutate) => {
    const fixture = outdoorFixture(); mutate(fixture); const hash = jest.fn(sha256);
    await expect(normalizeGarminActivity(fixture, hash)).rejects.toThrow();
    expect(hash).not.toHaveBeenCalled();
  });

  it("detaches all identity and component bytes before a malicious digest callback mutates the source", async () => {
    const fixture = outdoorFixture();
    const expected = await normalizeGarminActivity(structuredClone(fixture), sha256);
    let changed = false;
    const actual = await normalizeGarminActivity(fixture, async value => {
      if (!changed) {
        changed = true;
        fixture.account_namespace = "mutated";
        fixture.external_activity_id = "100";
        fixture.activity.summaryDTO.distance = 8888;
        fixture.activity.activityTypeDTO.typeKey = "treadmill_running";
        fixture.splits.lapDTOs.length = 0;
        fixture.details.activityDetailMetrics[0]!.metrics[0] = 9999;
        fixture.details.geoPolylineDTO.polyline[0]!.lat = 0;
      }
      return sha256(value);
    });
    expect(changed).toBe(true);
    expect(actual).toEqual(expected);
  });

  it("rejects a raw array-index getter without invoking it or hashing", async () => {
    const fixture = outdoorFixture(); const getter = jest.fn(() => 0); const hash = jest.fn(sha256);
    Object.defineProperty(fixture.details.activityDetailMetrics[0]!.metrics, "0", { enumerable: true, get: getter });
    await expect(normalizeGarminActivity(fixture, hash)).rejects.toMatchObject({ code: "garmin_json_invalid" });
    expect(getter).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
  });

  it("keeps control and lone-surrogate raw canonical bytes without copying them into generated fields", async () => {
    const fixture = outdoorFixture();
    (fixture.activity.summaryDTO as Record<string, unknown>).unreviewedText = "\u0000\u0001\ud800\u4e2d";
    const originalCanonical = canonicalizeGarminPayload(fixture.activity);
    const seen: string[] = [];
    const envelope = await normalizeGarminActivity(fixture, async value => { seen.push(value); return sha256(value); });
    expect(seen).toContain(originalCanonical);
    expect(originalCanonical).toContain("\\ud800");
    expect(envelope.raw_component_sha256.activity).toBe(await sha256(originalCanonical));
    expect(envelope.normalized).toEqual(expectedNormalized);
    expect(envelope.normalized_json_sha256).toBe(await sha256(canonicalizeGarminPayload({ normalization_version: 1, normalized: expectedNormalized })));
  });
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
      sample_fidelity: "sampled",
      fidelity_by_channel: {
        summary: "source_summary",
        laps: "source_laps",
        route: "sampled",
        heart_rate_samples: "sampled",
        exact_effort_basis: "source_laps",
      },
      normalized: expectedNormalized,
    });
    expect(isExactGarminEffortEligible(envelope, 1_000)).toBe(true);
    expect(envelope).not.toHaveProperty("fit_sha256");
  });

  it("hashes complete raw components separately from their normalized semantics", async () => {
    const first = outdoorFixture();
    const reordered = {
      ...first,
      activity: {
        fetchTime: first.activity.fetchTime,
        summaryDTO: { ...first.activity.summaryDTO },
        activityTypeDTO: { ...first.activity.activityTypeDTO },
        activityId: first.activity.activityId,
      },
    };
    const metadataChanged = {
      ...reordered,
      activity: { ...reordered.activity, fetchTime: "2026-10-11T08:00:00.000Z" },
    };
    const semanticChanged = {
      ...metadataChanged,
      activity: {
        ...metadataChanged.activity,
        summaryDTO: { ...metadataChanged.activity.summaryDTO, distance: 5_001 },
      },
    };

    const [firstEnvelope, reorderedEnvelope, metadataEnvelope, semanticEnvelope] = await Promise.all([
      normalizeGarminActivity(first, sha256),
      normalizeGarminActivity(reordered, sha256),
      normalizeGarminActivity(metadataChanged, sha256),
      normalizeGarminActivity(semanticChanged, sha256),
    ]);

    expect(reorderedEnvelope.raw_component_sha256).toEqual(firstEnvelope.raw_component_sha256);
    expect(metadataEnvelope.normalized_json_sha256).toBe(firstEnvelope.normalized_json_sha256);
    expect(metadataEnvelope.raw_component_sha256.activity).not.toBe(firstEnvelope.raw_component_sha256.activity);
    expect(metadataEnvelope.raw_component_sha256.splits).toBe(firstEnvelope.raw_component_sha256.splits);
    expect(metadataEnvelope.raw_component_sha256.details).toBe(firstEnvelope.raw_component_sha256.details);
    expect(semanticEnvelope.normalized_json_sha256).not.toBe(metadataEnvelope.normalized_json_sha256);
    expect(semanticEnvelope.raw_component_sha256.activity).not.toBe(metadataEnvelope.raw_component_sha256.activity);
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

  it("retains source-local date, timezone, and derived UTC offset provenance", async () => {
    const fixture = outdoorFixture();
    Object.assign(fixture.activity.summaryDTO, {
      startTimeLocal: "2026-10-06 07:30:00",
      timeZoneId: "Asia/Singapore",
    });

    const envelope = await normalizeGarminActivity(fixture, sha256);

    expect(envelope.normalized).toMatchObject({
      source_local_date_time: "2026-10-06T07:30:00",
      source_time_zone: "Asia/Singapore",
      source_utc_offset_minutes: 480,
    });
  });

  it("preserves timezone-only evidence and canonicalizes fractional local time", async () => {
    const timezoneOnly = outdoorFixture();
    Object.assign(timezoneOnly.activity.summaryDTO as { timeZoneId?: string }, {
      timeZoneId: "Asia/Singapore",
    });
    const fractional = outdoorFixture();
    Object.assign(fractional.activity.summaryDTO, {
      startTimeGMT: "2026-10-05T23:30:00.100Z",
      startTimeLocal: "2026-10-06T07:30:00.1",
      timeZoneId: "Asia/Singapore",
    });

    await expect(normalizeGarminActivity(timezoneOnly, sha256)).resolves.toMatchObject({
      normalized: { source_time_zone: "Asia/Singapore" },
    });
    await expect(normalizeGarminActivity(fractional, sha256)).resolves.toMatchObject({
      normalized: { source_local_date_time: "2026-10-06T07:30:00.100" },
    });
    const localOnly = outdoorFixture();
    Object.assign(localOnly.activity.summaryDTO, {
      startTimeLocal: "2026-10-06T07:30:00",
    });
    await expect(normalizeGarminActivity(localOnly, sha256)).resolves.toMatchObject({
      normalized: { source_local_date_time: "2026-10-06T07:30:00" },
    });
  });

  it.each([
    ["non-string timezone", { timeZoneId: 1 }],
    ["oversized timezone", { timeZoneId: "x".repeat(121) }],
    ["non-string local time", { startTimeLocal: 1 }],
    ["malformed local time", { startTimeLocal: "not-a-local-time" }],
    ["invalid local date", { startTimeLocal: "2026-02-30T07:30:00" }],
    ["out-of-range offset", { startTimeLocal: "2026-10-07T23:30:00" }],
  ])("rejects %s date provenance", async (_label, sourceDate) => {
    const fixture = outdoorFixture();
    Object.assign(fixture.activity.summaryDTO, sourceDate);
    await expect(normalizeGarminActivity(fixture, sha256)).rejects.toThrow("garmin_source_invalid");
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

    expect(envelope.sample_fidelity).toBe("sampled");
    expect(envelope.fidelity_by_channel?.exact_effort_basis).toBe("source_summary");
    expect(envelope.normalized.distance_meters).toBe(0);
  });

  it("accepts string source IDs, absent optional arrays, null channels, and GMT timestamps without milliseconds", async () => {
    const fixture = outdoorFixture();
    fixture.activity.activityId = "987654321" as unknown as number;
    fixture.activity.summaryDTO.startTimeGMT = "2026-10-05 23:30:00";
    fixture.splits = {} as typeof fixture.splits;
    fixture.details = {
      metricDescriptors: null,
      activityDetailMetrics: null,
      geoPolylineDTO: null,
    } as unknown as typeof fixture.details;

    const envelope = await normalizeGarminActivity(fixture, sha256);

    expect(envelope.normalized).toMatchObject({
      started_at_ms: Date.UTC(2026, 9, 5, 23, 30),
      laps: [],
    });
    expect(envelope.normalized).not.toHaveProperty("samples");
    expect(envelope.normalized).not.toHaveProperty("route");
  });

  it("omits descriptor channels that are null or outside a particular sample", async () => {
    const fixture = outdoorFixture();
    fixture.splits.lapDTOs = [];
    fixture.details.metricDescriptors = [
      { key: "sumElapsedDuration", metricsIndex: 0 },
      { key: "sumDistance", metricsIndex: 1 },
      { key: "directHeartRate", metricsIndex: 2 },
    ];
    fixture.details.activityDetailMetrics = [
      { metrics: [0, 0] },
      { metrics: [300, null, 145] },
      { metrics: [600, 2_000, null] },
    ] as unknown as typeof fixture.details.activityDetailMetrics;
    fixture.details.geoPolylineDTO.polyline = [{ lat: 1, lon: 2 }] as typeof fixture.details.geoPolylineDTO.polyline;

    const envelope = await normalizeGarminActivity(fixture, sha256);

    expect(envelope.normalized.samples).toEqual([
      { elapsed_ms: 0, distance_meters: 0 },
      { elapsed_ms: 300_000, heart_rate_bpm: 145 },
      { elapsed_ms: 600_000, distance_meters: 2_000 },
    ]);
    expect(envelope.normalized.route).toEqual([{ latitude_e6: 1_000_000, longitude_e6: 2_000_000 }]);
  });

  it("ignores unreviewed descriptors and samples with no described channel value", async () => {
    const fixture = outdoorFixture();
    fixture.splits.lapDTOs = [];
    fixture.details.metricDescriptors = [
      { key: "unknownCadence", metricsIndex: 0 },
      { key: "sumDistance", metricsIndex: 2 },
    ];
    fixture.details.activityDetailMetrics = [
      { metrics: [180] },
      { metrics: [181, null, 1_000] },
    ] as unknown as typeof fixture.details.activityDetailMetrics;

    const envelope = await normalizeGarminActivity(fixture, sha256);

    expect(envelope.normalized.samples).toEqual([{ distance_meters: 1_000 }]);
  });

  it("finds the last available sampled distance without assuming the final row has it", async () => {
    const fixture = outdoorFixture();
    delete (fixture.activity.summaryDTO as Partial<typeof fixture.activity.summaryDTO>).distance;
    fixture.splits.lapDTOs = [];
    fixture.details.activityDetailMetrics = [
      { metrics: [0, 1_000, 140] },
      { metrics: [300, null, 145] },
    ] as unknown as typeof fixture.details.activityDetailMetrics;

    const envelope = await normalizeGarminActivity(fixture, sha256);

    expect(envelope.normalized.distance_meters).toBe(1_000);
    expect(envelope.sample_fidelity).toBe("sampled");
  });

  it("accepts source laps with omitted indexes and only one truthful time basis", async () => {
    const fixture = outdoorFixture();
    fixture.splits.lapDTOs = [{ duration: 60, distance: 400 }] as typeof fixture.splits.lapDTOs;

    const envelope = await normalizeGarminActivity(fixture, sha256);

    expect(envelope.normalized.laps).toEqual([{ ordinal: 0, timer_ms: 60_000, distance_meters: 400 }]);
    expect(isExactGarminEffortEligible(envelope, 400)).toBe(true);
    const movingOnly = {
      ...envelope,
      normalized: {
        ...envelope.normalized,
        laps: [{ ordinal: 0, distance_meters: 400, moving_ms: 59_000 }],
      },
    };
    expect(isExactGarminEffortEligible(movingOnly, 400)).toBe(true);
    const noLapTime = {
      ...envelope,
      normalized: {
        ...envelope.normalized,
        laps: [{ ordinal: 0, distance_meters: 400 }],
      },
    };
    expect(isExactGarminEffortEligible(noLapTime, 400)).toBe(false);
  });

  it.each([
    ["array activity component", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, activity: [] })],
    ["non-array laps", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, splits: { lapDTOs: {} } })],
    ["non-string start", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, activity: { ...fixture.activity, summaryDTO: { ...fixture.activity.summaryDTO, startTimeGMT: 1 } } })],
    ["malformed start", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, activity: { ...fixture.activity, summaryDTO: { ...fixture.activity.summaryDTO, startTimeGMT: "not-a-date" } } })],
    ["zero source activity ID", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, activity: { ...fixture.activity, activityId: 0 } })],
    ["non-scalar source activity ID", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, activity: { ...fixture.activity, activityId: {} } })],
    ["non-numeric source distance", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, activity: { ...fixture.activity, summaryDTO: { ...fixture.activity.summaryDTO, distance: "5000" } } })],
    ["negative distance", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, activity: { ...fixture.activity, summaryDTO: { ...fixture.activity.summaryDTO, distance: -1 } } })],
    ["mismatched lap index", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, splits: { lapDTOs: [{ ...fixture.splits.lapDTOs[0], lapIndex: 2 }] } })],
    ["empty source lap", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, splits: { lapDTOs: [{ lapIndex: 1 }] } })],
    ["non-array sample metrics", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, details: { ...fixture.details, activityDetailMetrics: [{ metrics: {} }] } })],
    ["non-numeric sample metric", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, details: { ...fixture.details, activityDetailMetrics: [{ metrics: ["0", 0, 140] }] } })],
    ["missing route latitude", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, details: { ...fixture.details, geoPolylineDTO: { polyline: [{ lon: 0 }] } } })],
    ["missing route longitude", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, details: { ...fixture.details, geoPolylineDTO: { polyline: [{ lat: 0 }] } } })],
    ["low route latitude", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, details: { ...fixture.details, geoPolylineDTO: { polyline: [{ lat: -91, lon: 0 }] } } })],
    ["low route longitude", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, details: { ...fixture.details, geoPolylineDTO: { polyline: [{ lat: 0, lon: -181 }] } } })],
    ["high route longitude", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, details: { ...fixture.details, geoPolylineDTO: { polyline: [{ lat: 0, lon: 181 }] } } })],
  ])("rejects malformed nested source shape: %s", async (_label, mutate) => {
    await expect(normalizeGarminActivity(mutate(outdoorFixture()), sha256)).rejects.toThrow(/garmin_(?:source_invalid|json_)/u);
  });

  it.each([
    ["malformed account namespace", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, account_namespace: "account namespace" })],
    ["malformed external ID", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, external_activity_id: "activity/1" })],
    ["mismatched activity ID", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, external_activity_id: "123" })],
    ["unsupported sport", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, activity: { ...fixture.activity, activityTypeDTO: { typeKey: "cycling" } } })],
    ["invalid GMT start", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, activity: { ...fixture.activity, summaryDTO: { ...fixture.activity.summaryDTO, startTimeGMT: "2026-02-30T10:00:00.000Z" } } })],
    ["unsafe number", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, activity: { ...fixture.activity, summaryDTO: { ...fixture.activity.summaryDTO, distance: Number.POSITIVE_INFINITY } } })],
    ["too many laps", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, splits: { lapDTOs: Array.from({ length: 1_001 }, (_, index) => ({ ...fixture.splits.lapDTOs[0], lapIndex: index + 1 })) } })],
    ["too many detail samples", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, details: { ...fixture.details, activityDetailMetrics: Array.from({ length: 2_001 }, () => ({ metrics: [0, 0, 140] })) } })],
    ["too many route points", (fixture: ReturnType<typeof outdoorFixture>) => ({ ...fixture, details: { ...fixture.details, geoPolylineDTO: { polyline: Array.from({ length: 4_001 }, () => ({ lat: 1, lon: 2 })) } } })],
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
    const legacyFixture = outdoorFixture();
    delete (legacyFixture.details as Partial<typeof legacyFixture.details>).geoPolylineDTO;
    legacyFixture.details.metricDescriptors = [];
    legacyFixture.details.activityDetailMetrics = [];
    const { fidelity_by_channel: _ignored, ...legacyEnvelope } = await normalizeGarminActivity(legacyFixture, sha256);
    expect(isExactGarminEffortEligible(legacyEnvelope, 1_000)).toBe(true);
  });
});

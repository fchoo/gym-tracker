import { describe, expect, it } from "@jest/globals";

import {
  parseImportedActivityLocalId,
  projectImportedActivityDetail,
  type ImportedActivityDetailSourceRow,
} from "./activityDetails";

const acceptedDigest = "a".repeat(64);

function acceptedOutdoorRow(): ImportedActivityDetailSourceRow {
  return Object.freeze({
    activityId: "activity-local-01",
    aggregateRevision: 1,
    acceptedNormalizedSha256: acceptedDigest,
    removalState: "active",
    aggregateJson: JSON.stringify({
      source_kind: "garmin_connect_account",
      account_namespace: "must-never-render",
      external_activity_id: "987654321",
      normalized_json_sha256: acceptedDigest,
      sample_fidelity: "source_laps",
      confirmed_local_date: "2026-10-04",
      normalized: {
        version: 1,
        started_at_ms: Date.UTC(2026, 9, 4, 7, 12),
        sport: "running",
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
          },
        ],
        route: [
          { latitude_e6: 1_352_100, longitude_e6: 103_819_800, elapsed_ms: 0 },
          { latitude_e6: 1_353_200, longitude_e6: 103_821_100, elapsed_ms: 300_000 },
        ],
      },
    }),
  });
}

function rowWith(
  transform: (aggregate: Record<string, any>) => void,
): ImportedActivityDetailSourceRow {
  const source = acceptedOutdoorRow();
  const aggregate = JSON.parse(source.aggregateJson) as Record<string, any>;
  transform(aggregate);
  return Object.freeze({ ...source, aggregateJson: JSON.stringify(aggregate) });
}

describe("projectImportedActivityDetail accepted outdoor facts", () => {
  it("projects only the accepted local revision with distinct source-present facts", () => {
    const projected = projectImportedActivityDetail(acceptedOutdoorRow());

    expect(projected).toEqual({
      kind: "ready",
      detail: {
        activityType: "Outdoor run",
        confirmedLocalDate: "2026-10-04",
        distance: "5.00 km",
        elapsed: "26:00",
        secondaryDuration: { label: "Moving", value: "24:35" },
        averagePace: { basis: "Moving time", value: "4:55/km" },
        route: {
          kind: "available",
          segments: [[
            { latitudeE6: 1_352_100, longitudeE6: 103_819_800 },
            { latitudeE6: 1_353_200, longitudeE6: 103_821_100 },
          ]],
        },
        averageHeartRate: "152 bpm",
        laps: [{
          lap: "1",
          time: { basis: "Moving time", value: "4:55" },
          pace: { basis: "Moving time", value: "4:55/km" },
        }],
        fidelity: {
          kind: "source_laps",
          heading: "Source laps",
          body: "Lap and summary facts come from accepted source fields.",
        },
      },
    });
    expect(JSON.stringify(projected)).not.toContain("987654321");
    expect(JSON.stringify(projected)).not.toContain("must-never-render");
    expect(JSON.stringify(projected)).not.toContain("garmin_connect_account");
  });

  it("fails closed when the aggregate does not match the accepted digest", () => {
    const projected = projectImportedActivityDetail({
      ...acceptedOutdoorRow(),
      acceptedNormalizedSha256: "b".repeat(64),
    });

    expect(projected).toEqual({
      kind: "projection_error",
      code: "accepted_payload_unavailable",
    });
  });
});

describe("projectImportedActivityDetail truthfulness matrix", () => {
  it("accepts only opaque local route identities", () => {
    expect(parseImportedActivityLocalId("activity-local-01")).toBe("activity-local-01");
    expect(parseImportedActivityLocalId("local-activity-a_1")).toBe("local-activity-a_1");
    expect(parseImportedActivityLocalId("987654321")).toBeNull();
    expect(parseImportedActivityLocalId(null)).toBeNull();
  });

  it("fails closed for removed, malformed, and unbound accepted aggregates", () => {
    expect(projectImportedActivityDetail({
      ...acceptedOutdoorRow(),
      removalState: "removed",
    })).toEqual({ kind: "removed" });
    expect(projectImportedActivityDetail({
      ...acceptedOutdoorRow(),
      aggregateRevision: 0,
    })).toEqual({ kind: "projection_error", code: "accepted_payload_unavailable" });
    expect(projectImportedActivityDetail({
      ...acceptedOutdoorRow(),
      acceptedNormalizedSha256: "invalid",
    })).toEqual({ kind: "projection_error", code: "accepted_payload_unavailable" });
    expect(projectImportedActivityDetail({
      ...acceptedOutdoorRow(),
      aggregateJson: "{",
    })).toEqual({ kind: "projection_error", code: "accepted_payload_unavailable" });
  });

  it("formats custom run types, sub-kilometer distance, and segmented routes", () => {
    const projected = projectImportedActivityDetail(rowWith((aggregate) => {
      aggregate.normalized.subtype = "trail_ultra-run";
      aggregate.normalized.distance_meters = 999;
      aggregate.normalized.route = [
        { latitude_e6: 1, longitude_e6: 2, elapsed_ms: 0 },
        { latitude_e6: 91_000_000, longitude_e6: 2, elapsed_ms: 1 },
        { latitude_e6: 3, longitude_e6: 4, elapsed_ms: 200 },
        { latitude_e6: 5, longitude_e6: 6, elapsed_ms: 300 },
        { latitude_e6: 7, longitude_e6: 8, elapsed_ms: 250 },
        { latitude_e6: 9, longitude_e6: 10, elapsed_ms: 400 },
      ];
    }));

    expect(projected).toMatchObject({
      kind: "ready",
      detail: {
        activityType: "Trail ultra run",
        distance: "999 m",
        route: {
          kind: "available",
          segments: [
            [{ latitudeE6: 3, longitudeE6: 4 }, { latitudeE6: 5, longitudeE6: 6 }],
            [{ latitudeE6: 7, longitudeE6: 8 }, { latitudeE6: 9, longitudeE6: 10 }],
          ],
        },
      },
    });
  });

  it("formats hour-long source durations without dropping zero-padded minutes", () => {
    const projected = projectImportedActivityDetail(rowWith((aggregate) => {
      aggregate.normalized.elapsed_ms = 3_661_000;
    }));
    expect(projected).toMatchObject({ kind: "ready", detail: { elapsed: "1:01:01" } });
  });

  it("treats an empty outdoor route as unavailable", () => {
    const projected = projectImportedActivityDetail(rowWith((aggregate) => {
      aggregate.normalized.route = [];
    }));
    expect(projected).toMatchObject({ kind: "ready", detail: { route: { kind: "unavailable" } } });
  });

  it("always suppresses route for treadmill while preserving source timer, distance, and laps", () => {
    const projected = projectImportedActivityDetail(rowWith((aggregate) => {
      aggregate.normalized.subtype = "treadmill";
      delete aggregate.normalized.moving_ms;
      delete aggregate.normalized.average_heart_rate_bpm;
    }));

    expect(projected).toMatchObject({
      kind: "ready",
      detail: {
        activityType: "Treadmill run",
        distance: "5.00 km",
        secondaryDuration: { label: "Timer", value: "25:00" },
        averagePace: { basis: "Timer time", value: "5:00/km" },
        route: { kind: "none" },
      },
    });
    expect(projected.kind === "ready" && projected.detail).not.toHaveProperty("averageHeartRate");
  });

  it("keeps outdoor route, HR, durations, and pace unavailable rather than manufacturing zeroes", () => {
    const projected = projectImportedActivityDetail(rowWith((aggregate) => {
      delete aggregate.normalized.route;
      delete aggregate.normalized.elapsed_ms;
      delete aggregate.normalized.timer_ms;
      delete aggregate.normalized.moving_ms;
      delete aggregate.normalized.average_heart_rate_bpm;
    }));

    expect(projected).toMatchObject({
      kind: "ready",
      detail: {
        route: { kind: "unavailable" },
        distance: "5.00 km",
      },
    });
    if (projected.kind !== "ready") throw new Error("expected_ready");
    for (const key of ["elapsed", "secondaryDuration", "averagePace", "averageHeartRate"] as const) {
      expect(projected.detail).not.toHaveProperty(key);
    }
  });

  it("shows source-present zero distance without deriving pace", () => {
    const projected = projectImportedActivityDetail(rowWith((aggregate) => {
      aggregate.normalized.distance_meters = 0;
    }));

    expect(projected).toMatchObject({ kind: "ready", detail: { distance: "0 m" } });
    expect(projected.kind === "ready" && projected.detail).not.toHaveProperty("averagePace");
  });

  it("preserves lap source order and keeps missing lap time and pace unavailable", () => {
    const projected = projectImportedActivityDetail(rowWith((aggregate) => {
      aggregate.normalized.laps = [
        { ordinal: 4, distance_meters: 1_000 },
        { ordinal: 1, elapsed_ms: 310_000 },
      ];
    }));

    expect(projected).toMatchObject({
      kind: "ready",
      detail: {
        laps: [
          { lap: "5" },
          { lap: "2", time: { basis: "Elapsed time", value: "5:10" } },
        ],
      },
    });
    if (projected.kind !== "ready") throw new Error("expected_ready");
    expect(projected.detail.laps[0]).not.toHaveProperty("time");
    expect(projected.detail.laps[0]).not.toHaveProperty("pace");
    expect(projected.detail.laps[1]).not.toHaveProperty("pace");
  });

  it("retains a bounded large lap list without reordering it", () => {
    const projected = projectImportedActivityDetail(rowWith((aggregate) => {
      aggregate.normalized.laps = Array.from({ length: 240 }, (_, ordinal) => ({
        ordinal,
        elapsed_ms: 60_000,
        distance_meters: 200,
      }));
    }));

    if (projected.kind !== "ready") throw new Error("expected_ready");
    expect(projected.detail.laps).toHaveLength(240);
    expect(projected.detail.laps[0]?.lap).toBe("1");
    expect(projected.detail.laps[239]?.lap).toBe("240");
  });

  for (const [kind, heading, body] of [
    ["source_summary", "Source summary", "Summary facts come from accepted source fields."],
    ["source_laps", "Source laps", "Lap and summary facts come from accepted source fields."],
    ["sampled", "Sampled data", "Sampled positions and charts cannot prove exact arbitrary-distance best efforts."],
  ] as const) {
    it(`discloses ${kind} fidelity without promoting sampled evidence`, () => {
      const projected = projectImportedActivityDetail(rowWith((aggregate) => {
        aggregate.sample_fidelity = kind;
      }));

      expect(projected).toMatchObject({
        kind: "ready",
        detail: { fidelity: { kind, heading, body } },
      });
    });
  }
});

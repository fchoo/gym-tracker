import { describe, expect, it } from "@jest/globals";

import {
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

import { describe, expect, it } from "@jest/globals";

import { parseGarminSourceEnvelope } from "./importContracts";

const envelope = {
  version: 1 as const,
  source_kind: "garmin_connect_account" as const,
  account_namespace: "owner-a",
  external_activity_id: "activity-42",
  normalization_version: 1,
  normalized_json_sha256: "a".repeat(64),
  raw_component_sha256: { activity: "b".repeat(64), splits: "c".repeat(64), details: "d".repeat(64) },
  sample_fidelity: "source_laps" as const,
  normalized: {
    version: 1 as const, started_at_ms: 1_700_000_000_000, sport: "running" as const,
    subtype: "outdoor", distance_meters: 5000, elapsed_ms: 1_500_000,
    laps: [{ ordinal: 0, elapsed_ms: 1_500_000, distance_meters: 5000 }],
  },
};

describe("GarminSourceEnvelope boundary", () => {
  it("accepts bounded canonical evidence while preserving missing channels", () => {
    const parsed = parseGarminSourceEnvelope(envelope);
    expect(parsed.normalized.moving_ms).toBeUndefined();
    expect(parsed.normalized.timer_ms).toBeUndefined();
    expect("fit_sha256" in parsed).toBe(false);
  });

  it.each([
    ["fit evidence", { ...envelope, fit_sha256: "e".repeat(64) }],
    ["unbounded route", { ...envelope, normalized: { ...envelope.normalized, route: Array.from({ length: 4001 }, () => ({ latitude_e6: 1, longitude_e6: 1 })) } }],
    ["unsafe duration", { ...envelope, normalized: { ...envelope.normalized, elapsed_ms: Number.MAX_SAFE_INTEGER + 1 } }],
  ])("rejects %s", (_label, invalid) => {
    expect(() => parseGarminSourceEnvelope(invalid)).toThrow("garmin_envelope_invalid");
  });
});

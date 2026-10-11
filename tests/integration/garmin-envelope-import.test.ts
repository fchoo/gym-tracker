import { createHash } from "node:crypto";
import { describe, expect, it } from "@jest/globals";

import { prepareGarminImport } from "../../src/domains/activities/importCommands";
import { normalizeGarminActivity } from "../../src/platform/garmin/normalizeGarminActivity";

const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");

describe("Garmin envelope import boundary", () => {
  it("prepares one normalized account activity through the shared Phase 13 command", async () => {
    const envelope = await normalizeGarminActivity({
      account_namespace: "account-integration",
      external_activity_id: "424242",
      activity: {
        activityId: 424242,
        activityTypeDTO: { typeKey: "running" },
        summaryDTO: {
          startTimeGMT: "2026-10-05T23:30:00.000Z",
          distance: 5_000,
          duration: 1_500,
          elapsedDuration: 1_560,
          movingDuration: 1_475,
        },
      },
      splits: { lapDTOs: [] },
      details: { metricDescriptors: [], activityDetailMetrics: [] },
    }, sha256);

    const prepared = await prepareGarminImport(envelope, sha256);

    expect(prepared.envelope).toEqual(envelope);
    expect(prepared.canonical_payload_json).toContain('"normalization_version":1');
    expect(prepared.envelope).not.toHaveProperty("fit_sha256");
    expect(prepared.envelope.normalized).toMatchObject({
      sport: "running",
      subtype: "outdoor",
      distance_meters: 5_000,
      elapsed_ms: 1_560_000,
      timer_ms: 1_500_000,
      moving_ms: 1_475_000,
    });
  });
});

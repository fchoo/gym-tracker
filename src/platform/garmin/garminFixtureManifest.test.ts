import { createHash } from "node:crypto";
import { describe, expect, it } from "@jest/globals";

import {
  GARMIN_JSON_FIXTURE_MANIFEST,
  GARMIN_JSON_FIXTURE_PAYLOADS,
} from "../../../tests/fixtures/garmin-json/fixture-manifest";
import { normalizeGarminActivity } from "./normalizeGarminActivity";

const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");

describe("Garmin JSON fixture manifest", () => {
  it("matches the exact production normalization and fidelity contracts", async () => {
    for (const entry of GARMIN_JSON_FIXTURE_MANIFEST) {
      const payload = GARMIN_JSON_FIXTURE_PAYLOADS[entry.id];
      const envelope = await normalizeGarminActivity({
        account_namespace: "fixture-namespace",
        external_activity_id: String(payload.activity.activityId),
        ...payload,
      }, sha256);

      expect(envelope.normalized).toEqual(entry.expected_normalized);
      expect(envelope.normalized_json_sha256).toBe(entry.normalized_sha256);
      expect(envelope.raw_component_sha256).toEqual(entry.component_sha256);
      expect(envelope.sample_fidelity).toBe(entry.expected_sample_fidelity);
      expect(envelope.fidelity_by_channel).toEqual(entry.expected_fidelity_by_channel);
    }
  });
});

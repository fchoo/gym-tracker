import type { GarminSourceEnvelope } from "../../domains/activities/garminActivitySourcePort";
import type { GarminPayloadSha256 } from "./canonicalGarminPayload";

export const GARMIN_NORMALIZATION_VERSION = 1;

export function normalizeGarminActivity(
  _input: Readonly<{
    account_namespace: string;
    external_activity_id: string;
    activity: unknown;
    splits: unknown;
    details: unknown;
  }>,
  _sha256: GarminPayloadSha256,
): Promise<GarminSourceEnvelope> {
  return Promise.reject(new Error("garmin_normalization_not_implemented"));
}

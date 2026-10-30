import { describe, expect, it } from "@jest/globals";

import { classifyGarminActivityIdentity } from "./activityIdentity";

const identity = { source_kind: "garmin_connect_account" as const, account_namespace: "owner-a", external_activity_id: "42" };

describe("Garmin account-scoped activity identity", () => {
  it("classifies new, replay, revision, removal, and cross-account conflicts", () => {
    expect(classifyGarminActivityIdentity({ identity, removed: false, normalized_json_sha256: "a".repeat(64) }).kind).toBe("new");
    expect(classifyGarminActivityIdentity({ identity, existing: { ...identity, accepted_digest: "a".repeat(64) }, removed: false, normalized_json_sha256: "a".repeat(64) }).kind).toBe("duplicate");
    expect(classifyGarminActivityIdentity({ identity, existing: { ...identity, accepted_digest: "b".repeat(64) }, removed: false, normalized_json_sha256: "a".repeat(64) }).kind).toBe("revision_review");
    expect(classifyGarminActivityIdentity({ identity, existing: { ...identity, accepted_digest: "a".repeat(64) }, removed: true, normalized_json_sha256: "a".repeat(64) }).kind).toBe("removed");
    expect(classifyGarminActivityIdentity({ identity, existing: { ...identity, account_namespace: "owner-b", accepted_digest: "a".repeat(64) }, removed: false, normalized_json_sha256: "a".repeat(64) }).kind).toBe("conflict");
  });
});

import { describe, expect, it } from "@jest/globals";

import { classifyGarminActivityIdentity } from "./activityIdentity";

const identity = { source_kind: "garmin_connect_account" as const, account_namespace: "owner-a", external_activity_id: "42" };

describe("Garmin account-scoped activity identity", () => {
  it.each([
    [undefined, false, "a".repeat(64), "new"],
    [{ ...identity, accepted_digest: "a".repeat(64) }, false, "a".repeat(64), "duplicate"],
    [{ ...identity, accepted_digest: "b".repeat(64) }, false, "a".repeat(64), "revision_review"],
    [{ ...identity, accepted_digest: "a".repeat(64) }, true, "a".repeat(64), "removed"],
    [{ ...identity, account_namespace: "owner-b", accepted_digest: "a".repeat(64) }, false, "a".repeat(64), "conflict"],
  ] as const)("classifies identity/revision safely", (existing, removed, digest, expected) => {
    expect(classifyGarminActivityIdentity({ identity, existing, removed, normalized_json_sha256: digest }).kind).toBe(expected);
  });
});

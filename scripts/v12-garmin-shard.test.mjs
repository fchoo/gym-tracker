import assert from "node:assert/strict";
import test from "node:test";

import {
  executeV12GarminShard,
  validateV12GarminShard,
} from "./v12-garmin-shard.mjs";

const observation = Object.freeze({
  packagingAuth: { source: "bundled-chaquopy", bridgeMethods: ["login", "mfa", "activities", "activity", "splits", "details"], nativeExecution: "NOT_RUN" },
  syncRead: { fixtureManifestSha256: "a".repeat(64), expectedSummaries: 3, nativeExecution: "NOT_RUN" },
  dedupe: { receiptDigest: "b".repeat(64), provenanceDigest: "c".repeat(64), replayIdentityCount: 7, nativeExecution: "NOT_RUN" },
  matching: { matchDigest: "d".repeat(64), selectedOpportunityCount: 1, nativeExecution: "NOT_RUN" },
});

test("Garmin shard accepts only the four canonical, privacy-safe observation shapes", () => {
  assert.deepEqual(validateV12GarminShard(observation), { status: "NOT_RUN", caseCount: 12 });
  assert.deepEqual(executeV12GarminShard(observation), {
    producer: "v12-garmin-shard/v1",
    status: "NOT_RUN",
    observations: observation,
  });
});

test("Garmin shard fails closed on incomplete, private, and verdict-bearing observations", () => {
  assert.throws(() => validateV12GarminShard({ ...observation, syncRead: { ...observation.syncRead, rawPayload: "{}" } }), /garmin_private_field/);
  assert.throws(() => validateV12GarminShard({ ...observation, dedupe: { ...observation.dedupe, replayIdentityCount: 0 } }), /garmin_replay_identity_invalid/);
  assert.throws(() => executeV12GarminShard({ ...observation, finalVerdict: "PASS" }), /garmin_final_verdict_forbidden/);
});

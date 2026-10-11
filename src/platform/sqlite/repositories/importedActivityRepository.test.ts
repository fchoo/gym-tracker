import { describe, expect, it } from "@jest/globals";

import type { GarminRevisionDecisionInput } from "../../../domains/activities/importCommands";
import type { SqliteKernel, SqliteTransactionExecutor } from "../sqliteKernel";
import { createImportedActivityRepository } from "./importedActivityRepository";

function queryKernel(rows: readonly Record<string, unknown>[]): SqliteKernel {
  return { queryAll: async () => rows } as unknown as SqliteKernel;
}

function writeKernel(responses: readonly (readonly Record<string, unknown>[])[]): SqliteKernel {
  return {
    write: async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) => {
      const pending = [...responses];
      return command({
        queryAll: async () => pending.shift() ?? [],
        execute: async () => ({ changes: 1, lastInsertRowId: 0 }),
      });
    },
  } as unknown as SqliteKernel;
}

const decision: GarminRevisionDecisionInput = Object.freeze({
  action: "keep",
  requestId: "revision-decision",
  requestSha256: "a".repeat(64),
  activityId: "activity-1",
  expectedAggregateRevision: 1,
  proposedRevision: 2,
  expectedProposedSha256: "b".repeat(64),
  occurredAtMs: 1,
});

const replayCases: ReadonlyArray<Readonly<{
  label: string;
  responses: readonly (readonly Record<string, unknown>[])[];
  kind: "conflict" | "revision_accepted" | "revision_kept" | "replayed";
}>> = [
  { label: "mismatched receipt", responses: [[{ request_sha256: "c".repeat(64), activity_id: "activity-1" }]], kind: "conflict" },
  { label: "accepted replay", responses: [[{ request_sha256: decision.requestSha256, activity_id: decision.activityId }], [{ action: "accept" }]], kind: "revision_accepted" },
  { label: "kept replay", responses: [[{ request_sha256: decision.requestSha256, activity_id: decision.activityId }], [{ action: "keep" }]], kind: "revision_kept" },
  { label: "receipt without decision", responses: [[{ request_sha256: decision.requestSha256, activity_id: decision.activityId }], []], kind: "replayed" },
];

const staleCases: ReadonlyArray<Readonly<{
  label: string;
  responses: readonly (readonly Record<string, unknown>[])[];
}>> = [
  { label: "missing identity", responses: [[], []] },
  { label: "missing proposal", responses: [[{ aggregate_revision: 1, accepted_normalized_sha256: "a".repeat(64) }], []] },
  { label: "stale identity", responses: [[{ aggregate_revision: 2, accepted_normalized_sha256: "a".repeat(64) }], [{ normalized_sha256: decision.expectedProposedSha256, envelope_json: "{}" }]] },
  { label: "changed proposal", responses: [[{ aggregate_revision: 1, accepted_normalized_sha256: "a".repeat(64) }], [{ normalized_sha256: "c".repeat(64), envelope_json: "{}" }]] },
];

describe("imported activity repository defensive branches", () => {
  it("projects an empty diff when retained aggregate JSON has no normalized object", async () => {
    const repository = createImportedActivityRepository(queryKernel([{
      activity_id: "activity-1",
      aggregate_revision: 1,
      accepted_normalized_sha256: "a".repeat(64),
      accepted_aggregate_json: "{}",
      proposed_revision: 2,
      normalized_sha256: "b".repeat(64),
      proposed_aggregate_json: "{}",
    }]));
    await expect(repository.listGarminRevisionReviews()).resolves.toEqual([{
      activityId: "activity-1",
      acceptedRevision: 1,
      proposedRevision: 2,
      acceptedNormalizedSha256: "a".repeat(64),
      proposedNormalizedSha256: "b".repeat(64),
      changedFields: [],
    }]);
  });

  it.each(replayCases)("returns $label without mutating", async ({ responses, kind }) => {
    const repository = createImportedActivityRepository(writeKernel(responses));
    await expect(repository.resolveGarminRevision(decision)).resolves.toMatchObject({ kind });
  });

  it.each(staleCases)("fails closed for $label during revision resolution", async ({ responses }) => {
    const repository = createImportedActivityRepository(writeKernel([[], ...responses]));
    await expect(repository.resolveGarminRevision(decision)).resolves.toMatchObject({ kind: "conflict" });
  });
});

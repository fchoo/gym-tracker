import { describe, expect, it, jest } from "@jest/globals";

import {
  confirmRunningActivityMatch,
  type RunningActivityMatchRepository,
} from "./activityMatchCommands";

const input = Object.freeze({
  requestId: "match-request-1",
  requestSha256: "a".repeat(64),
  action: "match" as const,
  activityId: "activity-1",
  expectedActivityRevision: 1,
  opportunityId: "opportunity-1",
  expectedOpportunityRevision: 1,
  expectedRelationRevision: 0,
  scheduleId: "schedule-1",
  scheduleVersionId: "schedule-version-1",
  slotId: "slot-1",
  sessionRevisionId: "session-revision-1",
  occurredAtMs: 1_700_000_000_000,
});

describe("Running activity match commands", () => {
  it("requires one explicit current identity tuple before delegating confirmation", async () => {
    const calls: unknown[] = [];
    const repository: RunningActivityMatchRepository = {
      confirm(input) {
        calls.push(input);
        return Promise.resolve(Object.freeze({ kind: "matched" as const, activityId: input.activityId, opportunityId: input.opportunityId, relationRevision: 1 }));
      },
    };

    await expect(confirmRunningActivityMatch(repository, input)).resolves.toEqual({
      kind: "matched", activityId: "activity-1", opportunityId: "opportunity-1", relationRevision: 1,
    });
    expect(calls).toEqual([input]);
  });

  it("rejects a confirmation that omits the expected relation revision", async () => {
    const repository: RunningActivityMatchRepository = { confirm: async () => ({ kind: "conflict", activityId: "activity-1", opportunityId: "opportunity-1", relationRevision: 0 }) };
    await expect(confirmRunningActivityMatch(repository, { ...input, expectedRelationRevision: -1 })).rejects.toThrow("running_activity_match_invalid");
  });

  it("requires action-specific prior identity and rejects every malformed fence", async () => {
    const repository: RunningActivityMatchRepository = {
      confirm: jest.fn(async () => ({
        kind: "conflict" as const,
        activityId: "activity-1",
        opportunityId: "opportunity-1",
        relationRevision: 0,
      })),
    };
    await expect(confirmRunningActivityMatch(repository, { ...input, action: "match", expectedCurrentOpportunityId: "old-opportunity" })).rejects.toThrow("running_activity_match_invalid");
    await expect(confirmRunningActivityMatch(repository, { ...input, action: "unmatch" })).rejects.toThrow("running_activity_match_invalid");
    await expect(confirmRunningActivityMatch(repository, { ...input, action: "reassign", expectedCurrentOpportunityId: "bad id" })).rejects.toThrow("running_activity_match_invalid");
    await expect(confirmRunningActivityMatch(repository, { ...input, requestSha256: "A".repeat(64), expectedActivityRevision: 0 })).rejects.toThrow("running_activity_match_invalid");
    await expect(confirmRunningActivityMatch(repository, { ...input, action: "unmatch", expectedCurrentOpportunityId: "old-opportunity" })).resolves.toMatchObject({ kind: "conflict" });
  });
});

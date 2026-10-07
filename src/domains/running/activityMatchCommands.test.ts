import { describe, expect, it } from "@jest/globals";

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
});

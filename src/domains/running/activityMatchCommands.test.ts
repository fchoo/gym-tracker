import { describe, expect, it, jest } from "@jest/globals";

import {
  confirmRunningActivityMatch,
  prepareRunningActivityMatchInput,
  queryRunningActivityMatchCandidates,
  type RunningActivityMatchCandidate,
  type RunningActivityMatchRepository,
} from "./activityMatchCommands";

const input = Object.freeze({
  requestId: "match-request-1",
  requestSha256: "a".repeat(64),
  action: "match" as const,
  activityId: "activity-1",
  expectedActivityRevision: 1,
  expectedAcceptedPayloadSha256: "a".repeat(64),
  opportunityId: "opportunity-1",
  expectedOpportunityRevision: 1,
  expectedRelationRevision: 0,
  planId: "running-plan-1",
  scheduleId: "schedule-1",
  scheduleVersionId: "schedule-version-1",
  expectedScheduleRevision: 1,
  planDayId: "plan-day-1",
  expectedPlanDayRevision: 1,
  slotId: "slot-1",
  slotRevisionId: "slot-1:revision:1",
  expectedSlotRevision: 1,
  sessionRevisionId: "session-revision-1",
  expectedSessionRevision: 1,
  occurredAtMs: 1_700_000_000_000,
});

const candidate: RunningActivityMatchCandidate = Object.freeze({
  activityId: "activity-1",
  expectedActivityRevision: 1,
  expectedAcceptedPayloadSha256: "a".repeat(64),
  opportunityId: "opportunity-1",
  expectedOpportunityRevision: 1,
  planId: "running-plan-1",
  planName: "5K plan",
  scheduleId: "schedule-1",
  scheduleVersionId: "schedule-version-1",
  expectedScheduleRevision: 2,
  planDayId: "plan-day-1",
  expectedPlanDayRevision: 3,
  slotId: "slot-1",
  slotRevisionId: "slot-1:revision:2",
  expectedSlotRevision: 2,
  slotOrdinal: 1,
  sessionRevisionId: "session-revision-1",
  expectedSessionRevision: 4,
  sessionKind: "intervals",
  localDate: "2026-10-12",
  localTime: null,
  timezone: "Asia/Singapore",
  targetSummary: "6 × 400 m · recovery 2 min · 4:35 / km",
  state: "planned",
  expectedRelationRevision: 0,
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
    await expect(confirmRunningActivityMatch(repository, { ...input, action: "unmatch", expectedCurrentOpportunityId: input.opportunityId })).resolves.toMatchObject({ kind: "conflict" });
  });

  it("rejects confirmation unless the accepted payload and every stable source revision are carried", async () => {
    const repository: RunningActivityMatchRepository = {
      confirm: jest.fn(async () => ({
        kind: "matched" as const,
        activityId: "activity-1",
        opportunityId: "opportunity-1",
        relationRevision: 1,
      })),
    };
    const complete = {
      ...input,
      expectedAcceptedPayloadSha256: "a".repeat(64),
      planId: "running-plan-1",
      expectedScheduleRevision: 2,
      planDayId: "plan-day-1",
      expectedPlanDayRevision: 3,
      slotRevisionId: "slot-1:revision:2",
      expectedSlotRevision: 2,
      expectedSessionRevision: 4,
    };

    for (const key of [
      "expectedAcceptedPayloadSha256",
      "planId",
      "expectedScheduleRevision",
      "planDayId",
      "expectedPlanDayRevision",
      "slotRevisionId",
      "expectedSlotRevision",
      "expectedSessionRevision",
    ] as const) {
      const malformed = { ...complete } as Record<string, unknown>;
      delete malformed[key];
      await expect(confirmRunningActivityMatch(repository, malformed as never))
        .rejects.toThrow("running_activity_match_invalid");
    }
    expect(repository.confirm).not.toHaveBeenCalled();
  });

  it("queries by one opaque local activity ID and prepares the exact selected confirmation envelope", async () => {
    const readCandidates = jest.fn(async () => Object.freeze({
      kind: "ready" as const,
      activityId: "activity-1",
      candidates: Object.freeze([candidate]),
    }));

    await expect(queryRunningActivityMatchCandidates({ readCandidates }, "activity-1"))
      .resolves.toEqual({ kind: "ready", activityId: "activity-1", candidates: [candidate] });
    expect(readCandidates).toHaveBeenCalledWith("activity-1");

    const prepared = await prepareRunningActivityMatchInput({
      action: "match",
      candidate,
      requestId: "match-request-2",
      occurredAtMs: 1_700_000_000_001,
    }, async () => "d".repeat(64));

    expect(prepared).toEqual({
      requestId: "match-request-2",
      requestSha256: "d".repeat(64),
      action: "match",
      activityId: "activity-1",
      expectedActivityRevision: 1,
      expectedAcceptedPayloadSha256: "a".repeat(64),
      opportunityId: "opportunity-1",
      expectedOpportunityRevision: 1,
      expectedRelationRevision: 0,
      planId: "running-plan-1",
      scheduleId: "schedule-1",
      scheduleVersionId: "schedule-version-1",
      expectedScheduleRevision: 2,
      planDayId: "plan-day-1",
      expectedPlanDayRevision: 3,
      slotId: "slot-1",
      slotRevisionId: "slot-1:revision:2",
      expectedSlotRevision: 2,
      sessionRevisionId: "session-revision-1",
      expectedSessionRevision: 4,
      occurredAtMs: 1_700_000_000_001,
    });
  });

  it("rejects mismatched unmatch identity and no-op reassignment before the repository boundary", async () => {
    const repository: RunningActivityMatchRepository = {
      confirm: jest.fn(async () => ({
        kind: "conflict" as const,
        activityId: input.activityId,
        opportunityId: input.opportunityId,
        relationRevision: input.expectedRelationRevision,
      })),
    };

    await expect(confirmRunningActivityMatch(repository, {
      ...input,
      action: "unmatch",
      expectedCurrentOpportunityId: "another-opportunity",
    })).rejects.toThrow("running_activity_match_invalid");
    await expect(confirmRunningActivityMatch(repository, {
      ...input,
      action: "reassign",
      expectedCurrentOpportunityId: input.opportunityId,
    })).rejects.toThrow("running_activity_match_invalid");
    expect(repository.confirm).not.toHaveBeenCalled();
  });
});

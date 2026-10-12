import { describe, expect, it } from "@jest/globals";

import type { SqliteKernel } from "../sqliteKernel";
import { createRunningActivityMatchRepository } from "./runningActivityMatchRepository";

const activity = Object.freeze({
  activity_id: "activity-1",
  aggregate_revision: 1,
  accepted_normalized_sha256: "a".repeat(64),
  removal_state: "active" as const,
  matched_opportunity_id: null,
  current_relation_revision: null,
  latest_relation_revision: 0,
});

const candidate = Object.freeze({
  activity_id: "activity-1",
  aggregate_revision: 1,
  accepted_normalized_sha256: "a".repeat(64),
  opportunity_id: "opportunity-1",
  plan_id: "plan-1",
  plan_name: "Running plan",
  schedule_id: "schedule-1",
  schedule_version_id: "schedule-version-1",
  schedule_revision: 1,
  schedule_lifecycle: "active" as const,
  plan_active: 1,
  plan_day_id: "day-1",
  plan_day_revision: 1,
  slot_id: "slot-1",
  slot_revision_id: "slot-revision-1",
  slot_revision: 1,
  slot_ordinal: 0,
  session_revision_id: "session-revision-1",
  session_revision: 1,
  session_kind: "recovery" as const,
  definition_json: "{}",
  local_date: "2026-10-11",
  timezone: "Asia/Singapore",
  relation_revision: 0,
  state: "planned" as const,
});

function readKernel(responses: readonly (readonly Record<string, unknown>[])[]): SqliteKernel {
  const pending = [...responses];
  return {
    queryAll: async () => pending.shift() ?? [],
  } as unknown as SqliteKernel;
}

describe("running activity match repository projections", () => {
  it("returns every bounded activity state without a write-capable snapshot", async () => {
    await expect(createRunningActivityMatchRepository(readKernel([[]])).readCandidates("missing"))
      .resolves.toEqual({ kind: "missing", activityId: "missing" });
    await expect(createRunningActivityMatchRepository(readKernel([[{
      ...activity,
      removal_state: "removed",
    }]])).readCandidates("activity-1")).resolves.toEqual({
      kind: "activity_unavailable",
      activityId: "activity-1",
    });
    await expect(createRunningActivityMatchRepository(readKernel([
      [{
        ...activity,
        matched_opportunity_id: "opportunity-1",
        current_relation_revision: 3,
      }],
      [{
        ...candidate,
        opportunity_id: "opportunity-1",
        relation_revision: 3,
      }],
      [{
        ...candidate,
        opportunity_id: "opportunity-2",
        relation_revision: 3,
      }],
    ])).readCandidates("activity-1")).resolves.toEqual({
      kind: "already_matched",
      activityId: "activity-1",
      currentCandidate: {
        activityId: "activity-1",
        expectedActivityRevision: 1,
        expectedAcceptedPayloadSha256: "a".repeat(64),
        opportunityId: "opportunity-1",
        expectedOpportunityRevision: 1,
        planId: "plan-1",
        planName: "Running plan",
        scheduleId: "schedule-1",
        scheduleVersionId: "schedule-version-1",
        expectedScheduleRevision: 1,
        planDayId: "day-1",
        expectedPlanDayRevision: 1,
        slotId: "slot-1",
        slotRevisionId: "slot-revision-1",
        expectedSlotRevision: 1,
        slotOrdinal: 0,
        sessionRevisionId: "session-revision-1",
        expectedSessionRevision: 1,
        sessionKind: "recovery",
        localDate: "2026-10-11",
        localTime: null,
        timezone: "Asia/Singapore",
        targetSummary: "Recovery session",
        state: "planned",
        expectedRelationRevision: 3,
      },
      candidates: [expect.objectContaining({
        opportunityId: "opportunity-2",
        expectedRelationRevision: 3,
        targetSummary: "Recovery session",
      })],
      opportunityId: "opportunity-1",
      relationRevision: 3,
    });
    await expect(createRunningActivityMatchRepository(readKernel([
      [{
        ...activity,
        matched_opportunity_id: "opportunity-1",
        current_relation_revision: 3,
      }],
      [],
      [],
    ])).readCandidates("activity-1")).resolves.toEqual({
      kind: "activity_unavailable",
      activityId: "activity-1",
    });
    await expect(createRunningActivityMatchRepository(readKernel([[activity], []])).readCandidates("activity-1"))
      .resolves.toEqual({ kind: "no_candidates", activityId: "activity-1" });
  });

  it("derives bounded target summaries from distance, duration, context, and advisory targets", async () => {
    const definitions = [
      [{ phases: [{ steps: [{ distanceMeters: 1_000 }, { durationMs: 120_000 }] }], advisoryTarget: { paceMsPerKm: 305_000 } }, "1000 m + 2 min · 5:05 / km"],
      [{ contextual: { repetitions: 3, work: { durationMs: 60_000 } }, advisoryTarget: { heartRateZone: 2 } }, "3 × 1 min · Z2"],
      [{ contextual: { work: null }, advisoryTarget: { rpe: 6 } }, "RPE 6"],
      [{ phases: [{ steps: [{}] }] }, "Recovery session"],
      [{ phases: [{}] }, "Recovery session"],
      [{}, "Recovery session"],
    ] as const;

    for (const [definition, expected] of definitions) {
      const repository = createRunningActivityMatchRepository(readKernel([[activity], [{
        ...candidate,
        definition_json: JSON.stringify(definition),
      }]]));
      await expect(repository.readCandidates("activity-1")).resolves.toMatchObject({
        kind: "ready",
        candidates: [expect.objectContaining({ targetSummary: expected })],
      });
    }
    const malformed = createRunningActivityMatchRepository(readKernel([[activity], [{
      ...candidate,
      session_kind: "long_run",
      definition_json: "{",
    }]]));
    await expect(malformed.readCandidates("activity-1")).resolves.toMatchObject({
      kind: "ready",
      candidates: [expect.objectContaining({ targetSummary: "Long run session" })],
    });
  });
});

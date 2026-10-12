import { describe, expect, it } from "@jest/globals";

import { projectProgressDashboard } from "./dashboardProjection";

const accepted2400 = {
  activityId: "activity-2400",
  sourceIdentity: "garmin:owner:2400",
  sourceRevision: 4,
  startedAtMs: 1_000,
  localDate: "2026-10-12",
  lifecycle: "active" as const,
  accepted: true,
  fixture: false,
  distanceMeters: 2400,
  durationSeconds: 650,
  timeBasis: "elapsed" as const,
  evidence: "source_summary" as const,
  exactDistanceMeters: 2400,
};

describe("projectProgressDashboard", () => {
  it("projects one accepted source-summary 2.4 km effort with its effective target and source evidence", () => {
    const projection = projectProgressDashboard({
      sport: "Running",
      running: {
        activities: [accepted2400],
        targets: [{
          targetId: "goal-2400-r2",
          sport: "Running",
          distanceMeters: 2400,
          targetDurationSeconds: 660,
          effectiveAtMs: 900,
          revision: 2,
          sourceOrder: 1,
        }],
      },
    });

    expect(projection).toMatchObject({
      sport: "Running",
      state: "sparse",
      goals: [{
        distanceMeters: 2400,
        latest: { durationSeconds: 650, activityId: "activity-2400" },
        best: { durationSeconds: 650, activityId: "activity-2400" },
        target: { durationSeconds: 660, targetId: "goal-2400-r2" },
        targetAtDate: { durationSeconds: 660, targetId: "goal-2400-r2" },
        evidenceCount: 1,
      }],
    });
  });

  it("never promotes sampled, unaccepted, removed, malformed, fixture, or schedule-only facts into an exact effort", () => {
    const projection = projectProgressDashboard({
      sport: "Running",
      running: {
        activities: [
          { ...accepted2400, evidence: "sampled" as const },
          { ...accepted2400, activityId: "unaccepted", accepted: false },
          { ...accepted2400, activityId: "removed", lifecycle: "removed" as const },
          { ...accepted2400, activityId: "fixture", fixture: true },
          { ...accepted2400, activityId: "inexact", exactDistanceMeters: null },
        ],
        targets: [],
      },
    });

    expect(projection).toEqual({
      sport: "Running",
      state: "more_data_needed",
      goals: [],
      absenceReason: "exact_effort_evidence_insufficient",
    });
  });
});

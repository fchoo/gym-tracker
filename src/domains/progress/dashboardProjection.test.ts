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

  it("separates time bases and keeps historical targets at their effective revisions", () => {
    const projection = projectProgressDashboard({
      sport: "Running",
      running: {
        activities: [
          { ...accepted2400, activityId: "elapsed-old", startedAtMs: 1_000, durationSeconds: 660 },
          { ...accepted2400, activityId: "elapsed-new", startedAtMs: 3_000, durationSeconds: 650 },
          { ...accepted2400, activityId: "moving", startedAtMs: 3_000, timeBasis: "moving", durationSeconds: 640 },
        ],
        targets: [
          { targetId: "target-r1", sport: "Running", distanceMeters: 2400, targetDurationSeconds: 660, effectiveAtMs: 500, revision: 1, sourceOrder: 1 },
          { targetId: "target-r2", sport: "Running", distanceMeters: 2400, targetDurationSeconds: 650, effectiveAtMs: 2_000, revision: 2, sourceOrder: 1 },
        ],
      },
    });

    expect(projection).toMatchObject({
      state: "ready",
      goals: [
        {
          timeBasis: "elapsed",
          history: [
            { effort: { activityId: "elapsed-old" }, targetAtDate: { targetId: "target-r1" } },
            { effort: { activityId: "elapsed-new" }, targetAtDate: { targetId: "target-r2" } },
          ],
        },
        { timeBasis: "moving", evidenceCount: 1 },
      ],
    });
  });

  it("selects an All goal by owner order, explicit target date, sport, source ID, then revision without a composite score", () => {
    const projection = projectProgressDashboard({
      sport: "All",
      goals: [
        { targetId: "running-later", sport: "Running", targetDurationSeconds: 660, effectiveAtMs: 1, targetLocalDate: "2026-12-01", revision: 1, sourceOrder: 2 },
        { targetId: "running-earlier", sport: "Running", targetDurationSeconds: 660, effectiveAtMs: 1, targetLocalDate: "2026-11-01", revision: 1, sourceOrder: 2 },
        { targetId: "strength-first", sport: "Strength", targetDurationSeconds: null, effectiveAtMs: 1, revision: 1, sourceOrder: 1 },
      ],
    });

    expect(projection).toEqual({
      sport: "All",
      state: "ready",
      primaryGoal: expect.objectContaining({ targetId: "strength-first" }),
    });
  });
});

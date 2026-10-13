import { describe, expect, it } from "@jest/globals";

import { __dashboardProjectionTestOnly, projectProgressDashboard } from "./dashboardProjection";

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
      plannedNext: null,
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

  it("projects the current authoritative Running target into All without a composite score", () => {
    const projection = projectProgressDashboard({
      sport: "All",
      goals: [
        { targetId: "running-old", planId: "active-running", sport: "Running", distanceMeters: 2_400, targetDurationSeconds: 720, effectiveAtMs: 1, revision: 1, sourceOrder: 1, lifecycle: "active", active: true, current: false },
        { targetId: "running-current", planId: "active-running", sport: "Running", distanceMeters: 2_400, targetDurationSeconds: 660, effectiveAtMs: 2, revision: 2, sourceOrder: 1, lifecycle: "active", active: true, current: true },
        { targetId: "archived", planId: "archived-running", sport: "Running", distanceMeters: 10_000, targetDurationSeconds: 3_600, effectiveAtMs: 3, revision: 3, sourceOrder: 0, lifecycle: "archived", active: false, current: true },
      ],
    });

    expect(projection).toMatchObject({
      sport: "All",
      state: "sparse",
      primaryGoal: {
        sport: "Running",
        goal: {
          distanceMeters: 2_400,
          latest: null,
          best: null,
          target: { targetId: "running-current", durationSeconds: 660 },
          gap: "Gap · More data needed",
        },
      },
    });
  });

  it("keeps unset goals after dated goals and reports honest empty Running, All, and Strength states", () => {
    expect(projectProgressDashboard({ sport: "Running" })).toMatchObject({
      state: "empty",
      absenceReason: "no_factual_points",
    });
    expect(projectProgressDashboard({ sport: "Strength", strength: { candidates: [] } })).toEqual({
      sport: "Strength",
      state: "empty",
      facts: [],
      goals: [],
      plannedNext: null,
    });
    expect(projectProgressDashboard({ sport: "Strength", strength: {} })).toEqual({
      sport: "Strength",
      state: "empty",
      facts: [],
      goals: [],
      plannedNext: null,
    });
    expect(projectProgressDashboard({ sport: "All" })).toEqual({
      sport: "All",
      state: "empty",
      primaryGoal: null,
      activeGoals: [],
      plannedNext: null,
    });
    expect(projectProgressDashboard({
      sport: "All",
      goals: [
        { targetId: "unset", sport: "Running", distanceMeters: 2_400, targetDurationSeconds: null, effectiveAtMs: 1, revision: 1, sourceOrder: 1 },
        { targetId: "dated", sport: "Running", distanceMeters: 2_400, targetDurationSeconds: 660, targetLocalDate: "2026-11-01", effectiveAtMs: 2, revision: 2, sourceOrder: 1 },
      ],
    })).toMatchObject({ primaryGoal: { sport: "Running", goal: { target: { targetId: "dated" } } } });
  });

  it("retains an effort without a target and resolves equal best efforts deterministically", () => {
    const projection = projectProgressDashboard({
      sport: "Running",
      running: {
        activities: [
          { ...accepted2400, activityId: "a", startedAtMs: 2_000, durationSeconds: 660 },
          { ...accepted2400, activityId: "b", startedAtMs: 2_000, durationSeconds: 660 },
          { ...accepted2400, activityId: "slower", startedAtMs: 3_000, durationSeconds: 670 },
        ],
        targets: [],
      },
    });

    expect(projection).toMatchObject({
      state: "ready",
      goals: [{ best: { activityId: "b" }, target: null, targetAtDate: null }],
    });
  });

  it("keeps Strength facts typed and ignores malformed or future Running target revisions", () => {
    const strengthFact = {
      exerciseId: "bench",
      exerciseName: "Bench Press",
      identityKey: "load_reps:1:1",
      comparatorKey: "identity",
      sessionId: "session",
      setId: "set",
      localDate: "2026-10-12",
      sourceRevision: 2,
      targetJson: JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 40_000, minReps: 8, maxReps: 10, incrementGrams: 2_500, perSide: false }),
      observationJson: JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 42_500, reps: 8, source: "manual" }),
    };
    expect(projectProgressDashboard({ sport: "Strength", strength: { facts: [strengthFact] } })).toMatchObject({
      state: "sparse",
      facts: [strengthFact],
      goals: [expect.objectContaining({
        exerciseName: "Bench Press",
        latest: expect.objectContaining({ label: "42.5 kg × 8", sourceRevision: 2 }),
        target: { value: 40, label: "40 kg × 10" },
        gap: "Gap · 2.5 kg better than target",
      })],
    });
    const running = projectProgressDashboard({
      sport: "Running",
      running: {
        activities: [accepted2400],
        targets: [
          { targetId: "strength", sport: "Strength", targetDurationSeconds: 1, effectiveAtMs: 1, revision: 1, sourceOrder: 1 },
          { targetId: "other-distance", sport: "Running", distanceMeters: 1000, targetDurationSeconds: 1, effectiveAtMs: 1, revision: 1, sourceOrder: 1 },
          { targetId: "null", sport: "Running", distanceMeters: 2400, targetDurationSeconds: null, effectiveAtMs: 1, revision: 1, sourceOrder: 1 },
          { targetId: "future", sport: "Running", distanceMeters: 2400, targetDurationSeconds: 1, effectiveAtMs: 2_000, revision: 1, sourceOrder: 1 },
          { targetId: "zero", sport: "Running", distanceMeters: 2400, targetDurationSeconds: 0, effectiveAtMs: 1, revision: 1, sourceOrder: 1 },
        ],
      },
    });
    expect(running.sport).toBe("Running");
    if (running.sport !== "Running") throw new Error("running_projection_expected");
    expect(running.goals).toEqual(expect.arrayContaining([
      expect.objectContaining({ distanceMeters: 1_000, latest: null, target: { targetId: "other-distance", durationSeconds: 1 } }),
      expect.objectContaining({ distanceMeters: 2_400, target: { targetId: "future", durationSeconds: 1 }, targetAtDate: null }),
    ]));
  });

  it("keeps current targets independent from the latest effort date and rejects inactive plan history", () => {
    const goal = (targetId: string, overrides: Record<string, unknown> = {}) => ({
      targetId,
      planId: "active-plan",
      sport: "Running" as const,
      distanceMeters: 2_400,
      targetDurationSeconds: 660,
      targetLocalDate: "2026-11-01",
      effectiveAtMs: 100,
      revision: 1,
      sourceOrder: 1,
      lifecycle: "active" as const,
      active: true,
      current: false,
      ...overrides,
    });
    expect(projectProgressDashboard({ sport: "Running", running: {
      activities: [accepted2400],
      targets: [
        goal("target-at-effort", { effectiveAtMs: 500, revision: 1 }),
        goal("current-after-effort", { effectiveAtMs: 2_000, revision: 2, current: true, targetDurationSeconds: 650 }),
        goal("inactive-newer", { planId: "inactive", lifecycle: "inactive", active: false, current: true, effectiveAtMs: 3_000, revision: 3, targetDurationSeconds: 600 }),
      ],
    } })).toMatchObject({ goals: [{
      target: { targetId: "current-after-effort", durationSeconds: 650 },
      targetAtDate: { targetId: "target-at-effort", durationSeconds: 660 },
    }] });
    const strengthFact = (setId: string) => ({
      exerciseId: "bench", exerciseName: "Bench Press", identityKey: "load_reps:1:1",
      comparatorKey: "identity", sessionId: "session", setId, localDate: "2026-10-12",
      targetJson: JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 40_000, minReps: 8, maxReps: 10, incrementGrams: 2_500, perSide: false }),
      observationJson: JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 40_000, reps: setId === "1" ? 8 : 10, source: "manual" }),
    });
    expect(projectProgressDashboard({ sport: "Strength", strength: { facts: [strengthFact("1"), strengthFact("2")] } })).toMatchObject({
      state: "ready",
    });
    expect(projectProgressDashboard({
      sport: "Running",
      running: {
        activities: [accepted2400],
        targets: [
          { targetId: "z-target", sport: "Running", distanceMeters: 2400, targetDurationSeconds: 660, effectiveAtMs: 500, revision: 1, sourceOrder: 1, current: true },
          { targetId: "a-target", sport: "Running", distanceMeters: 2400, targetDurationSeconds: 650, effectiveAtMs: 500, revision: 1, sourceOrder: 1, current: false },
        ],
      },
    })).toMatchObject({ goals: [{ target: { targetId: "z-target" } }] });
  });

  it("projects every Strength metric profile with native units and factual comparators", () => {
    const records = [
      ["bodyweight_reps", { version: 1, profile: "bodyweight_reps", minReps: 8, maxReps: 10, variationId: "standard", perSide: false }, { version: 1, profile: "bodyweight_reps", reps: 12, source: "manual" }],
      ["added_load_reps", { version: 1, profile: "added_load_reps", addedLoadGrams: 10_000, minReps: 8, maxReps: 10, incrementGrams: 2_500, perSide: false }, { version: 1, profile: "added_load_reps", addedLoadGrams: 12_500, reps: 8, source: "manual" }],
      ["assisted_reps", { version: 1, profile: "assisted_reps", assistanceGrams: 10_000, minReps: 8, maxReps: 10, decrementGrams: 2_500, assistanceEquipmentId: "machine", perSide: false }, { version: 1, profile: "assisted_reps", assistanceGrams: 5_000, reps: 8, source: "manual" }],
      ["timed_hold", { version: 1, profile: "timed_hold", durationSeconds: 3_600, perSide: false }, { version: 1, profile: "timed_hold", durationSeconds: 3_661, source: "manual" }],
      ["fixed_distance", { version: 1, profile: "fixed_distance", plannedDistanceMeters: 2_000 }, { version: 1, profile: "fixed_distance", distanceMeters: 2_000, durationMs: 3_600_000, source: "manual" }],
      ["fixed_time", { version: 1, profile: "fixed_time", plannedDurationMs: 600_000 }, { version: 1, profile: "fixed_time", durationMs: 600_000, distanceMeters: 2_500, source: "manual" }],
      ["intervals", { version: 1, profile: "intervals", protocolId: "rounds", comparatorId: "rounds_then_work", comparatorVersion: 1, plannedRounds: 5, workIntervalMs: 60_000, restIntervalMs: 30_000 }, { version: 1, profile: "intervals", protocolId: "rounds", completedRounds: 6, completedWorkMs: 360_000, source: "manual" }],
      ["unscored", { version: 1, profile: "unscored", completionRequired: true }, { version: 1, profile: "unscored", completed: false, source: "manual" }],
    ].map(([profile, target, observation], index) => ({
      exerciseId: `exercise-${index}`,
      exerciseName: `Exercise ${index}`,
      identityKey: `${profile}:1:1`,
      comparatorKey: "identity",
      sessionId: `session-${index}`,
      setId: `set-${index}`,
      localDate: "2026-10-12",
      targetJson: JSON.stringify(target),
      observationJson: JSON.stringify(observation),
    }));

    const projection = projectProgressDashboard({ sport: "Strength", strength: { facts: records } });
    expect(projection.sport).toBe("Strength");
    if (projection.sport !== "Strength") throw new Error("strength_projection_expected");
    expect(projection.goals.map(({ latest }) => latest.label)).toEqual(expect.arrayContaining([
      "Bodyweight × 12",
      "BW + 12.5 kg × 8",
      "5 kg assist × 8",
      "1:01:01",
      "1:00:00",
      "2500 m",
      "6 rounds",
      "Not completed",
    ]));
    expect(projection.goals.find(({ identityKey }) => identityKey.startsWith("fixed_distance"))?.gap)
      .toBe("Gap · Target unavailable");
    expect(projectProgressDashboard({ sport: "All", strength: { facts: records } })).toMatchObject({
      sport: "All",
      state: "sparse",
      primaryGoal: { sport: "Strength" },
    });
  });

  it("covers defensive scalar formatting, malformed facts, holding status, and stable Strength ordering", () => {
    const formats = ["kilograms", "repetitions", "seconds", "duration", "meters", "rounds", "completion"] as const;
    expect(formats.map((format) => __dashboardProjectionTestOnly.formatScalar(format, format === "completion" ? 0 : 3_661))).toEqual([
      "3661 kg", "3661 reps", "3661 sec", "1:01:01", "3661 m", "3661 rounds", "Not completed",
    ]);
    expect(__dashboardProjectionTestOnly.formatScalar("completion", 1)).toBe("Completed");
    expect(__dashboardProjectionTestOnly.duration(61)).toBe("1:01");
    expect(__dashboardProjectionTestOnly.scalarMetric(
      { version: 1, profile: "unscored", completionRequired: true },
      { version: 1, profile: "bodyweight_reps", reps: 8, source: "manual" },
    )).toBeNull();
    expect(__dashboardProjectionTestOnly.scalarMetric(
      { version: 2, profile: "timed_hold", durationMs: 60_000, perSide: false },
      { version: 2, profile: "timed_hold", durationMs: 61_000, source: "manual" },
    )).toMatchObject({ value: 61, target: 60 });
    expect(__dashboardProjectionTestOnly.scalarMetric(
      { version: 1, profile: "unscored", completionRequired: true },
      { version: 1, profile: "unscored", completed: true, source: "manual" },
    )).toMatchObject({ value: 1, valueLabel: "Completed" });
    const targetJson = JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 40_000, minReps: 8, maxReps: 10, incrementGrams: 2_500, perSide: false });
    const record = (exerciseName: string, setId: string, loadGrams: number) => ({
      exerciseId: exerciseName.toLowerCase(), exerciseName, identityKey: "load_reps:1:1", comparatorKey: "identity",
      sessionId: "session", setId, localDate: "2026-10-12", targetJson,
      observationJson: JSON.stringify({ version: 1, profile: "load_reps", loadGrams, reps: 8, source: "manual" }),
    });
    const projection = projectProgressDashboard({ sport: "Strength", strength: { facts: [
      { ...record("Zulu", "a", 40_000), identityKey: "invalid" },
      { ...record("Zulu", "malformed", 40_000), targetJson: "{}" },
      record("Zulu", "b", 40_000),
      record("Zulu", "c", 37_500),
      record("Alpha", "d", 40_000),
      { ...record("Beta", "e", 40_000), exerciseId: "alpha-2", exerciseName: "Alpha" },
    ] } });
    expect(projection).toMatchObject({
      sport: "Strength",
      state: "ready",
      goals: [
        { exerciseName: "Alpha", status: "baseline", gap: "Gap · At target" },
        { exerciseName: "Alpha", status: "baseline", gap: "Gap · At target" },
        { exerciseName: "Zulu", status: "holding", gap: "Gap · At target" },
      ],
    });
    expect(projectProgressDashboard({ sport: "All", strength: { facts: [
      record("Zulu", "b", 40_000), record("Zulu", "c", 40_000), record("Alpha", "d", 40_000),
    ] } })).toMatchObject({ state: "ready", primaryGoal: { sport: "Strength" } });

    const baseGoal = { targetId: "target", planId: "plan", sport: "Running" as const, distanceMeters: 2_400, targetDurationSeconds: 660, targetLocalDate: "2026-11-01", effectiveAtMs: 1, revision: 1, sourceOrder: 1 };
    expect(__dashboardProjectionTestOnly.compareGoals({ ...baseGoal, sourceOrder: 1 }, { ...baseGoal, sourceOrder: 2 })).toBeLessThan(0);
    expect(__dashboardProjectionTestOnly.compareGoals({ ...baseGoal, targetLocalDate: "2026-11-01" }, { ...baseGoal, targetLocalDate: "2026-12-01" })).toBeLessThan(0);
    expect(__dashboardProjectionTestOnly.compareGoals({ ...baseGoal, sport: "Running" }, { ...baseGoal, sport: "Strength" })).toBeLessThan(0);
    expect(__dashboardProjectionTestOnly.compareGoals({ ...baseGoal, planId: "a" }, { ...baseGoal, planId: "b" })).toBeLessThan(0);
    expect(__dashboardProjectionTestOnly.compareGoals({ ...baseGoal, targetId: "a" }, { ...baseGoal, targetId: "b" })).toBeLessThan(0);
    expect(__dashboardProjectionTestOnly.compareGoals({ ...baseGoal, revision: 1 }, { ...baseGoal, revision: 2 })).toBeLessThan(0);
  });

  it("rejects every malformed Running scalar and uses singular gap copy", () => {
    const malformed = [
      { ...accepted2400, activityId: " bad" },
      { ...accepted2400, activityId: "source-bad", sourceIdentity: "" },
      { ...accepted2400, activityId: "revision-bad", sourceRevision: 0 },
      { ...accepted2400, activityId: "time-bad", startedAtMs: -1 },
      { ...accepted2400, activityId: "distance-bad", distanceMeters: 0, exactDistanceMeters: 0 },
      { ...accepted2400, activityId: "duration-bad", durationSeconds: 0 },
      { ...accepted2400, activityId: "moving-evidence-bad", evidence: "sampled" as const },
    ];
    expect(projectProgressDashboard({ sport: "Running", running: { activities: malformed, targets: [] } }))
      .toMatchObject({ state: "more_data_needed", goals: [] });
    expect(projectProgressDashboard({ sport: "Running", running: {
      activities: [accepted2400],
      targets: [{ targetId: "one-second-gap", sport: "Running", distanceMeters: 2_400, targetDurationSeconds: 649, effectiveAtMs: 1, revision: 1, sourceOrder: 1 }],
    } })).toMatchObject({ goals: [{ gap: "Gap · 1 second behind target" }] });
  });

  it("projects the earliest compatible source-backed planned opportunity for each sport", () => {
    const plannedNext = [{
      sport: "Running" as const,
      sourceOpportunityId: "running-opportunity",
      sourceRevision: 3,
      localDate: "2026-10-15",
      planId: "running-plan",
      planName: "5K base",
      activityId: "running-session",
      activityName: "Tempo",
    }, {
      sport: "Strength" as const,
      sourceOpportunityId: "strength-opportunity",
      sourceRevision: 2,
      localDate: "2026-10-14",
      planId: "strength-plan",
      planName: "Full body",
      activityId: "strength-day",
      activityName: "Workout A",
    }];

    expect(projectProgressDashboard({ sport: "All", plannedNext })).toMatchObject({
      plannedNext: { sport: "Strength", sourceOpportunityId: "strength-opportunity" },
    });
    expect(projectProgressDashboard({ sport: "Strength", plannedNext })).toMatchObject({
      plannedNext: { sport: "Strength", activityName: "Workout A" },
    });
    expect(projectProgressDashboard({ sport: "Running", plannedNext })).toMatchObject({
      plannedNext: { sport: "Running", activityName: "Tempo" },
    });
    expect(projectProgressDashboard({
      sport: "Running",
      plannedNext: [{ ...plannedNext[0]!, sourceRevision: 0 }],
    })).toMatchObject({ plannedNext: null });
    const sameDay = [
      { ...plannedNext[0]!, sourceOpportunityId: "running-z", localDate: "2026-10-14" },
      { ...plannedNext[1]!, sourceOpportunityId: "strength-z" },
      { ...plannedNext[0]!, sourceOpportunityId: "running-a", localDate: "2026-10-14" },
    ];
    expect(__dashboardProjectionTestOnly.plannedNextFor("All", sameDay))
      .toMatchObject({ sourceOpportunityId: "running-a" });
  });
});

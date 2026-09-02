import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  projectProgressPeriod,
} from "./periodProjection";

const target = {
  version: 1,
  profile: "load_reps",
  loadGrams: 40_000,
  minReps: 8,
  maxReps: 10,
  incrementGrams: 2_500,
  perSide: false,
};

function exposure(input: Readonly<{
  sessionId: string;
  localDate: string;
  setId: string;
  completedAtMs: number;
  reps: number;
  exerciseId?: string;
  exerciseName?: string;
  loadGrams?: number;
}>) {
  return {
    exerciseId: input.exerciseId ?? "bench-press",
    exerciseName: input.exerciseName ?? "Bench Press",
    identityKey: "load_reps:1:1",
    comparatorKey: "identity",
    sessionId: input.sessionId,
    localDate: input.localDate,
    setId: input.setId,
    setOrdinal: 0,
    completedAtMs: input.completedAtMs,
    targetJson: JSON.stringify(target),
    observationJson: JSON.stringify({
      version: 1,
      profile: "load_reps",
      loadGrams: input.loadGrams ?? 40_000,
      reps: input.reps,
      source: "manual",
    }),
  } as const;
}

describe("projectProgressPeriod", () => {
  it("uses inclusive civil 4-week and 12-week windows ending on the supplied date", () => {
    const input = {
      nowLocalDate: "2026-08-24",
      periodInputs: [
        {
          localDate: "2026-07-28",
          completedExercises: 1,
          plannedExercises: 1,
          completedWorkingSets: 1,
          plannedWorkingSets: 1,
          comparableExposureCount: 1,
        },
        {
          localDate: "2026-07-29",
          completedExercises: 2,
          plannedExercises: 2,
          completedWorkingSets: 3,
          plannedWorkingSets: 3,
          comparableExposureCount: 3,
        },
        {
          localDate: "2026-06-02",
          completedExercises: 4,
          plannedExercises: 4,
          completedWorkingSets: 4,
          plannedWorkingSets: 4,
          comparableExposureCount: 4,
        },
      ],
      comparableExposures: [],
      scheduledOpportunities: [],
      attention: [],
    } as const;

    expect(projectProgressPeriod({ ...input, period: "4_weeks" })).toMatchObject({
      state: "baseline",
      window: { start: "2026-07-28", end: "2026-08-24" },
      summary: {
        workingSets: { completed: 4, planned: 4 },
      },
    });
    expect(projectProgressPeriod({ ...input, period: "12_weeks" })).toMatchObject({
      window: { start: "2026-06-02", end: "2026-08-24" },
      summary: {
        workingSets: { completed: 8, planned: 8 },
      },
    });
  });

  it("derives all time from the first included factual or persisted schedule date", () => {
    const view = projectProgressPeriod({
      period: "all_time",
      nowLocalDate: "2026-08-24",
      periodInputs: [],
      comparableExposures: [exposure({
        sessionId: "session-1",
        localDate: "2026-08-20",
        setId: "set-1",
        completedAtMs: 1,
        reps: 8,
      })],
      scheduledOpportunities: [{
        id: "opportunity-1",
        localDate: "2026-08-02",
        outcome: "planned_not_completed",
      }],
      attention: [],
    });

    expect(view.window).toEqual({ start: "2026-08-02", end: "2026-08-24" });
    expect(view.summary.scheduledOpportunities).toEqual({
      completed: 0,
      planned: 1,
    });
  });

  it("creates deterministic metric-aware records, exercise statuses, trend rows, and source drill-downs", () => {
    const view = projectProgressPeriod({
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
      periodInputs: [
        {
          localDate: "2026-08-20",
          completedExercises: 1,
          plannedExercises: 1,
          completedWorkingSets: 1,
          plannedWorkingSets: 1,
          comparableExposureCount: 1,
        },
        {
          localDate: "2026-08-22",
          completedExercises: 1,
          plannedExercises: 1,
          completedWorkingSets: 1,
          plannedWorkingSets: 1,
          comparableExposureCount: 1,
        },
      ],
      comparableExposures: [
        exposure({
          sessionId: "session-2",
          localDate: "2026-08-22",
          setId: "set-2",
          completedAtMs: 2,
          reps: 10,
        }),
        exposure({
          sessionId: "session-1",
          localDate: "2026-08-20",
          setId: "set-1",
          completedAtMs: 1,
          reps: 8,
        }),
      ],
      scheduledOpportunities: [
        { id: "complete", localDate: "2026-08-20", outcome: "completed" },
        { id: "missed", localDate: "2026-08-22", outcome: "planned_not_completed" },
      ],
      attention: [{
        id: "recommendation-1",
        exerciseId: "bench-press",
        exerciseName: "Bench Press",
        sessionId: "session-2",
      }],
    });

    expect(view.state).toBe("current");
    expect(view.summary).toMatchObject({
      scheduledOpportunities: { completed: 1, planned: 2 },
      workingSets: { completed: 2, planned: 2 },
      improvingCount: 1,
      holdingCount: 0,
      baselineCount: 0,
      attentionCount: 1,
    });
    expect(view.records).toEqual([expect.objectContaining({
      exerciseId: "bench-press",
      exerciseName: "Bench Press",
      sessionId: "session-2",
      setId: "set-2",
      observationJson: expect.stringContaining('\"reps\":10'),
    })]);
    expect(view.exercises).toEqual([expect.objectContaining({
      exerciseId: "bench-press",
      exerciseName: "Bench Press",
      status: "improving",
      sessionId: "session-2",
      setId: "set-2",
    })]);
    expect(view.trend).toEqual([
      expect.objectContaining({
        localDate: "2026-08-20",
        sessionIds: ["session-1"],
        scheduledOpportunities: { completed: 1, planned: 1 },
      }),
      expect.objectContaining({
        localDate: "2026-08-22",
        sessionIds: ["session-2"],
        scheduledOpportunities: { completed: 0, planned: 1 },
      }),
    ]);
    expect(view.attention).toEqual([{
      id: "recommendation-1",
      exerciseId: "bench-press",
      exerciseName: "Bench Press",
      sessionId: "session-2",
    }]);
  });

  it("reports baseline without fabricating zero-valued records when comparable history is sparse", () => {
    const view = projectProgressPeriod({
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
      periodInputs: [{
        localDate: "2026-08-23",
        completedExercises: 0,
        plannedExercises: 1,
        completedWorkingSets: 0,
        plannedWorkingSets: 2,
        comparableExposureCount: 0,
      }],
      comparableExposures: [],
      scheduledOpportunities: [],
      attention: [],
    });

    expect(view.state).toBe("baseline");
    expect(view.records).toEqual([]);
    expect(view.exercises).toEqual([]);
    expect(view.summary.workingSets).toEqual({ completed: 0, planned: 2 });
  });

  it("derives stable selected-window source collections from active effective history", () => {
    const view = projectProgressPeriod({
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
      periodInputs: [{
        localDate: "2026-08-20",
        completedExercises: 2,
        plannedExercises: 2,
        completedWorkingSets: 3,
        plannedWorkingSets: 3,
        comparableExposureCount: 1,
      }],
      comparableExposures: [
        exposure({
          sessionId: "session-b",
          localDate: "2026-08-20",
          setId: "set-b",
          completedAtMs: 2,
          reps: 8,
        }),
        exposure({
          sessionId: "session-outside",
          localDate: "2026-07-27",
          setId: "set-outside",
          completedAtMs: 1,
          reps: 8,
        }),
      ],
      scheduledOpportunities: [
        {
          id: "opportunity-b",
          localDate: "2026-08-20",
          outcome: "completed",
          sessionId: "session-b",
        },
        {
          id: "opportunity-outside",
          localDate: "2026-07-27",
          outcome: "completed",
          sessionId: "session-outside",
        },
      ],
      attention: [{
        id: "attention-b",
        exerciseId: "bench-press",
        exerciseName: "Bench Press",
        sessionId: "session-b",
      }],
      sourceSessions: [
        {
          sessionId: "session-b",
          localDate: "2026-08-20",
          lifecycle: "active",
          exercises: [
            { exerciseId: "squat", exerciseName: "Back Squat" },
            { exerciseId: "bench-press", exerciseName: "Bench Press" },
            { exerciseId: "bench-press", exerciseName: "Bench Press" },
          ],
        },
        {
          sessionId: "session-a",
          localDate: "2026-08-20",
          lifecycle: "active",
          exercises: [{ exerciseId: "deadlift", exerciseName: "Deadlift" }],
        },
        {
          sessionId: "session-voided",
          localDate: "2026-08-20",
          lifecycle: "voided",
          exercises: [{
            exerciseId: "voided-exercise",
            exerciseName: "Voided exercise",
          }],
        },
        {
          sessionId: "session-outside",
          localDate: "2026-07-27",
          lifecycle: "active",
          exercises: [{
            exerciseId: "outside-exercise",
            exerciseName: "Outside exercise",
          }],
        },
      ],
    } as never);

    expect(view).toMatchObject({
      state: "baseline",
      summary: {
        sourceReferences: {
          scheduledOpportunities: {
            sessionIds: ["session-b"],
            exercises: [],
          },
          workingSets: {
            sessionIds: ["session-a", "session-b"],
            exercises: [
              { exerciseId: "squat", exerciseName: "Back Squat" },
              { exerciseId: "bench-press", exerciseName: "Bench Press" },
              { exerciseId: "deadlift", exerciseName: "Deadlift" },
            ],
          },
          exerciseStatuses: {
            sessionIds: ["session-b"],
            exercises: [{ exerciseId: "bench-press", exerciseName: "Bench Press" }],
          },
          attention: {
            sessionIds: ["session-b"],
            exercises: [{ exerciseId: "bench-press", exerciseName: "Bench Press" }],
          },
        },
      },
      stateSourceReferences: {
        sessionIds: ["session-b"],
        exercises: [{ exerciseId: "bench-press", exerciseName: "Bench Press" }],
      },
    });
  });

  it("is stable under input reordering and rejects duplicate date facts", () => {
    const input = {
      period: "4_weeks" as const,
      nowLocalDate: "2026-08-24",
      periodInputs: [{
        localDate: "2026-08-20",
        completedExercises: 1,
        plannedExercises: 1,
        completedWorkingSets: 1,
        plannedWorkingSets: 1,
        comparableExposureCount: 1,
      }],
      comparableExposures: [
        exposure({
          sessionId: "session-2",
          localDate: "2026-08-22",
          setId: "set-2",
          completedAtMs: 2,
          reps: 10,
        }),
        exposure({
          sessionId: "session-1",
          localDate: "2026-08-20",
          setId: "set-1",
          completedAtMs: 1,
          reps: 8,
        }),
      ],
      scheduledOpportunities: [],
      attention: [],
    };

    expect(projectProgressPeriod({
      ...input,
      comparableExposures: [...input.comparableExposures].reverse(),
    })).toEqual(projectProgressPeriod(input));
    expect(() => projectProgressPeriod({
      ...input,
      periodInputs: [...input.periodInputs, input.periodInputs[0]!],
    })).toThrow("progress_period_input_duplicate_date");
  });
});

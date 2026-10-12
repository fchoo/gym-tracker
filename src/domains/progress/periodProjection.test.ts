import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  projectProgressPeriod,
  projectStrengthComparableFacts,
} from "./periodProjection";

const target = {
  version: 1,
  profile: "load_reps",
  loadGrams: 40_000,
  minReps: 8,
  maxReps: 10,
  incrementGrams: 2_500,
  perSide: false,
} as const;

function exposure(input: Readonly<{
  sessionId: string;
  localDate: string;
  setId: string;
  completedAtMs: number;
  reps: number;
  exerciseId?: string;
  exerciseName?: string;
  loadGrams?: number;
  identityKey?: string;
  comparatorKey?: string;
  setOrdinal?: number;
}>) {
  return {
    exerciseId: input.exerciseId ?? "bench-press",
    exerciseName: input.exerciseName ?? "Bench Press",
    identityKey: input.identityKey ?? "load_reps:1:1",
    comparatorKey: input.comparatorKey ?? "identity",
    sessionId: input.sessionId,
    localDate: input.localDate,
    setId: input.setId,
    setOrdinal: input.setOrdinal ?? 0,
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

  it("fails closed on every malformed source identity, count, and duplicate boundary", () => {
    const validExposure = exposure({
      sessionId: "session-1",
      localDate: "2026-08-20",
      setId: "set-1",
      completedAtMs: 1,
      reps: 8,
    });
    const base = {
      period: "all_time" as const,
      nowLocalDate: "2026-08-24",
      periodInputs: [{
        localDate: "2026-08-20",
        completedExercises: 1,
        plannedExercises: 1,
        completedWorkingSets: 1,
        plannedWorkingSets: 1,
        comparableExposureCount: 1,
      }],
      comparableExposures: [validExposure],
      scheduledOpportunities: [{
        id: "opportunity-1",
        localDate: "2026-08-20",
        outcome: "completed" as const,
        sessionId: "session-1",
      }],
      attention: [{
        id: "attention-1",
        exerciseId: "bench-press",
        exerciseName: "Bench Press",
        sessionId: "session-1",
      }],
      sourceSessions: [{
        sessionId: "session-1",
        localDate: "2026-08-20",
        lifecycle: "active" as const,
        exercises: [{ exerciseId: "bench-press", exerciseName: "Bench Press" }],
      }],
    };
    const rejects = (overrides: Record<string, unknown>, code: string) => {
      expect(() => projectProgressPeriod({ ...base, ...overrides } as never)).toThrow(code);
    };

    for (const identityKey of ["load_reps", "load_reps:1", "load_reps:1:1:extra"]) {
      rejects({ comparableExposures: [{ ...validExposure, identityKey }] }, "progress_metric_identity_key_invalid");
    }
    for (const [field, code] of [
      ["exerciseId", "progress_exercise_id_invalid"],
      ["exerciseName", "progress_exercise_name_invalid"],
      ["comparatorKey", "progress_comparator_key_invalid"],
      ["sessionId", "progress_session_id_invalid"],
      ["setId", "progress_set_id_invalid"],
    ] as const) {
      rejects({ comparableExposures: [{ ...validExposure, [field]: "" }] }, code);
    }
    rejects({ comparableExposures: [{ ...validExposure, completedAtMs: -1 }] }, "progress_completed_at_invalid");
    rejects({ comparableExposures: [{ ...validExposure, setOrdinal: -1 }] }, "progress_set_ordinal_invalid");
    rejects({ comparableExposures: [validExposure, validExposure] }, "progress_exposure_duplicate_set");
    for (const field of [
      "completedExercises", "plannedExercises", "completedWorkingSets",
      "plannedWorkingSets", "comparableExposureCount",
    ] as const) {
      rejects({ periodInputs: [{ ...base.periodInputs[0], [field]: -1 }] }, "invalid");
    }
    rejects({ scheduledOpportunities: [base.scheduledOpportunities[0], base.scheduledOpportunities[0]] }, "progress_opportunity_duplicate_id");
    rejects({ sourceSessions: [base.sourceSessions[0], base.sourceSessions[0]] }, "progress_source_session_duplicate");
    rejects({ sourceSessions: [{ ...base.sourceSessions[0], sessionId: "" }] }, "progress_source_session_id_invalid");
    rejects({ sourceSessions: [{ ...base.sourceSessions[0], exercises: [{ exerciseId: "", exerciseName: "Bench Press" }] }] }, "progress_source_exercise_id_invalid");
    rejects({ sourceSessions: [{ ...base.sourceSessions[0], exercises: [{ exerciseId: "bench", exerciseName: "" }] }] }, "progress_source_exercise_name_invalid");
    rejects({ attention: [base.attention[0], base.attention[0]] }, "progress_attention_duplicate_id");
    rejects({ attention: [{ ...base.attention[0], id: "" }] }, "progress_attention_id_invalid");
    rejects({ attention: [{ ...base.attention[0], exerciseId: "" }] }, "progress_attention_exercise_id_invalid");

    const { sourceSessions: _sourceSessions, ...inputWithoutSources } = base;
    const withoutSources = projectProgressPeriod(inputWithoutSources);
    expect(withoutSources.summary.sourceReferences.scheduledOpportunities.sessionIds)
      .toEqual([]);
  });

  it("covers holding, equal-tie, and multi-group deterministic ordering", () => {
    const first = exposure({ sessionId: "session-a", localDate: "2026-08-20", setId: "set-a", completedAtMs: 1, reps: 8 });
    const equalLater = exposure({ sessionId: "session-b", localDate: "2026-08-20", setId: "set-b", completedAtMs: 2, reps: 8 });
    const other = exposure({ sessionId: "session-c", localDate: "2026-08-20", setId: "set-c", completedAtMs: 3, reps: 8, exerciseId: "squat", exerciseName: "Back Squat" });
    const view = projectProgressPeriod({
      period: "all_time",
      nowLocalDate: "2026-08-24",
      periodInputs: [],
      comparableExposures: [other, equalLater, first],
      scheduledOpportunities: [],
      attention: [
        { id: "z-attention", exerciseId: "bench-press", exerciseName: "Bench", sessionId: null },
        { id: "a-attention", exerciseId: "bench-press", exerciseName: "Bench", sessionId: null },
      ],
    });
    expect(view.state).toBe("hold");
    expect(view.records.map(({ setId }) => setId)).toEqual(["set-c", "set-b"]);
    expect(view.attention.map(({ id }) => id)).toEqual(["a-attention", "z-attention"]);
  });

  it("covers complete exposure and group tie-break ordering without changing facts", () => {
    const values = [
      exposure({ sessionId: "same", localDate: "2026-08-20", setId: "set-a", completedAtMs: 5, reps: 10 }),
      exposure({ sessionId: "same", localDate: "2026-08-20", setId: "set-b", completedAtMs: 5, reps: 8 }),
      exposure({ sessionId: "same", localDate: "2026-08-20", setId: "set-c", setOrdinal: 1, completedAtMs: 5, reps: 8 }),
      exposure({ sessionId: "z-session", localDate: "2026-08-20", setId: "set-d", completedAtMs: 5, reps: 8 }),
      exposure({ sessionId: "same", localDate: "2026-08-20", setId: "set-e", completedAtMs: 5, reps: 8, comparatorKey: "secondary" }),
      exposure({ sessionId: "same", localDate: "2026-08-20", setId: "set-f", completedAtMs: 5, reps: 8, identityKey: "load_reps:1:2" }),
      exposure({ sessionId: "same", localDate: "2026-08-20", setId: "set-g", completedAtMs: 5, reps: 8, exerciseId: "squat", exerciseName: "Same Name" }),
    ];
    const view = projectProgressPeriod({
      period: "all_time",
      nowLocalDate: "2026-08-24",
      periodInputs: [],
      comparableExposures: values,
      scheduledOpportunities: [
        { id: "z-opportunity", localDate: "2026-08-20", outcome: "completed" },
        { id: "a-opportunity", localDate: "2026-08-20", outcome: "completed" },
      ],
      attention: [],
      sourceSessions: [
        {
          sessionId: "same",
          localDate: "2026-08-20",
          lifecycle: "active",
          exercises: [
            { exerciseId: "z-exercise", exerciseName: "Same Name" },
            { exerciseId: "a-exercise", exerciseName: "Same Name" },
          ],
        },
        { sessionId: "z-session", localDate: "2026-08-20", lifecycle: "active", exercises: [] },
      ],
    } as never);
    expect(view.records.length).toBe(4);
    expect(view.summary.scheduledOpportunities.planned).toBe(2);
  });

  it("uses the current date for an all-time view with no source dates", () => {
    expect(projectProgressPeriod({
      period: "all_time",
      nowLocalDate: "2026-08-24",
      periodInputs: [],
      comparableExposures: [],
      scheduledOpportunities: [],
      attention: [],
    }).window).toEqual({ start: "2026-08-24", end: "2026-08-24" });
  });
});

describe("projectStrengthComparableFacts", () => {
  it("keeps only effective completed comparable working sets and fences stale recommendations", () => {
    const record = exposure({
      sessionId: "strength-session",
      localDate: "2026-10-12",
      setId: "working-set",
      completedAtMs: 12,
      reps: 10,
    });
    const metricExposure = {
      exerciseId: "bench-press",
      identity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
      target,
      observation: { version: 1, profile: "load_reps", loadGrams: 40_000, reps: 10, source: "manual" },
      sessionStatus: "completed" as const,
      setKind: "working" as const,
      setStatus: "completed" as const,
      plannedWorkingSets: 1,
      completedWorkingSets: 1,
    } as const;

    expect(projectStrengthComparableFacts([
      {
        record,
        metricExposure,
        effectiveRevision: 4,
        targetRevision: 3,
        recommendation: { status: "pending", sourceRevision: 4, targetRevision: 3 },
      },
      {
        record: { ...record, setId: "warmup-set" },
        metricExposure: { ...metricExposure, setKind: "warmup" },
        effectiveRevision: 4,
        targetRevision: 3,
      },
      {
        record: { ...record, setId: "stale-recommendation" },
        metricExposure,
        effectiveRevision: 5,
        targetRevision: 3,
        recommendation: { status: "pending", sourceRevision: 4, targetRevision: 3 },
      },
      {
        record: { ...record, setId: "invalid-revision" },
        metricExposure,
        effectiveRevision: 0,
        targetRevision: 3,
      },
      {
        record: { ...record, setId: "invalid-target-revision" },
        metricExposure,
        effectiveRevision: 4,
        targetRevision: 0,
      },
      {
        record: { ...record, setId: "z-incompatible-generation" },
        metricExposure: {
          ...metricExposure,
          identity: { ...metricExposure.identity, exerciseMetricGeneration: 2 },
        },
        effectiveRevision: 4,
        targetRevision: 3,
      },
    ])).toEqual([record]);
  });
});

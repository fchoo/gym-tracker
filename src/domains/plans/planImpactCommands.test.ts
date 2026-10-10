import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import type {
  DayRemovalRepositoryPreview,
  PlanImpactCommittedResult,
  PlanImpactRepository,
  ExerciseReplacementRepositoryPreview,
} from "../../platform/sqlite/repositories/planImpactRepository";
import type {
  ApplySessionExerciseEditsToPlanInput as StagedSessionExerciseEditsToPlanInput,
} from "../../platform/sqlite/repositories/ownedPlanRepository";
import {
  PlanImpactInputError,
  previewDayRemoval,
  previewExerciseReplacement,
  previewSessionExerciseEditsForPlan,
  applySessionExerciseEditsToPlan,
  removePlanDayWithImpact,
  replacePlanExercise,
  type DayRemovalPreview,
  type ExerciseReplacementCommandResult,
  type ExerciseReplacementPreview,
  type RemovePlanDayWithImpactInput,
  type ReplacePlanExerciseInput,
} from "./planImpactCommands";

const sha256 = async (): Promise<string> => "a".repeat(64);
const nowMs = () => 500;
const identity = {
  profile: "load_reps" as const,
  contractVersion: 1,
  exerciseMetricGeneration: 1,
};

const writeBackTarget = {
  profile: "load_reps" as const,
  version: 1 as const,
  loadGrams: 20_000,
  minReps: 8,
  maxReps: 12,
  incrementGrams: 2_500,
  perSide: false,
};

const writeBackUnits = {
  version: 1,
  load: "grams",
  count: "repetitions",
};
const writeBackPerRepTiming = {
  version: 1 as const,
  mode: "per_rep" as const,
  intervalMs: 1_200,
  cueChannels: "audio" as const,
};
const writeBackClusterTiming = {
  version: 1 as const,
  mode: "cluster" as const,
  groupSizes: [3, 3] as const,
  intraRestMs: 20_000,
  cueChannels: "both" as const,
};

const sessionWriteBackFacts = {
  session: {
    id: "session-edited",
    planId: "plan-owner",
    planDayId: "day-owner",
    planName: "Owner Strength",
    dayName: "Strength Day",
    revision: 7,
    source: "scheduled_day" as const,
    status: "completed" as const,
    modifiedFromPlan: true,
  },
  day: {
    id: "day-owner",
    name: "Strength Day",
    planId: "plan-owner",
    planRevision: 4,
    occurrences: [{
      occurrenceId: "owned-squat",
      exerciseId: "exercise-squat",
      ordinal: 0,
      restSeconds: 90,
      metricIdentity: identity,
      warmups: [],
      targets: [{ ordinal: 0, target: writeBackTarget, units: writeBackUnits }],
      policy: {
        kind: "automatic" as const,
        policyId: "load_reps.double_progression.v1",
        version: 1,
        rule: {
          kind: "automatic",
          id: "load_reps.double_progression.v1",
          version: 1,
        },
      },
    }, {
      occurrenceId: "owned-deadlift",
      exerciseId: "exercise-deadlift",
      ordinal: 1,
      restSeconds: 120,
      metricIdentity: identity,
      warmups: [],
      targets: [{ ordinal: 0, target: writeBackTarget, units: writeBackUnits }],
      policy: {
        kind: "automatic" as const,
        policyId: "load_reps.double_progression.v1",
        version: 1,
        rule: {
          kind: "automatic",
          id: "load_reps.double_progression.v1",
          version: 1,
        },
      },
    }, {
      occurrenceId: "owned-press",
      exerciseId: "exercise-press",
      ordinal: 2,
      restSeconds: 90,
      metricIdentity: identity,
      warmups: [],
      targets: [{ ordinal: 0, target: writeBackTarget, units: writeBackUnits }],
      policy: {
        kind: "automatic" as const,
        policyId: "load_reps.double_progression.v1",
        version: 1,
        rule: {
          kind: "automatic",
          id: "load_reps.double_progression.v1",
          version: 1,
        },
      },
    }],
  },
  sessionExercises: [{
    sessionExerciseId: "session-squat",
    exerciseId: "exercise-squat",
    displayOrdinal: 0,
    sourceOccurrenceId: "owned-squat",
    restSeconds: 90,
    metricIdentity: identity,
    targets: [{ ordinal: 0, target: writeBackTarget, units: writeBackUnits }],
  }, {
    sessionExerciseId: "session-bench",
    exerciseId: "exercise-bench",
    displayOrdinal: 0,
    sourceOccurrenceId: null,
    restSeconds: 75,
    metricIdentity: identity,
    targets: [{ ordinal: 0, target: { ...writeBackTarget, loadGrams: 0, minReps: 8, maxReps: 8 }, units: writeBackUnits }],
  }, {
    sessionExerciseId: "session-row",
    exerciseId: "exercise-row",
    displayOrdinal: 1,
    sourceOccurrenceId: null,
    restSeconds: 60,
    metricIdentity: identity,
    targets: [{ ordinal: 0, target: { ...writeBackTarget, loadGrams: 0, minReps: 8, maxReps: 8 }, units: writeBackUnits }],
  }, {
    sessionExerciseId: "session-deadlift",
    exerciseId: "exercise-deadlift",
    displayOrdinal: 2,
    sourceOccurrenceId: "owned-deadlift",
    restSeconds: 120,
    metricIdentity: identity,
    targets: [{ ordinal: 0, target: writeBackTarget, units: writeBackUnits }],
  }, {
    sessionExerciseId: "session-press",
    exerciseId: "exercise-press",
    displayOrdinal: 3,
    sourceOccurrenceId: "owned-press",
    restSeconds: 90,
    metricIdentity: identity,
    targets: [{ ordinal: 0, target: writeBackTarget, units: writeBackUnits }],
  }],
  edits: [{
    operation: "replace_exercise" as const,
    subjectSessionExerciseId: "session-squat",
    replacementSessionExerciseId: "session-bench",
  }, {
    operation: "remove_exercise" as const,
    subjectSessionExerciseId: "session-press",
    replacementSessionExerciseId: null,
  }],
};

const repositoryPreview: ExerciseReplacementRepositoryPreview = {
  planId: "plan-owner",
  planName: "Owner Strength",
  planRevision: 4,
  sourceOccurrenceId: "occurrence-bench-a",
  sourceExerciseId: "exercise-bench",
  sourceExerciseName: "Bench Press",
  sourceMetricIdentity: identity,
  hasInProgressWorkout: true,
  candidates: [
    {
      exerciseId: "exercise-incompatible",
      name: "A Incompatible Press",
      metricIdentity: {
        ...identity,
        exerciseMetricGeneration: 2,
      },
      exerciseRevision: 3,
      libraryRevision: 3,
    },
    {
      exerciseId: "exercise-compatible-z",
      name: "Z Press",
      metricIdentity: identity,
      exerciseRevision: 2,
      libraryRevision: 2,
    },
    {
      exerciseId: "exercise-compatible-a",
      name: "Incline Press",
      metricIdentity: identity,
      exerciseRevision: 5,
      libraryRevision: 5,
    },
  ],
  occurrences: [
    {
      occurrenceId: "occurrence-bench-a",
      occurrenceRevision: 2,
      dayId: "day-a",
      dayName: "Upper A",
      dayRevision: 3,
      dayOrdinal: 0,
      occurrenceOrdinal: 0,
      restSeconds: 90,
      warmups: [{
        id: "warmup-a",
        revision: 2,
        ordinal: 0,
        loadGrams: 10_000,
        reps: 5,
      }],
      targets: [{
        id: "target-a",
        revision: 4,
        ordinal: 0,
        target: {
          profile: "load_reps",
          version: 1,
          loadGrams: 20_000,
          minReps: 8,
          maxReps: 12,
          incrementGrams: 2_500,
          perSide: false,
        },
        units: {
          version: 1,
          load: "grams",
          count: "repetitions",
        },
      }],
      policy: {
        id: "policy-a",
        revision: 3,
        kind: "manual_hold",
        policyId: "load_reps.manual_hold.v1",
        version: 1,
        rule: {
          kind: "manual_hold",
          id: "load_reps.manual_hold.v1",
          version: 1,
        },
      },
    },
    {
      occurrenceId: "occurrence-bench-b",
      occurrenceRevision: 4,
      dayId: "day-b",
      dayName: "Upper B",
      dayRevision: 5,
      dayOrdinal: 1,
      occurrenceOrdinal: 2,
      restSeconds: 120,
      warmups: [],
      targets: [{
        id: "target-b",
        revision: 6,
        ordinal: 0,
        target: {
          profile: "load_reps",
          version: 1,
          loadGrams: 25_000,
          minReps: 6,
          maxReps: 10,
          incrementGrams: 2_500,
          perSide: false,
        },
        units: {
          version: 1,
          load: "grams",
          count: "repetitions",
        },
      }],
      policy: {
        id: "policy-b",
        revision: 7,
        kind: "manual_hold",
        policyId: "load_reps.manual_hold.v1",
        version: 1,
        rule: {
          kind: "manual_hold",
          id: "load_reps.manual_hold.v1",
          version: 1,
        },
      },
    },
  ],
};

const dayRemovalFacts: DayRemovalRepositoryPreview = {
  planId: "plan-owner",
  planName: "Owner Strength",
  planRevision: 4,
  currentDayCount: 2,
  dayId: "day-a",
  dayName: "Upper A",
  dayRevision: 3,
  dayOrdinal: 0,
  hasInProgressWorkout: false,
  schedule: {
    id: "schedule-owner",
    revision: 7,
    lifecycle: "active",
    version: {
      id: "schedule-version-3",
      versionNumber: 3,
      effectiveLocalDate: "2026-08-20",
      mode: "weekday",
      timeZone: "Asia/Singapore",
      rotationPointer: null,
      bindings: [{
        id: "binding-a",
        ordinal: 0,
        weekIndex: null,
        weekday: null,
        planDayId: "day-a",
      }],
    },
  },
  affectedOverrides: [{
    id: "override-a",
    localDate: "2026-08-21",
    revision: 2,
  }],
  replacementDays: [{
    id: "day-b",
    name: "Upper B",
    revision: 5,
  }],
};

function repository(
  changes: Partial<PlanImpactRepository> = {},
): PlanImpactRepository {
  return {
    readCommandResult: jest.fn(async () => null),
    readDayRemoval: jest.fn(async () => null),
    applyDayRemoval: jest.fn(async () => {
      throw new Error("unexpected_day_removal");
    }),
    readExerciseReplacement: jest.fn(async () => repositoryPreview),
    readCommittedExerciseReplacement: jest.fn(async () => null),
    applyExerciseReplacement: jest.fn<
      PlanImpactRepository["applyExerciseReplacement"]
    >(async (input) => ({
      outcome: "committed" as const,
      planId: input.planId,
      planRevision: input.expectedPlanRevision + 1,
      replacementExerciseId: input.replacementExerciseId,
      affectedOccurrenceIds: input.occurrences.map(
        ({ occurrenceId }) => occurrenceId,
      ),
      currentWorkoutUnaffected: repositoryPreview.hasInProgressWorkout,
      invalidations: [
        "library:plans",
        `plan:${input.planId}`,
        `exercise:${repositoryPreview.sourceExerciseId}`,
        `exercise:${input.replacementExerciseId}`,
        "today",
      ],
    })),
    ...changes,
  };
}

function dayRepository(
  changes: Partial<PlanImpactRepository> = {},
): PlanImpactRepository {
  return repository({
    readDayRemoval: jest.fn(async () => dayRemovalFacts),
    applyDayRemoval: jest.fn<
      PlanImpactRepository["applyDayRemoval"]
    >(async (input) => ({
      outcome: "committed",
      planId: input.planId,
      planRevision: input.expectedPlanRevision + 1,
      scheduleRevision: input.expectedScheduleRevision + 1,
      currentWorkoutUnaffected: false,
      invalidations: [
        "library:plans",
        `plan:${input.planId}`,
        "schedule:schedule-owner",
        "today",
      ],
    })),
    ...changes,
  });
}

async function dayPreview(
  repo: PlanImpactRepository = dayRepository(),
  nowMs = Date.parse("2026-08-19T01:00:00+08:00"),
): Promise<DayRemovalPreview> {
  return previewDayRemoval({
    repository: repo,
    sha256,
    nowMs: () => nowMs,
    input: {
      planId: dayRemovalFacts.planId,
      dayId: dayRemovalFacts.dayId,
    },
  });
}

function dayCommandInput(
  preview: DayRemovalPreview,
  changes: Partial<RemovePlanDayWithImpactInput> = {},
): RemovePlanDayWithImpactInput {
  return {
    requestId: "remove-day",
    planId: preview.planId,
    dayId: preview.dayId,
    expectedPlanRevision: preview.planRevision,
    expectedScheduleRevision: preview.schedule!.revision,
    previewToken: preview.previewToken,
    choice: { kind: "remove_binding" },
    ...changes,
  };
}

async function replacementPreview(
  repo: PlanImpactRepository = repository(),
): Promise<ExerciseReplacementPreview> {
  return previewExerciseReplacement({
    repository: repo,
    sha256,
    input: {
      planId: repositoryPreview.planId,
      occurrenceId: repositoryPreview.sourceOccurrenceId,
    },
  });
}

function commandInput(
  preview: ExerciseReplacementPreview,
  changes: Partial<ReplacePlanExerciseInput> = {},
): ReplacePlanExerciseInput {
  return {
    requestId: "replace-bench",
    planId: preview.planId,
    sourceOccurrenceId: preview.sourceOccurrenceId,
    expectedPlanRevision: preview.planRevision,
    previewToken: preview.previewToken,
    scope: "all_occurrences",
    replacementExerciseId: "exercise-compatible-a",
    review: {
      targets: true,
      warmups: true,
      rest: true,
      progression: true,
      historyImmutable: true,
    },
    occurrences: preview.occurrences,
    ...changes,
  };
}

const incompleteReviews: [
  string,
  ReplacePlanExerciseInput["review"],
][] = [
  ["targets", {
    targets: false,
    warmups: true,
    rest: true,
    progression: true,
    historyImmutable: true,
  }],
  ["warmups", {
    targets: true,
    warmups: false,
    rest: true,
    progression: true,
    historyImmutable: true,
  }],
  ["rest", {
    targets: true,
    warmups: true,
    rest: false,
    progression: true,
    historyImmutable: true,
  }],
  ["progression", {
    targets: true,
    warmups: true,
    rest: true,
    progression: false,
    historyImmutable: true,
  }],
  ["history", {
    targets: true,
    warmups: true,
    rest: true,
    progression: true,
    historyImmutable: false,
  }],
];

describe("D-52/D-53 exercise replacement commands", () => {
  it("sorts complete-identity compatible candidates first and previews all source occurrences", async () => {
    const preview = await replacementPreview();

    expect(preview.currentWorkoutUnaffected).toBe(true);
    expect(preview.candidates.map(({ exerciseId, compatible }) => ({
      exerciseId,
      compatible,
    }))).toEqual([
      { exerciseId: "exercise-compatible-a", compatible: true },
      { exerciseId: "exercise-compatible-z", compatible: true },
      { exerciseId: "exercise-incompatible", compatible: false },
    ]);
    expect(preview.occurrences.map(({ occurrenceId }) => occurrenceId))
      .toEqual(["occurrence-bench-a", "occurrence-bench-b"]);
    expect(preview.previewToken).toMatch(
      /^plan-impact-v1:[a-f0-9]{64}$/u,
    );
  });

  it("uses stable exercise IDs beneath complete compatibility and skips invalidation for replay", async () => {
    const tied = {
      ...repositoryPreview,
      candidates: [
        {
          ...repositoryPreview.candidates[1]!,
          exerciseId: "exercise-compatible-b",
          name: "Same Name",
        },
        {
          ...repositoryPreview.candidates[2]!,
          exerciseId: "exercise-compatible-a",
          name: "Same Name",
        },
        {
          ...repositoryPreview.candidates[0]!,
          metricIdentity: {
            ...identity,
            contractVersion: 2,
          },
        },
        {
          ...repositoryPreview.candidates[0]!,
          exerciseId: "exercise-profile-mismatch",
          metricIdentity: {
            ...identity,
            profile: "timed_hold" as const,
          },
        },
      ],
    };
    const replay: ExerciseReplacementCommandResult = {
      outcome: "already_committed",
      planId: tied.planId,
      planRevision: 5,
      replacementExerciseId: "exercise-compatible-a",
      affectedOccurrenceIds: tied.occurrences.map(
        ({ occurrenceId }) => occurrenceId,
      ),
      currentWorkoutUnaffected: true,
      invalidations: [],
    };
    const repo = repository({
      readExerciseReplacement: jest.fn(async () => tied),
      readCommittedExerciseReplacement: jest.fn(async () => replay),
      applyExerciseReplacement: jest.fn(async () => replay),
    });
    const preview = await replacementPreview(repository({
      readExerciseReplacement: jest.fn(async () => tied),
    }));
    const invalidate = jest.fn(async () => undefined);

    expect(preview.candidates.map(({ exerciseId }) => exerciseId)).toEqual([
      "exercise-compatible-a",
      "exercise-compatible-b",
      "exercise-incompatible",
      "exercise-profile-mismatch",
    ]);
    await expect(replacePlanExercise({
      repository: repo,
      sha256,
      nowMs,
      invalidate,
      input: commandInput(preview, {
        replacementExerciseId: "exercise-compatible-a",
      }),
    })).resolves.toBe(replay);
    expect(invalidate).not.toHaveBeenCalled();
    expect(repo.readExerciseReplacement).not.toHaveBeenCalled();
  });

  it.each(incompleteReviews)(
    "rejects an unreviewed %s section",
    async (_section, review) => {
    const preview = await replacementPreview();
    await expect(replacePlanExercise({
      repository: repository(),
      sha256,
      nowMs,
      invalidate: async () => undefined,
      input: commandInput(preview, { review }),
    })).rejects.toMatchObject({
      code: "plan_impact_review_incomplete",
    });
    },
  );

  it("requires an exact scope occurrence set and complete metric compatibility", async () => {
    const preview = await replacementPreview();
    await expect(replacePlanExercise({
      repository: repository(),
      sha256,
      nowMs,
      invalidate: async () => undefined,
      input: commandInput(preview, {
        scope: "this_occurrence",
      }),
    })).rejects.toMatchObject({
      code: "plan_impact_occurrences_incomplete",
    });
    await expect(replacePlanExercise({
      repository: repository(),
      sha256,
      nowMs,
      invalidate: async () => undefined,
      input: commandInput(preview, {
        replacementExerciseId: "exercise-incompatible",
      }),
    })).rejects.toMatchObject({
      code: "plan_impact_replacement_incompatible",
    });
  });

  it("submits complete reviewed values and invalidates only after commit", async () => {
    const applyExerciseReplacement = jest.fn<
      PlanImpactRepository["applyExerciseReplacement"]
    >(async (input) => ({
      outcome: "committed",
      planId: input.planId,
      planRevision: 5,
      replacementExerciseId: input.replacementExerciseId,
      affectedOccurrenceIds: input.occurrences.map(
        ({ occurrenceId }) => occurrenceId,
      ),
      currentWorkoutUnaffected: true,
      invalidations: [
        "library:plans",
        "plan:plan-owner",
        "exercise:exercise-bench",
        "exercise:exercise-compatible-a",
        "today",
      ],
    }));
    const invalidations: string[][] = [];
    const repo = repository({ applyExerciseReplacement });
    const preview = await replacementPreview(repo);

    const result = await replacePlanExercise({
      repository: repo,
      sha256,
      nowMs,
      invalidate: async (keys) => {
        invalidations.push([...keys]);
      },
      input: commandInput(preview),
    });

    expect(result.outcome).toBe("committed");
    expect(applyExerciseReplacement).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedPlanRevision: 4,
        replacementExerciseId: "exercise-compatible-a",
        scope: "all_occurrences",
        occurrences: repositoryPreview.occurrences,
      }),
    );
    expect(invalidations).toEqual([result.invalidations]);

    await expect(replacePlanExercise({
      repository: repo,
      sha256,
      nowMs,
      invalidate: async () => {
        throw new Error("ignored_invalidation_failure");
      },
      input: commandInput(preview),
    })).resolves.toMatchObject({ outcome: "committed" });
  });

  it("rejects invalid identifiers, revisions, tokens, stale previews, and malformed hashes", async () => {
    const preview = await replacementPreview();
    const base = commandInput(preview);
    const invalidCases: readonly [Partial<ReplacePlanExerciseInput>, string][] = [
      [{ requestId: "" }, "plan_impact_identifier_invalid"],
      [{ expectedPlanRevision: 0 }, "plan_impact_revision_invalid"],
      [{ previewToken: "stale" }, "plan_impact_preview_stale"],
    ];
    for (const [changes, code] of invalidCases) {
      await expect(replacePlanExercise({
        repository: repository(),
        sha256,
        nowMs,
        invalidate: async () => undefined,
        input: { ...base, ...changes },
      })).rejects.toMatchObject({ code });
    }
    await expect(replacePlanExercise({
      repository: repository(),
      sha256,
      nowMs: () => -1,
      invalidate: async () => undefined,
      input: base,
    })).rejects.toMatchObject({ code: "plan_impact_date_invalid" });
    await expect(previewExerciseReplacement({
      repository: repository({
        readExerciseReplacement: jest.fn(async () => null),
      }),
      sha256,
      input: {
        planId: repositoryPreview.planId,
        occurrenceId: repositoryPreview.sourceOccurrenceId,
      },
    })).rejects.toBeInstanceOf(PlanImpactInputError);
    await expect(previewExerciseReplacement({
      repository: repository(),
      sha256: async () => "invalid",
      input: {
        planId: repositoryPreview.planId,
        occurrenceId: repositoryPreview.sourceOccurrenceId,
      },
    })).rejects.toMatchObject({ code: "plan_impact_hash_invalid" });
    await expect(previewExerciseReplacement({
      repository: repository(),
      sha256,
      input: {
        planId: "",
        occurrenceId: repositoryPreview.sourceOccurrenceId,
      },
    })).rejects.toMatchObject({
      code: "plan_impact_identifier_invalid",
    });
    await expect(replacePlanExercise({
      repository: repository({
        readExerciseReplacement: jest.fn(async () => null),
      }),
      sha256,
      nowMs,
      invalidate: async () => undefined,
      input: base,
    })).rejects.toMatchObject({
      code: "plan_impact_replacement_invalid",
    });
    await expect(replacePlanExercise({
      repository: repository({
        readExerciseReplacement: jest.fn(async () => ({
          ...repositoryPreview,
          planRevision: 5,
        })),
      }),
      sha256,
      nowMs,
      invalidate: async () => undefined,
      input: base,
    })).rejects.toMatchObject({ code: "plan_impact_preview_stale" });
    await expect(replacePlanExercise({
      repository: repository(),
      sha256,
      nowMs,
      invalidate: async () => undefined,
      input: commandInput(preview, {
        replacementExerciseId: "missing-candidate",
      }),
    })).rejects.toMatchObject({
      code: "plan_impact_replacement_incompatible",
    });
    await expect(replacePlanExercise({
      repository: repository(),
      sha256,
      nowMs,
      invalidate: async () => undefined,
      input: commandInput(preview, {
        occurrences: preview.occurrences.map((occurrence, index) => ({
          ...occurrence,
          ...(index === 0 ? { restSeconds: 999 } : {}),
        })),
      }),
    })).rejects.toMatchObject({
      code: "plan_impact_occurrences_incomplete",
    });
  });
});

describe("D-01/D-02 session exercise write-back preview", () => {
  it("canonicalizes one edited completed owned session into its final manual and planned composition", async () => {
    const readSessionExerciseEditsForPlan = jest.fn(async () =>
      sessionWriteBackFacts
    );

    const preview = await previewSessionExerciseEditsForPlan({
      repository: { readSessionExerciseEditsForPlan },
      sha256,
      input: { sessionId: "session-edited" },
    });

    expect(preview).toMatchObject({
      kind: "session_exercise_edits",
      sourceSessionId: "session-edited",
      planId: "plan-owner",
      planDayId: "day-owner",
      expectedPlanRevision: 4,
      currentWorkoutUnaffected: true,
      composition: [{
        source: "manual",
        sessionExerciseId: "session-bench",
        exerciseId: "exercise-bench",
        ordinal: 0,
        policy: {
          kind: "manual_hold",
          policyId: "load_reps.manual_hold.v1",
        },
      }, {
        source: "manual",
        sessionExerciseId: "session-row",
        exerciseId: "exercise-row",
        ordinal: 1,
      }, {
        source: "planned",
        sourceOccurrenceId: "owned-deadlift",
        sessionExerciseId: "session-deadlift",
        exerciseId: "exercise-deadlift",
        ordinal: 2,
      }],
    });
    expect(preview).not.toBeNull();
    expect(preview!.previewToken).toMatch(/^session-writeback-v1:[a-f0-9]{64}$/u);
    expect(readSessionExerciseEditsForPlan).toHaveBeenCalledWith({
      sessionId: "session-edited",
    });
  });

  it("emits source-derived typed current and proposed target rows without formatted-string comparisons", async () => {
    const changedTarget = {
      ...writeBackTarget,
      loadGrams: 22_500,
      minReps: 9,
      maxReps: 9,
    };
    const facts = {
      ...sessionWriteBackFacts,
      sessionExercises: sessionWriteBackFacts.day.occurrences.map((occurrence) => ({
        sessionExerciseId: `session-${occurrence.occurrenceId}`,
        exerciseId: occurrence.exerciseId,
        displayOrdinal: occurrence.ordinal,
        sourceOccurrenceId: occurrence.occurrenceId,
        restSeconds: occurrence.restSeconds,
        metricIdentity: occurrence.metricIdentity,
        targets: occurrence.occurrenceId === "owned-squat"
          ? [{ ...occurrence.targets[0]!, target: changedTarget }]
          : occurrence.targets,
      })),
      edits: [],
    };

    const preview = await previewSessionExerciseEditsForPlan({
      repository: { readSessionExerciseEditsForPlan: jest.fn(async () => facts) },
      sha256,
      input: { sessionId: "session-edited" },
    });

    expect(preview).toMatchObject({
      changes: [{
        exerciseId: "exercise-squat",
        targetOrdinal: 0,
        metricIdentity: identity,
        current: { target: writeBackTarget, units: writeBackUnits },
        proposed: { target: changedTarget, units: writeBackUnits },
      }],
    });
  });

  it("returns no aggregate for excluded or composition-restored sessions and binds final order", async () => {
    const baseline = {
      ...sessionWriteBackFacts,
      sessionExercises: sessionWriteBackFacts.day.occurrences.map((occurrence) => ({
        sessionExerciseId: `session-${occurrence.occurrenceId}`,
        exerciseId: occurrence.exerciseId,
        displayOrdinal: occurrence.ordinal,
        sourceOccurrenceId: occurrence.occurrenceId,
        restSeconds: occurrence.restSeconds,
        metricIdentity: occurrence.metricIdentity,
        targets: occurrence.targets,
      })),
      edits: [],
    };
    const unchanged = await previewSessionExerciseEditsForPlan({
      repository: {
        readSessionExerciseEditsForPlan: jest.fn(async () => baseline),
      },
      sha256,
      input: { sessionId: "session-edited" },
    });
    expect(unchanged).toBeNull();

    const warmupBaseline = {
      ...sessionWriteBackFacts,
      day: {
        ...sessionWriteBackFacts.day,
        occurrences: sessionWriteBackFacts.day.occurrences.map((occurrence) =>
          occurrence.occurrenceId === "owned-deadlift"
            ? {
                ...occurrence,
                warmups: [{
                  ordinal: 0,
                  loadGrams: 10_000,
                  reps: 5,
                  advancedTimingOverride: null,
                }],
              }
            : occurrence
        ),
      },
      sessionExercises: sessionWriteBackFacts.day.occurrences.map((occurrence) => ({
        sessionExerciseId: `session-${occurrence.occurrenceId}`,
        exerciseId: occurrence.exerciseId,
        displayOrdinal: occurrence.ordinal,
        sourceOccurrenceId: occurrence.occurrenceId,
        restSeconds: occurrence.restSeconds,
        metricIdentity: occurrence.metricIdentity,
        warmups: occurrence.occurrenceId === "owned-deadlift"
          ? [{
              ordinal: 0,
              loadGrams: 10_000,
              reps: 5,
              advancedTimingOverride: null,
            }]
          : [],
        targets: occurrence.targets,
      })),
      edits: [],
    };
    await expect(previewSessionExerciseEditsForPlan({
      repository: {
        readSessionExerciseEditsForPlan: jest.fn(async () => warmupBaseline),
      },
      sha256,
      input: { sessionId: "session-edited" },
    })).resolves.toBeNull();

    const unedited = await previewSessionExerciseEditsForPlan({
      repository: {
        readSessionExerciseEditsForPlan: jest.fn(async () => ({
          ...sessionWriteBackFacts,
          session: { ...sessionWriteBackFacts.session, modifiedFromPlan: false },
        })),
      },
      sha256,
      input: { sessionId: "session-edited" },
    });
    expect(unedited).toBeNull();

    const orderSensitiveSha = async (value: string): Promise<string> => {
      const parsed = JSON.parse(value) as {
        composition?: readonly Readonly<{ sessionExerciseId: string }>[];
      };
      return parsed.composition?.[0]?.sessionExerciseId === "session-deadlift"
        ? "c".repeat(64)
        : "a".repeat(64);
    };
    const ordered = await previewSessionExerciseEditsForPlan({
      repository: {
        readSessionExerciseEditsForPlan: jest.fn(async () => sessionWriteBackFacts),
      },
      sha256: orderSensitiveSha,
      input: { sessionId: "session-edited" },
    });
    const reorderedReceipts = await previewSessionExerciseEditsForPlan({
      repository: {
        readSessionExerciseEditsForPlan: jest.fn(async () => ({
          ...sessionWriteBackFacts,
          edits: [...sessionWriteBackFacts.edits].reverse(),
        })),
      },
      sha256: orderSensitiveSha,
      input: { sessionId: "session-edited" },
    });
    const reordered = await previewSessionExerciseEditsForPlan({
      repository: {
        readSessionExerciseEditsForPlan: jest.fn(async () => ({
          ...sessionWriteBackFacts,
          sessionExercises: sessionWriteBackFacts.sessionExercises.map((entry) =>
            entry.sessionExerciseId === "session-deadlift"
              ? { ...entry, displayOrdinal: 0 }
              : entry.sessionExerciseId === "session-bench"
                ? { ...entry, displayOrdinal: 2 }
                : entry
          ),
          edits: sessionWriteBackFacts.edits,
        })),
      },
      sha256: orderSensitiveSha,
      input: { sessionId: "session-edited" },
    });

    expect(ordered?.previewToken).toBe(reorderedReceipts?.previewToken);
    expect(ordered?.previewToken).not.toBe(reordered?.previewToken);
    expect(reordered?.composition.map(({ sessionExerciseId }) => sessionExerciseId))
      .toEqual(["session-deadlift", "session-row", "session-bench"]);

    const sameOrdinal = await previewSessionExerciseEditsForPlan({
      repository: {
        readSessionExerciseEditsForPlan: jest.fn(async () => ({
          ...sessionWriteBackFacts,
          sessionExercises: sessionWriteBackFacts.sessionExercises.map((entry) =>
            entry.sessionExerciseId === "session-row"
              ? { ...entry, displayOrdinal: 0 }
              : entry
          ),
        })),
      },
      sha256: orderSensitiveSha,
      input: { sessionId: "session-edited" },
    });
    expect(sameOrdinal?.composition.map(({ sessionExerciseId }) => sessionExerciseId))
      .toEqual(["session-bench", "session-row", "session-deadlift"]);
  });

  it("preserves explicit timing defaults and nullable set overrides in write-back previews", async () => {
    const timingFacts = {
      ...sessionWriteBackFacts,
      day: {
        ...sessionWriteBackFacts.day,
        occurrences: sessionWriteBackFacts.day.occurrences.map((occurrence) =>
          occurrence.occurrenceId === "owned-deadlift"
            ? {
                ...occurrence,
                advancedTimingDefault: writeBackPerRepTiming,
                targets: [{
                  ...occurrence.targets[0]!,
                  advancedTimingOverride: null,
                }],
              }
            : occurrence
        ),
      },
      sessionExercises: sessionWriteBackFacts.sessionExercises.map((exercise) =>
        exercise.sessionExerciseId === "session-deadlift"
          ? {
              ...exercise,
              targets: [{
                ...exercise.targets[0]!,
                advancedTimingOverride: writeBackClusterTiming,
              }],
            }
          : exercise
      ),
    };

    const preview = await previewSessionExerciseEditsForPlan({
      repository: {
        readSessionExerciseEditsForPlan: jest.fn(async () => timingFacts),
      },
      sha256,
      input: { sessionId: "session-edited" },
    });

    const deadlift = preview?.composition.find(({ sessionExerciseId }) =>
      sessionExerciseId === "session-deadlift"
    );
    expect(deadlift).toEqual(expect.objectContaining({
      source: "planned",
      advancedTimingDefault: writeBackPerRepTiming,
      targets: [expect.objectContaining({
        advancedTimingOverride: writeBackClusterTiming,
      })],
    }));
  });

  it("canonicalizes planned and manual write-back warmups with explicit timing inheritance", async () => {
    const warmup = {
      ordinal: 0,
      loadGrams: 10_000,
      reps: 5,
      advancedTimingOverride: writeBackClusterTiming,
    };
    const timingFacts = {
      ...sessionWriteBackFacts,
      day: {
        ...sessionWriteBackFacts.day,
        occurrences: sessionWriteBackFacts.day.occurrences.map((occurrence) =>
          occurrence.occurrenceId === "owned-deadlift"
            ? {
                ...occurrence,
                advancedTimingDefault: writeBackPerRepTiming,
                warmups: [warmup],
              }
            : occurrence
        ),
      },
      sessionExercises: sessionWriteBackFacts.sessionExercises.map((exercise) =>
        exercise.sessionExerciseId === "session-bench"
          ? {
              ...exercise,
              warmups: [{
                ordinal: 0,
                loadGrams: 5_000,
                reps: 8,
                advancedTimingOverride: null,
              }],
            }
          : exercise.sessionExerciseId === "session-deadlift"
            ? {
                ...exercise,
                warmups: [{
                  ordinal: 0,
                  loadGrams: 99_000,
                  reps: 1,
                  advancedTimingOverride: null,
                }],
              }
            : exercise
      ),
    };

    const preview = await previewSessionExerciseEditsForPlan({
      repository: {
        readSessionExerciseEditsForPlan: jest.fn(async () => timingFacts),
      },
      sha256,
      input: { sessionId: "session-edited" },
    });

    expect(preview?.composition.find(({ sessionExerciseId }) =>
      sessionExerciseId === "session-bench"
    )?.warmups).toEqual([{
      ordinal: 0,
      loadGrams: 5_000,
      reps: 8,
      advancedTimingOverride: null,
    }]);
    expect(preview?.composition.find(({ sessionExerciseId }) =>
      sessionExerciseId === "session-deadlift"
    )?.warmups).toEqual([warmup]);
  });

  it("fails closed for invalid preview inputs and no-longer-canonical planned facts", async () => {
    await expect(previewSessionExerciseEditsForPlan({
      repository: {
        readSessionExerciseEditsForPlan: jest.fn(async () => sessionWriteBackFacts),
      },
      sha256,
      input: { sessionId: "" },
    })).rejects.toMatchObject({ code: "plan_impact_identifier_invalid" });

    await expect(previewSessionExerciseEditsForPlan({
      repository: {
        readSessionExerciseEditsForPlan: jest.fn(async () => null),
      },
      sha256,
      input: { sessionId: "session-edited" },
    })).resolves.toBeNull();

    for (const facts of [
      {
        ...sessionWriteBackFacts,
        sessionExercises: sessionWriteBackFacts.sessionExercises.map((exercise) =>
          exercise.sessionExerciseId === "session-deadlift"
            ? { ...exercise, sourceOccurrenceId: "missing-occurrence" }
            : exercise
        ),
      },
      {
        ...sessionWriteBackFacts,
        sessionExercises: sessionWriteBackFacts.sessionExercises.map((exercise) =>
          exercise.sessionExerciseId === "session-deadlift"
            ? { ...exercise, exerciseId: "exercise-wrong" }
            : exercise
        ),
      },
      {
        ...sessionWriteBackFacts,
        sessionExercises: sessionWriteBackFacts.sessionExercises.map((exercise) =>
          exercise.sessionExerciseId === "session-deadlift"
            ? {
                ...exercise,
                metricIdentity: {
                  ...exercise.metricIdentity,
                  exerciseMetricGeneration: 2,
                },
              }
            : exercise
        ),
      },
    ]) {
      await expect(previewSessionExerciseEditsForPlan({
        repository: {
          readSessionExerciseEditsForPlan: jest.fn(async () => facts),
        },
        sha256,
        input: { sessionId: "session-edited" },
      })).resolves.toBeNull();
    }

    const plannedWithWarmup = {
      ...sessionWriteBackFacts,
      day: {
        ...sessionWriteBackFacts.day,
        occurrences: sessionWriteBackFacts.day.occurrences.map((occurrence) =>
          occurrence.occurrenceId === "owned-deadlift"
            ? {
                ...occurrence,
                warmups: [{ ordinal: 0, loadGrams: 10_000, reps: 5 }],
              }
            : occurrence
        ),
      },
    };
    const warmupPreview = await previewSessionExerciseEditsForPlan({
      repository: {
        readSessionExerciseEditsForPlan: jest.fn(async () => plannedWithWarmup),
      },
      sha256,
      input: { sessionId: "session-edited" },
    });
    expect(warmupPreview?.composition.find(({ sessionExerciseId }) =>
      sessionExerciseId === "session-deadlift"
    )?.warmups).toEqual([{
      ordinal: 0,
      loadGrams: 10_000,
      reps: 5,
      advancedTimingOverride: null,
    }]);
  });

  it("applies exactly one canonical aggregate only after revalidating its preview", async () => {
    const repository = {
      readSessionExerciseEditsForPlan: jest.fn(async () => sessionWriteBackFacts),
      readSessionExerciseEditsToPlanResult: jest.fn(async () => null),
      applySessionExerciseEditsToPlan: jest.fn(async (
        input: StagedSessionExerciseEditsToPlanInput,
      ) => ({
        outcome: "committed" as const,
        operation: "session_exercise_edits" as const,
        planId: input.planId,
        planRevision: input.expectedPlanRevision + 1,
        sourceSessionId: input.sourceSessionId,
        currentWorkoutUnaffected: true as const,
        invalidations: ["library:plans", `plan:${input.planId}`],
      })),
    };
    const preview = await previewSessionExerciseEditsForPlan({
      repository,
      sha256,
      input: { sessionId: "session-edited" },
    });
    const invalidate = jest.fn(async () => undefined);

    await expect(applySessionExerciseEditsToPlan({
      repository,
      sha256,
      nowMs,
      invalidate,
      input: {
        requestId: "apply-session-edits",
        sourceSessionId: "session-edited",
        expectedPlanRevision: preview!.expectedPlanRevision,
        previewToken: preview!.previewToken,
        composition: preview!.composition,
      },
    })).resolves.toMatchObject({
      outcome: "committed",
      planRevision: 5,
    });
    expect(repository.applySessionExerciseEditsToPlan).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith([
      "library:plans",
      "plan:plan-owner",
    ]);

    await expect(applySessionExerciseEditsToPlan({
      repository,
      sha256,
      nowMs,
      invalidate: async () => undefined,
      input: {
        requestId: "apply-session-edits-stale",
        sourceSessionId: "session-edited",
        expectedPlanRevision: preview!.expectedPlanRevision,
        previewToken: preview!.previewToken,
        composition: preview!.composition.map((entry) => ({
          ...entry,
          ...(entry.ordinal === 0 ? { restSeconds: entry.restSeconds + 1 } : {}),
        })),
      },
    })).rejects.toMatchObject({ code: "plan_impact_preview_stale" });
    expect(repository.applySessionExerciseEditsToPlan).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid, stale, and time-invalid write-back inputs before mutation", async () => {
    const repository = {
      readSessionExerciseEditsForPlan: jest.fn(async () => sessionWriteBackFacts),
      readSessionExerciseEditsToPlanResult: jest.fn(async () => null),
      applySessionExerciseEditsToPlan: jest.fn(async () => {
        throw new Error("write_back_must_not_apply");
      }),
    };
    const preview = await previewSessionExerciseEditsForPlan({
      repository,
      sha256,
      input: { sessionId: "session-edited" },
    });
    if (preview === null) {
      throw new Error("expected_write_back_preview");
    }
    const base = {
      requestId: "apply-session-edits-validation",
      sourceSessionId: preview.sourceSessionId,
      expectedPlanRevision: preview.expectedPlanRevision,
      previewToken: preview.previewToken,
      composition: preview.composition,
    };

    for (const [input, code] of [
      [{ ...base, requestId: "" }, "plan_impact_identifier_invalid"],
      [{ ...base, expectedPlanRevision: 0 }, "plan_impact_revision_invalid"],
      [{ ...base, previewToken: "stale" }, "plan_impact_preview_stale"],
    ] as const) {
      await expect(applySessionExerciseEditsToPlan({
        repository,
        sha256,
        nowMs,
        invalidate: async () => undefined,
        input,
      })).rejects.toMatchObject({ code });
    }

    await expect(applySessionExerciseEditsToPlan({
      repository: {
        ...repository,
        readSessionExerciseEditsForPlan: jest.fn(async () => null),
      },
      sha256,
      nowMs,
      invalidate: async () => undefined,
      input: base,
    })).rejects.toMatchObject({ code: "plan_impact_preview_stale" });

    await expect(applySessionExerciseEditsToPlan({
      repository,
      sha256,
      nowMs: () => -1,
      invalidate: async () => undefined,
      input: base,
    })).rejects.toMatchObject({ code: "plan_impact_date_invalid" });

    const staleFacts = {
      ...sessionWriteBackFacts,
      session: {
        ...sessionWriteBackFacts.session,
        planId: null,
        planDayId: null,
      },
    };
    await expect(applySessionExerciseEditsToPlan({
      repository: {
        ...repository,
        readSessionExerciseEditsForPlan: jest.fn(async () => staleFacts),
      },
      sha256,
      nowMs,
      invalidate: async () => undefined,
      input: base,
    })).rejects.toMatchObject({ code: "plan_impact_preview_stale" });
    expect(repository.applySessionExerciseEditsToPlan).not.toHaveBeenCalled();
  });

  it("swallows only post-commit invalidation failures", async () => {
    const repository = {
      readSessionExerciseEditsForPlan: jest.fn(async () => sessionWriteBackFacts),
      readSessionExerciseEditsToPlanResult: jest.fn(async () => null),
      applySessionExerciseEditsToPlan: jest.fn(async (
        input: StagedSessionExerciseEditsToPlanInput,
      ) => ({
        outcome: "committed" as const,
        operation: "session_exercise_edits" as const,
        planId: input.planId,
        planRevision: input.expectedPlanRevision + 1,
        sourceSessionId: input.sourceSessionId,
        currentWorkoutUnaffected: true as const,
        invalidations: ["library:plans"],
      })),
    };
    const preview = await previewSessionExerciseEditsForPlan({
      repository,
      sha256,
      input: { sessionId: "session-edited" },
    });
    if (preview === null) {
      throw new Error("expected_write_back_preview");
    }
    await expect(applySessionExerciseEditsToPlan({
      repository,
      sha256,
      nowMs,
      invalidate: async () => {
        throw new Error("post_commit_invalidation_failed");
      },
      input: {
        requestId: "apply-session-edits-invalidation",
        sourceSessionId: preview.sourceSessionId,
        expectedPlanRevision: preview.expectedPlanRevision,
        previewToken: preview.previewToken,
        composition: preview.composition,
      },
    })).resolves.toMatchObject({ outcome: "committed" });
  });

  it("returns an already-committed write-back without reading stale facts", async () => {
    const replay = {
      outcome: "already_committed" as const,
      operation: "session_exercise_edits" as const,
      planId: "plan-owner",
      planRevision: 5,
      sourceSessionId: "session-edited",
      currentWorkoutUnaffected: true as const,
      invalidations: [],
    };
    const repository = {
      readSessionExerciseEditsForPlan: jest.fn(async () => {
        throw new Error("replay_must_not_read_facts");
      }),
      readSessionExerciseEditsToPlanResult: jest.fn(async () => replay),
      applySessionExerciseEditsToPlan: jest.fn(async () => {
        throw new Error("replay_must_not_apply");
      }),
    };
    await expect(applySessionExerciseEditsToPlan({
      repository,
      sha256,
      nowMs,
      invalidate: async () => {
        throw new Error("replay_must_not_invalidate");
      },
      input: {
        requestId: "apply-session-edits-replay",
        sourceSessionId: "session-edited",
        expectedPlanRevision: 4,
        previewToken: `session-writeback-v1:${"a".repeat(64)}`,
        composition: [],
      },
    })).resolves.toEqual(replay);
    expect(repository.readSessionExerciseEditsForPlan).not.toHaveBeenCalled();
    expect(repository.applySessionExerciseEditsToPlan).not.toHaveBeenCalled();
  });

  it("does not invalidate an already-committed aggregate returned after revalidation", async () => {
    const repository = {
      readSessionExerciseEditsForPlan: jest.fn(async () => sessionWriteBackFacts),
      readSessionExerciseEditsToPlanResult: jest.fn(async () => null),
      applySessionExerciseEditsToPlan: jest.fn(async (
        input: StagedSessionExerciseEditsToPlanInput,
      ) => ({
        outcome: "already_committed" as const,
        operation: "session_exercise_edits" as const,
        planId: input.planId,
        planRevision: input.expectedPlanRevision + 1,
        sourceSessionId: input.sourceSessionId,
        currentWorkoutUnaffected: true as const,
        invalidations: [],
      })),
    };
    const preview = await previewSessionExerciseEditsForPlan({
      repository,
      sha256,
      input: { sessionId: "session-edited" },
    });
    if (preview === null) {
      throw new Error("expected_write_back_preview");
    }
    const invalidate = jest.fn(async () => undefined);
    await expect(applySessionExerciseEditsToPlan({
      repository,
      sha256,
      nowMs,
      invalidate,
      input: {
        requestId: "apply-session-edits-already-committed",
        sourceSessionId: preview.sourceSessionId,
        expectedPlanRevision: preview.expectedPlanRevision,
        previewToken: preview.previewToken,
        composition: preview.composition,
      },
    })).resolves.toMatchObject({ outcome: "already_committed" });
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("D-32 day removal commands", () => {
  it("renders weekday defaults, rotation labels, and future effective dates", async () => {
    const weekday = await dayPreview();
    expect(weekday.affectedBindings).toEqual([{
      id: "binding-a",
      label: "Week 1 · Unassigned",
      planDayId: "day-a",
    }]);
    expect(weekday.earliestEffectiveLocalDate).toBe("2026-08-21");

    const rotation = await dayPreview(dayRepository({
      readDayRemoval: jest.fn<
        PlanImpactRepository["readDayRemoval"]
      >(async () => ({
        ...dayRemovalFacts,
        schedule: {
          ...dayRemovalFacts.schedule!,
          version: {
            ...dayRemovalFacts.schedule!.version,
            mode: "rotation",
            rotationPointer: 0,
          },
        },
      })),
    }));
    expect(rotation.affectedBindings[0]?.label).toBe("Rotation position 1");

    const today = await dayPreview(
      dayRepository(),
      Date.parse("2026-08-25T01:00:00+08:00"),
    );
    expect(today.earliestEffectiveLocalDate).toBe("2026-08-25");
  });

  const choices: [
    string,
    RemovePlanDayWithImpactInput["choice"],
  ][] = [
    ["replacement", {
      kind: "replacement_day",
      replacementDayId: "day-b",
    }],
    ["remove", { kind: "remove_binding" }],
    ["effective", {
      kind: "effective_date",
      effectiveLocalDate: "2026-08-22",
    }],
  ];

  it.each(choices)("submits the explicit %s choice", async (_name, choice) => {
    const applyDayRemoval = jest.fn<
      PlanImpactRepository["applyDayRemoval"]
    >(async (input) => ({
      outcome: "committed",
      planId: input.planId,
      planRevision: 5,
      scheduleRevision: 8,
      currentWorkoutUnaffected: false,
      invalidations: ["plan:plan-owner"],
    }));
    const repo = dayRepository({ applyDayRemoval });
    const preview = await dayPreview(repo);

    await removePlanDayWithImpact({
      repository: repo,
      sha256,
      invalidate: async () => {
        throw new Error("ignored_invalidation_failure");
      },
      nowMs: () => 42,
      input: dayCommandInput(preview, { choice }),
    });

    expect(applyDayRemoval).toHaveBeenCalledWith(expect.objectContaining({
      choice: choice.kind === "effective_date"
        ? { kind: "effective_date" }
        : choice,
      effectiveLocalDate: choice.kind === "effective_date"
        ? choice.effectiveLocalDate
        : preview.earliestEffectiveLocalDate,
    }));
  });

  it("returns durable replay before re-reading retired facts", async () => {
    const replay: PlanImpactCommittedResult = {
      outcome: "already_committed",
      planId: "plan-owner",
      planRevision: 5,
      scheduleRevision: 8,
      currentWorkoutUnaffected: false,
      invalidations: [],
    };
    const repo = dayRepository({
      readCommandResult: jest.fn(async () => replay),
      readDayRemoval: jest.fn(async () => {
        throw new Error("must_not_read_after_replay");
      }),
    });
    const preview = await dayPreview();

    await expect(removePlanDayWithImpact({
      repository: repo,
      sha256,
      invalidate: async () => undefined,
      nowMs: () => 42,
      input: dayCommandInput(preview),
    })).resolves.toBe(replay);

    const repositoryReplay: PlanImpactCommittedResult = {
      ...replay,
      outcome: "already_committed",
    };
    const applyRepo = dayRepository({
      readCommandResult: jest.fn(async () => null),
      applyDayRemoval: jest.fn(async () => repositoryReplay),
    });
    const invalidate = jest.fn(async () => undefined);
    await expect(removePlanDayWithImpact({
      repository: applyRepo,
      sha256,
      invalidate,
      nowMs: () => 42,
      input: dayCommandInput(preview),
    })).resolves.toBe(repositoryReplay);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("rejects every invalid or stale day-removal boundary", async () => {
    const preview = await dayPreview();
    const base = dayCommandInput(preview);
    const invalidCases: readonly [
      Partial<RemovePlanDayWithImpactInput>,
      string,
    ][] = [
      [{ requestId: "" }, "plan_impact_identifier_invalid"],
      [{ expectedPlanRevision: 0 }, "plan_impact_revision_invalid"],
      [{ previewToken: "stale" }, "plan_impact_preview_stale"],
      [{
        choice: {
          kind: "replacement_day",
          replacementDayId: "",
        },
      }, "plan_impact_replacement_invalid"],
      [{
        choice: {
          kind: "effective_date",
          effectiveLocalDate: "invalid",
        },
      }, "plan_impact_date_invalid"],
      [{
        choice: {
          kind: "effective_date",
          effectiveLocalDate: "2026-08-20",
        },
      }, "plan_impact_date_invalid"],
    ];
    for (const [changes, code] of invalidCases) {
      await expect(removePlanDayWithImpact({
        repository: dayRepository(),
        sha256,
        invalidate: async () => undefined,
        nowMs: () => 42,
        input: { ...base, ...changes },
      })).rejects.toMatchObject({ code });
    }
    await expect(removePlanDayWithImpact({
      repository: dayRepository(),
      sha256,
      invalidate: async () => undefined,
      nowMs: () => -1,
      input: base,
    })).rejects.toMatchObject({ code: "plan_impact_date_invalid" });
    await expect(removePlanDayWithImpact({
      repository: dayRepository({
        readDayRemoval: jest.fn(async () => null),
      }),
      sha256,
      invalidate: async () => undefined,
      nowMs: () => 42,
      input: base,
    })).rejects.toMatchObject({ code: "plan_impact_day_invalid" });
    await expect(removePlanDayWithImpact({
      repository: dayRepository({
        readDayRemoval: jest.fn(async () => ({
          ...dayRemovalFacts,
          planRevision: 5,
        })),
      }),
      sha256,
      invalidate: async () => undefined,
      nowMs: () => 42,
      input: base,
    })).rejects.toMatchObject({ code: "plan_impact_preview_stale" });
    await expect(removePlanDayWithImpact({
      repository: dayRepository({
        readDayRemoval: jest.fn(async () => ({
          ...dayRemovalFacts,
          hasInProgressWorkout: true,
        })),
      }),
      sha256,
      invalidate: async () => undefined,
      nowMs: () => 42,
      input: {
        ...base,
        previewToken: (await dayPreview(dayRepository({
          readDayRemoval: jest.fn(async () => ({
            ...dayRemovalFacts,
            hasInProgressWorkout: true,
          })),
        }))).previewToken,
      },
    })).rejects.toMatchObject({ code: "plan_impact_workout_active" });
    await expect(removePlanDayWithImpact({
      repository: dayRepository(),
      sha256,
      invalidate: async () => undefined,
      nowMs: () => 42,
      input: {
        ...base,
        choice: {
          kind: "replacement_day",
          replacementDayId: "missing-day",
        },
      },
    })).rejects.toMatchObject({
      code: "plan_impact_replacement_invalid",
    });
  });

  it("rejects invalid previews, missing schedules, and malformed hashes", async () => {
    await expect(previewDayRemoval({
      repository: dayRepository(),
      sha256,
      nowMs: () => 42,
      input: { planId: "", dayId: "day-a" },
    })).rejects.toMatchObject({ code: "plan_impact_identifier_invalid" });
    await expect(previewDayRemoval({
      repository: dayRepository({
        readDayRemoval: jest.fn(async () => null),
      }),
      sha256,
      nowMs: () => 42,
      input: { planId: "plan-owner", dayId: "day-a" },
    })).rejects.toMatchObject({ code: "plan_impact_day_invalid" });
    await expect(previewDayRemoval({
      repository: dayRepository(),
      sha256,
      nowMs: () => -1,
      input: { planId: "plan-owner", dayId: "day-a" },
    })).rejects.toMatchObject({ code: "plan_impact_date_invalid" });
    await expect(previewDayRemoval({
      repository: dayRepository({
        readDayRemoval: jest.fn(async () => ({
          ...dayRemovalFacts,
          schedule: null,
        })),
      }),
      sha256,
      nowMs: () => 42,
      input: { planId: "plan-owner", dayId: "day-a" },
    })).rejects.toMatchObject({ code: "plan_impact_schedule_invalid" });
    await expect(previewDayRemoval({
      repository: dayRepository(),
      sha256: async () => "invalid",
      nowMs: () => 42,
      input: { planId: "plan-owner", dayId: "day-a" },
    })).rejects.toMatchObject({ code: "plan_impact_hash_invalid" });
  });
});

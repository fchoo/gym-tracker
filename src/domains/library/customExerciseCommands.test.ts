import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import type {
  CustomExerciseRepository,
  PreviewCustomExerciseArchiveInput,
  StagedCreateCustomCopy,
  StagedCreateCustomExercise,
  StagedEditCustomExercise,
  StagedSetCustomExerciseArchived,
  StagedSetExerciseFavorite,
  StagedSetExerciseHidden,
} from "../../platform/sqlite/repositories/customExerciseRepository";
import {
  archiveCustomExercise,
  createCustomExercise,
  createCustomCopy,
  editCustomExercise,
  previewCustomExerciseArchive,
  restoreCustomExercise,
  setExerciseFavorite,
  setExerciseHidden,
  type CreateCustomExerciseInput,
  type CustomExerciseProgression,
  type SetCustomExerciseArchivedInput,
} from "./customExerciseCommands";

const createInput: CreateCustomExerciseInput = {
  requestId: "request-custom-sled",
  exerciseId: "custom-sled",
  name: "雪橇推进",
  aliases: ["Sled Push"],
  exerciseType: "strongman",
  movementClass: "compound",
  primaryMuscles: ["quadriceps"],
  secondaryMuscles: ["glutes"],
  equipment: ["sled"],
  metricIdentity: {
    profile: "fixed_time",
    contractVersion: 1,
    exerciseMetricGeneration: 1,
  },
  defaultRestSeconds: 75,
  createdAtMs: 1_787_000_000_000,
};

function repository(): CustomExerciseRepository {
  return {
    createCustomExercise: jest.fn(async (
      input: StagedCreateCustomExercise,
    ) => ({
      outcome: "committed" as const,
      exercise: {
        ...input,
        revision: 1,
      },
      progression: input.progression,
      invalidations: [
        "library:exercises",
        `exercise:${input.exerciseId}`,
      ],
    })),
    editCustomExercise: jest.fn(async (
      input: StagedEditCustomExercise,
    ) => ({
      outcome: "committed" as const,
      exercise: {
        ...input,
        revision: input.expectedExerciseRevision + 1,
      },
      progression: input.progression,
      invalidations: [
        "library:exercises",
        `exercise:${input.exerciseId}`,
      ],
    })),
    setExerciseHidden: jest.fn(async (
      input: StagedSetExerciseHidden,
    ) => ({
      outcome: "committed" as const,
      exerciseId: input.exerciseId,
      hidden: input.hidden,
      preferenceRevision: (input.expectedPreferenceRevision ?? 0) + 1,
      invalidations: [
        "library:exercises",
        `exercise:${input.exerciseId}`,
      ],
    })),
    setExerciseFavorite: jest.fn(async (
      input: StagedSetExerciseFavorite,
    ) => ({
      outcome: "committed" as const,
      exerciseId: input.exerciseId,
      favorite: input.favorite,
      preferenceRevision: (input.expectedPreferenceRevision ?? 0) + 1,
      invalidations: [
        "library:exercises",
        `exercise:${input.exerciseId}`,
      ],
    })),
    createCustomCopy: jest.fn(async (
      input: StagedCreateCustomCopy,
    ) => ({
      outcome: "committed" as const,
      exercise: {
        requestId: input.requestId,
        exerciseId: input.exerciseId,
        name: "Squat copy",
        normalizedName: "squat copy",
        aliases: [],
        exerciseType: "strength" as const,
        movementClass: "compound" as const,
        primaryMuscles: ["quadriceps"],
        secondaryMuscles: [],
        equipment: ["barbell"],
        metricIdentity: {
          profile: "load_reps" as const,
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
        defaultRestSeconds: 120,
        revision: 1,
      },
      progression: {
        kind: "manual_hold" as const,
        version: 1 as const,
      },
      invalidations: [
        "library:exercises",
        `exercise:${input.exerciseId}`,
      ],
    })),
    previewCustomExerciseArchive: jest.fn(async (
      input: PreviewCustomExerciseArchiveInput,
    ) => ({
      exerciseId: input.exerciseId,
      exerciseRevision: input.expectedExerciseRevision,
      preferenceRevision: null,
      previewRevision: "preview-1",
      affectedPlans: [{
        planId: "plan-hold",
        planName: "Hold Practice",
        planRevision: 2,
        occurrences: [{
          occurrenceId: "plan-day-exercise-plank",
          occurrenceRevision: 5,
          dayId: "plan-day-hold",
          dayName: "Hold Day",
        }],
      }],
    })),
    setCustomExerciseArchived: jest.fn(async (
      input: StagedSetCustomExerciseArchived,
    ) => ({
      outcome: "committed" as const,
      exerciseId: input.exerciseId,
      archived: input.archived,
      preferenceRevision: (input.expectedPreferenceRevision ?? 0) + 1,
      affectedPlanIds: ["plan-hold"],
      invalidations: [
        "library:exercises",
        `exercise:${input.exerciseId}`,
        "plan:plan-hold",
      ],
    })),
    listExercisePlanReferences: jest.fn(async () => []),
  };
}

describe("D-17/D-33 custom exercise command contracts", () => {
  it("requires an explicit non-default metric identity and saves absent progression as manual Hold", async () => {
    const target = repository();
    const invalidate = jest.fn(async () => undefined);

    const result = await createCustomExercise({
      repository: target,
      invalidate,
      input: createInput,
    });

    expect(target.createCustomExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        metricIdentity: createInput.metricIdentity,
        normalizedName: "雪橇推进",
        aliases: [{
          displayText: "Sled Push",
          normalizedText: "sled push",
        }],
        progression: {
          kind: "manual_hold",
          version: 1,
        },
      }),
    );
    expect(result.progression).toEqual({
      kind: "manual_hold",
      version: 1,
    });
    expect(invalidate).toHaveBeenCalledWith(result.invalidations);
  });

  it.each([
    {
      name: "empty name",
      input: { ...createInput, name: " " },
      code: "custom_exercise_name_invalid",
    },
    {
      name: "missing explicit metric identity",
      input: { ...createInput, metricIdentity: undefined },
      code: "custom_exercise_metric_identity_required",
    },
    {
      name: "load reps inferred from an absent identity",
      input: {
        ...createInput,
        metricIdentity: {
          profile: "load_reps",
          contractVersion: 0,
          exerciseMetricGeneration: 1,
        },
      },
      code: "metric_identity_invalid",
    },
    {
      name: "empty primary taxonomy",
      input: { ...createInput, primaryMuscles: [] },
      code: "custom_exercise_taxonomy_invalid",
    },
    {
      name: "duplicate aliases after normalization",
      input: { ...createInput, aliases: ["Café", "Cafe"] },
      code: "custom_exercise_alias_invalid",
    },
    {
      name: "empty equipment",
      input: { ...createInput, equipment: [] },
      code: "custom_exercise_equipment_invalid",
    },
    {
      name: "unsafe rest",
      input: { ...createInput, defaultRestSeconds: Number.NaN },
      code: "custom_exercise_rest_invalid",
    },
  ])("rejects $name before repository work", async ({ input, code }) => {
    const target = repository();

    await expect(createCustomExercise({
      repository: target,
      invalidate: async () => undefined,
      input: input as CreateCustomExerciseInput,
    })).rejects.toMatchObject({ code });
    expect(target.createCustomExercise).not.toHaveBeenCalled();
  });

  it("accepts single taxonomy/equipment values and validates expected revisions for edit", async () => {
    const target = repository();
    const result = await editCustomExercise({
      repository: target,
      invalidate: async () => undefined,
      input: {
        ...createInput,
        requestId: "request-edit-custom-sled",
        aliases: [],
        primaryMuscles: ["quadriceps"],
        secondaryMuscles: [],
        equipment: ["sled"],
        expectedExerciseRevision: 1,
        editedAtMs: 1_787_000_001_000,
      },
    });

    expect(result.exercise.revision).toBe(2);
    expect(target.editCustomExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedExerciseRevision: 1,
        aliases: [],
      }),
    );
  });

  it("rejects an unsafe edit revision and does not invalidate after repository failure", async () => {
    const target = repository();
    const invalidate = jest.fn(async () => undefined);

    await expect(editCustomExercise({
      repository: target,
      invalidate,
      input: {
        ...createInput,
        requestId: "request-edit-custom-sled",
        expectedExerciseRevision: -1,
        editedAtMs: 1_787_000_001_000,
      },
    })).rejects.toMatchObject({
      code: "custom_exercise_revision_invalid",
    });
    expect(target.editCustomExercise).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("D-27 through D-29 custom exercise lifecycle commands", () => {
  it("validates bundled hide/show revisions and invalidates only after commit", async () => {
    const target = repository();
    const invalidate = jest.fn(async () => undefined);

    const result = await setExerciseHidden({
      repository: target,
      invalidate,
      input: {
        requestId: "hide-squat",
        exerciseId: "exercise-squat",
        expectedPreferenceRevision: null,
        hidden: true,
        updatedAtMs: 1_787_000_002_000,
      },
    });

    expect(target.setExerciseHidden).toHaveBeenCalledWith({
      requestId: "hide-squat",
      exerciseId: "exercise-squat",
      expectedPreferenceRevision: null,
      hidden: true,
      updatedAtMs: 1_787_000_002_000,
    });
    expect(result.preferenceRevision).toBe(1);
    expect(invalidate).toHaveBeenCalledWith(result.invalidations);
  });

  it("validates favorite revisions and invalidates only after commit", async () => {
    const target = repository();
    const invalidate = jest.fn(async () => undefined);

    const result = await setExerciseFavorite({
      repository: target,
      invalidate,
      input: {
        requestId: "favorite-squat",
        exerciseId: "exercise-squat",
        expectedPreferenceRevision: null,
        favorite: true,
        updatedAtMs: 1_787_000_002_500,
      },
    });

    expect(result).toMatchObject({
      favorite: true,
      preferenceRevision: 1,
    });
    expect(invalidate).toHaveBeenCalledWith(result.invalidations);
  });

  it("rejects a non-boolean favorite value before repository work", async () => {
    const target = repository();

    await expect(setExerciseFavorite({
      repository: target,
      invalidate: async () => undefined,
      input: {
        requestId: "favorite-invalid",
        exerciseId: "exercise-squat",
        expectedPreferenceRevision: null,
        favorite: "yes" as unknown as boolean,
        updatedAtMs: 1,
      },
    })).rejects.toMatchObject({
      code: "custom_exercise_identifier_invalid",
    });
    expect(target.setExerciseFavorite).not.toHaveBeenCalled();
  });

  it("creates a fresh custom copy with a distinct requested identity", async () => {
    const target = repository();

    const result = await createCustomCopy({
      repository: target,
      invalidate: async () => undefined,
      input: {
        requestId: "copy-squat",
        sourceExerciseId: "exercise-squat",
        expectedSourceRevision: 2,
        exerciseId: "custom-squat-copy",
        name: "Squat copy",
        createdAtMs: 1_787_000_003_000,
      },
    });

    expect(target.createCustomCopy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceExerciseId: "exercise-squat",
        exerciseId: "custom-squat-copy",
        normalizedName: "squat copy",
      }),
    );
    expect(result.exercise.exerciseId).toBe("custom-squat-copy");
  });

  it("binds archive and restore to the preview and expected revisions", async () => {
    const target = repository();
    const preview = await previewCustomExerciseArchive({
      repository: target,
      input: {
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
      },
    });

    const archived = await archiveCustomExercise({
      repository: target,
      invalidate: async () => undefined,
      input: {
        requestId: "archive-plank",
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
        expectedPreferenceRevision: preview.preferenceRevision,
        previewRevision: preview.previewRevision,
        updatedAtMs: 1_787_000_004_000,
      },
    });
    const restored = await restoreCustomExercise({
      repository: target,
      invalidate: async () => undefined,
      input: {
        requestId: "restore-plank",
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
        expectedPreferenceRevision: archived.preferenceRevision,
        previewRevision: preview.previewRevision,
        updatedAtMs: 1_787_000_005_000,
      },
    });

    expect(target.setCustomExerciseArchived).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ archived: true }),
    );
    expect(target.setCustomExerciseArchived).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ archived: false }),
    );
    expect(restored.archived).toBe(false);
  });

  it.each([
    {
      name: "hide revision",
      run: (target: CustomExerciseRepository) => setExerciseHidden({
        repository: target,
        invalidate: async () => undefined,
        input: {
          requestId: "hide-squat",
          exerciseId: "exercise-squat",
          expectedPreferenceRevision: -1,
          hidden: true,
          updatedAtMs: 1,
        },
      }),
      code: "custom_exercise_revision_invalid",
    },
    {
      name: "copy identity",
      run: (target: CustomExerciseRepository) => createCustomCopy({
        repository: target,
        invalidate: async () => undefined,
        input: {
          requestId: "copy-squat",
          sourceExerciseId: "exercise-squat",
          expectedSourceRevision: 2,
          exerciseId: "exercise-squat",
          name: "Squat copy",
          createdAtMs: 1,
        },
      }),
      code: "custom_exercise_copy_identity_invalid",
    },
    {
      name: "archive preview",
      run: (target: CustomExerciseRepository) => archiveCustomExercise({
        repository: target,
        invalidate: async () => undefined,
        input: {
          requestId: "archive-plank",
          exerciseId: "exercise-plank",
          expectedExerciseRevision: 3,
          expectedPreferenceRevision: null,
          previewRevision: "",
          updatedAtMs: 1,
        },
      }),
      code: "custom_exercise_preview_invalid",
    },
  ])("rejects an invalid $name before repository work", async ({ run, code }) => {
    const target = repository();

    await expect(run(target)).rejects.toMatchObject({ code });
  });
});

describe("custom exercise exhaustive validation and acknowledgement branches", () => {
  const invalidProgressions: readonly Readonly<{
    name: string;
    progression: unknown;
  }>[] = [
    { name: "unknown kind", progression: { kind: "unknown", version: 1 } },
    {
      name: "wrong profile",
      progression: {
        kind: "metric",
        profile: "load_reps",
        version: 1,
        rule: { increment: 1 },
      },
    },
    {
      name: "unsafe version",
      progression: {
        kind: "metric",
        profile: "fixed_time",
        version: Number.NaN,
        rule: { increment: 1 },
      },
    },
    {
      name: "zero version",
      progression: {
        kind: "metric",
        profile: "fixed_time",
        version: 0,
        rule: { increment: 1 },
      },
    },
    {
      name: "primitive rule",
      progression: {
        kind: "metric",
        profile: "fixed_time",
        version: 1,
        rule: "invalid",
      },
    },
    {
      name: "null rule",
      progression: {
        kind: "metric",
        profile: "fixed_time",
        version: 1,
        rule: null,
      },
    },
    {
      name: "array rule",
      progression: {
        kind: "metric",
        profile: "fixed_time",
        version: 1,
        rule: [],
      },
    },
    {
      name: "empty rule",
      progression: {
        kind: "metric",
        profile: "fixed_time",
        version: 1,
        rule: {},
      },
    },
  ];

  it.each(invalidProgressions)(
    "rejects invalid progression: $name",
    async ({ progression }) => {
      const target = repository();
      await expect(createCustomExercise({
        repository: target,
        invalidate: async () => undefined,
        input: {
          ...createInput,
          progression: progression as CustomExerciseProgression,
        },
      })).rejects.toMatchObject({
        code: "custom_exercise_progression_invalid",
      });
    },
  );

  it.each([
    {
      name: "oversized alias list",
      change: { aliases: Array.from({ length: 17 }, (_, index) => `alias-${index}`) },
      code: "custom_exercise_alias_invalid",
    },
    {
      name: "invalid alias text",
      change: { aliases: [" spaced "] },
      code: "custom_exercise_alias_invalid",
    },
    {
      name: "canonical alias",
      change: { aliases: ["雪橇推进"] },
      code: "custom_exercise_alias_invalid",
    },
    {
      name: "invalid request identifier",
      change: { requestId: " " },
      code: "custom_exercise_identifier_invalid",
    },
    {
      name: "invalid exercise identifier",
      change: { exerciseId: " " },
      code: "custom_exercise_identifier_invalid",
    },
    {
      name: "invalid exercise type",
      change: { exerciseType: "unknown" },
      code: "custom_exercise_type_invalid",
    },
    {
      name: "invalid movement class",
      change: { movementClass: "unknown" },
      code: "custom_exercise_type_invalid",
    },
    {
      name: "overlapping muscle taxonomy",
      change: { secondaryMuscles: ["quadriceps"] },
      code: "custom_exercise_taxonomy_invalid",
    },
    {
      name: "invalid duplicate decision type",
      change: {
        duplicateDecision: {
          type: "unknown",
          candidateExerciseIds: ["exercise-plank"],
        },
      },
      code: "custom_exercise_identifier_invalid",
    },
    {
      name: "empty duplicate candidate list",
      change: {
        duplicateDecision: {
          type: "create_anyway",
          candidateExerciseIds: [],
        },
      },
      code: "custom_exercise_identifier_invalid",
    },
    {
      name: "invalid duplicate candidate",
      change: {
        duplicateDecision: {
          type: "create_anyway",
          candidateExerciseIds: [" "],
        },
      },
      code: "custom_exercise_identifier_invalid",
    },
    {
      name: "duplicate duplicate candidate",
      change: {
        duplicateDecision: {
          type: "create_anyway",
          candidateExerciseIds: ["exercise-plank", "exercise-plank"],
        },
      },
      code: "custom_exercise_identifier_invalid",
    },
    {
      name: "invalid create timestamp",
      change: { createdAtMs: -1 },
      code: "custom_exercise_time_invalid",
    },
  ])("rejects $name", async ({ change, code }) => {
    await expect(createCustomExercise({
      repository: repository(),
      invalidate: async () => undefined,
      input: {
        ...createInput,
        ...change,
      } as CreateCustomExerciseInput,
    })).rejects.toMatchObject({ code });
  });

  it("accepts explicit manual Hold and metric progression policies", async () => {
    const target = repository();
    await createCustomExercise({
      repository: target,
      invalidate: async () => undefined,
      input: {
        ...createInput,
        progression: { kind: "manual_hold", version: 1 },
      },
    });
    await createCustomExercise({
      repository: target,
      invalidate: async () => undefined,
      input: {
        ...createInput,
        requestId: "request-custom-sled-metric",
        exerciseId: "custom-sled-metric",
        progression: {
          kind: "metric",
          profile: "fixed_time",
          version: 1,
          rule: { progression: "longer_distance" },
        },
      },
    });

    expect(target.createCustomExercise).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        progression: { kind: "manual_hold", version: 1 },
      }),
    );
    expect(target.createCustomExercise).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        progression: {
          kind: "metric",
          profile: "fixed_time",
          version: 1,
          rule: { progression: "longer_distance" },
        },
      }),
    );
  });

  it.each([
    {
      name: "edit timestamp",
      run: (target: CustomExerciseRepository) => editCustomExercise({
        repository: target,
        invalidate: async () => undefined,
        input: {
          ...createInput,
          requestId: "edit-time",
          expectedExerciseRevision: 1,
          editedAtMs: -1,
        },
      }),
      code: "custom_exercise_time_invalid",
    },
    {
      name: "hide request identifier",
      run: (target: CustomExerciseRepository) => setExerciseHidden({
        repository: target,
        invalidate: async () => undefined,
        input: {
          requestId: " ",
          exerciseId: "exercise-squat",
          expectedPreferenceRevision: null,
          hidden: true,
          updatedAtMs: 1,
        },
      }),
      code: "custom_exercise_identifier_invalid",
    },
    {
      name: "hide exercise identifier",
      run: (target: CustomExerciseRepository) => setExerciseHidden({
        repository: target,
        invalidate: async () => undefined,
        input: {
          requestId: "hide",
          exerciseId: " ",
          expectedPreferenceRevision: null,
          hidden: true,
          updatedAtMs: 1,
        },
      }),
      code: "custom_exercise_identifier_invalid",
    },
    {
      name: "hide boolean",
      run: (target: CustomExerciseRepository) => setExerciseHidden({
        repository: target,
        invalidate: async () => undefined,
        input: {
          requestId: "hide",
          exerciseId: "exercise-squat",
          expectedPreferenceRevision: null,
          hidden: "yes" as unknown as boolean,
          updatedAtMs: 1,
        },
      }),
      code: "custom_exercise_identifier_invalid",
    },
    {
      name: "hide timestamp",
      run: (target: CustomExerciseRepository) => setExerciseHidden({
        repository: target,
        invalidate: async () => undefined,
        input: {
          requestId: "hide",
          exerciseId: "exercise-squat",
          expectedPreferenceRevision: null,
          hidden: true,
          updatedAtMs: -1,
        },
      }),
      code: "custom_exercise_time_invalid",
    },
    {
      name: "copy request identifier",
      run: (target: CustomExerciseRepository) => createCustomCopy({
        repository: target,
        invalidate: async () => undefined,
        input: {
          requestId: " ",
          sourceExerciseId: "exercise-squat",
          expectedSourceRevision: 2,
          exerciseId: "custom-copy",
          name: "Copy",
          createdAtMs: 1,
        },
      }),
      code: "custom_exercise_identifier_invalid",
    },
    {
      name: "copy source identifier",
      run: (target: CustomExerciseRepository) => createCustomCopy({
        repository: target,
        invalidate: async () => undefined,
        input: {
          requestId: "copy",
          sourceExerciseId: " ",
          expectedSourceRevision: 2,
          exerciseId: "custom-copy",
          name: "Copy",
          createdAtMs: 1,
        },
      }),
      code: "custom_exercise_identifier_invalid",
    },
    {
      name: "copy target identifier",
      run: (target: CustomExerciseRepository) => createCustomCopy({
        repository: target,
        invalidate: async () => undefined,
        input: {
          requestId: "copy",
          sourceExerciseId: "exercise-squat",
          expectedSourceRevision: 2,
          exerciseId: " ",
          name: "Copy",
          createdAtMs: 1,
        },
      }),
      code: "custom_exercise_identifier_invalid",
    },
    {
      name: "copy revision",
      run: (target: CustomExerciseRepository) => createCustomCopy({
        repository: target,
        invalidate: async () => undefined,
        input: {
          requestId: "copy",
          sourceExerciseId: "exercise-squat",
          expectedSourceRevision: -1,
          exerciseId: "custom-copy",
          name: "Copy",
          createdAtMs: 1,
        },
      }),
      code: "custom_exercise_revision_invalid",
    },
    {
      name: "copy name",
      run: (target: CustomExerciseRepository) => createCustomCopy({
        repository: target,
        invalidate: async () => undefined,
        input: {
          requestId: "copy",
          sourceExerciseId: "exercise-squat",
          expectedSourceRevision: 2,
          exerciseId: "custom-copy",
          name: " ",
          createdAtMs: 1,
        },
      }),
      code: "custom_exercise_name_invalid",
    },
    {
      name: "copy timestamp",
      run: (target: CustomExerciseRepository) => createCustomCopy({
        repository: target,
        invalidate: async () => undefined,
        input: {
          requestId: "copy",
          sourceExerciseId: "exercise-squat",
          expectedSourceRevision: 2,
          exerciseId: "custom-copy",
          name: "Copy",
          createdAtMs: -1,
        },
      }),
      code: "custom_exercise_time_invalid",
    },
    {
      name: "preview identifier",
      run: (target: CustomExerciseRepository) =>
        previewCustomExerciseArchive({
          repository: target,
          input: {
            exerciseId: " ",
            expectedExerciseRevision: 1,
          },
        }),
      code: "custom_exercise_identifier_invalid",
    },
    {
      name: "preview revision",
      run: (target: CustomExerciseRepository) =>
        previewCustomExerciseArchive({
          repository: target,
          input: {
            exerciseId: "exercise-plank",
            expectedExerciseRevision: -1,
          },
        }),
      code: "custom_exercise_revision_invalid",
    },
  ])("rejects invalid $name", async ({ run, code }) => {
    await expect((async () => {
      await run(repository());
    })()).rejects.toMatchObject({ code });
  });

  it.each([
    {
      name: "archive request identifier",
      change: { requestId: " " },
      code: "custom_exercise_identifier_invalid",
    },
    {
      name: "archive exercise identifier",
      change: { exerciseId: " " },
      code: "custom_exercise_identifier_invalid",
    },
    {
      name: "archive exercise revision",
      change: { expectedExerciseRevision: -1 },
      code: "custom_exercise_revision_invalid",
    },
    {
      name: "archive preference revision",
      change: { expectedPreferenceRevision: -1 },
      code: "custom_exercise_revision_invalid",
    },
    {
      name: "archive preview type",
      change: { previewRevision: 1 },
      code: "custom_exercise_preview_invalid",
    },
    {
      name: "archive preview length",
      change: { previewRevision: "x".repeat(129) },
      code: "custom_exercise_preview_invalid",
    },
    {
      name: "archive timestamp",
      change: { updatedAtMs: -1 },
      code: "custom_exercise_time_invalid",
    },
  ])("rejects invalid $name", async ({ change, code }) => {
    const valid: SetCustomExerciseArchivedInput = {
      requestId: "archive",
      exerciseId: "exercise-plank",
      expectedExerciseRevision: 3,
      expectedPreferenceRevision: null,
      previewRevision: "preview",
      updatedAtMs: 1,
    };
    await expect(archiveCustomExercise({
      repository: repository(),
      invalidate: async () => undefined,
      input: {
        ...valid,
        ...change,
      } as SetCustomExerciseArchivedInput,
    })).rejects.toMatchObject({ code });
  });

  it("does not invalidate already committed results and ignores invalidation failures after commits", async () => {
    const base = repository();
    const already: CustomExerciseRepository = {
      ...base,
      createCustomExercise: jest.fn(async (
        input: StagedCreateCustomExercise,
      ) => ({
        outcome: "already_committed" as const,
        exercise: { ...input, revision: 1 },
        progression: input.progression,
        invalidations: [],
      })),
      editCustomExercise: jest.fn(async (
        input: StagedEditCustomExercise,
      ) => ({
        outcome: "already_committed" as const,
        exercise: {
          ...input,
          revision: input.expectedExerciseRevision + 1,
        },
        progression: input.progression,
        invalidations: [],
      })),
      setExerciseHidden: jest.fn(async (
        input: StagedSetExerciseHidden,
      ) => ({
        outcome: "already_committed" as const,
        exerciseId: input.exerciseId,
        hidden: input.hidden,
        preferenceRevision: 1,
        invalidations: [],
      })),
      setExerciseFavorite: jest.fn(async (
        input: StagedSetExerciseFavorite,
      ) => ({
        outcome: "already_committed" as const,
        exerciseId: input.exerciseId,
        favorite: input.favorite,
        preferenceRevision: 1,
        invalidations: [],
      })),
      createCustomCopy: jest.fn(async (
        input: StagedCreateCustomCopy,
      ) => ({
        outcome: "already_committed" as const,
        exercise: {
          requestId: input.requestId,
          exerciseId: input.exerciseId,
          name: input.name,
          normalizedName: input.normalizedName,
          aliases: [],
          exerciseType: "strength" as const,
          movementClass: "compound" as const,
          primaryMuscles: ["quadriceps"],
          secondaryMuscles: [],
          equipment: ["barbell"],
          metricIdentity: {
            profile: "load_reps" as const,
            contractVersion: 1,
            exerciseMetricGeneration: 1,
          },
          defaultRestSeconds: 1,
          revision: 1,
        },
        progression: {
          kind: "manual_hold" as const,
          version: 1 as const,
        },
        invalidations: [],
      })),
      setCustomExerciseArchived: jest.fn(async (
        input: StagedSetCustomExerciseArchived,
      ) => ({
        outcome: "already_committed" as const,
        exerciseId: input.exerciseId,
        archived: input.archived,
        preferenceRevision: 1,
        affectedPlanIds: [],
        invalidations: [],
      })),
    };
    const noInvalidation = jest.fn(async () => undefined);

    await createCustomExercise({
      repository: already,
      invalidate: noInvalidation,
      input: createInput,
    });
    await editCustomExercise({
      repository: already,
      invalidate: noInvalidation,
      input: {
        ...createInput,
        requestId: "edit",
        expectedExerciseRevision: 1,
        editedAtMs: 1,
      },
    });
    await setExerciseHidden({
      repository: already,
      invalidate: noInvalidation,
      input: {
        requestId: "hide",
        exerciseId: "exercise-squat",
        expectedPreferenceRevision: null,
        hidden: true,
        updatedAtMs: 1,
      },
    });
    await setExerciseFavorite({
      repository: already,
      invalidate: noInvalidation,
      input: {
        requestId: "favorite",
        exerciseId: "exercise-squat",
        expectedPreferenceRevision: null,
        favorite: true,
        updatedAtMs: 1,
      },
    });
    await createCustomCopy({
      repository: already,
      invalidate: noInvalidation,
      input: {
        requestId: "copy",
        sourceExerciseId: "exercise-squat",
        expectedSourceRevision: 2,
        exerciseId: "custom-copy",
        name: "Copy",
        createdAtMs: 1,
      },
    });
    await archiveCustomExercise({
      repository: already,
      invalidate: noInvalidation,
      input: {
        requestId: "archive",
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
        expectedPreferenceRevision: null,
        previewRevision: "preview",
        updatedAtMs: 1,
      },
    });
    expect(noInvalidation).not.toHaveBeenCalled();

    const rejectingInvalidation = async () => {
      throw new Error("invalidation_failed");
    };
    await createCustomExercise({
      repository: repository(),
      invalidate: rejectingInvalidation,
      input: createInput,
    });
    await editCustomExercise({
      repository: repository(),
      invalidate: rejectingInvalidation,
      input: {
        ...createInput,
        requestId: "edit-reject",
        expectedExerciseRevision: 1,
        editedAtMs: 1,
      },
    });
    await setExerciseHidden({
      repository: repository(),
      invalidate: rejectingInvalidation,
      input: {
        requestId: "hide-reject",
        exerciseId: "exercise-squat",
        expectedPreferenceRevision: null,
        hidden: true,
        updatedAtMs: 1,
      },
    });
    await setExerciseFavorite({
      repository: repository(),
      invalidate: rejectingInvalidation,
      input: {
        requestId: "favorite-reject",
        exerciseId: "exercise-squat",
        expectedPreferenceRevision: null,
        favorite: true,
        updatedAtMs: 1,
      },
    });
    await createCustomCopy({
      repository: repository(),
      invalidate: rejectingInvalidation,
      input: {
        requestId: "copy-reject",
        sourceExerciseId: "exercise-squat",
        expectedSourceRevision: 2,
        exerciseId: "custom-copy-reject",
        name: "Copy",
        createdAtMs: 1,
      },
    });
    await archiveCustomExercise({
      repository: repository(),
      invalidate: rejectingInvalidation,
      input: {
        requestId: "archive-reject",
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
        expectedPreferenceRevision: null,
        previewRevision: "preview",
        updatedAtMs: 1,
      },
    });
  });
});

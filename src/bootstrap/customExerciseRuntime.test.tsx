import {
  renderHook,
} from "@testing-library/react-native";
import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

import type {
  CreateCustomExerciseInput,
  EditCustomExerciseInput,
} from "../domains/library/customExerciseCommands";
import type {
  MigrateCustomExerciseMetricProfileInput,
} from "../domains/metrics/migrateCustomExerciseMetricProfile";
import type {
  ExerciseDetailSnapshot,
} from "../ui/screens/ExerciseDetailScreen";
import type {
  ExerciseEditorSaveInput,
} from "../ui/screens/ExerciseEditorScreen";
import {
  createCustomCopyEditorOrigin,
  createCustomExerciseRuntimeAdapter,
  ORDINARY_CUSTOM_EXERCISE_ORIGIN,
  useCustomExerciseRuntime,
} from "./customExerciseRuntime";
import type {
  useWorkoutAppRuntime,
} from "./workoutAppRuntime";
import {
  WorkoutAppRuntimeProvider,
  type WorkoutAppRuntimeDependencies,
} from "./workoutAppRuntime";

function detail(
  changes: Partial<ExerciseDetailSnapshot> = {},
): ExerciseDetailSnapshot {
  return {
    exerciseId: "exercise-owner",
    name: "Owner Plank",
    origin: "custom",
    originLabel: "Custom",
    exerciseType: "strength",
    movementClass: "isolation",
    aliases: ["Plank hold"],
    primaryMuscles: ["core"],
    secondaryMuscles: ["shoulders"],
    equipment: ["bodyweight"],
    metricIdentity: {
      profile: "timed_hold",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    defaultRestSeconds: 60,
    availability: "available",
    favorite: false,
    hidden: false,
    archived: false,
    exerciseRevision: 3,
    preferenceRevision: 2,
    source: null,
    references: [],
    ...changes,
  };
}

function saveInput(
  changes: Partial<ExerciseEditorSaveInput> = {},
): ExerciseEditorSaveInput {
  return {
    requestId: "request-owner",
    exerciseId: "exercise-owner",
    origin: ORDINARY_CUSTOM_EXERCISE_ORIGIN,
    name: "Owner Plank",
    aliases: ["Plank hold"],
    exerciseType: "strength",
    movementClass: "isolation",
    primaryMuscles: ["core"],
    secondaryMuscles: ["shoulders"],
    equipment: ["bodyweight"],
    metricIdentity: {
      profile: "timed_hold",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    defaultRestSeconds: 60,
    progression: {
      kind: "manual_hold",
      version: 1,
    },
    ...changes,
  };
}

function runtime(
  loaded: ExerciseDetailSnapshot | null = detail(),
) {
  const value = {
    createCustomExerciseId: jest.fn((kind: string) => `${kind}:id`),
    loadCustomExercise: jest.fn(async () => loaded),
    createCustomExercise: jest.fn(async (
      input: Omit<CreateCustomExerciseInput, "createdAtMs">,
    ) => ({
      outcome: "committed" as const,
      exercise: {
        requestId: input.requestId,
        exerciseId: input.exerciseId,
        name: input.name,
        normalizedName: input.name.toLocaleLowerCase("en"),
        aliases: [],
        exerciseType: input.exerciseType,
        movementClass: input.movementClass,
        primaryMuscles: input.primaryMuscles,
        secondaryMuscles: input.secondaryMuscles,
        equipment: input.equipment,
        metricIdentity: input.metricIdentity,
        defaultRestSeconds: input.defaultRestSeconds,
        revision: 1,
      },
      progression: input.progression ?? {
        kind: "manual_hold" as const,
        version: 1 as const,
      },
      invalidations: [],
    })),
    editCustomExercise: jest.fn(async (
      input: Omit<EditCustomExerciseInput, "editedAtMs">,
    ) => ({
      outcome: "committed" as const,
      exercise: {
        requestId: input.requestId,
        exerciseId: input.exerciseId,
        name: input.name,
        normalizedName: input.name.toLocaleLowerCase("en"),
        aliases: [],
        exerciseType: input.exerciseType,
        movementClass: input.movementClass,
        primaryMuscles: input.primaryMuscles,
        secondaryMuscles: input.secondaryMuscles,
        equipment: input.equipment,
        metricIdentity: input.metricIdentity,
        defaultRestSeconds: input.defaultRestSeconds,
        revision: input.expectedExerciseRevision + 1,
      },
      progression: input.progression ?? {
        kind: "manual_hold" as const,
        version: 1 as const,
      },
      invalidations: [],
    })),
    previewCustomExerciseArchive: jest.fn(async () => ({
      exerciseId: "exercise-owner",
      exerciseRevision: 3,
      preferenceRevision: 2,
      previewRevision: "preview-owner",
      affectedPlans: [],
    })),
    setCustomExerciseFavorite: jest.fn(async () => detail({ favorite: true })),
    setCustomExerciseHidden: jest.fn(async () => detail({ hidden: true })),
    setCustomExerciseArchived: jest.fn(async () => detail({ archived: true })),
    loadCustomExerciseMigration: jest.fn(async () => ({
      exerciseId: "exercise-owner",
      exerciseName: "Owner Plank",
      exerciseRevision: 3,
      fromIdentity: detail().metricIdentity,
      activeWorkoutSessionId: null,
      occurrences: [],
    })),
    migrateCustomExerciseMetricProfile: jest.fn(async (
      input: Omit<
        MigrateCustomExerciseMetricProfileInput,
        "migratedAtMs"
      >,
    ) => ({
      outcome: "committed" as const,
      exerciseId: input.exerciseId,
      exerciseRevision: input.expectedExerciseRevision + 1,
      metricIdentity: input.toIdentity,
      migratedTargetIds: [],
      invalidatedRecommendationIds: [],
      invalidatedPolicyIds: [],
      baselineStatus: "awaiting_comparable_observation" as const,
    })),
  };
  return value as unknown as ReturnType<typeof useWorkoutAppRuntime>;
}

describe("custom exercise runtime capability adapter", () => {
  it("exposes the memoized adapter through the trusted app runtime hook", async () => {
    const kernel = {
      close: jest.fn(async () => undefined),
    };
    const dependencies = {
      openKernel: jest.fn(async () => kernel),
      migrate: jest.fn(async () => undefined),
      createRepository: jest.fn(() => ({
        getTodayView: jest.fn(async () => ({ state: "no_active_plan" })),
        getActivation: jest.fn(async () => null),
      })),
      createNotifications: jest.fn(() => ({
        ensureChannel: jest.fn(async () => undefined),
        permission: jest.fn(async () => "granted"),
        requestPermission: jest.fn(async () => "granted"),
        listScheduled: jest.fn(async () => []),
        cancel: jest.fn(async () => undefined),
        schedule: jest.fn(async () => "notification"),
        openSettings: jest.fn(async () => undefined),
      })),
      createLifecycle: jest.fn(() => ({
        trigger: jest.fn(async () => ({
          trigger: "launch",
          reconciled: 0,
          permission: "granted",
          drain: {
            claimed: 0,
            completed: 0,
            permanentFailures: 0,
            retried: 0,
            superseded: 0,
          },
          progressionDrain: {
            claimed: 0,
            completed: 0,
            permanentFailures: 0,
            retried: 0,
            superseded: 0,
          },
          historyProjectionDrain: {
            claimed: 0,
            completed: 0,
            permanentFailures: 0,
            retried: 0,
            superseded: 0,
          },
          outcomes: [],
        })),
        subscribeForeground: jest.fn(() => () => undefined),
      })),
      createRestRepository: jest.fn(() => ({
        listActiveSessionIds: jest.fn(async () => []),
      })),
      createOutcomeRepository: jest.fn(() => ({})),
      createWorkoutRepository: jest.fn(() => ({})),
      now: () => new Date("2026-08-18T08:00:00+08:00"),
      nowMs: () => 1_787_000_000_000,
    } as unknown as WorkoutAppRuntimeDependencies;
    const wrapper = ({ children }: Readonly<{
      children: React.ReactNode;
    }>) => (
      <WorkoutAppRuntimeProvider dependencies={dependencies}>
        {children}
      </WorkoutAppRuntimeProvider>
    );

    const rendered = await renderHook(() => useCustomExerciseRuntime(), {
      wrapper,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rendered.result.current.ordinaryCreateOrigin)
      .toBe(ORDINARY_CUSTOM_EXERCISE_ORIGIN);
    await rendered.unmount();
  });

  it("keeps ordinary create and custom-copy drafts distinct and deeply cloned", async () => {
    const base = detail({
      origin: "bundled",
      originLabel: "Built-in",
      source: {
        namespace: "source-pack",
        revision: "revision-1",
        license: "MIT",
        attribution: "Attribution",
      },
    });
    const port = createCustomExerciseRuntimeAdapter(runtime(base));

    expect(port.ordinaryCreateOrigin).toBe(ORDINARY_CUSTOM_EXERCISE_ORIGIN);
    await expect(port.loadEditDraft("exercise-owner")).resolves.toBeNull();
    const copy = await port.loadCustomCopyDraft("exercise-owner");
    expect(copy).toEqual(expect.objectContaining({
      draft: expect.objectContaining({
        name: "Owner Plank Copy",
        aliases: ["Plank hold"],
        progression: {
          kind: "manual_hold",
          version: 1,
        },
      }),
      origin: expect.objectContaining({
        kind: "custom_copy",
        sourceExerciseId: "exercise-owner",
      }),
    }));
    expect(copy?.draft).not.toBe(base);

    const metricOrigin = createCustomCopyEditorOrigin({
      kind: "custom_copy",
      sourceExerciseId: "source",
      sourceName: "Source",
      draft: {
        ...copy!.draft,
        progression: {
          kind: "metric",
          profile: "timed_hold",
          version: 1,
          rule: { increment: 5 },
        },
      },
    });
    expect(metricOrigin.draft.progression).toEqual({
      kind: "metric",
      profile: "timed_hold",
      version: 1,
      rule: { increment: 5 },
    });
  });

  it("loads editable custom drafts and rejects missing or wrong ownership", async () => {
    const adapter = createCustomExerciseRuntimeAdapter(runtime());
    await expect(adapter.loadEditDraft("exercise-owner")).resolves.toEqual({
      draft: expect.objectContaining({
        name: "Owner Plank",
        equipment: ["bodyweight"],
      }),
      expectedExerciseRevision: 3,
    });
    await expect(
      createCustomExerciseRuntimeAdapter(runtime(null))
        .loadEditDraft("missing"),
    ).resolves.toBeNull();
    await expect(
      createCustomExerciseRuntimeAdapter(runtime(detail()))
        .loadCustomCopyDraft("exercise-owner"),
    ).resolves.toBeNull();
  });

  it("delegates create and edit with exact fields and duplicate decisions", async () => {
    const base = runtime();
    const adapter = createCustomExerciseRuntimeAdapter(base);
    await adapter.saveExercise(saveInput({
      duplicateDecision: {
        type: "create_anyway",
        candidateExerciseIds: ["existing-owner"],
      },
    }));
    expect(base.createCustomExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        duplicateDecision: {
          type: "create_anyway",
          candidateExerciseIds: ["existing-owner"],
        },
      }),
    );

    await adapter.saveExercise(saveInput({
      expectedExerciseRevision: 3,
      name: "Owner Plank Edited",
    }));
    expect(base.editCustomExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedExerciseRevision: 3,
        name: "Owner Plank Edited",
      }),
    );
  });

  it("delegates detail lifecycle and future-only migration capabilities", async () => {
    const base = runtime();
    const adapter = createCustomExerciseRuntimeAdapter(base);
    const snapshot = detail();

    await adapter.loadExercise(snapshot.exerciseId);
    await adapter.previewArchive(snapshot);
    await adapter.setFavorite({ exercise: snapshot, favorite: true });
    await adapter.setHidden({ exercise: snapshot, hidden: true });
    await adapter.setArchived({
      exercise: snapshot,
      archived: true,
      preview: {
        exerciseId: snapshot.exerciseId,
        exerciseRevision: 3,
        preferenceRevision: 2,
        previewRevision: "preview-owner",
        affectedPlans: [],
      },
    });
    await adapter.loadMigration(snapshot.exerciseId);
    await adapter.migrate({
      exerciseId: snapshot.exerciseId,
      expectedExerciseRevision: 3,
      fromIdentity: snapshot.metricIdentity,
      toIdentity: {
        profile: "unscored",
        contractVersion: 1,
        exerciseMetricGeneration: 2,
      },
      replacements: [],
      policyDecisions: [],
      acknowledgedHistoryImmutable: true,
      idempotencyKey: "migration-owner",
    });

    expect(base.previewCustomExerciseArchive)
      .toHaveBeenCalledWith(snapshot.exerciseId, 3);
    expect(base.setCustomExerciseFavorite).toHaveBeenCalledWith({
      exerciseId: snapshot.exerciseId,
      expectedPreferenceRevision: 2,
      favorite: true,
    });
    expect(base.setCustomExerciseHidden).toHaveBeenCalledWith({
      exerciseId: snapshot.exerciseId,
      expectedPreferenceRevision: 2,
      hidden: true,
    });
    expect(base.setCustomExerciseArchived).toHaveBeenCalledWith({
      exerciseId: snapshot.exerciseId,
      expectedExerciseRevision: 3,
      expectedPreferenceRevision: 2,
      previewRevision: "preview-owner",
      archived: true,
    });
    expect(base.migrateCustomExerciseMetricProfile)
      .toHaveBeenCalledWith(expect.objectContaining({
        idempotencyKey: "migration-owner",
      }));
  });
});

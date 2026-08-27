import {
  useMemo,
} from "react";

import type {
  CreateCustomExerciseInput,
  EditCustomExerciseInput,
} from "../domains/library/customExerciseCommands";
import type {
  MigrateCustomExerciseMetricProfileInput,
} from "../domains/metrics/migrateCustomExerciseMetricProfile";
import type {
  ExerciseDetailArchivePreview,
  ExerciseDetailSnapshot,
} from "../ui/screens/ExerciseDetailScreen";
import type {
  ExerciseEditorDraft,
  ExerciseEditorOrigin,
  ExerciseEditorSaveInput,
} from "../ui/screens/ExerciseEditorScreen";
import type {
  MetricMigrationSnapshot,
} from "../ui/screens/MetricMigrationScreen";
import {
  useWorkoutAppRuntime,
} from "./workoutAppRuntime";

export const ORDINARY_CUSTOM_EXERCISE_ORIGIN: ExerciseEditorOrigin =
  Object.freeze({
    kind: "ordinary_create",
  });

export function createCustomCopyEditorOrigin(
  input: Extract<ExerciseEditorOrigin, { kind: "custom_copy" }>,
): Extract<ExerciseEditorOrigin, { kind: "custom_copy" }> {
  return Object.freeze({
    ...input,
    draft: Object.freeze({
      ...input.draft,
      aliases: Object.freeze([...input.draft.aliases]),
      primaryMuscles: Object.freeze([...input.draft.primaryMuscles]),
      secondaryMuscles: Object.freeze([...input.draft.secondaryMuscles]),
      equipment: Object.freeze([...input.draft.equipment]),
      metricIdentity: Object.freeze({ ...input.draft.metricIdentity }),
      progression: input.draft.progression.kind === "manual_hold"
        ? Object.freeze({ ...input.draft.progression })
        : Object.freeze({
            ...input.draft.progression,
            rule: Object.freeze({ ...input.draft.progression.rule }),
          }),
    }),
  });
}

function createCommandInput(
  input: ExerciseEditorSaveInput,
): Omit<CreateCustomExerciseInput, "createdAtMs"> {
  return {
    requestId: input.requestId,
    exerciseId: input.exerciseId,
    name: input.name,
    aliases: input.aliases,
    exerciseType: input.exerciseType,
    movementClass: input.movementClass,
    primaryMuscles: input.primaryMuscles,
    secondaryMuscles: input.secondaryMuscles,
    equipment: input.equipment,
    metricIdentity: input.metricIdentity,
    defaultRestSeconds: input.defaultRestSeconds,
    progression: input.progression,
    ...(input.duplicateDecision === undefined
      ? {}
      : { duplicateDecision: input.duplicateDecision }),
  };
}

function editCommandInput(
  input: ExerciseEditorSaveInput & Readonly<{
    expectedExerciseRevision: number;
  }>,
): Omit<EditCustomExerciseInput, "editedAtMs"> {
  return {
    requestId: input.requestId,
    exerciseId: input.exerciseId,
    name: input.name,
    aliases: input.aliases,
    exerciseType: input.exerciseType,
    movementClass: input.movementClass,
    primaryMuscles: input.primaryMuscles,
    secondaryMuscles: input.secondaryMuscles,
    equipment: input.equipment,
    metricIdentity: input.metricIdentity,
    defaultRestSeconds: input.defaultRestSeconds,
    progression: input.progression,
    expectedExerciseRevision: input.expectedExerciseRevision,
  };
}

function editorDraft(
  detail: ExerciseDetailSnapshot,
): ExerciseEditorDraft {
  return Object.freeze({
    name: detail.name,
    aliases: Object.freeze([...detail.aliases]),
    exerciseType: detail.exerciseType as ExerciseEditorDraft["exerciseType"],
    movementClass:
      detail.movementClass as ExerciseEditorDraft["movementClass"],
    primaryMuscles: Object.freeze([...detail.primaryMuscles]),
    secondaryMuscles: Object.freeze([...detail.secondaryMuscles]),
    equipment: Object.freeze([...detail.equipment]),
    metricIdentity: Object.freeze({ ...detail.metricIdentity }),
    defaultRestSeconds: detail.defaultRestSeconds,
    progression: Object.freeze({
      kind: "manual_hold",
      version: 1,
    }),
  });
}

export function createCustomExerciseRuntimeAdapter(
  runtime: ReturnType<typeof useWorkoutAppRuntime>,
) {
  return Object.freeze({
    createId: runtime.createCustomExerciseId,
    ordinaryCreateOrigin: ORDINARY_CUSTOM_EXERCISE_ORIGIN,
    createCustomCopyOrigin: createCustomCopyEditorOrigin,
    loadExercise: runtime.loadCustomExercise as (
      exerciseId: string,
    ) => Promise<ExerciseDetailSnapshot | null>,
    loadEditDraft: async (exerciseId: string) => {
      const detail = await runtime.loadCustomExercise(exerciseId);
      return detail === null || detail.origin !== "custom"
        ? null
        : Object.freeze({
            draft: editorDraft(detail as ExerciseDetailSnapshot),
            expectedExerciseRevision: detail.exerciseRevision,
          });
    },
    loadCustomCopyDraft: async (exerciseId: string) => {
      const detail = await runtime.loadCustomExercise(exerciseId);
      if (detail === null || detail.origin !== "bundled") {
        return null;
      }
      const origin = createCustomCopyEditorOrigin({
        kind: "custom_copy",
        sourceExerciseId: detail.exerciseId,
        sourceName: detail.name,
        draft: {
          ...editorDraft(detail as ExerciseDetailSnapshot),
          name: `${detail.name} Copy`,
        },
      });
      return Object.freeze({
        draft: origin.draft,
        origin,
      });
    },
    saveExercise: (input: ExerciseEditorSaveInput) =>
      input.expectedExerciseRevision === undefined
        ? runtime.createCustomExercise(createCommandInput(input))
        : runtime.editCustomExercise(editCommandInput({
            ...input,
            expectedExerciseRevision: input.expectedExerciseRevision,
          })),
    previewArchive: (detail: ExerciseDetailSnapshot) =>
      runtime.previewCustomExerciseArchive(
        detail.exerciseId,
        detail.exerciseRevision,
      ) as Promise<ExerciseDetailArchivePreview>,
    setFavorite: async (input: Readonly<{
      exercise: ExerciseDetailSnapshot;
      favorite: boolean;
    }>) => runtime.setCustomExerciseFavorite({
      exerciseId: input.exercise.exerciseId,
      expectedPreferenceRevision: input.exercise.preferenceRevision,
      favorite: input.favorite,
    }) as Promise<ExerciseDetailSnapshot>,
    setHidden: async (input: Readonly<{
      exercise: ExerciseDetailSnapshot;
      hidden: boolean;
    }>) => runtime.setCustomExerciseHidden({
      exerciseId: input.exercise.exerciseId,
      expectedPreferenceRevision: input.exercise.preferenceRevision,
      hidden: input.hidden,
    }) as Promise<ExerciseDetailSnapshot>,
    setArchived: async (input: Readonly<{
      exercise: ExerciseDetailSnapshot;
      archived: boolean;
      preview: ExerciseDetailArchivePreview;
    }>) => runtime.setCustomExerciseArchived({
      exerciseId: input.exercise.exerciseId,
      expectedExerciseRevision: input.exercise.exerciseRevision,
      expectedPreferenceRevision: input.exercise.preferenceRevision,
      previewRevision: input.preview.previewRevision,
      archived: input.archived,
    }) as Promise<ExerciseDetailSnapshot>,
    loadMigration: runtime.loadCustomExerciseMigration as (
      exerciseId: string,
    ) => Promise<MetricMigrationSnapshot | null>,
    migrate: (
      input: Omit<MigrateCustomExerciseMetricProfileInput, "migratedAtMs">,
    ) => runtime.migrateCustomExerciseMetricProfile(input),
  });
}

export function useCustomExerciseRuntime() {
  const runtime = useWorkoutAppRuntime();
  return useMemo(
    () => createCustomExerciseRuntimeAdapter(runtime),
    [runtime],
  );
}

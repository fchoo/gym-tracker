import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

import type {
  MigrateCustomExerciseMetricProfileInput,
} from "../../domains/metrics/migrateCustomExerciseMetricProfile";
import type {
  CustomExerciseDuplicateCandidate,
  CustomExerciseMutationResult,
} from "../../platform/sqlite/repositories/customExerciseRepository";
import {
  CustomExerciseConflictError,
} from "../../platform/sqlite/repositories/customExerciseRepository";
import {
  ExerciseDetailScreen,
  type ExerciseDetailSnapshot,
} from "../screens/ExerciseDetailScreen";
import {
  ExerciseEditorScreen,
  type ExerciseEditorSaveInput,
} from "../screens/ExerciseEditorScreen";
import {
  LibraryScreen,
  type LibraryBrowseSnapshot,
} from "../screens/LibraryScreen";
import {
  MetricMigrationScreen,
  type MetricMigrationSnapshot,
} from "../screens/MetricMigrationScreen";
import {
  AppearanceProvider,
} from "../theme";

function librarySnapshot(): LibraryBrowseSnapshot {
  return {
    sectionPreference: {
      section: "exercises",
      revision: 1,
    },
    plans: {
      active: null,
      owned: [],
      starters: [],
    },
  };
}

function savedExercise(
  input: ExerciseEditorSaveInput,
): CustomExerciseMutationResult {
  return {
    outcome: "committed",
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
      revision: 0,
    },
    progression: input.progression,
    invalidations: ["library:exercises", `exercise:${input.exerciseId}`],
  };
}

async function renderEditor(
  overrides: Partial<React.ComponentProps<typeof ExerciseEditorScreen>> = {},
) {
  const props: React.ComponentProps<typeof ExerciseEditorScreen> = {
    createId: jest.fn((kind: string) => `${kind}:ordinary-id`),
    mode: "create",
    origin: {
      kind: "ordinary_create",
    },
    onBack: jest.fn(),
    onSaved: jest.fn(),
    saveExercise: jest.fn(async (input: ExerciseEditorSaveInput) =>
      savedExercise(input)),
    ...overrides,
  };
  return {
    props,
    rendered: await render(
      <AppearanceProvider>
        <ExerciseEditorScreen {...props} />
      </AppearanceProvider>,
    ),
  };
}

describe("custom exercise ordinary create and custom copy origins", () => {
  it("opens Library ordinary create through the exact distinct action", async () => {
    const onCreateExercise = jest.fn();
    const rendered = await render(
      <AppearanceProvider>
        <LibraryScreen
          loadLibrary={jest.fn(async () => librarySnapshot())}
          listRecentExercises={jest.fn(async () => [])}
          onCreateExercise={onCreateExercise}
          onCreatePlan={jest.fn()}
          onOpenExercise={jest.fn()}
          onOpenPlan={jest.fn()}
          searchExercises={jest.fn(async () => ({
            state: "page" as const,
            items: [],
            nextCursor: null,
          }))}
          setExerciseFavorite={jest.fn(async () => ({
            exerciseId: "unused",
            favorite: true,
            preferenceRevision: 1,
          }))}
          setSection={jest.fn(async () => ({
            section: "exercises" as const,
            revision: 1,
          }))}
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(
      await screen.findByRole("button", { name: "Create custom exercise" }),
    );

    expect(onCreateExercise).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });

  it("keeps ordinary create blank while custom copy is explicitly prepopulated", async () => {
    const ordinary = await renderEditor();

    expect(await screen.findByRole("header", {
      name: "Create custom exercise",
    })).toBeOnTheScreen();
    expect(screen.getByLabelText("Exercise name")).toHaveProp("value", "");
    expect(screen.queryByText("Copied from Barbell Back Squat"))
      .not.toBeOnTheScreen();
    await ordinary.rendered.unmount();

    await renderEditor({
      origin: {
        kind: "custom_copy",
        sourceExerciseId: "builtin-squat",
        sourceName: "Barbell Back Squat",
        draft: {
          name: "Barbell Back Squat Copy",
          aliases: [],
          exerciseType: "strength",
          movementClass: "compound",
          primaryMuscles: ["quadriceps"],
          secondaryMuscles: ["glutes"],
          equipment: ["barbell"],
          metricIdentity: {
            profile: "load_reps",
            contractVersion: 1,
            exerciseMetricGeneration: 1,
          },
          defaultRestSeconds: 120,
          progression: {
            kind: "manual_hold",
            version: 1,
          },
        },
      },
    });

    expect(await screen.findByText("Copied from Barbell Back Squat"))
      .toBeOnTheScreen();
    expect(screen.getByLabelText("Exercise name"))
      .toHaveProp("value", "Barbell Back Squat Copy");
    expect(screen.getByRole("radio", { name: /Load \+ reps/u }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        selected: true,
      }));
  });

  it("requires an explicit metric profile and saves manual Hold only on Save exercise", async () => {
    const saveExercise = jest.fn(async (input: ExerciseEditorSaveInput) =>
      savedExercise(input));
    const { props } = await renderEditor({ saveExercise });

    const metricOptions = [
      /Load \+ reps/u,
      /Bodyweight reps/u,
      /Added load \+ reps/u,
      /Assisted reps/u,
      /Timed hold/u,
      /Fixed distance/u,
      /Fixed time/u,
      /Rounds \/ intervals/u,
      /Mobility \/ unscored/u,
    ].map((name) => screen.getByRole("radio", { name }));
    expect(metricOptions).toHaveLength(9);
    expect(screen.getByTestId("exercise-editor-name")).toBeOnTheScreen();
    expect(screen.getByTestId("exercise-editor-primary-muscles"))
      .toBeOnTheScreen();
    expect(screen.getByTestId("exercise-editor-equipment")).toBeOnTheScreen();
    expect(screen.getByTestId("exercise-editor-save")).toBeOnTheScreen();
    expect(screen.getByTestId("adaptive-dock")).toContainElement(
      screen.getByTestId("exercise-editor-save"),
    );
    for (const option of metricOptions) {
      expect(option).toHaveProp(
        "accessibilityState",
        expect.objectContaining({ selected: false }),
      );
    }
    expect(screen.getByText("Hold / manual decision")).toBeOnTheScreen();
    expect(saveExercise).not.toHaveBeenCalled();

    await fireEvent.changeText(
      screen.getByLabelText("Exercise name"),
      "Tempo Goblet Squat",
    );
    await fireEvent.press(screen.getByRole("radio", {
      name: "Strongman",
    }));
    await fireEvent.press(screen.getByRole("radio", {
      name: "Isolation",
    }));
    await fireEvent.changeText(
      screen.getByLabelText("Primary muscles"),
      "quadriceps",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Secondary muscles"),
      "glutes",
    );
    await fireEvent.press(screen.getByRole("radio", {
      name: /Bodyweight reps/u,
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Save exercise",
    }));

    await waitFor(() => {
      expect(saveExercise).toHaveBeenCalledTimes(1);
    });
    expect(saveExercise).toHaveBeenCalledWith(expect.objectContaining({
      name: "Tempo Goblet Squat",
      metricIdentity: {
        profile: "bodyweight_reps",
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      progression: {
        kind: "manual_hold",
        version: 1,
      },
      exerciseType: "strongman",
      movementClass: "isolation",
      primaryMuscles: ["quadriceps"],
      secondaryMuscles: ["glutes"],
      origin: {
        kind: "ordinary_create",
      },
    }));
    expect(props.onSaved).toHaveBeenCalledWith("exercise:ordinary-id");
  });

  it("keeps the committed metric identity read-only during ordinary edit", async () => {
    const saveExercise = jest.fn(async (input: ExerciseEditorSaveInput) =>
      savedExercise(input));
    await renderEditor({
      mode: "edit",
      exerciseId: "exercise-owner",
      expectedExerciseRevision: 3,
      initialDraft: {
        name: "Owner Plank",
        aliases: [],
        exerciseType: "strength",
        movementClass: "isolation",
        primaryMuscles: ["core"],
        secondaryMuscles: [],
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
      },
      saveExercise,
    });

    expect(await screen.findByText(
      "Metric profile changes use the separate future-target migration review.",
    )).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("radio", {
      name: /Timed hold/u,
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Save exercise",
    }));
    await waitFor(() => expect(saveExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedExerciseRevision: 3,
        metricIdentity: {
          profile: "timed_hold",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
      }),
    ));
  });
});

describe("custom exercise duplicate warning", () => {
  it("preserves every entered value and resubmits only after Create anyway", async () => {
    const duplicate: CustomExerciseDuplicateCandidate = {
      exerciseId: "existing-goblet",
      canonicalName: "Tempo Goblet Squat",
      metricIdentity: {
        profile: "bodyweight_reps",
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      equipment: ["dumbbell"],
    };
    const saveExercise = jest.fn(async (input: ExerciseEditorSaveInput) => {
      if (input.duplicateDecision === undefined) {
        throw new CustomExerciseConflictError(
          "custom_exercise_duplicate_confirmation_required",
          [duplicate],
        );
      }
      return savedExercise(input);
    });
    await renderEditor({ saveExercise });

    await fireEvent.changeText(
      screen.getByLabelText("Exercise name"),
      "Tempo Goblet Squat",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Equipment"),
      "dumbbell",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Aliases"),
      "Slow Goblet Squat",
    );
    await fireEvent.press(screen.getByRole("button", {
      name: "Default rest seconds",
    }));
    await fireEvent.changeText(
      screen.getByLabelText("Default rest seconds minutes"),
      "2",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Default rest seconds seconds"),
      "15",
    );
    await fireEvent.press(screen.getByRole("button", {
      name: "Confirm default rest seconds",
    }));
    await fireEvent.press(screen.getByRole("radio", {
      name: /Bodyweight reps/u,
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Save exercise",
    }));

    expect(await screen.findByRole("header", {
      name: "Similar exercises already exist",
    })).toBeOnTheScreen();
    expect(screen.getByText(
      /Tempo Goblet Squat\s+Bodyweight reps · dumbbell/u,
    ))
      .toBeOnTheScreen();
    expect(screen.getByLabelText("Exercise name"))
      .toHaveProp("value", "Tempo Goblet Squat");
    expect(screen.getByLabelText("Aliases"))
      .toHaveProp("value", "Slow Goblet Squat");
    expect(screen.getByText("2 min 15 sec")).toBeOnTheScreen();
    expect(saveExercise).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole("button", {
      name: "Review existing exercise",
    }));
    expect(screen.queryByRole("header", {
      name: "Similar exercises already exist",
    })).not.toBeOnTheScreen();
    expect(screen.getByLabelText("Exercise name"))
      .toHaveProp("value", "Tempo Goblet Squat");
    await fireEvent.press(screen.getByRole("button", {
      name: "Save exercise",
    }));
    expect(await screen.findByRole("header", {
      name: "Similar exercises already exist",
    })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", {
      name: "Create anyway",
    }));

    await waitFor(() => {
      expect(saveExercise).toHaveBeenCalledTimes(3);
    });
    expect(saveExercise.mock.calls[2]?.[0]).toEqual(expect.objectContaining({
      name: "Tempo Goblet Squat",
      aliases: ["Slow Goblet Squat"],
      equipment: ["dumbbell"],
      defaultRestSeconds: 135,
      duplicateDecision: {
        type: "create_anyway",
        candidateExerciseIds: ["existing-goblet"],
      },
    }));
  });
});

function detailSnapshot(
  overrides: Partial<ExerciseDetailSnapshot> = {},
): ExerciseDetailSnapshot {
  return {
    exerciseId: "exercise-plank",
    name: "Very Long Owner Plank Variation With Deliberately Detailed Naming",
    origin: "custom",
    originLabel: "Custom",
    exerciseType: "strength",
    movementClass: "isolation",
    aliases: ["Owner plank"],
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
    references: [{
      planId: "plan-owner",
      planName: "Owner Strength",
      dayId: "day-owner",
      dayName: "Strength Day",
      occurrenceId: "occurrence-plank",
      statusLabel: null,
      runnable: true,
    }],
    ...overrides,
  };
}

async function renderDetail(
  snapshot: ExerciseDetailSnapshot | null = detailSnapshot(),
  overrides: Partial<React.ComponentProps<typeof ExerciseDetailScreen>> = {},
) {
  const props: React.ComponentProps<typeof ExerciseDetailScreen> = {
    exerciseId: snapshot?.exerciseId ?? "missing-exercise",
    loadExercise: jest.fn(async () => snapshot),
    onBack: jest.fn(),
    onChangeMetricProfile: jest.fn(),
    onCreateCustomCopy: jest.fn(),
    onEdit: jest.fn(),
    onOpenHistory: jest.fn(),
    onOpenPlan: jest.fn(),
    previewArchive: jest.fn(async () => ({
      exerciseId: "exercise-plank",
      exerciseRevision: 3,
      preferenceRevision: 2,
      previewRevision: "archive-preview",
      affectedPlans: [{
        planId: "plan-owner",
        planName: "Owner Strength",
        planRevision: 4,
        occurrences: [{
          occurrenceId: "occurrence-plank",
          occurrenceRevision: 2,
          dayId: "day-owner",
          dayName: "Strength Day",
        }],
      }],
    })),
    setArchived: jest.fn(async (
      { archived }: Parameters<
        React.ComponentProps<typeof ExerciseDetailScreen>["setArchived"]
      >[0],
    ) => detailSnapshot({
      archived,
      preferenceRevision: 3,
      references: [{
        ...detailSnapshot().references[0]!,
        statusLabel: archived ? "Archived" : null,
      }],
    })),
    setFavorite: jest.fn(async (
      { favorite }: Parameters<
        React.ComponentProps<typeof ExerciseDetailScreen>["setFavorite"]
      >[0],
    ) => detailSnapshot({
      favorite,
      preferenceRevision: 3,
    })),
    setHidden: jest.fn(async (
      { hidden }: Parameters<
        React.ComponentProps<typeof ExerciseDetailScreen>["setHidden"]
      >[0],
    ) => detailSnapshot({
      hidden,
      preferenceRevision: 3,
    })),
    ...overrides,
  };
  return {
    props,
    rendered: await render(
      <AppearanceProvider>
        <ExerciseDetailScreen {...props} />
      </AppearanceProvider>,
    ),
  };
}

describe("exercise detail authority and lifecycle", () => {
  it("shows built-in attribution, Unavailable, history navigation, and only ownership-safe actions", async () => {
    const builtIn = detailSnapshot({
      exerciseId: "builtin-row",
      name: "Unavailable Built-in Exercise With Long Attribution",
      origin: "bundled",
      originLabel: "Built-in",
      availability: "unavailable",
      source: {
        namespace: "kinetic-place.exercises-db",
        revision: "1783421f145e546fa168c591a0e4d11cae6f23df",
        license: "MIT",
        attribution:
          "Copyright (c) 2026 Kinetic.place with long attribution that remains readable.",
      },
      references: [],
    });
    const { props } = await renderDetail(builtIn);

    expect(await screen.findByRole("header", { name: builtIn.name }))
      .toBeOnTheScreen();
    expect(screen.getAllByText("Built-in")).toHaveLength(2);
    expect(screen.getAllByText("Unavailable").length)
      .toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/kinetic-place\.exercises-db/u)).toBeOnTheScreen();
    expect(screen.getByText(/1783421f145e546fa168c591a0e4d11cae6f23df/u))
      .toBeOnTheScreen();
    expect(screen.getByText("MIT")).toBeOnTheScreen();
    expect(screen.getByText(/Copyright \(c\) 2026 Kinetic\.place/u))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "View exercise history" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Create custom copy" }))
      .toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Edit exercise" }))
      .not.toBeOnTheScreen();
    expect(screen.queryByText(/Delete exercise/u)).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", {
      name: "Create custom copy",
    }));
    expect(props.onCreateCustomCopy).toHaveBeenCalledWith("builtin-row");
    await fireEvent.press(screen.getByRole("button", {
      name: "View exercise history",
    }));
    expect(props.onOpenHistory).toHaveBeenCalledWith(
      "builtin-row",
      builtIn.name,
    );
  });

  it("previews affected plans, archives without delete, keeps references runnable, and restores", async () => {
    const { props } = await renderDetail();

    expect(await screen.findByRole("button", { name: "Edit exercise" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Change metric profile" }))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getAllByRole("button", {
      name: "Archive exercise",
    }).at(-1)!);

    expect(await screen.findByRole("header", {
      name: /Archive .*Plank Variation/u,
    })).toBeOnTheScreen();
    expect(screen.getAllByText(/Owner Strength · Strength Day/u).length)
      .toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Existing plans remain runnable/u))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getAllByRole("button", {
      name: "Archive exercise",
    }).at(-1)!);

    await waitFor(() => {
      expect(props.setArchived).toHaveBeenCalledWith(expect.objectContaining({
        archived: true,
        preview: expect.objectContaining({
          previewRevision: "archive-preview",
        }),
      }));
    });
    expect(await screen.findByText("Archived")).toBeOnTheScreen();
    expect(screen.getByText("Owner Strength · Strength Day · Archived"))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", {
      name: "Open Owner Strength Strength Day",
    })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Restore exercise" }))
      .toBeOnTheScreen();
    expect(screen.queryByText(/Delete exercise/u)).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", {
      name: "Restore exercise",
    }));
    expect(await screen.findByRole("button", { name: "Archive exercise" }))
      .toBeOnTheScreen();
  });

  it("runs favorite, hide, plan navigation, edit, migration, cancel, and action-error callbacks", async () => {
    const onOpenPlan = jest.fn();
    const onEdit = jest.fn();
    const onChangeMetricProfile = jest.fn();
    const setFavorite = jest.fn(async () => detailSnapshot({
      favorite: true,
      preferenceRevision: 3,
    }));
    const setHidden = jest.fn(async () => detailSnapshot({
      hidden: true,
      preferenceRevision: 4,
    }));
    const { props, rendered } = await renderDetail(detailSnapshot(), {
      onOpenPlan,
      onEdit,
      onChangeMetricProfile,
      setFavorite,
      setHidden,
    });

    await fireEvent.press(await screen.findByRole("button", {
      name: "Add to favorites",
    }));
    await waitFor(() => expect(setFavorite).toHaveBeenCalled());
    await fireEvent.press(screen.getByRole("button", {
      name: "Hide exercise",
    }));
    await waitFor(() => expect(setHidden).toHaveBeenCalled());
    await fireEvent.press(screen.getByRole("button", {
      name: "Open Owner Strength Strength Day",
    }));
    expect(onOpenPlan).toHaveBeenCalledWith(
      detailSnapshot().references[0],
    );
    await fireEvent.press(screen.getByRole("button", {
      name: "Edit exercise",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Change metric profile",
    }));
    expect(onEdit).toHaveBeenCalledWith("exercise-plank");
    expect(onChangeMetricProfile).toHaveBeenCalledWith("exercise-plank");

    await fireEvent.press(screen.getByRole("button", {
      name: "Archive exercise",
    }));
    expect(await screen.findByRole("button", { name: "Keep exercise" }))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Keep exercise",
    }));
    expect(props.setArchived).not.toHaveBeenCalled();

    await rendered.unmount();
    await renderDetail(detailSnapshot(), {
      setFavorite: jest.fn(async () => {
        throw new Error("write_failed");
      }),
    });
    await fireEvent.press(await screen.findByRole("button", {
      name: "Add to favorites",
    }));
    expect(await screen.findByText("Action failed")).toBeOnTheScreen();
  });

  it("covers loading, empty, error, partial, overflow, and long-text detail states", async () => {
    const pending = new Promise<ExerciseDetailSnapshot | null>(
      () => undefined,
    );
    const loading = await renderDetail(null, {
      loadExercise: jest.fn(() => pending),
    });
    expect(screen.getByTestId(
      "exercise-detail-skeleton-1",
      { includeHiddenElements: true },
    ))
      .toBeOnTheScreen();
    await loading.rendered.unmount();

    const empty = await renderDetail(null);
    expect(await screen.findByText("Exercise not found")).toBeOnTheScreen();
    await empty.rendered.unmount();

    let attempt = 0;
    const failed = await renderDetail(null, {
      loadExercise: jest.fn(async () => {
        attempt += 1;
        if (attempt === 1) {
          throw new Error("read_failed");
        }
        return detailSnapshot();
      }),
    });
    expect(await screen.findByText("Exercise could not be loaded"))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Retry" }))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("header", {
      name: detailSnapshot().name,
    })).toBeOnTheScreen();
    await failed.rendered.unmount();

    const references = Array.from({ length: 18 }, (_, index) => ({
      ...detailSnapshot().references[0]!,
      planId: `plan-${index}`,
      planName: `Owner Plan ${index + 1} With Long Name`,
      occurrenceId: `occurrence-${index}`,
    }));
    await renderDetail(detailSnapshot({
      references,
      aliases: [],
      secondaryMuscles: [],
    }), { width: 400 });
    expect(await screen.findByRole("button", {
      name: "View exercise history",
    })).toBeOnTheScreen();
    expect(screen.getByText("18 affected plan occurrences"))
      .toBeOnTheScreen();
    expect(screen.getByLabelText("compact layout")).toBeOnTheScreen();
  });
});

function migrationSnapshot(
  overrides: Partial<MetricMigrationSnapshot> = {},
): MetricMigrationSnapshot {
  return {
    exerciseId: "exercise-plank",
    exerciseName: "Owner Plank",
    exerciseRevision: 3,
    fromIdentity: {
      profile: "timed_hold",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    activeWorkoutSessionId: null,
    occurrences: [{
      graph: "owned",
      planId: "plan-owner",
      planName: "Owner Strength",
      dayId: "day-owner",
      dayName: "Strength Day",
      occurrenceId: "occurrence-plank",
      occurrenceRevision: 2,
      policyRevision: 4,
      targets: [
        {
          targetId: "target-plank-1",
          targetRevision: 6,
          ordinal: 0,
          currentTarget: "45 sec",
        },
        {
          targetId: "target-plank-2",
          targetRevision: 2,
          ordinal: 1,
          currentTarget: "60 sec",
        },
      ],
    }],
    ...overrides,
  };
}

async function renderMigration(
  snapshot: MetricMigrationSnapshot = migrationSnapshot(),
  overrides: Partial<React.ComponentProps<typeof MetricMigrationScreen>> = {},
) {
  const props: React.ComponentProps<typeof MetricMigrationScreen> = {
    createId: jest.fn((kind: string) => `${kind}:migration-id`),
    exerciseId: snapshot.exerciseId,
    loadMigration: jest.fn(async () => snapshot),
    migrate: jest.fn(async (
      input: Omit<
        MigrateCustomExerciseMetricProfileInput,
        "migratedAtMs"
      >,
    ) => ({
      outcome: "committed" as const,
      exerciseId: input.exerciseId,
      exerciseRevision: input.expectedExerciseRevision + 1,
      metricIdentity: input.toIdentity,
      migratedTargetIds: input.replacements.map(({ targetId }) => targetId),
      invalidatedRecommendationIds: ["recommendation-plank"],
      invalidatedPolicyIds: ["policy-plank"],
      baselineStatus: "awaiting_comparable_observation" as const,
    })),
    onBack: jest.fn(),
    onSaved: jest.fn(),
    ...overrides,
  };
  return {
    props,
    rendered: await render(
      <AppearanceProvider>
        <MetricMigrationScreen {...props} />
      </AppearanceProvider>,
    ),
  };
}

describe("future-only metric profile migration", () => {
  it("blocks active-workout use before any replacement or save action", async () => {
    const { props } = await renderMigration(migrationSnapshot({
      activeWorkoutSessionId: "session-active",
    }));

    expect(await screen.findByText("Finish the current workout first"))
      .toBeOnTheScreen();
    expect(screen.getByText(
      /Metric profile changes are blocked while this exercise is in an active workout/u,
    )).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Save profile change" }))
      .not.toBeOnTheScreen();
    expect(props.migrate).not.toHaveBeenCalled();
  });

  it("requires every target replacement and explicit manual Hold before one-way confirmation", async () => {
    const { props } = await renderMigration();

    expect(await screen.findByRole("header", {
      name: "Change metric profile",
    })).toBeOnTheScreen();
    expect(screen.getByText(/Future plan targets will use the new metric profile/u))
      .toBeOnTheScreen();
    expect(screen.getByText(/history never changes/u)).toBeOnTheScreen();
    expect(screen.getByText(/Pending suggestions.*removed/u))
      .toBeOnTheScreen();
    expect(screen.getAllByText(/fresh baseline/u).length)
      .toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Owner Strength · Strength Day · Target 1"))
      .toBeOnTheScreen();
    expect(screen.getByText("Owner Strength · Strength Day · Target 2"))
      .toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("radio", {
      name: /Bodyweight reps/u,
    }));
    expect(screen.getByRole("button", { name: "Save profile change" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));
    for (const ordinal of [1, 2]) {
      await fireEvent.changeText(
        screen.getByLabelText(`Target ${ordinal} minimum reps`),
        String(8 + ordinal),
      );
      await fireEvent.changeText(
        screen.getByLabelText(`Target ${ordinal} maximum reps`),
        String(12 + ordinal),
      );
      await fireEvent.changeText(
        screen.getByLabelText(`Target ${ordinal} variation`),
        `variation-${ordinal}`,
      );
    }
    await fireEvent.press(screen.getByRole("radio", {
      name: /Owner Strength Strength Day Hold \/ manual decision/u,
    }));

    await fireEvent.press(screen.getByRole("button", {
      name: "Save profile change",
    }));
    expect(await screen.findByRole("header", {
      name: "Change metric profile?",
    })).toBeOnTheScreen();
    expect(screen.getByText(/one-way/u)).toBeOnTheScreen();
    expect(screen.getByText(/another explicit migration/iu))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Keep reviewing",
    }));
    expect(screen.queryByRole("header", {
      name: "Change metric profile?",
    })).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Save profile change",
    }));
    await fireEvent.press(screen.getAllByRole("button", {
      name: "Save profile change",
    }).at(-1)!);

    await waitFor(() => {
      expect(props.migrate).toHaveBeenCalledWith(expect.objectContaining({
        exerciseId: "exercise-plank",
        acknowledgedHistoryImmutable: true,
        toIdentity: {
          profile: "bodyweight_reps",
          contractVersion: 1,
          exerciseMetricGeneration: 2,
        },
        replacements: [
          expect.objectContaining({
            targetId: "target-plank-1",
            target: expect.objectContaining({
              profile: "bodyweight_reps",
              minReps: 9,
              maxReps: 13,
              variationId: "variation-1",
            }),
          }),
          expect.objectContaining({
            targetId: "target-plank-2",
            target: expect.objectContaining({
              profile: "bodyweight_reps",
              minReps: 10,
              maxReps: 14,
              variationId: "variation-2",
            }),
          }),
        ],
        policyDecisions: [{
          planDayExerciseId: "occurrence-plank",
          expectedPolicyRevision: 4,
          policy: {
            kind: "manual_hold",
            version: 1,
          },
        }],
      }));
    });
    expect(props.onSaved).toHaveBeenCalledWith("exercise-plank");
  });

  it("retains complete replacement values after a save error and supports zero affected targets", async () => {
    const migrate = jest.fn(async () => {
      throw new Error("save_failed");
    });
    const { rendered } = await renderMigration(migrationSnapshot({
      occurrences: [{
        ...migrationSnapshot().occurrences[0]!,
        targets: [migrationSnapshot().occurrences[0]!.targets[0]!],
      }],
    }), { migrate });
    await screen.findByText("Owner Strength · Strength Day · Target 1");
    await fireEvent.press(screen.getByRole("radio", {
      name: /Timed hold.*milliseconds/u,
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Target 1 duration seconds",
    }));
    await fireEvent.changeText(
      screen.getByLabelText("Target 1 duration seconds minutes"),
      "1",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Target 1 duration seconds seconds"),
      "15",
    );
    await fireEvent.press(screen.getByRole("button", {
      name: "Confirm target 1 duration seconds",
    }));
    await fireEvent.press(screen.getByRole("radio", {
      name: /Owner Strength Strength Day Hold \/ manual decision/u,
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Save profile change",
    }));
    await fireEvent.press(screen.getAllByRole("button", {
      name: "Save profile change",
    }).at(-1)!);
    expect(await screen.findByText("Profile change could not be saved"))
      .toBeOnTheScreen();
    expect(screen.getByText("1 min 15 sec")).toBeOnTheScreen();
    await rendered.unmount();

    await renderMigration(migrationSnapshot({ occurrences: [] }));
    expect(await screen.findByText("No affected future plan targets"))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save profile change" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));
    expect(screen.getAllByText(/Choose a new metric profile/u).length)
      .toBeGreaterThanOrEqual(1);
  });

  it("builds explicit load and interval replacement contracts without inference", async () => {
    const load = await renderMigration(migrationSnapshot({
      occurrences: [{
        ...migrationSnapshot().occurrences[0]!,
        targets: [migrationSnapshot().occurrences[0]!.targets[0]!],
      }],
    }));
    await screen.findByText("Owner Strength · Strength Day · Target 1");
    await fireEvent.press(screen.getByRole("radio", {
      name: /Load \+ reps/u,
    }));
    for (const [label, value] of [
      ["Target 1 load kg", "42.5"],
      ["Target 1 minimum reps", "8"],
      ["Target 1 maximum reps", "12"],
      ["Target 1 increment kg", "2.5"],
    ] as const) {
      await fireEvent.changeText(screen.getByLabelText(label), value);
    }
    await fireEvent.press(screen.getByRole("radio", {
      name: /Owner Strength Strength Day Compatible metric policy/u,
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Save profile change",
    }));
    await fireEvent.press(screen.getAllByRole("button", {
      name: "Save profile change",
    }).at(-1)!);
    await waitFor(() => expect(load.props.migrate).toHaveBeenCalledWith(
      expect.objectContaining({
        replacements: [expect.objectContaining({
          target: expect.objectContaining({
            profile: "load_reps",
            loadGrams: 42_500,
            incrementGrams: 2_500,
          }),
        })],
        policyDecisions: [expect.objectContaining({
          policy: expect.objectContaining({
            kind: "metric",
            profile: "load_reps",
          }),
        })],
      }),
    ));
    await load.rendered.unmount();

    const intervals = await renderMigration(migrationSnapshot({
      occurrences: [{
        ...migrationSnapshot().occurrences[0]!,
        targets: [migrationSnapshot().occurrences[0]!.targets[0]!],
      }],
    }));
    await screen.findByText("Owner Strength · Strength Day · Target 1");
    await fireEvent.press(screen.getByRole("radio", {
      name: /Rounds \/ intervals/u,
    }));
    for (const [label, value] of [
      ["Target 1 protocol", "owner-interval"],
      ["Target 1 planned rounds", "6"],
      ["Target 1 work seconds", "30"],
      ["Target 1 rest seconds", "0"],
    ] as const) {
      if (label.endsWith("seconds")) {
        await fireEvent.press(screen.getByRole("button", { name: label }));
        await fireEvent.changeText(
          screen.getByLabelText(`${label} seconds`),
          value,
        );
        await fireEvent.press(screen.getByRole("button", {
          name: `Confirm ${label.toLocaleLowerCase("en")}`,
        }));
      } else {
        await fireEvent.changeText(screen.getByLabelText(label), value);
      }
    }
    await fireEvent.press(screen.getByRole("radio", {
      name: /Owner Strength Strength Day Hold \/ manual decision/u,
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Save profile change",
    }));
    await fireEvent.press(screen.getAllByRole("button", {
      name: "Save profile change",
    }).at(-1)!);
    await waitFor(() => expect(intervals.props.migrate).toHaveBeenCalledWith(
      expect.objectContaining({
        replacements: [expect.objectContaining({
          target: expect.objectContaining({
            profile: "intervals",
            plannedRounds: 6,
            workIntervalMs: 30_000,
            restIntervalMs: 0,
          }),
        })],
      }),
    ));
  });

  it("retries a failed migration preview without changing source facts", async () => {
    let attempt = 0;
    const loadMigration = jest.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error("preview_failed");
      }
      return migrationSnapshot();
    });
    await renderMigration(migrationSnapshot(), { loadMigration });
    expect(await screen.findByText(
      "Profile migration could not be loaded",
    )).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("header", {
      name: "Change metric profile",
    })).toBeOnTheScreen();
  });
});

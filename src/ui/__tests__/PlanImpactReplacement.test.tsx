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
  DayRemovalPreview,
  ExerciseReplacementPreview,
  PlanImpactCommandResult,
  RemovePlanDayWithImpactInput,
} from "../../domains/plans/planImpactCommands";
import {
  ImpactPreview,
} from "../components/ImpactPreview";
import {
  PlanDayRemovalScreen,
} from "../screens/PlanDayRemovalScreen";
import {
  ExerciseReplacementScreen,
} from "../screens/ExerciseReplacementScreen";
import {
  OwnedPlanEditorScreen,
} from "../screens/OwnedPlanEditorScreen";
import {
  AppearanceProvider,
} from "../theme";

const preview: DayRemovalPreview = {
  kind: "day_removal",
  planId: "plan-owner",
  planName: "Owner Strength",
  planRevision: 4,
  dayId: "day-strength",
  dayName: "Strength Day",
  dayRevision: 2,
  currentWorkoutUnaffected: true,
  restructuringBlocked: false,
  previewToken: `plan-impact-v1:${"a".repeat(64)}`,
  schedule: {
    id: "schedule-owner",
    revision: 7,
    versionId: "schedule-version-3",
    versionNumber: 3,
    effectiveLocalDate: "2026-08-01",
    mode: "weekday",
    timeZone: "Asia/Singapore",
  },
  affectedBindings: [
    {
      id: "binding-monday",
      label: "Week 1 · Monday",
      planDayId: "day-strength",
    },
    {
      id: "binding-friday",
      label: "Week 1 · Friday",
      planDayId: "day-strength",
    },
  ],
  affectedDates: [
    {
      id: "override-2026-08-21",
      label: "21 Aug 2026",
      localDate: "2026-08-21",
      revision: 3,
    },
  ],
  replacementDays: [
    {
      id: "day-power",
      name: "Power Day",
      revision: 5,
    },
    {
      id: "day-long",
      name: "A very long replacement day name that wraps at 200% text",
      revision: 1,
    },
  ],
  earliestEffectiveLocalDate: "2026-08-19",
};

function props(
  overrides: Partial<React.ComponentProps<typeof PlanDayRemovalScreen>> = {},
): React.ComponentProps<typeof PlanDayRemovalScreen> {
  return {
    dayId: preview.dayId,
    loadPreview: jest.fn(async () => preview),
    onBack: jest.fn(),
    onSaved: jest.fn(),
    planId: preview.planId,
    removeDay: jest.fn(async () => ({
      outcome: "committed" as const,
      planId: preview.planId,
      planRevision: 5,
      scheduleRevision: 8,
      currentWorkoutUnaffected: true,
      invalidations: [
        "library:plans",
        `plan:${preview.planId}`,
        "schedule:schedule-owner",
        "today",
      ],
    })),
    ...overrides,
  };
}

async function renderDayRemoval(
  overrides: Partial<React.ComponentProps<typeof PlanDayRemovalScreen>> = {},
) {
  const screenProps = props(overrides);
  const rendered = await render(
    <AppearanceProvider>
      <PlanDayRemovalScreen {...screenProps} />
    </AppearanceProvider>,
  );
  return { rendered, screenProps };
}

const dayRemovalChoices: [string, string][] = [
  ["replacement day", "Replace with Power Day"],
  ["remove binding", "Remove binding"],
  ["effective LocalDate", "Choose effective date"],
];

describe("Plan impact day removal", () => {
  it("renders the complete current token-backed binding and date impact", async () => {
    await renderDayRemoval();

    expect(await screen.findByRole("header", {
      name: "Remove Strength Day?",
    })).toBeOnTheScreen();
    expect(screen.getByText("Current workout is unaffected"))
      .toBeOnTheScreen();
    expect(screen.getByText("Week 1 · Monday")).toBeOnTheScreen();
    expect(screen.getByText("Week 1 · Friday")).toBeOnTheScreen();
    expect(screen.getByText("21 Aug 2026")).toBeOnTheScreen();
    expect(screen.getByText("Current preview")).toBeOnTheScreen();
    expect(screen.getByText("Plan revision 4 · Schedule revision 7"))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove day" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));
  });

  it.each(dayRemovalChoices)(
    "requires and submits the explicit %s choice",
    async (_label, action) => {
      const removeDay = jest.fn(async (
        input: RemovePlanDayWithImpactInput,
      ) => ({
        outcome: "committed" as const,
        planId: input.planId,
        planRevision: 5,
        scheduleRevision: 8,
        currentWorkoutUnaffected: true,
        invalidations: ["library:plans", `plan:${input.planId}`],
      }));
      await renderDayRemoval({ removeDay });

      await fireEvent.press(await screen.findByRole("radio", {
        name: action,
      }));
      if (action === "Choose effective date") {
        await fireEvent.press(screen.getByRole("button", {
          name: "Effective date",
        }));
        await fireEvent.press(screen.getByRole("button", {
          name: "Next month",
        }));
        await fireEvent.press(screen.getByRole("button", {
          name: "Select 2026-09-01",
        }));
        await fireEvent.press(screen.getByRole("button", {
          name: "Confirm date",
        }));
      }
      await fireEvent.press(
        screen.getByRole("button", { name: "Remove day" }),
      );

      await waitFor(() => expect(removeDay).toHaveBeenCalledTimes(1));
      expect(removeDay).toHaveBeenCalledWith(expect.objectContaining({
        dayId: preview.dayId,
        expectedPlanRevision: preview.planRevision,
        expectedScheduleRevision: preview.schedule?.revision,
        planId: preview.planId,
        previewToken: preview.previewToken,
      }));
      const choice = removeDay.mock.calls[0]![0].choice;
      if (action === "Replace with Power Day") {
        expect(choice).toEqual({
          kind: "replacement_day",
          replacementDayId: "day-power",
        });
      } else if (action === "Remove binding") {
        expect(choice).toEqual({ kind: "remove_binding" });
      } else {
        expect(choice).toEqual({
          kind: "effective_date",
          effectiveLocalDate: "2026-09-01",
        });
      }
    },
  );

  it("keeps the effective-date choice unchanged when its calendar is cancelled", async () => {
    const { screenProps } = await renderDayRemoval();

    await fireEvent.press(await screen.findByRole("radio", {
      name: "Choose effective date",
    }));
    expect(screen.getByRole("button", { name: "Effective date" }))
      .toHaveTextContent("2026-08-19");
    await fireEvent.press(screen.getByRole("button", {
      name: "Effective date",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Next month",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Select 2026-09-01",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Cancel date",
    }));

    expect(screen.getByRole("button", { name: "Effective date" }))
      .toHaveTextContent("2026-08-19");
    await fireEvent.press(screen.getByRole("button", { name: "Remove day" }));
    await waitFor(() => expect(screenProps.removeDay).toHaveBeenCalledWith(
      expect.objectContaining({
        choice: {
          kind: "effective_date",
          effectiveLocalDate: "2026-08-19",
        },
      }),
    ));
  });

  it("refreshes a stale route preview before retrying and retains the choice", async () => {
    const refreshed = {
      ...preview,
      planRevision: 5,
      previewToken: `plan-impact-v1:${"b".repeat(64)}`,
      schedule: {
        ...preview.schedule!,
        revision: 8,
      },
    };
    const loadPreview = jest.fn<
      React.ComponentProps<typeof PlanDayRemovalScreen>["loadPreview"]
    >()
      .mockResolvedValueOnce(preview)
      .mockResolvedValueOnce(refreshed);
    const removeDay = jest.fn<
      React.ComponentProps<typeof PlanDayRemovalScreen>["removeDay"]
    >()
      .mockRejectedValueOnce({
        code: "plan_impact_preview_stale",
      })
      .mockResolvedValueOnce({
        outcome: "committed",
        planId: preview.planId,
        planRevision: 6,
        scheduleRevision: 9,
        currentWorkoutUnaffected: true,
        invalidations: [],
      } satisfies PlanImpactCommandResult);
    await renderDayRemoval({ loadPreview, removeDay });

    await fireEvent.press(await screen.findByRole("radio", {
      name: "Remove binding",
    }));
    await fireEvent.press(
      screen.getByRole("button", { name: "Remove day" }),
    );

    expect(await screen.findByText(
      "Impact changed. Review the current preview before trying again.",
    )).toBeOnTheScreen();
    await waitFor(() => expect(loadPreview).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Plan revision 5 · Schedule revision 8"))
      .toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Remove binding" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        checked: true,
      }));

    await fireEvent.press(
      screen.getByRole("button", { name: "Remove day" }),
    );
    await waitFor(() => expect(removeDay).toHaveBeenCalledTimes(2));
    expect(removeDay.mock.calls[1]![0]).toEqual(expect.objectContaining({
      expectedPlanRevision: 5,
      expectedScheduleRevision: 8,
      previewToken: refreshed.previewToken,
    }));
  });

  it("blocks restructuring during an active workout but keeps the impact readable", async () => {
    await renderDayRemoval({
      loadPreview: jest.fn(async () => ({
        ...preview,
        restructuringBlocked: true,
      })),
    });

    expect(await screen.findByText("Current workout is unaffected"))
      .toBeOnTheScreen();
    expect(screen.getByText("Finish the current workout first"))
      .toBeOnTheScreen();
    expect(screen.getByText("Week 1 · Monday")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove day" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));
  });

  it("covers loading, error, empty, one, many, overflow, and long text", async () => {
    let resolve!: (value: DayRemovalPreview) => void;
    const loading = new Promise<DayRemovalPreview>((next) => {
      resolve = next;
    });
    const { rendered } = await renderDayRemoval({
      loadPreview: jest.fn(() => loading),
      width: 360,
    });
    expect(screen.getByTestId("plan-impact-loading")).toBeOnTheScreen();
    resolve({
      ...preview,
      affectedBindings: [],
      affectedDates: [],
    });
    expect(await screen.findByText("No active schedule bindings"))
      .toBeOnTheScreen();
    expect(screen.getByRole("radio", {
      name:
        "Replace with A very long replacement day name that wraps at 200% text",
    })).toBeOnTheScreen();
    expect(screen.getByLabelText("compact layout")).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Remove binding" }))
      .toHaveStyle({ minHeight: 48 });
    await rendered.unmount();

    const retry = jest.fn<
      React.ComponentProps<typeof PlanDayRemovalScreen>["loadPreview"]
    >()
      .mockRejectedValueOnce(new Error("secret_storage_detail"))
      .mockResolvedValueOnce({
        ...preview,
        affectedBindings: [preview.affectedBindings[0]!],
        affectedDates: [],
      });
    const errorRender = await renderDayRemoval({ loadPreview: retry });
    expect(await screen.findByText("Impact could not be loaded"))
      .toBeOnTheScreen();
    expect(JSON.stringify(errorRender.rendered.toJSON()))
      .not.toMatch(/secret_storage_detail/u);
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("1 affected binding"))
      .toBeOnTheScreen();
  });
});

describe("ImpactPreview", () => {
  it("uses literal non-color before and after facts", async () => {
    await render(
      <AppearanceProvider>
        <ImpactPreview
          affected={[
            {
              id: "one",
              label: "Week 1 · Monday",
              before: "Strength Day",
              after: "Power Day",
            },
          ]}
          heading="Schedule impact"
          revisionLabel="Plan revision 4 · Schedule revision 7"
        />
      </AppearanceProvider>,
    );

    expect(screen.getByText("Before: Strength Day")).toBeOnTheScreen();
    expect(screen.getByText("After: Power Day")).toBeOnTheScreen();
  });
});

const replacementPreview: ExerciseReplacementPreview = {
  kind: "exercise_replacement",
  planId: "plan-owner",
  planName: "Owner Strength",
  planRevision: 4,
  sourceOccurrenceId: "occurrence-bench-a",
  sourceExerciseId: "exercise-bench",
  sourceExerciseName: "Bench Press",
  sourceMetricIdentity: {
    profile: "load_reps",
    contractVersion: 1,
    exerciseMetricGeneration: 1,
  },
  currentWorkoutUnaffected: true,
  previewToken: `plan-impact-v1:${"c".repeat(64)}`,
  candidates: [
    {
      exerciseId: "exercise-compatible-a",
      name: "Incline Press",
      metricIdentity: {
        profile: "load_reps",
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      exerciseRevision: 5,
      libraryRevision: 5,
      compatible: true,
    },
    {
      exerciseId: "exercise-compatible-long",
      name:
        "A very long compatible machine press replacement name for 200% text",
      metricIdentity: {
        profile: "load_reps",
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      exerciseRevision: 2,
      libraryRevision: 2,
      compatible: true,
    },
    {
      exerciseId: "exercise-incompatible",
      name: "Bodyweight Push-Up",
      metricIdentity: {
        profile: "bodyweight_reps",
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      exerciseRevision: 3,
      libraryRevision: 3,
      compatible: false,
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

function replacementProps(
  overrides: Partial<React.ComponentProps<typeof ExerciseReplacementScreen>>
    = {},
): React.ComponentProps<typeof ExerciseReplacementScreen> {
  return {
    loadPreview: jest.fn(async () => replacementPreview),
    occurrenceId: replacementPreview.sourceOccurrenceId,
    onBack: jest.fn(),
    onSaved: jest.fn(),
    planId: replacementPreview.planId,
    replaceExercise: jest.fn<
      React.ComponentProps<typeof ExerciseReplacementScreen>[
        "replaceExercise"
      ]
    >(async (input) => ({
      outcome: "committed" as const,
      planId: input.planId,
      planRevision: 5,
      replacementExerciseId: input.replacementExerciseId,
      affectedOccurrenceIds: input.occurrences.map(
        ({ occurrenceId }) => occurrenceId,
      ),
      currentWorkoutUnaffected: true,
      invalidations: [],
    })),
    ...overrides,
  };
}

async function renderReplacement(
  overrides: Partial<React.ComponentProps<typeof ExerciseReplacementScreen>>
    = {},
) {
  const screenProps = replacementProps(overrides);
  const rendered = await render(
    <AppearanceProvider>
      <ExerciseReplacementScreen {...screenProps} />
    </AppearanceProvider>,
  );
  return { rendered, screenProps };
}

async function completeReplacementReview() {
  await fireEvent.press(screen.getByRole("radio", {
    name: "Incline Press. Compatible metric identity",
  }));
  await fireEvent.press(screen.getByRole("radio", {
    name: "All occurrences in this plan",
  }));
  for (const label of [
    "Targets reviewed",
    "Warm-ups reviewed",
    "Rest reviewed",
    "Progression reviewed",
    "History remains unchanged",
  ]) {
    await fireEvent.press(screen.getByRole("checkbox", { name: label }));
  }
}

describe("Exercise replacement", () => {
  it("lists complete metric-compatible identities first and previews every occurrence", async () => {
    const { rendered } = await renderReplacement();

    expect(await screen.findByRole("header", { name: "Review replacement" }))
      .toBeOnTheScreen();
    expect(screen.getByText("Current workout is unaffected"))
      .toBeOnTheScreen();
    expect(screen.getByText("Compatible metric identity")).toBeOnTheScreen();
    expect(screen.getByText("Other metric identities")).toBeOnTheScreen();
    const tree = JSON.stringify(rendered.toJSON());
    expect(tree.indexOf("Incline Press")).toBeLessThan(
      tree.indexOf("Bodyweight Push-Up"),
    );
    expect(tree.indexOf("This occurrence")).toBeLessThan(
      tree.indexOf("1 affected occurrence"),
    );
    expect(tree.indexOf("1 affected occurrence")).toBeLessThan(
      tree.indexOf("Incline Press"),
    );
    await fireEvent.press(screen.getByRole("radio", {
      name: "All occurrences in this plan",
    }));
    expect(screen.getAllByText("Upper A · occurrence 1")).toHaveLength(2);
    expect(screen.getAllByText("Upper B · occurrence 3")).toHaveLength(2);
    expect(screen.getByText("1 warm-up · 20 kg · 8–12 reps · 90 sec rest"))
      .toBeOnTheScreen();
    expect(screen.getAllByText("Manual Hold")).toHaveLength(2);
    expect(screen.getByText(
      "Compatibility does not mean historical comparability. Existing sessions and snapshots are unchanged.",
    )).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save replacement" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));
  });

  it("uses exact scopes and submits only after complete explicit review", async () => {
    const replaceExercise = jest.fn<
      React.ComponentProps<typeof ExerciseReplacementScreen>[
        "replaceExercise"
      ]
    >(async (input) => ({
      outcome: "committed",
      planId: input.planId,
      planRevision: 5,
      replacementExerciseId: input.replacementExerciseId,
      affectedOccurrenceIds: input.occurrences.map(
        ({ occurrenceId }) => occurrenceId,
      ),
      currentWorkoutUnaffected: true,
      invalidations: [],
    }));
    await renderReplacement({ replaceExercise });

    expect(await screen.findByRole("radio", { name: "This occurrence" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("radio", {
      name: "All occurrences in this plan",
    })).toBeOnTheScreen();
    await completeReplacementReview();
    await fireEvent.press(
      screen.getByRole("button", { name: "Save replacement" }),
    );

    await waitFor(() => expect(replaceExercise).toHaveBeenCalledTimes(1));
    expect(replaceExercise).toHaveBeenCalledWith(expect.objectContaining({
      planId: replacementPreview.planId,
      sourceOccurrenceId: replacementPreview.sourceOccurrenceId,
      expectedPlanRevision: replacementPreview.planRevision,
      previewToken: replacementPreview.previewToken,
      scope: "all_occurrences",
      replacementExerciseId: "exercise-compatible-a",
      occurrences: replacementPreview.occurrences,
      review: {
        targets: true,
        warmups: true,
        rest: true,
        progression: true,
        historyImmutable: true,
      },
    }));
  });

  it("keeps incompatible candidates unavailable and retains review after save error", async () => {
    const replaceExercise = jest.fn<
      React.ComponentProps<typeof ExerciseReplacementScreen>[
        "replaceExercise"
      ]
    >()
      .mockRejectedValueOnce(new Error("secret_replace_failure"))
      .mockResolvedValueOnce({
        outcome: "committed",
        planId: replacementPreview.planId,
        planRevision: 5,
        replacementExerciseId: "exercise-compatible-a",
        affectedOccurrenceIds: replacementPreview.occurrences.map(
          ({ occurrenceId }) => occurrenceId,
        ),
        currentWorkoutUnaffected: true,
        invalidations: [],
      });
    const { rendered } = await renderReplacement({ replaceExercise });

    expect(screen.getByRole("radio", {
      name: "Bodyweight Push-Up. Incompatible metric identity",
    })).toHaveProp("accessibilityState", expect.objectContaining({
      disabled: true,
    }));
    await completeReplacementReview();
    await fireEvent.press(
      screen.getByRole("button", { name: "Save replacement" }),
    );

    expect(await screen.findByText(
      "Replacement could not be saved. Your review is still here. Try again.",
    )).toBeOnTheScreen();
    expect(JSON.stringify(rendered.toJSON())).not.toMatch(
      /secret_replace_failure/u,
    );
    expect(screen.getByRole("checkbox", { name: "Targets reviewed" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        checked: true,
      }));
    await fireEvent.press(
      screen.getByRole("button", { name: "Save replacement" }),
    );
    await waitFor(() => expect(replaceExercise).toHaveBeenCalledTimes(2));
  });

  it("covers loading, empty, error, many, long text, adaptive controls, and reduced motion", async () => {
    let resolve!: (value: ExerciseReplacementPreview) => void;
    const pending = new Promise<ExerciseReplacementPreview>((next) => {
      resolve = next;
    });
    const loading = await renderReplacement({
      loadPreview: jest.fn(() => pending),
      width: 360,
    });
    expect(screen.getByTestId("exercise-replacement-loading"))
      .toBeOnTheScreen();
    resolve({
      ...replacementPreview,
      candidates: [],
      occurrences: [replacementPreview.occurrences[0]!],
    });
    expect(await screen.findByText("No compatible replacements"))
      .toBeOnTheScreen();
    expect(screen.getByLabelText("compact layout")).toBeOnTheScreen();
    await loading.rendered.unmount();

    const retry = jest.fn<
      React.ComponentProps<typeof ExerciseReplacementScreen>["loadPreview"]
    >()
      .mockRejectedValueOnce(new Error("secret_load_replace"))
      .mockResolvedValueOnce(replacementPreview);
    const failed = await renderReplacement({ loadPreview: retry });
    expect(await screen.findByText("Replacement could not be loaded"))
      .toBeOnTheScreen();
    expect(JSON.stringify(failed.rendered.toJSON())).not.toMatch(
      /secret_load_replace/u,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("radio", {
      name:
        "A very long compatible machine press replacement name for 200% text. Compatible metric identity",
    })).toHaveStyle({ minHeight: 48 });
  });
});

describe("Owned plan impact navigation", () => {
  it("opens dedicated remove-day and replacement routes from public editor actions", async () => {
    const onRemoveDay = jest.fn();
    const onReplaceOccurrence = jest.fn();
    const editor = replacementPreview.occurrences[0]!;
    await render(
      <AppearanceProvider>
        <OwnedPlanEditorScreen
          archivePlan={jest.fn(async () => ({
            outcome: "requires_schedule_impact" as const,
            code: "requires_schedule_impact" as const,
          }))}
          createDraft={jest.fn(async () => {
            throw new Error("unused");
          })}
          duplicatePlan={jest.fn(async () => {
            throw new Error("unused");
          })}
          listExercises={jest.fn(async () => [{
            id: replacementPreview.sourceExerciseId,
            name: replacementPreview.sourceExerciseName,
            metricIdentity: replacementPreview.sourceMetricIdentity,
          }])}
          loadPlan={jest.fn<
            React.ComponentProps<typeof OwnedPlanEditorScreen>["loadPlan"]
          >(async () => ({
            id: replacementPreview.planId,
            name: replacementPreview.planName,
            revision: replacementPreview.planRevision,
            lifecycle: "ready",
            graphStatus: "valid",
            missingRequirement: null,
            isActive: true,
            hasInProgressWorkout: false,
            days: [
              {
                id: editor.dayId,
                name: editor.dayName,
                ordinal: editor.dayOrdinal,
                occurrences: [{
                  id: editor.occurrenceId,
                  exerciseId: replacementPreview.sourceExerciseId,
                  ordinal: editor.occurrenceOrdinal,
                  restSeconds: editor.restSeconds,
                  metricIdentity: replacementPreview.sourceMetricIdentity,
                  warmups: editor.warmups,
                  targets: editor.targets,
                  policy: editor.policy,
                }],
              },
              {
                id: "day-other",
                name: "Other Day",
                ordinal: 1,
                occurrences: [],
              },
            ],
          }))}
          mode="edit"
          onBack={jest.fn()}
          onRemoveDay={onRemoveDay}
          onReplaceOccurrence={onReplaceOccurrence}
          onSaved={jest.fn()}
          planId={replacementPreview.planId}
          restorePlan={jest.fn(async () => {
            throw new Error("unused");
          })}
          savePlan={jest.fn(async () => {
            throw new Error("unused");
          })}
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(await screen.findByRole("button", {
      name: "Remove Upper A",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Replace Bench Press",
    }));

    expect(onRemoveDay).toHaveBeenCalledWith("day-a");
    expect(onReplaceOccurrence).toHaveBeenCalledWith("occurrence-bench-a");
  });
});

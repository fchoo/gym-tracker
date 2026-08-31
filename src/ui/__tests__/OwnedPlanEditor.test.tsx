import {
  act,
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
import {
  getByGestureTestId,
} from "react-native-gesture-handler/jest-utils";

import type {
  OwnedPlanCommittedResult,
  OwnedPlanSnapshot,
} from "../../platform/sqlite/repositories/ownedPlanRepository";
import {
  OwnedPlanEditorScreen,
  type OwnedPlanEditorExerciseOption,
} from "../screens/OwnedPlanEditorScreen";
import {
  AppearanceProvider,
  themes,
} from "../theme";

const missingRequirement =
  "Add at least one exercise with valid targets before scheduling or activating.";

function draftSnapshot(
  overrides: Partial<OwnedPlanSnapshot> = {},
): OwnedPlanSnapshot {
  return {
    id: "plan-owner",
    name: "Owner Strength",
    revision: 1,
    lifecycle: "draft",
    graphStatus: "missing_valid_target",
    missingRequirement,
    isActive: false,
    hasInProgressWorkout: false,
    days: [{
      id: "day-owner",
      name: "Strength Day",
      ordinal: 0,
      occurrences: [],
    }],
    scheduleDefaults: null,
    ...overrides,
  };
}

function completeSnapshot(
  overrides: Partial<OwnedPlanSnapshot> = {},
): OwnedPlanSnapshot {
  return draftSnapshot({
    lifecycle: "ready",
    graphStatus: "valid",
    missingRequirement: null,
    days: [{
      id: "day-owner",
      name: "Strength Day",
      ordinal: 0,
      occurrences: [{
        id: "occurrence-owner-squat",
        exerciseId: "exercise-squat",
        ordinal: 0,
        restSeconds: 90,
        metricIdentity: {
          profile: "load_reps",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
        warmups: [],
        targets: [{
          id: "target-owner-squat",
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
          id: "policy-owner-squat",
          kind: "manual_hold",
          policyId: "load_reps.manual_hold.v1",
          version: 1,
          rule: {
            kind: "manual_hold",
            id: "load_reps.manual_hold.v1",
            version: 1,
          },
        },
      }],
    }],
    ...overrides,
  });
}

const exercises: readonly OwnedPlanEditorExerciseOption[] = [{
  id: "exercise-squat",
  name: "Barbell Back Squat",
  metricIdentity: {
    profile: "load_reps",
    contractVersion: 1,
    exerciseMetricGeneration: 1,
  },
}];

function committed(
  plan: OwnedPlanSnapshot,
  operation: OwnedPlanCommittedResult["operation"],
): OwnedPlanCommittedResult {
  return {
    outcome: "committed",
    operation,
    plan,
    currentWorkoutUnaffected: false,
    invalidations: ["library:plans", `plan:${plan.id}`],
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function props(
  overrides: Partial<React.ComponentProps<typeof OwnedPlanEditorScreen>> = {},
): React.ComponentProps<typeof OwnedPlanEditorScreen> {
  return {
    archivePlan: jest.fn(async () => committed(completeSnapshot({
      lifecycle: "archived",
    }), "archive")),
    mode: "edit",
    planId: "plan-owner",
    createDraft: jest.fn(async () => committed(draftSnapshot(), "create")),
    createId: jest.fn((kind: string) => `${kind}:test-id`),
    duplicatePlan: jest.fn(async () => committed(completeSnapshot({
      id: "plan-owner-copy",
      name: "Owner Strength Copy",
      isActive: false,
      days: [{
        ...completeSnapshot().days[0]!,
        id: "day-owner-copy",
      }],
    }), "duplicate")),
    loadPlan: jest.fn(async () => draftSnapshot()),
    listExercises: jest.fn(async () => exercises),
    onBack: jest.fn(),
    onSaved: jest.fn(),
    restorePlan: jest.fn(async () => committed(completeSnapshot(), "restore")),
    savePlan: jest.fn(async () => committed(completeSnapshot(), "save")),
    ...overrides,
  };
}

async function renderEditor(
  overrides: Partial<React.ComponentProps<typeof OwnedPlanEditorScreen>> = {},
  reduceMotion = false,
) {
  const editorProps = props(overrides);
  const rendered = await render(
    <AppearanceProvider reduceMotion={reduceMotion}>
      <OwnedPlanEditorScreen {...editorProps} />
    </AppearanceProvider>,
  );
  return { editorProps, rendered };
}

type TestGesture = Readonly<{
  handlers: Readonly<{
    onStart?: (event: Readonly<{ translationY: number }>) => void;
    onUpdate?: (event: Readonly<{ translationY: number }>) => void;
    onEnd?: (
      event: Readonly<{ translationY: number }>,
      success: boolean,
    ) => void;
    onFinalize?: (
      event: Readonly<{ translationY: number }>,
      success: boolean,
    ) => void;
  }>;
}>;

function reorderGesture(label: string): TestGesture {
  return getByGestureTestId(`reorder-gesture-${label}`) as unknown as TestGesture;
}

function dayOrder(): string[] {
  return screen.getAllByTestId(/^reorder-row-day-/u)
    .map(({ props: rowProps }) => rowProps.testID as string);
}

function exerciseOrder(): string[] {
  return screen.getAllByTestId(/^reorder-row-exercise-/u)
    .map(({ props: rowProps }) => rowProps.testID as string);
}

describe("OwnedPlanEditorScreen create and save plan", () => {
  it("uses cards for plan structure while fields and save dock retain their semantic surfaces", async () => {
    await renderEditor({
      loadPlan: jest.fn(async () => completeSnapshot()),
      width: 720,
    });

    for (const cardId of [
      "owned-plan-days-card",
      "owned-plan-day-editor-card",
    ]) {
      expect(await screen.findByTestId(cardId)).toHaveStyle({
        backgroundColor: themes.light.contentCard,
        borderColor: themes.light.contentCardBorder,
        borderWidth: 0.5,
      });
    }
    expect(screen.getByLabelText("Plan name"))
      .not.toHaveStyle({ backgroundColor: themes.light.contentCard });
    expect(screen.getByRole("button", { name: "Save plan" }))
      .not.toHaveStyle({ backgroundColor: themes.light.contentCard });
  });

  it("creates one named inactive Draft and opens its empty first day", async () => {
    const createDraft = jest.fn(async (input: Readonly<{
      name: string;
      dayName: string;
    }>) => committed(draftSnapshot({
      name: input.name,
      days: [{
        id: "day-owner",
        name: input.dayName,
        ordinal: 0,
        occurrences: [],
      }],
    }), "create"));
    await renderEditor({
      mode: "create",
      createDraft,
      loadPlan: jest.fn(async () => null),
    });

    expect(await screen.findByRole("header", { name: "Create my own" }))
      .toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText("Plan name"),
      "My Power Plan",
    );
    await fireEvent.changeText(
      screen.getByLabelText("First day name"),
      "Power Day",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Create draft" }),
    );

    await waitFor(() => {
      expect(createDraft).toHaveBeenCalledWith({
        name: "My Power Plan",
        dayName: "Power Day",
      });
    });
    expect(await screen.findByRole("header", { name: "My Power Plan" }))
      .toBeOnTheScreen();
    expect(screen.getByText("Draft")).toBeOnTheScreen();
    expect(screen.getByText(missingRequirement)).toBeOnTheScreen();
    expect(screen.getByLabelText("Day name"))
      .toHaveProp("value", "Power Day");
    expect(screen.getByRole("button", { name: "Schedule" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));
    expect(screen.getByRole("button", { name: "Activate" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));
    expect(screen.getByText(
      "Schedule and Activate are unavailable. "
        + missingRequirement,
    )).toBeOnTheScreen();
  });

  it("keeps target and day edits local until one complete Save plan", async () => {
    const savePlan = jest.fn(async (
      input: Parameters<
        React.ComponentProps<typeof OwnedPlanEditorScreen>["savePlan"]
      >[0],
    ) => committed({
      ...completeSnapshot(),
      name: input.plan.name,
      revision: 2,
      days: input.plan.days,
    }, "save"));
    const onSaved = jest.fn();
    await renderEditor({ savePlan, onSaved });

    expect(await screen.findByText(missingRequirement)).toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText("Plan name"),
      "Owner Strength Updated",
    );
    await fireEvent(screen.getByLabelText("Plan name"), "blur");
    expect(screen.getByTestId("owned-plan-add-exercise")).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Add exercise" }),
    );
    expect(screen.getByTestId("owned-plan-exercise-search"))
      .toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText("Search plan exercises"),
      "missing",
    );
    expect(screen.getByText("No plan exercises match")).toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText("Search plan exercises"),
      "barbell",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: /Barbell Back Squat/u }),
    );
    await fireEvent.changeText(screen.getByLabelText("Working sets"), "2");
    await fireEvent.changeText(screen.getByLabelText("Load (kg)"), "20");
    await fireEvent.changeText(screen.getByLabelText("Minimum reps"), "8");
    await fireEvent.changeText(screen.getByLabelText("Maximum reps"), "12");
    await fireEvent.press(screen.getByRole("button", {
      name: "Rest (seconds)",
    }));
    await fireEvent.changeText(
      screen.getByLabelText("Rest (seconds) seconds"),
      "90",
    );
    await fireEvent.press(screen.getByRole("button", {
      name: "Confirm rest (seconds)",
    }));
    await fireEvent(screen.getByLabelText("Load (kg)"), "blur");

    expect(savePlan).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole("button", { name: "Save target" }),
    );
    expect(savePlan).not.toHaveBeenCalled();
    expect(screen.getByText("2 working sets · 20 kg · 8–12 reps"))
      .toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Save day" }),
    );
    expect(savePlan).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Schedule" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));
    expect(screen.getByRole("button", { name: "Activate" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));

    await fireEvent.press(
      screen.getByRole("button", { name: "Save plan" }),
    );

    await waitFor(() => expect(savePlan).toHaveBeenCalledTimes(1));
    expect(savePlan).toHaveBeenCalledWith({
      expectedRevision: 1,
      plan: expect.objectContaining({
        id: "plan-owner",
        name: "Owner Strength Updated",
        days: [expect.objectContaining({
          id: "day-owner",
          name: "Strength Day",
          occurrences: [expect.objectContaining({
            exerciseId: "exercise-squat",
            restSeconds: 90,
            targets: [
              expect.objectContaining({
                ordinal: 0,
                target: expect.objectContaining({
                  loadGrams: 20_000,
                  minReps: 8,
                  maxReps: 12,
                }),
              }),
              expect.objectContaining({ ordinal: 1 }),
            ],
          })],
        })],
      }),
    });
    expect(onSaved).toHaveBeenCalledWith("plan-owner");
  });

  it("routes both ready schedule actions through the owned plan ID", async () => {
    const onSchedule = jest.fn();
    await renderEditor({
      loadPlan: jest.fn(async () => completeSnapshot()),
      onSchedule,
    });

    expect(await screen.findByText("Ready")).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Schedule" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Activate" }),
    );

    expect(onSchedule).toHaveBeenNthCalledWith(1, "plan-owner");
    expect(onSchedule).toHaveBeenNthCalledWith(2, "plan-owner");
  });

  it("preserves values, focuses the error summary, and retries save plan", async () => {
    const savePlan = jest.fn<
      React.ComponentProps<typeof OwnedPlanEditorScreen>["savePlan"]
    >()
      .mockRejectedValueOnce(new Error("secret_storage_failure"))
      .mockResolvedValueOnce(committed(completeSnapshot({
        name: "Retry Plan",
        revision: 2,
      }), "save"));
    const { rendered } = await renderEditor({
      loadPlan: jest.fn(async () => completeSnapshot({
        name: "Retry Plan",
      })),
      savePlan,
    });

    expect(await screen.findByDisplayValue("Retry Plan")).toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText("Plan name"),
      "Retry Plan Edited",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Save plan" }),
    );

    const summary = await screen.findByRole("alert");
    expect(screen.getByText(
      "Plan could not be saved. Your edits are still here. Try again.",
    )).toBeOnTheScreen();
    expect(summary).toHaveProp("focusable", true);
    expect(screen.getByDisplayValue("Retry Plan Edited")).toBeOnTheScreen();
    expect(JSON.stringify(rendered.toJSON())).not.toMatch(/secret_storage/u);

    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(savePlan).toHaveBeenCalledTimes(2));
  });

  it("covers loading, load error, empty, partial, populated, and many-day states", async () => {
    const pending = deferred<OwnedPlanSnapshot | null>();
    const { rendered } = await renderEditor({
      loadPlan: jest.fn(() => pending.promise),
    });
    expect(screen.getByTestId("owned-plan-editor-loading"))
      .toBeOnTheScreen();

    pending.resolve(null);
    expect(await screen.findByText("Plan could not be loaded"))
      .toBeOnTheScreen();
    await rendered.unmount();

    const loadPlan = jest.fn<
      React.ComponentProps<typeof OwnedPlanEditorScreen>["loadPlan"]
    >()
      .mockRejectedValueOnce(new Error("secret_load_failure"))
      .mockResolvedValueOnce(completeSnapshot({
        days: [
          completeSnapshot().days[0]!,
          {
            id: "day-two",
            name: "A very long conditioning and strength day name that wraps",
            ordinal: 1,
            occurrences: [],
          },
          {
            id: "day-three",
            name: "Recovery",
            ordinal: 2,
            occurrences: [],
          },
        ],
      }));
    const retryRender = await renderEditor({ loadPlan });
    expect(await screen.findByText("Plan could not be loaded"))
      .toBeOnTheScreen();
    expect(JSON.stringify(retryRender.rendered.toJSON()))
      .not.toMatch(/secret_load/u);
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Barbell Back Squat")).toBeOnTheScreen();
    expect(screen.getByText(
      "A very long conditioning and strength day name that wraps",
    )).toBeOnTheScreen();
    expect(screen.getByText("Recovery")).toBeOnTheScreen();
    expect(screen.getByText("3 days")).toBeOnTheScreen();
  });
});

describe("OwnedPlanEditorScreen dirty leave and lifecycle", () => {
  it("uses exact dirty-leave actions and saves only after Save changes", async () => {
    const savePlan = jest.fn(async () => committed(completeSnapshot({
      name: "Dirty Name",
      revision: 2,
    }), "save"));
    const onBack = jest.fn();
    await renderEditor({
      loadPlan: jest.fn(async () => completeSnapshot()),
      onBack,
      savePlan,
    });

    await fireEvent.changeText(
      await screen.findByLabelText("Plan name"),
      "Dirty Name",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));

    expect(await screen.findByRole("header", { name: "Save changes?" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save changes" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Discard" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Keep editing" }))
      .toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole("button", { name: "Keep editing" }),
    );
    expect(screen.queryByRole("header", { name: "Save changes?" }))
      .not.toBeOnTheScreen();
    expect(screen.getByDisplayValue("Dirty Name")).toBeOnTheScreen();
    expect(onBack).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    await fireEvent.press(
      await screen.findByRole("button", { name: "Save changes" }),
    );

    await waitFor(() => {
      expect(savePlan).toHaveBeenCalledTimes(1);
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  it("discards a dirty editor without saving", async () => {
    const savePlan = jest.fn(async () => committed(completeSnapshot(), "save"));
    const onBack = jest.fn();
    await renderEditor({
      loadPlan: jest.fn(async () => completeSnapshot()),
      onBack,
      savePlan,
    });

    await fireEvent.changeText(
      await screen.findByLabelText("Plan name"),
      "Discard this local edit",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    await fireEvent.press(
      await screen.findByRole("button", { name: "Discard" }),
    );

    expect(savePlan).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("reorders only the draft and persists ordinals with Save plan", async () => {
    const source = completeSnapshot({
      days: [
        completeSnapshot().days[0]!,
        {
          id: "day-recovery",
          name: "Recovery",
          ordinal: 1,
          occurrences: [],
        },
      ],
    });
    const savePlan = jest.fn(async (
      input: Parameters<
        React.ComponentProps<typeof OwnedPlanEditorScreen>["savePlan"]
      >[0],
    ) => committed({
      ...source,
      revision: 2,
      days: input.plan.days,
    }, "save"));
    await renderEditor({
      loadPlan: jest.fn(async () => source),
      savePlan,
    });

    expect(await screen.findByTestId("drag-Recovery")).toHaveProp(
      "accessibilityActions",
      expect.arrayContaining([
        expect.objectContaining({ label: "Move up" }),
      ]),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Move Recovery up" }),
    );

    expect(savePlan).not.toHaveBeenCalled();
    expect(screen.getByText("Recovery moved to 1 of 2")).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Save plan" }),
    );

    await waitFor(() => expect(savePlan).toHaveBeenCalledTimes(1));
    expect(savePlan).toHaveBeenCalledWith(expect.objectContaining({
      plan: expect.objectContaining({
        days: [
          expect.objectContaining({ id: "day-recovery", ordinal: 0 }),
          expect.objectContaining({ id: "day-owner", ordinal: 1 }),
        ],
      }),
    }));
  });

  it("previews held-row and neighbour displacement before one draft-only drop", async () => {
    const source = completeSnapshot({
      days: [
        completeSnapshot().days[0]!,
        {
          id: "day-recovery",
          name: "Recovery",
          ordinal: 1,
          occurrences: [],
        },
        {
          id: "day-conditioning",
          name: "Conditioning",
          ordinal: 2,
          occurrences: [],
        },
      ],
    });
    const savePlan = jest.fn(async (
      input: Parameters<
        React.ComponentProps<typeof OwnedPlanEditorScreen>["savePlan"]
      >[0],
    ) => committed({
      ...source,
      revision: 2,
      days: input.plan.days,
    }, "save"));
    await renderEditor({
      loadPlan: jest.fn(async () => source),
      savePlan,
    });

    expect(await screen.findByTestId("reorder-row-day-Recovery"))
      .toBeOnTheScreen();
    await fireEvent(
      screen.getByTestId("reorder-row-day-Recovery"),
      "layout",
      { nativeEvent: { layout: { height: 80, width: 320, x: 0, y: 80 } } },
    );
    const gesture = reorderGesture("day-Recovery");

    await act(() => {
      gesture.handlers.onStart?.({ translationY: 0 });
      gesture.handlers.onUpdate?.({ translationY: -52 });
      gesture.handlers.onUpdate?.({ translationY: -92 });
    });

    expect(screen.getByTestId("reorder-row-day-Recovery")).toHaveStyle({
      transform: [{ translateY: -92 }],
    });
    expect(screen.getByTestId("reorder-row-day-Strength Day")).toHaveStyle({
      transform: [{ translateY: 80 }],
    });
    expect(screen.getByTestId("drag-day-Recovery")).toHaveProp(
      "accessibilityLabel",
      "Drag Recovery. Moving to position 1 of 3",
    );
    expect(dayOrder()).toEqual([
      "reorder-row-day-Strength Day",
      "reorder-row-day-Recovery",
      "reorder-row-day-Conditioning",
    ]);
    expect(savePlan).not.toHaveBeenCalled();

    await act(() => {
      gesture.handlers.onEnd?.({ translationY: -92 }, true);
      gesture.handlers.onFinalize?.({ translationY: -92 }, true);
    });

    expect(dayOrder()).toEqual([
      "reorder-row-day-Recovery",
      "reorder-row-day-Strength Day",
      "reorder-row-day-Conditioning",
    ]);
    expect(screen.getByText("Recovery moved to 1 of 3")).toBeOnTheScreen();
    expect(savePlan).not.toHaveBeenCalled();

    await fireEvent.press(
      screen.getByRole("button", { name: "Save Plan Changes" }),
    );
    await waitFor(() => expect(savePlan).toHaveBeenCalledTimes(1));
    expect(savePlan).toHaveBeenCalledWith(expect.objectContaining({
      plan: expect.objectContaining({
        days: [
          expect.objectContaining({ id: "day-recovery", ordinal: 0 }),
          expect.objectContaining({ id: "day-owner", ordinal: 1 }),
          expect.objectContaining({ id: "day-conditioning", ordinal: 2 }),
        ],
      }),
    }));
  });

  it("cancels a held reorder without changing the draft or persisting", async () => {
    const source = completeSnapshot({
      days: [
        completeSnapshot().days[0]!,
        {
          id: "day-recovery",
          name: "Recovery",
          ordinal: 1,
          occurrences: [],
        },
        {
          id: "day-conditioning",
          name: "Conditioning",
          ordinal: 2,
          occurrences: [],
        },
      ],
    });
    const savePlan = jest.fn(async () => committed(source, "save"));
    await renderEditor({
      loadPlan: jest.fn(async () => source),
      savePlan,
    });

    expect(await screen.findByTestId("reorder-row-day-Recovery"))
      .toBeOnTheScreen();
    await fireEvent(
      screen.getByTestId("reorder-row-day-Recovery"),
      "layout",
      { nativeEvent: { layout: { height: 80, width: 320, x: 0, y: 80 } } },
    );
    const gesture = reorderGesture("day-Recovery");

    await act(() => {
      gesture.handlers.onStart?.({ translationY: 0 });
      gesture.handlers.onUpdate?.({ translationY: 92 });
      gesture.handlers.onFinalize?.({ translationY: 92 }, false);
    });

    expect(dayOrder()).toEqual([
      "reorder-row-day-Strength Day",
      "reorder-row-day-Recovery",
      "reorder-row-day-Conditioning",
    ]);
    expect(screen.queryByText(/Recovery moved to/u)).not.toBeOnTheScreen();
    expect(savePlan).not.toHaveBeenCalled();
  });

  it("uses the same continuous draft move for exercise rows", async () => {
    const squat = completeSnapshot().days[0]!.occurrences[0]!;
    const deadlift = {
      ...squat,
      id: "occurrence-owner-deadlift",
      exerciseId: "exercise-deadlift",
      ordinal: 1,
      targets: squat.targets.map((target) => ({
        ...target,
        id: `${target.id}-deadlift`,
      })),
    };
    const source = completeSnapshot({
      days: [{
        ...completeSnapshot().days[0]!,
        occurrences: [squat, deadlift],
      }],
    });
    const savePlan = jest.fn(async () => committed(source, "save"));
    await renderEditor({
      listExercises: jest.fn(async () => [
        ...exercises,
        {
          id: "exercise-deadlift",
          name: "Barbell Deadlift",
          metricIdentity: {
            profile: "load_reps",
            contractVersion: 1,
            exerciseMetricGeneration: 1,
          },
        },
      ]),
      loadPlan: jest.fn(async () => source),
      savePlan,
    });

    expect(await screen.findByTestId("reorder-row-exercise-Barbell Deadlift"))
      .toBeOnTheScreen();
    await fireEvent(
      screen.getByTestId("reorder-row-exercise-Barbell Deadlift"),
      "layout",
      { nativeEvent: { layout: { height: 80, width: 320, x: 0, y: 80 } } },
    );
    const gesture = reorderGesture("exercise-Barbell Deadlift");

    await act(() => {
      gesture.handlers.onStart?.({ translationY: 0 });
      gesture.handlers.onUpdate?.({ translationY: -88 });
    });
    expect(screen.getByTestId("reorder-row-exercise-Barbell Back Squat"))
      .toHaveStyle({ transform: [{ translateY: 80 }] });

    await act(() => {
      gesture.handlers.onEnd?.({ translationY: -88 }, true);
      gesture.handlers.onFinalize?.({ translationY: -88 }, true);
    });

    expect(exerciseOrder()).toEqual([
      "reorder-row-exercise-Barbell Deadlift",
      "reorder-row-exercise-Barbell Back Squat",
    ]);
    expect(screen.getByText("Barbell Deadlift moved to 1 of 2"))
      .toBeOnTheScreen();
    expect(savePlan).not.toHaveBeenCalled();
  });

  it("keeps buttons, keyboard, and adjustable actions on the bounded draft move", async () => {
    const source = completeSnapshot({
      days: [
        completeSnapshot().days[0]!,
        {
          id: "day-recovery",
          name: "Recovery",
          ordinal: 1,
          occurrences: [],
        },
      ],
    });
    const savePlan = jest.fn(async () => committed(source, "save"));
    await renderEditor({
      loadPlan: jest.fn(async () => source),
      savePlan,
    });

    const handle = await screen.findByTestId("drag-day-Recovery");
    await fireEvent(handle, "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    expect(dayOrder()).toEqual([
      "reorder-row-day-Recovery",
      "reorder-row-day-Strength Day",
    ]);
    expect(screen.getByText("Recovery moved to 1 of 2")).toBeOnTheScreen();

    await fireEvent(
      screen.getByRole("button", { name: "Move Recovery down" }),
      "keyDown",
      { nativeEvent: { key: "Enter" } },
    );
    expect(dayOrder()).toEqual([
      "reorder-row-day-Strength Day",
      "reorder-row-day-Recovery",
    ]);
    expect(screen.getByText("Recovery moved to 2 of 2")).toBeOnTheScreen();
    expect(savePlan).not.toHaveBeenCalled();
  });

  it("keeps reduced-motion drag acknowledgement and immediate neighbour displacement", async () => {
    const source = completeSnapshot({
      days: [
        completeSnapshot().days[0]!,
        {
          id: "day-recovery",
          name: "Recovery",
          ordinal: 1,
          occurrences: [],
        },
      ],
    });
    await renderEditor({
      loadPlan: jest.fn(async () => source),
    }, true);

    expect(await screen.findByTestId("reorder-row-day-Recovery"))
      .toBeOnTheScreen();
    await fireEvent(
      screen.getByTestId("reorder-row-day-Recovery"),
      "layout",
      { nativeEvent: { layout: { height: 80, width: 320, x: 0, y: 80 } } },
    );
    const gesture = reorderGesture("day-Recovery");

    await act(() => {
      gesture.handlers.onStart?.({ translationY: 0 });
      gesture.handlers.onUpdate?.({ translationY: -92 });
    });

    expect(screen.getByTestId("reorder-row-day-Strength Day")).toHaveStyle({
      transform: [{ translateY: 80 }],
    });
    expect(screen.getByTestId("drag-day-Recovery")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ busy: true }),
    );
  });

  it("duplicates to a fresh inactive graph after explicit confirmation", async () => {
    const duplicate = completeSnapshot({
      id: "plan-owner-copy",
      name: "Owner Strength Copy",
      isActive: false,
      scheduleDefaults: {
        id: "copy-schedule",
        lifecycle: "inactive",
        revision: 1,
        version: null,
      },
      days: [{
        ...completeSnapshot().days[0]!,
        id: "day-owner-copy",
        occurrences: [{
          ...completeSnapshot().days[0]!.occurrences[0]!,
          id: "occurrence-owner-copy",
          targets: [{
            ...completeSnapshot().days[0]!.occurrences[0]!.targets[0]!,
            id: "target-owner-copy",
          }],
        }],
      }],
    });
    const duplicatePlan = jest.fn(async () =>
      committed(duplicate, "duplicate")
    );
    const onSaved = jest.fn();
    await renderEditor({
      duplicatePlan,
      loadPlan: jest.fn(async () => completeSnapshot()),
      onSaved,
    });

    await fireEvent.press(
      await screen.findByRole("button", { name: "Duplicate plan" }),
    );
    expect(await screen.findByRole("header", {
      name: "Duplicate Owner Strength?",
    })).toBeOnTheScreen();
    expect(screen.getByText(
      "Days, exercise order, targets, warm-ups, rest, policies, and schedule defaults are copied into fresh identities. The duplicate stays inactive.",
    )).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Create duplicate" }),
    );

    await waitFor(() => {
      expect(duplicatePlan).toHaveBeenCalledWith({
        sourcePlanId: "plan-owner",
        expectedRevision: 1,
        name: "Owner Strength Copy",
      });
      expect(onSaved).toHaveBeenCalledWith("plan-owner-copy");
    });
    expect(duplicate.id).not.toBe("plan-owner");
    expect(duplicate.days[0]!.id).not.toBe("day-owner");
    expect(duplicate.isActive).toBe(false);
    expect(duplicate.scheduleDefaults?.lifecycle).toBe("inactive");
  });

  it("archives and restores without exposing permanent deletion", async () => {
    const archivePlan = jest.fn(async () => committed(completeSnapshot({
      lifecycle: "archived",
      revision: 2,
    }), "archive"));
    const restorePlan = jest.fn(async () => committed(completeSnapshot({
      revision: 3,
    }), "restore"));
    await renderEditor({
      archivePlan,
      loadPlan: jest.fn(async () => completeSnapshot()),
      restorePlan,
    });

    expect(screen.queryByText(/delete/iu)).not.toBeOnTheScreen();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Archive plan" }),
    );
    expect(await screen.findByRole("header", {
      name: "Archive Owner Strength?",
    })).toBeOnTheScreen();
    expect(screen.getByText(
      "The plan will leave the default Library view. Its history is unchanged, and you can restore it later.",
    )).toBeOnTheScreen();
    const archiveButtons = screen.getAllByRole("button", {
      name: "Archive plan",
    });
    await fireEvent.press(
      archiveButtons[archiveButtons.length - 1]!,
    );

    expect(await screen.findByText("Archived")).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Restore plan" }),
    );
    await waitFor(() => expect(restorePlan).toHaveBeenCalledWith({
      planId: "plan-owner",
      expectedRevision: 2,
    }));
    expect(screen.queryByText("Archived")).not.toBeOnTheScreen();
  });

  it("shows snapshot safety and refuses structural schedule impact", async () => {
    const source = {
      ...completeSnapshot({ isActive: true }),
      hasInProgressWorkout: true,
    };
    const savePlan = jest.fn(async () => ({
      outcome: "requires_schedule_impact" as const,
      code: "requires_schedule_impact" as const,
    }));
    await renderEditor({
      loadPlan: jest.fn(async () => source),
      savePlan,
    });

    expect(await screen.findByText("Current workout is unaffected"))
      .toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText("Plan name"),
      "Future Active Name",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Save plan" }),
    );

    expect(await screen.findByText("Schedule impact review required"))
      .toBeOnTheScreen();
    expect(screen.getByText(
      "The active schedule and current workout were not changed. Structural schedule impact is deferred to Plan 02-18.",
    )).toBeOnTheScreen();
    expect(screen.getByDisplayValue("Future Active Name")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save plan" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        disabled: true,
      }));
  });
});

for (const [layout, width] of [
  ["compact", 360],
  ["medium", 720],
  ["expanded", 1024],
] as const) {
  describe(`OwnedPlanEditorScreen ${layout} layout`, () => {
  it("keeps editor controls adaptive, non-color, and reachable", async () => {
    const source = completeSnapshot({
      days: [
        completeSnapshot().days[0]!,
        {
          id: `day-${layout}`,
          name:
            "A very long plan day name for large text and landscape overflow",
          ordinal: 1,
          occurrences: [],
        },
      ],
    });
    await renderEditor({
      loadPlan: jest.fn(async () => source),
      width,
    });

    expect(await screen.findByLabelText(`${layout} layout`))
      .toBeOnTheScreen();
    expect(screen.getByText(
      "A very long plan day name for large text and landscape overflow",
    )).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save plan" }))
      .toBeOnTheScreen();
    expect(screen.getByTestId(
      "drag-A very long plan day name for large text and landscape overflow",
    )).toHaveStyle({ minHeight: 48, minWidth: 48 });
    expect(screen.getByText("Ready")).toBeOnTheScreen();
  });
  });
}

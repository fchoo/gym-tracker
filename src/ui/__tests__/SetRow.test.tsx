import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react-native";
import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

import type {
  ActiveWorkoutSet,
} from "../../domains/workout";
import {
  SetRow,
} from "../components/SetRow";
import {
  AppearanceProvider,
} from "../theme";

const metricIdentity = {
  profile: "load_reps" as const,
  contractVersion: 1,
  exerciseMetricGeneration: 1,
};

function workingSet(
  overrides: Partial<ActiveWorkoutSet> = {},
): ActiveWorkoutSet {
  return {
    id: "working-1",
    kind: "working",
    ordinal: 0,
    sourceTargetId: "target-1",
    metricIdentity,
    target: {
      version: 1,
      profile: "load_reps",
      loadGrams: 60_000,
      minReps: 6,
      maxReps: 8,
      incrementGrams: 2_500,
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "load_reps",
      loadGrams: 62_500,
      reps: 6,
      source: "manual",
    },
    status: "draft",
    completedAtMs: null,
    revision: 1,
    valueSources: [{
      source: "plan_default",
      observation: {
        version: 1,
        profile: "load_reps",
        loadGrams: 60_000,
        reps: 8,
        source: "plan_default",
      },
    }],
    ...overrides,
  };
}

async function renderRow(
  set = workingSet(),
  overrides: Partial<React.ComponentProps<typeof SetRow>> = {},
) {
  const props = {
    active: true,
    count: 1,
    index: 1,
    kind: "working" as const,
    onChangeValues: jest.fn(() => undefined),
    onComplete: jest.fn(),
    onRemove: jest.fn(),
    onSkip: jest.fn(),
    set,
    ...overrides,
  } satisfies React.ComponentProps<typeof SetRow>;
  await render(
    <AppearanceProvider>
      <SetRow {...props} />
    </AppearanceProvider>,
  );
  return props;
}

describe("Plan 07-04 SetRow", () => {
  it("keeps editable working controls in one ordered, wrapping control band", async () => {
    await renderRow();

    const band = screen.getByTestId("working-set-1-control-band");
    expect(band).toHaveStyle({
      flexDirection: "row",
      flexWrap: "wrap",
    });
    expect(screen.getByLabelText("Working set 1 load in kilograms"))
      .toBeOnTheScreen();
    expect(screen.getByLabelText("Working set 1 repetitions"))
      .toBeOnTheScreen();
    for (const label of [
      "Reset set 1",
      "Complete Set 1",
      "Remove set 1",
    ]) {
      expect(screen.getByRole("button", { name: label }))
        .toHaveStyle({ minHeight: 48, minWidth: 48 });
    }

    const tree = JSON.stringify(band);
    expect(tree.indexOf("Working set 1 load in kilograms"))
      .toBeLessThan(tree.indexOf("Reset set 1"));
    expect(tree.indexOf("Reset set 1"))
      .toBeLessThan(tree.indexOf("Complete Set 1"));
    expect(tree.indexOf("Complete Set 1"))
      .toBeLessThan(tree.indexOf("Remove set 1"));
  });

  it("persists plan-default values on Reset and delegates Remove without treating it as Skip", async () => {
    const onChangeValues = jest.fn(() => undefined);
    const onRemove = jest.fn();
    const onSkip = jest.fn();
    await renderRow(workingSet(), {
      onChangeValues,
      onRemove,
      onSkip,
    });

    await fireEvent.press(screen.getByRole("button", { name: "Reset set 1" }));
    expect(onChangeValues).toHaveBeenCalledWith({
      version: 1,
      profile: "load_reps",
      loadGrams: 60_000,
      reps: 8,
      source: "plan_default",
    });

    await fireEvent.press(screen.getByRole("button", { name: "Remove set 1" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("allows an incomplete future working set to be removed while keeping Reset and Done unavailable", async () => {
    const onRemove = jest.fn();
    await renderRow(workingSet({
      id: "working-2",
      ordinal: 1,
      status: "planned",
    }), {
      active: false,
      count: 2,
      index: 2,
      onRemove,
    });

    expect(screen.getByRole("button", { name: "Reset set 2" }).props
      .accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByRole("button", { name: "Complete Set 2" }).props
      .accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByRole("button", { name: "Remove set 2" }).props
      .accessibilityState).toMatchObject({ disabled: false });

    await fireEvent.press(screen.getByRole("button", { name: "Remove set 2" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("keeps completed working rows correctable and never removable", async () => {
    await renderRow(workingSet({
      status: "completed",
      completedAtMs: 3_000,
    }));

    expect(screen.getByRole("button", { name: "Edit completed set 1" }))
      .toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Remove set 1" }))
      .not.toBeOnTheScreen();
  });

  it.each([
    ["working", "working-1", "Remove set 1"],
    ["warmup", "warmup-1", "Remove warm-up W1"],
  ])(
    "renders skipped %s rows as remove-only",
    async (kind, id, removeLabel) => {
      const onRemove = jest.fn();
      await renderRow(workingSet({
        id,
        kind: kind as "warmup" | "working",
        sourceTargetId: kind === "warmup" ? null : "target-1",
        status: "skipped",
        valueSources: [],
      }), {
        kind: kind as "warmup" | "working",
        onRemove,
      });

      expect(screen.getByRole("button", { name: removeLabel }))
        .toBeOnTheScreen();
      expect(screen.queryByRole("button", {
        name: kind === "warmup" ? "Reset warm-up W1" : "Reset set 1",
      })).not.toBeOnTheScreen();
      expect(screen.queryByRole("button", {
        name: kind === "warmup" ? "Complete warm-up W1" : "Complete Set 1",
      })).not.toBeOnTheScreen();

      await fireEvent.press(screen.getByRole("button", { name: removeLabel }));
      expect(onRemove).toHaveBeenCalledTimes(1);
    },
  );

  it("labels warm-up Reset, Done, and Remove actions for the same wrapping band", async () => {
    await renderRow({
      ...workingSet(),
      id: "warmup-1",
      kind: "warmup",
      sourceTargetId: null,
      valueSources: [],
    }, { kind: "warmup" });

    expect(screen.getByTestId("warmup-W1-control-band")).toHaveStyle({
      flexWrap: "wrap",
    });
    expect(screen.getByRole("button", { name: "Reset warm-up W1" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Complete warm-up W1" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove warm-up W1" }))
      .toBeOnTheScreen();
  });
});

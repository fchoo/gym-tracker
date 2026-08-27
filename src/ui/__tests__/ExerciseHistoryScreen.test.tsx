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
  ExerciseMetricHistory,
} from "../../domains/history";
import {
  ExerciseHistoryScreen,
} from "../screens/ExerciseHistoryScreen";
import {
  AppearanceProvider,
  createMemoryAppearanceStore,
  themes,
} from "../theme";

function history(
  overrides: Partial<ExerciseMetricHistory> = {},
): ExerciseMetricHistory {
  const identity = {
    profile: "load_reps" as const,
    contractVersion: 1,
    exerciseMetricGeneration: 1,
  };
  const target = {
    version: 1 as const,
    profile: "load_reps" as const,
    loadGrams: 40_000,
    minReps: 8,
    maxReps: 10,
    incrementGrams: 2_500,
    perSide: false,
  };
  const set = (input: Readonly<{
    setId: string;
    loadGrams: number;
    reps: number;
    completedAtMs: number;
    setKind?: "warmup" | "working";
  }>) => ({
    sessionId: "session-" + input.setId,
    localDate: "2026-08-24",
    exerciseId: "bench-press",
    identity,
    target,
    observation: {
      version: 1 as const,
      profile: "load_reps" as const,
      loadGrams: input.loadGrams,
      reps: input.reps,
      source: "manual" as const,
    },
    sessionStatus: "completed" as const,
    setKind: input.setKind ?? "working",
    setStatus: "completed" as const,
    plannedWorkingSets: 1,
    completedWorkingSets: 1,
    setId: input.setId,
    setOrdinal: 0,
    completedAtMs: input.completedAtMs,
  });
  const best = set({
    setId: "working-best",
    loadGrams: 45_000,
    reps: 9,
    completedAtMs: 1_724_515_200_000,
  });
  const last = set({
    setId: "working-last",
    loadGrams: 42_500,
    reps: 10,
    completedAtMs: 1_724_601_600_000,
  });
  return {
    exerciseId: "bench-press",
    segments: [{
      identity,
      referenceTarget: target,
      comparableSets: [last, best],
      best,
      average: {
        version: 1,
        profile: "load_reps",
        sampleSize: 2,
        meanLoadGrams: 43_750,
        meanReps: 9.5,
      },
      last,
    }],
    warmupVisits: [set({
      setId: "warmup-1",
      setKind: "warmup",
      loadGrams: 20_000,
      reps: 12,
      completedAtMs: 1_724_601_600_000,
    })],
    ...overrides,
  };
}

async function renderHistory(
  overrides: Partial<React.ComponentProps<typeof ExerciseHistoryScreen>> = {},
  appearanceStore = createMemoryAppearanceStore(),
) {
  const props: React.ComponentProps<typeof ExerciseHistoryScreen> = {
    exerciseId: "bench-press",
    exerciseName: "Bench press",
    loadExerciseHistory: jest.fn(async () => history()),
    onBack: jest.fn(),
    ...overrides,
  };
  await render(
    <AppearanceProvider store={appearanceStore}>
      <ExerciseHistoryScreen {...props} />
    </AppearanceProvider>,
  );
  return props;
}

describe("ExerciseHistoryScreen", () => {
  it("renders metric-aware Best, Average, and Last without putting warm-ups into evidence", async () => {
    const onBack = jest.fn();
    await renderHistory({ onBack });

    expect(await screen.findByRole("header", { name: "Exercise history" }))
      .toBeOnTheScreen();
    expect(screen.getByText("Bench press")).toBeOnTheScreen();
    expect(screen.getByText("load_reps · contract 1 · generation 1"))
      .toBeOnTheScreen();
    expect(screen.getByText("Working sets only")).toBeOnTheScreen();
    expect(screen.getByText("Best")).toBeOnTheScreen();
    expect(screen.getByText("Average")).toBeOnTheScreen();
    expect(screen.getByText("Last")).toBeOnTheScreen();
    expect(screen.getByText("45 kg × 9")).toBeOnTheScreen();
    expect(screen.getByText("43.75 kg × 9.5")).toBeOnTheScreen();
    expect(screen.getByText("42.5 kg × 10")).toBeOnTheScreen();
    expect(screen.queryByText("20 kg × 12")).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", {
      name: "Show 1 warm-up visit",
    }));
    expect(screen.getByText("20 kg × 12")).toBeOnTheScreen();
    expect(screen.getByText("Warm-up visit · 24 August 2026 · W1"))
      .toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("uses exact empty-state copy without inventing zero metrics", async () => {
    await renderHistory({
      loadExerciseHistory: jest.fn(async () => history({
        segments: [],
        warmupVisits: [],
      })),
    });

    expect(await screen.findByRole("header", {
      name: "No comparable working sets yet",
    })).toBeOnTheScreen();
    expect(screen.getByText(
      "Complete every planned working set for this exercise to establish a comparable history.",
    )).toBeOnTheScreen();
    expect(screen.queryByText("0 kg")).not.toBeOnTheScreen();
  });

  it("keeps retryable failure separate from saved source facts", async () => {
    const loadExerciseHistory = jest.fn(async () => {
      throw new Error("storage unavailable");
    });
    await renderHistory({ loadExerciseHistory });

    expect(await screen.findByRole("header", {
      name: "Exercise history could not be loaded",
    })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Retry exercise history",
    }));
    expect(loadExerciseHistory).toHaveBeenCalledTimes(2);
  });

  it("uses the Light card surface contract", async () => {
    await renderHistory({}, createMemoryAppearanceStore("Light"));

    await waitFor(() => expect(screen.getByTestId("exercise-history-segment-0"))
      .toHaveStyle({ backgroundColor: themes.light.contentCard }));
  });

  it("uses the Dark card surface contract", async () => {
    await renderHistory({}, createMemoryAppearanceStore("Dark"));

    await waitFor(() => expect(screen.getByTestId("exercise-history-segment-0"))
      .toHaveStyle({ backgroundColor: themes.dark.contentCard }));
  });
});

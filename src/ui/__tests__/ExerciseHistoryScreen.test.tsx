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
  sizes,
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
    relativeLoad?: number | null;
  }>) => ({
    sessionId: "session-" + input.setId,
    localDate: "2026-08-24",
    exerciseId: "bench-press",
    exerciseName: "Bench press",
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
    sourceRevision: 2,
    targetAtDate: target,
    relativeStrength: input.setKind === "warmup" || input.relativeLoad === null
      ? null
      : {
        loadGrams: input.loadGrams,
        relativeLoad: input.relativeLoad ?? input.loadGrams / 85_000,
        basis: { grams: 85_000, localDate: "2026-08-24" },
      },
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

function bodyweightHistory(
  sourceRevisions: readonly (number | undefined)[],
): ExerciseMetricHistory {
  const projection = history();
  const segment = projection.segments[0]!;
  const identity = {
    profile: "bodyweight_reps" as const,
    contractVersion: 1,
    exerciseMetricGeneration: 1,
  };
  const target = {
    version: 1 as const,
    profile: "bodyweight_reps" as const,
    minReps: 8,
    maxReps: 12,
    variationId: "standard",
    perSide: false,
  };
  const comparableSets = segment.comparableSets.map((set, index) => {
    const { sourceRevision: _sourceRevision, ...setWithoutSourceRevision } = set;
    return {
      ...setWithoutSourceRevision,
      identity,
      target,
      observation: {
        version: 1 as const,
        profile: "bodyweight_reps" as const,
        reps: index === 0 ? 10 : 12,
        source: "manual" as const,
      },
      ...(sourceRevisions[index] === undefined
        ? {}
        : { sourceRevision: sourceRevisions[index] }),
      historyStatus: index === 0 ? "corrected_effective" as const : "accepted_current" as const,
    };
  });
  return {
    ...projection,
    segments: [{
      ...segment,
      identity,
      referenceTarget: target,
      comparableSets,
      best: comparableSets[1]!,
      average: {
        version: 1,
        profile: "bodyweight_reps" as const,
        sampleSize: comparableSets.length,
        meanReps: 11,
      },
      last: comparableSets[0]!,
    }],
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
    expect(screen.getAllByText("Best").length).toBeGreaterThan(0);
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

  it("renders one factual load series and discloses the exact dated basis in Relative", async () => {
    const onOpenSource = jest.fn();
    await renderHistory({ onOpenSource });

    expect(await screen.findByRole("button", { name: "Load" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Relative" })).toBeOnTheScreen();
    expect(screen.getByText("Latest")).toBeOnTheScreen();
    expect(screen.getByText("Target")).toBeOnTheScreen();
    expect(screen.getByText("Gap")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Relative" }));
    expect(screen.getAllByText("Using 85 kg from 24 August 2026").length)
      .toBeGreaterThan(0);
    expect(screen.getAllByText(/bodyweight/u).length).toBeGreaterThan(0);
    expect(screen.getByText(
      "Bodyweight-relative strength is a view only and never changes targets.",
    )).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Show history data" }));
    await fireEvent.press(screen.getAllByRole("button", { name: "Open source" })[0]!);
    expect(onOpenSource).toHaveBeenCalledWith("session-working-best", 2);
  });

  it("opens guarded non-load sources without fabricating missing identities", async () => {
    const onOpenSource = jest.fn();
    await renderHistory({
      onOpenSource,
      loadExerciseHistory: jest.fn(async () => bodyweightHistory([undefined, 7])),
    });

    expect(await screen.findByText("bodyweight_reps · contract 1 · generation 1"))
      .toBeOnTheScreen();
    expect(screen.getByText("Bodyweight × 12")).toBeOnTheScreen();
    expect(screen.getByText("Bodyweight × 11")).toBeOnTheScreen();
    expect(screen.getByText("Bodyweight × 10")).toBeOnTheScreen();
    expect(screen.getAllByText(/Working visit/u)).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Open source" })).toHaveLength(1);
    expect(screen.getAllByText("Source unavailable")).toHaveLength(1);

    await fireEvent.press(screen.getByRole("button", { name: "Open source" }));
    expect(onOpenSource).toHaveBeenCalledTimes(1);
    expect(onOpenSource).toHaveBeenCalledWith("session-working-best", 7);
  });

  it("deduplicates non-load source actions by immutable source identity while keeping visits factual", async () => {
    const onOpenSource = jest.fn();
    const projection = bodyweightHistory([11, 11]);
    const segment = projection.segments[0]!;
    const first = {
      ...segment.comparableSets[0]!,
      sessionId: "session-shared",
      setId: "working-shared-first",
      localDate: "2026-08-24",
      setOrdinal: 0,
      sourceRevision: 11,
    };
    const second = {
      ...segment.comparableSets[1]!,
      sessionId: "session-shared",
      setId: "working-shared-second",
      localDate: "2026-08-25",
      setOrdinal: 1,
      sourceRevision: 11,
    };
    const unique = {
      ...second,
      sessionId: "session-unique",
      setId: "working-unique",
      localDate: "2026-08-26",
      setOrdinal: 2,
      sourceRevision: 12,
    };

    await renderHistory({
      onOpenSource,
      loadExerciseHistory: jest.fn(async () => ({
        ...projection,
        segments: [{
          ...segment,
          comparableSets: [first, second, unique],
        }],
      })),
    });

    expect(await screen.findByText("bodyweight_reps · contract 1 · generation 1"))
      .toBeOnTheScreen();
    expect(screen.getByText(/Working visit · 24 August 2026 · Set 1/u))
      .toBeOnTheScreen();
    expect(screen.getByText(/Working visit · 25 August 2026 · Set 2/u))
      .toBeOnTheScreen();
    expect(screen.getByText(/Working visit · 26 August 2026 · Set 3/u))
      .toBeOnTheScreen();

    const sourceActions = screen.getAllByRole("button", { name: "Open source" });
    expect(sourceActions).toHaveLength(2);
    await fireEvent(sourceActions[0]!, "focus");
    expect(sourceActions[0]).toHaveStyle({
      outlineOffset: 3,
      outlineWidth: sizes.focusRing,
    });

    await fireEvent.press(sourceActions[0]!);
    await fireEvent.press(sourceActions[1]!);
    await fireEvent.press(sourceActions[0]!);
    expect(onOpenSource.mock.calls).toEqual([
      ["session-shared", 11],
      ["session-unique", 12],
      ["session-shared", 11],
    ]);
  });

  it("uses the Phase 19 focus contract for non-load source actions", async () => {
    await renderHistory({
      onOpenSource: jest.fn(),
      loadExerciseHistory: jest.fn(async () => bodyweightHistory([undefined, 7])),
    });

    const sourceAction = await screen.findByRole("button", { name: "Open source" });
    await fireEvent(sourceAction, "focus");

    expect(sourceAction).toHaveStyle({
      outlineOffset: 3,
      outlineWidth: sizes.focusRing,
    });
  });

  it("routes corrected effective non-load sources exactly and rejects invalid revisions", async () => {
    const onOpenSource = jest.fn();
    await renderHistory({
      onOpenSource,
      loadExerciseHistory: jest.fn(async () => bodyweightHistory([-1, Number.MAX_SAFE_INTEGER])),
    });

    expect(await screen.findByText("bodyweight_reps · contract 1 · generation 1"))
      .toBeOnTheScreen();
    expect(screen.getAllByRole("button", { name: "Open source" })).toHaveLength(1);
    expect(screen.getAllByText("Source unavailable")).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "Open source" }));
    expect(onOpenSource).toHaveBeenCalledWith("session-working-best", Number.MAX_SAFE_INTEGER);
    expect(onOpenSource).not.toHaveBeenCalledWith("session-working-last", expect.anything());
  });

  it("keeps Load available and omits Relative when every observation lacks a valid basis", async () => {
    const withoutBasis = history();
    await renderHistory({
      loadExerciseHistory: jest.fn(async () => ({
        ...withoutBasis,
        segments: withoutBasis.segments.map((segment) => ({
          ...segment,
          comparableSets: segment.comparableSets.map((set) => ({
            ...set,
            relativeStrength: null,
          })),
          best: segment.best === null ? null : { ...segment.best, relativeStrength: null },
          last: segment.last === null ? null : { ...segment.last, relativeStrength: null },
        })),
      })),
    });

    expect(await screen.findByRole("button", { name: "Load" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Relative" })).not.toBeOnTheScreen();
    expect(screen.getByText("45 kg × 9")).toBeOnTheScreen();
  });

  const freshnessCases: Array<[
    "updating" | "unavailable",
    string,
    string,
  ]> = [
    ["updating", "Updating exercise history", "Refresh exercise history"],
    ["unavailable", "Exercise history unavailable", "Retry exercise history"],
  ];

  it.each(freshnessCases)("keeps Back and a retry action for coarse %s freshness", async (
    freshness,
    heading,
    retryLabel,
  ) => {
    const onBack = jest.fn();
    const loadExerciseHistory = jest.fn(async () => history({
      freshness,
      segments: [],
      warmupVisits: [],
    }));
    await renderHistory({ loadExerciseHistory, onBack });

    expect(await screen.findByRole("header", { name: heading })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: retryLabel }));
    expect(loadExerciseHistory).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("keeps corrected effective rows factual and makes missing source identity explicit", async () => {
    const projection = history();
    const segment = projection.segments[0]!;
    await renderHistory({
      loadExerciseHistory: jest.fn(async () => ({
        ...projection,
        segments: [{
          ...segment,
          comparableSets: segment.comparableSets.map((set, index) => {
            const { sourceRevision: _sourceRevision, ...withoutSourceRevision } = set;
            return {
              ...withoutSourceRevision,
              ...(index === 0 ? { sourceRevision: 3 } : {}),
              historyStatus: index === 0
                ? "corrected_effective" as const
                : "accepted_current" as const,
            };
          }),
        }],
      })),
    });

    await fireEvent.press(await screen.findByRole("button", { name: "Show history data" }));
    expect(screen.getByText("Corrected effective fact")).toBeOnTheScreen();
    expect(screen.getAllByText("Source unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByText("0 kg")).not.toBeOnTheScreen();
  });
});

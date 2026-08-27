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
  MetricIdentity,
  MetricObservation,
  MetricTarget,
} from "../../domains/metrics";
import type {
  ActiveWorkoutSet,
  ActiveWorkoutView,
} from "../../domains/workout";
import {
  createWorkoutRepository,
} from "../../platform/sqlite/repositories/workoutRepository";
import {
  MetricProfileOption,
} from "../components/MetricProfileOption";
import {
  SetRow,
} from "../components/SetRow";
import {
  ActiveWorkoutScreen,
  type ActiveWorkoutCommands,
} from "../screens/ActiveWorkoutScreen";
import {
  AppearanceProvider,
} from "../theme";

function persistedAddedLoadKernel() {
  const queryAll = jest.fn(async (
    sql: string,
  ): Promise<readonly Record<string, unknown>[]> => {
    if (sql.includes("PRAGMA table_info(session_exercises)")) {
      return [
        { name: "metric_contract_version" },
        { name: "exercise_metric_generation" },
      ];
    }
    if (sql.includes("PRAGMA table_info(session_sets)")) {
      return [];
    }
    if (sql.includes("FROM workout_sessions") && sql.includes("WHERE id = ?")) {
      return [{
        id: "session-added-load",
        status: "in_progress",
        active_session_exercise_id: "session-exercise-added-load",
        active_set_id: "set-added-load",
        revision: 4,
      }];
    }
    if (sql.includes("FROM session_exercises") && sql.includes("ORDER BY ordinal")) {
      return [{
        id: "session-exercise-added-load",
        exercise_id: "weighted-pull-up",
        ordinal: 0,
        exercise_name: "Weighted Pull-up",
        metric_profile: "added_load_reps",
        metric_contract_version: 1,
        exercise_metric_generation: 3,
        default_rest_seconds: 180,
        status: "active",
        revision: 2,
      }];
    }
    if (sql.includes("FROM session_sets ss") && sql.includes("ORDER BY se.ordinal")) {
      return [{
        id: "set-added-load",
        session_exercise_id: "session-exercise-added-load",
        set_kind: "working",
        ordinal: 0,
        source_plan_working_set_target_id: null,
        target_load_grams: 0,
        target_min_reps: 0,
        target_max_reps: 0,
        target_json: JSON.stringify({
          version: 1,
          profile: "added_load_reps",
          addedLoadGrams: 15_000,
          minReps: 6,
          maxReps: 8,
          incrementGrams: 2_500,
          perSide: false,
        }),
        metric_profile: "added_load_reps",
        metric_contract_version: 1,
        exercise_metric_generation: 3,
        observed_load_grams: null,
        observed_reps: null,
        observed_json: JSON.stringify({
          version: 1,
          profile: "added_load_reps",
          addedLoadGrams: 17_500,
          reps: 7,
          source: "manual",
        }),
        status: "draft",
        draft_updated_at_ms: 2_000,
        completed_at_ms: null,
        completion_idempotency_key: null,
        revision: 2,
      }];
    }
    if (sql.includes("FROM workout_sessions ws")) {
      return [];
    }
    if (sql.includes("FROM session_rest_states")) {
      return [];
    }
    throw new Error(`unexpected_query:${sql}`);
  });

  return {
    queryAll,
  } as unknown as Parameters<typeof createWorkoutRepository>[0];
}

type UiProfileCase = Readonly<{
  name: string;
  identity: MetricIdentity;
  target: MetricTarget;
  observation: MetricObservation;
  inputLabels: readonly string[];
  fixedLabel?: string;
}>;

const uiProfileCases: readonly UiProfileCase[] = [
  {
    name: "Load + reps",
    identity: {
      profile: "load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
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
      loadGrams: 60_000,
      reps: 8,
      source: "manual",
    },
    inputLabels: [
      "Working set 1 load in kilograms",
      "Working set 1 repetitions",
    ],
  },
  {
    name: "Bodyweight reps",
    identity: {
      profile: "bodyweight_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "bodyweight_reps",
      minReps: 8,
      maxReps: 12,
      variationId: "strict",
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "bodyweight_reps",
      reps: 12,
      source: "manual",
    },
    inputLabels: ["Working set 1 repetitions"],
    fixedLabel: "Bodyweight · strict",
  },
  {
    name: "Added load + reps",
    identity: {
      profile: "added_load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 3,
    },
    target: {
      version: 1,
      profile: "added_load_reps",
      addedLoadGrams: 10_000,
      minReps: 6,
      maxReps: 8,
      incrementGrams: 2_500,
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "added_load_reps",
      addedLoadGrams: 10_000,
      reps: 8,
      source: "manual",
    },
    inputLabels: [
      "Working set 1 added load in kilograms",
      "Working set 1 repetitions",
    ],
  },
  {
    name: "Assisted reps",
    identity: {
      profile: "assisted_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 4,
    },
    target: {
      version: 1,
      profile: "assisted_reps",
      assistanceGrams: 20_000,
      minReps: 6,
      maxReps: 8,
      decrementGrams: 2_500,
      assistanceEquipmentId: "machine-stack",
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "assisted_reps",
      assistanceGrams: 20_000,
      reps: 8,
      source: "manual",
    },
    inputLabels: [
      "Working set 1 assistance in kilograms",
      "Working set 1 repetitions",
    ],
    fixedLabel: "Assistance equipment · machine-stack",
  },
  {
    name: "Timed hold",
    identity: {
      profile: "timed_hold",
      contractVersion: 2,
      exerciseMetricGeneration: 5,
    },
    target: {
      version: 2,
      profile: "timed_hold",
      durationMs: 45_500,
      perSide: false,
    },
    observation: {
      version: 2,
      profile: "timed_hold",
      durationMs: 45_250,
      source: "manual",
    },
    inputLabels: ["Working set 1 duration in seconds"],
  },
  {
    name: "Fixed distance",
    identity: {
      profile: "fixed_distance",
      contractVersion: 1,
      exerciseMetricGeneration: 6,
    },
    target: {
      version: 1,
      profile: "fixed_distance",
      plannedDistanceMeters: 2_000,
    },
    observation: {
      version: 1,
      profile: "fixed_distance",
      distanceMeters: 2_000,
      durationMs: 720_000,
      source: "manual",
    },
    inputLabels: ["Working set 1 actual duration in seconds"],
    fixedLabel: "Planned distance · 2000 m",
  },
  {
    name: "Fixed time",
    identity: {
      profile: "fixed_time",
      contractVersion: 1,
      exerciseMetricGeneration: 7,
    },
    target: {
      version: 1,
      profile: "fixed_time",
      plannedDurationMs: 720_000,
    },
    observation: {
      version: 1,
      profile: "fixed_time",
      durationMs: 720_000,
      distanceMeters: 2_400,
      source: "manual",
    },
    inputLabels: ["Working set 1 actual distance in meters"],
    fixedLabel: "Planned duration · 720 sec",
  },
  {
    name: "Rounds / intervals",
    identity: {
      profile: "intervals",
      contractVersion: 1,
      exerciseMetricGeneration: 8,
    },
    target: {
      version: 1,
      profile: "intervals",
      protocolId: "bike_30_30_6",
      comparatorId: "rounds_then_work",
      comparatorVersion: 1,
      plannedRounds: 6,
      workIntervalMs: 30_000,
      restIntervalMs: 30_000,
    },
    observation: {
      version: 1,
      profile: "intervals",
      protocolId: "bike_30_30_6",
      completedRounds: 6,
      completedWorkMs: 180_000,
      source: "manual",
    },
    inputLabels: [
      "Working set 1 completed rounds",
      "Working set 1 completed work in seconds",
    ],
    fixedLabel: "Protocol · 6 rounds · 30 sec work · 30 sec rest",
  },
  {
    name: "Mobility / unscored",
    identity: {
      profile: "unscored",
      contractVersion: 1,
      exerciseMetricGeneration: 9,
    },
    target: {
      version: 1,
      profile: "unscored",
      completionRequired: true,
    },
    observation: {
      version: 1,
      profile: "unscored",
      completed: true,
      source: "manual",
    },
    inputLabels: [],
    fixedLabel: "Completion only · no performance ranking",
  },
];

const durationInputLabels = new Set([
  "Working set 1 duration in seconds",
  "Working set 1 actual duration in seconds",
  "Working set 1 completed work in seconds",
]);

const decimalInputLabels = new Set([
  "Working set 1 load in kilograms",
  "Working set 1 added load in kilograms",
  "Working set 1 assistance in kilograms",
]);

function profileSet(profileCase: UiProfileCase): ActiveWorkoutSet {
  return {
    id: `set-${profileCase.identity.profile}`,
    kind: "working",
    ordinal: 0,
    sourceTargetId: `target-${profileCase.identity.profile}`,
    metricIdentity: profileCase.identity,
    target: profileCase.target,
    observation: profileCase.observation,
    status: "draft",
    completedAtMs: null,
    revision: 2,
    valueSources: [{
      source: "manual",
      observation: profileCase.observation,
    }],
  };
}

function profileView(
  profileCase: UiProfileCase,
  status: "completed" | "draft" = "draft",
): ActiveWorkoutView {
  const set = {
    ...profileSet(profileCase),
    status,
    completedAtMs: status === "completed" ? 3_000 : null,
    revision: status === "completed" ? 3 : 2,
  } as ActiveWorkoutSet;
  const exercise = {
    id: `exercise-${profileCase.identity.profile}`,
    exerciseId: `library-${profileCase.identity.profile}`,
    name: profileCase.name,
    metricIdentity: profileCase.identity,
    metricProfile: profileCase.identity.profile,
    ordinal: 0,
    defaultRestSeconds: 0,
    status: status === "completed" ? "completed" as const : "active" as const,
    revision: status === "completed" ? 3 : 2,
    warmups: [],
    workingSets: [set],
  };
  return {
    id: `session-${profileCase.identity.profile}`,
    status: "in_progress",
    revision: status === "completed" ? 3 : 2,
    activeSetId: status === "completed" ? null : set.id,
    activeExerciseId: exercise.id,
    currentExercise: exercise,
    exercises: [exercise],
    progress: {
      completedWorkingSets: status === "completed" ? 1 : 0,
      totalWorkingSets: 1,
    },
    rest: {
      version: 1,
      state: "idle",
      revision: 0,
      nextSetId: null,
    },
  };
}

function profileCommands(
  view: ActiveWorkoutView,
  completeSet: ActiveWorkoutCommands["completeSet"],
): ActiveWorkoutCommands {
  const restResult: Awaited<
    ReturnType<ActiveWorkoutCommands["startManualRest"]>
  > = {
    state: view.rest,
    sessionRevision: view.revision,
    invalidationScopes: [
      ["active-workout", view.id],
      ["today"],
    ],
  };
  return {
    updateActiveSetDraft: jest.fn(async () => view),
    updateWarmupDraft: jest.fn(async () => view),
    addWarmup: jest.fn(async () => ({
      ...view,
      committedSetId: view.currentExercise.warmups[0]?.id ?? "warmup",
    })),
    addWorkingSet: jest.fn(async () => ({
      ...view,
      committedSetId: view.currentExercise.workingSets[0]?.id ?? "working",
    })),
    copyPreviousWarmup: jest.fn(async () => ({
      ...view,
      committedSetId: view.currentExercise.warmups[0]?.id ?? "warmup",
    })),
    completeWarmup: jest.fn(async () => view),
    skipWarmup: jest.fn(async () => view),
    skipWorkingSet: jest.fn(async () => view),
    reviseCompletedSet: jest.fn(async () => ({
      ...view,
      committedSetId: view.currentExercise.workingSets[0]?.id ?? "working",
    })),
    completeSet,
    startManualRest: jest.fn(async () => restResult),
    pauseRest: jest.fn(async () => restResult),
    resumeRest: jest.fn(async () => restResult),
    adjustRest: jest.fn(async () => restResult),
    skipRest: jest.fn(async () => restResult),
    expireRest: jest.fn(async () => restResult),
    finishCompleted: jest.fn(async () => ({
      detail: {} as never,
      invalidationScopes: [],
    })),
    finishPartial: jest.fn(async () => ({
      detail: {} as never,
      invalidationScopes: [],
    })),
    saveZeroSetWorkout: jest.fn(async () => ({
      detail: {} as never,
      invalidationScopes: [],
    })),
    discardWorkout: jest.fn(async () => ({
      detail: {} as never,
      invalidationScopes: [],
    })),
    skipExercise: jest.fn<ActiveWorkoutCommands["skipExercise"]>(
      async () => ({
        sessionId: view.id,
        status: "in_progress",
        sessionRevision: view.revision,
      }),
    ),
  };
}

describe("active workout metric profiles", () => {
  it("reads persisted added load identity into the shared inline SetRow", async () => {
    const repository = createWorkoutRepository(persistedAddedLoadKernel());
    const view = await repository.getActiveWorkout("session-added-load");
    const set = view.currentExercise.workingSets[0]!;

    expect(view.currentExercise.metricIdentity).toEqual({
      profile: "added_load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 3,
    });
    expect(set.metricIdentity).toEqual(view.currentExercise.metricIdentity);
    expect(set.target).toEqual({
      version: 1,
      profile: "added_load_reps",
      addedLoadGrams: 15_000,
      minReps: 6,
      maxReps: 8,
      incrementGrams: 2_500,
      perSide: false,
    });
    expect(set.observation).toEqual({
      version: 1,
      profile: "added_load_reps",
      addedLoadGrams: 17_500,
      reps: 7,
      source: "manual",
    });

    await render(
      <AppearanceProvider>
        <SetRow
          active
          count={1}
          index={1}
          kind="working"
          onChangeValues={jest.fn(() => undefined)}
          onComplete={jest.fn()}
          onSkip={jest.fn()}
          set={set}
        />
      </AppearanceProvider>,
    );

    expect(
      screen.getByLabelText("Working set 1 added load in kilograms"),
    ).toHaveProp("value", "17.5");
    expect(screen.getByLabelText("Working set 1 repetitions"))
      .toHaveProp("value", "7");
    expect(screen.getByText("kg")).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Complete Set 1" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Skip Set 1" }),
    ).toBeOnTheScreen();
  });

  it.each(uiProfileCases)(
    "keeps $name inline with adjacent Complete and Skip",
    async (profileCase) => {
      const set = profileSet(profileCase);
      const onComplete = jest.fn();
      const onSkip = jest.fn();
      await render(
        <AppearanceProvider>
          <SetRow
            active
            count={1}
            index={1}
            kind="working"
            onChangeValues={jest.fn(() => undefined)}
            onComplete={onComplete}
            onSkip={onSkip}
            set={set}
          />
        </AppearanceProvider>,
      );

      for (const label of profileCase.inputLabels) {
        const input = screen.getByLabelText(label);
        expect(input).toBeOnTheScreen();
        if (durationInputLabels.has(label)) {
          expect(input).toHaveProp(
            "accessibilityHint",
            "Opens a time-style duration selector.",
          );
        } else {
          expect(input).toHaveProp(
            "keyboardType",
            decimalInputLabels.has(label) ? "decimal-pad" : "number-pad",
          );
        }
      }
      if (profileCase.fixedLabel !== undefined) {
        expect(screen.getByText(profileCase.fixedLabel)).toBeOnTheScreen();
      }
      expect(screen.getByTestId("working-set-1-actions")).toHaveStyle({
        flexDirection: "row",
      });
      await fireEvent.press(
        screen.getByRole("button", { name: "Complete Set 1" }),
      );
      expect(onComplete).toHaveBeenCalledTimes(1);
      await fireEvent.press(
        screen.getByRole("button", { name: "Skip Set 1" }),
      );
      expect(onSkip).toHaveBeenCalledTimes(1);
    },
  );

  it.each(uiProfileCases)(
    "retains $name values through failed Complete and direct Retry",
    async (profileCase) => {
      const initial = profileView(profileCase);
      const completeSet = jest.fn<ActiveWorkoutCommands["completeSet"]>()
        .mockRejectedValueOnce(new Error("storage_failed"))
        .mockResolvedValueOnce({
          outcome: "committed",
          view: profileView(profileCase, "completed"),
        });
      await render(
        <AppearanceProvider>
          <ActiveWorkoutScreen
            commands={profileCommands(initial, completeSet)}
            nowMs={() => 3_000}
            onFinishLater={jest.fn()}
            onGoBack={jest.fn()}
            sessionId={initial.id}
            view={initial}
          />
        </AppearanceProvider>,
      );

      await fireEvent.press(
        screen.getByRole("button", { name: "Complete Set 1" }),
      );
      await waitFor(() => {
        expect(screen.getByRole("button", {
          name: "Set not saved · Retry",
        })).toBeOnTheScreen();
      });
      for (const label of profileCase.inputLabels) {
        expect(screen.getByLabelText(label)).toBeOnTheScreen();
      }
      await fireEvent.press(
        screen.getByRole("button", { name: "Set not saved · Retry" }),
      );
      await waitFor(() => {
        expect(screen.getByText("Completed working set 1"))
          .toBeOnTheScreen();
      });
      expect(completeSet).toHaveBeenCalledTimes(2);
      expect(completeSet.mock.calls[1]).toEqual(completeSet.mock.calls[0]);
    },
  );

  it("renders every explicit metric profile choice with approved copy", async () => {
    const onSelect = jest.fn();
    await render(
      <AppearanceProvider>
        <>
          {[
            ["load_reps", "Load + reps", "60 kg × 8",
              "Higher completed load wins; ties use more reps"],
            ["bodyweight_reps", "Bodyweight reps", "Bodyweight × 12",
              "More completed reps wins"],
            ["added_load_reps", "Added load + reps", "BW + 10 kg × 8",
              "Higher added load wins; ties use more reps"],
            ["assisted_reps", "Assisted reps", "20 kg assist × 8",
              "Lower assistance meeting the target wins; ties use more reps"],
            ["timed_hold", "Timed hold", "45 sec",
              "Longer completed duration wins"],
            ["fixed_distance", "Fixed distance", "2 km in 12 min",
              "Faster completed time for the same planned distance wins"],
            ["fixed_time", "Fixed time", "2.4 km in 12 min",
              "Greater distance for the same planned duration wins"],
            ["intervals", "Rounds / intervals", "6 rounds · 30 sec work",
              "Uses the plan-authored comparator for the same protocol"],
            ["unscored", "Mobility / unscored", "Completed",
              "Completion only; no performance ranking"],
          ].map(([profile, label, example, comparison]) => (
            <MetricProfileOption
              comparison={comparison!}
              example={example!}
              key={profile}
              label={label!}
              onSelect={onSelect}
              profile={profile as MetricIdentity["profile"]}
              selected={profile === "load_reps"}
            />
          ))}
        </>
      </AppearanceProvider>,
    );

    for (const profileCase of uiProfileCases) {
      expect(screen.getByText(profileCase.name)).toBeOnTheScreen();
    }
    expect(screen.getByRole("radio", { name: /Load \+ reps/u }))
      .toHaveProp(
        "accessibilityState",
        expect.objectContaining({ selected: true }),
      );
    await fireEvent.press(
      screen.getByRole("radio", { name: /Fixed distance/u }),
    );
    expect(onSelect).toHaveBeenCalledWith("fixed_distance");
    fireEvent(
      screen.getByRole("radio", { name: /Timed hold/u }),
      "accessibilityAction",
      { nativeEvent: { actionName: "activate" } },
    );
    expect(onSelect).toHaveBeenCalledWith("timed_hold");
  });
});

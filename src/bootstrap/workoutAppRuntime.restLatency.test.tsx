import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { AppState, Text } from "react-native";
import { describe, expect, it, jest } from "@jest/globals";
import type { RestCommandResult, RestRepository, RestStateV1 } from "../domains/rest";
import type { TodayView } from "../domains/workout";
import type { SqliteKernel } from "../platform/sqlite";
import {
  WorkoutAppRuntimeProvider,
  type WorkoutAppRuntimeDependencies,
  useWorkoutAppRuntime,
} from "./workoutAppRuntime";
import type { WorkoutLifecycleResult } from "./workoutLifecycle";

jest.mock("../platform/notifications/expoRestNotificationAdapter", () => ({
  createExpoRestNotificationAdapter: jest.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const running: Extract<RestStateV1, { state: "running" }> = {
  version: 1, state: "running", revision: 7,
  startedAtMs: 1_000, endsAtMs: 91_000, nextSetId: "set-2",
};

function committed(restRevision = 8, sessionRevision = 12): RestCommandResult {
  return {
    state: { ...running, revision: restRevision, endsAtMs: 76_000 },
    sessionRevision,
    invalidationScopes: [["active-workout", "session-1"], ["today"]],
  };
}

function fixture(view: TodayView = {
  state: "active_workout", sessionId: "session-1", exerciseName: "Squat",
  setLabel: "Working set 2", restStatus: "running",
}) {
  const queryAll = jest.fn<SqliteKernel["queryAll"]>(async () => []);
  const kernel = { queryAll, close: jest.fn(async () => undefined) } as unknown as SqliteKernel;
  const repository = {
    getTodayView: jest.fn(async () => view),
    getActivation: jest.fn(async () => null),
  };
  const rest: RestRepository = {
    getRestState: jest.fn(async () => running),
    getRestContext: jest.fn(async () => ({ state: running, sessionRevision: 11 })),
    listActiveSessionIds: jest.fn(async () => ["session-1"]),
    currentRestRevision: jest.fn(async () => running.revision),
    startManualRest: jest.fn(async () => committed()),
    pauseRest: jest.fn(async () => committed()),
    resumeRest: jest.fn(async () => committed()),
    adjustRest: jest.fn(async () => committed()),
    skipRest: jest.fn(async () => committed()),
    expireRest: jest.fn(async () => committed()),
    expireRestWithForegroundFeedback: jest.fn(async () => committed()),
  };
  const notifications = {
    cancel: jest.fn(async () => undefined),
    permission: jest.fn(async () => "granted" as const),
    requestPermission: jest.fn(async () => "granted" as const),
  };
  const lifecycleResult = {
    trigger: "post_commit", permission: "granted", foregroundFeedback: [],
  } as unknown as WorkoutLifecycleResult;
  const lifecycle = {
    trigger: jest.fn(async () => lifecycleResult),
    subscribeForeground: jest.fn(() => () => undefined),
    dispose: jest.fn(async () => undefined),
  };
  const schedules = { loadToday: jest.fn(async () => null) };
  const dependencies: WorkoutAppRuntimeDependencies = {
    openKernel: async () => kernel,
    migrate: async () => undefined,
    activateInitialStarter: async () => undefined,
    createRepository: () => repository as never,
    createRestRepository: () => rest,
    createNotifications: () => notifications as never,
    createLifecycle: () => lifecycle as never,
    createScheduleRuntime: () => schedules as never,
    createOutcomeRepository: () => ({} as never),
    createWorkoutRepository: () => ({} as never),
    restAlertPreferenceStore: {
      read: () => ({ soundEnabled: true, vibrationEnabled: true }),
      write: () => undefined,
    },
    now: () => new Date("2026-08-17T08:00:00+08:00"),
    nowMs: () => 10_000,
  };
  return { dependencies, kernel, repository, rest, notifications, lifecycle, lifecycleResult, schedules };
}

async function mount(input: ReturnType<typeof fixture>) {
  let runtime!: ReturnType<typeof useWorkoutAppRuntime>;
  function Probe() {
    runtime = useWorkoutAppRuntime();
    return <Text>{runtime.launchState}</Text>;
  }
  const rendered = await render(
    <WorkoutAppRuntimeProvider dependencies={input.dependencies}><Probe /></WorkoutAppRuntimeProvider>,
  );
  await waitFor(() => expect(runtime.launchState).toBe("trusted"));
  return { rendered, current: () => runtime };
}

const revisionInput = {
  sessionId: "session-1", expectedSessionRevision: 11, expectedRestRevision: 7, nowMs: 10_000,
};

describe("rest command acknowledgement latency", () => {
  it("reports a failed native alarm replacement so precise-alert refresh can be retried", async () => {
    const input = fixture();
    const runtime = await mount(input);
    input.lifecycle.trigger.mockResolvedValueOnce({ ...input.lifecycleResult, outcomes: [{ outcome: "platform_failure", permission: "granted" }] });
    try {
      await act(async () => {
        await expect(runtime.current().refreshPreciseRestAlarms()).rejects.toThrow("precise_rest_alarm_refresh_failed");
      });
      expect(input.notifications.cancel).toHaveBeenCalledWith("rest:session-1");
    } finally { await runtime.rendered.unmount(); }
  });
  it("upgrades precise alarms from current saved rest after earlier reconciliation settles", async () => {
    const input = fixture();
    const runtime = await mount(input);
    const effects = deferred<WorkoutLifecycleResult>();
    input.lifecycle.trigger.mockReturnValueOnce(effects.promise);
    try {
      await act(async () => { await runtime.current().adjustRest({ ...revisionInput, deltaMs: -15_000 }); });
      await waitFor(() => expect(input.lifecycle.trigger).toHaveBeenCalledTimes(2));
      let upgrade!: Promise<void>;
      await act(async () => { upgrade = runtime.current().refreshPreciseRestAlarms(); });
      jest.mocked(input.rest.getRestContext).mockResolvedValue({ state: { version: 1, state: "paused", revision: 9, remainingMs: 25_000, nextSetId: "set-2" }, sessionRevision: 13 });
      await act(async () => { effects.resolve(input.lifecycleResult); await upgrade; });
      expect(input.notifications.cancel).not.toHaveBeenCalled();
      expect(input.lifecycle.trigger).toHaveBeenCalledTimes(3);
    } finally { effects.resolve(input.lifecycleResult); await runtime.rendered.unmount(); }
  });
  it("coalesces obsolete notification reconciliation after a burst of committed adjustments", async () => {
    const input = fixture();
    const runtime = await mount(input);
    const effects = deferred<WorkoutLifecycleResult>();
    input.lifecycle.trigger.mockReturnValueOnce(effects.promise);
    jest.mocked(input.rest.adjustRest).mockResolvedValueOnce(committed()).mockResolvedValueOnce(committed(9, 13)).mockResolvedValueOnce(committed(10, 14));
    try {
      await act(async () => {
        await runtime.current().adjustRest({ ...revisionInput, deltaMs: -15_000 });
      });
      await waitFor(() => expect(input.lifecycle.trigger).toHaveBeenCalledTimes(2));
      await act(async () => {
        await runtime.current().adjustRest({ ...revisionInput, expectedSessionRevision: 12, expectedRestRevision: 8, deltaMs: -15_000 });
        await runtime.current().adjustRest({ ...revisionInput, expectedSessionRevision: 13, expectedRestRevision: 9, deltaMs: -15_000 });
      });
      expect(input.rest.adjustRest).toHaveBeenCalledTimes(3);
      await act(async () => { effects.resolve(input.lifecycleResult); });
      await waitFor(() => expect(input.lifecycle.trigger).toHaveBeenCalledTimes(3)); // launch, first active pass, latest queued pass
      expect(runtime.current().workoutRefreshGeneration).toBe(0);
    } finally {
      effects.resolve(input.lifecycleResult);
      await runtime.rendered.unmount();
    }
  });
  it("acknowledges only committed state while unrelated schedule reads remain pending", async () => {
    const input = fixture();
    const runtime = await mount(input);
    const write = deferred<RestCommandResult>();
    const slowSchedule = deferred<null>();
    jest.mocked(input.rest.adjustRest).mockReturnValueOnce(write.promise);
    input.schedules.loadToday.mockReturnValue(slowSchedule.promise);
    const result = committed();
    let acknowledged: RestCommandResult | undefined;
    let command!: Promise<RestCommandResult>;
    try {
      await act(async () => {
        command = runtime.current().adjustRest({ ...revisionInput, deltaMs: -15_000 });
        void command.then((value) => { acknowledged = value; });
      });
      expect(acknowledged).toBeUndefined();
      expect(input.lifecycle.trigger).toHaveBeenCalledTimes(1);
      await act(async () => { write.resolve(result); });
      expect(acknowledged).toBe(result);
      expect(input.schedules.loadToday).toHaveBeenCalledTimes(1);
      expect(runtime.current().actionFailure).toBeUndefined();
    } finally {
      slowSchedule.resolve(null);
      await act(async () => { await command; });
      await runtime.rendered.unmount();
    }
  });

  it("updates Today rest status from the committed result without triggering a workout or progress reload", async () => {
    const input = fixture();
    const runtime = await mount(input);
    const result: RestCommandResult = {
      ...committed(), state: { version: 1, state: "paused", revision: 8, remainingMs: 66_000, nextSetId: "set-2" },
    };
    jest.mocked(input.rest.pauseRest).mockResolvedValue(result);
    input.repository.getTodayView.mockRejectedValue(new Error("unrelated_today_read_failed"));
    await act(async () => { expect(await runtime.current().pauseRest(revisionInput)).toBe(result); });
    expect(runtime.current().view).toEqual({
      state: "active_workout", sessionId: "session-1", exerciseName: "Squat",
      setLabel: "Working set 2", restStatus: "paused",
    });
    expect(runtime.current().actionFailure).toBeUndefined();
    expect(runtime.current().workoutRefreshGeneration).toBe(0);
    expect(input.repository.getTodayView).toHaveBeenCalledTimes(1);
    await runtime.rendered.unmount();
  });

  it("serializes writes without making a committed adjustment wait for lifecycle reconciliation", async () => {
    const input = fixture();
    const runtime = await mount(input);
    const firstWrite = deferred<RestCommandResult>();
    const effects = deferred<WorkoutLifecycleResult>();
    jest.mocked(input.rest.adjustRest).mockReturnValueOnce(firstWrite.promise).mockResolvedValueOnce(committed(9, 13));
    input.lifecycle.trigger.mockReturnValueOnce(effects.promise);
    const acknowledge: RestCommandResult[] = [];
    let first!: Promise<RestCommandResult>;
    let second!: Promise<RestCommandResult>;
    try {
      await act(async () => {
        first = runtime.current().adjustRest({ ...revisionInput, deltaMs: -15_000 });
        second = runtime.current().adjustRest({
          ...revisionInput, expectedSessionRevision: 12, expectedRestRevision: 8, deltaMs: -15_000,
        });
        void first.then((value) => { acknowledge.push(value); });
        void second.then((value) => { acknowledge.push(value); });
      });
      expect(input.rest.adjustRest).toHaveBeenCalledTimes(1);
      await act(async () => { firstWrite.resolve(committed()); });
      expect(acknowledge.map(({ sessionRevision }) => sessionRevision)).toEqual([12, 13]);
      expect(input.rest.adjustRest).toHaveBeenNthCalledWith(2, {
        ...revisionInput, expectedSessionRevision: 12, expectedRestRevision: 8, deltaMs: -15_000,
      });
      expect(input.lifecycle.trigger).toHaveBeenCalledTimes(2); // launch + first deferred reconciliation
      await act(async () => { effects.resolve(input.lifecycleResult); });
      expect(input.lifecycle.trigger).toHaveBeenCalledTimes(2); // obsolete rest passes coalesce into the latest one
      expect(runtime.current().workoutRefreshGeneration).toBe(0);
    } finally {
      firstWrite.resolve(committed());
      effects.resolve(input.lifecycleResult);
      await act(async () => { await Promise.all([first, second]); });
      await runtime.rendered.unmount();
    }
  });

  it("retains repository conflicts and resumes queued writes after a failed transaction", async () => {
    const input = fixture();
    const runtime = await mount(input);
    const failed = deferred<RestCommandResult>();
    const failure = new Error("session_revision_conflict");
    jest.mocked(input.rest.adjustRest).mockReturnValueOnce(failed.promise).mockResolvedValueOnce(committed());
    let outcomes!: Promise<PromiseSettledResult<RestCommandResult>[]>;
    await act(async () => {
      outcomes = Promise.allSettled([
        runtime.current().adjustRest({ ...revisionInput, expectedSessionRevision: 1, deltaMs: -15_000 }),
        runtime.current().adjustRest({ ...revisionInput, deltaMs: -15_000 }),
      ]);
    });
    expect(input.rest.adjustRest).toHaveBeenCalledTimes(1);
    await act(async () => { failed.reject(failure); });
    expect(await outcomes).toEqual([
      { status: "rejected", reason: failure }, { status: "fulfilled", value: committed() },
    ]);
    expect(input.rest.adjustRest).toHaveBeenNthCalledWith(1, {
      ...revisionInput, expectedSessionRevision: 1, deltaMs: -15_000,
    });
    expect(input.lifecycle.trigger).toHaveBeenCalledTimes(2);
    await runtime.rendered.unmount();
  });

  it("continues durable reconciliation after a failed adapter pass without changing committed acknowledgements", async () => {
    const input = fixture();
    const runtime = await mount(input);
    input.lifecycle.trigger.mockRejectedValueOnce(new Error("effects_pending"));
    await act(async () => { await runtime.current().adjustRest({ ...revisionInput, deltaMs: -15_000 }); });
    await act(async () => {
      await runtime.current().adjustRest({
        ...revisionInput, expectedSessionRevision: 12, expectedRestRevision: 8, deltaMs: 15_000,
      });
    });
    expect(input.lifecycle.trigger).toHaveBeenCalledTimes(3);
    expect(runtime.current().actionFailure).toBeUndefined();
    expect(runtime.current().workoutRefreshGeneration).toBe(0);
    await runtime.rendered.unmount();
  });

  it("acknowledges an in-flight commit after disposal and rejects stale queued commands without touching the closed repository", async () => {
    const input = fixture();
    const runtime = await mount(input);
    const write = deferred<RestCommandResult>();
    jest.mocked(input.rest.adjustRest).mockReturnValueOnce(write.promise);
    let outcomes!: Promise<PromiseSettledResult<RestCommandResult>[]>;
    await act(async () => {
      outcomes = Promise.allSettled([
        runtime.current().adjustRest({ ...revisionInput, deltaMs: -15_000 }),
        runtime.current().adjustRest({ ...revisionInput, deltaMs: -15_000 }),
      ]);
    });
    await runtime.rendered.unmount();
    write.resolve(committed());
    expect(await outcomes).toEqual([
      { status: "fulfilled", value: committed() },
      { status: "rejected", reason: new Error("workout_runtime_not_trusted") },
    ]);
    expect(input.rest.adjustRest).toHaveBeenCalledTimes(1);
    expect(input.lifecycle.trigger).toHaveBeenCalledTimes(1);
  });

  it("stops stale reconciliation after a slow permission read completes following disposal", async () => {
    const input = fixture();
    const runtime = await mount(input);
    const permission = deferred<"granted">();
    input.notifications.permission.mockReturnValueOnce(permission.promise);
    await act(async () => { await runtime.current().pauseRest(revisionInput); });
    await runtime.rendered.unmount();
    await act(async () => { permission.resolve("granted"); });
    expect(input.lifecycle.trigger).toHaveBeenCalledTimes(1);
  });

  it("leaves another session's Today presentation intact", async () => {
    const today: TodayView = {
      state: "active_workout", sessionId: "other-session", exerciseName: "Other",
      setLabel: "Working set 1", restStatus: "running",
    };
    const input = fixture(today);
    const runtime = await mount(input);
    await act(async () => { await runtime.current().skipRest(revisionInput); });
    expect(runtime.current().view).toBe(today);
    await runtime.rendered.unmount();
  });

  it.each([true, undefined] as const)("keeps foreground expiry durable with countdown tone ownership %s", async (foregroundCountdownTone) => {
    const input = fixture();
    const runtime = await mount(input);
    const state = AppState.currentState;
    Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" });
    const expiry: RestCommandResult = {
      ...committed(), state: { version: 1, state: "expired", revision: 8, expiredAtMs: 91_000, nextSetId: "set-2" },
    };
    jest.mocked(input.rest.expireRestWithForegroundFeedback!).mockResolvedValue(expiry);
    try {
      await act(async () => {
        expect(await runtime.current().expireRest({
          ...revisionInput, ...(foregroundCountdownTone ? { foregroundCountdownTone } : {}),
        })).toBe(expiry);
      });
      expect(input.rest.expireRestWithForegroundFeedback).toHaveBeenCalledWith({
        ...revisionInput, preferences: { soundEnabled: !foregroundCountdownTone, vibrationEnabled: true },
      });
      expect(input.lifecycle.trigger).toHaveBeenLastCalledWith("post_commit", {
        foregroundExpiry: { sessionId: "session-1", restRevision: 8 },
      });
      expect(runtime.current().readRestAlertPreferences()).toEqual({ soundEnabled: true, vibrationEnabled: true });
      expect(input.rest.expireRest).not.toHaveBeenCalled();
      expect(runtime.current().workoutRefreshGeneration).toBe(0);
    } finally {
      Object.defineProperty(AppState, "currentState", { configurable: true, value: state });
      await runtime.rendered.unmount();
    }
  });

  it.each(["background", "inactive"])("uses the background expiry path even with a countdown ownership flag in %s", async (appState) => {
    const input = fixture();
    const runtime = await mount(input);
    const state = AppState.currentState;
    Object.defineProperty(AppState, "currentState", { configurable: true, value: appState });
    try {
      await act(async () => { await runtime.current().expireRest({ ...revisionInput, foregroundCountdownTone: true }); });
      expect(input.rest.expireRest).toHaveBeenCalledWith(revisionInput);
      expect(input.rest.expireRestWithForegroundFeedback).not.toHaveBeenCalled();
      expect(runtime.current().readRestAlertPreferences()).toEqual({ soundEnabled: true, vibrationEnabled: true });
    } finally {
      Object.defineProperty(AppState, "currentState", { configurable: true, value: state });
      await runtime.rendered.unmount();
    }
  });

  it("selects the background path when a queued foreground expiry starts after the app moves to background", async () => {
    const input = fixture();
    const runtime = await mount(input);
    const state = AppState.currentState;
    const write = deferred<RestCommandResult>();
    jest.mocked(input.rest.adjustRest).mockReturnValueOnce(write.promise);
    let commands!: Promise<PromiseSettledResult<RestCommandResult>[]>;
    Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" });
    try {
      await act(async () => {
        commands = Promise.allSettled([
          runtime.current().adjustRest({ ...revisionInput, deltaMs: -15_000 }),
          runtime.current().expireRest({
            ...revisionInput, expectedSessionRevision: 12, expectedRestRevision: 8,
            foregroundCountdownTone: true,
          }),
        ]);
      });
      Object.defineProperty(AppState, "currentState", { configurable: true, value: "background" });
      await act(async () => { write.resolve(committed()); await commands; });
      expect(input.rest.expireRest).toHaveBeenCalledWith({
        ...revisionInput, expectedSessionRevision: 12, expectedRestRevision: 8,
      });
      expect(input.rest.expireRestWithForegroundFeedback).not.toHaveBeenCalled();
    } finally {
      write.resolve(committed());
      await commands;
      Object.defineProperty(AppState, "currentState", { configurable: true, value: state });
      await runtime.rendered.unmount();
    }
  });
});

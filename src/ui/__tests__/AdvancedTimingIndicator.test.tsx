import {
  act,
  fireEvent,
  render,
  screen,
} from "@testing-library/react-native";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";
import {
  AppState,
} from "react-native";

import type {
  AdvancedTimingCommandResult,
  AdvancedTimingStateV1,
} from "../../domains/advancedTiming";
import {
  AdvancedTimingIndicator,
  type AdvancedTimingIndicatorContext,
} from "../components/AdvancedTimingIndicator";
import {
  AppearanceProvider,
} from "../theme";

const running: Extract<AdvancedTimingStateV1, { state: "running" }> = {
  version: 1,
  state: "running",
  mode: "per_rep",
  revision: 2,
  targetSessionSetId: "set-1",
  cueChannels: "haptic",
  intervalMs: 3_000,
  startedAtMs: 10_000,
  nextBoundaryAtMs: 13_000,
  nextRepetitionIndex: 1,
};

const idle: AdvancedTimingStateV1 = {
  version: 1,
  state: "idle",
  revision: 0,
  targetSessionSetId: null,
};

function result(state: AdvancedTimingStateV1): AdvancedTimingCommandResult {
  return {
    state,
    sessionRevision: 1,
    invalidationScopes: [["active-workout", "session-1"], ["today"]],
  };
}

function runningState(
  changes: Partial<Omit<
    Extract<AdvancedTimingStateV1, { state: "running" }>,
    "state"
  >> = {},
): Extract<AdvancedTimingStateV1, { state: "running" }> {
  return {
    ...running,
    ...changes,
  };
}

function context(
  state: AdvancedTimingStateV1 = idle,
): AdvancedTimingIndicatorContext {
  return {
    sessionId: "session-1",
    sessionRevision: 1,
    state,
  };
}

async function renderIndicator(
  props: Partial<React.ComponentProps<typeof AdvancedTimingIndicator>> = {},
) {
  let now = 10_000;
  const defaults = {
    context: context(),
    nowMs: () => now,
    onConfigureAndStart: jest.fn(async (intervalMs: number) =>
      result(runningState({
        intervalMs,
        nextBoundaryAtMs: now + intervalMs,
      }))
    ),
    onPause: jest.fn(async () => result({
      version: 1,
      state: "paused" as const,
      mode: "per_rep",
      revision: running.revision + 1,
      targetSessionSetId: running.targetSessionSetId,
      cueChannels: running.cueChannels,
      intervalMs: running.intervalMs,
      remainingMs: 2_000,
      nextRepetitionIndex: running.nextRepetitionIndex,
    })),
    onReconcile: jest.fn(async () => result({
      ...runningState(),
      revision: 3,
      nextBoundaryAtMs: 16_000,
      nextRepetitionIndex: 2,
    })),
    onResume: jest.fn(async () => result(running)),
    onStop: jest.fn(async () => result({
      version: 1,
      state: "stopped" as const,
      mode: "per_rep",
      revision: running.revision + 1,
      targetSessionSetId: running.targetSessionSetId,
      stoppedAtMs: now,
      nextRepetitionIndex: running.nextRepetitionIndex,
    })),
    targetSetId: "set-1",
  } satisfies React.ComponentProps<typeof AdvancedTimingIndicator>;
  return {
    nowMs: (next: number) => { now = next; },
    props: { ...defaults, ...props },
    rendered: await render(
      <AppearanceProvider>
        <AdvancedTimingIndicator {...defaults} {...props} />
      </AppearanceProvider>,
    ),
  };
}

let restoreCurrentState: (() => void) | undefined;

beforeEach(() => {
  const descriptor = Object.getOwnPropertyDescriptor(AppState, "currentState");
  Object.defineProperty(AppState, "currentState", {
    configurable: true,
    get: () => "active",
  });
  jest.spyOn(AppState, "addEventListener")
    .mockImplementation(() => ({ remove: jest.fn() }));
  restoreCurrentState = () => {
    if (descriptor === undefined) {
      Reflect.deleteProperty(AppState, "currentState");
    } else {
      Object.defineProperty(AppState, "currentState", descriptor);
    }
  };
});

afterEach(() => {
  jest.restoreAllMocks();
  restoreCurrentState?.();
  jest.useRealTimers();
});

describe("AdvancedTimingIndicator", () => {
  it("configures and starts per-rep cadence with stable accessible controls", async () => {
    const { props, rendered } = await renderIndicator();

    expect(rendered.getByText("Per-rep cadence")).toBeOnTheScreen();
    expect(rendered.getByLabelText("Per-rep cadence status. Ready"))
      .toBeOnTheScreen();
    expect(rendered.getByLabelText("Per-rep interval in seconds"))
      .toBeOnTheScreen();
    expect(rendered.getByRole("button", { name: "Configure and start per-rep cadence" }))
      .toHaveStyle({ minHeight: 48, minWidth: 48 });

    await act(async () => {
      fireEvent.changeText(
        rendered.getByTestId("advanced-timing-interval-seconds"),
        "4",
      );
    });
    await fireEvent.press(rendered.getByRole("button", {
      name: "Configure and start per-rep cadence",
    }));

    expect(props.onConfigureAndStart).toHaveBeenCalledWith(4_000);
  });

  it("validates interval bounds without invoking timing commands", async () => {
    const { props, rendered } = await renderIndicator();

    await act(async () => {
      fireEvent.changeText(rendered.getByTestId("advanced-timing-interval-seconds"), "0");
    });
    await fireEvent.press(rendered.getByRole("button", {
      name: "Configure and start per-rep cadence",
    }));

    expect(rendered.getByText("Enter whole seconds from 1 to 60."))
      .toBeOnTheScreen();
    expect(props.onConfigureAndStart).not.toHaveBeenCalled();
  });

  it("renders running controls and reconciles elapsed foreground boundaries once", async () => {
    jest.useFakeTimers();
    const { nowMs, props, rendered } = await renderIndicator({ context: context(running) });

    expect(rendered.getByLabelText("Per-rep cadence status. Rep 1 · 00:03"))
      .toBeOnTheScreen();
    await fireEvent.press(rendered.getByRole("button", { name: "Pause per-rep cadence" }));
    await fireEvent.press(rendered.getByRole("button", { name: "Stop per-rep cadence" }));
    expect(props.onPause).toHaveBeenCalledTimes(1);
    expect(props.onStop).toHaveBeenCalledTimes(1);

    nowMs(13_000);
    await act(async () => {
      jest.advanceTimersByTime(1_000);
      await Promise.resolve();
    });
    expect(props.onReconcile).toHaveBeenCalledWith(10_000);
  });

  it("renders paused controls and disables unavailable timing actions", async () => {
    const paused: Extract<AdvancedTimingStateV1, { state: "paused" }> = {
      version: 1,
      state: "paused",
      mode: "per_rep",
      revision: running.revision,
      targetSessionSetId: running.targetSessionSetId,
      cueChannels: running.cueChannels,
      intervalMs: running.intervalMs,
      remainingMs: 2_000,
      nextRepetitionIndex: running.nextRepetitionIndex,
    };
    const { props, rendered } = await renderIndicator({
      context: context(paused),
      disabled: true,
    });

    expect(rendered.getByLabelText("Per-rep cadence status. Paused · Rep 1 · 00:02"))
      .toBeOnTheScreen();
    expect(rendered.getByRole("button", { name: "Resume per-rep cadence" }))
      .toBeDisabled();
    await fireEvent.press(rendered.getByRole("button", { name: "Resume per-rep cadence" }));
    expect(props.onResume).not.toHaveBeenCalled();
  });

  it("renders stopped state as ready to configure again", async () => {
    const stopped: Extract<AdvancedTimingStateV1, { state: "stopped" }> = {
      version: 1,
      state: "stopped",
      mode: "per_rep",
      revision: 4,
      targetSessionSetId: "set-1",
      stoppedAtMs: 20_000,
      nextRepetitionIndex: 5,
    };
    const { rendered } = await renderIndicator({ context: context(stopped) });

    expect(rendered.getByLabelText("Per-rep cadence status. Stopped · Rep 5"))
      .toBeOnTheScreen();
    expect(rendered.getByRole("button", { name: "Configure and start per-rep cadence" }))
      .toBeOnTheScreen();
  });

  it("shows advisory cue failure without hiding timing controls", async () => {
    const { rendered } = await renderIndicator({
      context: context(running),
      cueUnavailable: true,
    });

    expect(rendered.getByText("Timing cue unavailable")).toBeOnTheScreen();
    expect(rendered.getByText("The timer and recorded set remain accurate."))
      .toBeOnTheScreen();
    expect(rendered.getByRole("button", { name: "Pause per-rep cadence" }))
      .toBeOnTheScreen();
  });

  it("shows command failure without changing the visible ready state", async () => {
    const { props, rendered } = await renderIndicator({
      onConfigureAndStart: jest.fn(async () => {
        throw new Error("advanced_timing_conflict");
      }),
    });

    await fireEvent.press(rendered.getByRole("button", {
      name: "Configure and start per-rep cadence",
    }));

    expect(props.onConfigureAndStart).toHaveBeenCalledTimes(1);
    expect(rendered.getByText("Timing could not be updated")).toBeOnTheScreen();
    expect(rendered.getByLabelText("Per-rep cadence status. Ready"))
      .toBeOnTheScreen();
  });
});

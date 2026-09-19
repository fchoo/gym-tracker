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
    onConfigureAndStart: jest.fn(async (config: Readonly<{
      intervalMs: number;
    }>) =>
      result(runningState({
        intervalMs: config.intervalMs,
        nextBoundaryAtMs: now + config.intervalMs,
      }))
    ),
    onConfigureAndStartCluster: jest.fn(async () => result({
      version: 1,
      state: "cluster_ready" as const,
      mode: "cluster" as const,
      revision: 1,
      targetSessionSetId: "set-1",
      cueChannels: "haptic" as const,
      groupSizes: [3, 3, 3],
      intraRestMs: 20_000,
      currentGroupIndex: 0,
    })),
    onBeginClusterGap: jest.fn(async () => result({
      version: 1,
      state: "cluster_gap_running" as const,
      mode: "cluster" as const,
      revision: 2,
      targetSessionSetId: "set-1",
      cueChannels: "haptic" as const,
      groupSizes: [3, 3, 3],
      intraRestMs: 20_000,
      currentGroupIndex: 0,
      gapStartedAtMs: now,
      gapEndsAtMs: now + 20_000,
    })),
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
    onSkipClusterGap: jest.fn(async () => result({
      version: 1,
      state: "cluster_ready" as const,
      mode: "cluster" as const,
      revision: 3,
      targetSessionSetId: "set-1",
      cueChannels: "haptic" as const,
      groupSizes: [3, 3, 3],
      intraRestMs: 20_000,
      currentGroupIndex: 1,
    })),
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

    expect(props.onConfigureAndStart).toHaveBeenCalledWith({
      version: 1,
      mode: "per_rep",
      intervalMs: 4_000,
      cueChannels: "haptic",
    });
  });

  it("configures and starts cluster timing from a 3+3+3 grouping", async () => {
    const { props, rendered } = await renderIndicator();

    await fireEvent.press(rendered.getByRole("button", { name: "Select cluster timing" }));
    expect(rendered.getByText("Cluster timing")).toBeOnTheScreen();
    expect(rendered.getByLabelText("Cluster timing status. Ready"))
      .toBeOnTheScreen();
    expect(rendered.getByLabelText("Cluster grouping")).toBeOnTheScreen();
    expect(rendered.getByLabelText("Cluster gap in seconds")).toBeOnTheScreen();
    expect(rendered.getByRole("button", { name: "Configure and start cluster timing" }))
      .toHaveStyle({ minHeight: 48, minWidth: 48 });

    await act(async () => {
      fireEvent.changeText(
        rendered.getByTestId("advanced-timing-cluster-pattern"),
        "3+3+3",
      );
      fireEvent.changeText(
        rendered.getByTestId("advanced-timing-cluster-gap-seconds"),
        "20",
      );
    });
    await fireEvent.press(rendered.getByRole("button", {
      name: "Configure and start cluster timing",
    }));

    expect(props.onConfigureAndStartCluster).toHaveBeenCalledWith({
      version: 1,
      mode: "cluster",
      groupSizes: [3, 3, 3],
      intraRestMs: 20_000,
      cueChannels: "haptic",
    });
  });

  it("validates cluster grouping before invoking timing commands", async () => {
    const { props, rendered } = await renderIndicator();

    await fireEvent.press(rendered.getByRole("button", { name: "Select cluster timing" }));
    await act(async () => {
      fireEvent.changeText(rendered.getByTestId("advanced-timing-cluster-pattern"), "9");
    });
    await fireEvent.press(rendered.getByRole("button", {
      name: "Configure and start cluster timing",
    }));

    expect(rendered.getByText("Use groups like 3+3+3 with at least 2 groups."))
      .toBeOnTheScreen();
    expect(props.onConfigureAndStartCluster).not.toHaveBeenCalled();
  });

  it("renders cluster ready and gap controls with explicit progress", async () => {
    const ready: AdvancedTimingStateV1 = {
      version: 1,
      state: "cluster_ready",
      mode: "cluster",
      revision: 2,
      targetSessionSetId: "set-1",
      cueChannels: "haptic",
      groupSizes: [3, 3, 3],
      intraRestMs: 20_000,
      currentGroupIndex: 1,
    };
    const { props, rendered } = await renderIndicator({ context: context(ready) });

    expect(rendered.getByText("Cluster timing")).toBeOnTheScreen();
    expect(rendered.getByLabelText("Cluster timing status. Cluster 2 of 3"))
      .toBeOnTheScreen();
    await fireEvent.press(rendered.getByRole("button", {
      name: "Start rest after group 2",
    }));

    expect(props.onBeginClusterGap).toHaveBeenCalledTimes(1);

    const gap: AdvancedTimingStateV1 = {
      ...ready,
      state: "cluster_gap_running",
      gapStartedAtMs: 10_000,
      gapEndsAtMs: 30_000,
    };
    await rendered.rerender(
      <AppearanceProvider>
        <AdvancedTimingIndicator {...props} context={context(gap)} />
      </AppearanceProvider>,
    );
    expect(rendered.getByLabelText(
      "Cluster timing status. Cluster 2 of 3. Intra-set rest · 00:20",
    )).toBeOnTheScreen();
    await fireEvent.press(rendered.getByRole("button", { name: "Skip intra-set rest" }));
    expect(props.onSkipClusterGap).toHaveBeenCalledTimes(1);
  });

  it("renders paused cluster gap controls with stable accessible targets", async () => {
    const paused: AdvancedTimingStateV1 = {
      version: 1,
      state: "cluster_gap_paused",
      mode: "cluster",
      revision: 4,
      targetSessionSetId: "set-1",
      cueChannels: "haptic",
      groupSizes: [3, 3, 3],
      intraRestMs: 20_000,
      currentGroupIndex: 0,
      remainingMs: 12_000,
    };
    const { props, rendered } = await renderIndicator({ context: context(paused) });

    expect(rendered.getByLabelText(
      "Cluster timing status. Cluster 1 of 3. Paused · Intra-set rest · 00:12",
    )).toBeOnTheScreen();
    expect(rendered.getByRole("button", { name: "Resume intra-set rest" }))
      .toHaveStyle({ minHeight: 48, minWidth: 48 });

    await fireEvent.press(rendered.getByRole("button", { name: "Resume intra-set rest" }));
    await fireEvent.press(rendered.getByRole("button", { name: "Stop cluster timing" }));

    expect(props.onResume).toHaveBeenCalledTimes(1);
    expect(props.onStop).toHaveBeenCalledTimes(1);
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

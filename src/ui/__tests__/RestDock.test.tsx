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
  type AppStateStatus,
} from "react-native";

import type {
  RestStateV1,
} from "../../domains/rest";
import {
  RestDock,
} from "../components/RestDock";
import {
  AppearanceProvider,
} from "../theme";

const running: Extract<RestStateV1, { state: "running" }> = {
  version: 1,
  state: "running",
  revision: 3,
  startedAtMs: 10_000,
  endsAtMs: 100_000,
  nextSetId: "set-2",
};

async function renderDock(
  state: Extract<RestStateV1, { state: "running" | "paused" }>,
  overrides: Partial<React.ComponentProps<typeof RestDock>> = {},
) {
  const props = {
    state,
    nowMs: () => 40_000,
    nextSetIndex: 2,
    nextTarget: "60 kg × 8",
    notificationPermission: "granted" as const,
    onAdjust: jest.fn(),
    onExpired: jest.fn(),
    onOpenSettings: jest.fn(),
    onPause: jest.fn(),
    onResume: jest.fn(),
    onSkip: jest.fn(),
    ...overrides,
  } satisfies React.ComponentProps<typeof RestDock>;
  return {
    props,
    rendered: await render(
      <AppearanceProvider>
        <RestDock {...props} />
      </AppearanceProvider>,
    ),
  };
}

function mockActiveAppState() {
  const descriptor = Object.getOwnPropertyDescriptor(AppState, "currentState");
  Object.defineProperty(AppState, "currentState", {
    configurable: true,
    get: () => "active",
  });
  return () => {
    if (descriptor === undefined) {
      Reflect.deleteProperty(AppState, "currentState");
      return;
    }
    Object.defineProperty(AppState, "currentState", descriptor);
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

let restoreAppState: (() => void) | undefined;
let addEventListener: jest.SpiedFunction<typeof AppState.addEventListener>;

beforeEach(() => {
  restoreAppState = mockActiveAppState();
  addEventListener = jest.spyOn(AppState, "addEventListener")
    .mockImplementation(() => ({ remove: jest.fn() }));
});

afterEach(() => {
  addEventListener.mockRestore();
  restoreAppState?.();
});

describe("Plan 02-29 RestDock", () => {
  it("keeps running time visible when collapsed and expands ordered controls", async () => {
    const { rendered } = await renderDock(running);

    expect(screen.getByText("RESTING · NEXT: SET 2 AT 60 kg × 8"))
      .toBeOnTheScreen();
    expect(screen.getByText("01:00")).toBeOnTheScreen();
    expect(screen.getByText("01:00")).toHaveProp(
      "accessibilityLiveRegion",
      "none",
    );
    expect(screen.getByRole("button", {
      name: "Expand rest controls",
    })).toHaveStyle({ minHeight: 48, minWidth: 48 });
    expect(screen.queryByTestId("rest-controls")).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", {
      name: "Expand rest controls",
    }));

    expect(screen.getByText("01:00")).toBeOnTheScreen();
    expect(screen.getByRole("button", {
      name: "Collapse rest controls",
    })).toHaveStyle({ minHeight: 48, minWidth: 48 });
    const tree = JSON.stringify(rendered.toJSON());
    expect(tree.indexOf("Skip rest")).toBeLessThan(tree.indexOf("Pause rest"));
    expect(tree.indexOf("Pause rest")).toBeLessThan(tree.indexOf("−15"));
    expect(tree.indexOf("−15")).toBeLessThan(tree.indexOf("+15"));
    expect(screen.getByTestId("rest-controls")).toHaveStyle({
      flexDirection: "row",
      flexWrap: "wrap",
    });
    for (const label of [
      "Skip rest",
      "Pause rest",
      "Subtract 15 seconds",
      "Add 15 seconds",
    ]) {
      expect(screen.getByRole("button", { name: label }))
        .toHaveStyle({ minHeight: 48, minWidth: 48 });
      expect(screen.getByTestId(`rest-control-${label}`)).toHaveStyle({
        flexGrow: 1,
      });
    }
    expect(screen.getByRole("button", { name: "Skip rest" }))
      .toHaveProp("focusable", true);
  });

  it("invokes pause, adjust, skip, and resume through explicit controls", async () => {
    const onAdjust = jest.fn();
    const onPause = jest.fn();
    const onResume = jest.fn();
    const onSkip = jest.fn();
    const { rendered } = await renderDock(running, {
      onAdjust,
      onPause,
      onResume,
      onSkip,
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Expand rest controls",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Subtract 15 seconds",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Pause rest" }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Add 15 seconds",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Skip rest" }));
    expect(onAdjust).toHaveBeenNthCalledWith(1, -15_000);
    expect(onAdjust).toHaveBeenNthCalledWith(2, 15_000);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);

    await rendered.rerender(
      <AppearanceProvider>
        <RestDock
          nextSetIndex={2}
          nextTarget="60 kg × 8"
          notificationPermission="granted"
          nowMs={() => 40_000}
          onAdjust={onAdjust}
          onExpired={jest.fn()}
          onOpenSettings={jest.fn()}
          onPause={onPause}
          onResume={onResume}
          onSkip={onSkip}
          state={{
            version: 1,
            state: "paused",
            revision: 4,
            remainingMs: 60_000,
            nextSetId: "set-2",
          }}
        />
      </AppearanceProvider>,
    );
    expect(screen.getByText("REST PAUSED · NEXT: SET 2 AT 60 kg × 8"))
      .toBeOnTheScreen();
    expect(screen.getByText("01:00")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Resume rest" }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("announces meaningful thresholds only and expires from timestamp truth", async () => {
    jest.useFakeTimers();
    try {
      let nowMs = 39_000;
      const onExpired = jest.fn();
      await renderDock(running, {
        nowMs: () => nowMs,
        onExpired,
      });
      expect(screen.getByText("01:01")).toBeOnTheScreen();

      nowMs = 40_000;
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      expect(screen.getByText("1 minute remaining")).toBeOnTheScreen();

      nowMs = 70_000;
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      expect(screen.getByText("30 seconds remaining")).toBeOnTheScreen();

      nowMs = 90_000;
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      expect(screen.getByText("10 seconds remaining")).toBeOnTheScreen();

      nowMs = 100_000;
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      expect(screen.getByText("Rest ended")).toBeOnTheScreen();
      expect(onExpired).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(5_000);
      });
      expect(onExpired).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("plays each countdown cue again for a distinct consecutive rest", async () => {
    jest.useFakeTimers();
    let rendered: Awaited<ReturnType<typeof renderDock>>["rendered"] | undefined;
    try {
      let nowMs = 96_000;
      const countdownCue = {
        playLongCue: jest.fn(async () => undefined),
        playShortCue: jest.fn(async () => undefined),
      };
      ({ rendered } = await renderDock({
        ...running,
        endsAtMs: 100_000,
      }, {
        nowMs: () => nowMs,
        restSoundEnabled: true,
        countdownCue,
      }));

      for (nowMs of [97_000, 98_000, 99_000, 100_000]) {
        await act(async () => {
          jest.advanceTimersByTime(1_000);
        });
      }
      expect(countdownCue.playShortCue).toHaveBeenCalledTimes(3);
      expect(countdownCue.playLongCue).toHaveBeenCalledTimes(1);

      nowMs = 196_000;
      await rendered.rerender(
        <AppearanceProvider>
          <RestDock
            nextSetIndex={3}
            nextTarget="70 kg × 6"
            notificationPermission="granted"
            nowMs={() => nowMs}
            onAdjust={jest.fn()}
            onExpired={jest.fn()}
            onOpenSettings={jest.fn()}
            onPause={jest.fn()}
            onResume={jest.fn()}
            onSkip={jest.fn()}
            restSoundEnabled
            countdownCue={countdownCue}
            state={{
              version: 1,
              state: "running",
              revision: 9,
              startedAtMs: 196_000,
              endsAtMs: 200_000,
              nextSetId: "set-3",
            }}
          />
        </AppearanceProvider>,
      );
      for (nowMs of [197_000, 198_000, 199_000, 200_000]) {
        await act(async () => {
          jest.advanceTimersByTime(1_000);
        });
      }

      expect(countdownCue.playShortCue).toHaveBeenCalledTimes(6);
      expect(countdownCue.playLongCue).toHaveBeenCalledTimes(2);
    } finally {
      rendered?.unmount();
      jest.useRealTimers();
    }
  });

  it("keeps cue history through pause and resume, and does not backfill after foregrounding", async () => {
    jest.useFakeTimers();
    let onAppStateChange: ((nextState: AppStateStatus) => void) | undefined;
    addEventListener.mockImplementation((event, listener) => {
      if (event === "change") {
        onAppStateChange = listener;
      }
      return { remove: jest.fn() };
    });
    let rendered: Awaited<ReturnType<typeof renderDock>>["rendered"] | undefined;
    try {
      let nowMs = 95_000;
      const countdownCue = {
        playLongCue: jest.fn(async () => undefined),
        playShortCue: jest.fn(async () => undefined),
      };
      ({ rendered } = await renderDock({
        ...running,
        endsAtMs: 100_000,
      }, {
        nowMs: () => nowMs,
        restSoundEnabled: true,
        countdownCue,
      }));

      for (nowMs of [96_000, 97_000]) {
        await act(async () => {
          jest.advanceTimersByTime(1_000);
        });
      }
      expect(countdownCue.playShortCue).toHaveBeenCalledTimes(1);

      await rendered.rerender(
        <AppearanceProvider>
          <RestDock
            nextSetIndex={2}
            nextTarget="60 kg × 8"
            notificationPermission="granted"
            nowMs={() => nowMs}
            onAdjust={jest.fn()}
            onExpired={jest.fn()}
            onOpenSettings={jest.fn()}
            onPause={jest.fn()}
            onResume={jest.fn()}
            onSkip={jest.fn()}
            restSoundEnabled
            countdownCue={countdownCue}
            state={{
              version: 1,
              state: "paused",
              revision: 4,
              remainingMs: 4_000,
              nextSetId: "set-2",
            }}
          />
        </AppearanceProvider>,
      );
      nowMs = 120_000;
      await rendered.rerender(
        <AppearanceProvider>
          <RestDock
            nextSetIndex={2}
            nextTarget="60 kg × 8"
            notificationPermission="granted"
            nowMs={() => nowMs}
            onAdjust={jest.fn()}
            onExpired={jest.fn()}
            onOpenSettings={jest.fn()}
            onPause={jest.fn()}
            onResume={jest.fn()}
            onSkip={jest.fn()}
            restSoundEnabled
            countdownCue={countdownCue}
            state={{
              version: 1,
              state: "running",
              revision: 5,
              startedAtMs: 120_000,
              endsAtMs: 124_000,
              nextSetId: "set-2",
            }}
          />
        </AppearanceProvider>,
      );
      nowMs = 121_000;
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      expect(countdownCue.playShortCue).toHaveBeenCalledTimes(1);

      onAppStateChange?.("background");
      nowMs = 123_000;
      await act(async () => {
        jest.advanceTimersByTime(2_000);
      });
      onAppStateChange?.("active");
      nowMs = 122_000;
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });

      expect(countdownCue.playShortCue).toHaveBeenCalledTimes(1);
      expect(countdownCue.playLongCue).toHaveBeenCalledTimes(0);
    } finally {
      rendered?.unmount();
      jest.useRealTimers();
    }
  });

  it("contains a cue playback failure to its rest and clears it for the next rest", async () => {
    jest.useFakeTimers();
    let rendered: Awaited<ReturnType<typeof renderDock>>["rendered"] | undefined;
    try {
      let nowMs = 96_000;
      const countdownCue = {
        playLongCue: jest.fn(async () => undefined),
        playShortCue: jest
          .fn<() => Promise<void>>()
          .mockRejectedValueOnce(new Error("audio unavailable"))
          .mockResolvedValue(undefined),
      };
      ({ rendered } = await renderDock({
        ...running,
        endsAtMs: 100_000,
      }, {
        nowMs: () => nowMs,
        restSoundEnabled: true,
        countdownCue,
      }));

      nowMs = 97_000;
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      expect(screen.getByText("Countdown sound unavailable")).toBeOnTheScreen();

      nowMs = 196_000;
      await rendered.rerender(
        <AppearanceProvider>
          <RestDock
            nextSetIndex={3}
            nextTarget="70 kg × 6"
            notificationPermission="granted"
            nowMs={() => nowMs}
            onAdjust={jest.fn()}
            onExpired={jest.fn()}
            onOpenSettings={jest.fn()}
            onPause={jest.fn()}
            onResume={jest.fn()}
            onSkip={jest.fn()}
            restSoundEnabled
            countdownCue={countdownCue}
            state={{
              version: 1,
              state: "running",
              revision: 9,
              startedAtMs: 196_000,
              endsAtMs: 200_000,
              nextSetId: "set-3",
            }}
          />
        </AppearanceProvider>,
      );
      expect(screen.queryByText("Countdown sound unavailable")).not.toBeOnTheScreen();

      nowMs = 197_000;
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      expect(countdownCue.playShortCue).toHaveBeenCalledTimes(2);
      expect(screen.queryByText("Countdown sound unavailable")).not.toBeOnTheScreen();
    } finally {
      rendered?.unmount();
      jest.useRealTimers();
    }
  });

  it("ignores a pending cue rejection from an earlier rest", async () => {
    jest.useFakeTimers();
    let rendered: Awaited<ReturnType<typeof renderDock>>["rendered"] | undefined;
    try {
      let nowMs = 96_000;
      const firstCue = deferred<void>();
      const countdownCue = {
        playLongCue: jest.fn(async () => undefined),
        playShortCue: jest
          .fn<() => Promise<void>>()
          .mockReturnValueOnce(firstCue.promise)
          .mockResolvedValue(undefined),
      };
      ({ rendered } = await renderDock({
        ...running,
        endsAtMs: 100_000,
      }, {
        nowMs: () => nowMs,
        restSoundEnabled: true,
        countdownCue,
      }));

      nowMs = 97_000;
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      expect(countdownCue.playShortCue).toHaveBeenCalledTimes(1);

      nowMs = 196_000;
      await rendered.rerender(
        <AppearanceProvider>
          <RestDock
            nextSetIndex={3}
            nextTarget="70 kg × 6"
            notificationPermission="granted"
            nowMs={() => nowMs}
            onAdjust={jest.fn()}
            onExpired={jest.fn()}
            onOpenSettings={jest.fn()}
            onPause={jest.fn()}
            onResume={jest.fn()}
            onSkip={jest.fn()}
            restSoundEnabled
            countdownCue={countdownCue}
            state={{
              version: 1,
              state: "running",
              revision: 9,
              startedAtMs: 196_000,
              endsAtMs: 200_000,
              nextSetId: "set-3",
            }}
          />
        </AppearanceProvider>,
      );

      await act(async () => {
        firstCue.reject(new Error("old rest audio unavailable"));
        await Promise.resolve();
      });

      expect(screen.queryByText("Countdown sound unavailable")).not.toBeOnTheScreen();
    } finally {
      rendered?.unmount();
      jest.useRealTimers();
    }
  });

  it("shows denied notification guidance without covering rest controls", async () => {
    const onOpenSettings = jest.fn();
    await renderDock(running, {
      notificationPermission: "denied",
      onOpenSettings,
    });
    await fireEvent.press(screen.getByRole("button", {
      name: "Expand rest controls",
    }));

    expect(screen.getByText("Background rest alerts are off"))
      .toBeOnTheScreen();
    expect(screen.getByText(
      "The in-app timer stays accurate. You can allow notifications from Android settings.",
    )).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Pause rest" }))
      .toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Open notification settings" }),
    );
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("keeps undo after the four rest controls", async () => {
    const onUndo = jest.fn();
    const { rendered } = await renderDock(running, {
      undo: {
        setIndex: 1,
        secondsRemaining: 7,
        onUndo,
      },
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Expand rest controls",
    }));
    expect(screen.getByText("Set 1 saved · Undo set (7 sec)"))
      .toBeOnTheScreen();
    const tree = JSON.stringify(rendered.toJSON());
    expect(tree.indexOf("Skip rest")).toBeLessThan(
      tree.indexOf("Undo completed set"),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Undo completed set" }),
    );
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});

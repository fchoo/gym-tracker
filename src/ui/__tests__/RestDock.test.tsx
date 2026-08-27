import {
  act,
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

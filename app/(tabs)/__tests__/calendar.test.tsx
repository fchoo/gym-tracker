import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react-native";
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

const mockPush = jest.fn();
const mockConfigurePhase16CalendarTestControls = jest.fn();
let mockLocalSearchParams: Readonly<Record<string, string | readonly string[] | undefined>> = {};

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: { package: "com.fchoo.gymtracker.devtest" },
      extra: {
        buildProfile: "development-test",
        nativeContractsEnabled: true,
        nativeContractSuite: "phase16-calendar",
      },
    },
  },
}));

jest.mock("expo-router", () => ({
  router: { push: (...args: readonly unknown[]) => mockPush(...args) },
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => mockLocalSearchParams,
}));

jest.mock("../../../src/bootstrap/phase16CalendarTestControls", () => {
  const actual = jest.requireActual("../../../src/bootstrap/phase16CalendarTestControls") as object;
  return {
    ...actual,
    clearPhase16CalendarTestControls: jest.fn(),
    configurePhase16CalendarTestControls: (...args: readonly unknown[]) => mockConfigurePhase16CalendarTestControls(...args),
  };
});

jest.mock("../../../src/bootstrap/workoutAppRuntime", () => ({
  useCalendarRangeReadPort: () => ({ loadCalendarRange: jest.fn() }),
}));

jest.mock("../../../src/ui/shell/AppRootShell", () => ({
  useRootSettingsController: () => ({ openRootSettings: jest.fn() }),
}));

jest.mock("../../../src/ui/shell/rootFocus", () => ({
  rootSettingsTriggerNativeID: () => "calendar-settings",
  useRootHeadingRef: () => ({ current: null }),
}));

jest.mock("../../../src/ui/screens/CalendarScreen", () => {
  const { Pressable } = require("react-native") as typeof import("react-native");
  return {
    CalendarScreen: ({ diagnostics, onOpenEvent }: Readonly<{
      diagnostics?: Readonly<{
        producer: Readonly<{
          recordQuery(input: Readonly<{ durationMs: number; eventCount: number; planCount: number; importedCount: number }>): void;
          recordInteraction(input: Readonly<{ frameWorkMs: readonly number[]; missedFrames: number; refreshRateHz: number; profilerOverheadMs: number }>): void;
          exportResult(): unknown;
        }>;
        request: Readonly<{ querySamples: number; interactionSamples: number }>;
      }>;
      onOpenEvent(destination: unknown, returnEventId?: string): void;
    }>) => (
      <>
        {diagnostics === undefined ? null : <Pressable
          accessibilityLabel="Complete Calendar diagnostics"
          accessibilityRole="button"
          onPress={() => {
            for (let index = 0; index < diagnostics.request.querySamples; index += 1) {
              diagnostics.producer.recordQuery({ durationMs: 1, eventCount: 1, planCount: 1, importedCount: 0 });
            }
            for (let index = 0; index < diagnostics.request.interactionSamples; index += 1) {
              diagnostics.producer.recordInteraction({ frameWorkMs: [1], missedFrames: 0, refreshRateHz: 60, profilerOverheadMs: 0 });
            }
            diagnostics.producer.exportResult();
          }}
        />}
        <Pressable
          accessibilityLabel="Open completed Strength event"
          accessibilityRole="button"
          onPress={() => onOpenEvent({ kind: "session", sessionId: "session-17" }, "event-session-17")}
        />
        <Pressable
          accessibilityLabel="Open planned Strength event"
          accessibilityRole="button"
          onPress={() => onOpenEvent({ kind: "occurrence", occurrenceId: "occurrence-17" }, "event-occurrence-17")}
        />
        <Pressable
          accessibilityLabel="Open planned Running event"
          accessibilityRole="button"
          onPress={() => onOpenEvent({ kind: "plan", planId: "running-plan-17", sessionId: "revision-17" }, "event-plan-17")}
        />
        <Pressable
          accessibilityLabel="Open imported Running event"
          accessibilityRole="button"
          onPress={() => onOpenEvent({ kind: "activity", activityId: "activity-17" }, "event-activity-17")}
        />
      </>
    ),
  };
});

import CalendarRoute from "../calendar";

describe("CalendarRoute", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockConfigurePhase16CalendarTestControls.mockReset();
    mockLocalSearchParams = {};
  });

  it("reads only a scalar known diagnostic stage from Expo Router", async () => {
    mockLocalSearchParams = { phase16CalendarStage: "drag-forward-25" };
    const rendered = await render(<CalendarRoute />);

    expect(mockConfigurePhase16CalendarTestControls).toHaveBeenLastCalledWith(expect.objectContaining({
      stage: "drag-forward-25",
    }));

    mockLocalSearchParams = { phase16CalendarStage: ["drag-forward-25"] };
    await rendered.rerender(<CalendarRoute />);
    expect(mockConfigurePhase16CalendarTestControls).toHaveBeenLastCalledWith(expect.objectContaining({
      stage: undefined,
    }));

    mockLocalSearchParams = { phase16CalendarStage: "not-a-calendar-stage" };
    await rendered.rerender(<CalendarRoute />);
    expect(mockConfigurePhase16CalendarTestControls).toHaveBeenLastCalledWith(expect.objectContaining({
      stage: undefined,
    }));
  });

  it("hooks scalar diagnostics requests to the gated producer and one-shot export", async () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    mockLocalSearchParams = {
      phase16CalendarDiagnostics: "true",
      querySamples: "100",
      interactionSamples: "100",
    };
    const rendered = await render(<CalendarRoute />);

    await fireEvent.press(screen.getByRole("button", { name: "Complete Calendar diagnostics" }));
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]?.[0]).toMatch(/^GYM_TRACKER_V12_CALENDAR_DIAGNOSTICS_RESULT:/u);

    mockLocalSearchParams = {
      phase16CalendarDiagnostics: ["true"],
      querySamples: "100",
      interactionSamples: "100",
    };
    await rendered.rerender(<CalendarRoute />);
    expect(screen.queryByRole("button", { name: "Complete Calendar diagnostics" })).toBeNull();
    info.mockRestore();
  });

  it("routes a completed Strength event by its durable session identity with Calendar origin", async () => {
    await render(<CalendarRoute />);

    await fireEvent.press(screen.getByRole("button", { name: "Open completed Strength event" }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/session/session-17?origin=calendar&returnEventId=event-session-17");
  });

  it("passes every remaining durable destination to its route boundary without fabricating a workout command", async () => {
    await render(<CalendarRoute />);

    await fireEvent.press(screen.getByRole("button", { name: "Open planned Strength event" }));
    await fireEvent.press(screen.getByRole("button", { name: "Open planned Running event" }));
    await fireEvent.press(screen.getByRole("button", { name: "Open imported Running event" }));

    expect(mockPush).toHaveBeenNthCalledWith(1, "/calendar/plan/occurrence-17?origin=calendar&returnEventId=event-occurrence-17");
    expect(mockPush).toHaveBeenNthCalledWith(2, "/library/running/running-plan-17?origin=calendar&sessionId=revision-17&returnEventId=event-plan-17");
    expect(mockPush).toHaveBeenNthCalledWith(3, {
      pathname: "/garmin/activity/[activityId]",
      params: {
        activityId: "activity-17",
        origin: "calendar",
      },
    });
    expect(mockPush.mock.calls.join(" ")).not.toMatch(/resume|correct|remove|match|workout/u);
  });
});

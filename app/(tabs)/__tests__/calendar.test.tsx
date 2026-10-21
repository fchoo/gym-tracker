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
const mockConfigurePhase20CalendarObservationCollector = jest.fn();
const mockUseCalendarRangeReadPort = jest.fn(() => ({ loadCalendarRange: jest.fn() }));
let mockLocalSearchParams: Readonly<Record<string, string | readonly string[] | undefined>> = {};
let mockBuildProfile = "development-test";
let mockNativeContractsEnabled = true;
let mockNativeContractSuite = "phase16-calendar";
let mockCalendarScreenProps: Readonly<Record<string, unknown>> | null = null;

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: { package: "com.fchoo.gymtracker.devtest" },
      extra: {
        get buildProfile() { return mockBuildProfile; },
        get nativeContractsEnabled() { return mockNativeContractsEnabled; },
        get nativeContractSuite() { return mockNativeContractSuite; },
      },
    },
  },
}));

jest.mock("../../../src/bootstrap/phase20CalendarObservation", () => {
  const actual = jest.requireActual("../../../src/bootstrap/phase20CalendarObservation") as object;
  return {
    ...actual,
    clearPhase20CalendarObservationCollector: jest.fn(),
    configurePhase20CalendarObservationCollector: (...args: readonly unknown[]) => mockConfigurePhase20CalendarObservationCollector(...args),
  };
});

jest.mock("expo-router", () => ({
  Redirect: () => {
    const { View } = require("react-native") as typeof import("react-native");
    return <View testID="calendar-evidence-disabled" />;
  },
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
  useCalendarRangeReadPort: () => mockUseCalendarRangeReadPort(),
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
    CalendarScreen: (props: Readonly<{
      diagnostics?: Readonly<{
        producer: Readonly<{
          recordQuery(input: Readonly<{ durationMs: number; eventCount: number; planCount: number; importedCount: number }>): void;
          recordInteraction(input: Readonly<{ frameWorkMs: readonly number[]; missedFrames: number; refreshRateHz: number; profilerOverheadMs: number }>): void;
          exportResult(): unknown;
        }>;
        request: Readonly<{ querySamples: number; interactionSamples: number }>;
      }>;
      onOpenEvent(destination: unknown, returnEventId?: string): void;
    }>) => {
      mockCalendarScreenProps = props as unknown as Readonly<Record<string, unknown>>;
      const { diagnostics, onOpenEvent } = props;
      return (
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
      );
    },
  };
});

import CalendarRoute from "../calendar";

describe("CalendarRoute", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockConfigurePhase16CalendarTestControls.mockReset();
    mockConfigurePhase20CalendarObservationCollector.mockReset();
    mockUseCalendarRangeReadPort.mockClear();
    mockLocalSearchParams = {};
    mockBuildProfile = "development-test";
    mockNativeContractsEnabled = true;
    mockNativeContractSuite = "phase16-calendar";
    mockCalendarScreenProps = null;
  });

  it("passes exact Phase 20 identity into the real Calendar route without enabling the Phase 16 auto-driver", async () => {
    mockNativeContractSuite = "v1.2-acceptance";
    mockLocalSearchParams = {
      phase16CalendarStage: "drag-forward-25",
      phase20CalendarStage: "leap-february",
      phase20CalendarNonce: "b".repeat(32),
      phase20CalendarFlowSha256: "a".repeat(64),
      phase20CalendarFlowRevision: "calendar-flow-r35-real-v1",
    };

    await render(<CalendarRoute />);

    expect(mockConfigurePhase16CalendarTestControls).toHaveBeenCalledWith(expect.objectContaining({ stage: undefined }));
    expect(mockConfigurePhase20CalendarObservationCollector).toHaveBeenCalledWith(expect.objectContaining({
      request: {
        stage: "leap-february",
        nonce: "b".repeat(32),
        flowSha256: "a".repeat(64),
        flowRevision: "calendar-flow-r35-real-v1",
      },
    }));
    expect(mockCalendarScreenProps).toMatchObject({ initialDate: "2028-02-29" });
    expect(mockCalendarScreenProps).not.toHaveProperty("diagnosticStage");
    const loadCalendarRange = mockCalendarScreenProps?.loadCalendarRange as (input: { startLocalDate: string; endLocalDateExclusive: string }) => Promise<{ events: readonly { id: string }[] }>;
    const isolated = await loadCalendarRange({ startLocalDate: "2026-10-01", endLocalDateExclusive: "2026-11-01" });
    expect(isolated.events.map(({ id }) => id)).toEqual([
      "v12-cal-strength-complete", "v12-cal-strength-partial", "v12-cal-strength-extra", "v12-cal-strength-planned",
      "v12-cal-running-planned", "v12-cal-running-imported",
    ]);
    expect(mockUseCalendarRangeReadPort).not.toHaveBeenCalled();
  });

  it("fails a malformed Phase 20 evidence deep link closed before reading the app runtime", async () => {
    mockNativeContractSuite = "v1.2-acceptance";
    mockLocalSearchParams = {
      phase20CalendarFixture: "v12-calendar-isolated-facts-v1",
      phase20CalendarEvidenceNonce: "short",
      phase20CalendarRequirementsSha256: "a".repeat(64),
    };

    await render(<CalendarRoute />);

    expect(screen.getByTestId("calendar-evidence-disabled")).toBeOnTheScreen();
    expect(mockUseCalendarRangeReadPort).not.toHaveBeenCalled();
  });

  it("fails partial or non-v1.2 Phase 20 route identities closed", async () => {
    mockNativeContractSuite = "v1.2-acceptance";
    mockLocalSearchParams = {
      phase20CalendarStage: "drag-forward-25",
      phase20CalendarNonce: "short",
      phase20CalendarFlowSha256: "a".repeat(64),
      phase20CalendarFlowRevision: "calendar-flow-r35-real-v1",
    };
    const rendered = await render(<CalendarRoute />);
    expect(screen.getByTestId("calendar-evidence-disabled")).toBeOnTheScreen();
    expect(mockConfigurePhase20CalendarObservationCollector).not.toHaveBeenCalled();
    expect(mockUseCalendarRangeReadPort).not.toHaveBeenCalled();

    mockNativeContractSuite = "phase16-calendar";
    mockLocalSearchParams = {
      phase20CalendarStage: "drag-forward-25",
      phase20CalendarNonce: "b".repeat(32),
      phase20CalendarFlowSha256: "a".repeat(64),
      phase20CalendarFlowRevision: "calendar-flow-r35-real-v1",
    };
    await rendered.rerender(<CalendarRoute />);
    expect(screen.getByTestId("calendar-evidence-disabled")).toBeOnTheScreen();
    expect(mockConfigurePhase20CalendarObservationCollector).not.toHaveBeenCalled();
    expect(mockUseCalendarRangeReadPort).not.toHaveBeenCalled();
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
      diagnosticStreamId: "p16diag-route-test-1",
    };
    const rendered = await render(<CalendarRoute />);

    await fireEvent.press(screen.getByRole("button", { name: "Complete Calendar diagnostics" }));
    expect(info.mock.calls.length).toBeGreaterThan(1);
    expect(info.mock.calls.every(([line]) => (
      typeof line === "string"
      && line.startsWith("GYM_TRACKER_V12_CALENDAR_DIAGNOSTICS_CHUNK:")
      && line.length < 2_200
    ))).toBe(true);
    const chunks = info.mock.calls.map(([line]) => JSON.parse(
      (line as string).slice("GYM_TRACKER_V12_CALENDAR_DIAGNOSTICS_CHUNK:".length),
    ) as { stream_id: string; sequence: number; total: number; payload: string });
    expect(chunks.map(({ sequence }) => sequence)).toEqual(
      Array.from({ length: chunks.length }, (_, index) => index + 1),
    );
    expect(chunks.every(({ total }) => total === chunks.length)).toBe(true);
    expect(chunks.every(({ stream_id }) => stream_id === "p16diag-route-test-1")).toBe(true);
    expect(JSON.parse(chunks.map(({ payload }) => payload).join(""))).toEqual(expect.objectContaining({
      producer: "v12-calendar-native-diagnostics/v1",
      native_execution: "EXECUTED",
    }));

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

  it("forwards the exact Phase 20 fixture identity to the Garmin activity route", async () => {
    mockNativeContractSuite = "v1.2-acceptance";
    mockLocalSearchParams = {
      phase20CalendarFixture: "v12-calendar-isolated-facts-v1",
      phase20CalendarEvidenceNonce: "b".repeat(32),
      phase20CalendarRequirementsSha256: "a".repeat(64),
    };
    await render(<CalendarRoute />);

    await fireEvent.press(screen.getByRole("button", { name: "Open imported Running event" }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/garmin/activity/[activityId]",
      params: {
        activityId: "activity-17",
        origin: "calendar",
        phase20CalendarFixture: "v12-calendar-isolated-facts-v1",
        phase20CalendarEvidenceNonce: "b".repeat(32),
        phase20CalendarRequirementsSha256: "a".repeat(64),
      },
    });
  });
});

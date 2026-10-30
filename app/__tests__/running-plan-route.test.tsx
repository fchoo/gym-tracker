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
import { StyleSheet } from "react-native";

import { AppearanceProvider } from "../../src/ui/theme";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseRunningPlanRuntime = jest.fn(() => ({
  commitScheduleCollisionChoice: jest.fn(),
  confirmLifecycle: jest.fn(),
  createId: (kind: string) => `${kind}:request`,
  loadPlan: jest.fn(),
  previewLifecycle: jest.fn(),
  previewScheduleCollision: jest.fn(),
  previewScheduleCollisionForPlan: jest.fn(),
}));
let mockParams: Readonly<{ planId?: string | readonly string[]; origin?: string | readonly string[]; sessionId?: string | readonly string[] }> = {
  planId: "running-plan:tempo-01",
};
let mockScreenProps: Readonly<Record<string, unknown>> = {};

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: {
    back: (...args: readonly unknown[]) => mockBack(...args),
    push: (...args: readonly unknown[]) => mockPush(...args),
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("../../src/bootstrap/runningPlanRuntime", () => ({
  useCalendarRunningPlanReadPort: () => ({ loadPlan: jest.fn() }),
  useRunningPlanRuntime: () => mockUseRunningPlanRuntime(),
}));

jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    createPhase17ActionRequestId: async (
      _label: string,
      productionRequestId: string,
    ) => productionRequestId,
  }),
}));

jest.mock("../../src/ui/screens/RunningPlanDetailScreen", () => ({
  RunningPlanDetailScreen: (props: Readonly<Record<string, unknown>>) => {
    const ReactModule = require("react") as typeof import("react");
    const {
      Pressable: MockPressable,
      Text: MockText,
      View: MockView,
    } = require("react-native") as typeof import("react-native");
    mockScreenProps = props;
    return ReactModule.createElement(
      MockView,
      null,
      ReactModule.createElement(
        MockPressable,
        {
          accessibilityLabel: "Sync Garmin from Running plan",
          accessibilityRole: "button",
          onPress: props.onGarmin as () => void,
        },
        ReactModule.createElement(MockText, null, "Sync Garmin"),
      ),
      ReactModule.createElement(
        MockPressable,
        {
          accessibilityLabel: "Back to Library plan",
          accessibilityRole: "button",
          onPress: props.onBack as () => void,
        },
        ReactModule.createElement(MockText, null, "Back"),
      ),
    );
  },
}));

import RunningPlanDetailRoute from "../library/running/[planId]";

describe("Running plan contextual Garmin route", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockPush.mockReset();
    mockUseRunningPlanRuntime.mockClear();
    mockScreenProps = {};
    mockParams = { planId: "running-plan:tempo-01" };
  });

  it("pushes the shared Garmin root once with only origin library", async () => {
    await render(<RunningPlanDetailRoute />);

    expect(mockScreenProps.planId).toBe("running-plan:tempo-01");
    await fireEvent.press(screen.getByRole("button", {
      name: "Sync Garmin from Running plan",
    }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/garmin",
      params: { origin: "library" },
    });
    expect(mockScreenProps.planId).toBe("running-plan:tempo-01");
  });

  it("keeps Back stack-based so the retained plan owns scroll and focus", async () => {
    await render(<RunningPlanDetailRoute />);

    await fireEvent.press(screen.getByRole("button", {
      name: "Back to Library plan",
    }));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("keeps an invalid Calendar session on the exact Calendar missing-state contract", async () => {
    mockParams = { origin: "calendar", planId: "running-plan:tempo-01" };
    await render(<AppearanceProvider><RunningPlanDetailRoute /></AppearanceProvider>);

    expect(StyleSheet.flatten(screen.getByText("Running plan").props.style)).toMatchObject({ fontFamily: "ArchivoVariable", fontSize: 22, fontWeight: "800" });
    expect(StyleSheet.flatten(screen.getByText("Running plan not found").props.style)).toMatchObject({ fontFamily: "ArchivoVariable", fontSize: 22, fontWeight: "800" });
    const headerBackActions = screen.getAllByRole("button", { name: "Back to Calendar agenda" });
    const missingStateActions = screen.getAllByRole("button", { name: "Back to Calendar" });
    expect(headerBackActions).toHaveLength(1);
    expect(headerBackActions[0]).toHaveProp("hasTVPreferredFocus", true);
    expect(missingStateActions).toHaveLength(1);
    await fireEvent.press(missingStateActions[0]!);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockUseRunningPlanRuntime).not.toHaveBeenCalled();
  });

  it.each(["unknown", ["calendar"]] as const)(
    "fails closed for untrusted origin %p without acquiring management authority",
    async (origin) => {
      mockParams = { planId: "running-plan:tempo-01", origin };
      await render(<AppearanceProvider><RunningPlanDetailRoute /></AppearanceProvider>);
      expect(screen.getByText("Running plan not found")).toBeOnTheScreen();
      expect(mockUseRunningPlanRuntime).not.toHaveBeenCalled();
    },
  );
});

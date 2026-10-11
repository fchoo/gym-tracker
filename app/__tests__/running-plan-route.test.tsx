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

const mockBack = jest.fn();
const mockPush = jest.fn();
let mockScreenProps: Readonly<Record<string, unknown>> = {};

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: {
    back: (...args: readonly unknown[]) => mockBack(...args),
    push: (...args: readonly unknown[]) => mockPush(...args),
  },
  useLocalSearchParams: () => ({ planId: "running-plan:tempo-01" }),
}));

jest.mock("../../src/bootstrap/runningPlanRuntime", () => ({
  useRunningPlanRuntime: () => ({
    commitScheduleCollisionChoice: jest.fn(),
    confirmLifecycle: jest.fn(),
    createId: (kind: string) => `${kind}:request`,
    loadPlan: jest.fn(),
    previewLifecycle: jest.fn(),
    previewScheduleCollision: jest.fn(),
    previewScheduleCollisionForPlan: jest.fn(),
  }),
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
    mockScreenProps = {};
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
});

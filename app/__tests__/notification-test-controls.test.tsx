import {
  act,
  render,
  waitFor,
} from "@testing-library/react-native";
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

let mockLaunchState: "booting" | "trusted" = "booting";
let mockNativeContractsEnabled = true;
let mockParameters: { action?: string | string[] } = {};
const mockExerciseNotificationExpiry = jest.fn(async () =>
  "foreground_expiry_attempted_once" as const
);
const mockApplyNotificationControl = jest.fn(async () => ({
  action: "inspect" as const,
  code: "scheduled_rest_count" as const,
  heading: "Scheduled rest alerts inspected",
  body: "Scheduled rest alerts · 0",
  scheduledRestCount: 0,
}));
const mockApplyWorkoutMutationControl = jest.fn((action: string) => {
  const copy = action === "arm_copy_warmup_failure"
    ? {
        heading: "Copy warm-up failure armed",
        body: "The next Copy warm-up attempt will fail once.",
      }
    : {
        heading: "Add warm-up failure armed",
        body: "The next Add warm-up attempt will fail once.",
      };
  return {
    action,
    code: "workout_failure_armed" as const,
    ...copy,
  };
});

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        get nativeContractsEnabled() {
          return mockNativeContractsEnabled;
        },
      },
    },
  },
}));

jest.mock("expo-router", () => ({
  Redirect: () => {
    const { View } = require("react-native") as typeof import("react-native");
    return <View testID="notification-control-redirect" />;
  },
  router: { replace: jest.fn() },
  useLocalSearchParams: () => mockParameters,
}));

jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    launchState: mockLaunchState,
    exerciseNotificationExpiry: mockExerciseNotificationExpiry,
  }),
}));

jest.mock("../../src/bootstrap/phase1NotificationTestControls", () => ({
  applyPhase1NotificationTestControl: (...args: unknown[]) =>
    mockApplyNotificationControl(...args as []),
}));

jest.mock("../../src/bootstrap/workoutMutationTestControls", () => ({
  applyWorkoutMutationTestControl: (...args: unknown[]) =>
    mockApplyWorkoutMutationControl(...args as [string]),
  isWorkoutMutationTestAction: (action: string) =>
    action.startsWith("arm_") || action === "reset_workout_failures",
}));

jest.mock("../../src/ui/layout/AdaptiveScreen", () => {
  const { View } = require("react-native") as typeof import("react-native");
  return {
    AdaptiveScreen: ({ primary }: { primary: React.ReactNode }) => (
      <View>{primary}</View>
    ),
  };
});

jest.mock("../../src/ui/components", () => {
  const { Pressable, Text, View } = require("react-native") as typeof import("react-native");
  return {
    EmptyState: ({ body, heading }: { body: string; heading: string }) => (
      <View><Text>{heading}</Text><Text>{body}</Text></View>
    ),
    PrimaryAction: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
    ScreenHeader: ({ title }: { title: string }) => <Text>{title}</Text>,
    SecondaryAction: ({
      disabled,
      label,
      onPress,
      testID,
    }: {
      disabled?: boolean;
      label: string;
      onPress: () => void;
      testID?: string;
    }) => (
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        testID={testID}
      >
        <Text>{label}</Text>
      </Pressable>
    ),
    SkeletonBlock: () => <View testID="notification-control-loading" />,
  };
});

import NotificationTestControlsRoute from "../__notification-test-controls";

describe("NotificationTestControlsRoute", () => {
  beforeEach(() => {
    mockLaunchState = "booting";
    mockNativeContractsEnabled = true;
    mockParameters = {};
    mockExerciseNotificationExpiry.mockClear();
    mockApplyNotificationControl.mockClear();
    mockApplyWorkoutMutationControl.mockClear();
  });

  it("waits for trusted runtime state before injecting the expiry bridge", async () => {
    const rendered = await render(<NotificationTestControlsRoute />);

    expect(rendered.getAllByTestId("notification-control-loading"))
      .toHaveLength(2);
    expect(mockApplyNotificationControl).not.toHaveBeenCalled();

    mockLaunchState = "trusted";
    await act(async () => {
      await rendered.rerender(<NotificationTestControlsRoute />);
    });

    await waitFor(() => {
      expect(mockApplyNotificationControl).toHaveBeenCalledWith(
        "inspect",
        { exerciseExpiry: mockExerciseNotificationExpiry },
      );
    });
  });

  it("arms a bounded workout failure from the exact deep-link action", async () => {
    mockLaunchState = "trusted";
    mockParameters = { action: "arm_add_warmup_failure" };
    const rendered = await render(<NotificationTestControlsRoute />);

    await waitFor(() => {
      expect(mockApplyWorkoutMutationControl).toHaveBeenCalledWith(
        "arm_add_warmup_failure",
      );
    });
    expect(mockApplyNotificationControl).not.toHaveBeenCalled();
    expect(rendered.getByText("Add warm-up failure armed"))
      .toBeOnTheScreen();
    expect(rendered.getByText(
      "The next Add warm-up attempt will fail once.",
    )).toBeOnTheScreen();
    for (const action of [
      "arm_add_warmup_failure",
      "arm_copy_warmup_failure",
      "arm_add_working_failure",
      "arm_completed_set_correction_failure",
      "reset_workout_failures",
    ]) {
      expect(rendered.getByTestId(`notification-test-${action}`))
        .toBeOnTheScreen();
    }
  });

  it("redirects without applying a control in production", async () => {
    mockLaunchState = "trusted";
    mockNativeContractsEnabled = false;
    mockParameters = { action: "arm_add_working_failure" };
    const rendered = await render(<NotificationTestControlsRoute />);

    expect(rendered.getByTestId("notification-control-redirect"))
      .toBeOnTheScreen();
    expect(mockApplyWorkoutMutationControl).not.toHaveBeenCalled();
    expect(mockApplyNotificationControl).not.toHaveBeenCalled();
  });

  it("applies each changed deep-link action once while the route stays mounted", async () => {
    mockLaunchState = "trusted";
    mockParameters = { action: "arm_add_warmup_failure" };
    const rendered = await render(<NotificationTestControlsRoute />);

    await waitFor(() => {
      expect(rendered.getByText("Add warm-up failure armed"))
        .toBeOnTheScreen();
    });
    mockParameters = { action: "arm_copy_warmup_failure" };
    await act(async () => {
      await rendered.rerender(<NotificationTestControlsRoute />);
    });

    await waitFor(() => {
      expect(rendered.getByText("Copy warm-up failure armed"))
        .toBeOnTheScreen();
    });
    expect(mockApplyWorkoutMutationControl.mock.calls).toEqual([
      ["arm_add_warmup_failure"],
      ["arm_copy_warmup_failure"],
    ]);

    await act(async () => {
      await rendered.rerender(<NotificationTestControlsRoute />);
    });
    expect(mockApplyWorkoutMutationControl).toHaveBeenCalledTimes(2);
  });
});

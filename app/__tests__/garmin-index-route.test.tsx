import {
  act,
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
const mockUseGarminImportRuntime = jest.fn();
let mockParams: Readonly<{ origin?: string | readonly string[] }> = {};
let mockFocusEffect: (() => void | (() => void)) | undefined;
let mockScreenProps: Readonly<Record<string, unknown>> = {};

jest.mock("expo-router", () => ({
  router: {
    back: (...args: readonly unknown[]) => mockBack(...args),
    push: (...args: readonly unknown[]) => mockPush(...args),
  },
  useFocusEffect: (effect: () => void | (() => void)) => {
    mockFocusEffect = effect;
    effect();
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    garminImport: {
      confirmGarminImport: jest.fn(),
      loadGarminActivities: jest.fn(),
    },
  }),
}));

jest.mock("../../src/bootstrap/garminImportRuntime", () => ({
  parseGarminRootOrigin: (value: unknown) =>
    value === "calendar" || value === "library" || value === "progress"
      ? value
      : "workout",
  useGarminImportRuntime: (...args: readonly unknown[]) => mockUseGarminImportRuntime(...args),
}));

jest.mock("../../src/ui/screens/GarminSyncScreen", () => ({
  GarminSyncScreen: (props: Readonly<Record<string, unknown>>) => {
    const ReactModule = require("react") as typeof import("react");
    const {
      Pressable: MockPressable,
      Text: MockText,
      View: MockView,
    } = require("react-native") as typeof import("react-native");
    const mockOpenActivity = props.onOpenActivity as jest.Mock;
    const mockRequestBack = props.onBack as jest.Mock;
    mockScreenProps = props;
    return ReactModule.createElement(
      MockView,
      { onScroll: props.onScroll as never, testID: "garmin-root-screen" },
      ReactModule.createElement(
        MockPressable,
        {
          accessibilityRole: "button",
          onPress: () => mockOpenActivity("activity-local-01"),
        },
        ReactModule.createElement(MockText, null, "Open retained activity"),
      ),
      ReactModule.createElement(
        MockPressable,
        {
          accessibilityRole: "button",
          onPress: () => mockRequestBack(),
        },
        ReactModule.createElement(MockText, null, "Back"),
      ),
    );
  },
}));

import GarminRootRoute, { createGarminRootHref } from "../garmin/index";

describe("Garmin root route", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockPush.mockReset();
    mockUseGarminImportRuntime.mockReset();
    mockUseGarminImportRuntime.mockReturnValue({
      source: {},
      coordinator: {},
      loadActivities: jest.fn(),
    });
    mockParams = { origin: "calendar" };
    mockFocusEffect = undefined;
    mockScreenProps = {};
  });

  it.each(["workout", "calendar", "library", "progress"] as const)(
    "keeps the approved %s origin and no arbitrary return href",
    (origin) => {
      expect(createGarminRootHref(origin)).toEqual({
        pathname: "/garmin",
        params: { origin },
      });
    },
  );

  it.each([
    undefined,
    "garmin",
    "settings",
    "https://arbitrary.example/return",
    ["calendar"],
  ])("defaults invalid origin %p to Workout", (origin) => {
    expect(createGarminRootHref(origin)).toEqual({
      pathname: "/garmin",
      params: { origin: "workout" },
    });
  });

  it("opens detail with only the opaque local ID and restores selection/scroll on focus return", async () => {
    await render(<GarminRootRoute />);
    expect(Object.keys(mockScreenProps)).toContain("contextOrigin");
    expect(mockScreenProps.contextOrigin).toBe("calendar");

    fireEvent(screen.getByTestId("garmin-root-screen"), "scroll", {
      nativeEvent: { contentOffset: { y: 144 } },
    });
    await fireEvent.press(screen.getByRole("button", { name: "Open retained activity" }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/garmin/activity/[activityId]",
      params: { activityId: "activity-local-01" },
    });
    expect(mockFocusEffect).toBeDefined();
    await act(async () => {
      mockFocusEffect?.();
    });
    expect(mockScreenProps.returnFocusActivityId).toBe("activity-local-01");
    expect(mockScreenProps.returnFocusVersion).toBe(1);
    expect(mockScreenProps.scrollOffset).toBe(144);
  });

  it("uses stack Back and never accepts a fifth-root destination", async () => {
    mockParams = { origin: "garmin" };
    await render(<GarminRootRoute />);
    expect(mockScreenProps.contextOrigin).toBe("workout");

    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

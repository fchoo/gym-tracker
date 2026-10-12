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
import {
  AppearanceProvider,
} from "../../../src/ui/theme";

const mockBack = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, unknown> = {};
let mockScreenProps: Record<string, unknown> | null = null;

jest.mock("expo-router", () => ({
  router: {
    back: (...args: readonly unknown[]) => mockBack(...args),
    push: (...args: readonly unknown[]) => mockPush(...args),
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("../../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    loadExerciseMetricHistory: jest.fn(),
  }),
}));

jest.mock("../../../src/ui/screens/ExerciseHistoryScreen", () => ({
  ExerciseHistoryScreen: (props: Record<string, unknown>) => {
    const ReactRuntime = require("react") as typeof import("react");
    const {
      Pressable: MockPressable,
      Text: MockText,
      View: MockView,
    } = require("react-native") as typeof import("react-native");
    mockScreenProps = props;
    return ReactRuntime.createElement(MockView, null,
      ReactRuntime.createElement(MockText, null, "Mock exercise history"),
      ReactRuntime.createElement(MockPressable, {
        accessibilityLabel: "Route back",
        accessibilityRole: "button",
        onPress: props.onBack as () => void,
      }, ReactRuntime.createElement(MockText, null, "Back")),
      ReactRuntime.createElement(MockPressable, {
        accessibilityLabel: "Route open source",
        accessibilityRole: "button",
        onPress: () => {
          const openSource = props.onOpenSource;
          if (typeof openSource === "function") openSource("session:source-1", 4);
        },
      }, ReactRuntime.createElement(MockText, null, "Source")),
    );
  },
}));

import ExerciseHistoryRoute from "../[exerciseId]";

describe("ExerciseHistoryRoute", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockPush.mockReset();
    mockScreenProps = null;
    mockParams = {};
  });

  it("preserves stack Back and opens only the exact opaque workout source", async () => {
    mockParams = {
      exerciseId: "bench-press",
      exerciseName: "Bench press",
      origin: "progress",
      returnToken: "progress:Strength:all:bench",
    };
    await render(<AppearanceProvider><ExerciseHistoryRoute /></AppearanceProvider>);

    expect(mockScreenProps).toEqual(expect.objectContaining({
      exerciseId: "bench-press",
      exerciseName: "Bench press",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Route back" }));
    expect(mockBack).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole("button", { name: "Route open source" }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/session/[sessionId]",
      params: {
        origin: "progress",
        sessionId: "session:source-1",
        sourceRevision: "4",
      },
    });
  });

  it("rejects array identities and arbitrary route payloads instead of trusting them", async () => {
    mockParams = {
      exerciseId: ["bench-press", "other"],
      exerciseName: "https://untrusted.example/source",
      origin: "https://untrusted.example",
      returnToken: "https://untrusted.example/replace",
    };
    await render(<AppearanceProvider><ExerciseHistoryRoute /></AppearanceProvider>);

    expect(mockScreenProps).toBeNull();
    expect(screen.getByRole("header", { name: "Exercise history unavailable" }))
      .toBeOnTheScreen();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("uses a neutral fallback for an untrusted display name", async () => {
    mockParams = {
      exerciseId: "bench-press",
      exerciseName: "/session/spoofed",
      origin: "progress",
    };
    await render(<AppearanceProvider><ExerciseHistoryRoute /></AppearanceProvider>);

    expect(mockScreenProps).toEqual(expect.objectContaining({
      exerciseId: "bench-press",
      exerciseName: "Exercise",
    }));
  });
});

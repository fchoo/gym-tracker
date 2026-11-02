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

let focusCallback: (() => void) | null = null;
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: (...args: readonly unknown[]) => mockPush(...args) },
  useFocusEffect: (callback: () => void) => {
    focusCallback = callback;
  },
}));

jest.mock("../../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    loadLibrary: jest.fn(),
    listLibraryRecentExercises: jest.fn(),
    searchLibraryExercises: jest.fn(),
    setLibraryExerciseFavorite: jest.fn(),
    setLibrarySection: jest.fn(),
  }),
}));

jest.mock("../../../src/ui/screens/LibraryScreen", () => {
  const { Text, Pressable } = require("react-native") as typeof import("react-native");
  return {
    LibraryScreen: ({
      onCreatePlan,
      onOpenPlan,
      refreshGeneration,
    }: Readonly<{
      onCreatePlan(): void;
      onOpenPlan(planId: string): void;
      refreshGeneration?: number;
    }>) => (
      <>
        <Text testID="library-refresh-generation">
          {refreshGeneration ?? -1}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Create plan" onPress={onCreatePlan} />
        <Pressable accessibilityRole="button" accessibilityLabel="Open Strength plan" onPress={() => onOpenPlan("owned-strength-1")} />
      </>
    ),
  };
});

import LibraryRoute from "../library";

describe("LibraryRoute focus lifecycle", () => {
  beforeEach(() => {
    focusCallback = null;
    mockPush.mockReset();
  });

  it("advances the Library refresh generation after returning to the tab", async () => {
    await render(<LibraryRoute />);
    expect(screen.getByTestId("library-refresh-generation"))
      .toHaveTextContent("0");

    await act(() => {
      focusCallback?.();
    });
    expect(screen.getByTestId("library-refresh-generation"))
      .toHaveTextContent("0");

    await act(() => {
      focusCallback?.();
    });
    expect(screen.getByTestId("library-refresh-generation"))
      .toHaveTextContent("1");
  });

  it("routes every Library Create plan affordance to the neutral chooser", async () => {
    await render(<LibraryRoute />);

    await fireEvent.press(screen.getByRole("button", { name: "Create plan" }));

    expect(mockPush).toHaveBeenCalledWith("/library/plan/create");
  });

  it("opens an owned Strength row at its source-backed summary", async () => {
    await render(<LibraryRoute />);

    await fireEvent.press(screen.getByRole("button", { name: "Open Strength plan" }));

    expect(mockPush).toHaveBeenCalledWith("/library/plan/owned-strength-1");
  });
});

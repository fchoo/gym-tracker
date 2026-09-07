import {
  act,
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
  const { Text } = require("react-native") as typeof import("react-native");
  return {
    LibraryScreen: ({
      refreshGeneration,
    }: Readonly<{ refreshGeneration?: number }>) => (
      <Text testID="library-refresh-generation">
        {refreshGeneration ?? -1}
      </Text>
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
});

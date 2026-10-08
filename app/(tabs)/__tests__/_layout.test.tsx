import {
  act,
  fireEvent,
  render,
} from "@testing-library/react-native";
import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
} from "@jest/globals";
import React from "react";
import { Dimensions } from "react-native";

import { AppearanceProvider, sizes } from "../../../src/ui/theme";
import RootTabsLayout from "../_layout";

let mockRenderedWidth = 839;
let mockFontScale = 1;
const mockNavigate = jest.fn();
let mockSelectedRouteIndex = 0;

jest.mock("../../../src/ui/layout/AdaptiveScreen", () => ({
  classifyWidth: () =>
    (mockRenderedWidth < 840 ? "medium" : "expanded"),
}));

jest.mock("expo-router", () => {
  const NativeReact = require("react");
  const { View } = require("react-native");

  function Tabs({
    children,
    screenOptions,
    tabBar,
  }: {
    children: React.ReactNode;
    screenOptions: {
      sceneStyle?: unknown;
      tabBarPosition?: "bottom" | "left";
    };
    tabBar: (props: {
      navigation: {
        emit: () => { defaultPrevented: boolean };
        navigate: () => void;
      };
      state: {
        index: number;
        routes: readonly { key: string; name: string }[];
      };
    }) => React.ReactNode;
  }) {
    return NativeReact.createElement(
      View,
      {
        sceneStyle: screenOptions.sceneStyle,
        style: {
          flex: 1,
          flexDirection: screenOptions.tabBarPosition === "left"
            ? "row"
            : "column",
        },
        tabBarPosition: screenOptions.tabBarPosition,
        testID: "root-tabs",
      },
      tabBar({
        navigation: {
          emit: () => ({ defaultPrevented: false }),
          navigate: mockNavigate,
        },
        state: {
          index: mockSelectedRouteIndex,
          routes: [
            { key: "today", name: "index" },
            { key: "calendar", name: "calendar" },
            { key: "library", name: "library" },
            { key: "progress", name: "progress" },
          ],
        },
      }),
      NativeReact.createElement(View, {
        style: { flex: 1, height: "100%", width: "100%" },
        testID: "root-tab-scene",
      }),
      children,
    );
  }

  Tabs.Screen = () => null;

  return { Tabs };
});

jest.mock("../../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({ launchState: "trusted" }),
}));

describe("RootTabsLayout adaptive navigator placement", () => {
  const destinationLabels = [
    "Workout",
    "Calendar",
    "Library",
    "Progress",
  ] as const;

  function setRenderedDimensions(width: number, fontScale = mockFontScale) {
    mockRenderedWidth = width;
    mockFontScale = fontScale;
    Dimensions.set({
      screen: { fontScale, height: 900, scale: 1, width },
      window: { fontScale, height: 900, scale: 1, width },
    });
  }

  function setRenderedWidth(width: number) {
    setRenderedDimensions(width);
  }

  beforeEach(() => {
    mockNavigate.mockReset();
    mockSelectedRouteIndex = 0;
    setRenderedDimensions(839, 1);
  });

  it.each([
    ["bottom", 360, 720, "compact"],
    ["bottom", 600, 900, "medium"],
    ["bottom", 839, 900, "medium boundary"],
    ["bottom", 840, 900, "expanded boundary"],
    ["bottom", 1024, 900, "expanded portrait"],
    ["bottom", 1280, 720, "expanded landscape"],
  ])(
    "uses %s navigator placement for %s at %idp",
    async (tabBarPosition, width, _height, _layout) => {
      setRenderedWidth(width);

      const rendered = await render(
        <AppearanceProvider>
          <RootTabsLayout />
        </AppearanceProvider>,
      );

      expect(rendered.getByTestId("root-tabs")).toHaveProp(
        "tabBarPosition",
        tabBarPosition,
      );
      expect(rendered.getByTestId("root-navigation-bottom"))
        .toHaveProp("accessibilityLabel", "Root navigation bottom");
      expect(rendered.queryByTestId("root-navigation-rail"))
        .not.toBeOnTheScreen();
      expect(rendered.getAllByRole("tab")).toHaveLength(
        destinationLabels.length,
      );
      expect(
        rendered.getAllByRole("tab").map((tab) => tab.props.accessibilityLabel),
      ).toEqual(destinationLabels);
      expect(rendered.getByRole("tab", { name: "Workout" })).toBeSelected();
      expect(rendered.getByTestId("root-tab-scene")).toHaveStyle({
        flex: 1,
        height: "100%",
        width: "100%",
      });
      await rendered.unmount();
    },
  );

  it("keeps one bottom row with full labels at 200% text", async () => {
    setRenderedDimensions(360, 2);
    const rendered = await render(
      <AppearanceProvider>
        <RootTabsLayout />
      </AppearanceProvider>,
    );

    const navigation = rendered.getByTestId("root-navigation-bottom");
    expect(navigation).toHaveProp(
      "accessibilityLabel",
      "Root navigation bottom",
    );
    expect(navigation).toHaveStyle({
      flexDirection: "row",
      flexWrap: undefined,
    });
    expect(
      rendered.getAllByRole("tab").map((tab) => tab.props.accessibilityLabel),
    ).toEqual(destinationLabels);
    for (const label of destinationLabels) {
      expect(rendered.getByRole("tab", { name: label })).toHaveStyle({
        minHeight: 64,
        minWidth: 48,
      });
    }

    expect(rendered.queryByTestId("root-navigation-rail")).not.toBeOnTheScreen();
  });

  it("keeps one accessible route state through live resize and D-pad activation", async () => {
    const rendered = await render(
      <AppearanceProvider>
        <RootTabsLayout />
      </AppearanceProvider>,
    );

    const library = rendered.getByRole("tab", { name: "Library" });
    await fireEvent(library, "focus");
    expect(library).toHaveStyle({ outlineWidth: sizes.focusRing });
    await fireEvent(library, "keyDown", {
      nativeEvent: { key: "Enter" },
    });
    expect(mockNavigate).toHaveBeenCalledWith("library");

    await act(async () => {
      mockSelectedRouteIndex = 2;
      setRenderedWidth(840);
      rendered.rerender(
        <AppearanceProvider>
          <RootTabsLayout />
        </AppearanceProvider>,
      );
    });

    expect(rendered.getByTestId("root-tabs")).toHaveProp(
      "tabBarPosition",
      "bottom",
    );
    expect(rendered.getByTestId("root-navigation-bottom"))
      .toHaveProp("accessibilityLabel", "Root navigation bottom");
    expect(rendered.queryByTestId("root-navigation-rail"))
      .not.toBeOnTheScreen();
    expect(rendered.getAllByRole("tab")).toHaveLength(
      destinationLabels.length,
    );
    expect(rendered.getByRole("tab", { name: "Library" })).toBeSelected();
    expect(rendered.getByRole("tab", { name: "Library" })).toHaveStyle({
      minHeight: 64,
      minWidth: 48,
      outlineWidth: sizes.focusRing,
    });
    expect(rendered.getByText("Library").props.numberOfLines).toBeUndefined();
    expect(rendered.getByTestId("root-tabs")).toHaveStyle({
      flex: 1,
      flexDirection: "column",
    });

    await act(async () => {
      setRenderedWidth(839);
    });

    expect(rendered.getByTestId("root-tabs")).toHaveProp(
      "tabBarPosition",
      "bottom",
    );
    expect(rendered.getByTestId("root-navigation-bottom"))
      .toHaveProp("accessibilityLabel", "Root navigation bottom");
    expect(rendered.queryByTestId("root-navigation-rail"))
      .not.toBeOnTheScreen();
    expect(rendered.getAllByRole("tab")).toHaveLength(
      destinationLabels.length,
    );
    expect(rendered.getByRole("tab", { name: "Library" })).toBeSelected();
  });
});

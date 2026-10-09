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
let mockPathname = "/";
const mockNavigate = jest.fn();
const mockPush = jest.fn();
let mockSelectedRouteIndex = 0;
const mockReadRestAlertPreferences = jest.fn(async () => ({
  soundEnabled: true,
  vibrationEnabled: true,
}));
const mockSetRestAlertPreferences = jest.fn(async (preferences: {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}) => ({
  preferences,
}));
const mockOpenRestNotificationSettings = jest.fn();
const mockRuntime = {
  launchState: "trusted" as const,
  notificationPermission: "granted" as const,
  openRestNotificationSettings: mockOpenRestNotificationSettings,
  readRestAlertPreferences: mockReadRestAlertPreferences,
  setRestAlertPreferences: mockSetRestAlertPreferences,
  workoutRefreshGeneration: 0,
};
const mockHeadingFocus = {
  calendar: jest.fn(),
  index: jest.fn(),
  library: jest.fn(),
  progress: jest.fn(),
};
const mockSettingsTriggerFocus = {
  calendar: jest.fn(),
  index: jest.fn(),
  library: jest.fn(),
  progress: jest.fn(),
};
const mockRemovedSessionsTriggerFocus = jest.fn();

jest.mock("../index", () => {
  const React = require("react") as typeof import("react");
  const {
    Pressable,
    View,
  } = require("react-native") as typeof import("react-native");
  const { useRootSettingsController } = require("../../../src/ui/shell/AppRootShell") as typeof import("../../../src/ui/shell/AppRootShell");
  const { useRootHeadingRef } = require("../../../src/ui/shell/rootFocus") as typeof import("../../../src/ui/shell/rootFocus");
  return {
    __esModule: true,
    default: () => {
      const headingRef = useRootHeadingRef("index");
      const settingsTriggerRef = React.useRef<{ focus?: () => void } | null>(null);
      const { openRootSettings } = useRootSettingsController();
      React.useEffect(() => {
        if (headingRef !== undefined) {
          headingRef.current = { focus: mockHeadingFocus.index };
        }
        settingsTriggerRef.current = { focus: mockSettingsTriggerFocus.index };
      }, [headingRef]);
      return (
        <View>
          <View accessibilityLabel="Workout" accessibilityRole="header" testID="root-route-index" />
          <Pressable
            accessibilityLabel="Open App Settings"
            accessibilityRole="button"
            onPress={() => openRootSettings({
              root: "index",
              triggerRef: settingsTriggerRef,
            })}
          />
        </View>
      );
    },
  };
});

jest.mock("../calendar", () => {
  const React = require("react") as typeof import("react");
  const {
    Pressable,
    View,
  } = require("react-native") as typeof import("react-native");
  const { useRootSettingsController } = require("../../../src/ui/shell/AppRootShell") as typeof import("../../../src/ui/shell/AppRootShell");
  const { useRootHeadingRef } = require("../../../src/ui/shell/rootFocus") as typeof import("../../../src/ui/shell/rootFocus");
  return {
    __esModule: true,
    default: () => {
      const headingRef = useRootHeadingRef("calendar");
      const settingsTriggerRef = React.useRef<{ focus?: () => void } | null>(null);
      const { openRootSettings } = useRootSettingsController();
      React.useEffect(() => {
        if (headingRef !== undefined) {
          headingRef.current = { focus: mockHeadingFocus.calendar };
        }
        settingsTriggerRef.current = { focus: mockSettingsTriggerFocus.calendar };
      }, [headingRef]);
      return (
        <View>
          <View accessibilityLabel="Calendar" accessibilityRole="header" testID="root-route-calendar" />
          <Pressable
            accessibilityLabel="Open App Settings"
            accessibilityRole="button"
            onPress={() => openRootSettings({
              root: "calendar",
              triggerRef: settingsTriggerRef,
            })}
          />
        </View>
      );
    },
  };
});

jest.mock("../library", () => {
  const React = require("react") as typeof import("react");
  const {
    Pressable,
    View,
  } = require("react-native") as typeof import("react-native");
  const { useRootSettingsController } = require("../../../src/ui/shell/AppRootShell") as typeof import("../../../src/ui/shell/AppRootShell");
  const { useRootHeadingRef } = require("../../../src/ui/shell/rootFocus") as typeof import("../../../src/ui/shell/rootFocus");
  return {
    __esModule: true,
    default: () => {
      const headingRef = useRootHeadingRef("library");
      const settingsTriggerRef = React.useRef<{ focus?: () => void } | null>(null);
      const { openRootSettings } = useRootSettingsController();
      React.useEffect(() => {
        if (headingRef !== undefined) {
          headingRef.current = { focus: mockHeadingFocus.library };
        }
        settingsTriggerRef.current = { focus: mockSettingsTriggerFocus.library };
      }, [headingRef]);
      return (
        <View>
          <View accessibilityLabel="Library" accessibilityRole="header" testID="root-route-library" />
          <Pressable
            accessibilityLabel="Open App Settings"
            accessibilityRole="button"
            onPress={() => openRootSettings({
              root: "library",
              triggerRef: settingsTriggerRef,
            })}
          />
        </View>
      );
    },
  };
});

jest.mock("../progress", () => {
  const React = require("react") as typeof import("react");
  const {
    Pressable,
    View,
  } = require("react-native") as typeof import("react-native");
  const { useRootSettingsController } = require("../../../src/ui/shell/AppRootShell") as typeof import("../../../src/ui/shell/AppRootShell");
  const { useRootHeadingRef } = require("../../../src/ui/shell/rootFocus") as typeof import("../../../src/ui/shell/rootFocus");
  return {
    __esModule: true,
    default: () => {
      const headingRef = useRootHeadingRef("progress");
      const settingsTriggerRef = React.useRef<{ focus?: () => void } | null>(null);
      const { openRootSettings } = useRootSettingsController();
      React.useEffect(() => {
        if (headingRef !== undefined) {
          headingRef.current = { focus: mockHeadingFocus.progress };
        }
        settingsTriggerRef.current = { focus: mockSettingsTriggerFocus.progress };
      }, [headingRef]);
      return (
        <View>
          <View accessibilityLabel="Progress" accessibilityRole="header" testID="root-route-progress" />
          <Pressable
            accessibilityLabel="Open App Settings"
            accessibilityRole="button"
            onPress={() => openRootSettings({
              root: "progress",
              triggerRef: settingsTriggerRef,
            })}
          />
        </View>
      );
    },
  };
});

jest.mock("../../../src/ui/screens/SettingsScreen", () => {
  const React = require("react") as typeof import("react");
  const { Pressable, View } = require("react-native") as typeof import("react-native");

  return {
    __esModule: true,
    AppSettingsContent: ({
      onOpenDataAndRecovery,
      onOpenRemovedSessions,
      removedSessionsTriggerRef,
      dataAndRecoveryTriggerRef,
    }: Readonly<{
      onOpenDataAndRecovery(): void;
      onOpenRemovedSessions(): void;
      removedSessionsTriggerRef?: React.RefObject<{ focus?: () => void } | null>;
      dataAndRecoveryTriggerRef?: React.RefObject<{ focus?: () => void } | null>;
    }>) => {
      React.useEffect(() => {
        if (removedSessionsTriggerRef !== undefined) {
          removedSessionsTriggerRef.current = { focus: mockRemovedSessionsTriggerFocus };
        }
        if (dataAndRecoveryTriggerRef !== undefined) {
          dataAndRecoveryTriggerRef.current = {};
        }
      }, [dataAndRecoveryTriggerRef, removedSessionsTriggerRef]);

      return (
        <View>
          <Pressable
            accessibilityLabel="Removed sessions"
            accessibilityRole="button"
            onPress={onOpenRemovedSessions}
          />
          <Pressable
            accessibilityLabel="Data and recovery"
            accessibilityRole="button"
            onPress={onOpenDataAndRecovery}
          />
        </View>
      );
    },
  };
});

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

  const activeRouteName = () => {
    if (mockPathname === "/" || mockPathname === "/index") {
      return "index";
    }
    if (mockPathname.startsWith("/calendar")) {
      return "calendar";
    }
    if (mockPathname.startsWith("/library")) {
      return "library";
    }
    if (mockPathname.startsWith("/progress")) {
      return "progress";
    }
    return ["index", "calendar", "library", "progress"][mockSelectedRouteIndex] ?? "index";
  };

  Tabs.Screen = ({
    name,
  }: Readonly<{
    name: string;
  }>) => {
    if (name !== activeRouteName()) {
      return null;
    }
    if (name === "index") {
      const Route = require("../index").default as React.ComponentType;
      return <Route />;
    }
    if (name === "calendar") {
      const Route = require("../calendar").default as React.ComponentType;
      return <Route />;
    }
    if (name === "library") {
      const Route = require("../library").default as React.ComponentType;
      return <Route />;
    }
    if (name === "progress") {
      const Route = require("../progress").default as React.ComponentType;
      return <Route />;
    }
    return null;
  };

  return {
    __esModule: true,
    Tabs,
    router: {
      push: (...args: [string]) => mockPush(...args),
    },
    usePathname: () => mockPathname,
    useRouter: () => ({
      push: (...args: [string]) => mockPush(...args),
    }),
  };
});

jest.mock("../../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => mockRuntime,
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
    mockPush.mockReset();
    mockReadRestAlertPreferences.mockClear();
    mockSetRestAlertPreferences.mockClear();
    mockOpenRestNotificationSettings.mockClear();
    mockSelectedRouteIndex = 0;
    mockPathname = "/";
    for (const focus of Object.values(mockHeadingFocus)) {
      focus.mockReset();
    }
    for (const focus of Object.values(mockSettingsTriggerFocus)) {
      focus.mockReset();
    }
    mockRemovedSessionsTriggerFocus.mockReset();
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

  it("keeps the root-header settings trigger wired through its open and close flow", async () => {
    const rendered = await render(
      <AppearanceProvider>
        <RootTabsLayout />
      </AppearanceProvider>,
    );
    await fireEvent.press(rendered.getByRole("button", { name: "Open App Settings" }));
    expect(rendered.getByRole("header", { name: "App Settings" })).toBeOnTheScreen();
    await fireEvent.press(rendered.getByRole("button", { name: "Close App Settings" }));

    expect(rendered.queryByRole("header", { name: "App Settings" })).toBeNull();
    expect(mockSettingsTriggerFocus.index).toHaveBeenCalledTimes(1);
  });

  it("captures deep-route origin in production and restores exact or heading focus on return", async () => {
    const rendered = await render(
      <AppearanceProvider>
        <RootTabsLayout />
      </AppearanceProvider>,
    );

    await fireEvent.press(rendered.getByRole("button", { name: "Open App Settings" }));
    await fireEvent.press(rendered.getByRole("button", { name: "Removed sessions" }));
    expect(mockPush).toHaveBeenCalledWith("/more/removed-sessions");

    await act(async () => {
      mockPathname = "/more/removed-sessions";
      rendered.rerender(
        <AppearanceProvider>
          <RootTabsLayout />
        </AppearanceProvider>,
      );
    });

    await act(async () => {
      mockPathname = "/";
      rendered.rerender(
        <AppearanceProvider>
          <RootTabsLayout />
        </AppearanceProvider>,
      );
    });
    expect(mockRemovedSessionsTriggerFocus).toHaveBeenCalledTimes(1);

    await fireEvent.press(rendered.getByRole("button", { name: "Open App Settings" }));
    await fireEvent.press(rendered.getByRole("button", { name: "Data and recovery" }));
    expect(mockPush).toHaveBeenCalledWith("/more/data-and-recovery");

    await act(async () => {
      mockPathname = "/more/data-and-recovery";
      rendered.rerender(
        <AppearanceProvider>
          <RootTabsLayout />
        </AppearanceProvider>,
      );
    });

    await act(async () => {
      mockPathname = "/";
      rendered.rerender(
        <AppearanceProvider>
          <RootTabsLayout />
        </AppearanceProvider>,
      );
    });
    expect(mockHeadingFocus.index).toHaveBeenCalledTimes(1);
  });
});

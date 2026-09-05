import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Dimensions } from "react-native";
import React from "react";

let mockFontsLoaded = true;
let mockFontError: Error | null = null;
let mockNativeContractsEnabled = true;
let mockPathname = "/__phase2-attended-preview";
const mockRuntimeProviderMounted = jest.fn();
const mockProductionAppearanceRead = jest.fn(() => null);
const mockProductionAppearanceWrite = jest.fn();
const mockPreviewAppearanceRead = jest.fn(() => null);
const mockPreviewAppearanceWrite = jest.fn();
const mockSqliteStorageConstructed = jest.fn();
const mockUseFonts = jest.fn((_fonts: unknown) => [
  mockFontsLoaded,
  mockFontError,
] as const);

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

jest.mock("expo-font", () => ({
  useFonts: (fonts: unknown) => mockUseFonts(fonts),
}));

jest.mock("expo-router", () => {
  const { View } = require("react-native") as typeof import("react-native");
  const Stack = Object.assign(
    ({ children }: Readonly<{ children?: React.ReactNode }>) => (
      <View testID="root-stack">{children}</View>
    ),
    {
      Screen: ({ name }: Readonly<{ name: string }>) => (
        <View testID={`root-stack-screen-${name}`} />
      ),
    },
  );

  return {
    Stack,
    usePathname: () => mockPathname,
  };
});

jest.mock("expo-status-bar", () => {
  const { View } = require("react-native") as typeof import("react-native");
  return { StatusBar: () => <View testID="status-bar" /> };
});

jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native") as typeof import("react-native");
  return {
    SafeAreaProvider: ({ children }: Readonly<{ children: React.ReactNode }>) => (
      <View testID="safe-area-provider">{children}</View>
    ),
  };
});

jest.mock("expo-sqlite/kv-store", () => ({
  SQLiteStorage: class SQLiteStorage {
    constructor(...args: unknown[]) {
      mockSqliteStorageConstructed(...args);
    }

    getItemSync() {
      return mockProductionAppearanceRead();
    }

    setItemSync(_key: string, value: string) {
      mockProductionAppearanceWrite(value);
    }

    removeItemSync() {
      mockProductionAppearanceWrite(null);
      return true;
    }
  },
}));

jest.mock("../../src/bootstrap/workoutAppRuntime", () => {
  const { View } = require("react-native") as typeof import("react-native");
  return {
    productionWorkoutAppRuntimeDependencies: {},
    useWorkoutAppRuntime: () => ({
      launchState: "trusted",
      notificationPermission: "granted",
      openRestNotificationSettings: jest.fn(),
      requestRestNotificationPermission: jest.fn(),
    }),
    WorkoutAppRuntimeProvider: ({
      children,
    }: Readonly<{ children: React.ReactNode }>) => {
      mockRuntimeProviderMounted();
      return <View testID="workout-runtime-provider">{children}</View>;
    },
  };
});

jest.mock("../../src/ui/screens/RootScreens", () => {
  const { View } = require("react-native") as typeof import("react-native");
  return {
    AppLoadingShell: ({ width = 599 }: Readonly<{ width?: number }>) => (
      <View testID="app-loading-shell">
        <View testID={width < 840
          ? "root-navigation-bottom"
          : "root-navigation-rail"}
        />
      </View>
    ),
    StartupReadinessGate: ({
      children,
    }: Readonly<{ children: React.ReactNode }>) => (
      <View testID="startup-readiness-gate">{children}</View>
    ),
  };
});

jest.mock("../../src/ui/theme", () => {
  const { Pressable, View } =
    require("react-native") as typeof import("react-native");
  return {
    createMemoryAppearanceStore: () => ({
      read: () => mockPreviewAppearanceRead(),
      write: (value: "Light" | "Dark" | null) =>
        mockPreviewAppearanceWrite(value),
    }),
    AppearanceProvider: ({
      children,
      store,
    }: Readonly<{
      children: React.ReactNode;
      store: Readonly<{
        read(): unknown;
        write(value: "Light" | "Dark" | null): void;
      }>;
    }>) => {
      store.read();
      return (
        <View testID="appearance-provider">
          <Pressable
            accessibilityLabel="Set dark appearance"
            accessibilityRole="button"
            onPress={() => store.write("Dark")}
          />
          {children}
        </View>
      );
    },
    appFonts: { Interface: 1 },
    useAppTheme: () => ({ colorScheme: "dark" }),
  };
});

import RootLayout from "../_layout";

describe("RootLayout attended preview isolation", () => {
  beforeEach(() => {
    mockFontsLoaded = true;
    mockFontError = null;
    mockNativeContractsEnabled = true;
    mockPathname = "/__phase2-attended-preview";
    mockRuntimeProviderMounted.mockClear();
    mockUseFonts.mockClear();
    mockProductionAppearanceRead.mockClear();
    mockProductionAppearanceWrite.mockClear();
    mockPreviewAppearanceRead.mockClear();
    mockPreviewAppearanceWrite.mockClear();
    mockSqliteStorageConstructed.mockClear();
    Dimensions.set({
      screen: { fontScale: 1, height: 900, scale: 1, width: 599 },
      window: { fontScale: 1, height: 900, scale: 1, width: 599 },
    });
  });

  it("does not initialize the production runtime for the devtest attended preview", async () => {
    await render(<RootLayout />);

    expect(screen.getByTestId("safe-area-provider")).toBeOnTheScreen();
    expect(screen.getByTestId("appearance-provider")).toBeOnTheScreen();
    expect(screen.getByTestId("root-stack-screen-__phase2-attended-preview"))
      .toBeOnTheScreen();
    expect(screen.queryByTestId("workout-runtime-provider"))
      .not.toBeOnTheScreen();
    expect(screen.queryByTestId("startup-readiness-gate"))
      .not.toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockPreviewAppearanceRead).toHaveBeenCalledTimes(1);
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", {
      name: "Set dark appearance",
    }));
    expect(mockPreviewAppearanceWrite).toHaveBeenCalledWith("Dark");
    expect(mockProductionAppearanceWrite).not.toHaveBeenCalled();
    expect(mockSqliteStorageConstructed).not.toHaveBeenCalled();
  });

  it("renders the Phase 6 gesture fixture without production runtime or SQLite", async () => {
    mockPathname = "/__phase6-gesture-smoke";

    await render(<RootLayout />);

    expect(screen.getByTestId("safe-area-provider")).toBeOnTheScreen();
    expect(screen.getByTestId("appearance-provider")).toBeOnTheScreen();
    expect(screen.getByTestId("root-stack-screen-__phase6-gesture-smoke"))
      .toBeOnTheScreen();
    expect(screen.queryByTestId("workout-runtime-provider"))
      .not.toBeOnTheScreen();
    expect(screen.queryByTestId("startup-readiness-gate"))
      .not.toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockPreviewAppearanceRead).toHaveBeenCalledTimes(1);
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
    expect(mockSqliteStorageConstructed).not.toHaveBeenCalled();
  });

  it("keeps the Phase 6 gesture fixture isolated while fonts are pending", async () => {
    mockFontsLoaded = false;
    mockPathname = "/__phase6-gesture-smoke";

    await render(<RootLayout />);

    expect(mockUseFonts).toHaveBeenCalledWith({ Interface: 1 });
    expect(screen.getByTestId("app-loading-shell")).toBeOnTheScreen();
    expect(screen.queryByTestId("root-stack")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("workout-runtime-provider"))
      .not.toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockPreviewAppearanceRead).toHaveBeenCalledTimes(1);
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
    expect(mockSqliteStorageConstructed).not.toHaveBeenCalled();
  });

  it("keeps production runtime initialization when the preview path lacks the exact flag", async () => {
    mockNativeContractsEnabled = false;

    await render(<RootLayout />);

    expect(screen.getByTestId("workout-runtime-provider"))
      .toBeOnTheScreen();
    expect(screen.getByTestId("startup-readiness-gate"))
      .toBeOnTheScreen();
    expect(screen.getByTestId("gesture-handler-root"))
      .toContainElement(screen.getByTestId("workout-runtime-provider"));
    expect(mockRuntimeProviderMounted).toHaveBeenCalledTimes(1);
    expect(mockProductionAppearanceRead).toHaveBeenCalledTimes(1);
    expect(mockSqliteStorageConstructed)
      .toHaveBeenCalledWith("gym-tracker-preferences.db");
    await fireEvent.press(screen.getByRole("button", {
      name: "Set dark appearance",
    }));
    expect(mockProductionAppearanceWrite).toHaveBeenCalledWith("Dark");
    expect(mockPreviewAppearanceRead).not.toHaveBeenCalled();
    expect(mockPreviewAppearanceWrite).not.toHaveBeenCalled();
  });

  it("keeps production runtime initialization for other devtest routes", async () => {
    mockPathname = "/__notification-test-controls";

    await render(<RootLayout />);

    expect(screen.getByTestId("workout-runtime-provider"))
      .toBeOnTheScreen();
    expect(screen.getByTestId("startup-readiness-gate"))
      .toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).toHaveBeenCalledTimes(1);
  });

  it("keeps the exact preview on its memory store while fonts are pending", async () => {
    mockFontsLoaded = false;

    await render(<RootLayout />);

    expect(mockUseFonts).toHaveBeenCalledWith({ Interface: 1 });
    expect(screen.getByTestId("app-loading-shell")).toBeOnTheScreen();
    expect(screen.queryByTestId("root-stack")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("workout-runtime-provider"))
      .not.toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockPreviewAppearanceRead).toHaveBeenCalledTimes(1);
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", {
      name: "Set dark appearance",
    }));
    expect(mockPreviewAppearanceWrite).toHaveBeenCalledWith("Dark");
    expect(mockProductionAppearanceWrite).not.toHaveBeenCalled();
    expect(mockSqliteStorageConstructed).not.toHaveBeenCalled();
  });

  it.each([839, 840])(
    "passes the live %idp width to the production font-loading shell",
    async (width) => {
      mockFontsLoaded = false;
      mockPathname = "/";
      Dimensions.set({
        screen: { fontScale: 2, height: 420, scale: 1, width },
        window: { fontScale: 2, height: 420, scale: 1, width },
      });

      await render(<RootLayout />);

      expect(screen.getByTestId(width < 840
        ? "root-navigation-bottom"
        : "root-navigation-rail")).toBeOnTheScreen();
      expect(screen.queryByTestId(width < 840
        ? "root-navigation-rail"
        : "root-navigation-bottom")).not.toBeOnTheScreen();
      expect(mockProductionAppearanceRead).toHaveBeenCalledTimes(1);
      expect(mockPreviewAppearanceRead).not.toHaveBeenCalled();
    },
  );
});

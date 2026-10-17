import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Dimensions, Keyboard, StyleSheet } from "react-native";
import React from "react";

let mockFontsLoaded = true;
let mockFontError: Error | null = null;
let mockBuildProfile = "development-test";
let mockNativeContractsEnabled = true;
let mockNativeContractSuite: string | null = null;
let mockPathname = "/__phase2-attended-preview";
let mockSearchParams: Record<string, string> = {};
let mockSafeAreaInsets = { bottom: 0, left: 0, right: 0, top: 0 };
const mockRuntimeProviderMounted = jest.fn();
const mockRuntimeProviderDependencies = jest.fn();
const mockCreatePhase20VisualDependencies = jest.fn<
  (request: unknown) => Readonly<{ fixture: true }>
>(() => ({ fixture: true }));
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
        get buildProfile() {
          return mockBuildProfile;
        },
        get nativeContractsEnabled() {
          return mockNativeContractsEnabled;
        },
        get nativeContractSuite() {
          return mockNativeContractSuite;
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
    useLocalSearchParams: () => mockSearchParams,
  };
});

jest.mock("../../src/testing/phase20VisualFixtureRuntime", () => ({
  createPhase20VisualRuntimeDependencies: (request: unknown) => {
    mockCreatePhase20VisualDependencies(request);
    return { fixture: true };
  },
  phase20VisualCleanupStatus: () => "complete",
  clearPhase20VisualCleanupStatus: jest.fn(),
}));

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
    useSafeAreaInsets: () => mockSafeAreaInsets,
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
      runningPlanRuntime: null,
      notificationPermission: "granted",
      openRestNotificationSettings: jest.fn(),
      requestRestNotificationPermission: jest.fn(),
    }),
    WorkoutAppRuntimeProvider: ({
      children,
      dependencies,
    }: Readonly<{ children: React.ReactNode; dependencies: unknown }>) => {
      mockRuntimeProviderMounted();
      mockRuntimeProviderDependencies(dependencies);
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
    RootFailureState: ({ failure }: Readonly<{ failure: { category: string } }>) => (
      <View testID={`root-failure-${failure.category}`} />
    ),
  };
});

jest.mock("../../src/ui/screens/RootFailureState", () => {
  const { Pressable, View } =
    require("react-native") as typeof import("react-native");
  return {
    RootFailureState: ({
      failure,
      onRetry,
    }: Readonly<{
      failure: { category: string };
      onRetry: () => void;
    }>) => (
      <View testID={`root-failure-${failure.category}`}>
        <Pressable
          accessibilityLabel="Retry opening workout data"
          accessibilityRole="button"
          onPress={onRetry}
          testID={`root-failure-retry-${failure.category}`}
        />
      </View>
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
    space: { 2: 8, 4: 16 },
    typeScale: { body: {} },
    useAppTheme: () => ({
      colorScheme: "dark",
      colors: {
        destructive: "#ff0000",
        timerAttention: "#ffff00",
        toastAccent: "#00ff00",
        toastBg: "#000000",
        toastBorder: "#333333",
        toastText: "#ffffff",
      },
      reduceMotion: true,
    }),
  };
});

import RootLayout, { ProductionToastBoundary } from "../_layout";

describe("RootLayout attended preview isolation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    mockFontsLoaded = true;
    mockFontError = null;
    mockBuildProfile = "development-test";
    mockNativeContractsEnabled = true;
    mockNativeContractSuite = null;
    mockPathname = "/__phase2-attended-preview";
    mockSearchParams = {};
    mockSafeAreaInsets = { bottom: 0, left: 0, right: 0, top: 0 };
    mockRuntimeProviderMounted.mockClear();
    mockRuntimeProviderDependencies.mockClear();
    mockCreatePhase20VisualDependencies.mockClear();
    mockUseFonts.mockClear();
    mockProductionAppearanceRead.mockReset();
    mockProductionAppearanceRead.mockReturnValue(null);
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

  it("isolates the Phase 14 font proof before a cold deep link resolves", async () => {
    mockPathname = "/";
    mockNativeContractSuite = "phase14-font-proof";

    await render(<RootLayout />);

    expect(screen.getByTestId("root-stack-screen-__phase2-attended-preview"))
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

  it("runs Phase 12 cleanup without production runtime or SQLite", async () => {
    mockPathname = "/__phase12-google-cleanup";

    await render(<RootLayout />);

    expect(screen.getByTestId("root-stack-screen-__phase12-google-cleanup"))
      .toBeOnTheScreen();
    expect(screen.queryByTestId("workout-runtime-provider"))
      .not.toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
    expect(mockSqliteStorageConstructed).not.toHaveBeenCalled();
  });

  it("runs the Phase 12 Google auth smoke without production runtime or SQLite", async () => {
    mockPathname = "/__phase12-google-auth-smoke";

    await render(<RootLayout />);

    expect(screen.getByTestId("root-stack-screen-__phase12-google-auth-smoke"))
      .toBeOnTheScreen();
    expect(screen.queryByTestId("workout-runtime-provider"))
      .not.toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
    expect(mockSqliteStorageConstructed).not.toHaveBeenCalled();
  });

  it("isolates the packaged v1.2 native SQLite contract route without production bootstrap", async () => {
    mockPathname = "/__native-contracts";
    mockNativeContractSuite = "v1.2-acceptance";

    await render(<RootLayout />);

    expect(screen.getByTestId("root-stack-screen-__native-contracts"))
      .toBeOnTheScreen();
    expect(screen.queryByTestId("workout-runtime-provider"))
      .not.toBeOnTheScreen();
    expect(screen.queryByTestId("startup-readiness-gate"))
      .not.toBeOnTheScreen();
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
    expect(mockSqliteStorageConstructed).not.toHaveBeenCalled();
  });

  it("isolates the Phase 20 quality workload from the production database bootstrap", async () => {
    mockPathname = "/__phase20-quality-probe";
    mockNativeContractSuite = "v1.2-acceptance";

    await render(<RootLayout />);

    expect(screen.getByTestId("root-stack-screen-__phase20-quality-probe"))
      .toBeOnTheScreen();
    expect(screen.queryByTestId("workout-runtime-provider"))
      .not.toBeOnTheScreen();
    expect(screen.queryByTestId("startup-readiness-gate"))
      .not.toBeOnTheScreen();
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
    expect(mockSqliteStorageConstructed).not.toHaveBeenCalled();
  });

  it("keeps the native contract path behind the exact v1.2 acceptance suite gate", async () => {
    mockPathname = "/__native-contracts";
    mockNativeContractSuite = "phase2";

    await render(<RootLayout />);

    expect(screen.getByTestId("workout-runtime-provider"))
      .toBeOnTheScreen();
    expect(screen.getByTestId("startup-readiness-gate"))
      .toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).toHaveBeenCalledTimes(1);
  });

  it("isolates a valid Phase 20 visual request before production startup", async () => {
    mockPathname = "/__phase20-visual-probe";
    mockNativeContractSuite = "v1.2-acceptance";
    mockSearchParams = {
      state: "BW-001",
      configuration: "AP-L-C390-P-F100",
      fixture: "v12-synthetic-fixtures-r18",
      nonce: "a".repeat(32),
      mode: "capture",
    };

    await render(<RootLayout />);

    expect(screen.getByTestId("root-stack-screen-__phase20-visual-probe"))
      .toBeOnTheScreen();
    expect(mockCreatePhase20VisualDependencies).toHaveBeenCalledWith(
      expect.objectContaining({ state: "BW-001", nonce: "a".repeat(32) }),
    );
    expect(mockRuntimeProviderDependencies).toHaveBeenCalledWith({ fixture: true });
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
  });

  it("never opens a fixture or production database for an invalid visual request", async () => {
    mockPathname = "/__phase20-visual-probe";
    mockNativeContractSuite = "v1.2-acceptance";
    mockSearchParams = {
      state: "BW-001",
      configuration: "AP-L-C390-P-F100",
      fixture: "v12-synthetic-fixtures-r18",
      nonce: "invalid",
      mode: "capture",
    };

    await render(<RootLayout />);

    expect(screen.getByTestId("root-stack-screen-__phase20-visual-probe"))
      .toBeOnTheScreen();
    expect(mockCreatePhase20VisualDependencies).not.toHaveBeenCalled();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
  });

  it("does not activate the visual runtime outside the exact development-test suite", async () => {
    mockPathname = "/__phase20-visual-probe";
    mockBuildProfile = "production";
    mockNativeContractSuite = "v1.2-acceptance";
    mockSearchParams = {
      state: "BW-001",
      configuration: "AP-L-C390-P-F100",
      fixture: "v12-synthetic-fixtures-r18",
      nonce: "a".repeat(32),
      mode: "capture",
    };

    await render(<RootLayout />);

    expect(mockCreatePhase20VisualDependencies).not.toHaveBeenCalled();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
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
    expect(mockProductionAppearanceRead).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByRole("button", {
      name: "Set dark appearance",
    }));
    expect(mockProductionAppearanceWrite).toHaveBeenCalledWith("Dark");
    expect(mockPreviewAppearanceRead).not.toHaveBeenCalled();
    expect(mockPreviewAppearanceWrite).not.toHaveBeenCalled();
  });

  it("retries the trusted runtime after a pre-runtime bundled font failure", async () => {
    mockNativeContractsEnabled = false;
    mockPathname = "/";
    mockFontsLoaded = false;
    mockFontError = new Error("asset font failure /private/secret.ttf");

    await render(<RootLayout />);

    expect(screen.getByTestId("root-failure-font")).toBeOnTheScreen();
    expect(screen.queryByTestId("workout-runtime-provider")).not.toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockUseFonts).toHaveBeenCalledTimes(1);

    mockFontsLoaded = true;
    mockFontError = null;

    fireEvent.press(screen.getByTestId("root-failure-retry-font"));

    await waitFor(() => {
      expect(screen.getByTestId("workout-runtime-provider")).toBeOnTheScreen();
    });
    expect(screen.queryByTestId("root-failure-font")).not.toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).toHaveBeenCalledTimes(1);
    expect(mockUseFonts).toHaveBeenCalledTimes(2);
  });

  it("retries the trusted runtime after a pre-runtime appearance read failure", async () => {
    mockNativeContractsEnabled = false;
    mockPathname = "/";
    mockProductionAppearanceRead.mockImplementation(() => {
      throw new Error("sqlite unavailable /private/gym-tracker-preferences.db");
    });

    await render(<RootLayout />);

    expect(screen.getByTestId("root-failure-appearance")).toBeOnTheScreen();
    expect(screen.queryByTestId("workout-runtime-provider")).not.toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();

    mockProductionAppearanceRead.mockReset();
    mockProductionAppearanceRead.mockReturnValue(null);

    fireEvent.press(screen.getByTestId("root-failure-retry-appearance"));

    await waitFor(() => {
      expect(screen.getByTestId("workout-runtime-provider")).toBeOnTheScreen();
    });
    expect(screen.queryByTestId("root-failure-appearance")).not.toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).toHaveBeenCalledTimes(1);
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

  it("mounts one production toast corridor using safe-area, shell, and keyboard bounds", async () => {
    mockNativeContractsEnabled = false;
    mockPathname = "/more/removed-sessions";
    mockSafeAreaInsets = { bottom: 20, left: 0, right: 0, top: 24 };
    const listeners = new Map<string, (event?: unknown) => void>();
    jest.spyOn(Keyboard, "metrics").mockReturnValue(undefined);
    jest.spyOn(Keyboard, "addListener").mockImplementation((event, listener) => {
      listeners.set(event, listener as (event?: unknown) => void);
      return { remove: jest.fn() } as never;
    });

    await render(<RootLayout />);

    expect(screen.getAllByTestId("semantic-toast-host")).toHaveLength(1);
    expect(StyleSheet.flatten(screen.getByTestId("semantic-toast-host").props.style))
      .toMatchObject({ bottom: 110, top: 96 });

    await act(async () => {
      listeners.get("keyboardDidShow")?.({
        duration: 0,
        easing: "keyboard",
        endCoordinates: {
          height: 400,
          screenX: 0,
          screenY: 500,
          width: 599,
        },
      });
    });

    expect(StyleSheet.flatten(screen.getByTestId("semantic-toast-host").props.style))
      .toMatchObject({ bottom: 416, top: 96 });

    await act(async () => {
      listeners.get("keyboardDidHide")?.();
    });
    expect(StyleSheet.flatten(screen.getByTestId("semantic-toast-host").props.style))
      .toMatchObject({ bottom: 110, top: 96 });
  });

  it("retains a root seam for a taller downstream command dock", async () => {
    mockSafeAreaInsets = { bottom: 20, left: 0, right: 0, top: 24 };
    jest.spyOn(Keyboard, "metrics").mockReturnValue(undefined);
    jest.spyOn(Keyboard, "addListener").mockReturnValue({
      remove: jest.fn(),
    } as never);

    await render(
      <ProductionToastBoundary dockAvoidance={160}>
        <React.Fragment />
      </ProductionToastBoundary>,
    );

    expect(StyleSheet.flatten(screen.getByTestId("semantic-toast-host").props.style))
      .toMatchObject({ bottom: 176, top: 96 });
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

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
let mockPackageName = "com.fchoo.gymtracker.devtest";
let mockPathname = "/__phase2-attended-preview";
let mockSearchParams: Record<string, string> = {};
let mockGlobalSearchParams: Record<string, string> | undefined;
let mockSafeAreaInsets = { bottom: 0, left: 0, right: 0, top: 0 };
const mockRuntimeProviderMounted = jest.fn();
const mockRuntimeProviderDependencies = jest.fn();
const mockCreatePhase20VisualDependencies = jest.fn<
  (request: unknown) => Readonly<{ fixture: true }>
>(() => ({ fixture: true }));
const mockCreatePhase20CalendarDependencies = jest.fn(
  (databaseName: string) => ({ calendarFixture: databaseName }),
);
const mockCreateRecoveryDependencies = jest.fn(
  (databaseName: string) => ({ recoveryFixture: databaseName }),
);
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
      android: { get package() { return mockPackageName; } },
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
    Redirect: () => <View testID="evidence-route-disabled" />,
    Stack,
    usePathname: () => mockPathname,
    useLocalSearchParams: () => mockSearchParams,
    useGlobalSearchParams: () => mockGlobalSearchParams ?? mockSearchParams,
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

jest.mock("../../src/testing/phase20CalendarRuntime", () => {
  const actual = jest.requireActual("../../src/testing/phase20CalendarRuntime") as object;
  return {
    ...actual,
    createPhase20CalendarRuntimeDependencies: (databaseName: string) =>
      mockCreatePhase20CalendarDependencies(databaseName),
  };
});

jest.mock("../../src/testing/isolatedWorkoutRuntime", () => {
  const actual = jest.requireActual("../../src/testing/isolatedWorkoutRuntime") as object;
  return {
    ...actual,
    createStrictIsolatedWorkoutRuntimeDependencies: ({ databaseName }: { databaseName: string }) =>
      mockCreateRecoveryDependencies(databaseName),
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
    mockPackageName = "com.fchoo.gymtracker.devtest";
    mockPathname = "/__phase2-attended-preview";
    mockSearchParams = {};
    mockGlobalSearchParams = undefined;
    mockSafeAreaInsets = { bottom: 0, left: 0, right: 0, top: 0 };
    mockRuntimeProviderMounted.mockClear();
    mockRuntimeProviderDependencies.mockClear();
    mockCreatePhase20VisualDependencies.mockClear();
    mockCreatePhase20CalendarDependencies.mockClear();
    mockCreateRecoveryDependencies.mockClear();
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

  it("observes the real normal provider pathname and keeps its nonce through navigation", async () => {
    mockNativeContractSuite = "v1.2-acceptance";
    mockPathname = "/";
    mockGlobalSearchParams = { closeoutRouteNonce: "a".repeat(32), privateQuery: "not-retained" };
    const lines: string[] = [];
    jest.spyOn(console, "info").mockImplementation(line => { lines.push(String(line)); });
    const view = await render(<RootLayout />);
    expect(screen.getByTestId("workout-runtime-provider")).toBeOnTheScreen();
    expect(screen.getByTestId("root-stack")).toBeOnTheScreen();
    mockPathname = "/more/removed-sessions";
    mockGlobalSearchParams = {};
    await view.rerender(<RootLayout />);
    expect(lines.map(line => JSON.parse(line.slice("GYM_TRACKER_V12_NORMAL_ROUTE_OBSERVATION:".length)).pathname)).toEqual(["/", "/more/removed-sessions"]);
    expect(lines.join("\n")).not.toMatch(/privateQuery|not-retained|\?/u);
  });

  it.each(["package", "profile", "flag", "suite"])("does not enable normal observations when the actual %s gate fails", async field => {
    mockNativeContractSuite = "v1.2-acceptance";
    mockPathname = "/";
    mockGlobalSearchParams = { closeoutRouteNonce: "a".repeat(32) };
    if (field === "package") mockPackageName = "com.fchoo.gymtracker";
    if (field === "profile") mockBuildProfile = "production";
    if (field === "flag") mockNativeContractsEnabled = false;
    if (field === "suite") mockNativeContractSuite = "other-suite";
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    await render(<RootLayout />);
    expect(info).not.toHaveBeenCalled();
  });

  it("retains a source-validated functional nonce when switching back to the normal navigator", async () => {
    mockNativeContractSuite = "v1.2-acceptance";
    mockPathname = "/workout/owned-session";
    mockGlobalSearchParams = { shard: "workout", case: "workout.complete-commit", fixture: "v12-synthetic-fixtures-r18", nonce: "b".repeat(48), mode: "product" };
    const lines: string[] = [];
    jest.spyOn(console, "info").mockImplementation(line => { lines.push(String(line)); });
    const view = await render(<RootLayout />);
    mockGlobalSearchParams = {};
    await view.rerender(<RootLayout />);
    const observations = lines.filter(line => line.startsWith("GYM_TRACKER_V12_NORMAL_ROUTE_OBSERVATION:"));
    expect(observations.length).toBeGreaterThan(0);
    expect(JSON.parse(observations.at(-1)!.slice("GYM_TRACKER_V12_NORMAL_ROUTE_OBSERVATION:".length)))
      .toMatchObject({ pathname: "/workout/owned-session", nonce: "b".repeat(48), nonce_kind: "functional" });
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

  it.each(["multi-plan", "workout", "library-running"])(
    "isolates the %s native acceptance route from production bootstrap",
    async (shard) => {
      mockPathname = `/native-acceptance/${shard}`;
      mockNativeContractSuite = "v1.2-acceptance";
      mockSearchParams = {
        case: shard === "multi-plan"
          ? "phase13-migration-failure-cuts"
          : shard === "workout"
            ? "workout.root-identity"
            : "library.remembered-state",
        fixture: "v12-synthetic-fixtures-r18",
        nonce: "a".repeat(48),
      };

      await render(<RootLayout />);

      expect(screen.getByTestId("root-stack-screen-native-acceptance/[shard]"))
        .toBeOnTheScreen();
      expect(screen.getByTestId("workout-runtime-provider"))
        .toBeOnTheScreen();
      expect(screen.queryByTestId("startup-readiness-gate"))
        .not.toBeOnTheScreen();
      const databaseName = `gym-tracker-v12-native-acceptance-${"a".repeat(48)}.db`;
      expect(mockCreateRecoveryDependencies).toHaveBeenCalledWith(databaseName);
      expect(mockRuntimeProviderDependencies).toHaveBeenCalledWith({ recoveryFixture: databaseName });
      expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
      expect(mockSqliteStorageConstructed).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["disabled", false, "phase13-migration-failure-cuts"],
    ["wrong suite", true, "phase13-migration-failure-cuts"],
    ["malformed case", true, "../../production"],
  ])(
    "keeps a %s native acceptance deep link off production bootstrap",
    async (label, enabled, caseId) => {
      mockPathname = "/native-acceptance/multi-plan";
      mockNativeContractsEnabled = enabled;
      mockNativeContractSuite = label === "wrong suite" ? "phase17" : "v1.2-acceptance";
      mockSearchParams = { case: caseId, fixture: "v12-synthetic-fixtures-r18" };

      await render(<RootLayout />);

      expect(screen.getByTestId("root-stack-screen-native-acceptance/[shard]"))
        .toBeOnTheScreen();
      expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
      expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
      expect(mockSqliteStorageConstructed).not.toHaveBeenCalled();
    },
  );

  it("keeps a disabled native-contract deep link off the production runtime", async () => {
    mockPathname = "/__native-contracts";
    mockNativeContractSuite = "phase2";

    await render(<RootLayout />);

    expect(screen.getByTestId("root-stack-screen-__native-contracts"))
      .toBeOnTheScreen();
    expect(screen.queryByTestId("workout-runtime-provider"))
      .not.toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
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

  it("renders visual reset without mounting any workout runtime", async () => {
    mockPathname = "/__phase20-visual-probe";
    mockNativeContractSuite = "v1.2-acceptance";
    mockSearchParams = {
      state: "BW-001",
      configuration: "AP-L-C390-P-F100",
      fixture: "v12-synthetic-fixtures-r18",
      nonce: "a".repeat(32),
      mode: "reset",
    };

    await render(<RootLayout />);

    expect(screen.getByTestId("root-stack-screen-__phase20-visual-probe"))
      .toBeOnTheScreen();
    expect(mockCreatePhase20VisualDependencies).not.toHaveBeenCalled();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
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

  it.each([
    ["Phase 6 gesture", "/__phase6-gesture-smoke"],
    ["Phase 12 cleanup", "/__phase12-google-cleanup"],
    ["Phase 12 Google auth", "/__phase12-google-auth-smoke"],
    ["Phase 18 Garmin proof", "/__phase18-garmin-proof"],
    ["Phase 18 Garmin adversarial", "/__phase18-garmin-adversarial"],
    ["Phase 20 quality", "/__phase20-quality-probe"],
    ["Phase 20 Garmin", "/__v12-production-garmin"],
  ])("keeps a disabled %s deep link off the production runtime", async (_label, pathname) => {
    mockPathname = pathname;
    mockBuildProfile = "production";
    mockNativeContractsEnabled = false;
    mockNativeContractSuite = null;

    await render(<RootLayout />);

    expect(screen.getByTestId(`root-stack-screen-${pathname.slice(1)}`))
      .toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
  });

  it("renders the loaded Garmin evidence route without a workout runtime", async () => {
    mockPathname = "/__v12-production-garmin";
    mockNativeContractSuite = "v1.2-acceptance";

    await render(<RootLayout />);

    expect(screen.getByTestId("root-stack-screen-__v12-production-garmin"))
      .toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
  });

  it("mounts validated Calendar evidence over a strict nonce-scoped runtime", async () => {
    mockPathname = "/calendar";
    mockNativeContractSuite = "v1.2-acceptance";
    mockSearchParams = {
      phase20CalendarFixture: "v12-calendar-isolated-facts-v1",
      phase20CalendarEvidenceNonce: "b".repeat(32),
      phase20CalendarRequirementsSha256: "a".repeat(64),
    };

    await render(<RootLayout />);

    const databaseName = `gym-tracker-phase20-calendar-${"b".repeat(32)}.db`;
    expect(mockCreatePhase20CalendarDependencies).toHaveBeenCalledWith(databaseName);
    expect(mockRuntimeProviderDependencies).toHaveBeenCalledWith({
      calendarFixture: databaseName,
    });
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
  });

  it("pairs the Recovery pathname with global identity while root local parameters are empty", async () => {
    mockPathname = "/__v12-production-recovery";
    mockNativeContractSuite = "v1.2-acceptance";
    mockSearchParams = {};
    mockGlobalSearchParams = {
      nonce: "b".repeat(32),
      caseId: "legacy-playback",
      stepId: "legacy-start",
      cutId: "pre-transaction",
      phase: "arm",
    };
    await render(<RootLayout />);
    expect(screen.getByTestId("root-stack-screen-__v12-production-recovery")).toBeOnTheScreen();
    expect(mockRuntimeProviderDependencies).toHaveBeenCalledWith({ recoveryFixture: `gym-tracker-phase20-recovery-shell-${"b".repeat(32)}.db` });
    expect(screen.queryByTestId("evidence-route-disabled")).not.toBeOnTheScreen();
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
  });

  it("rejects a malformed global Recovery identity instead of using stale local parameters", async () => {
    mockPathname = "/__v12-production-recovery";
    mockNativeContractSuite = "v1.2-acceptance";
    mockSearchParams = {
      nonce: "a".repeat(32), caseId: "legacy-playback", stepId: "legacy-start", cutId: "pre-transaction", phase: "arm",
    };
    mockGlobalSearchParams = { ...mockSearchParams, nonce: "invalid" };
    await render(<RootLayout />);
    expect(screen.getByTestId("evidence-route-disabled")).toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockCreateRecoveryDependencies).not.toHaveBeenCalled();
  });

  it("mounts a loaded Recovery v2 route over a strict nonce-scoped runtime", async () => {
    mockPathname = "/__v12-production-recovery";
    mockNativeContractSuite = "v1.2-acceptance";
    mockSearchParams = {
      nonce: "a".repeat(32),
      caseId: "queued-callback",
      stepId: "queued-set-commit",
      cutId: "post-commit-before-ack",
      phase: "arm",
    };

    await render(<RootLayout />);

    const databaseName = `gym-tracker-phase20-recovery-shell-${"a".repeat(32)}.db`;
    expect(screen.getByTestId("root-stack-screen-__v12-production-recovery"))
      .toBeOnTheScreen();
    expect(mockCreateRecoveryDependencies).toHaveBeenCalledWith(databaseName);
    expect(mockRuntimeProviderDependencies).toHaveBeenCalledWith({
      recoveryFixture: databaseName,
    });
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
  });

  it("observes only committed Recovery root entry and exit under a validated nonce", async () => {
    mockPathname = "/__v12-production-recovery";
    mockNativeContractSuite = "v1.2-acceptance";
    mockSearchParams = {
      nonce: "a".repeat(32), caseId: "legacy-playback", stepId: "legacy-start",
      cutId: "pre-transaction", phase: "arm", stage: "unknown-request-label",
    };
    const lines: string[] = [];
    jest.spyOn(console, "info").mockImplementation((line) => { lines.push(String(line)); });
    const rendered = await render(<RootLayout />);
    expect(lines.map((line) => JSON.parse(line.slice("GYM_TRACKER_V12_RECOVERY_ROUTE:".length))))
      .toEqual([{ schema_version: 1, nonce: "a".repeat(32), stage: "root-enter" }]);
    mockPathname = "/";
    mockSearchParams = {};
    await rendered.rerender(<RootLayout />);
    expect(lines.every((line) => line.startsWith("GYM_TRACKER_V12_RECOVERY_ROUTE:"))).toBe(true);
    expect(lines.map((line) => JSON.parse(line.slice("GYM_TRACKER_V12_RECOVERY_ROUTE:".length))))
      .toEqual([
        { schema_version: 1, nonce: "a".repeat(32), stage: "root-enter" },
        { schema_version: 1, nonce: "a".repeat(32), stage: "root-exit" },
      ]);
    expect(lines.join("\n")).not.toMatch(/unknown-request-label|caseId|stepId|databaseName|PROGRESS/u);
  });

  it.each(["profile", "hooks", "suite", "nonce", "nonce-array"])(
    "does not observe a disabled or malformed Recovery root identity: %s",
    async (variant) => {
      mockPathname = "/__v12-production-recovery";
      mockNativeContractSuite = "v1.2-acceptance";
      mockSearchParams = {
        nonce: "a".repeat(32), caseId: "legacy-playback", stepId: "legacy-start",
        cutId: "pre-transaction", phase: "arm",
      };
      if (variant === "profile") mockBuildProfile = "production";
      if (variant === "hooks") mockNativeContractsEnabled = false;
      if (variant === "suite") mockNativeContractSuite = "other-suite";
      if (variant === "nonce") mockSearchParams.nonce = "A".repeat(32);
      if (variant === "nonce-array") mockSearchParams.nonce = ["a".repeat(32)] as unknown as string;
      const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
      await render(<RootLayout />);
      expect(info).not.toHaveBeenCalled();
      expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    },
  );

  it("keeps Recovery root selection and exit unchanged when diagnostic logging throws", async () => {
    mockPathname = "/__v12-production-recovery";
    mockNativeContractSuite = "v1.2-acceptance";
    mockSearchParams = {
      nonce: "a".repeat(32), caseId: "legacy-playback", stepId: "legacy-start",
      cutId: "pre-transaction", phase: "arm",
    };
    jest.spyOn(console, "info").mockImplementation(() => { throw new Error("logger-failed"); });
    const rendered = await render(<RootLayout />);
    expect(screen.getByTestId("root-stack-screen-__v12-production-recovery")).toBeOnTheScreen();
    mockPathname = "/";
    mockSearchParams = {};
    await rendered.rerender(<RootLayout />);
    expect(screen.queryByTestId("root-stack-screen-__v12-production-recovery")).not.toBeOnTheScreen();
  });

  it.each([
    ["malformed", { nonce: "short" }, true],
    ["disabled", {}, false],
  ])("fails a %s Recovery v2 route closed before production bootstrap", async (_label, overrides, enabled) => {
    mockPathname = "/__v12-production-recovery";
    mockNativeContractSuite = "v1.2-acceptance";
    mockNativeContractsEnabled = enabled;
    mockSearchParams = {
      nonce: "a".repeat(32),
      caseId: "queued-callback",
      stepId: "queued-set-commit",
      cutId: "post-commit-before-ack",
      phase: "arm",
      ...overrides,
    };

    await render(<RootLayout />);

    expect(screen.getByTestId("evidence-route-disabled")).toBeOnTheScreen();
    expect(mockCreateRecoveryDependencies).not.toHaveBeenCalled();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
    expect(mockSqliteStorageConstructed).not.toHaveBeenCalled();
  });

  it("fails malformed Calendar evidence closed before any runtime mounts", async () => {
    mockPathname = "/calendar";
    mockNativeContractSuite = "v1.2-acceptance";
    mockSearchParams = {
      phase20CalendarFixture: "v12-calendar-isolated-facts-v1",
      phase20CalendarEvidenceNonce: "short",
      phase20CalendarRequirementsSha256: "a".repeat(64),
    };

    await render(<RootLayout />);

    expect(screen.getByTestId("evidence-route-disabled")).toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
  });

  it("keeps an ordinary Calendar route on the production runtime", async () => {
    mockPathname = "/calendar";
    mockNativeContractsEnabled = false;
    mockSearchParams = {};

    await render(<RootLayout />);

    expect(mockRuntimeProviderDependencies).toHaveBeenCalledWith({});
    expect(mockCreatePhase20CalendarDependencies).not.toHaveBeenCalled();
    expect(screen.getByTestId("startup-readiness-gate")).toBeOnTheScreen();
  });

  it.each([
    ["Visual", "/__phase20-visual-probe"],
    ["Quality", "/__phase20-quality-probe"],
    ["Garmin", "/__v12-production-garmin"],
  ])("fails the isolated %s route closed when bundled fonts fail", async (_label, pathname) => {
    mockPathname = pathname;
    mockNativeContractSuite = "v1.2-acceptance";
    mockFontsLoaded = false;
    mockFontError = new Error("isolated font load failed");

    await render(<RootLayout />);

    expect(screen.getByTestId("root-failure-font")).toBeOnTheScreen();
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

  it.each([
    {
      label: "Phase 20 visual",
      pathname: "/__phase20-visual-probe",
      params: {
        state: "BW-001",
        configuration: "AP-L-C390-P-F100",
        fixture: "v12-synthetic-fixtures-r18",
        nonce: "a".repeat(32),
        mode: "capture",
      },
    },
    { label: "Phase 20 quality", pathname: "/__phase20-quality-probe", params: {} },
    { label: "v1.2 native contracts", pathname: "/__native-contracts", params: {} },
    { label: "rollback archive", pathname: "/__v12-recovery-archive", params: { nonce: "a".repeat(32) } },
    { label: "Garmin bridge diagnostic", pathname: "/__garmin-bridge-diagnostic", params: { nonce: "a".repeat(32) } },
    { label: "Garmin sync diagnostic", pathname: "/__garmin-sync-diagnostic", params: { nonce: "a".repeat(32) } },
    { label: "Phase 20 Garmin", pathname: "/__v12-production-garmin", params: {} },
    { label: "Garmin evidence", pathname: "/__phase18-garmin-proof", params: {} },
  ])(
    "keeps the $label route off production preferences during cold font loading",
    async ({ pathname, params }) => {
      mockFontsLoaded = false;
      mockNativeContractSuite = "v1.2-acceptance";
      mockPathname = pathname;
      mockSearchParams = params;

      await render(<RootLayout />);

      expect(screen.getByTestId("app-loading-shell")).toBeOnTheScreen();
      expect(mockPreviewAppearanceRead).toHaveBeenCalledTimes(1);
      expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
      expect(mockSqliteStorageConstructed).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])("isolates the rollback archive route with native hooks enabled=%s", async (enabled) => {
    mockNativeContractsEnabled = enabled;
    mockNativeContractSuite = "v1.2-acceptance";
    mockPathname = "/__v12-recovery-archive";
    mockSearchParams = { nonce: "a".repeat(32) };
    await render(<RootLayout />);
    expect(screen.getByTestId("root-stack-screen-__v12-recovery-archive")).toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
    expect(mockSqliteStorageConstructed).not.toHaveBeenCalled();
  });

  it("fails closed before rollback runtime construction when fonts fail", async () => {
    mockPathname = "/__v12-recovery-archive";
    mockSearchParams = { nonce: "a".repeat(32) };
    mockNativeContractSuite = "v1.2-acceptance";
    mockFontsLoaded = false;
    mockFontError = new Error("synthetic_font_failure");
    await render(<RootLayout />);
    expect(screen.getByTestId("root-failure-font")).toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
    expect(mockSqliteStorageConstructed).not.toHaveBeenCalled();
  });

  it("keeps a disabled preview deep link off the production runtime", async () => {
    mockNativeContractsEnabled = false;

    await render(<RootLayout />);

    expect(screen.getByTestId("root-stack-screen-__phase2-attended-preview"))
      .toBeOnTheScreen();
    expect(screen.queryByTestId("workout-runtime-provider"))
      .not.toBeOnTheScreen();
    expect(mockRuntimeProviderMounted).not.toHaveBeenCalled();
    expect(mockProductionAppearanceRead).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", {
      name: "Set dark appearance",
    }));
    expect(mockPreviewAppearanceWrite).toHaveBeenCalledWith("Dark");
    expect(mockProductionAppearanceWrite).not.toHaveBeenCalled();
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

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React, { act } from "react";

import { AppearanceProvider, createMemoryAppearanceStore } from "../../src/ui/theme";
import Phase18GarminAcceptanceScreen from "../__phase18-garmin-acceptance";

let mockRenderProbe: ((kind: "route" | "laps") => Promise<unknown>) | undefined;
const mockConfirmGarminImport = jest.fn();
const mockRunBoundedSync = jest.fn(async () => ({ kind: "success" }));
const mockUseWorkoutAppRuntime = jest.fn(() => ({
  garminImport: {
    confirmGarminImport: mockConfirmGarminImport,
  },
}));
let mockBenchmarkSignal: AbortSignal | undefined;
const mockRunTemporaryDatabase = jest.fn(async (input: Readonly<{
  signal?: AbortSignal;
  run(session: Readonly<{
    databaseName: string;
    runBoundedSync: typeof mockRunBoundedSync;
  }>): Promise<unknown>;
}>) => {
  mockBenchmarkSignal = input.signal;
  return input.run({
    databaseName: "gym-tracker-phase18-garmin-benchmark-test.db",
    runBoundedSync: mockRunBoundedSync,
  });
});

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        buildProfile: "development-test",
        nativeContractsEnabled: true,
        nativeContractSuite: "v1.2-acceptance",
      },
    },
  },
}));

jest.mock("expo-router", () => ({
  Redirect: ({ href }: Readonly<{ href: string }>) => {
    const { View } = require("react-native") as typeof import("react-native");
    return <View testID={`redirect-${href.replaceAll("/", "_")}`} />;
  },
  useLocalSearchParams: () => ({
    confirmation: "VERIFY-PHASE18-GARMIN-ACCEPTANCE",
    mode: "benchmark",
    nonce: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  }),
}));

jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => mockUseWorkoutAppRuntime(),
}));

jest.mock("../../src/bootstrap/phase18GarminBenchmarkRuntime", () => ({
  createPhase18GarminBenchmarkBoundedSync: jest.fn(() => mockRunBoundedSync),
  withPhase18GarminBenchmarkTemporaryDatabase: (input: Parameters<
    typeof mockRunTemporaryDatabase
  >[0]) => mockRunTemporaryDatabase(input),
}));

jest.mock("../../src/testing/phase18GarminAcceptance", () => {
  const actual = jest.requireActual<typeof import("../../src/testing/phase18GarminAcceptance")>(
    "../../src/testing/phase18GarminAcceptance",
  );
  return {
    ...actual,
    createPhase18GarminBenchmarkBoundedSync: jest.fn(() => jest.fn()),
    createInstalledPhase18GarminBenchmarkMeasurementPort: jest.fn((input: Readonly<{
      renderProbe: (kind: "route" | "laps") => Promise<unknown>;
    }>) => {
      mockRenderProbe = input.renderProbe;
      return { kind: "installed-observation-port" };
    }),
    createPhase18GarminBenchmarkMarkerReport: jest.fn(() => new Promise(() => undefined)),
  };
});

describe("Phase 18 Garmin benchmark route", () => {
  beforeEach(() => {
    mockRenderProbe = undefined;
    mockBenchmarkSignal = undefined;
    mockRunTemporaryDatabase.mockClear();
    mockUseWorkoutAppRuntime.mockClear();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  it("measures production activity route and lap-table layouts", async () => {
    await render(
      <AppearanceProvider store={createMemoryAppearanceStore()}>
        <Phase18GarminAcceptanceScreen />
      </AppearanceProvider>,
    );

    await waitFor(() => {
      expect(mockRenderProbe).toBeDefined();
    });
    expect(mockUseWorkoutAppRuntime).not.toHaveBeenCalled();
    expect(mockRunTemporaryDatabase).toHaveBeenCalledTimes(1);
    expect(mockBenchmarkSignal?.aborted).toBe(false);
    let routeProbe!: Promise<unknown>;
    act(() => {
      routeProbe = mockRenderProbe!("route");
    });
    expect(await screen.findByTestId("activity-detail-route", {
      includeHiddenElements: true,
    })).toBeOnTheScreen();
    fireEvent(screen.getByTestId("phase18-benchmark-layout-probe"), "layout", {
      nativeEvent: { layout: { height: 800, width: 400, x: 0, y: 0 } },
    });
    await routeProbe;

    let lapProbe!: Promise<unknown>;
    act(() => {
      lapProbe = mockRenderProbe!("laps");
    });
    expect(await screen.findByTestId("activity-detail-lap-row-9")).toBeOnTheScreen();
    expect(screen.getByRole("columnheader", { name: "Lap" })).toBeOnTheScreen();
    fireEvent(screen.getByTestId("phase18-benchmark-layout-probe"), "layout", {
      nativeEvent: { layout: { height: 800, width: 400, x: 0, y: 0 } },
    });
    await lapProbe;
  });
});

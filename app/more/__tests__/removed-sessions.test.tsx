import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type {
  HistoryLifecycleResult,
  RemovedHistorySession,
} from "../../../src/domains/history";
import {
  parseHistoryLocalDate,
} from "../../../src/domains/history";

import {
  AppearanceProvider,
} from "../../../src/ui/theme";

const mockBack = jest.fn();
const mockListRemovedHistorySessions = jest.fn<
  () => Promise<readonly RemovedHistorySession[]>
>(async () => []);
const mockRefresh = jest.fn<() => Promise<void>>(async () => undefined);
const mockRestoreHistorySession = jest.fn<
  () => Promise<HistoryLifecycleResult>
>(async () => ({
  effectiveRevision: 4,
  lifecycle: "active" as const,
}));

const removedSession: RemovedHistorySession = {
  id: "removed-session",
  sourceLabel: "Manual visit",
  planName: "Full Body Foundation",
  dayName: "Full Body A",
  localDate: parseHistoryLocalDate("2026-08-25"),
  timezone: "Asia/Singapore",
  effectiveRevision: 3,
  removedAtMs: 1_724_429_170_000,
  workingSetProgress: { completed: 2, planned: 3, percent: 67 },
};

jest.mock("expo-router", () => ({
  router: { back: () => mockBack() },
}));

jest.mock("../../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    listRemovedHistorySessions: mockListRemovedHistorySessions,
    refresh: mockRefresh,
    restoreHistorySession: mockRestoreHistorySession,
  }),
}));

import RemovedSessionsRoute from "../removed-sessions";
import { ProductionToastBoundary } from "../../_layout";

async function renderProductionRoute() {
  return render(
    <SafeAreaProvider initialMetrics={{
      frame: { height: 844, width: 390, x: 0, y: 0 },
      insets: { bottom: 16, left: 0, right: 0, top: 24 },
    }}>
      <AppearanceProvider>
        <ProductionToastBoundary>
          <RemovedSessionsRoute />
        </ProductionToastBoundary>
      </AppearanceProvider>
    </SafeAreaProvider>,
  );
}

describe("RemovedSessionsRoute", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockListRemovedHistorySessions.mockReset();
    mockListRemovedHistorySessions.mockResolvedValue([]);
    mockRefresh.mockReset();
    mockRefresh.mockResolvedValue(undefined);
    mockRestoreHistorySession.mockReset();
    mockRestoreHistorySession.mockResolvedValue({
      effectiveRevision: 4,
      lifecycle: "active",
    });
  });

  it("reaches loading and empty through the production toast boundary", async () => {
    let resolveLoad: ((sessions: readonly RemovedHistorySession[]) => void) | undefined;
    mockListRemovedHistorySessions.mockImplementationOnce(() =>
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );

    await renderProductionRoute();

    expect(screen.getByRole("progressbar", { name: "Loading removed sessions" }))
      .toBeOnTheScreen();
    resolveLoad?.([]);
    expect(await screen.findByText("No removed sessions")).toBeOnTheScreen();
    expect(screen.getAllByTestId("semantic-toast-host")).toHaveLength(1);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("announces restore success only after command, runtime refresh, and authoritative reload", async () => {
    const order: string[] = [];
    let resolveRestore: ((result: HistoryLifecycleResult) => void) | undefined;
    let resolveRefresh: (() => void) | undefined;
    let resolveReload: ((sessions: readonly RemovedHistorySession[]) => void) | undefined;
    mockListRemovedHistorySessions.mockImplementationOnce(async () => {
      order.push("initial-load");
      return [removedSession];
    }).mockImplementationOnce(() => new Promise((resolve) => {
      order.push("authoritative-reload");
      resolveReload = resolve;
    }));
    mockRestoreHistorySession.mockImplementationOnce(() => new Promise((resolve) => {
      order.push("restore-command");
      resolveRestore = resolve;
    }));
    mockRefresh.mockImplementationOnce(() => new Promise<void>((resolve) => {
      order.push("runtime-refresh");
      resolveRefresh = resolve;
    }));

    await renderProductionRoute();
    await screen.findByText("Full Body Foundation · Full Body A");

    await fireEvent.press(screen.getByRole("button", {
      name: "Restore Full Body Foundation · Full Body A",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Restore workout" }));
    expect(order).toEqual(["initial-load", "restore-command"]);
    expect(screen.queryByText("Workout restored")).toBeNull();

    resolveRestore?.({ effectiveRevision: 4, lifecycle: "active" });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["initial-load", "restore-command", "runtime-refresh"]);
    expect(screen.queryByText("Workout restored")).toBeNull();

    resolveRefresh?.();
    await waitFor(() => expect(mockListRemovedHistorySessions).toHaveBeenCalledTimes(2));
    expect(order).toEqual([
      "initial-load",
      "restore-command",
      "runtime-refresh",
      "authoritative-reload",
    ]);
    expect(screen.queryByText("Workout restored")).toBeNull();

    resolveReload?.([]);
    expect(await screen.findByText("Workout restored")).toBeOnTheScreen();
    expect(screen.getByText("No removed sessions")).toBeOnTheScreen();
  });
});

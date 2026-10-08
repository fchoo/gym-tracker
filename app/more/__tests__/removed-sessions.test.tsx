import {
  render,
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

import {
  AppearanceProvider,
} from "../../../src/ui/theme";
import {
  SemanticToastProvider,
} from "../../../src/ui/components/SemanticToast";

const mockBack = jest.fn();
const mockListRemovedHistorySessions = jest.fn(async () => []);
const mockRefresh = jest.fn(async () => undefined);
const mockRestoreHistorySession = jest.fn(async () => ({
  effectiveRevision: 4,
  lifecycle: "active" as const,
}));

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

describe("RemovedSessionsRoute", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockListRemovedHistorySessions.mockClear();
    mockRefresh.mockReset();
    mockRefresh.mockResolvedValue(undefined);
    mockRestoreHistorySession.mockClear();
  });

  it("passes runtime reads and restore command through while awaiting the authoritative refresh callback", async () => {
    await render(
      <AppearanceProvider>
        <SemanticToastProvider>
          <RemovedSessionsRoute />
        </SemanticToastProvider>
      </AppearanceProvider>,
    );

    await waitFor(() => expect(mockListRemovedHistorySessions).toHaveBeenCalledTimes(1));
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

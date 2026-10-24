import { act, cleanup, render, screen, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import V12ProductionRecoveryRoute from "../__v12-production-recovery";
import { V12RecoveryRootContext } from "../../src/testing/v12RecoveryRootContext";

let mockProfile = "development-test";
let mockParams: Record<string, string>;
const mockRun = jest.fn<typeof import("../../src/testing/v12ProductionRecovery")["collectV12ProductionRecoveryPhase"]>();

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: { package: "com.fchoo.gymtracker.devtest" },
      extra: {
        get buildProfile() { return mockProfile; },
        nativeContractsEnabled: true,
        nativeContractSuite: "v1.2-acceptance",
      },
    },
  },
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  Redirect: () => {
    const { View } = require("react-native") as typeof import("react-native");
    return <View testID="recovery-route-disabled" />;
  },
}));

jest.mock("../../src/testing/v12ProductionRecovery", () => {
  const actual = jest.requireActual<typeof import("../../src/testing/v12ProductionRecovery")>(
    "../../src/testing/v12ProductionRecovery",
  );
  return {
    ...actual,
    collectV12ProductionRecoveryPhase: (...args: Parameters<typeof actual.collectV12ProductionRecoveryPhase>) => mockRun(...args),
  };
});

describe("V12ProductionRecoveryRoute", () => {
  async function renderScopedRoute() {
    return render(<V12RecoveryRootContext.Provider value={{ databaseName: `gym-tracker-phase20-recovery-shell-${mockParams.nonce}.db` }}><V12ProductionRecoveryRoute /></V12RecoveryRootContext.Provider>);
  }
  beforeEach(() => {
    mockProfile = "development-test";
    mockParams = {
      nonce: "a".repeat(32),
      caseId: "queued-callback",
      stepId: "queued-set-commit",
      cutId: "post-commit-before-ack",
      phase: "arm",
    };
    mockRun.mockReset();
    mockRun.mockResolvedValue("armed");
  });

  afterEach(() => cleanup());

  it("waits for the validated root scope before starting native Recovery", async () => {
    const rendered = await render(<V12ProductionRecoveryRoute />);
    expect(mockRun).not.toHaveBeenCalled();
    expect(screen.getByText("Preparing recovery route")).toBeOnTheScreen();
    await rendered.rerender(<V12RecoveryRootContext.Provider value={{ databaseName: `gym-tracker-phase20-recovery-shell-${mockParams.nonce}.db` }}><V12ProductionRecoveryRoute /></V12RecoveryRootContext.Provider>);
    await waitFor(() => expect(mockRun).toHaveBeenCalledTimes(1));
  });

  it("does not borrow a different nonce's root scope", async () => {
    await render(<V12RecoveryRootContext.Provider value={{ databaseName: `gym-tracker-phase20-recovery-shell-${"b".repeat(32)}.db` }}><V12ProductionRecoveryRoute /></V12RecoveryRootContext.Provider>);
    expect(mockRun).not.toHaveBeenCalled();
    expect(screen.getByText("Preparing recovery route")).toBeOnTheScreen();
  });

  it("executes the arm phase and exposes a concrete kill point", async () => {
    await renderScopedRoute();

    await waitFor(() => expect(screen.getByText("Recovery cut armed")).toBeOnTheScreen());
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({
      phase: "arm",
      identity: expect.objectContaining({
        caseId: "queued-callback",
        stepId: "queued-set-commit",
        cutId: "post-commit-before-ack",
      }),
    }));
  });

  it("executes recovery only after relaunch and exposes completion", async () => {
    mockParams.phase = "recover";
    mockRun.mockResolvedValue("observed");

    await renderScopedRoute();

    await waitFor(() => expect(screen.getByText("Recovery observation complete")).toBeOnTheScreen());
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ phase: "recover" }));
  });

  it("cannot render or execute under the production identity", async () => {
    mockProfile = "production";
    const rendered = await renderScopedRoute();

    expect(rendered.getByTestId("recovery-route-disabled")).toBeOnTheScreen();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it.each(["setup", "command", "barrier", "validation", "delete"])(
    "emits one terminal error only after arm %s failure cleanup settles",
    async (stage) => {
      mockParams.phase = "arm";
      let rejectAfterCleanup: ((error: Error) => void) | undefined;
      mockRun.mockImplementation(() => new Promise((_, reject) => {
        rejectAfterCleanup = reject;
      }));
      const terminal: string[] = [];
      const info = jest.spyOn(console, "info").mockImplementation((line) => {
        if (String(line).startsWith("GYM_TRACKER_V12_DOMAIN_RESULT:")) {
          terminal.push(String(line));
        }
      });

      try {
        await renderScopedRoute();
        expect(terminal).toEqual([]);
        await act(async () => rejectAfterCleanup?.(new Error(`${stage}_failed`)));
        await waitFor(() => expect(screen.getByText("Recovery observation failed")).toBeOnTheScreen());
        expect(terminal).toHaveLength(1);
        expect(JSON.parse(terminal[0]!.slice("GYM_TRACKER_V12_DOMAIN_RESULT:".length)))
          .toEqual({
            schema_version: 2,
            nonce: mockParams.nonce,
            kind: "error",
            code: "domain_failed",
          });
      } finally {
        info.mockRestore();
      }
    },
  );
});

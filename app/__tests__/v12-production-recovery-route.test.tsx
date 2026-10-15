import { cleanup, render, screen, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import V12ProductionRecoveryRoute from "../__v12-production-recovery";

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
  beforeEach(() => {
    mockProfile = "development-test";
    mockParams = {
      nonce: "a".repeat(32),
      caseId: "queued-callback",
      cutId: "post-commit-before-ack",
      phase: "arm",
    };
    mockRun.mockReset();
    mockRun.mockResolvedValue("armed");
  });

  afterEach(() => cleanup());

  it("executes the arm phase and exposes a concrete kill point", async () => {
    await render(<V12ProductionRecoveryRoute />);

    await waitFor(() => expect(screen.getByText("Recovery cut armed")).toBeOnTheScreen());
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({
      phase: "arm",
      identity: expect.objectContaining({
        caseId: "queued-callback",
        cutId: "post-commit-before-ack",
      }),
    }));
  });

  it("executes recovery only after relaunch and exposes completion", async () => {
    mockParams.phase = "recover";
    mockRun.mockResolvedValue("observed");

    await render(<V12ProductionRecoveryRoute />);

    await waitFor(() => expect(screen.getByText("Recovery observation complete")).toBeOnTheScreen());
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ phase: "recover" }));
  });

  it("cannot render or execute under the production identity", async () => {
    mockProfile = "production";
    const rendered = await render(<V12ProductionRecoveryRoute />);

    expect(rendered.getByTestId("recovery-route-disabled")).toBeOnTheScreen();
    expect(mockRun).not.toHaveBeenCalled();
  });
});

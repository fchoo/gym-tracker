import { render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

const mockNonce = "a".repeat(32);

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
  Redirect: () => null,
  useLocalSearchParams: () => ({
    configuration: "AP-L-C390-P-F100",
    fixture: "v12-synthetic-fixtures-r18",
    mode: "reset",
    nonce: mockNonce,
    state: "BW-001",
  }),
}));

jest.mock("../../src/testing/phase20VisualFixtureRuntime", () => ({
  clearPhase20VisualCleanupStatus: jest.fn(),
  phase20VisualCleanupStatus: () => "complete",
}));

import Phase20VisualProbeRoute from "../__phase20-visual-probe";

describe("Phase 20 visual reset route isolation", () => {
  it("renders reset without a WorkoutAppRuntimeProvider", async () => {
    await render(<Phase20VisualProbeRoute />);

    expect(screen.getByTestId("phase20-visual-reset")).toBeOnTheScreen();
  });
});

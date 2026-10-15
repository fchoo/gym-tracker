import { render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import Phase20QualityProbeRoute from "../__phase20-quality-probe";

let mockExtra: Record<string, unknown>;
let mockParams: Record<string, unknown>;
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { get extra() { return mockExtra; } } } }));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  Redirect: () => { const { View } = require("react-native") as typeof import("react-native"); return <View testID="quality-probe-disabled" />; },
}));

describe("Phase 20 quality probe route", () => {
  beforeEach(() => {
    mockExtra = { buildProfile: "development-test", nativeContractsEnabled: true, nativeContractSuite: "v1.2-acceptance" };
    mockParams = {
      nonce: "a".repeat(48),
      action: "accessibility",
      operation: "accessibility-workout-normal",
      sequence: "1",
    };
  });
  it("renders real semantic controls only under the exact acceptance gate", async () => {
    const rendered = await render(<Phase20QualityProbeRoute />);
    expect(rendered.getByTestId("phase20-quality-probe")).toBeOnTheScreen();
    expect(rendered.getByTestId("phase20-quality-root-workout")).toBeOnTheScreen();
  });
  it("does not expose a production or malformed-request substitute", async () => {
    mockExtra.buildProfile = "production";
    const production = await render(<Phase20QualityProbeRoute />);
    expect(production.getByTestId("quality-probe-disabled")).toBeOnTheScreen();
    mockExtra = { buildProfile: "development-test", nativeContractsEnabled: true, nativeContractSuite: "v1.2-acceptance" };
    mockParams.nonce = "private";
    const malformed = await render(<Phase20QualityProbeRoute />);
    expect(malformed.getByTestId("quality-probe-disabled")).toBeOnTheScreen();
  });
});

import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import Phase20VisualProbeRoute from "../__phase20-visual-probe";

let mockExtra: Record<string, unknown>;
let mockParams: Record<string, unknown>;
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { get extra() { return mockExtra; } } },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  Redirect: () => {
    const { View } = require("react-native") as typeof import("react-native");
    return <View testID="visual-probe-disabled" />;
  },
}));

describe("Phase 20 visual probe", () => {
  beforeEach(() => {
    mockExtra = { buildProfile: "development-test", nativeContractsEnabled: true, nativeContractSuite: "v1.2-acceptance" };
    mockParams = { state: "BW-054", configuration: "AP-L-C390-P-F100", fixture: "v12-synthetic-fixtures-r18", nonce: "a".repeat(32), mode: "capture" };
  });
  it("renders the production chooser with unselected real controls", async () => {
    await render(<Phase20VisualProbeRoute />);
    expect(screen.getByTestId("plan-type-chooser")).toBeOnTheScreen();
    expect(screen.getByText("What are you training for?")).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Strength" }).props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByRole("radio", { name: "Running" }).props.accessibilityState).toEqual({ selected: false });
    await fireEvent.press(screen.getByRole("radio", { name: "Running" }));
    // Any interaction invalidates the receipt; the host cannot capture a stale
    // chooser receipt after a navigation-only control was activated.
    expect(screen.getByTestId("phase20-visual-invalidated")).toBeOnTheScreen();
  });
  for (const [key, value] of [["buildProfile", "production"], ["nativeContractsEnabled", false], ["nativeContractSuite", "phase14"]] as const) {
    it(`requires the exact ${key} gate`, async () => {
      mockExtra[key] = value;
      await render(<Phase20VisualProbeRoute />);
      expect(screen.getByTestId("visual-probe-disabled")).toBeOnTheScreen();
    });
  }
  for (const [key, value] of [["state", "BW-002"], ["configuration", "AP-L-INVALID"], ["nonce", "private"], ["fixture", "personal"], ["mode", "arbitrary"]]) {
    it(`refuses an invalid ${key} without rendering a substitute screen`, async () => {
      mockParams[key] = value;
      await render(<Phase20VisualProbeRoute />);
      expect(screen.getByTestId("visual-probe-disabled")).toBeOnTheScreen();
    });
  }
  it("reset unmounts the source screen and resets the isolated appearance store", async () => {
    mockParams.mode = "reset";
    await render(<Phase20VisualProbeRoute />);
    expect(screen.queryByTestId("plan-type-chooser")).toBeNull();
    expect(screen.getByTestId("phase20-visual-reset")).toBeOnTheScreen();
  });
});

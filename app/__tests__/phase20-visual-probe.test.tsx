import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { Dimensions } from "react-native";

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
    expect(screen.getByRole("radio", { name: "Strength" }).props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByRole("radio", { name: "Running" }).props.accessibilityState).toMatchObject({ selected: false });
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
  for (const [key, value] of [["state", "BW-002"], ["configuration", "AP-L-INVALID"], ["nonce", "private"], ["fixture", "personal"], ["mode", "arbitrary"]] as const) {
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
  it("emits actual native dimensions and provider readback, never configuration-derived measurements", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await render(<Phase20VisualProbeRoute />);
      await fireEvent(screen.getByTestId("phase20-visual-capture"), "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
      });
      await waitFor(() => expect(log).toHaveBeenCalled());
      const line = String(log.mock.calls.at(-1)?.[0]);
      expect(line.startsWith("PHASE20_VISUAL_RESULT ")).toBe(true);
      const marker = JSON.parse(line.slice("PHASE20_VISUAL_RESULT ".length)) as Record<string, unknown>;
      expect(marker.screen_width_dp).toBe(Dimensions.get("screen").width);
      expect(marker.width_dp).toBe(Dimensions.get("window").width);
      expect(marker.density).toBe(Dimensions.get("window").scale);
      expect(marker.font_scale).toBe(Dimensions.get("window").fontScale);
      expect(marker.appearance).toBe("Light");
      expect(marker.color_scheme).toBe("light");
      expect(marker.nonce).toBe(mockParams.nonce);
      expect(marker.status).toBe("ready");
    } finally { log.mockRestore(); }
  });
});

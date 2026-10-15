import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { Dimensions } from "react-native";

import Phase20VisualProbeRoute from "../__phase20-visual-probe";
import { phase20VisualTimerReceipt } from "../../src/testing/phase20VisualProbe";

let mockExtra: Record<string, unknown>;
let mockParams: Record<string, unknown>;
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { get extra() { return mockExtra; } } },
}));
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: jest.fn(),
  useRouter: () => ({ push: jest.fn() }),
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  Redirect: () => {
    const { View } = require("react-native") as typeof import("react-native");
    return <View testID="visual-probe-disabled" />;
  },
}));
jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({ launchState: "trusted", runningPlanRuntime: {}, getActiveWorkout: jest.fn() }),
}));
jest.mock("../../src/testing/phase20VisualFixtureRuntime", () => ({
  phase20VisualCleanupStatus: () => "complete",
  clearPhase20VisualCleanupStatus: jest.fn(),
}));

describe("Phase 20 visual probe", () => {
  beforeEach(() => {
    mockExtra = { buildProfile: "development-test", nativeContractsEnabled: true, nativeContractSuite: "v1.2-acceptance" };
    mockParams = { state: "BW-054", configuration: "AP-L-C390-P-F100", fixture: "v12-synthetic-fixtures-r18", nonce: "a".repeat(32), ready: "a".repeat(32), mode: "capture" };
  });
  it("renders the production chooser route with unselected real controls", async () => {
    await render(<Phase20VisualProbeRoute />);
    expect(screen.getByTestId("plan-type-chooser")).toBeOnTheScreen();
    expect(screen.getByText("What are you training for?")).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Strength" }).props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByRole("radio", { name: "Running" }).props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByTestId("phase20-visual-capture")).toBeOnTheScreen();
  });
  for (const [key, value] of [["buildProfile", "production"], ["nativeContractsEnabled", false], ["nativeContractSuite", "phase14"]] as const) {
    it(`requires the exact ${key} gate`, async () => {
      mockExtra[key] = value;
      await render(<Phase20VisualProbeRoute />);
      expect(screen.getByTestId("visual-probe-disabled")).toBeOnTheScreen();
    });
  }
  for (const [key, value] of [["state", "BW-000"], ["configuration", "AP-L-INVALID"], ["nonce", "private"], ["fixture", "personal"], ["mode", "arbitrary"]] as const) {
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
  it("emits only after the host acknowledges the visible production state with the same nonce", async () => {
    delete mockParams.ready;
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const view = await render(<Phase20VisualProbeRoute />);
      await fireEvent(screen.getByTestId("phase20-visual-capture"), "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
      });
      await fireEvent.scroll(screen.getByTestId("plan-type-chooser-scroll"), {
        nativeEvent: { contentOffset: { x: 0, y: 144 } },
      });
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(log).not.toHaveBeenCalled();

      mockParams.ready = "b".repeat(32);
      await view.rerender(<Phase20VisualProbeRoute />);
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(log).not.toHaveBeenCalled();

      mockParams.ready = mockParams.nonce;
      await view.rerender(<Phase20VisualProbeRoute />);
      await waitFor(() => expect(log).toHaveBeenCalledTimes(1));
    } finally { log.mockRestore(); }
  });
  it("emits actual native dimensions and provider readback, never configuration-derived measurements", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await render(<Phase20VisualProbeRoute />);
      await fireEvent(screen.getByTestId("phase20-visual-capture"), "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
      });
      await fireEvent.scroll(screen.getByTestId("plan-type-chooser-scroll"), {
        nativeEvent: { contentOffset: { x: 0, y: 144 } },
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
      expect(marker.source_route).toBe("/library/plan/create");
      expect(marker.source_component).toBe("PlanTypeChooserScreen");
      expect(marker.fixture_seed).toBe("phase20-library-running");
      expect(marker.scenario).toBe("plan-type-chooser");
      expect(marker.readiness_semantics).toEqual([
        "What are you training for?",
        "Running",
        "Distance and time goal, benchmark, and structured weekly sessions.",
        "Garmin connection is optional after a Running plan is created. Imported activities never create or activate a plan automatically.",
      ]);
      expect(marker.readiness_test_ids).toContain("phase20-visual-state-BW-054");
      expect(Array.isArray(marker.readiness_actions) ? marker.readiness_actions.length : 0).toBeGreaterThan(1);
      expect(marker.readiness_non_color).toContain("Active Plans");
      expect(marker.evidence_scope).toBe("production_screen");
      expect(marker.source_receipt).toMatchObject({
        schema_version: 2,
        nonce: mockParams.nonce,
        state_id: mockParams.state,
        timer: null,
        scroll_offsets: [{ native_id: "plan-type-chooser-scroll", x: 0, y: 144 }],
      });
      expect((marker.source_receipt as { production_instance_id: string }).production_instance_id).toMatch(/^phase20-production-instance-/u);
      expect((marker.source_receipt as { mount_id: string }).mount_id).toMatch(/^phase20-production-mount-/u);
    } finally { log.mockRestore(); }
  });

  it("copies authoritative rest revision, remaining and endsAt values into the source receipt", () => {
    expect(phase20VisualTimerReceipt({ version: 1, state: "running", revision: 7, startedAtMs: 1, endsAtMs: 120_000, nextSetId: "set-2" })).toEqual({
      state: "running", revision: 7, remaining_ms: null, ends_at_ms: 120_000,
    });
    expect(phase20VisualTimerReceipt({ version: 1, state: "paused", revision: 8, remainingMs: 45_000, nextSetId: "set-2" })).toEqual({
      state: "paused", revision: 8, remaining_ms: 45_000, ends_at_ms: null,
    });
  });
});

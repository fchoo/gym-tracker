import {
  act,
  fireEvent,
  render,
  screen,
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
  Dimensions,
} from "react-native";

import type {
  AdvancedTimingConfigV1,
} from "../../domains/advancedTiming";
import {
  AdvancedTimingConfigSheet,
  advancedTimingConfigSummary,
} from "../components/AdvancedTimingConfigSheet";
import {
  AppearanceProvider,
  createMemoryAppearanceStore,
  themes,
} from "../theme";

async function renderSheet(
  overrides: Partial<React.ComponentProps<typeof AdvancedTimingConfigSheet>> = {},
  appearance: "System" | "Light" | "Dark" = "System",
  reduceMotion = false,
) {
  const onCancel = jest.fn();
  const onSave = jest.fn();
  const store = createMemoryAppearanceStore(
    appearance === "System" ? null : appearance,
  );
  const rendered = await render(
    <AppearanceProvider reduceMotion={reduceMotion} store={store}>
      <AdvancedTimingConfigSheet
        initialValue={null}
        onCancel={onCancel}
        onSave={onSave}
        scope="exercise"
        visible
        {...overrides}
      />
    </AppearanceProvider>,
  );
  return { onCancel, onSave, rendered };
}

async function setWindowDimensions(
  width: number,
  height: number,
  fontScale = 1,
) {
  await act(() => {
    Dimensions.set({
      screen: { fontScale, height, scale: 1, width },
      window: { fontScale, height, scale: 1, width },
    });
  });
}

describe("advancedTimingConfigSummary", () => {
  it("summarizes each scope and mode without dereferencing null", () => {
    expect(advancedTimingConfigSummary(null, "exercise")).toBe("Off");
    expect(advancedTimingConfigSummary(null, "set"))
      .toBe("Inherits exercise timing");
    expect(advancedTimingConfigSummary(undefined, "exercise")).toBe("Off");
    expect(
      advancedTimingConfigSummary({ version: 1, mode: "off" }, "exercise"),
    ).toBe("Off");
    expect(advancedTimingConfigSummary({
      version: 1,
      mode: "per_rep",
      intervalMs: 3_000,
      cueChannels: "haptic",
    }, "exercise")).toBe("Per-rep every 3 sec · haptic");
    expect(advancedTimingConfigSummary({
      version: 1,
      mode: "cluster",
      groupSizes: [3, 3, 3],
      intraRestMs: 20_000,
      cueChannels: "both",
    }, "set")).toBe("Cluster 3+3+3 · 20 sec · both");
  });
});

describe("AdvancedTimingConfigSheet", () => {
  beforeEach(async () => {
    await setWindowDimensions(800, 900);
  });

  it("offers only Off/Per-rep/Cluster at exercise scope with accessible selected state", async () => {
    await renderSheet({ scope: "exercise" });

    expect(screen.queryByRole("button", { name: "Inherit timing" }))
      .toBeNull();
    const off = screen.getByRole("button", { name: "Off timing" });
    expect(off).toHaveProp("accessibilityState",
      expect.objectContaining({ selected: true }));
    expect(screen.getByRole("button", { name: "Per-rep timing" }))
      .toHaveProp("accessibilityState",
        expect.objectContaining({ selected: false }));
    expect(screen.getByRole("button", { name: "Cluster timing" }))
      .toBeOnTheScreen();
  });

  it("adds an Inherit option selected by default at set scope", async () => {
    await renderSheet({ scope: "set" });

    expect(screen.getByRole("button", { name: "Inherit timing" }))
      .toHaveProp("accessibilityState",
        expect.objectContaining({ selected: true }));
    expect(screen.getByRole("button", { name: "Off timing" }))
      .toHaveProp("accessibilityState",
        expect.objectContaining({ selected: false }));
  });

  it("keeps mode and channel controls at a >=48dp target", async () => {
    await renderSheet({ scope: "set" });

    expect(screen.getByTestId("advanced-timing-mode-per_rep"))
      .toHaveStyle({ minHeight: 48, minWidth: 48 });

    await fireEvent.press(screen.getByRole("button", { name: "Per-rep timing" }));

    expect(screen.getByTestId("advanced-timing-channel-both"))
      .toHaveStyle({ minHeight: 48, minWidth: 48 });
  });

  it("saves an off config from exercise scope", async () => {
    const { onSave } = await renderSheet({ scope: "exercise" });

    await fireEvent.press(screen.getByRole("button", { name: "Save timing" }));

    expect(onSave).toHaveBeenCalledWith({ version: 1, mode: "off" });
  });

  it("saves null when set scope inherits exercise timing", async () => {
    const { onSave } = await renderSheet({ scope: "set" });

    await fireEvent.press(screen.getByRole("button", { name: "Save timing" }));

    expect(onSave).toHaveBeenCalledWith(null);
  });

  it("canonicalizes a per-rep interval and cue channel before saving", async () => {
    const { onSave } = await renderSheet({ scope: "exercise" });

    await fireEvent.press(screen.getByRole("button", { name: "Per-rep timing" }));
    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId("advanced-timing-config-interval"),
        "4",
      );
    });
    await fireEvent.press(screen.getByRole("button", { name: "audio cues" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save timing" }));

    expect(onSave).toHaveBeenCalledWith({
      version: 1,
      mode: "per_rep",
      intervalMs: 4_000,
      cueChannels: "audio",
    });
  });

  it("canonicalizes a 3+3+3 cluster before saving", async () => {
    const { onSave } = await renderSheet({ scope: "exercise" });

    await fireEvent.press(screen.getByRole("button", { name: "Cluster timing" }));
    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId("advanced-timing-config-cluster-pattern"),
        "3+3+3",
      );
      fireEvent.changeText(
        screen.getByTestId("advanced-timing-config-cluster-rest"),
        "20",
      );
    });
    await fireEvent.press(screen.getByRole("button", { name: "both cues" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save timing" }));

    expect(onSave).toHaveBeenCalledWith({
      version: 1,
      mode: "cluster",
      groupSizes: [3, 3, 3],
      intraRestMs: 20_000,
      cueChannels: "both",
    });
  });

  it("rejects an out-of-range interval and preserves the invalid draft", async () => {
    const { onSave } = await renderSheet({ scope: "exercise" });

    await fireEvent.press(screen.getByRole("button", { name: "Per-rep timing" }));
    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId("advanced-timing-config-interval"),
        "0",
      );
    });
    await fireEvent.press(screen.getByRole("button", { name: "Save timing" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Enter whole seconds from 1 to 60."))
      .toBeOnTheScreen();
    expect(screen.getByText("Your timing choices are still here."))
      .toBeOnTheScreen();
    expect(screen.getByTestId("advanced-timing-config-interval"))
      .toHaveProp("value", "0");
  });

  it("rejects a single-group cluster and preserves the invalid draft", async () => {
    const { onSave } = await renderSheet({ scope: "exercise" });

    await fireEvent.press(screen.getByRole("button", { name: "Cluster timing" }));
    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId("advanced-timing-config-cluster-pattern"),
        "9",
      );
      fireEvent.changeText(
        screen.getByTestId("advanced-timing-config-cluster-rest"),
        "20",
      );
    });
    await fireEvent.press(screen.getByRole("button", { name: "Save timing" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Use groups like 3+3+3 with at least 2 groups."))
      .toBeOnTheScreen();
    expect(screen.getByTestId("advanced-timing-config-cluster-pattern"))
      .toHaveProp("value", "9");
  });

  it("rejects an out-of-range cluster rest and preserves the invalid draft", async () => {
    const { onSave } = await renderSheet({ scope: "exercise" });

    await fireEvent.press(screen.getByRole("button", { name: "Cluster timing" }));
    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId("advanced-timing-config-cluster-pattern"),
        "3+3+3",
      );
      fireEvent.changeText(
        screen.getByTestId("advanced-timing-config-cluster-rest"),
        "0",
      );
    });
    await fireEvent.press(screen.getByRole("button", { name: "Save timing" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Enter cluster rest seconds from 1 to 60."))
      .toBeOnTheScreen();
  });

  it("seeds the draft from an existing per-rep value", async () => {
    const initialValue: AdvancedTimingConfigV1 = {
      version: 1,
      mode: "per_rep",
      intervalMs: 5_000,
      cueChannels: "both",
    };
    await renderSheet({ initialValue, scope: "exercise" });

    expect(screen.getByRole("button", { name: "Per-rep timing" }))
      .toHaveProp("accessibilityState",
        expect.objectContaining({ selected: true }));
    expect(screen.getByTestId("advanced-timing-config-interval"))
      .toHaveProp("value", "5");
    expect(screen.getByRole("button", { name: "both cues" }))
      .toHaveProp("accessibilityState",
        expect.objectContaining({ selected: true }));
  });

  it("seeds the draft from an existing cluster value", async () => {
    const initialValue: AdvancedTimingConfigV1 = {
      version: 1,
      mode: "cluster",
      groupSizes: [4, 4],
      intraRestMs: 15_000,
      cueChannels: "audio",
    };
    await renderSheet({ initialValue, scope: "set" });

    expect(screen.getByRole("button", { name: "Cluster timing" }))
      .toHaveProp("accessibilityState",
        expect.objectContaining({ selected: true }));
    expect(screen.getByTestId("advanced-timing-config-cluster-pattern"))
      .toHaveProp("value", "4+4");
    expect(screen.getByTestId("advanced-timing-config-cluster-rest"))
      .toHaveProp("value", "15");
  });

  it("invokes onCancel from the Cancel action", async () => {
    const { onCancel, onSave } = await renderSheet();

    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("renders selected controls with dark-theme, non-color-only treatment", async () => {
    await renderSheet({ scope: "exercise" }, "Dark");

    await fireEvent.press(screen.getByRole("button", { name: "Per-rep timing" }));

    const selected = screen.getByTestId("advanced-timing-mode-per_rep");
    expect(selected).toHaveProp("accessibilityState",
      expect.objectContaining({ selected: true }));
    expect(selected).toHaveStyle({
      backgroundColor: themes.dark.surfaceSubtle,
      borderColor: themes.dark.action,
    });
  });

  it("suppresses the sheet transition when reduced motion is enabled", async () => {
    const { rendered } = await renderSheet({}, "System", true);

    expect(JSON.stringify(rendered.toJSON()))
      .toContain('"animationType":"none"');
  });

  it("remains usable at 200% font scale and a narrow width", async () => {
    await setWindowDimensions(360, 780, 2);
    const { onSave } = await renderSheet({ scope: "exercise" });

    await fireEvent.press(screen.getByRole("button", { name: "Cluster timing" }));
    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId("advanced-timing-config-cluster-pattern"),
        "5+5",
      );
      fireEvent.changeText(
        screen.getByTestId("advanced-timing-config-cluster-rest"),
        "30",
      );
    });
    await fireEvent.press(screen.getByRole("button", { name: "Save timing" }));

    expect(onSave).toHaveBeenCalledWith({
      version: 1,
      mode: "cluster",
      groupSizes: [5, 5],
      intraRestMs: 30_000,
      cueChannels: "haptic",
    });
  });
});

import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { Dimensions, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { BottomSheet } from "./BottomSheet";
import { AppearanceProvider } from "../theme";

function SheetTestProviders({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SafeAreaProvider initialMetrics={{
      frame: { height: 900, width: 800, x: 0, y: 0 },
      insets: { bottom: 16, left: 0, right: 0, top: 24 },
    }}>
      <AppearanceProvider>{children}</AppearanceProvider>
    </SafeAreaProvider>
  );
}

describe("BottomSheet", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    Dimensions.set({
      screen: { fontScale: 1, height: 900, scale: 1, width: 800 },
      window: { fontScale: 1, height: 900, scale: 1, width: 800 },
    });
  });

  it("moves focus to its semantic heading, or to the supplied safe action", async () => {
    const headingSheet = await render(
      <SheetTestProviders>
        <BottomSheet heading="Choose appearance" onCancel={jest.fn()} visible>
          <Text>Sheet body</Text>
        </BottomSheet>
      </SheetTestProviders>,
    );

    expect(screen.getByRole("header", { name: "Choose appearance" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Choose appearance" }))
      .toHaveProp("focusable", true);
    await headingSheet.unmount();

    const safeActionFocus = jest.fn();
    const safeActionRef = { current: { focus: safeActionFocus } as unknown as View };
    await render(
      <SheetTestProviders>
        <BottomSheet
          consequenceMode
          heading="Remove workout"
          initialFocusRef={safeActionRef}
          onCancel={jest.fn()}
          visible
        >
          <Text>Sheet body</Text>
        </BottomSheet>
      </SheetTestProviders>,
    );

    expect(safeActionFocus).toHaveBeenCalledTimes(1);
  });

  it("uses one no-write cancellation path for close, Back, Escape, and scrim, then restores the exact trigger", async () => {
    const cancel = jest.fn();
    const focus = jest.fn();
    const restoreFocusRef = { current: { focus } as unknown as View };
    const rendered = await render(
      <SheetTestProviders>
        <BottomSheet
          heading="Edit filters"
          onCancel={cancel}
          restoreFocusRef={restoreFocusRef}
          visible
        >
          <Text>Draft stays private</Text>
        </BottomSheet>
      </SheetTestProviders>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Close edit filters" }));
    await fireEvent(screen.getByTestId("bottom-sheet-modal"), "requestClose");
    await fireEvent(screen.getByTestId("bottom-sheet-frame"), "keyDown", {
      nativeEvent: { key: "Escape", preventDefault: jest.fn() },
    });
    await fireEvent.press(
      screen.getByLabelText("Dismiss sheet", { includeHiddenElements: true }),
    );

    expect(cancel).toHaveBeenCalledTimes(4);
    expect(focus).toHaveBeenCalledTimes(4);
    await rendered.unmount();
  });

  it("keeps traversal inside the modal frame and preserves reachable keyboard-safe geometry", async () => {
    Dimensions.set({
      screen: { fontScale: 2, height: 480, scale: 1, width: 900 },
      window: { fontScale: 2, height: 480, scale: 1, width: 900 },
    });
    const cancel = jest.fn();
    await render(
      <SheetTestProviders>
        <View accessibilityLabel="Background action" accessibilityRole="button" />
        <BottomSheet heading="Keyboard safe" onCancel={cancel} visible>
          <Text>Body remains in one vertical scroll owner.</Text>
        </BottomSheet>
      </SheetTestProviders>,
    );

    expect(screen.getByTestId("bottom-sheet-frame")).toHaveProp(
      "accessibilityViewIsModal",
      true,
    );
    expect(screen.getByTestId("bottom-sheet-frame")).toHaveProp(
      "importantForAccessibility",
      "yes",
    );
    expect(screen.getByTestId("bottom-sheet-scroll")).toHaveStyle({
      maxHeight: "82%",
    });
    expect(screen.queryByRole("button", { name: "Background action" }))
      .toBeNull();

    await fireEvent(screen.getByTestId("bottom-sheet-frame"), "keyDown", {
      nativeEvent: { key: "Tab", preventDefault: jest.fn() },
    });
    expect(cancel).not.toHaveBeenCalled();
  });
});

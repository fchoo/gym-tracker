import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { AccessibilityInfo, Dimensions, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { BottomSheet } from "./BottomSheet";
import {
  BottomSheetFocusContext,
  useBottomSheetFocusRegistration,
} from "./bottomSheetFocus";
import { FocusablePressable } from "./index";
import { AppearanceProvider, radius, sizes } from "../theme";

const mockRequestAndroidViewFocus = jest.fn<
  (nativeID: string) => Promise<boolean>
>(async () => true);

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

function FocusTrapProbe({
  firstFocus,
  secondFocus,
  thirdFocus,
}: Readonly<{
  firstFocus: jest.Mock;
  secondFocus: jest.Mock;
  thirdFocus: jest.Mock;
}>) {
  const registration = useBottomSheetFocusRegistration();
  const refs = React.useMemo(() => [
    { current: { focus: firstFocus } },
    { current: { focus: secondFocus } },
    { current: { focus: thirdFocus } },
  ], [firstFocus, secondFocus, thirdFocus]);

  React.useEffect(() => {
    if (registration === null) {
      return;
    }
    const cleanups = refs.map((ref) => registration.register(ref));
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [refs, registration]);

  return (
    <>
      <Text testID="focus-probe-1">First action</Text>
      <Text testID="focus-probe-2">Second action</Text>
      <Text testID="focus-probe-3">Third action</Text>
    </>
  );
}

describe("BottomSheet", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockRequestAndroidViewFocus.mockClear();
    Dimensions.set({
      screen: { fontScale: 1, height: 900, scale: 1, width: 800 },
      window: { fontScale: 1, height: 900, scale: 1, width: 800 },
    });
  });

  it("keeps its frame-owned close action independent from the component barrel", () => {
    const source = readFileSync(resolve(__dirname, "BottomSheet.tsx"), "utf8");

    expect(source).not.toMatch(/from\s+["']\.\/index["']/u);
  });

  it("keeps the frame close action keyboard-safe, focus-visible, and exactly 48dp", async () => {
    const cancel = jest.fn();
    const rendered = await render(
      <SheetTestProviders>
        <BottomSheet heading="Keyboard safe" onCancel={cancel} visible>
          <Text>Sheet body</Text>
        </BottomSheet>
      </SheetTestProviders>,
    );

    const closeAction = screen.getByTestId("bottom-sheet-close-action");
    expect(closeAction).toHaveProp("accessibilityLabel", "Close keyboard safe");
    expect(closeAction).toHaveProp("accessibilityRole", "button");
    expect(closeAction).toHaveProp("accessibilityState", {
      busy: false,
      disabled: false,
      selected: false,
    });
    expect(closeAction).toHaveProp("focusable", true);
    expect(closeAction).toHaveStyle({
      borderRadius: radius.full,
      height: sizes.minimumTarget,
      minHeight: sizes.minimumTarget,
      minWidth: sizes.minimumTarget,
      width: sizes.minimumTarget,
    });
    const [closeIcon] = closeAction.queryAll((node) => node.type === "RNSVGSvgView");
    expect(closeIcon?.props.height).toBe(sizes.icon);
    expect(closeIcon?.props.strokeWidth).toBe(2);

    await fireEvent(screen.getByTestId("bottom-sheet-frame"), "keyDown", {
      nativeEvent: { key: "Tab", preventDefault: jest.fn() },
    });
    expect(closeAction).toHaveProp("hasTVPreferredFocus", true);
    await fireEvent(closeAction, "focus");
    expect(closeAction).toHaveStyle({
      outlineColor: "#195FAE",
      outlineOffset: sizes.focusClearance,
      outlineWidth: sizes.focusRing,
    });
    await fireEvent(closeAction, "keyDown", { nativeEvent: { key: "Enter" } });
    expect(cancel).toHaveBeenCalledTimes(1);

    await rendered.rerender(
      <SheetTestProviders>
        <BottomSheet cancelDisabled heading="Keyboard safe" onCancel={cancel} visible>
          <Text>Sheet body</Text>
        </BottomSheet>
      </SheetTestProviders>,
    );
    const disabledCloseAction = screen.getByTestId("bottom-sheet-close-action");
    expect(disabledCloseAction).toHaveProp("accessibilityState", {
      busy: false,
      disabled: true,
      selected: false,
    });
    expect(disabledCloseAction).toHaveProp("focusable", false);
    await fireEvent(disabledCloseAction, "keyDown", { nativeEvent: { key: " " } });
    expect(cancel).toHaveBeenCalledTimes(1);
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

  it("keeps the shared inset by default and supports an exact scoped inset", async () => {
    const rendered = await render(
      <SheetTestProviders>
        <BottomSheet heading="Default sheet" onCancel={jest.fn()} visible>
          <Text>Default body</Text>
        </BottomSheet>
      </SheetTestProviders>,
    );

    expect(screen.getByTestId("bottom-sheet-header")).toHaveStyle({ paddingHorizontal: 16 });
    expect(StyleSheet.flatten(screen.getByTestId("bottom-sheet-scroll").props.contentContainerStyle)).toMatchObject({ padding: 16, paddingTop: 8 });

    await rendered.rerender(
      <SheetTestProviders>
        <BottomSheet heading="Calendar key" horizontalInset={14} onCancel={jest.fn()} visible>
          <Text>Calendar body</Text>
        </BottomSheet>
      </SheetTestProviders>,
    );

    expect(screen.getByTestId("bottom-sheet-header")).toHaveStyle({ paddingHorizontal: 14 });
    expect(StyleSheet.flatten(screen.getByTestId("bottom-sheet-scroll").props.contentContainerStyle)).toMatchObject({ paddingHorizontal: 14 });
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
    await fireEvent(screen.getByTestId("bottom-sheet-frame"), "escape");
    await fireEvent.press(
      screen.getByLabelText("Dismiss sheet", { includeHiddenElements: true }),
    );

    expect(cancel).toHaveBeenCalledTimes(5);
    await waitFor(() => expect(focus).toHaveBeenCalledTimes(5));
    await rendered.unmount();
  });

  it("does not force accessibility focus to node 0 when the restore target has no native handle", async () => {
    const setAccessibilityFocus = jest.fn();
    jest.spyOn(AccessibilityInfo, "setAccessibilityFocus")
      .mockImplementation(setAccessibilityFocus);
    const restoreFocusRef = { current: { focus: jest.fn() } as unknown as View };

    await render(
      <SheetTestProviders>
        <BottomSheet
          heading="Edit filters"
          onCancel={jest.fn()}
          restoreFocusRef={restoreFocusRef}
          visible
        >
          <Text>Draft stays private</Text>
        </BottomSheet>
      </SheetTestProviders>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Close edit filters" }));

    await waitFor(() => expect(restoreFocusRef.current.focus).toHaveBeenCalledTimes(1));
    expect(setAccessibilityFocus).not.toHaveBeenCalledWith(0);
  });

  it("requests Android native focus before clearing the one-shot preference", async () => {
    const setNativeProps = jest.fn();
    const restoreFocusRef = {
      current: { focus: jest.fn(), setNativeProps } as unknown as View,
    };

    await render(
      <SheetTestProviders>
        <BottomSheet
          heading="Edit filters"
          onCancel={jest.fn()}
          restoreFocusRef={restoreFocusRef}
          visible
        >
          <Text>Draft stays private</Text>
        </BottomSheet>
      </SheetTestProviders>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Close edit filters" }));

    await waitFor(() => expect(setNativeProps).toHaveBeenCalledWith({
      hasTVPreferredFocus: true,
    }));
    await waitFor(() => expect(setNativeProps).toHaveBeenLastCalledWith({
      hasTVPreferredFocus: false,
    }));
  });

  it("requests focus by nativeID after the modal dismissal delay and keeps the JS fallback", async () => {
    const focus = jest.fn();
    const restoreFocusRef = { current: { focus } as unknown as View };

    await render(
      <SheetTestProviders>
        <BottomSheet
          heading="Edit filters"
          onCancel={jest.fn()}
          requestNativeFocus={mockRequestAndroidViewFocus}
          restoreFocusNativeID="root-settings-trigger-library"
          restoreFocusRef={restoreFocusRef}
          visible
        >
          <Text>Draft stays private</Text>
        </BottomSheet>
      </SheetTestProviders>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Close edit filters" }));

    expect(mockRequestAndroidViewFocus).not.toHaveBeenCalled();
    await waitFor(() => expect(mockRequestAndroidViewFocus).toHaveBeenCalledWith(
      "root-settings-trigger-library",
    ));
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("cancels pending focus restoration when its owner unmounts", async () => {
    const rendered = await render(
      <SheetTestProviders>
        <BottomSheet
          heading="Edit filters"
          onCancel={jest.fn()}
          requestNativeFocus={mockRequestAndroidViewFocus}
          restoreFocusNativeID="root-settings-trigger-library"
          visible
        >
          <Text>Draft stays private</Text>
        </BottomSheet>
      </SheetTestProviders>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Close edit filters" }));
    await rendered.unmount();
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(mockRequestAndroidViewFocus).not.toHaveBeenCalled();
  });

  it("registers focusable actions with the sheet trap and reports the focused control", async () => {
    const register = jest.fn<(ref: unknown) => () => void>(() => jest.fn());
    const onFocus = jest.fn<(ref: unknown) => void>();
    const moveFocus = jest.fn<(direction: "next" | "previous") => boolean>(() => true);

    await render(
      <SheetTestProviders>
        <BottomSheetFocusContext.Provider value={{ moveFocus, onFocus, register }}>
          <FocusablePressable
            accessibilityLabel="Dismiss"
            accessibilityRole="button"
            focusable
            onPress={jest.fn()}
          >
            <Text>Dismiss</Text>
          </FocusablePressable>
        </BottomSheetFocusContext.Provider>
      </SheetTestProviders>,
    );

    const dismissAction = screen.getByRole("button", { name: "Dismiss" });
    await fireEvent(dismissAction, "focus");

    expect(register).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledTimes(1);
    const [registeredRef] = register.mock.calls[0] ?? [undefined];
    const [focusedRef] = onFocus.mock.calls[0] ?? [undefined];
    expect(focusedRef).toBe(registeredRef);
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
    expect(screen.getByTestId("bottom-sheet-frame")).toHaveStyle({
      flexBasis: 0,
      flexGrow: 1,
      flexShrink: 1,
      minHeight: 0,
    });
    expect(screen.getByTestId("bottom-sheet-layout")).toHaveStyle({
      flexBasis: 0,
      flexGrow: 1,
      flexShrink: 1,
      minHeight: 0,
    });
    expect(screen.getByTestId("bottom-sheet-scroll")).toHaveStyle({
      flexBasis: 0,
      flexGrow: 1,
      flexShrink: 1,
      maxHeight: 289,
      minHeight: 0,
    });
    expect(screen.getByTestId("bottom-sheet-surface")).toHaveStyle({
      height: 345,
    });
    expect(screen.queryByRole("button", { name: "Background action" }))
      .toBeNull();

    await fireEvent(screen.getByTestId("bottom-sheet-frame"), "keyDown", {
      nativeEvent: { key: "Tab", preventDefault: jest.fn() },
    });
    expect(cancel).not.toHaveBeenCalled();
  });

  it("wraps keyboard and D-pad traversal across every registered action without escaping the sheet", async () => {
    const firstFocus = jest.fn();
    const secondFocus = jest.fn();
    const thirdFocus = jest.fn();

    await render(
      <SheetTestProviders>
        <BottomSheet heading="Keyboard safe" onCancel={jest.fn()} visible>
          <FocusTrapProbe
            firstFocus={firstFocus}
            secondFocus={secondFocus}
            thirdFocus={thirdFocus}
          />
        </BottomSheet>
      </SheetTestProviders>,
    );

    await fireEvent(screen.getByTestId("bottom-sheet-frame"), "keyDown", {
      nativeEvent: { key: "Tab", preventDefault: jest.fn() },
    });
    await fireEvent(screen.getByTestId("bottom-sheet-frame"), "keyDown", {
      nativeEvent: { key: "ArrowRight", preventDefault: jest.fn() },
    });
    await fireEvent(screen.getByTestId("bottom-sheet-frame"), "keyDown", {
      nativeEvent: { key: "Tab", preventDefault: jest.fn() },
    });
    await fireEvent(screen.getByTestId("bottom-sheet-frame"), "keyDown", {
      nativeEvent: { key: "Tab", preventDefault: jest.fn() },
    });
    await fireEvent(screen.getByTestId("bottom-sheet-frame"), "keyDown", {
      nativeEvent: { key: "ArrowLeft", preventDefault: jest.fn() },
    });
    await fireEvent(screen.getByTestId("bottom-sheet-frame"), "keyDown", {
      nativeEvent: { key: "Tab", preventDefault: jest.fn(), shiftKey: true },
    });

    expect(firstFocus).toHaveBeenCalledTimes(2);
    expect(secondFocus).toHaveBeenCalledTimes(2);
    expect(thirdFocus).toHaveBeenCalledTimes(1);
  });
});

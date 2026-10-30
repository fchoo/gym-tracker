import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { AccessibilityInfo, Dimensions, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { BottomSheet } from "./BottomSheet";
import {
  BottomSheetFocusContext,
  useBottomSheetFocusRegistration,
} from "./bottomSheetFocus";
import { FocusablePressable, FocusClearanceProvider, PrimaryAction } from "./index";
import { AppearanceProvider, radius, sizes } from "../theme";
import { Phase20VisualContextProvider } from "../../testing/phase20VisualContext";
import { markKeyboardFocusModality } from "./focusVisibility";

const phase20VisualRequest = {
  appearance: "Light",
  configuration: "AP-L-C390-P-F100",
  mode: "capture",
  nonce: "a".repeat(32),
  state: "BW-001",
} as const;

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
    markKeyboardFocusModality();
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

  it("applies default and provider-scoped focus clearance to the frame close action", async () => {
    const defaultSheet = await render(
      <SheetTestProviders>
        <BottomSheet heading="Default clearance" onCancel={jest.fn()} visible>
          <Text>Sheet body</Text>
        </BottomSheet>
      </SheetTestProviders>,
    );

    await fireEvent(screen.getByTestId("bottom-sheet-close-action"), "focus");
    expect(screen.getByTestId("bottom-sheet-close-action")).toHaveStyle({
      outlineOffset: 4,
      outlineWidth: 3,
    });
    await defaultSheet.unmount();

    await render(
      <SheetTestProviders>
        <FocusClearanceProvider clearance={3}>
          <BottomSheet heading="Scoped clearance" onCancel={jest.fn()} visible>
            <Text>Sheet body</Text>
          </BottomSheet>
        </FocusClearanceProvider>
      </SheetTestProviders>,
    );

    await fireEvent(screen.getByTestId("bottom-sheet-close-action"), "focus");
    expect(screen.getByTestId("bottom-sheet-close-action")).toHaveStyle({
      outlineOffset: 3,
      outlineWidth: 3,
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

  it("never resets ordinary production sheet scroll during layout", async () => {
    const scrollTo = jest.spyOn(
      ScrollView.prototype,
      "scrollTo",
    ).mockImplementation(() => undefined);
    await render(
      <SheetTestProviders>
        <BottomSheet heading="Production sheet" onCancel={jest.fn()} visible>
          <Text>Sheet body</Text>
        </BottomSheet>
      </SheetTestProviders>,
    );

    await fireEvent(screen.getByTestId("bottom-sheet-scroll"), "layout");
    await fireEvent(screen.getByTestId("bottom-sheet-scroll"), "layout");

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("forces the initial visual evidence sheet scroll exactly once", async () => {
    const scrollTo = jest.spyOn(
      ScrollView.prototype,
      "scrollTo",
    ).mockImplementation(() => undefined);
    await render(
      <SheetTestProviders>
        <Phase20VisualContextProvider
          onScrollOffset={() => undefined}
          request={phase20VisualRequest}
        >
          <BottomSheet heading="Evidence sheet" onCancel={jest.fn()} visible>
            <Text>Sheet body</Text>
          </BottomSheet>
        </Phase20VisualContextProvider>
      </SheetTestProviders>,
    );

    await fireEvent(screen.getByTestId("bottom-sheet-scroll"), "layout");
    await fireEvent(screen.getByTestId("bottom-sheet-scroll"), "layout");

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ animated: false, x: 0, y: 0 });
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

  it("suppresses persistent touch and mouse focus outlines while retaining keyboard activation and callbacks", async () => {
    const onTouchStart = jest.fn();
    const onPointerDown = jest.fn();
    const onFocus = jest.fn();
    const onPress = jest.fn();
    await render(
      <SheetTestProviders>
        <FocusablePressable
          accessibilityLabel="Save settings"
          accessibilityRole="button"
          onFocus={onFocus}
          onPointerDown={onPointerDown}
          onPress={onPress}
          onTouchStart={onTouchStart}
        >
          <Text>Save settings</Text>
        </FocusablePressable>
      </SheetTestProviders>,
    );
    const action = screen.getByRole("button", { name: "Save settings" });
    await fireEvent(action, "focus");
    expect(action).toHaveStyle({ outlineWidth: sizes.focusRing });
    await fireEvent(action, "touchStart", { nativeEvent: {} });
    await fireEvent.press(action);
    await fireEvent(action, "focus");
    expect(action).toHaveStyle({ outlineWidth: 0, outlineOffset: 0 });
    expect(onTouchStart).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledTimes(2);

    await fireEvent(action, "keyDown", { nativeEvent: { key: "Enter" } });
    expect(action).toHaveStyle({ outlineWidth: sizes.focusRing });
    expect(onPress).toHaveBeenCalledTimes(2);
    await fireEvent(action, "pointerDown", { nativeEvent: { pointerType: "mouse" } });
    await fireEvent(action, "focus");
    expect(action).toHaveStyle({ outlineWidth: 0 });
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  it("shows keyboard focus when the sheet trap revisits an action previously tapped", async () => {
    const registered: { ref?: { current: { focus?: () => void } | null } } = {};
    const register = jest.fn((ref: NonNullable<typeof registered.ref>) => {
      registered.ref = ref;
      return jest.fn();
    });
    await render(
      <SheetTestProviders>
        <BottomSheetFocusContext.Provider value={{ moveFocus: () => true, onFocus: jest.fn(), register }}>
          <FocusablePressable accessibilityLabel="Keep changes" accessibilityRole="button" onPress={jest.fn()}>
            <Text>Keep changes</Text>
          </FocusablePressable>
        </BottomSheetFocusContext.Provider>
      </SheetTestProviders>,
    );
    const action = screen.getByRole("button", { name: "Keep changes" });
    await fireEvent(action, "touchStart", { nativeEvent: {} });
    await fireEvent(action, "focus");
    expect(action).toHaveStyle({ outlineWidth: 0 });
    await act(() => registered.ref?.current?.focus?.());
    await fireEvent(action, "focus");
    expect(action).toHaveStyle({ outlineWidth: sizes.focusRing });
  });

  it("keeps the close action outline clear after touch and visible for keyboard focus", async () => {
    await render(
      <SheetTestProviders>
        <BottomSheet heading="Edit filters" onCancel={jest.fn()} visible>
          <Text>Filters</Text>
        </BottomSheet>
      </SheetTestProviders>,
    );
    const close = screen.getByTestId("bottom-sheet-close-action");
    await fireEvent(close, "touchStart", { nativeEvent: {} });
    await fireEvent(close, "focus");
    expect(close).toHaveStyle({ outlineWidth: 0 });
    await fireEvent(close, "keyDown", { nativeEvent: { key: "ArrowLeft" } });
    expect(close).toHaveStyle({ outlineWidth: sizes.focusRing });
  });

  it("restores native trigger focus after a touch-opened sheet without restoring its blue outline", async () => {
    function TouchOpenedSheet() {
      const [visible, setVisible] = React.useState(false);
      const triggerRef = React.useRef<View>(null);
      return <>
        <PrimaryAction label="Open settings" onPress={() => setVisible(true)} ref={triggerRef} />
        <BottomSheet
          heading="Settings"
          onCancel={() => setVisible(false)}
          requestNativeFocus={mockRequestAndroidViewFocus}
          restoreFocusNativeID="settings-trigger"
          restoreFocusRef={triggerRef}
          visible={visible}
        ><Text>Settings stay reachable</Text></BottomSheet>
      </>;
    }
    await render(<SheetTestProviders><TouchOpenedSheet /></SheetTestProviders>);
    const trigger = screen.getByRole("button", { name: "Open settings" });
    await fireEvent(trigger, "touchStart", { nativeEvent: {} });
    await fireEvent.press(trigger);
    const close = screen.getByRole("button", { name: "Close settings" });
    await fireEvent(close, "touchStart", { nativeEvent: {} });
    await fireEvent.press(close);
    await waitFor(() => expect(mockRequestAndroidViewFocus).toHaveBeenCalledWith("settings-trigger"));
    await fireEvent(trigger, "focus");
    expect(trigger).toHaveStyle({ outlineWidth: 0 });
    await fireEvent(trigger, "keyDown", { nativeEvent: { key: "Tab" } });
    expect(trigger).toHaveStyle({ outlineWidth: sizes.focusRing });
  });

  it("keeps long sheet content unbounded and reserves the actual bottom inset inside its scroll owner", async () => {
    await render(
      <SheetTestProviders>
        <BottomSheet
          contentStyle={{ maxHeight: "82%", padding: 24, paddingBottom: 28 }}
          heading="Plan settings"
          onCancel={jest.fn()}
          visible
        >
          <Text>First settings group</Text>
          <Text>Last action with a complete wrapping label</Text>
        </BottomSheet>
      </SheetTestProviders>,
    );

    const scroll = screen.getByTestId("bottom-sheet-scroll");
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({
      padding: 24,
      paddingBottom: 44,
    });
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).maxHeight).toBeUndefined();
    expect(StyleSheet.flatten(scroll.props.style).maxHeight).toBeUndefined();
    expect(screen.getByTestId("bottom-sheet-surface")).toHaveStyle({
      flexShrink: 1,
      minHeight: 0,
    });
    expect(StyleSheet.flatten(screen.getByTestId("bottom-sheet-surface").props.style).paddingBottom)
      .toBeUndefined();
    expect(screen.getByTestId("bottom-sheet-keyboard-avoider")).toHaveStyle({ flex: 1 });
    expect(screen.getByTestId("bottom-sheet-keyboard-avoider")).toHaveProp("pointerEvents", "box-none");
    for (const id of ["bottom-sheet-frame", "bottom-sheet-layout", "bottom-sheet-scroll"]) {
      expect(screen.getByTestId(id)).toHaveStyle({ flexShrink: 1, minHeight: 0 });
    }
    expect(scroll.queryAll((node) => node.props.children
      === "Last action with a complete wrapping label").length).toBeGreaterThan(0);
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
      minHeight: 0,
    });
    expect(StyleSheet.flatten(screen.getByTestId("bottom-sheet-scroll").props.style).maxHeight)
      .toBeUndefined();
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

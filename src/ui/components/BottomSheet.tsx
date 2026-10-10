import React, { useEffect, useMemo, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type TextStyle,
  type NativeSyntheticEvent,
  type ViewStyle,
} from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { IconAction } from "./index";
import {
  BottomSheetFocusContext,
  type BottomSheetFocusableRef,
} from "./bottomSheetFocus";
import { AndroidEscapeBoundary } from "./AndroidEscapeBoundary";
import { radius, space, typeScale, useAppTheme } from "../theme";

type FocusTarget = Readonly<{
  focus?: () => void;
  setNativeProps?: (props: Readonly<{ hasTVPreferredFocus: boolean }>) => void;
}>;

export type BottomSheetProps = Readonly<{
  visible: boolean;
  heading: string;
  children?: React.ReactNode;
  onCancel: () => void;
  cancelDisabled?: boolean;
  cancelLabel?: string | undefined;
  consequenceMode?: boolean;
  initialFocusRef?: React.RefObject<FocusTarget | null> | undefined;
  restoreFocusNativeID?: string | undefined;
  restoreFocusRef?: React.RefObject<FocusTarget | null> | undefined;
  requestNativeFocus?: ((nativeID: string) => void | Promise<boolean>) | undefined;
  testID?: string | undefined;
  scrollTestID?: string | undefined;
  contentStyle?: ViewStyle | undefined;
}>;

const BottomSheetDepthContext = React.createContext(0);
const BottomSheetCancellationContext = React.createContext<(() => void) | undefined>(
  undefined,
);
function closeLabelFor(heading: string, cancelLabel?: string): string {
  return cancelLabel ?? `Close ${heading.toLocaleLowerCase()}`;
}

/** Lets sheet content invoke the frame-owned no-write cancellation path. */
export function useBottomSheetCancel(): (() => void) | undefined {
  return React.useContext(BottomSheetCancellationContext);
}

/**
 * Presentation-only modal frame. Callers retain drafts, validation and mutations;
 * the frame owns modal isolation, all safe cancellation paths and trigger focus.
 */
export function BottomSheet({
  visible,
  heading,
  children,
  onCancel,
  cancelDisabled = false,
  cancelLabel,
  consequenceMode = false,
  initialFocusRef,
  restoreFocusNativeID,
  restoreFocusRef,
  requestNativeFocus,
  testID,
  scrollTestID,
  contentStyle,
}: BottomSheetProps) {
  const { colors, reduceMotion } = useAppTheme();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const compactLandscape = windowWidth > windowHeight && windowHeight <= 480;
  const insets = React.useContext(SafeAreaInsetsContext) ?? {
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
  };
  const depth = React.useContext(BottomSheetDepthContext);
  const headingRef = useRef<View>(null);
  const registeredFocusablesRef = useRef<BottomSheetFocusableRef[]>([]);
  const currentFocusedRef = useRef<BottomSheetFocusableRef | null>(null);
  const wasVisibleRef = useRef(false);
  const focusRestoredRef = useRef(false);
  const focusRestoreTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const translation = useRef(new Animated.Value(reduceMotion ? 0 : 8)).current;
  const resolvedCancelLabel = useMemo(
    () => closeLabelFor(heading, cancelLabel),
    [cancelLabel, heading],
  );

  if (visible && depth > 0) {
    throw new Error("BottomSheet cannot be nested");
  }

  useEffect(() => {
    if (!visible) {
      return;
    }
    const focusTarget = consequenceMode && initialFocusRef?.current !== null
      && initialFocusRef?.current !== undefined
      ? initialFocusRef.current
      : headingRef.current;
    focusTarget?.focus?.();
    let node: number | null = null;
    try {
      node = findNodeHandle(focusTarget as never);
    } catch {
      // A caller-owned focus seam may expose only focus(); it is still valid.
    }
    if (node !== null) {
      AccessibilityInfo.setAccessibilityFocus(node);
    }
    translation.setValue(reduceMotion ? 0 : 8);
    const animation = Animated.timing(translation, {
      duration: reduceMotion ? 0 : 150,
      toValue: 0,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [consequenceMode, initialFocusRef, reduceMotion, translation, visible]);

  const restoreFocus = React.useCallback(() => {
    const restoreTarget = restoreFocusRef?.current;
    // React Native's imperative View focus command can be feature-gated on
    // Android. Toggling the native preferred-focus prop calls requestFocus()
    // directly, then resetting it avoids stealing focus on a later remount.
    restoreTarget?.setNativeProps?.({ hasTVPreferredFocus: true });
    restoreTarget?.focus?.();
    let restoreNode: number | null = null;
    try {
      restoreNode = findNodeHandle(restoreTarget as never);
    } catch {
      // A caller-owned focus seam may expose only focus(); it is still valid.
    }
    if (typeof restoreNode === "number" && restoreNode > 0) {
      AccessibilityInfo.setAccessibilityFocus(restoreNode);
    }
    requestAnimationFrame(() => {
      restoreTarget?.setNativeProps?.({ hasTVPreferredFocus: false });
    });
  }, [restoreFocusRef]);

  const registerFocusable = React.useCallback((ref: BottomSheetFocusableRef) => {
    registeredFocusablesRef.current = [
      ...registeredFocusablesRef.current.filter((entry) => entry !== ref),
      ref,
    ];
    return () => {
      registeredFocusablesRef.current = registeredFocusablesRef.current.filter(
        (entry) => entry !== ref,
      );
      if (currentFocusedRef.current === ref) {
        currentFocusedRef.current = null;
      }
    };
  }, []);

  useEffect(() => () => {
    for (const timeout of focusRestoreTimeoutsRef.current) {
      clearTimeout(timeout);
    }
    focusRestoreTimeoutsRef.current.clear();
  }, []);

  const moveFocus = React.useCallback((direction: "next" | "previous") => {
    const entries = registeredFocusablesRef.current.filter(
      (entry) => typeof entry.current?.focus === "function",
    );
    if (entries.length === 0) {
      return false;
    }
    const currentIndex = currentFocusedRef.current === null
      ? -1
      : entries.findIndex((entry) => entry === currentFocusedRef.current);
    const nextIndex = currentIndex === -1
      ? direction === "next"
        ? 0
        : entries.length - 1
      : (currentIndex + (direction === "next" ? 1 : -1) + entries.length) % entries.length;
    const nextEntry = entries[nextIndex];
    if (nextEntry === undefined) {
      return false;
    }
    currentFocusedRef.current = nextEntry;
    nextEntry.current?.focus?.();
    return true;
  }, []);

  useEffect(() => {
    if (visible) {
      wasVisibleRef.current = true;
      focusRestoredRef.current = false;
      currentFocusedRef.current = null;
      return;
    }
    if (!wasVisibleRef.current) {
      return;
    }
    wasVisibleRef.current = false;
    if (!focusRestoredRef.current) {
      restoreFocus();
    }
  }, [restoreFocus, visible]);

  const cancel = React.useCallback(() => {
    if (cancelDisabled) {
      return;
    }
    onCancel();
    focusRestoredRef.current = true;
    // Android can move focus to the newly exposed heading while the Modal is
    // still being removed. Restore after that native transition settles so
    // the invoking control remains the final keyboard/accessibility target.
    const timeout = setTimeout(() => {
      focusRestoreTimeoutsRef.current.delete(timeout);
      restoreFocus();
      if (restoreFocusNativeID !== undefined) {
        void requestNativeFocus?.(restoreFocusNativeID);
      }
    }, 250);
    focusRestoreTimeoutsRef.current.add(timeout);
  }, [cancelDisabled, onCancel, requestNativeFocus, restoreFocus, restoreFocusNativeID]);

  const containTraversal = React.useCallback((event: NativeSyntheticEvent<{
    key?: string;
    shiftKey?: boolean;
    preventDefault?: () => void;
  }>) => {
    const key = event.nativeEvent.key;
    if (key === "Escape") {
      event.nativeEvent.preventDefault?.();
      cancel();
      return;
    }
    const direction = key === "Tab"
      ? event.nativeEvent.shiftKey === true
        ? "previous"
        : "next"
      : key === "ArrowUp" || key === "ArrowLeft"
        ? "previous"
        : key === "ArrowDown" || key === "ArrowRight"
          ? "next"
          : null;
    if (direction !== null && moveFocus(direction)) {
      event.nativeEvent.preventDefault?.();
    }
  }, [cancel, moveFocus]);

  return (
    <BottomSheetDepthContext.Provider value={depth + 1}>
      <BottomSheetCancellationContext.Provider value={cancel}>
        <BottomSheetFocusContext.Provider
          value={{
            moveFocus,
            onFocus: (ref) => {
              currentFocusedRef.current = ref;
            },
            register: registerFocusable,
          }}
        >
          <Modal
            animationType="none"
            onRequestClose={cancel}
            testID="bottom-sheet-modal"
            transparent
            visible={visible}
          >
            <View style={styles.backdrop} testID={testID ?? "bottom-sheet-backdrop"}>
              <Pressable
                accessibilityElementsHidden
                accessibilityLabel="Dismiss sheet"
                accessibilityRole="button"
                importantForAccessibility="no-hide-descendants"
                onPress={cancel}
                style={StyleSheet.absoluteFill}
                testID="bottom-sheet-scrim"
              />
              <KeyboardAvoidingView
                behavior={Platform.select({ android: "height", default: "padding" })}
                style={styles.keyboardAvoider}
              >
                <Animated.View
                  style={[
                    styles.frame,
                    {
                      backgroundColor: colors.raised,
                      borderColor: colors.line,
                      maxHeight: compactLandscape ? "72%" : undefined,
                      paddingBottom: insets.bottom,
                      transform: [{ translateY: translation }],
                    },
                  ]}
                  testID="bottom-sheet-surface"
                >
                  <AndroidEscapeBoundary
                    accessibilityViewIsModal
                    importantForAccessibility="yes"
                    onEscape={cancel}
                    onKeyDown={containTraversal as never}
                    style={styles.boundary}
                    testID="bottom-sheet-frame"
                  >
                    <View style={styles.header}>
                      <View
                        accessible
                        accessibilityLabel={heading}
                        accessibilityRole="header"
                        focusable
                        ref={headingRef}
                      >
                        <Text style={[typeScale.screenTitle as TextStyle, { color: colors.textPrimary }]}>
                          {heading}
                        </Text>
                      </View>
                      <IconAction
                        accessibilityLabel={resolvedCancelLabel}
                        disabled={cancelDisabled}
                        icon="clear"
                        onPress={cancel}
                      />
                    </View>
                    <ScrollView
                      contentContainerStyle={[styles.content, contentStyle]}
                      horizontal={false}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator
                      style={styles.scroll}
                      testID={scrollTestID ?? "bottom-sheet-scroll"}
                    >
                      {children}
                    </ScrollView>
                  </AndroidEscapeBoundary>
                </Animated.View>
              </KeyboardAvoidingView>
            </View>
          </Modal>
        </BottomSheetFocusContext.Provider>
      </BottomSheetCancellationContext.Provider>
    </BottomSheetDepthContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.68)",
    flex: 1,
    justifyContent: "flex-end",
  },
  boundary: { flexShrink: 1, minHeight: 0 },
  keyboardAvoider: { justifyContent: "flex-end" },
  frame: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 56,
    paddingHorizontal: space[4],
    paddingTop: space[2],
  },
  scroll: { flexShrink: 1, maxHeight: "82%" },
  content: { gap: space[4], padding: space[4], paddingTop: space[2] },
});

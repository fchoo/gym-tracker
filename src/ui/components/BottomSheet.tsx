import React, { useEffect, useMemo, useRef } from "react";
import { X } from "lucide-react-native";
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
  type NativeScrollEvent,
  type StyleProp,
  type TextStyle,
  type NativeSyntheticEvent,
  type ViewStyle,
} from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import {
  BottomSheetFocusContext,
  type BottomSheetFocusableRef,
  useBottomSheetFocusRegistration,
  useFocusClearance,
} from "./bottomSheetFocus";
import { AndroidEscapeBoundary } from "./AndroidEscapeBoundary";
import { usePhase20VisualScrollReporter } from "../../testing/phase20VisualContext";
import { radius, sizes, space, typeScale, useAppTheme } from "../theme";

type FocusTarget = Readonly<{
  focus?: () => void;
  setNativeProps?: (props: Readonly<{ hasTVPreferredFocus: boolean }>) => void;
}>;

const BOTTOM_SHEET_HEADER_MIN_HEIGHT = 56;

export type BottomSheetProps = Readonly<{
  visible: boolean;
  heading: string;
  headingStyle?: StyleProp<TextStyle>;
  horizontalInset?: number | undefined;
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

function BottomSheetCloseAction({
  accessibilityLabel,
  disabled = false,
  onPress,
}: Readonly<{
  accessibilityLabel: string;
  disabled?: boolean;
  onPress(): void;
}>) {
  const { colors } = useAppTheme();
  const focusClearance = useFocusClearance();
  const [focused, setFocused] = React.useState(false);
  const [preferredFocus, setPreferredFocus] = React.useState(false);
  const nativeRef = useRef<View | null>(null);
  const focusRegistration = useBottomSheetFocusRegistration();
  const focusableRef = useRef({
    focus: () => undefined,
  }) as BottomSheetFocusableRef;
  const busy = false;
  const isDisabled = disabled || busy;

  focusableRef.current = {
    focus: () => {
      setPreferredFocus(true);
      nativeRef.current?.setNativeProps?.({ hasTVPreferredFocus: true });
      nativeRef.current?.focus?.();
    },
  };

  useEffect(() => {
    if (focusRegistration === null || isDisabled) {
      return;
    }
    return focusRegistration.register(focusableRef);
  }, [focusRegistration, focusableRef, isDisabled]);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: isDisabled, selected: false }}
      disabled={isDisabled}
      focusable={!isDisabled}
      hasTVPreferredFocus={preferredFocus}
      {...({
        onKeyDown: (event: NativeSyntheticEvent<{ key?: string }>) => {
          if (!isDisabled && (event.nativeEvent.key === "Enter" || event.nativeEvent.key === " ")) {
            onPress();
          }
        },
      } as unknown as React.ComponentProps<typeof Pressable>)}
      onBlur={() => setFocused(false)}
      onFocus={() => {
        setFocused(true);
        setPreferredFocus(false);
        focusRegistration?.onFocus(focusableRef);
      }}
      onPress={onPress}
      ref={nativeRef}
      style={({ pressed }) => [
        styles.closeAction,
        {
          backgroundColor: pressed ? colors.surfaceSubtle : "transparent",
          borderColor: colors.divider,
          opacity: isDisabled ? 0.62 : 1,
          outlineColor: colors.focusRing,
          outlineOffset: focused ? focusClearance : 0,
          outlineStyle: "solid",
          outlineWidth: focused ? sizes.focusRing : 0,
        },
      ]}
      testID="bottom-sheet-close-action"
    >
      <X
        accessibilityElementsHidden
        accessible={false}
        color={colors.textPrimary}
        importantForAccessibility="no-hide-descendants"
        size={sizes.icon}
        strokeWidth={2}
      />
    </Pressable>
  );
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
  headingStyle,
  horizontalInset,
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
  const compactLandscapeHeight = compactLandscape
    ? Math.floor(windowHeight * 0.72)
    : undefined;
  const insets = React.useContext(SafeAreaInsetsContext) ?? {
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
  };
  const depth = React.useContext(BottomSheetDepthContext);
  const headingRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const reportVisualScroll = usePhase20VisualScrollReporter();
  const forcedEvidenceScrollRef = useRef(false);
  const scrollNativeID = scrollTestID ?? "bottom-sheet-scroll";
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
  const horizontalInsetStyle = horizontalInset === undefined
    ? undefined
    : { paddingHorizontal: horizontalInset };
  // Only the viewport owns a height cap. A cap on the content container makes
  // controls beyond that height invisible to the native scroll range.
  const { maxHeight: _contentMaxHeight, ...scrollContentStyle } = contentStyle ?? {};
  const contentPadding = StyleSheet.flatten<ViewStyle>([styles.content, scrollContentStyle]);
  const bottomPadding = contentPadding.paddingBottom
    ?? contentPadding.paddingVertical
    ?? contentPadding.padding
    ?? space[4];
  const scrollBottomInsetStyle = typeof bottomPadding === "number"
    ? { paddingBottom: bottomPadding + insets.bottom }
    : undefined;
  const initializeEvidenceScroll = React.useCallback(() => {
    if (reportVisualScroll === null || forcedEvidenceScrollRef.current) return;
    forcedEvidenceScrollRef.current = true;
    scrollRef.current?.scrollTo({ animated: false, x: 0, y: 0 });
  }, [reportVisualScroll]);

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
                pointerEvents="box-none"
                style={styles.keyboardAvoider}
                testID="bottom-sheet-keyboard-avoider"
              >
                <Animated.View
                  style={[
                    styles.frame,
                    {
                      backgroundColor: colors.raised,
                      borderColor: colors.line,
                      height: compactLandscapeHeight,
                      // Percentage padding stays caller-owned; Yoga reserves
                      // this fallback inset through the same shrink chain.
                      paddingBottom: scrollBottomInsetStyle === undefined ? insets.bottom : undefined,
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
                    style={[styles.shrinkBoundary, compactLandscape ? styles.compactBoundary : undefined]}
                    testID="bottom-sheet-frame"
                  >
                    <View
                      style={[styles.shrinkBoundary, compactLandscape ? styles.compactLayout : undefined]}
                      testID="bottom-sheet-layout"
                    >
                      <View style={[styles.header, horizontalInsetStyle]} testID="bottom-sheet-header">
                        <View
                          accessible
                          accessibilityLabel={heading}
                          accessibilityRole="header"
                          focusable
                          ref={headingRef}
                          style={styles.heading}
                        >
                          <Text style={[typeScale.screenTitle as TextStyle, headingStyle, { color: colors.textPrimary }]}>
                            {heading}
                          </Text>
                        </View>
                        <BottomSheetCloseAction
                          accessibilityLabel={resolvedCancelLabel}
                          disabled={cancelDisabled}
                          onPress={cancel}
                        />
                      </View>
                      <ScrollView
                        contentContainerStyle={[styles.content, horizontalInsetStyle, scrollContentStyle, scrollBottomInsetStyle]}
                        horizontal={false}
                        keyboardShouldPersistTaps="handled"
                        nativeID={scrollNativeID}
                        onLayout={initializeEvidenceScroll}
                        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
                          const { x, y } = event.nativeEvent.contentOffset;
                          reportVisualScroll?.({ native_id: scrollNativeID, x, y });
                        }}
                        ref={scrollRef}
                        scrollEventThrottle={16}
                        showsVerticalScrollIndicator
                        style={[
                          styles.scroll,
                          compactLandscape ? styles.compactScroll : null,
                        ]}
                        testID={scrollNativeID}
                      >
                        {children}
                      </ScrollView>
                    </View>
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
  compactBoundary: { flexBasis: 0, flexGrow: 1, flexShrink: 1, minHeight: 0 },
  compactLayout: { flexBasis: 0, flexGrow: 1, flexShrink: 1, minHeight: 0 },
  compactScroll: { flexBasis: 0, flexGrow: 1, minHeight: 0 },
  shrinkBoundary: { flexShrink: 1, minHeight: 0 },
  keyboardAvoider: { flex: 1, justifyContent: "flex-end" },
  frame: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    flexShrink: 1,
    maxHeight: "82%",
    minHeight: 0,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    justifyContent: "space-between",
    minHeight: BOTTOM_SHEET_HEADER_MIN_HEIGHT,
    paddingHorizontal: space[4],
    paddingTop: space[2],
  },
  heading: { flexShrink: 1 },
  closeAction: {
    alignItems: "center",
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    height: sizes.minimumTarget,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    minWidth: sizes.minimumTarget,
    width: sizes.minimumTarget,
  },
  scroll: { flexShrink: 1, minHeight: 0 },
  content: { gap: space[4], padding: space[4], paddingTop: space[2] },
});

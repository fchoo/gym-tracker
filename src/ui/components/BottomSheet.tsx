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
  View,
  type TextStyle,
  type NativeSyntheticEvent,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconAction } from "./index";
import { radius, space, typeScale, useAppTheme } from "../theme";

type FocusTarget = Readonly<{ focus?: () => void }>;

export type BottomSheetProps = Readonly<{
  visible: boolean;
  heading: string;
  children: React.ReactNode;
  onCancel: () => void;
  cancelLabel?: string;
  consequenceMode?: boolean;
  initialFocusRef?: React.RefObject<FocusTarget | null>;
  restoreFocusRef?: React.RefObject<FocusTarget | null>;
  testID?: string;
  contentStyle?: ViewStyle;
}>;

const BottomSheetDepthContext = React.createContext(0);
const TraversalBoundary = View as unknown as React.ComponentType<
  React.ComponentProps<typeof View> & Readonly<{
    onKeyDown?: (event: NativeSyntheticEvent<{ key?: string; preventDefault?: () => void }>) => void;
  }>
>;

function closeLabelFor(heading: string, cancelLabel?: string): string {
  return cancelLabel ?? `Close ${heading.toLocaleLowerCase()}`;
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
  cancelLabel,
  consequenceMode = false,
  initialFocusRef,
  restoreFocusRef,
  testID,
  contentStyle,
}: BottomSheetProps) {
  const { colors, reduceMotion } = useAppTheme();
  const insets = useSafeAreaInsets();
  const depth = React.useContext(BottomSheetDepthContext);
  const headingRef = useRef<View>(null);
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

  const cancel = React.useCallback(() => {
    onCancel();
    restoreFocusRef?.current?.focus?.();
  }, [onCancel, restoreFocusRef]);

  const containTraversal = React.useCallback((event: NativeSyntheticEvent<{
    key?: string;
    preventDefault?: () => void;
  }>) => {
    const key = event.nativeEvent.key;
    if (key === "Escape") {
      event.nativeEvent.preventDefault?.();
      cancel();
      return;
    }
    if (key === "Tab" || key?.startsWith("Arrow") === true) {
      event.nativeEvent.preventDefault?.();
    }
  }, [cancel]);

  return (
    <BottomSheetDepthContext.Provider value={depth + 1}>
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
                  paddingBottom: insets.bottom,
                  transform: [{ translateY: translation }],
                },
              ]}
            >
              <TraversalBoundary
                accessibilityViewIsModal
                importantForAccessibility="yes"
                onKeyDown={containTraversal as never}
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
                    icon="clear"
                    onPress={cancel}
                  />
                </View>
                <ScrollView
                  contentContainerStyle={[styles.content, contentStyle]}
                  keyboardShouldPersistTaps="handled"
                  style={styles.scroll}
                  testID="bottom-sheet-scroll"
                >
                  {children}
                </ScrollView>
              </TraversalBoundary>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </BottomSheetDepthContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.68)",
    flex: 1,
    justifyContent: "flex-end",
  },
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
  scroll: { maxHeight: "82%" },
  content: { gap: space[4], padding: space[4], paddingTop: space[2] },
});

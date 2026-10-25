import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type TextInputProps,
  type TextStyle,
  type ViewProps,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import {
  scheduleOnRN,
} from "react-native-worklets";

import {
  FocusablePressable,
} from "./index";
import {
  GripVertical,
} from "lucide-react-native";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";
import {
  SemanticNumberField,
  type SemanticNumberFieldProps,
} from "./SemanticNumberField";
import {
  TimeDurationField,
  type TimeDurationFieldProps,
} from "./TimeDurationField";

export {
  SemanticNumberField,
  TimeDurationField,
};
export type {
  SemanticNumberFieldProps,
  TimeDurationFieldProps,
};

export type PlanEditorReorderPreview = Readonly<{
  sourcePosition: number;
  targetPosition: number;
  translationY: number;
  rowHeight: number;
}>;

export type PlanEditorReorderMethod = "drag" | "fallback";

const REORDER_HOLD_MS = 550;

function targetPositionForDrag(
  position: number,
  count: number,
  translationY: number,
  rowHeight: number,
): number {
  "worklet";
  const offset = Math.round(translationY / rowHeight);
  return Math.max(0, Math.min(count - 1, position + offset));
}

function displacementForRow(
  position: number,
  preview: PlanEditorReorderPreview | null,
): number {
  if (preview === null || position === preview.sourcePosition) {
    return 0;
  }
  if (
    preview.sourcePosition < preview.targetPosition
    && position > preview.sourcePosition
    && position <= preview.targetPosition
  ) {
    return -preview.rowHeight;
  }
  if (
    preview.sourcePosition > preview.targetPosition
    && position >= preview.targetPosition
    && position < preview.sourcePosition
  ) {
    return preview.rowHeight;
  }
  return 0;
}

export function PlanEditorTextField({
  label,
  value,
  onChangeText,
  error,
  help,
  inputRef,
  tone = "default",
  ...inputProps
}: Readonly<{
  label: string;
  value: string;
  onChangeText(value: string): void;
  error?: string | undefined;
  help?: string | undefined;
  inputRef?: React.Ref<TextInput> | undefined;
  tone?: "default" | "card";
}> & Omit<TextInputProps, "accessibilityLabel" | "onChangeText" | "value">) {
  const { colors } = useAppTheme();
  const labelColor = tone === "card"
    ? colors.contentCardText
    : colors.textPrimary;
  const helpColor = tone === "card"
    ? colors.contentCardTextSecondary
    : colors.textSecondary;

  return (
    <View style={styles.field}>
      <Text style={[
        typeScale.label as TextStyle,
        { color: labelColor },
      ]}>
        {label}
      </Text>
      {help === undefined ? null : (
        <Text style={[
          typeScale.secondary as TextStyle,
          { color: helpColor },
        ]}>
          {help}
        </Text>
      )}
      <TextInput
        {...inputProps}
        accessibilityLabel={label}
        ref={inputRef}
        onChangeText={onChangeText}
        style={[
          typeScale.body as TextStyle,
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: error === undefined
              ? colors.divider
              : colors.destructive,
            color: colors.textPrimary,
          },
        ]}
        value={value}
      />
      {error === undefined ? null : (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            typeScale.secondary as TextStyle,
            { color: colors.destructive },
          ]}
        >
          {error}
        </Text>
      )}
    </View>
  );
}

function PlanEditorAnimatedRow({
  hasPreview,
  isHeld,
  translationY,
  neighborDisplacement,
  animatePosition,
  duration,
  children,
  style,
  ...viewProps
}: Readonly<{
  hasPreview: boolean;
  isHeld: boolean;
  translationY: SharedValue<number>;
  neighborDisplacement: number;
  animatePosition: boolean;
  duration: number;
}> & Pick<ViewProps, "children" | "onLayout" | "style" | "testID">) {
  const rowStyle = useAnimatedStyle(() => ({
    opacity: isHeld ? 0.92 : 1,
    transform: [{
      translateY: !hasPreview
        ? 0
        : isHeld
          ? translationY.value
          : animatePosition
            ? withTiming(neighborDisplacement, { duration })
            : neighborDisplacement,
    }],
    zIndex: isHeld ? 1 : 0,
  }), [hasPreview, isHeld, animatePosition, duration, neighborDisplacement]);

  return <Animated.View {...viewProps} collapsable={false} style={[style, rowStyle]}>
    {children}
  </Animated.View>;
}

export function PlanEditorReorderableRow({
  label,
  position,
  count,
  onMoveUp,
  onMoveDown,
  onMoveTo,
  onDragPreview,
  preview,
  dragActivationDistance,
  disabled = false,
  reorderId = label,
  children,
  trailing,
  tone = "default",
  moveEarlierLabel = "Move earlier",
  moveLaterLabel = "Move later",
}: Readonly<{
  label: string;
  position: number;
  count: number;
  onMoveUp(): void;
  onMoveDown(): void;
  onMoveTo?(
    targetPosition: number,
    method: PlanEditorReorderMethod,
  ): void | Promise<void>;
  onDragPreview?(preview: PlanEditorReorderPreview | null): void;
  preview?: PlanEditorReorderPreview | null;
  dragActivationDistance?: number | undefined;
  disabled?: boolean;
  reorderId?: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
  tone?: "default" | "card";
  moveEarlierLabel?: string;
  moveLaterLabel?: string;
}>) {
  const { fontScale } = useWindowDimensions();
  const { colors, motion } = useAppTheme();
  const [rowHeight, setRowHeight] = React.useState(
    sizes.minimumTarget + space[4],
  );
  const [localPreview, setLocalPreview] =
    React.useState<PlanEditorReorderPreview | null>(null);
  const localPreviewRef = React.useRef<PlanEditorReorderPreview | null>(null);
  const translationY = useSharedValue(0);
  const dragActive = useSharedValue(false);
  const dropPending = useSharedValue(false);
  const previewTarget = useSharedValue(position);
  const pendingMoveRef = React.useRef(false);
  const border = tone === "card" ? colors.contentCardBorder : colors.divider;
  const text = tone === "card" ? colors.contentCardText : colors.textPrimary;
  const canMoveUp = !disabled && position > 0;
  const canMoveDown = !disabled && position < count - 1;
  const activePreview = preview === undefined
    ? (localPreview?.sourcePosition === position ? localPreview : null)
    : preview;
  const hasPreview = activePreview !== null;
  const isHeld = activePreview?.sourcePosition === position;
  const targetPosition = isHeld
    ? activePreview.targetPosition
    : position;
  const neighborDisplacement = displacementForRow(position, activePreview);
  const largeText = fontScale >= 2;
  const publishPreview = React.useCallback((
    nextPreview: PlanEditorReorderPreview | null,
  ) => {
    const current = localPreviewRef.current;
    if (current === nextPreview || (current !== null && nextPreview !== null
      && current.sourcePosition === nextPreview.sourcePosition
      && current.targetPosition === nextPreview.targetPosition
      && current.rowHeight === nextPreview.rowHeight)) return;
    localPreviewRef.current = nextPreview;
    setLocalPreview(nextPreview);
    onDragPreview?.(nextPreview);
  }, [onDragPreview]);
  const requestMove = React.useCallback((
    nextPosition: number,
    method: PlanEditorReorderMethod = "fallback",
  ) => {
    if (disabled || nextPosition === position
      || (pendingMoveRef.current && method !== "drag")) {
      return;
    }
    if (onMoveTo !== undefined) {
      return onMoveTo(nextPosition, method);
    }
    if (nextPosition < position && canMoveUp) {
      onMoveUp();
    }
    if (nextPosition > position && canMoveDown) {
      onMoveDown();
    }
  }, [
    canMoveDown,
    canMoveUp,
    disabled,
    onMoveDown,
    onMoveTo,
    onMoveUp,
    position,
  ]);
  const updatePreview = React.useCallback((nextPosition: number) => {
    publishPreview({
      sourcePosition: position,
      targetPosition: nextPosition,
      translationY: (nextPosition - position) * rowHeight,
      rowHeight,
    });
  }, [position, publishPreview, rowHeight]);
  const clearDrag = React.useCallback(() => {
    dragActive.value = false;
    dropPending.value = false;
    translationY.value = 0;
    publishPreview(null);
  }, [dragActive, dropPending, publishPreview, translationY]);
  const finishDrag = React.useCallback(async (nextPosition: number) => {
    if (pendingMoveRef.current) return;
    pendingMoveRef.current = true;
    updatePreview(nextPosition);
    try {
      // The preview is presentation only. Its owner applies committed state.
      await requestMove(nextPosition, "drag");
    } catch {
      // Command owners report the failure; release the pending presentation.
    } finally {
      pendingMoveRef.current = false;
      clearDrag();
    }
  }, [clearDrag, requestMove, updatePreview]);
  const dragGesture = React.useMemo(() => {
    const gesture = Gesture.Pan()
    .enabled(!disabled)
    .activateAfterLongPress(REORDER_HOLD_MS)
    .maxPointers(1)
    .shouldCancelWhenOutside(false)
    .withTestId(`reorder-gesture-${reorderId}`)
    .onStart(() => {
      if (dropPending.value) return;
      dragActive.value = true;
      previewTarget.value = position;
      translationY.value = 0;
      scheduleOnRN(updatePreview, position);
    })
    .onUpdate((event) => {
      if (!dragActive.value || dropPending.value) return;
      const minimumTranslation = -position * rowHeight;
      const maximumTranslation = (count - position - 1) * rowHeight;
      const boundedTranslation = Math.max(
        minimumTranslation,
        Math.min(maximumTranslation, event.translationY),
      );
      translationY.value = boundedTranslation;
      const nextPosition = targetPositionForDrag(
        position, count, boundedTranslation, rowHeight,
      );
      if (nextPosition !== previewTarget.value) {
        previewTarget.value = nextPosition;
        scheduleOnRN(updatePreview, nextPosition);
      }
    })
    .onEnd((event, success) => {
      if (!dragActive.value) return;
      dragActive.value = false;
      const nextPosition = targetPositionForDrag(
        position, count, event.translationY, rowHeight,
      );
      if (success && nextPosition !== position) {
        dropPending.value = true;
        translationY.value = withTiming(
          (nextPosition - position) * rowHeight,
          { duration: motion.setCommitMs },
        );
        scheduleOnRN(finishDrag, nextPosition);
      }
    })
    .onFinalize(() => {
      // A successful drop keeps both source and neighbor offsets until commit.
      if (dropPending.value) return;
      dragActive.value = false;
      translationY.value = withTiming(0, { duration: motion.setCommitMs });
      scheduleOnRN(publishPreview, null);
    });
    if (dragActivationDistance !== undefined) {
      gesture.activeOffsetY([-dragActivationDistance, dragActivationDistance]);
    }
    return gesture;
  }, [
    count,
    disabled,
    dragActive,
    dragActivationDistance,
    dropPending,
    finishDrag,
    motion.setCommitMs,
    position,
    previewTarget,
    publishPreview,
    reorderId,
    rowHeight,
    translationY,
    updatePreview,
  ]);
  const recordRowHeight = React.useCallback((event: LayoutChangeEvent) => {
    const measuredHeight = Math.max(
      sizes.minimumTarget,
      event.nativeEvent.layout.height,
    );
    setRowHeight((current) =>
      current === measuredHeight ? current : measuredHeight);
  }, []);

  return (
    <GestureHandlerRootView style={styles.dragGestureRoot}>
      <PlanEditorAnimatedRow
        // A committed position creates a fresh native node and animated style
        // owner; displaced native props cannot follow it into the new layout.
        key={position}
        animatePosition={motion.positionTransitions}
        duration={motion.setCommitMs}
        hasPreview={hasPreview}
        isHeld={isHeld}
        neighborDisplacement={neighborDisplacement}
        onLayout={recordRowHeight}
        style={[
          styles.reorderRow,
          {
            backgroundColor: isHeld
              ? colors.contentCardSelected
              : "transparent",
            borderColor: isHeld ? colors.action : border,
          },
        ]}
        testID={`reorder-row-${reorderId}`}
        translationY={translationY}
      >
        <GestureDetector gesture={dragGesture}>
          <FocusablePressable
            accessibilityActions={[
              ...(canMoveUp ? [{ name: "increment", label: moveEarlierLabel }] : []),
              ...(canMoveDown
                ? [{ name: "decrement", label: moveLaterLabel }]
                : []),
            ]}
            accessibilityHint="Touch and hold to drag. Use accessibility actions to move this item."
            accessibilityLabel={`Reorder ${label}`}
            accessibilityRole="adjustable"
            accessibilityState={{ busy: isHeld, disabled }}
            disabled={disabled}
            focusable={!disabled && !isHeld}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === "increment" && canMoveUp) {
                requestMove(position - 1);
              }
              if (event.nativeEvent.actionName === "decrement" && canMoveDown) {
                requestMove(position + 1);
              }
            }}
            onKeyDown={(event) => {
              const { key } = event.nativeEvent;
              const shiftKey = (event.nativeEvent as Readonly<{
                shiftKey?: boolean;
              }>).shiftKey === true;
              if (key === "Enter" || key === " ") {
                requestMove(position + 1);
                return;
              }
              if (key === "Escape") {
                if (!pendingMoveRef.current) clearDrag();
                return;
              }
              if (!shiftKey) {
                return;
              }
              if (key === "ArrowUp" && canMoveUp) {
                requestMove(position - 1);
              }
              if (key === "ArrowDown" && canMoveDown) {
                requestMove(position + 1);
              }
            }}
            onPress={() => undefined}
            style={[
              styles.dragTarget,
              { borderColor: isHeld ? colors.action : border },
            ]}
            testID={`drag-${reorderId}`}
          >
            <GripVertical
              accessibilityElementsHidden
              color={text}
              importantForAccessibility="no-hide-descendants"
              size={sizes.icon}
              strokeWidth={2}
            />
          </FocusablePressable>
        </GestureDetector>
        <View style={[
          styles.reorderContent,
          largeText ? styles.reorderContentLargeText : null,
        ]} testID={`reorder-content-${reorderId}`}>
          <View style={styles.reorderLabels}>
            {children}
          </View>
          {trailing === undefined ? null : (
            <View style={styles.reorderTrailing}>
              {trailing}
            </View>
          )}
        </View>
      </PlanEditorAnimatedRow>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: space[1],
  },
  input: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  reorderRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: space[2],
    paddingVertical: space[2],
  },
  dragGestureRoot: {
    width: "100%",
  },
  dragTarget: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    minWidth: sizes.minimumTarget,
    paddingHorizontal: space[2],
  },
  reorderContent: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: space[2],
    minWidth: 0,
  },
  reorderContentLargeText: {
    alignItems: "stretch",
    flexDirection: "column",
  },
  reorderLabels: {
    flex: 1,
    minWidth: 0,
  },
  reorderTrailing: {
    flexShrink: 0,
  },
});

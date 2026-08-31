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
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS as scheduleOnJavaScript,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  FocusablePressable,
  IconAction,
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

const REORDER_HOLD_MS = 550;

function targetPositionForDrag(
  position: number,
  count: number,
  translationY: number,
  rowHeight: number,
): number {
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
  tone = "default",
  ...inputProps
}: Readonly<{
  label: string;
  value: string;
  onChangeText(value: string): void;
  error?: string | undefined;
  help?: string | undefined;
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

export function PlanEditorReorderableRow({
  label,
  position,
  count,
  onMoveUp,
  onMoveDown,
  onMoveTo,
  onDragPreview,
  preview = null,
  reorderId = label,
  children,
  tone = "default",
}: Readonly<{
  label: string;
  position: number;
  count: number;
  onMoveUp(): void;
  onMoveDown(): void;
  onMoveTo?(targetPosition: number): void;
  onDragPreview?(preview: PlanEditorReorderPreview | null): void;
  preview?: PlanEditorReorderPreview | null;
  reorderId?: string;
  children: React.ReactNode;
  tone?: "default" | "card";
}>) {
  const { fontScale } = useWindowDimensions();
  const { colors, motion } = useAppTheme();
  const [rowHeight, setRowHeight] = React.useState(
    sizes.minimumTarget + space[4],
  );
  const [localPreview, setLocalPreview] =
    React.useState<PlanEditorReorderPreview | null>(null);
  const translationY = useSharedValue(0);
  const border = tone === "card" ? colors.contentCardBorder : colors.divider;
  const text = tone === "card" ? colors.contentCardText : colors.textPrimary;
  const secondary = tone === "card"
    ? colors.contentCardTextSecondary
    : colors.textSecondary;
  const canMoveUp = position > 0;
  const canMoveDown = position < count - 1;
  const activePreview = preview ?? localPreview;
  const isHeld = activePreview?.sourcePosition === position;
  const targetPosition = isHeld
    ? activePreview.targetPosition
    : position;
  const neighborDisplacement = displacementForRow(position, activePreview);
  const largeText = fontScale >= 2;
  const publishPreview = React.useCallback((
    nextPreview: PlanEditorReorderPreview | null,
  ) => {
    setLocalPreview(nextPreview);
    onDragPreview?.(nextPreview);
  }, [onDragPreview]);
  const requestMove = React.useCallback((nextPosition: number) => {
    if (nextPosition === position) {
      return;
    }
    if (onMoveTo !== undefined) {
      onMoveTo(nextPosition);
      return;
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
    onMoveDown,
    onMoveTo,
    onMoveUp,
    position,
  ]);
  const updatePreview = React.useCallback((nextTranslationY: number) => {
    publishPreview({
      sourcePosition: position,
      targetPosition: targetPositionForDrag(
        position,
        count,
        nextTranslationY,
        rowHeight,
      ),
      translationY: nextTranslationY,
      rowHeight,
    });
  }, [count, position, publishPreview, rowHeight]);
  const finishDrag = React.useCallback((nextTranslationY: number) => {
    requestMove(targetPositionForDrag(
      position,
      count,
      nextTranslationY,
      rowHeight,
    ));
  }, [count, position, requestMove, rowHeight]);
  const dragGesture = React.useMemo(() => Gesture.Pan()
    .activateAfterLongPress(REORDER_HOLD_MS)
    .maxPointers(1)
    .shouldCancelWhenOutside(false)
    .withTestId(`reorder-gesture-${reorderId}`)
    .onStart(() => {
      translationY.value = 0;
      scheduleOnJavaScript(updatePreview)(0);
    })
    .onUpdate((event) => {
      const minimumTranslation = -position * rowHeight;
      const maximumTranslation = (count - position - 1) * rowHeight;
      const boundedTranslation = Math.max(
        minimumTranslation,
        Math.min(maximumTranslation, event.translationY),
      );
      translationY.value = boundedTranslation;
      scheduleOnJavaScript(updatePreview)(boundedTranslation);
    })
    .onEnd((event, success) => {
      if (success) {
        scheduleOnJavaScript(finishDrag)(event.translationY);
      }
    })
    .onFinalize(() => {
      translationY.value = withTiming(0, { duration: motion.setCommitMs });
      scheduleOnJavaScript(publishPreview)(null);
    }), [
    count,
    finishDrag,
    motion.setCommitMs,
    position,
    publishPreview,
    reorderId,
    rowHeight,
    translationY,
    updatePreview,
  ]);
  const rowStyle = useAnimatedStyle(() => ({
    opacity: isHeld ? 0.92 : 1,
    transform: [{
      translateY: isHeld
        ? translationY.value
        : motion.positionTransitions
          ? withTiming(neighborDisplacement, { duration: motion.setCommitMs })
          : neighborDisplacement,
    }],
    zIndex: isHeld ? 1 : 0,
  }), [
    isHeld,
    motion.positionTransitions,
    motion.setCommitMs,
    neighborDisplacement,
  ]);
  const handleLabel = isHeld
    ? `Drag ${label}. Moving to position ${targetPosition + 1} of ${count}`
    : `Drag ${label}. Position ${position + 1} of ${count}`;
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
      <Animated.View
        onLayout={recordRowHeight}
        style={[
          styles.reorderRow,
          rowStyle,
          {
            backgroundColor: isHeld
              ? colors.contentCardSelected
              : "transparent",
            borderColor: isHeld ? colors.action : border,
          },
        ]}
        testID={`reorder-row-${reorderId}`}
      >
        <GestureDetector gesture={dragGesture}>
          <FocusablePressable
            accessibilityActions={[
              ...(canMoveUp ? [{ name: "increment", label: "Move up" }] : []),
              ...(canMoveDown
                ? [{ name: "decrement", label: "Move down" }]
                : []),
            ]}
            accessibilityHint="Touch and hold to drag, or use Move up and Move down."
            accessibilityLabel={handleLabel}
            accessibilityRole="adjustable"
            accessibilityState={{ busy: isHeld }}
            focusable
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === "increment" && canMoveUp) {
                requestMove(position - 1);
              }
              if (event.nativeEvent.actionName === "decrement" && canMoveDown) {
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
        ]}>
          <View style={styles.reorderLabels}>
            {children}
          </View>
          <Text style={[
            typeScale.secondary as TextStyle,
            styles.reorderPosition,
            { color: secondary },
          ]}>
            {`Position ${position + 1} of ${count}`}
          </Text>
          <View style={styles.reorderActions}>
            <IconAction
              accessibilityLabel={`Move ${label} up`}
              disabled={!canMoveUp}
              icon="moveUp"
              onPress={() => requestMove(position - 1)}
              tone={tone}
            />
            <IconAction
              accessibilityLabel={`Move ${label} down`}
              disabled={!canMoveDown}
              icon="moveDown"
              onPress={() => requestMove(position + 1)}
              tone={tone}
            />
          </View>
        </View>
      </Animated.View>
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
    minHeight: sizes.minimumTarget,
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
  reorderPosition: {
    flexShrink: 0,
  },
  reorderActions: {
    flexDirection: "row",
    flexShrink: 0,
    gap: space[2],
  },
});

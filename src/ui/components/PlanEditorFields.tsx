import React from "react";
import {
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from "react-native";

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
  children,
  tone = "default",
}: Readonly<{
  label: string;
  position: number;
  count: number;
  onMoveUp(): void;
  onMoveDown(): void;
  children: React.ReactNode;
  tone?: "default" | "card";
}>) {
  const { colors } = useAppTheme();
  const border = tone === "card" ? colors.contentCardBorder : colors.divider;
  const text = tone === "card" ? colors.contentCardText : colors.textPrimary;
  const secondary = tone === "card"
    ? colors.contentCardTextSecondary
    : colors.textSecondary;
  const canMoveUp = position > 0;
  const canMoveDown = position < count - 1;
  const dragResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_event, gesture) =>
      Math.abs(gesture.dy) >= space[2],
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy <= -space[6] && canMoveUp) {
        onMoveUp();
      }
      if (gesture.dy >= space[6] && canMoveDown) {
        onMoveDown();
      }
    },
  }), [canMoveDown, canMoveUp, onMoveDown, onMoveUp]);

  return (
    <View
      style={[
        styles.reorderRow,
        { borderColor: border },
      ]}
    >
      <FocusablePressable
        {...dragResponder.panHandlers}
        accessibilityActions={[
          ...(canMoveUp ? [{ name: "increment", label: "Move up" }] : []),
          ...(canMoveDown
            ? [{ name: "decrement", label: "Move down" }]
            : []),
        ]}
        accessibilityHint="Drag to reorder, or use Move up and Move down."
        accessibilityLabel={`Drag ${label}. Position ${position + 1} of ${count}`}
        accessibilityRole="adjustable"
        focusable
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment" && canMoveUp) {
            onMoveUp();
          }
          if (event.nativeEvent.actionName === "decrement" && canMoveDown) {
            onMoveDown();
          }
        }}
        onPress={() => undefined}
        style={[
          styles.dragHandle,
          { borderColor: border },
        ]}
        testID={`drag-${label}`}
      >
        <GripVertical
          accessibilityElementsHidden
          color={text}
          importantForAccessibility="no-hide-descendants"
          size={sizes.icon}
          strokeWidth={2}
        />
      </FocusablePressable>
      <View style={styles.reorderContent}>
        {children}
        <Text style={[
          typeScale.secondary as TextStyle,
          { color: secondary },
        ]}>
          {`Position ${position + 1} of ${count}`}
        </Text>
        <View style={styles.reorderActions}>
          <IconAction
            accessibilityLabel={`Move ${label} up`}
            disabled={!canMoveUp}
            icon="moveUp"
            onPress={onMoveUp}
            tone={tone}
          />
          <IconAction
            accessibilityLabel={`Move ${label} down`}
            disabled={!canMoveDown}
            icon="moveDown"
            onPress={onMoveDown}
            tone={tone}
          />
        </View>
      </View>
    </View>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: space[2],
    paddingVertical: space[2],
  },
  dragHandle: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    minWidth: sizes.minimumTarget,
    paddingHorizontal: space[2],
  },
  reorderContent: {
    flex: 1,
    gap: space[2],
    minWidth: 0,
  },
  reorderActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
});

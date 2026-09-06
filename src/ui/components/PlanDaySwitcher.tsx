import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type {
  OwnedPlanDayInput,
} from "../../domains/plans";
import {
  FocusablePressable,
} from "./index";
import {
  PlanEditorReorderableRow,
  type PlanEditorReorderMethod,
  type PlanEditorReorderPreview,
} from "./PlanEditorFields";
import {
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export function PlanDaySwitcher({
  days,
  selectedDayId,
  onSelectDay,
  onMoveDay,
  onDragPreview,
  preview,
}: Readonly<{
  days: readonly OwnedPlanDayInput[];
  selectedDayId: string | null;
  onSelectDay(dayId: string): void;
  onMoveDay(
    dayId: string,
    targetIndex: number,
    method: PlanEditorReorderMethod,
  ): void;
  onDragPreview(preview: PlanEditorReorderPreview | null): void;
  preview: PlanEditorReorderPreview | null;
}>) {
  const { colors } = useAppTheme();

  return (
    <View accessibilityLabel="Plan days" accessibilityRole="list">
      {days.map((day, index) => {
        const count = day.occurrences.length;
        const label = `${day.name}. ${count} exercises`;
        return (
          <PlanEditorReorderableRow
            count={days.length}
            key={day.id}
            label={day.name}
            onDragPreview={onDragPreview}
            onMoveDown={() => onMoveDay(day.id, index + 1, "fallback")}
            onMoveTo={(targetIndex, method) =>
              onMoveDay(day.id, targetIndex, method)}
            onMoveUp={() => onMoveDay(day.id, index - 1, "fallback")}
            position={index}
            preview={preview}
            reorderId={`day-${day.name}`}
            tone="card"
          >
            <FocusablePressable
              accessibilityLabel={label}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedDayId === day.id }}
              focusable
              onPress={() => onSelectDay(day.id)}
              style={styles.select}
            >
              <Text style={[
                typeScale.bodyStrong as TextStyle,
                { color: colors.contentCardText },
              ]}>
                {day.name}
              </Text>
              <Text style={[
                typeScale.secondary as TextStyle,
                { color: colors.contentCardTextSecondary },
              ]}>
                {`${count} ${count === 1 ? "exercise" : "exercises"}`}
              </Text>
            </FocusablePressable>
          </PlanEditorReorderableRow>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  select: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[1],
    minHeight: sizes.minimumTarget,
    minWidth: 0,
  },
});

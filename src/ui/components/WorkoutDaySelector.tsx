import React, { useMemo, useRef } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import { FocusablePressable } from "./index";
import { space, workoutTypeScale, useAppTheme } from "../theme";

export type WorkoutDayPreview = Readonly<{
  id: string;
  label: string;
  detail: string;
}>;

export function WorkoutDaySelector({
  items,
  selectedId,
  onSelect,
}: Readonly<{
  items: readonly WorkoutDayPreview[];
  selectedId: string;
  onSelect: (id: string) => void;
}>) {
  const { colors } = useAppTheme();
  const refs = useRef<Array<View | null>>([]);
  const selectable = useMemo(() => items.slice(0, 5), [items]);
  const move = (index: number) => {
    const next = selectable[index];
    if (next === undefined) return;
    onSelect(next.id);
    refs.current[index]?.focus?.();
  };

  return (
    <View accessibilityLabel="Workout day previews" accessibilityRole="tablist" style={styles.row}>
      {selectable.map((item, index) => {
        const selected = item.id === selectedId;
        return (
          <FocusablePressable
            accessibilityHint={selected
              ? "Selected day preview. Use Arrow keys, Home, or End to move focus."
              : "Day preview. Use Arrow keys, Home, or End from the selected preview to move focus."}
            accessibilityLabel={`Preview ${item.label}. ${item.detail}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            focusable={selected}
            key={item.id}
            onKeyDown={(event) => {
              const key = event.nativeEvent.key;
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) {
                (event as unknown as { preventDefault?: () => void }).preventDefault?.();
              }
              if (key === "ArrowLeft") move(Math.max(0, index - 1));
              if (key === "ArrowRight") move(Math.min(selectable.length - 1, index + 1));
              if (key === "Home") move(0);
              if (key === "End") move(selectable.length - 1);
              if (key === "Enter" || key === " ") onSelect(item.id);
            }}
            onPress={() => onSelect(item.id)}
            ref={(node) => { refs.current[index] = node; }}
            style={[
              styles.item,
              {
                backgroundColor: selected ? colors.surfaceSubtle : colors.contentCard,
                borderColor: selected ? colors.orange : colors.contentCardBorder,
              },
            ]}
            testID={`workout-day-preview-${item.id}`}
          >
            <Text style={[workoutTypeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>{item.label}</Text>
            <Text style={[workoutTypeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>{item.detail}</Text>
          </FocusablePressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space[1] },
  item: { flex: 1, gap: space[1], minHeight: 56, padding: space[2], borderWidth: 1 },
});

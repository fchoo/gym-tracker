import React from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import type { WorkoutPresentationSet } from "../../domains/workout/workoutPresentation";
import { space, workoutTypeScale, useAppTheme } from "../theme";

export function WorkoutSetFactsRow({ set }: Readonly<{ set: WorkoutPresentationSet }>) {
  const { colors } = useAppTheme();
  const ordinal = set.kind === "warmup" ? `W${set.ordinal}` : String(set.ordinal).padStart(2, "0");
  const state = set.status === "completed" ? "Completed" : set.status === "draft" ? "Current" : set.status === "skipped" ? "Skipped" : "Planned";
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: set.status === "draft" ? colors.yellowBg : "transparent" },
      ]}
      testID={`workout-presentation-set-${set.id}`}
    >
      <Text style={[workoutTypeScale.bodyStrong as TextStyle, styles.ordinal, { color: colors.textPrimary }]}>{ordinal}</Text>
      <Text style={[workoutTypeScale.secondary as TextStyle, styles.fact, { color: colors.textSecondary }]}>{set.previous ?? "—"}</Text>
      <Text style={[workoutTypeScale.secondary as TextStyle, styles.fact, { color: colors.textPrimary }]}>{set.result ?? set.target}</Text>
      <Text style={[workoutTypeScale.secondary as TextStyle, styles.state, { color: set.status === "draft" ? colors.yellow : colors.textSecondary }]}>{state}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: space[2], minHeight: 60, paddingHorizontal: space[2] },
  ordinal: { width: 40 },
  fact: { flex: 1 },
  state: { textAlign: "right", width: 68 },
});

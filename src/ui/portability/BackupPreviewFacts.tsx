import React from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import { space, typeScale, useAppTheme } from "../theme";

/** Pure portable-backup fact presentation shared by manual preview surfaces. */
export function BackupPreviewFact({
  label,
  value,
}: Readonly<{
  label: string;
  value: string | number;
}>) {
  const { colors } = useAppTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      accessibilityRole="text"
      style={styles.row}
    >
      <Text style={[typeScale.label as TextStyle, { color: colors.contentCardText }]}>{label}</Text>
      <Text style={[typeScale.secondary as TextStyle, styles.value, { color: colors.contentCardTextSecondary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", gap: space[1], justifyContent: "space-between" },
  value: { fontVariant: ["tabular-nums"] },
});

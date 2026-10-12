import React from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { PrimaryAction } from "./index";
import { space, typeScale, useAppTheme } from "../theme";

export type BodyweightHistoryEntry = Readonly<{
  entryId: string;
  revision: number;
  localDate: string;
  grams: number;
}>;

export type BodyweightHistorySheetProps = Readonly<{
  visible: boolean;
  entries: readonly BodyweightHistoryEntry[];
  onClose(): void;
  onAdd(): void;
}>;

/** Presents optional source facts; writes, reloads, and target isolation stay above the sheet. */
export function BodyweightHistorySheet({ visible, entries, onAdd, onClose }: BodyweightHistorySheetProps) {
  const { colors } = useAppTheme();
  const activeEntries = entries.slice().sort((left, right) => right.localDate.localeCompare(left.localDate));
  return (
    <BottomSheet
      cancelLabel="Close bodyweight"
      contentStyle={styles.content}
      heading="Bodyweight"
      onCancel={onClose}
      scrollTestID="bodyweight-history-sheet-content"
      visible={visible}
    >
      <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>
        Bodyweight is optional, used only for bodyweight-relative views, and never changes workout targets automatically.
      </Text>
      {activeEntries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>No bodyweight entries</Text>
          <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Add one only if bodyweight-relative strength is useful to you. Nothing else in Progress depends on it.</Text>
          <PrimaryAction label="Add first entry" onPress={onAdd} />
        </View>
      ) : (
        <PrimaryAction label="Add entry" onPress={onAdd} />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: space[4], maxHeight: "82%" },
  empty: { gap: space[4] },
});

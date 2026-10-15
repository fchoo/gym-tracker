import React from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { PrimaryAction } from "./index";
import { space, typeScale, useAppTheme } from "../theme";

export type ProgressSettingsSheetProps = Readonly<{
  visible: boolean;
  onClose(): void;
  onOpenBodyweightHistory(): void;
  bodyweightActionRef?: React.RefObject<View | null>;
  restoreFocusRef?: React.RefObject<View | null>;
}>;

/** Settings disclosure only; Progress remains a factual view with no score authority. */
export function ProgressSettingsSheet({ visible, onClose, onOpenBodyweightHistory, bodyweightActionRef, restoreFocusRef }: ProgressSettingsSheetProps) {
  const { colors } = useAppTheme();
  return (
    <BottomSheet
      cancelLabel="Close progress settings"
      contentStyle={styles.content}
      heading="Progress settings"
      onCancel={onClose}
      restoreFocusRef={restoreFocusRef}
      scrollTestID="progress-settings-sheet-content"
      testID="progress-settings-sheet"
      visible={visible}
    >
      <PrimaryAction label="Bodyweight history" onPress={onOpenBodyweightHistory} ref={bodyweightActionRef} />
      <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>Personal history is the benchmark. No readiness or composite score is calculated.</Text>
      <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Bodyweight is optional, used only for relative strength views, and never changes targets automatically. Gender and height are not collected.</Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: space[4], maxHeight: "82%" },
});

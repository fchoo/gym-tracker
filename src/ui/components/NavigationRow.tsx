import { ChevronRight, Download, RotateCcw, Share2 } from "lucide-react-native";
import React, { forwardRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type TextStyle } from "react-native";

import { sizes, space, typeScale, useAppTheme } from "../theme";

export type NavigationRowIcon = "chevron" | "download" | "share" | "retry";

export type NavigationRowProps = Readonly<{
  title: string;
  supportingText?: string;
  accessibilityHint?: string;
  icon?: NavigationRowIcon;
  busy?: boolean;
  disabled?: boolean;
  nativeID?: string;
  /** Collection rows grow without changing compact Settings/action rows. */
  density?: "compact" | "collection" | "activePlan";
  onPress(): void;
}>;

/** A render-only full-row destination/action; its owner retains all workflow state. */
export const NavigationRow = forwardRef<View, NavigationRowProps>(function NavigationRow({
  title,
  supportingText,
  accessibilityHint,
  icon = "chevron",
  busy = false,
  disabled = false,
  nativeID,
  density = "compact",
  onPress,
}, ref) {
  const { colors } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const inactive = disabled || busy;
  const Icon = icon === "download" ? Download : icon === "share" ? Share2 : icon === "retry" ? RotateCcw : ChevronRight;
  return (
    <Pressable
      accessibilityHint={inactive ? undefined : accessibilityHint}
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: inactive }}
      disabled={inactive}
      nativeID={nativeID}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...({ onKeyDown: (event: { nativeEvent: { key: string } }) => {
        if (!inactive && (event.nativeEvent.key === "Enter" || event.nativeEvent.key === " ")) onPress();
      } } as unknown as object)}
      onPress={onPress}
      ref={ref}
      style={({ pressed }) => [
        styles.row,
        density === "collection" && styles.collectionRow,
        density === "activePlan" && styles.activePlanRow,
        { borderColor: focused ? colors.focusRing : colors.divider, backgroundColor: pressed ? colors.surfaceSubtle : "transparent", opacity: inactive ? 0.62 : 1 },
      ]}
    >
      <View style={styles.copy}>
        <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{title}</Text>
        {supportingText === undefined ? null : <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{supportingText}</Text>}
      </View>
      <Icon accessible={false} color={colors.textSecondary} size={sizes.inlineIcon} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: space[2], minHeight: sizes.minimumTarget, paddingVertical: space[2] },
  collectionRow: { minHeight: sizes.collectionRow },
  activePlanRow: { minHeight: sizes.activePlanRow },
  copy: { flex: 1, gap: space[1] },
});

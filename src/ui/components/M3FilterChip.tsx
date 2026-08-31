import {
  Check,
  Star,
} from "lucide-react-native";
import React from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
} from "react-native";

import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";
import { FocusablePressable } from "./index";

export type M3FilterChipProps = Readonly<{
  label: string;
  onPress: () => void;
  selected?: boolean;
  favorite?: boolean;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}>;

export function M3FilterChip({
  label,
  onPress,
  selected = false,
  favorite = false,
  disabled = false,
  busy = false,
  testID = "m3-filter-chip",
}: M3FilterChipProps) {
  const { colors } = useAppTheme();
  const isDisabled = disabled || busy;
  const accessibleLabel = selected ? `${label} selected` : label;
  const iconColor = favorite && selected ? colors.completed : colors.textPrimary;

  return (
    <FocusablePressable
      accessibilityLabel={accessibleLabel}
      accessibilityRole="checkbox"
      accessibilityState={{ busy, disabled: isDisabled, selected }}
      disabled={isDisabled}
      focusable={!isDisabled}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.surfaceSubtle : colors.surface,
          borderColor: selected ? colors.action : colors.divider,
          opacity: isDisabled ? 0.62 : pressed ? 0.76 : 1,
        },
      ]}
      testID={testID}
    >
      {favorite ? (
        <Star
          accessible={false}
          color={iconColor}
          fill={selected ? colors.completed : "none"}
          size={sizes.inlineIcon}
          strokeWidth={2}
        />
      ) : null}
      {selected ? (
        <Check
          accessible={false}
          color={colors.action}
          size={sizes.inlineIcon}
          strokeWidth={2}
        />
      ) : null}
      <Text
        numberOfLines={2}
        style={[typeScale.label as TextStyle, styles.label, { color: colors.textPrimary }]}
      >
        {label}
      </Text>
      {selected ? (
        <Text
          style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}
        >
          Selected
        </Text>
      ) : null}
    </FocusablePressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: "center",
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: space[1],
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    minWidth: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  label: {
    flexShrink: 1,
  },
});

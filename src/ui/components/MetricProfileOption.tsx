import {
  Check,
  Circle,
} from "lucide-react-native";
import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type {
  MetricProfile,
} from "../../domains/metrics";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";
import {
  FocusablePressable,
} from "./index";

export function MetricProfileOption({
  profile,
  label,
  example,
  comparison,
  selected,
  onSelect,
}: Readonly<{
  profile: MetricProfile;
  label: string;
  example: string;
  comparison: string;
  selected: boolean;
  onSelect(profile: MetricProfile): void;
}>) {
  const { colors } = useAppTheme();
  const activate = () => onSelect(profile);

  return (
    <FocusablePressable
      accessibilityLabel={`${label}. Example: ${example}. ${comparison}`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      focusable
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "activate") {
          activate();
        }
      }}
      onPress={activate}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: pressed ? colors.surfaceSubtle : colors.surface,
          borderColor: selected ? colors.action : colors.divider,
        },
      ]}
    >
      {selected ? (
        <Check
          accessibilityElementsHidden
          color={colors.action}
          importantForAccessibility="no-hide-descendants"
          size={sizes.inlineIcon}
          strokeWidth={2.5}
        />
      ) : (
        <Circle
          accessibilityElementsHidden
          color={colors.textSecondary}
          importantForAccessibility="no-hide-descendants"
          size={sizes.inlineIcon}
          strokeWidth={2}
        />
      )}
      <View style={styles.copy}>
        <Text
          style={[
            typeScale.bodyStrong as TextStyle,
            { color: colors.textPrimary },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            typeScale.body as TextStyle,
            { color: colors.textPrimary },
          ]}
        >
          {example}
        </Text>
        <Text
          style={[
            typeScale.secondary as TextStyle,
            { color: colors.textSecondary },
          ]}
        >
          {comparison}
        </Text>
      </View>
    </FocusablePressable>
  );
}

const styles = StyleSheet.create({
  option: {
    alignItems: "flex-start",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: space[2],
    minHeight: sizes.minimumTarget,
    padding: space[4],
  },
  copy: {
    flex: 1,
    gap: space[1],
  },
});

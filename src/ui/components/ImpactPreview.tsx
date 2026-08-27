import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import {
  radius,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export type ImpactPreviewItem = Readonly<{
  id: string;
  label: string;
  before: string;
  after: string;
}>;

export function ImpactPreview({
  heading,
  revisionLabel,
  affected,
  emptyHeading = "No active schedule bindings",
  countNoun = "binding",
}: Readonly<{
  heading: string;
  revisionLabel: string;
  affected: readonly ImpactPreviewItem[];
  emptyHeading?: string;
  countNoun?: string;
}>) {
  const { colors } = useAppTheme();
  const countLabel = affected.length === 0
    ? emptyHeading
    : `${affected.length} affected ${
        affected.length === 1 ? countNoun : `${countNoun}s`
      }`;

  return (
    <View
      accessibilityLabel={`${heading}. ${countLabel}. ${revisionLabel}`}
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.divider,
        },
      ]}
    >
      <View style={styles.heading}>
        <Text
          accessibilityRole="header"
          style={[
            typeScale.sectionTitle as TextStyle,
            { color: colors.textPrimary },
          ]}
        >
          {heading}
        </Text>
        <Text style={[
          typeScale.bodyStrong as TextStyle,
          { color: colors.textPrimary },
        ]}>
          {countLabel}
        </Text>
        <Text style={[
          typeScale.secondary as TextStyle,
          { color: colors.textSecondary },
        ]}>
          Current preview
        </Text>
        <Text style={[
          typeScale.secondary as TextStyle,
          { color: colors.textSecondary },
        ]}>
          {revisionLabel}
        </Text>
      </View>
      {affected.map((item) => (
        <View
          key={item.id}
          style={[
            styles.item,
            { borderColor: colors.divider },
          ]}
        >
          <Text style={[
            typeScale.bodyStrong as TextStyle,
            { color: colors.textPrimary },
          ]}>
            {item.label}
          </Text>
          <Text style={[
            typeScale.body as TextStyle,
            { color: colors.textSecondary },
          ]}>
            {`Before: ${item.before}`}
          </Text>
          <Text style={[
            typeScale.body as TextStyle,
            { color: colors.textPrimary },
          ]}>
            {`After: ${item.after}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[4],
    padding: space[4],
  },
  heading: {
    gap: space[1],
  },
  item: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space[1],
    paddingTop: space[4],
  },
});

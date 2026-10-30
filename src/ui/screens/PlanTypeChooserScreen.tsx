import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import {
  FocusablePressable,
  ScreenHeader,
} from "../components";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  radius,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

type PlanTypeChooserScreenProps = Readonly<{
  onBack(): void;
  onChooseStrength(): void;
  onChooseRunning(): void;
}>;

/**
 * Navigation-only plan-kind selection. Creation and activation stay in the
 * sport-specific routes so merely visiting this route can never mutate facts.
 */
export function PlanTypeChooserScreen({
  onBack,
  onChooseRunning,
  onChooseStrength,
}: PlanTypeChooserScreenProps) {
  const { colors } = useAppTheme();

  return (
    <AdaptiveScreen
      primary={(
        <>
          <ScreenHeader backAction={onBack} density="deep" eyebrow="Plans" title="Create plan" />
          <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.action }]}>NEW PLAN</Text>
          <Text style={[typeScale.bodyStrong as TextStyle, styles.heading, { color: colors.textPrimary }]}>What are you training for?</Text>
          <Text style={[typeScale.body as TextStyle, styles.body, { color: colors.textSecondary }]}>Choose the plan structure first. Creating a plan does not activate it.</Text>
          <View accessibilityLabel="Plan type" accessibilityRole="radiogroup" style={styles.choices}>
            <PlanTypeChoice
              description="Exercises, sets, targets, and a gym schedule."
              identity="GYM"
              label="Strength"
              onPress={onChooseStrength}
            />
            <PlanTypeChoice
              description="Distance and time goal, benchmark, and structured weekly sessions."
              identity="RUN"
              label="Running"
              onPress={onChooseRunning}
            />
          </View>
          <Text style={[typeScale.body as TextStyle, styles.footer, { color: colors.textSecondary }]}>Garmin connection is optional after a Running plan is created. Imported activities never create or activate a plan automatically.</Text>
        </>
      )}
      testID="plan-type-chooser"
    />
  );
}

function PlanTypeChoice({
  description,
  identity,
  label,
  onPress,
}: Readonly<{
  description: string;
  identity: "GYM" | "RUN";
  label: "Strength" | "Running";
  onPress(): void;
}>) {
  const { colors } = useAppTheme();
  return (
    <FocusablePressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected: false }}
      focusable
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: pressed ? colors.surfaceSubtle : colors.surface,
          borderColor: colors.divider,
        },
      ]}
    >
      <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.action }]}>{identity}</Text>
      <Text style={[typeScale.bodyStrong as TextStyle, styles.choiceTitle, { color: colors.textPrimary }]}>{label}</Text>
      <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>{description}</Text>
    </FocusablePressable>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: space[2] },
  choice: { borderRadius: radius.emphasized, borderWidth: 1, minHeight: 156, padding: space[6] },
  choices: { gap: space[4], marginTop: space[8] },
  choiceTitle: { marginTop: space[1], marginBottom: space[1] },
  footer: { marginTop: space[8], paddingBottom: space[8] },
  heading: { marginTop: space[2] },
});

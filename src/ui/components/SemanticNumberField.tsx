import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from "react-native";

import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export type SemanticNumberKind = "integer" | "decimal";

export type SemanticNumberFieldProps = Readonly<{
  label: string;
  value: string;
  onChangeText(value: string): void;
  kind: SemanticNumberKind;
  minimum?: number;
  maximum?: number;
  precision?: number;
  error?: string;
  help?: string;
  tone?: "default" | "card";
}> & Omit<TextInputProps,
  "accessibilityLabel" | "keyboardType" | "onChangeText" | "value"
>;

function validationMessage({
  kind,
  maximum,
  minimum,
  precision,
  value,
}: Readonly<{
  kind: SemanticNumberKind;
  maximum: number | undefined;
  minimum: number | undefined;
  precision: number | undefined;
  value: string;
}>): string | undefined {
  if (value === "") {
    return undefined;
  }
  const pattern = kind === "integer"
    ? /^-?\d+$/u
    : /^-?(?:\d+|\d+\.\d+|\.\d+)$/u;
  if (!pattern.test(value)) {
    return kind === "integer"
      ? "Enter a whole-number value."
      : "Enter a valid decimal value.";
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return kind === "integer"
      ? "Enter a whole-number value."
      : "Enter a valid decimal value.";
  }
  if (precision !== undefined) {
    const decimalPart = value.split(".")[1] ?? "";
    if (decimalPart.length > precision) {
      return `Use at most ${precision} decimal ${precision === 1 ? "place" : "places"}.`;
    }
  }
  if (minimum !== undefined && numericValue < minimum) {
    return `Enter a value no less than ${minimum}.`;
  }
  if (maximum !== undefined && numericValue > maximum) {
    return `Enter a value no greater than ${maximum}.`;
  }
  return undefined;
}

/**
 * Presentation-only numeric editing. Callers retain their canonical draft
 * strings and own all unit conversion and domain-level validation.
 */
export function SemanticNumberField({
  error,
  help,
  kind,
  label,
  maximum,
  minimum,
  onBlur,
  onChangeText,
  precision,
  style,
  tone = "default",
  value,
  ...inputProps
}: SemanticNumberFieldProps) {
  const { colors } = useAppTheme();
  const labelColor = tone === "card"
    ? colors.contentCardText
    : colors.textPrimary;
  const helpColor = tone === "card"
    ? colors.contentCardTextSecondary
    : colors.textSecondary;
  const [touched, setTouched] = React.useState(false);
  const semanticError = touched
    ? validationMessage({ kind, maximum, minimum, precision, value })
    : undefined;
  const message = error ?? semanticError;

  return (
    <View style={styles.field}>
      <Text style={[
        typeScale.label as TextStyle,
        { color: labelColor },
      ]}>
        {label}
      </Text>
      {help === undefined ? null : (
        <Text style={[
          typeScale.secondary as TextStyle,
          { color: helpColor },
        ]}>
          {help}
        </Text>
      )}
      <TextInput
        {...inputProps}
        accessibilityLabel={label}
        accessibilityState={{
          selected: undefined,
        }}
        accessibilityValue={message === undefined ? undefined : { text: message }}
        keyboardType={kind === "integer" ? "number-pad" : "decimal-pad"}
        onBlur={(event) => {
          setTouched(true);
          onBlur?.(event);
        }}
        onChangeText={onChangeText}
        style={[
          typeScale.body as TextStyle,
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: message === undefined
              ? colors.divider
              : colors.destructive,
            color: colors.textPrimary,
          },
          style,
        ]}
        value={value}
      />
      {message === undefined ? null : (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            typeScale.secondary as TextStyle,
            { color: colors.destructive },
          ]}
        >
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: space[1],
  },
  input: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
});

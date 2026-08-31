import { Search } from "lucide-react-native";
import React, {
  useRef,
} from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from "react-native";

import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";
import { IconAction } from "./index";

export type M3SearchFieldState = "idle" | "busy" | "empty" | "error" | "results";
type M3SearchFieldSlotState = Exclude<M3SearchFieldState, "idle">;

export type M3SearchFieldProps = Readonly<{
  label: string;
  value: string;
  onChangeText(value: string): void;
  onSearch?: () => void;
  state?: M3SearchFieldState;
  resultCount?: number;
  stateSlots?: Partial<Record<Exclude<M3SearchFieldState, "idle">, React.ReactNode>>;
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
  testID?: string;
}>;

function accessibilityLabelForState(
  label: string,
  state: M3SearchFieldState,
  resultCount: number | undefined,
): string | undefined {
  switch (state) {
    case "busy":
      return `Searching ${label}`;
    case "empty":
      return `No ${label} results`;
    case "error":
      return `${label} search failed`;
    case "results": {
      const count = resultCount ?? 0;
      return `${count} ${label} result${count === 1 ? "" : "s"}`;
    }
    case "idle":
      return undefined;
  }
}

export function M3SearchField({
  label,
  value,
  onChangeText,
  onSearch,
  state,
  resultCount,
  stateSlots,
  busy = false,
  disabled = false,
  placeholder,
  testID = "m3-search-field",
}: M3SearchFieldProps) {
  const inputRef = useRef<TextInput>(null);
  const { colors } = useAppTheme();
  const resolvedState = state ?? (busy ? "busy" : "idle");
  const stateAccessibilityLabel = accessibilityLabelForState(
    label,
    resolvedState,
    resultCount,
  );
  const stateSlot = resolvedState === "idle"
    ? undefined
    : stateSlots?.[resolvedState as M3SearchFieldSlotState];
  const isDisabled = disabled || busy;

  return (
    <View style={styles.group} testID={testID}>
      <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>
        {label}
      </Text>
      <View
        style={[
          styles.control,
          {
            backgroundColor: colors.surface,
            borderColor: colors.divider,
          },
        ]}
        testID={`${testID}-control`}
      >
        <Search
          accessible={false}
          color={colors.textSecondary}
          size={sizes.inlineIcon}
          strokeWidth={2}
        />
        <TextInput
          accessibilityLabel={label}
          accessibilityState={{ busy: resolvedState === "busy", disabled: isDisabled }}
          autoCapitalize="none"
          editable={!isDisabled}
          onChangeText={onChangeText}
          onSubmitEditing={onSearch}
          placeholder={placeholder ?? label}
          placeholderTextColor={colors.textSecondary}
          ref={inputRef}
          returnKeyType="search"
          style={[
            styles.input,
            typeScale.body as TextStyle,
            { color: colors.textPrimary },
          ]}
          value={value}
        />
        {value.length === 0 ? null : (
          <IconAction
            accessibilityLabel={`Clear ${label.toLocaleLowerCase()}`}
            disabled={isDisabled}
            icon="clear"
            onPress={() => {
              onChangeText("");
              inputRef.current?.focus();
            }}
          />
        )}
      </View>
      {stateAccessibilityLabel === undefined ? null : (
        <View
          accessible
          accessibilityLabel={stateAccessibilityLabel}
          accessibilityLiveRegion="polite"
          accessibilityRole="text"
          accessibilityState={{ busy: resolvedState === "busy" }}
          style={styles.state}
        >
          <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>
            {stateSlot ?? null}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: space[2],
    minWidth: 0,
  },
  control: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: space[2],
    minHeight: sizes.minimumTarget,
    paddingLeft: space[4],
  },
  input: {
    flex: 1,
    minHeight: sizes.minimumTarget,
    minWidth: 0,
    paddingVertical: 0,
  },
  state: {
    minHeight: 0,
  },
});

import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
  findNodeHandle,
  type TextStyle,
} from "react-native";

import {
  FocusablePressable,
  PrimaryAction,
  SecondaryAction,
} from "./index";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

type DurationParts = Readonly<{
  hours: string;
  minutes: string;
  seconds: string;
}>;

function durationParts(value: string): DurationParts {
  if (value === "") {
    return { hours: "", minutes: "", seconds: "" };
  }
  const totalSeconds = Number(value);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return { hours: "", minutes: "", seconds: value };
  }
  const hours = Math.floor(totalSeconds / 3_600);
  const remainingSeconds = totalSeconds - hours * 3_600;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds - minutes * 60;
  return {
    hours: hours === 0 ? "" : String(hours),
    minutes: minutes === 0 ? "" : String(minutes),
    seconds: seconds === 0 ? "" : String(seconds),
  };
}

function canonicalDuration(parts: DurationParts): string | null {
  if (parts.hours === "" && parts.minutes === "" && parts.seconds === "") {
    return "";
  }
  if (!/^\d*$/u.test(parts.hours) || !/^\d*$/u.test(parts.minutes)
      || !/^(?:\d+|\d+\.\d+|\.\d+)$/u.test(parts.seconds || "0")) {
    return null;
  }
  const hours = Number(parts.hours || "0");
  const minutes = Number(parts.minutes || "0");
  const seconds = Number(parts.seconds || "0");
  if (!Number.isSafeInteger(hours) || !Number.isSafeInteger(minutes)
      || !Number.isFinite(seconds) || hours < 0 || minutes < 0 || seconds < 0
      || minutes > 59 || seconds >= 60) {
    return null;
  }
  const result = hours * 3_600 + minutes * 60 + seconds;
  return Number.isFinite(result) ? String(result) : null;
}

function displayDuration(value: string): string {
  if (value === "") {
    return "Not set";
  }
  const parts = durationParts(value);
  const labels = [
    parts.hours === "" ? null : `${parts.hours} h`,
    parts.minutes === "" ? null : `${parts.minutes} min`,
    parts.seconds === "" ? null : `${parts.seconds} sec`,
  ].filter((part): part is string => part !== null);
  return labels.length === 0 ? value : labels.join(" ");
}

export type TimeDurationFieldProps = Readonly<{
  label: string;
  value: string;
  onChangeText(value: string): void;
  disabled?: boolean;
  help?: string;
  error?: string;
  tone?: "default" | "card";
}>;

/**
 * Presentation-only duration selection. The caller retains the canonical
 * seconds string and remains responsible for version-specific conversion.
 */
export function TimeDurationField({
  disabled = false,
  error,
  help,
  label,
  onChangeText,
  tone = "default",
  value,
}: TimeDurationFieldProps) {
  const { colors } = useAppTheme();
  const labelColor = tone === "card"
    ? colors.contentCardText
    : colors.textPrimary;
  const helpColor = tone === "card"
    ? colors.contentCardTextSecondary
    : colors.textSecondary;
  const triggerRef = useRef<View>(null);
  const dialogRef = useRef<View>(null);
  const wasOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DurationParts>(() => durationParts(value));
  const [draftError, setDraftError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      dialogRef.current?.focus();
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
      AccessibilityInfo.setAccessibilityFocus(findNodeHandle(triggerRef.current) ?? 0);
    }
  }, [open]);

  const close = () => setOpen(false);
  const confirm = () => {
    const canonical = canonicalDuration(draft);
    if (canonical === null) {
      setDraftError("Enter a valid duration: minutes and seconds must be under 60.");
      return;
    }
    onChangeText(canonical);
    close();
  };

  return (
    <View style={styles.field}>
      <Text style={[typeScale.label as TextStyle, { color: labelColor }]}>
        {label}
      </Text>
      {help === undefined ? null : (
        <Text style={[typeScale.secondary as TextStyle, { color: helpColor }]}>
          {help}
        </Text>
      )}
      <FocusablePressable
        accessibilityHint="Opens a time-style duration selector."
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityValue={error === undefined ? undefined : { text: error }}
        disabled={disabled}
        focusable={!disabled}
        onPress={() => {
          setDraft(durationParts(value));
          setDraftError(undefined);
          setOpen(true);
        }}
        ref={triggerRef}
        style={[
          styles.trigger,
          {
            backgroundColor: colors.surface,
            borderColor: error === undefined ? colors.divider : colors.destructive,
            opacity: disabled ? 0.62 : 1,
          },
        ]}
      >
        <Text style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>
          {displayDuration(value)}
        </Text>
      </FocusablePressable>
      {error === undefined ? null : (
        <Text accessibilityLiveRegion="polite" style={[
          typeScale.secondary as TextStyle,
          { color: colors.destructive },
        ]}>
          {error}
        </Text>
      )}
      <Modal animationType="none" onRequestClose={close} transparent visible={open}>
        <View accessibilityViewIsModal style={styles.backdrop}>
          <View
            accessibilityLabel={`${label} duration dialog`}
            accessibilityViewIsModal
            focusable
            ref={dialogRef}
            style={[styles.dialog, { backgroundColor: colors.surface, borderColor: colors.divider }]}
          >
            <Text accessibilityRole="header" style={[
              typeScale.sectionTitle as TextStyle,
              { color: colors.textPrimary },
            ]}>
              {label}
            </Text>
            <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>
              Set hours, minutes, and seconds. Leave every segment blank to clear this duration.
            </Text>
            <View style={styles.segments}>
              {([
                ["hours", "Hours", "number-pad"],
                ["minutes", "Minutes", "number-pad"],
                ["seconds", "Seconds", "decimal-pad"],
              ] as const).map(([key, segmentLabel, keyboardType]) => (
                <View key={key} style={styles.segment}>
                  <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>
                    {segmentLabel}
                  </Text>
                  <TextInput
                    accessibilityLabel={`${label} ${key}`}
                    keyboardType={keyboardType}
                    onChangeText={(next) => {
                      setDraft((current) => ({ ...current, [key]: next }));
                      setDraftError(undefined);
                    }}
                    style={[
                      typeScale.body as TextStyle,
                      styles.segmentInput,
                      { borderColor: colors.divider, color: colors.textPrimary },
                    ]}
                    value={draft[key]}
                  />
                </View>
              ))}
            </View>
            {draftError === undefined ? null : (
              <Text accessibilityLiveRegion="polite" style={[
                typeScale.secondary as TextStyle,
                { color: colors.destructive },
              ]}>
                {draftError}
              </Text>
            )}
            <View style={styles.actions}>
              <SecondaryAction label={`Cancel ${label.toLocaleLowerCase("en")}`} onPress={close} />
              <PrimaryAction label={`Confirm ${label.toLocaleLowerCase("en")}`} onPress={confirm} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space[1] },
  trigger: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
  },
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.48)",
    flex: 1,
    justifyContent: "center",
    padding: space[4],
  },
  dialog: {
    borderRadius: radius.emphasized,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[4],
    maxWidth: 560,
    padding: space[4],
    width: "100%",
  },
  segments: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  segment: { flexGrow: 1, gap: space[1], minWidth: 112 },
  segmentInput: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[2],
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});

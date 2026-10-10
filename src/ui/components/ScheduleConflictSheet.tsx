import React, { useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { FocusablePressable, PrimaryAction, SecondaryAction } from "./index";
import { space, typeScale, useAppTheme } from "../theme";
import type { ScheduleCollisionChoice, ScheduleCollisionOccurrence, ScheduleCollisionPreview } from "../../domains/scheduling/collisionCommands";

export type { ScheduleCollisionChoice, ScheduleCollisionOccurrence as ScheduleCollisionOccurrencePreview, ScheduleCollisionPreview } from "../../domains/scheduling/collisionCommands";

export type ScheduleConflictSheetProps = Readonly<{
  visible: boolean;
  preview: ScheduleCollisionPreview;
  busy?: boolean;
  error?: string | null;
  onCancel(): void;
  onConfirm(input: Readonly<{
    choice: ScheduleCollisionChoice;
    preview: ScheduleCollisionPreview;
  }>): void;
}>;

function choiceLabel(
  choice: ScheduleCollisionChoice,
  preview: ScheduleCollisionPreview,
): string {
  if (choice === "move_running") {
    return `Move run · ${preview.running.movedLocalDate}`;
  }
  if (choice === "move_strength") {
    return `Move strength · ${preview.strength.movedLocalDate}`;
  }
  return `Keep both · ${preview.running.localDate}`;
}

function afterDate(
  occurrence: ScheduleCollisionOccurrence,
  choice: ScheduleCollisionChoice,
  sport: "running" | "strength",
): string {
  return choice === `move_${sport}` ? occurrence.movedLocalDate : occurrence.localDate;
}

function RadioChoice({
  checked,
  label,
  onPress,
}: Readonly<{
  checked: boolean;
  label: string;
  onPress(): void;
}>) {
  const { colors } = useAppTheme();
  return (
    <FocusablePressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={[
        styles.choice,
        {
          backgroundColor: checked ? colors.surfaceSubtle : colors.surface,
          borderColor: checked ? colors.action : colors.divider,
        },
      ]}
    >
      <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>
        {label}
      </Text>
    </FocusablePressable>
  );
}

/** Factual review UI only. The caller owns source mutations and post-commit readback. */
export function ScheduleConflictSheet({
  busy = false,
  error = null,
  onCancel,
  onConfirm,
  preview,
  visible,
}: ScheduleConflictSheetProps) {
  const { colors } = useAppTheme();
  const triggerRef = useRef<View>(null);
  const [choice, setChoice] = useState<ScheduleCollisionChoice | null>(null);
  const reviewing = choice !== null;
  const factualChoices = useMemo(
    () => ["move_running", "move_strength", "keep_both"] as const,
    [],
  );
  const close = () => {
    setChoice(null);
    onCancel();
  };

  return (
    <>
      <BottomSheet
        heading="Schedule conflict"
        onCancel={close}
        restoreFocusRef={triggerRef}
        testID="schedule-conflict-sheet"
        visible={visible && !reviewing}
      >
        <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
          {`${preview.running.planName} and ${preview.strength.planName} overlap on ${preview.running.localDate}. Choose a calendar arrangement.`}
        </Text>
        <View accessibilityRole="radiogroup" style={styles.choices}>
          {factualChoices.map((candidate) => (
            <RadioChoice
              checked={false}
              key={candidate}
              label={choiceLabel(candidate, preview)}
              onPress={() => setChoice(candidate)}
            />
          ))}
        </View>
        {error === null ? null : (
          <Text style={[typeScale.body as TextStyle, { color: colors.destructive }]}>
            {error}
          </Text>
        )}
        <SecondaryAction label="Back" onPress={close} />
      </BottomSheet>
      {choice === null ? null : (
        <ConfirmationDialog
          body="Review both dates before confirming. This changes only the selected future occurrence."
          cancelLabel="Keep current schedule"
          confirmBusy={busy}
          confirmLabel="Confirm schedule change"
          heading="Review schedule change"
          onCancel={close}
          onConfirm={() => onConfirm({ choice, preview })}
          restoreFocusRef={triggerRef}
          visible={visible}
        >
          <View style={styles.review}>
            <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>
              {`${preview.running.planName} · ${preview.running.localDate} → ${afterDate(preview.running, choice, "running")}`}
            </Text>
            <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>
              {`${preview.strength.planName} · ${preview.strength.localDate} → ${afterDate(preview.strength, choice, "strength")}`}
            </Text>
          </View>
        </ConfirmationDialog>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  choice: {
    borderWidth: 1,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  choices: {
    gap: space[2],
  },
  review: {
    gap: space[2],
  },
});

import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextStyle } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { PrimaryAction, SecondaryAction } from "./index";
import { radius, sizes, space, typeScale, useAppTheme } from "../theme";

export type BodyweightEditorSave = Readonly<{
  expectedRevision: number;
  localDate: string;
  grams: number;
}>;

export type BodyweightEditorSheetProps = Readonly<{
  visible: boolean;
  mode: "add" | "edit";
  expectedRevision: number;
  todayLocalDate: string;
  initialLocalDate?: string | undefined;
  initialGrams?: number | undefined;
  onClose(): void;
  onSave(input: BodyweightEditorSave): Promise<void>;
  onSaved?: (() => void) | undefined;
}>;

type Draft = Readonly<{ localDate: string; kilograms: string }>;

function initialDraft({ initialGrams, initialLocalDate, todayLocalDate }: BodyweightEditorSheetProps): Draft {
  return {
    localDate: initialLocalDate ?? todayLocalDate,
    kilograms: initialGrams === undefined ? "" : (initialGrams / 1_000).toFixed(1),
  };
}

function isValidLocalDate(value: string, todayLocalDate: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null || value > todayLocalDate) return false;
  const year = Number(match[1] ?? Number.NaN);
  const month = Number(match[2] ?? Number.NaN);
  const day = Number(match[3] ?? Number.NaN);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

function kilogramsToGrams(value: string): number | null {
  if (!/^\d{2,3}\.\d$/u.test(value)) return null;
  const grams = Number(value) * 1_000;
  return Number.isSafeInteger(grams) && grams >= 20_000 && grams <= 400_000 ? grams : null;
}

/** Sheet-local draft. The caller owns source identity, receipt, command and reload authority. */
export function BodyweightEditorSheet(props: BodyweightEditorSheetProps) {
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(props));
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (props.visible && !saving) {
      setDraft(initialDraft(props));
      setFailure(null);
    }
  }, [props.expectedRevision, props.initialGrams, props.initialLocalDate, props.todayLocalDate, props.visible]);

  const submit = async () => {
    const grams = kilogramsToGrams(draft.kilograms);
    if (saving) return;
    if (grams === null || !isValidLocalDate(draft.localDate, props.todayLocalDate)) {
      setFailure("Enter a valid date and bodyweight from 20.0 to 400.0 kg.");
      return;
    }
    setSaving(true);
    setFailure(null);
    try {
      await props.onSave({ expectedRevision: props.expectedRevision, grams, localDate: draft.localDate });
      props.onSaved?.();
    } catch {
      setFailure("Bodyweight entry was not saved.");
    } finally {
      setSaving(false);
    }
  };

  const heading = props.mode === "add" ? "Add bodyweight" : "Edit bodyweight entry";
  return (
    <BottomSheet
      cancelDisabled={saving}
      cancelLabel="Discard bodyweight changes"
      contentStyle={styles.content}
      heading={heading}
      onCancel={props.onClose}
      scrollTestID="bodyweight-editor-sheet-content"
      visible={props.visible}
    >
      <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>
        Optional measurement. It never changes workout targets automatically.
      </Text>
      <View style={styles.fields}>
        <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Date</Text>
        <TextInput
          accessibilityLabel="Date"
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          onChangeText={(localDate) => setDraft((current) => ({ ...current, localDate }))}
          style={[styles.input, { borderColor: colors.divider, color: colors.textPrimary }]}
          value={draft.localDate}
        />
        <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Bodyweight, kg</Text>
        <TextInput
          accessibilityLabel="Bodyweight, kg"
          keyboardType="decimal-pad"
          onChangeText={(kilograms) => setDraft((current) => ({ ...current, kilograms }))}
          style={[styles.input, { borderColor: colors.divider, color: colors.textPrimary }]}
          value={draft.kilograms}
        />
      </View>
      {failure === null ? null : <Text accessibilityRole="alert" style={[typeScale.body as TextStyle, { color: colors.destructive }]}>{failure}</Text>}
      <PrimaryAction busy={saving} disabled={saving} label="Save entry" onPress={() => { void submit(); }} />
      <SecondaryAction disabled={saving} label="Discard bodyweight changes" onPress={props.onClose} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: space[4], maxHeight: "82%" },
  fields: { gap: space[2] },
  input: { borderRadius: radius.standard, borderWidth: StyleSheet.hairlineWidth, fontSize: 18, minHeight: sizes.minimumTarget, paddingHorizontal: space[2] },
});

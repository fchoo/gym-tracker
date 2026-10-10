import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextStyle } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { FocusablePressable, PrimaryAction, SecondaryAction } from "./index";
import { PLAN_WEIGHT_INCREMENT_GRAMS } from "../../domains/workout/workoutPreferences";
import { radius, sizes, space, typeScale, useAppTheme } from "../theme";

type PreferenceDraft = Readonly<{
  defaultRestSeconds: number;
  weightIncrementGrams: number;
}>;

export type WorkoutPlanSettingsSheetProps = Readonly<{
  visible: boolean;
  planName: string;
  scheduleSummary: string;
  defaultRestSeconds: number;
  weightIncrementGrams: number;
  onClose(): void;
  onSave(draft: PreferenceDraft): Promise<void>;
  onEditPlanAfterWorkout(): void;
  onOpenWorkoutActions(): void;
}>;

/** Presentation-only plan preferences. The caller owns revisioned persistence and reload. */
export function WorkoutPlanSettingsSheet({
  visible, planName, scheduleSummary, defaultRestSeconds, weightIncrementGrams,
  onClose, onSave, onEditPlanAfterWorkout, onOpenWorkoutActions,
}: WorkoutPlanSettingsSheetProps) {
  const { colors } = useAppTheme();
  const saved = { defaultRestSeconds, weightIncrementGrams } as const;
  const [draft, setDraft] = useState<PreferenceDraft>(saved);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (visible && !saving) {
      setDraft(saved);
      setFailure(null);
    }
  }, [defaultRestSeconds, visible, weightIncrementGrams]);

  const save = async () => {
    if (saving || !Number.isSafeInteger(draft.defaultRestSeconds) || draft.defaultRestSeconds < 0) return;
    setSaving(true);
    setFailure(null);
    try { await onSave(draft); }
    catch { setFailure("Default rest was not saved"); }
    finally { setSaving(false); }
  };

  return <BottomSheet cancelDisabled={saving} cancelLabel="Return to Workout" contentStyle={styles.content} heading="Plan settings" onCancel={onClose} scrollTestID="workout-plan-settings-sheet-content" visible={visible}>
    <Text style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>{planName}</Text>
    <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{scheduleSummary}</Text>
    <View style={[styles.section, { borderColor: colors.divider }]}>
      <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Default rest</Text>
      <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Between-set rest · sec</Text>
      <TextInput accessibilityLabel="Default between-set rest seconds" keyboardType="number-pad" onChangeText={(value) => setDraft((current) => ({ ...current, defaultRestSeconds: Number(value) }))} style={[styles.input, { borderColor: colors.divider, color: colors.textPrimary }]} value={String(draft.defaultRestSeconds)} />
      <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{`Saved rest · ${saved.defaultRestSeconds} sec`}</Text>
      <PrimaryAction busy={saving} disabled={saving} label="Save default rest" onPress={() => { void save(); }} />
      {failure === null ? null : <Text accessibilityRole="alert" style={[typeScale.body as TextStyle, { color: colors.destructive }]}>{failure}</Text>}
    </View>
    <View style={[styles.section, { borderColor: colors.divider }]}>
      <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Weight increment</Text>
      <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{`Saved increment · ${saved.weightIncrementGrams / 1000} kg`}</Text>
      {PLAN_WEIGHT_INCREMENT_GRAMS.map((value) => {
        const selected = draft.weightIncrementGrams === value;
        return <FocusablePressable accessibilityLabel={`${value / 1000} kilograms`} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: saving }} disabled={saving} key={value} onPress={() => setDraft((current) => ({ ...current, weightIncrementGrams: value }))} style={[styles.choice, { borderColor: selected ? colors.focusRing : colors.divider }]}>
          <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{`${value / 1000} kg${selected ? " · Selected" : ""}`}</Text>
        </FocusablePressable>;
      })}
      <PrimaryAction busy={saving} disabled={saving} label="Save weight increment" onPress={() => { void save(); }} />
    </View>
    <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Sound and haptic cues remain controlled by device settings.</Text>
    <SecondaryAction disabled={saving} label="Edit plan after workout · Schedule" onPress={onEditPlanAfterWorkout} />
    <SecondaryAction disabled={saving} label="Workout actions" onPress={onOpenWorkoutActions} />
  </BottomSheet>;
}

const styles = StyleSheet.create({
  content: { gap: space[4], maxHeight: "82%" },
  section: { borderTopWidth: StyleSheet.hairlineWidth, gap: space[2], paddingTop: space[4] },
  input: { borderRadius: radius.standard, borderWidth: StyleSheet.hairlineWidth, fontSize: 18, minHeight: sizes.minimumTarget, paddingHorizontal: space[2] },
  choice: { borderRadius: radius.standard, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center", minHeight: sizes.minimumTarget, paddingHorizontal: space[4] },
});

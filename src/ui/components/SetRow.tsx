import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type { ActiveWorkoutSet, SetObservation } from "../../domains/workout";
import { FocusablePressable } from "./index";
import { radius, space, typeScale, useAppTheme } from "../theme";

export function formatLoadGrams(loadGrams: number): string {
  const kilograms = loadGrams / 1_000;
  return Number.isInteger(kilograms)
    ? String(kilograms)
    : kilograms.toFixed(1).replace(/\.0$/u, "");
}

export function formatObservation(observation: SetObservation): string {
  switch (observation.profile) {
    case "load_reps": return `${formatLoadGrams(observation.loadGrams)} kg × ${observation.reps}`;
    case "bodyweight_reps": return `Bodyweight × ${observation.reps}`;
    case "added_load_reps": return `BW + ${formatLoadGrams(observation.addedLoadGrams)} kg × ${observation.reps}`;
    case "assisted_reps": return `${formatLoadGrams(observation.assistanceGrams)} kg assist × ${observation.reps}`;
    case "timed_hold": return observation.version === 1 ? `${observation.durationSeconds} sec` : `${observation.durationMs / 1_000} sec`;
    case "fixed_distance": return `${observation.distanceMeters} m in ${observation.durationMs / 1_000} sec`;
    case "fixed_time": return `${observation.distanceMeters} m in ${observation.durationMs / 1_000} sec`;
    case "intervals": return `${observation.completedRounds} rounds · ${observation.completedWorkMs / 1_000} sec work`;
    case "unscored": return observation.completed ? "Completed" : "Not completed";
  }
}

/** Resolves display defaults only. It never persists or changes a source fact. */
export function observationForSet(set: ActiveWorkoutSet): SetObservation {
  const persisted = set.observation ?? set.valueSources.find(({ source }) => source === "plan_default")?.observation;
  if (persisted !== undefined) return persisted;
  switch (set.target.profile) {
    case "load_reps": return { version: 1, profile: "load_reps", loadGrams: set.target.loadGrams, reps: set.target.maxReps, source: "plan_default" };
    case "bodyweight_reps": return { version: 1, profile: "bodyweight_reps", reps: set.target.maxReps, source: "plan_default" };
    case "added_load_reps": return { version: 1, profile: "added_load_reps", addedLoadGrams: set.target.addedLoadGrams, reps: set.target.maxReps, source: "plan_default" };
    case "assisted_reps": return { version: 1, profile: "assisted_reps", assistanceGrams: set.target.assistanceGrams, reps: set.target.maxReps, source: "plan_default" };
    case "timed_hold": return set.target.version === 1
      ? { version: 1, profile: "timed_hold", durationSeconds: set.target.durationSeconds, source: "plan_default" }
      : { version: 2, profile: "timed_hold", durationMs: set.target.durationMs, source: "plan_default" };
    case "fixed_distance": return { version: 1, profile: "fixed_distance", distanceMeters: set.target.plannedDistanceMeters, durationMs: 0, source: "manual" };
    case "fixed_time": return { version: 1, profile: "fixed_time", durationMs: set.target.plannedDurationMs, distanceMeters: 0, source: "manual" };
    case "intervals": return { version: 1, profile: "intervals", protocolId: set.target.protocolId, completedRounds: 0, completedWorkMs: 0, source: "manual" };
    case "unscored": return { version: 1, profile: "unscored", completed: false, source: "manual" };
  }
}

export type SetRowProps = Readonly<{
  set: ActiveWorkoutSet;
  kind: "warmup" | "working";
  index: number;
  active: boolean;
  /** @deprecated Rows no longer own persistence; retained briefly for test fixture compatibility. */
  count?: number;
  busy?: boolean;
  disabled?: boolean;
  compact?: boolean;
  tone?: "default" | "card";
  overviewTestID?: string;
  onPress?(): void;
  /** @deprecated Rows no longer own persistence. */
  onChangeValues?(observation: SetObservation): Promise<void> | void;
  /** @deprecated Rows no longer own completion. */
  onComplete?(): void;
  /** @deprecated Rows no longer own removal. */
  onRemove?(): void;
  onSkip?(): void;
}>;

/** Facts-only row. Editing authority belongs to WorkoutSetEditorSheet. */
export const SetRow = React.forwardRef<View, SetRowProps>(function SetRow({
  active,
  busy = false,
  compact = false,
  disabled = false,
  index,
  kind,
  onPress = () => undefined,
  overviewTestID,
  set,
  tone = "default",
}, ref) {
  const { colors } = useAppTheme();
  const rowLabel = kind === "warmup" ? `W${index}` : String(index);
  const setName = kind === "warmup" ? `Warm-up ${rowLabel}` : `Set ${rowLabel}`;
  const state = set.status === "completed" ? "Completed" : set.status === "skipped" ? "Skipped" : active ? "Current" : "Planned";
  const observation = formatObservation(observationForSet(set));
  const primary = tone === "card" ? colors.contentCardText : colors.textPrimary;
  const secondary = tone === "card" ? colors.contentCardTextSecondary : colors.textSecondary;
  return (
    <FocusablePressable
      accessibilityHint="Opens the set editor. Changes are saved only when you choose Save set values."
      accessibilityLabel={`${setName}. ${observation}. ${state}. Edit set values`}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      disabled={disabled || busy}
      focusable={!disabled && !busy}
      onPress={onPress}
      ref={ref}
      style={({ pressed }) => [
        styles.row,
        compact ? styles.compact : undefined,
        {
          backgroundColor: pressed ? colors.surfaceSubtle : tone === "card" ? colors.contentCard : colors.surface,
          borderColor: tone === "card" ? colors.contentCardBorder : colors.divider,
          opacity: disabled ? 0.62 : 1,
        },
      ]}
      testID={overviewTestID ?? `${kind === "warmup" ? `warmup-W${index}` : `working-set-${index}`}-row`}
    >
      <View style={styles.heading}>
        <Text style={[typeScale.bodyStrong as TextStyle, { color: primary }]}>{setName}</Text>
        <Text style={[typeScale.secondary as TextStyle, { color: secondary }]}>{busy ? "Saving" : state}</Text>
      </View>
      <Text style={[typeScale.body as TextStyle, { color: primary }]}>{observation}</Text>
    </FocusablePressable>
  );
});

const styles = StyleSheet.create({
  row: { borderRadius: radius.standard, borderWidth: StyleSheet.hairlineWidth, gap: space[1], minHeight: 56, padding: space[4] },
  compact: { minHeight: 48 },
  heading: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", gap: space[2] },
});

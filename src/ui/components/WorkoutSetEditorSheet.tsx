import React from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import type { ActiveWorkoutSet, SetObservation } from "../../domains/workout";
import { BottomSheet } from "./BottomSheet";
import { ActionRow, FocusablePressable, PrimaryAction, SecondaryAction } from "./index";
import { SemanticNumberField } from "./SemanticNumberField";
import { observationForSet } from "./SetRow";
import { space, workoutTypeScale, useAppTheme } from "../theme";

type Draft = Readonly<{ load: string; reps: string; duration: string; distance: string; rounds: string; source: SetObservation["source"] }>;

function draftFor(observation: SetObservation): Draft {
  switch (observation.profile) {
    case "load_reps": return { load: String(observation.loadGrams / 1_000), reps: String(observation.reps), duration: "", distance: "", rounds: "", source: observation.source };
    case "bodyweight_reps": return { load: "", reps: String(observation.reps), duration: "", distance: "", rounds: "", source: observation.source };
    case "added_load_reps": return { load: String(observation.addedLoadGrams / 1_000), reps: String(observation.reps), duration: "", distance: "", rounds: "", source: observation.source };
    case "assisted_reps": return { load: String(observation.assistanceGrams / 1_000), reps: String(observation.reps), duration: "", distance: "", rounds: "", source: observation.source };
    case "timed_hold": return { load: "", reps: "", duration: String(observation.version === 1 ? observation.durationSeconds : observation.durationMs / 1_000), distance: "", rounds: "", source: observation.source };
    case "fixed_distance": return { load: "", reps: "", duration: String(observation.durationMs / 1_000), distance: "", rounds: "", source: observation.source };
    case "fixed_time": return { load: "", reps: "", duration: "", distance: String(observation.distanceMeters), rounds: "", source: observation.source };
    case "intervals": return { load: "", reps: "", duration: String(observation.completedWorkMs / 1_000), distance: "", rounds: String(observation.completedRounds), source: observation.source };
    case "unscored": return { load: "", reps: "", duration: "", distance: "", rounds: "", source: observation.source };
  }
}

function number(value: string, minimum: number, message: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : null;
}

function observationFrom(set: ActiveWorkoutSet, draft: Draft): SetObservation | string {
  const load = number(draft.load, 0, "load");
  const reps = number(draft.reps, 0, "reps");
  const duration = number(draft.duration, 0, "duration");
  const distance = number(draft.distance, 0, "distance");
  const rounds = number(draft.rounds, 0, "rounds");
  const source = draft.source;
  switch (set.target.profile) {
    case "load_reps": return load === null || reps === null || !Number.isSafeInteger(reps) ? "Enter a nonnegative load and whole-number repetitions." : { version: 1, profile: "load_reps", loadGrams: Math.round(load * 1_000), reps, source };
    case "bodyweight_reps": return reps === null || !Number.isSafeInteger(reps) || reps < 1 ? "Enter at least one repetition." : { version: 1, profile: "bodyweight_reps", reps, source };
    case "added_load_reps": return load === null || reps === null || !Number.isSafeInteger(reps) ? "Enter a nonnegative added load and whole-number repetitions." : { version: 1, profile: "added_load_reps", addedLoadGrams: Math.round(load * 1_000), reps, source };
    case "assisted_reps": return load === null || reps === null || !Number.isSafeInteger(reps) ? "Enter nonnegative assistance and whole-number repetitions." : { version: 1, profile: "assisted_reps", assistanceGrams: Math.round(load * 1_000), reps, source };
    case "timed_hold":
      if (duration === null) return "Enter a nonnegative duration.";
      return set.target.version === 1 ? { version: 1, profile: "timed_hold", durationSeconds: duration, source } : { version: 2, profile: "timed_hold", durationMs: Math.round(duration * 1_000), source };
    case "fixed_distance": return duration === null || duration < 1 ? "Enter a duration greater than zero." : { version: 1, profile: "fixed_distance", distanceMeters: set.target.plannedDistanceMeters, durationMs: Math.round(duration * 1_000), source };
    case "fixed_time": return distance === null || !Number.isSafeInteger(distance) ? "Enter a nonnegative whole-number distance." : { version: 1, profile: "fixed_time", durationMs: set.target.plannedDurationMs, distanceMeters: distance, source };
    case "intervals": return rounds === null || duration === null || !Number.isSafeInteger(rounds) || (rounds < 1 && duration < 1) ? "Enter completed rounds or completed work." : { version: 1, profile: "intervals", protocolId: set.target.protocolId, completedRounds: rounds, completedWorkMs: Math.round(duration * 1_000), source };
    case "unscored": return { version: 1, profile: "unscored", completed: true, source };
  }
}

export type WorkoutSetEditorSheetProps = Readonly<{
  visible: boolean;
  set: ActiveWorkoutSet;
  exerciseName: string;
  onSave(observation: SetObservation): Promise<void>;
  onCancel(): void;
  restoreFocusRef?: React.RefObject<View | null>;
}>;

/** One explicit-save editor for every strict metric profile. No input writes on blur. */
export function WorkoutSetEditorSheet({ exerciseName, onCancel, onSave, restoreFocusRef, set, visible }: WorkoutSetEditorSheetProps) {
  const { colors } = useAppTheme();
  const sourceObservation = observationForSet(set);
  const [draft, setDraft] = React.useState<Draft>(() => draftFor(sourceObservation));
  const [error, setError] = React.useState<string | undefined>();
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { if (visible) { setDraft(draftFor(observationForSet(set))); setError(undefined); setSaving(false); } }, [set, visible]);
  const update = (next: Partial<Draft>) => { setDraft((current) => ({ ...current, ...next })); setError(undefined); };
  const save = async () => {
    if (saving) return;
    const observation = observationFrom(set, draft);
    if (typeof observation === "string") { setError(observation); return; }
    setSaving(true);
    try { await onSave(observation); }
    catch { setError("Set values were not saved. Your draft is still available; try Save again."); }
    finally { setSaving(false); }
  };
  const profileContext = set.target.profile === "bodyweight_reps" ? `Variation · ${set.target.variationId}`
    : set.target.profile === "assisted_reps" ? `Assistance equipment · ${set.target.assistanceEquipmentId}`
    : set.target.profile === "fixed_distance" ? `Planned distance · ${set.target.plannedDistanceMeters} m`
    : set.target.profile === "fixed_time" ? `Planned duration · ${set.target.plannedDurationMs / 1_000} sec`
    : set.target.profile === "intervals" ? `Protocol · ${set.target.plannedRounds} rounds · ${set.target.workIntervalMs / 1_000} sec work · ${set.target.restIntervalMs / 1_000} sec rest`
    : set.target.profile === "unscored" ? "Completion only · no performance ranking" : undefined;
  const metricFields = (() => {
    const loadLabel = set.target.profile === "assisted_reps" ? "Assistance (kg)" : set.target.profile === "added_load_reps" ? "Added load (kg)" : "Load (kg)";
    const loadAndReps = <><SemanticNumberField kind="decimal" label={loadLabel} minimum={0} onChangeText={(load) => update({ load })} precision={3} value={draft.load} /><SemanticNumberField kind="integer" label="Repetitions" minimum={0} onChangeText={(reps) => update({ reps })} value={draft.reps} /></>;
    switch (set.target.profile) {
      case "load_reps": case "added_load_reps": case "assisted_reps": return loadAndReps;
      case "bodyweight_reps": return <SemanticNumberField kind="integer" label="Repetitions" minimum={1} onChangeText={(reps) => update({ reps })} value={draft.reps} />;
      case "timed_hold": return <><SemanticNumberField kind="decimal" label="Duration (sec)" minimum={0} onChangeText={(duration) => update({ duration })} value={draft.duration} /><ActionRow><SecondaryAction label="−5 sec" onPress={() => update({ duration: String(Math.max(0, Number(draft.duration || "0") - 5)) })} /><SecondaryAction label="+5 sec" onPress={() => update({ duration: String(Number(draft.duration || "0") + 5) })} /></ActionRow></>;
      case "fixed_distance": return <SemanticNumberField kind="decimal" label="Duration (sec)" minimum={1} onChangeText={(duration) => update({ duration })} value={draft.duration} />;
      case "fixed_time": return <SemanticNumberField kind="integer" label="Distance (m)" minimum={0} onChangeText={(distance) => update({ distance })} value={draft.distance} />;
      case "intervals": return <><SemanticNumberField kind="integer" label="Completed rounds" minimum={0} onChangeText={(rounds) => update({ rounds })} value={draft.rounds} /><SemanticNumberField kind="decimal" label="Completed work (sec)" minimum={0} onChangeText={(duration) => update({ duration })} value={draft.duration} /></>;
      case "unscored": return <Text style={[workoutTypeScale.body as TextStyle, { color: colors.textSecondary }]}>Saving records this set as completed. No performance metric is captured.</Text>;
    }
  })();
  return <BottomSheet cancelDisabled={saving} cancelLabel="Return to Workout" contentStyle={styles.sheet} heading={`Edit ${exerciseName}`} onCancel={onCancel} restoreFocusRef={restoreFocusRef} testID="workout-set-editor-sheet" visible={visible}>
    <View style={styles.content}>
      <Text style={[workoutTypeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Changes remain local until you save them.</Text>
      <Text style={[workoutTypeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Return to Workout without saving to discard these entered changes.</Text>
      {profileContext === undefined ? null : <Text style={[workoutTypeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{profileContext}</Text>}
      {set.valueSources.length < 2 ? null : <View style={styles.sources}><Text style={[workoutTypeScale.label as TextStyle, { color: colors.textPrimary }]}>Start from</Text><View style={styles.sourceButtons}>{set.valueSources.map((candidate) => {
        const selected = draft.source === candidate.source;
        const label = candidate.source.replaceAll("_", " ");
        return <FocusablePressable accessibilityHint="Updates the local draft. Save set values is still required." accessibilityLabel={`Use ${label}`} accessibilityRole="button" accessibilityState={{ busy: saving, disabled: saving, selected }} disabled={saving} focusable={!saving} key={candidate.source} onPress={() => update(draftFor(candidate.observation))} style={[styles.sourceButton, { backgroundColor: selected ? colors.blueBg : "transparent", borderColor: selected ? colors.focusRing : colors.divider }]}><Text style={[workoutTypeScale.secondary as TextStyle, { color: colors.textPrimary }]}>{label}</Text></FocusablePressable>;
      })}</View></View>}
      {metricFields}
      {error === undefined ? null : <Text accessibilityLiveRegion="polite" style={[workoutTypeScale.secondary as TextStyle, { color: colors.destructive }]}>{error}</Text>}
      <ActionRow><SecondaryAction disabled={saving} label="Return to Workout" visibleLabel="Back" onPress={onCancel} /><PrimaryAction busy={saving} disabled={saving} label={set.status === "completed" ? "Save committed set edit" : "Save set values"} visibleLabel={set.status === "completed" ? "Save edit" : "Save values"} onPress={() => { void save(); }} /></ActionRow>
    </View>
  </BottomSheet>;
}

const styles = StyleSheet.create({
  sheet: { maxHeight: "82%" }, content: { gap: space[4] }, actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] }, stepper: { flexDirection: "row", flexWrap: "wrap", gap: space[2] }, sources: { gap: space[1] }, sourceButtons: { flexDirection: "row", flexWrap: "wrap", gap: space[1] }, sourceButton: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, minHeight: 48, justifyContent: "center", paddingHorizontal: space[2] },
});

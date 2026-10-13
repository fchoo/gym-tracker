import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Minus } from "lucide-react-native";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import type { PlannedStrengthOccurrenceDetail } from "../../domains/workout";
import {
  METRIC_PROFILES,
  parseMetricObservation,
  parseMetricTarget,
  type MetricProfile,
} from "../../domains/metrics";
import {
  formatWorkoutObservation,
  formatWorkoutTarget,
} from "../../domains/workout/workoutPresentation";
import { EmptyState, FocusablePressable, PrimaryAction, ScreenHeader, SkeletonBlock } from "../components";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import { calendarTypeScale, space, useAppTheme } from "../theme";

type LoadState = "loading" | "ready" | "missing" | "error";

function isDeepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every(isDeepFrozen);
}

function targetText(targetJson: string): string | null {
  try {
    const decoded = JSON.parse(targetJson) as Readonly<Record<string, unknown>>;
    const profile = decoded.profile;
    const version = decoded.version;
    if (typeof profile !== "string"
      || !METRIC_PROFILES.includes(profile as MetricProfile)
      || !Number.isSafeInteger(version)) return null;
    return formatWorkoutTarget(parseMetricTarget({
      profile: profile as MetricProfile,
      contractVersion: version as number,
      exerciseMetricGeneration: 1,
    }, decoded));
  } catch {
    return null;
  }
}

function previousText(
  target: PlannedStrengthOccurrenceDetail["exercises"][number]["targets"][number],
): string | null {
  if (target.previousObservationJson === null) return null;
  try {
    const targetValue = JSON.parse(target.targetJson) as Readonly<Record<string, unknown>>;
    const profile = targetValue.profile;
    const version = targetValue.version;
    if (typeof profile !== "string"
      || !METRIC_PROFILES.includes(profile as MetricProfile)
      || !Number.isSafeInteger(version)) return null;
    return formatWorkoutObservation(parseMetricObservation({
      profile: profile as MetricProfile,
      contractVersion: version as number,
      exerciseMetricGeneration: 1,
    }, JSON.parse(target.previousObservationJson)));
  } catch {
    return null;
  }
}

function hasTargets(detail: PlannedStrengthOccurrenceDetail): boolean {
  return detail.planName.trim().length > 0
    && detail.dayName.trim().length > 0
    && detail.exercises.length > 0
    && detail.exercises.every((exercise) => exercise.targets.length > 0
      && exercise.exerciseName.trim().length > 0
      && exercise.targets.every((target) => targetText(target.targetJson) !== null));
}

/** Exact-occurrence Calendar preview with no session or command capability. */
export function PlannedWorkoutDetailScreen({
  occurrenceId,
  loadOccurrence,
  onBack,
}: Readonly<{
  occurrenceId: string;
  loadOccurrence(occurrenceId: string): Promise<PlannedStrengthOccurrenceDetail | null>;
  onBack(): void;
}>) {
  const { colors } = useAppTheme();
  const [detail, setDetail] = useState<PlannedStrengthOccurrenceDetail | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [generation, setGeneration] = useState(0);
  const [expandedExerciseIds, setExpandedExerciseIds] = useState<ReadonlySet<string>>(() => new Set());
  const requestGeneration = useRef(0);
  const backActionRef = useRef<View>(null);

  useEffect(() => {
    backActionRef.current?.focus?.();
  }, []);

  useEffect(() => {
    const request = requestGeneration.current + 1;
    requestGeneration.current = request;
    if (occurrenceId.length === 0) {
      setDetail(null);
      setState("missing");
      return undefined;
    }
    let mounted = true;
    setState("loading");
    void loadOccurrence(occurrenceId).then((result) => {
      if (!mounted || request !== requestGeneration.current) return;
      if (result === null || result.occurrenceId !== occurrenceId || !isDeepFrozen(result) || !hasTargets(result)) {
        setDetail(null);
        setState("missing");
        return;
      }
      setDetail(result);
      setExpandedExerciseIds(new Set(result.exercises.map(({ id }) => id)));
      setState("ready");
    }).catch(() => {
      if (!mounted || request !== requestGeneration.current) return;
      setDetail(null);
      setState("error");
    });
    return () => {
      mounted = false;
      if (requestGeneration.current === request) requestGeneration.current += 1;
    };
  }, [generation, loadOccurrence, occurrenceId]);

  if (state === "loading") {
    return <AdaptiveScreen primary={<><ScreenHeader backAction={onBack} backActionRef={backActionRef} title="Workout preview" /><SkeletonBlock height={48} width="64%" /><SkeletonBlock height={160} /></>} />;
  }
  if (state === "error") {
    return <AdaptiveScreen primary={<><ScreenHeader backAction={onBack} backActionRef={backActionRef} title="Workout preview" /><EmptyState body="The planned workout was not changed. Try loading this preview again." heading="Workout preview could not be loaded" primaryAction={<PrimaryAction label="Retry preview" onPress={() => setGeneration((value) => value + 1)} />} /></>} />;
  }
  if (state === "missing" || detail === null) {
    return <AdaptiveScreen primary={<><ScreenHeader backAction={onBack} backActionRef={backActionRef} title="Workout preview" /><EmptyState body="This plan occurrence changed or is no longer available. Return to Calendar and refresh." heading="Workout preview unavailable" primaryAction={<PrimaryAction label="Back to Calendar" onPress={onBack} />} /></>} />;
  }

  const targets = detail.exercises.flatMap((exercise) => exercise.targets);
  const title = detail.dayName.trim() || detail.planName.trim();
  return (
    <AdaptiveScreen
      primary={<>
        <ScreenHeader backAction={onBack} backActionRef={backActionRef} title={title} titleStyle={calendarTypeScale.heading as TextStyle} />
        <View style={styles.summary} testID="planned-workout-summary">
          <Text accessibilityRole="header" style={[calendarTypeScale.heading as TextStyle, { color: colors.textPrimary }]}>Planned preview · read only</Text>
          <Text style={[calendarTypeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{detail.planName}</Text>
          <Text style={[calendarTypeScale.numeric as TextStyle, { color: colors.textSecondary }]}>{detail.localDate}</Text>
          <Text style={[calendarTypeScale.numeric as TextStyle, { color: colors.textPrimary }]}>{`0 of ${targets.length} sets`}</Text>
          <View accessibilityLabel={`0 of ${targets.length} sets complete`} style={[styles.progressTrack, { backgroundColor: colors.line }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.completed, width: "0%" }]} />
          </View>
        </View>
        <View accessibilityLabel="Planned Strength target facts" style={styles.exerciseList}>
          {detail.exercises.map((exercise) => {
            const expanded = expandedExerciseIds.has(exercise.id);
            const firstTarget = targetText(exercise.targets[0]!.targetJson)!;
            return (
              <View key={exercise.id} style={[styles.exercise, { borderColor: colors.line }]} testID={`planned-exercise-${exercise.id}`}>
                <FocusablePressable
                  accessibilityLabel={`${exercise.exerciseName}. ${firstTarget}. 0 of ${exercise.targets.length} complete. ${expanded ? "Collapse" : "Expand"} exercise`}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  onPress={() => setExpandedExerciseIds((current) => {
                    const next = new Set(current);
                    if (expanded) next.delete(exercise.id); else next.add(exercise.id);
                    return next;
                  })}
                  style={styles.exerciseHeader}
                >
                  <View style={styles.exerciseCopy}>
                    <Text accessibilityRole="header" style={[calendarTypeScale.heading as TextStyle, { color: colors.textPrimary }]}>{exercise.exerciseName}</Text>
                    <Text style={[calendarTypeScale.metadata as TextStyle, { color: colors.textSecondary }]}>{`${firstTarget} · 0/${exercise.targets.length} complete`}</Text>
                  </View>
                  <View testID={`planned-exercise-disclosure-${exercise.id}`}>
                    {expanded ? (
                      <ChevronDown accessible={false} color={colors.textSecondary} size={24} strokeWidth={2} />
                    ) : (
                      <ChevronRight accessible={false} color={colors.textSecondary} size={24} strokeWidth={2} />
                    )}
                  </View>
                </FocusablePressable>
                {expanded ? <View style={styles.table}>
                  <View style={styles.tableHeader}>
                    {["Set", "Previous", "Target", "State"].map((label) => <Text key={label} style={[calendarTypeScale.metadata as TextStyle, styles.cell, { color: colors.textSecondary }]}>{label}</Text>)}
                  </View>
                  {exercise.targets.map((target) => (
                    <View key={target.id} style={styles.row} testID={`planned-target-${target.id}`}>
                      <Text style={[calendarTypeScale.numeric as TextStyle, styles.cell, { color: colors.textPrimary }]}>{String(target.ordinal + 1).padStart(2, "0")}</Text>
                      <Text style={[calendarTypeScale.numeric as TextStyle, styles.cell, { color: colors.textSecondary }]}>{previousText(target) ?? "—"}</Text>
                      <Text style={[calendarTypeScale.numeric as TextStyle, styles.cell, { color: colors.textPrimary }]}>{targetText(target.targetJson)!}</Text>
                      <View accessibilityLabel="Planned" accessible style={styles.cell} testID={`planned-state-${target.id}`}>
                        <Minus accessible={false} color={colors.textSecondary} size={24} strokeWidth={2} />
                      </View>
                    </View>
                  ))}
                </View> : null}
              </View>
            );
          })}
        </View>
      </>}
    />
  );
}

const styles = StyleSheet.create({
  cell: { flex: 1, minWidth: 0 },
  exercise: { borderBottomWidth: 3 },
  exerciseCopy: { flex: 1, minWidth: 0 },
  exerciseHeader: { alignItems: "center", flexDirection: "row", gap: space[2], justifyContent: "space-between", minHeight: 72, paddingHorizontal: 14, paddingVertical: space[2] },
  exerciseList: { gap: space[2] },
  progressFill: { height: 4 },
  progressTrack: { height: 4, overflow: "hidden", width: "100%" },
  row: { alignItems: "center", flexDirection: "row", gap: space[2], minHeight: 48, paddingVertical: space[1] },
  summary: { gap: space[2], paddingVertical: space[4] },
  table: { gap: space[1], paddingHorizontal: 14, paddingVertical: space[2] },
  tableHeader: { flexDirection: "row", gap: space[2], minHeight: 28 },
});

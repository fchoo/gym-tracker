import React, { useEffect, useRef, useState } from "react";
import { Check, Minus } from "lucide-react-native";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import { presentSessionDetail } from "../../domains/workout/workoutPresentation";
import type { SessionDetail } from "../../domains/workout";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import { FocusablePressable } from "../components";
import { WorkoutSessionPresentation } from "../components/WorkoutSessionPresentation";
import { calendarTypeScale, space, useAppTheme } from "../theme";

function statusLabel(detail: SessionDetail): string {
  return detail.status === "partial" ? "Partial · read only" : "Complete · read only";
}

/**
 * Calendar's deliberately narrow historical-session surface. It accepts facts
 * and one return action only: no runtime, repository, or workflow commands can
 * cross this capability boundary.
 */
export function CalendarReadOnlyWorkout({
  detail,
  onGoBack,
}: Readonly<{
  detail: SessionDetail;
  onGoBack(): void;
}>) {
  const { colors } = useAppTheme();
  const presentation = presentSessionDetail(detail);
  const backRef = useRef<View>(null);
  const completed = detail.workingSetProgress.completed;
  const planned = detail.workingSetProgress.planned;
  const progressPercent = planned === 0 ? 0 : Math.round((completed / planned) * 100);
  const title = detail.dayName?.trim() || detail.planName?.trim() || "Workout details";
  const [expandedExerciseIds, setExpandedExerciseIds] = useState<ReadonlySet<string>>(
    () => new Set(presentation.exercises.map(({ id }) => id)),
  );

  useEffect(() => {
    backRef.current?.focus?.();
  }, []);

  return (
    <AdaptiveScreen
      primary={
        <>
          <View style={styles.header}>
            <FocusablePressable
              accessibilityLabel="Back to Calendar agenda"
              accessibilityRole="button"
              onPress={onGoBack}
              ref={backRef}
              style={styles.backAction}
            >
              <Text style={[calendarTypeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>Back</Text>
            </FocusablePressable>
            <Text accessibilityRole="header" style={[calendarTypeScale.heading as TextStyle, { color: colors.textPrimary }]}>{title}</Text>
          </View>
          <View style={styles.summary} testID="calendar-read-only-summary">
            <Text accessibilityRole="header" style={[calendarTypeScale.heading as TextStyle, { color: colors.textPrimary }]}>
              {statusLabel(detail)}
            </Text>
            <Text style={[calendarTypeScale.numeric as TextStyle, { color: colors.textSecondary }]}>
              {detail.localDate}
            </Text>
            <Text style={[calendarTypeScale.numeric as TextStyle, { color: colors.textPrimary }]}>
              {`${completed} of ${planned} sets`}
            </Text>
            <View accessibilityLabel={`${completed} of ${planned} sets complete`} style={[styles.progressTrack, { backgroundColor: colors.line }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.completed, width: `${Math.max(0, Math.min(100, progressPercent))}%` }]} />
            </View>
          </View>
          <WorkoutSessionPresentation
            model={presentation}
            isExerciseExpanded={(exercise) => expandedExerciseIds.has(exercise.id)}
            onExerciseToggle={(exercise, expanded) => {
              setExpandedExerciseIds((current) => {
                const next = new Set(current);
                if (expanded) next.delete(exercise.id); else next.add(exercise.id);
                return next;
              });
            }}
            exerciseSupportingText={(exercise) => {
              const completedSets = exercise.workingSets.filter(({ status }) => status === "completed").length;
              return `${exercise.workingSets[0]?.target ?? "Target unavailable"} · ${completedSets}/${exercise.workingSets.length} complete`;
            }}
            showGrip={false}
            typography="calendar"
            children={(exercise, expanded) => expanded ? (
              <View accessibilityLabel={`${exercise.name} read-only set facts`} style={styles.setTable}>
                <View style={styles.setHeader}>
                  {["Set", "Previous", "Result", "State"].map((label) => <Text key={label} style={[calendarTypeScale.metadata as TextStyle, styles.setCell, { color: colors.textSecondary }]}>{label}</Text>)}
                </View>
                {[...exercise.warmups, ...exercise.workingSets].map((set) => (
                  <View key={set.id} style={styles.setRow} testID={`calendar-read-only-set-${set.id}`}>
                    <Text style={[calendarTypeScale.numeric as TextStyle, styles.setCell, { color: colors.textPrimary }]}>{set.kind === "warmup" ? `W${set.ordinal + 1}` : String(set.ordinal + 1).padStart(2, "0")}</Text>
                    <Text style={[calendarTypeScale.numeric as TextStyle, styles.setCell, { color: colors.textSecondary }]}>{set.previous ?? "—"}</Text>
                    <Text style={[calendarTypeScale.numeric as TextStyle, styles.setCell, { color: colors.textPrimary }]}>{set.result ?? set.target}</Text>
                    <View
                      style={[styles.setCell, styles.setState]}
                      testID={`calendar-read-only-set-${set.id}-state`}
                    >
                      {set.status === "completed"
                        ? <Check accessible={false} color={colors.textSecondary} size={24} strokeWidth={2} />
                        : <Minus accessible={false} color={colors.textSecondary} size={24} strokeWidth={2} />}
                      <Text style={[calendarTypeScale.metadata as TextStyle, { color: colors.textSecondary }]}>
                        {set.status === "completed" ? "Complete" : "Not completed"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          />
          <Text style={[calendarTypeScale.body as TextStyle, { color: colors.textSecondary }]}>
            Historical workout facts are read only here. Corrections remain available from the session history workflow.
          </Text>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  backAction: { alignItems: "center", justifyContent: "center", minHeight: 48, minWidth: 48, paddingHorizontal: space[2] },
  header: { alignItems: "center", flexDirection: "row", gap: space[2], minHeight: 56 },
  progressFill: { height: 4 },
  progressTrack: { height: 4, overflow: "hidden", width: "100%" },
  setCell: { flex: 1, minWidth: 0 },
  setHeader: { flexDirection: "row", gap: space[2], minHeight: 28 },
  setRow: { alignItems: "center", flexDirection: "row", gap: space[2], minHeight: 48, paddingVertical: space[1] },
  setState: { alignItems: "center", flexDirection: "row", gap: space[1] },
  setTable: { gap: space[1], paddingHorizontal: space[4], paddingVertical: space[2] },
  summary: { gap: space[2], paddingVertical: space[4] },
});

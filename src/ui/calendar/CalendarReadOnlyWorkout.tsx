import React, { useState } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import { presentSessionDetail } from "../../domains/workout/workoutPresentation";
import type { SessionDetail } from "../../domains/workout";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import { FocusablePressable } from "../components";
import { WorkoutSessionPresentation } from "../components/WorkoutSessionPresentation";
import { space, typeScale, useAppTheme } from "../theme";

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
  const completed = detail.workingSetProgress.completed;
  const planned = detail.workingSetProgress.planned;
  const [expandedExerciseIds, setExpandedExerciseIds] = useState<ReadonlySet<string>>(
    () => new Set(presentation.exercises.map(({ id }) => id)),
  );

  return (
    <AdaptiveScreen
      primary={
        <>
          <View style={styles.header}>
            <FocusablePressable
              accessibilityLabel="Back to Calendar agenda"
              accessibilityRole="button"
              onPress={onGoBack}
              style={styles.backAction}
            >
              <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>Back</Text>
            </FocusablePressable>
            <Text accessibilityRole="header" style={[typeScale.screenTitle as TextStyle, { color: colors.textPrimary }]}>Workout details</Text>
          </View>
          <View style={styles.summary} testID="calendar-read-only-summary">
            <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>
              {statusLabel(detail)}
            </Text>
            <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
              {detail.localDate}
            </Text>
            <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>
              {`${completed} of ${planned} sets`}
            </Text>
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
            children={(exercise, expanded) => expanded ? (
              <View accessibilityLabel={`${exercise.name} read-only set facts`} style={styles.setTable}>
                <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Set · Previous · Result or target · State</Text>
                {[...exercise.warmups, ...exercise.workingSets].map((set) => (
                  <View key={set.id} style={styles.setRow} testID={`calendar-read-only-set-${set.id}`}>
                    <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{set.kind === "warmup" ? `W${set.ordinal + 1}` : `Set ${set.ordinal + 1}`}</Text>
                    <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>{set.previous ?? "—"}</Text>
                    <Text style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>{set.result ?? set.target}</Text>
                    <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>{set.status === "completed" ? "Complete" : "Not completed"}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          />
          <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
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
  setRow: { gap: space[2], minHeight: 48, paddingVertical: space[1] },
  setTable: { gap: space[1], paddingHorizontal: space[4], paddingVertical: space[2] },
  summary: { gap: space[2], paddingVertical: space[4] },
});

import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import type {
  WorkoutPresentationExercise,
  WorkoutPresentationModel,
} from "../../domains/workout/workoutPresentation";
import { space, typeScale, useAppTheme } from "../theme";
import { FocusablePressable } from "./index";
import { WorkoutSetFactsRow } from "./WorkoutSetFactsRow";

export type WorkoutSessionPresentationProps = Readonly<{
  model: WorkoutPresentationModel;
  children?: (exercise: WorkoutPresentationExercise, expanded: boolean, index: number) => React.ReactNode;
  exerciseAccessibilityLabel?: (exercise: WorkoutPresentationExercise, expanded: boolean, index: number) => string;
  exerciseSupportingText?: (exercise: WorkoutPresentationExercise, expanded: boolean, index: number) => string;
  isExerciseExpanded?: (exercise: WorkoutPresentationExercise, index: number) => boolean;
  onExerciseToggle?: (exercise: WorkoutPresentationExercise, expanded: boolean, index: number) => void;
  renderExerciseAccessory?: (exercise: WorkoutPresentationExercise, index: number) => React.ReactNode;
}>;

/** Command-free exercise disclosure and facts surface reusable by read-only consumers. */
export function WorkoutSessionPresentation({
  model,
  children,
  exerciseAccessibilityLabel,
  exerciseSupportingText,
  isExerciseExpanded,
  onExerciseToggle,
  renderExerciseAccessory,
}: WorkoutSessionPresentationProps) {
  const { colors } = useAppTheme();
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(model.activeExerciseId === null ? [] : [model.activeExerciseId]),
  );
  useEffect(() => {
    if (model.activeExerciseId === null) return;
    setExpandedIds((current) => current.has(model.activeExerciseId!)
      ? current
      : new Set([...current, model.activeExerciseId!]));
  }, [model.activeExerciseId]);

  return (
    <View testID="workout-session-presentation">
      {model.exercises.map((exercise, index) => {
        const expanded = isExerciseExpanded?.(exercise, index) ?? expandedIds.has(exercise.id);
        const active = exercise.id === model.activeExerciseId;
        const completed = exercise.workingSets.filter(({ status }) => status === "completed").length;
        const total = exercise.workingSets.length;
        const status = active ? "Current" : exercise.status.charAt(0).toUpperCase() + exercise.status.slice(1);
        return (
          <View
            key={exercise.id}
            style={[styles.exercise, active ? { borderLeftColor: colors.yellow, borderLeftWidth: 4 } : undefined]}
            testID={`workout-presentation-exercise-${exercise.id}`}
          >
            {index === 0 ? null : <View
              style={[styles.divider, { backgroundColor: colors.divider }]}
              testID={`exercise-divider-${exercise.id}`}
            />}
            <FocusablePressable
              accessibilityLabel={exerciseAccessibilityLabel?.(exercise, expanded, index)
                ?? `${exercise.name}. ${status}. ${completed} of ${total} working sets. ${expanded ? "Collapse" : "Expand"} exercise`}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => {
                if (onExerciseToggle !== undefined) {
                  onExerciseToggle(exercise, expanded, index);
                  return;
                }
                setExpandedIds((current) => {
                  const next = new Set(current);
                  if (expanded) next.delete(exercise.id); else next.add(exercise.id);
                  return next;
                });
              }}
              style={styles.header}
            >
              <View style={styles.copy}>
                <Text accessibilityRole="header" style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{exercise.name}</Text>
                <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{exerciseSupportingText?.(exercise, expanded, index) ?? `${exercise.status} · ${completed} of ${total} working sets`}</Text>
              </View>
              {renderExerciseAccessory?.(exercise, index)}
              {expanded ? <ChevronDown color={colors.textSecondary} size={24} /> : <ChevronRight color={colors.textSecondary} size={24} />}
            </FocusablePressable>
            {children !== undefined
              ? children(exercise, expanded, index)
              : expanded ? (
                <View>{exercise.warmups.map((set) => <WorkoutSetFactsRow key={set.id} set={set} />)}{exercise.workingSets.map((set) => <WorkoutSetFactsRow key={set.id} set={set} />)}</View>
              ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  exercise: { marginBottom: space[2] },
  divider: { height: 3, width: "100%" },
  header: { alignItems: "center", flexDirection: "row", gap: space[2], minHeight: 80, minWidth: 48, paddingHorizontal: space[4] },
  copy: { flex: 1 },
});

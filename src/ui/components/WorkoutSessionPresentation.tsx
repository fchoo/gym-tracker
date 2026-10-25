import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react-native";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import type {
  WorkoutPresentationExercise,
  WorkoutPresentationModel,
} from "../../domains/workout/workoutPresentation";
import { calendarTypeScale, space, workoutTypeScale, useAppTheme } from "../theme";
import { CalendarDisclosureChevron } from "../calendar/CalendarDisclosureChevron";
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
  renderExerciseGrip?: (exercise: WorkoutPresentationExercise, index: number) => React.ReactNode;
  renderExerciseHeader?: (exercise: WorkoutPresentationExercise, index: number, header: React.ReactNode) => React.ReactNode;
  showGrip?: boolean;
  typography?: "default" | "calendar";
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
  renderExerciseGrip,
  renderExerciseHeader,
  showGrip = true,
  typography = "default",
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
        const header = (
          <View style={styles.header} testID={`exercise-header-${exercise.id}`}>
            {renderExerciseGrip !== undefined ? renderExerciseGrip(exercise, index) : showGrip ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.grip}>
              <GripVertical color={colors.textSecondary} size={24} />
            </View> : null}
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
              style={styles.disclosure}
              testID="workout-exercise-disclosure"
            >
              <View style={styles.copy}>
                <Text accessibilityRole="header" style={[(typography === "calendar" ? calendarTypeScale.heading : workoutTypeScale.bodyStrong) as TextStyle, { color: colors.textPrimary }]}>{exercise.name}</Text>
                <Text style={[(typography === "calendar" ? calendarTypeScale.metadata : workoutTypeScale.secondary) as TextStyle, { color: colors.textSecondary }]}>{exerciseSupportingText?.(exercise, expanded, index) ?? `${exercise.status} · ${completed} of ${total} working sets`}</Text>
              </View>
              {typography === "calendar" ? (
                <CalendarDisclosureChevron
                  color={colors.textSecondary}
                  expanded={expanded}
                  testID={`calendar-exercise-disclosure-${exercise.id}`}
                />
              ) : expanded ? <ChevronDown color={colors.textSecondary} size={24} /> : <ChevronRight color={colors.textSecondary} size={24} />}
            </FocusablePressable>
            <View style={styles.actions}>{renderExerciseAccessory?.(exercise, index)}</View>
          </View>
        );
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
            {renderExerciseHeader?.(exercise, index, header) ?? header}
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
  header: { alignItems: "stretch", flexDirection: "row", minHeight: 80 },
  grip: { alignItems: "center", justifyContent: "center", minHeight: 80, width: 48 },
  disclosure: { alignItems: "center", flex: 1, flexDirection: "row", gap: space[2], justifyContent: "space-between", minHeight: 80, minWidth: 48, paddingVertical: space[2] },
  copy: { flex: 1, flexShrink: 1 },
  actions: { alignItems: "center", flexDirection: "row", minHeight: 80 },
});

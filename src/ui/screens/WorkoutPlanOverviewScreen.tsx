import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type {
  ActiveWorkoutExercise,
  ActiveWorkoutView,
  WorkoutSessionView,
} from "../../domains/workout";
import {
  ContentCard,
  EmptyState,
  FocusablePressable,
  PrimaryAction,
  ScreenHeader,
  SkeletonBlock,
} from "../components";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  space,
  typeScale,
  useAppTheme,
} from "../theme";

function exerciseStateLabel(exercise: ActiveWorkoutExercise): string {
  switch (exercise.status) {
    case "active":
      return "Current";
    case "completed":
      return "Completed";
    case "skipped":
      return "Skipped";
    case "planned":
      return "Planned";
  }
}

export type WorkoutPlanOverviewScreenProps = Readonly<{
  scene: WorkoutPlanOverviewScene;
  onBack: () => void;
  onReturnToActiveWorkout: () => void;
  onReviewExercise: (sessionExerciseId: string) => void;
  width?: number;
}>;

export type WorkoutPlanOverviewScene =
  | Readonly<{ state: "loading" }>
  | Readonly<{ state: "error" }>
  | Readonly<{ state: "empty" }>
  | Readonly<{ state: "ready"; view: ActiveWorkoutView }>;

export function resolveWorkoutPlanOverviewScene(
  view: WorkoutSessionView,
): WorkoutPlanOverviewScene {
  if ("state" in view || view.exercises.length === 0) {
    return { state: "empty" };
  }
  return { state: "ready", view };
}

export function WorkoutPlanOverviewScreen({
  scene,
  onBack,
  onReturnToActiveWorkout,
  onReviewExercise,
  width,
}: WorkoutPlanOverviewScreenProps) {
  const { colors } = useAppTheme();
  const adaptiveWidth = width === undefined ? {} : { width };
  let content: React.ReactNode;

  switch (scene.state) {
    case "loading":
      content = (
        <View
          accessible
          accessibilityLabel="Loading today's plan"
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          style={styles.loading}
        >
          <SkeletonBlock height={34} width="72%" />
          <SkeletonBlock height={72} />
          <SkeletonBlock height={72} />
        </View>
      );
      break;
    case "error":
      content = (
        <EmptyState
          body="Your workout was not changed. Return to the active workout to continue."
          heading="Today's plan could not be opened"
          primaryAction={(
            <PrimaryAction
              label="Return to active workout"
              onPress={onReturnToActiveWorkout}
            />
          )}
        />
      );
      break;
    case "empty":
      content = (
        <View style={styles.empty}>
          <Text
            accessibilityLabel="No exercises in today's plan"
            accessibilityLiveRegion="polite"
            accessibilityRole="summary"
            style={[
              typeScale.sectionTitle as TextStyle,
              { color: colors.textPrimary },
            ]}
          >
            No exercises in today's plan
          </Text>
          <Text
            style={[
              typeScale.body as TextStyle,
              { color: colors.textSecondary },
            ]}
          >
            No exercises are planned in this session yet.
          </Text>
          <PrimaryAction
            label="Return to active workout"
            onPress={onReturnToActiveWorkout}
          />
        </View>
      );
      break;
    case "ready": {
      const { view } = scene;
      content = (
        <>
          <View
            accessibilityLiveRegion="polite"
            accessibilityRole="summary"
            style={styles.intro}
          >
            <Text
              style={[
                typeScale.body as TextStyle,
                { color: colors.textSecondary },
              ]}
            >
              Review any exercise without changing the current workout.
            </Text>
          </View>
          <View style={styles.list}>
            {view.exercises.map((exercise, index) => {
              const state = exerciseStateLabel(exercise);
              return (
                <ContentCard
                  key={exercise.id}
                  selected={exercise.id === view.activeExerciseId}
                  {...(exercise.status === "completed"
                    ? { status: "completed" as const }
                    : exercise.status === "skipped"
                      ? { status: "attention" as const }
                      : {})}
                  testID={`today-plan-exercise-${exercise.id}`}
                >
                  <FocusablePressable
                    accessibilityHint="Opens this exercise for review without changing workout progress"
                    accessibilityLabel={`${index + 1}. ${exercise.name}. ${state}. Open for review`}
                    accessibilityRole="button"
                    focusable
                    onPress={() => onReviewExercise(exercise.id)}
                    style={styles.exercise}
                  >
                    <View style={styles.exerciseText}>
                      <Text
                        numberOfLines={2}
                        style={[
                          typeScale.bodyStrong as TextStyle,
                          { color: colors.contentCardText },
                        ]}
                      >
                        {`${index + 1}. ${exercise.name}`}
                      </Text>
                      <Text
                        style={[
                          typeScale.label as TextStyle,
                          { color: colors.contentCardTextSecondary },
                        ]}
                      >
                        {state}
                      </Text>
                    </View>
                    <Text
                      accessibilityElementsHidden
                      style={[
                        typeScale.label as TextStyle,
                        { color: colors.contentCardTextSecondary },
                      ]}
                    >
                      Review
                    </Text>
                  </FocusablePressable>
                </ContentCard>
              );
            })}
          </View>
        </>
      );
      break;
    }
  }

  return (
    <AdaptiveScreen
      {...adaptiveWidth}
      constrainActiveWork
      primary={
        <>
          <ScreenHeader
            backAction={onBack}
            eyebrow="FOCUSED WORKOUT"
            title="Today's plan"
          />
          {content}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  empty: {
    gap: space[4],
  },
  intro: {
    paddingVertical: space[1],
  },
  list: {
    gap: space[2],
  },
  loading: {
    gap: space[4],
  },
  exercise: {
    alignItems: "center",
    flexDirection: "row",
    gap: space[2],
    justifyContent: "space-between",
    minHeight: 48,
  },
  exerciseText: {
    flex: 1,
    gap: space[1],
    minWidth: 0,
  },
});

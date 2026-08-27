import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type {
  ExerciseEffort,
} from "../../domains/progression";
import type {
  SessionDetail,
} from "../../domains/workout";
import {
  InlineNotice,
  ContentCard,
  MetricSummary,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SectionHeader,
} from "../components";
import {
  RecommendationSurface,
} from "../components/RecommendationSurface";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  space,
  typeScale,
  useAppTheme,
} from "../theme";

const effortOptions = [
  ["Easy", "easy"],
  ["On target", "on_target"],
  ["Hard", "hard"],
  ["Failed", "failed"],
] as const;

function durationText(durationMs: number | null): string {
  if (durationMs === null) {
    return "—";
  }
  const minutes = Math.max(0, Math.round(durationMs / 60_000));
  return `${minutes} min`;
}

function progressText(progress: SessionDetail["exerciseProgress"]): string {
  return progress.percent === null
    ? `${progress.completed}/${progress.planned}`
    : `${progress.completed}/${progress.planned} (${progress.percent}%)`;
}

export function WorkoutCompletionScreen({
  detail,
  summaryError = false,
  effortBusy = false,
  recommendationBusy = false,
  width,
  onRecordEffort,
  onAcceptRecommendation,
  onKeepCurrentTarget,
  onRetrySummary,
  onViewDetails,
  onReturnToday,
}: Readonly<{
  detail: SessionDetail;
  summaryError?: boolean;
  effortBusy?: boolean;
  recommendationBusy?: boolean;
  width?: number;
  onRecordEffort: (
    sessionExerciseId: string,
    effort: ExerciseEffort,
  ) => void;
  onAcceptRecommendation: (recommendationId: string) => void;
  onKeepCurrentTarget: (recommendationId: string) => void;
  onRetrySummary: () => void;
  onViewDetails: () => void;
  onReturnToday: () => void;
}>) {
  const { colors } = useAppTheme();
  const adaptiveWidth = width === undefined ? {} : { width };
  const savedPartial = detail.status === "partial";
  const completedExercises = detail.exercises.filter(
    ({ status }) => status === "completed",
  );

  return (
    <AdaptiveScreen
      {...adaptiveWidth}
      primary={
        <>
          <ScreenHeader
            eyebrow={savedPartial ? "PARTIAL SAVED" : "WORKOUT SAVED"}
            title={savedPartial ? "Workout saved" : "Workout complete"}
          />
          <ContentCard
            style={styles.context}
            testID="workout-completion-context-card"
          >
            <Text
              style={[
                typeScale.bodyStrong as TextStyle,
                { color: colors.contentCardText },
              ]}
            >
              {[detail.planName, detail.dayName].filter(Boolean).join(" · ")
                || detail.sourceLabel}
            </Text>
            <Text
              style={[
                typeScale.body as TextStyle,
                { color: colors.contentCardTextSecondary },
              ]}
            >
              {savedPartial
                ? `Partial · ${detail.exerciseProgress.completed} of ${detail.exerciseProgress.planned} exercises`
                : detail.statusLabel}
            </Text>
          </ContentCard>
          {summaryError ? (
            <InlineNotice
              action={
                <SecondaryAction
                  label="Retry summary"
                  onPress={onRetrySummary}
                />
              }
              body="Workout saved. Some summary details could not be calculated."
              heading="Summary needs another try"
              tone="attention"
            />
          ) : null}
          <ContentCard
            style={styles.metrics}
            testID="workout-completion-metrics-card"
          >
            <MetricSummary
              forceStacked
              label="Duration"
              tone="card"
              value={durationText(detail.durationMs)}
            />
            <MetricSummary
              forceStacked
              label="Exercises"
              tone="card"
              value={progressText(detail.exerciseProgress)}
            />
            <MetricSummary
              forceStacked
              label="Working sets"
              tone="card"
              value={String(detail.workingSetProgress.completed)}
            />
          </ContentCard>
          {completedExercises.length === 0 ? (
            <InlineNotice
              body="No completed comparable exercise results are available for this session."
              heading="No exercise summary yet"
              tone="neutral"
            />
          ) : (
            <View style={styles.section}>
              <SectionHeader
                supportingText="Factual results from completed working sets"
                title="Exercise results"
              />
              {completedExercises.map((exercise) => (
                <ContentCard
                  key={exercise.id}
                  style={styles.result}
                  testID={`workout-completion-result-${exercise.id}`}
                >
                  <Text
                    accessibilityRole="header"
                    style={[
                      typeScale.sectionTitle as TextStyle,
                      { color: colors.contentCardText },
                    ]}
                  >
                    {exercise.name}
                  </Text>
                  <Text
                    style={[
                      typeScale.body as TextStyle,
                      { color: colors.contentCardTextSecondary },
                    ]}
                  >
                    Top working set · {exercise.topWorkingSet ?? "No completed set"}
                  </Text>
                  {exercise.totalWorkingReps === null ? null : (
                    <Text
                      style={[
                        typeScale.body as TextStyle,
                        { color: colors.contentCardTextSecondary },
                      ]}
                    >
                      Total working reps · {exercise.totalWorkingReps}
                    </Text>
                  )}
                  <Text
                    style={[
                      typeScale.secondary as TextStyle,
                      { color: colors.contentCardTextSecondary },
                    ]}
                  >
                    Warm-ups excluded
                  </Text>
                  {exercise.metricProfile !== "load_reps"
                    || exercise.effort !== null ? null : (
                    <View style={styles.effort}>
                      <SectionHeader
                        supportingText="Optional · skip without blocking completion"
                        title={`How did ${exercise.name} feel?`}
                        tone="card"
                      />
                      <View style={styles.effortActions}>
                        {effortOptions.map(([label, value]) => (
                          <SecondaryAction
                            disabled={effortBusy}
                            key={value}
                            label={label}
                            onPress={() => onRecordEffort(exercise.id, value)}
                          />
                        ))}
                      </View>
                    </View>
                  )}
                </ContentCard>
              ))}
            </View>
          )}
          {detail.recommendations.map((recommendation) => (
            <RecommendationSurface
              busy={recommendationBusy}
              key={recommendation.id}
              onAccept={() => onAcceptRecommendation(recommendation.id)}
              onKeepCurrent={() => onKeepCurrentTarget(recommendation.id)}
              recommendation={recommendation}
            />
          ))}
          <View style={styles.actions}>
            <SecondaryAction
              label="View workout details"
              onPress={onViewDetails}
            />
            <PrimaryAction
              label="Return to Today"
              onPress={onReturnToday}
            />
          </View>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: space[2],
  },
  context: {
    gap: space[1],
  },
  effort: {
    gap: space[2],
  },
  effortActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  metrics: {
    gap: space[4],
  },
  result: {
    gap: space[2],
    padding: space[4],
  },
  section: {
    gap: space[4],
  },
});

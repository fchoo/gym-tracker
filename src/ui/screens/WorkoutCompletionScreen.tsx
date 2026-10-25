import React from "react";
import {
  Pencil,
} from "lucide-react-native";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type {
  ExerciseEffort,
} from "../../domains/progression";
import type { MetricTarget } from "../../domains/metrics";
import type {
  CompletedWorkoutPlanWriteBackChoiceState,
  CompletedWorkoutPlanWriteBackState,
  SessionDetail,
} from "../../domains/workout";
import {
  ActionRow,
  InlineNotice,
  ContentCard,
  MetricSummary,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SectionHeader,
} from "../components";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { BottomSheet } from "../components/BottomSheet";
import {
  RecommendationSurface,
} from "../components/RecommendationSurface";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  space,
  workoutTypeScale,
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

function kilograms(grams: number): string {
  const value = grams / 1_000;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} kg`;
}

function targetText(target: MetricTarget): string {
  const repetitions = (min: number, max: number) => min === max
    ? String(min)
    : `${min}–${max}`;
  switch (target.profile) {
    case "load_reps":
      return `${kilograms(target.loadGrams)} × ${repetitions(target.minReps, target.maxReps)}`;
    case "bodyweight_reps":
      return `${repetitions(target.minReps, target.maxReps)} reps`;
    case "added_load_reps":
      return `${kilograms(target.addedLoadGrams)} added × ${repetitions(target.minReps, target.maxReps)}`;
    case "assisted_reps":
      return `${kilograms(target.assistanceGrams)} assist × ${repetitions(target.minReps, target.maxReps)}`;
    case "timed_hold":
      return target.version === 1
        ? `${target.durationSeconds} sec`
        : `${target.durationMs / 1_000} sec`;
    case "fixed_distance":
      return `${target.plannedDistanceMeters} m`;
    case "fixed_time":
      return `${target.plannedDurationMs / 1_000} sec`;
    case "intervals":
      return `${target.plannedRounds} rounds · ${target.workIntervalMs / 1_000} sec work`;
    case "unscored":
      return "Completion only";
  }
}

function targetUnit(profile: MetricTarget["profile"]): string {
  switch (profile) {
    case "load_reps": return "load kg × reps";
    case "bodyweight_reps": return "reps";
    case "added_load_reps": return "added load kg × reps";
    case "assisted_reps": return "assistance kg × reps";
    case "timed_hold": return "sec";
    case "fixed_distance": return "m";
    case "fixed_time": return "sec";
    case "intervals": return "rounds · sec work · sec rest";
    case "unscored": return "completion only";
  }
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
  onApplyPlanWriteBack = () => undefined,
  onKeepPlanAsIs = () => undefined,
  planWriteBack = { state: "completed", disposition: "not_eligible" },
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
  onApplyPlanWriteBack?: (
    state: CompletedWorkoutPlanWriteBackChoiceState,
  ) => void;
  onKeepPlanAsIs?: (
    state: CompletedWorkoutPlanWriteBackChoiceState,
  ) => void;
  planWriteBack?: CompletedWorkoutPlanWriteBackState;
  onRetrySummary: () => void;
  onViewDetails: () => void;
  onReturnToday: () => void;
}>) {
  const { colors } = useAppTheme();
  const adaptiveWidth = width === undefined ? {} : { width };
  const savedPartial = detail.status === "partial";
  const keepPlanAsIsRef = React.useRef<View>(null);
  const completedExercises = detail.exercises.filter(
    ({ status }) => status === "completed",
  );
  const writeBackChoice = planWriteBack.state === "awaiting_choice"
    || planWriteBack.state === "save_failed"
    ? planWriteBack
    : null;
  const writeBackVisible = writeBackChoice !== null
    || planWriteBack.state === "applying";
  const writeBackBusy = planWriteBack.state === "applying";
  const writeBackFailed = planWriteBack.state === "save_failed";
  const writeBackPreview = planWriteBack.state === "applying"
    ? planWriteBack.preview
    : writeBackChoice?.preview ?? null;
  const writeBackHasChanges = (writeBackPreview?.changes.length ?? 0) > 0;
  const noDifference = writeBackChoice !== null && !writeBackHasChanges;

  return (
    <>
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
                workoutTypeScale.bodyStrong as TextStyle,
                { color: colors.contentCardText },
              ]}
            >
              {[detail.planName, detail.dayName].filter(Boolean).join(" · ")
                || detail.sourceLabel}
            </Text>
            <Text
              style={[
                workoutTypeScale.body as TextStyle,
                { color: colors.contentCardTextSecondary },
              ]}
            >
              {savedPartial
                ? `Partial · ${detail.exerciseProgress.completed} of ${detail.exerciseProgress.planned} exercises`
                : detail.statusLabel}
            </Text>
            {detail.modifiedFromPlan !== true ? null : (
              <View
                accessibilityLabel="Modified from plan"
                style={styles.modified}
              >
                <Pencil
                  accessibilityElementsHidden
                  color={colors.contentCardTextSecondary}
                  importantForAccessibility="no-hide-descendants"
                  size={20}
                />
                <Text
                  style={[
                    workoutTypeScale.bodyStrong as TextStyle,
                    { color: colors.contentCardText },
                  ]}
                >
                  Modified from plan
                </Text>
              </View>
            )}
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
                      workoutTypeScale.sectionTitle as TextStyle,
                      { color: colors.contentCardText },
                    ]}
                  >
                    {exercise.name}
                  </Text>
                  <Text
                    style={[
                      workoutTypeScale.body as TextStyle,
                      { color: colors.contentCardTextSecondary },
                    ]}
                  >
                    Top working set · {exercise.topWorkingSet ?? "No completed set"}
                  </Text>
                  {exercise.totalWorkingReps === null ? null : (
                    <Text
                      style={[
                        workoutTypeScale.body as TextStyle,
                        { color: colors.contentCardTextSecondary },
                      ]}
                    >
                      Total working reps · {exercise.totalWorkingReps}
                    </Text>
                  )}
                  <Text
                    style={[
                      workoutTypeScale.secondary as TextStyle,
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
          <ActionRow>
            <SecondaryAction
              label="View workout details"
              onPress={onViewDetails}
            />
            <PrimaryAction
              label="Return to Today"
              onPress={onReturnToday}
            />
          </ActionRow>
        </>
      }
      />
      {noDifference ? (
        <BottomSheet
          heading="No plan changes to review"
          initialFocusRef={keepPlanAsIsRef}
          onCancel={() => onKeepPlanAsIs(writeBackChoice)}
          scrollTestID="workout-plan-write-back-sheet"
          visible
        >
          <Text style={[workoutTypeScale.body as TextStyle, { color: colors.textSecondary }]}>
            This workout does not change future targets. Keep the plan as-is.
          </Text>
          <SecondaryAction
            label="Keep plan as-is"
            onPress={() => onKeepPlanAsIs(writeBackChoice)}
            ref={keepPlanAsIsRef}
          />
        </BottomSheet>
      ) : (
      <ConfirmationDialog
        body={writeBackFailed
          ? "Your completed workout is safe. Try again or keep the plan as-is."
          : writeBackPreview === null
            ? "Saving these changes to the plan."
            : `You changed this workout from its plan. Save these changes to ${writeBackPreview.planName} · ${writeBackPreview.dayName}?`}
        cancelLabel="Keep plan as-is"
        confirmBusy={writeBackBusy}
        confirmLabel={writeBackFailed
          ? "Retry saving changes"
          : "Save changes to plan"}
        heading={writeBackFailed
          ? "Changes were not saved to the plan"
          : "Save these changes to the plan?"}
        initialFocusRef={keepPlanAsIsRef}
        onCancel={() => {
          if (writeBackChoice !== null) {
            onKeepPlanAsIs(writeBackChoice);
          }
        }}
        onConfirm={() => {
          if (writeBackChoice !== null) {
            onApplyPlanWriteBack(writeBackChoice);
          }
        }}
        scrollTestID="workout-plan-write-back-sheet"
        visible={writeBackVisible && writeBackHasChanges}
      >
        {writeBackPreview?.changes.map((change) => (
          <ContentCard
            key={`${change.exerciseId}:${change.targetOrdinal}`}
            style={styles.planChange}
          >
            <Text style={[workoutTypeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>
              Exercise · {change.exerciseId}
            </Text>
            <Text style={[workoutTypeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>
              Current plan · {targetText(change.current.target)}
            </Text>
            <Text style={[workoutTypeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>
              Proposed · {targetText(change.proposed.target)}
            </Text>
            <Text style={[workoutTypeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
              {targetUnit(change.metricIdentity.profile)}
            </Text>
          </ContentCard>
        ))}
      </ConfirmationDialog>
      )}
    </>
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
  modified: {
    alignItems: "center",
    flexDirection: "row",
    gap: space[1],
  },
  planChange: {
    gap: space[1],
    padding: space[2],
  },
  result: {
    gap: space[2],
    padding: space[4],
  },
  section: {
    gap: space[4],
  },
});

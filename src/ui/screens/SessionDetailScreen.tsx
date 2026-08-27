import React, {
  useRef,
  useState,
} from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type {
  MetricTarget,
} from "../../domains/metrics";
import type {
  SessionDetail,
  SessionExerciseDetail,
  SessionNonLoadOutcome,
  SessionProgress,
} from "../../domains/workout";
import {
  ConfirmationSheet,
  InlineNotice,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SectionHeader,
} from "../components";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  radius,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

function progressText(progress: SessionProgress): string {
  return progress.percent === null
    ? `${progress.completed}/${progress.planned}`
    : `${progress.completed}/${progress.planned} (${progress.percent}%)`;
}

function durationText(durationMs: number | null): string {
  if (durationMs === null) {
    return "In progress";
  }
  return `${Math.max(0, Math.round(durationMs / 60_000))} min`;
}

function targetText(target: MetricTarget): string {
  switch (target.profile) {
    case "load_reps":
      return `${target.loadGrams / 1_000} kg × ${target.targetReps?.[0] ?? target.maxReps}`;
    case "bodyweight_reps":
      return `Bodyweight × ${target.maxReps}`;
    case "added_load_reps":
      return `BW + ${target.addedLoadGrams / 1_000} kg × ${target.maxReps}`;
    case "assisted_reps":
      return `${target.assistanceGrams / 1_000} kg assist × ${target.maxReps}`;
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
      return "Complete";
  }
}

function sourceEvidenceText(outcome: SessionNonLoadOutcome): string {
  const count = outcome.evidence.sourceFactCount;
  return `Source evidence · ${count} completed working ${count === 1 ? "set" : "sets"}`;
}

function sourceExercise(
  detail: SessionDetail,
  outcome: SessionNonLoadOutcome,
): SessionExerciseDetail {
  const existing = detail.exercises.find(
    ({ id }) => id === outcome.source.sessionExerciseId,
  );
  return existing ?? {
    id: outcome.source.sessionExerciseId,
    exerciseId: outcome.exerciseId,
    name: outcome.exerciseName,
    metricIdentity: outcome.evidence.metricIdentity,
    metricProfile: outcome.profile,
    ordinal: Number.MAX_SAFE_INTEGER,
    status: "completed",
    revision: outcome.source.effectiveRevision,
    effort: null,
    topWorkingSet: null,
    totalWorkingReps: null,
    warmups: [],
    workingSets: [],
  };
}

export function SessionDetailScreen({
  detail,
  width,
  onGoBack,
  onCorrectWorkout,
  onRemoveFromHistory,
  onOpenExerciseHistory,
  onResume,
}: Readonly<{
  detail: SessionDetail;
  width?: number;
  onGoBack: () => void;
  onCorrectWorkout?: () => void;
  onRemoveFromHistory?: () => void | Promise<void>;
  onOpenExerciseHistory(exercise: SessionDetail["exercises"][number]): void;
  onResume: () => void;
}>) {
  const { colors } = useAppTheme();
  const [removeConfirmationVisible, setRemoveConfirmationVisible] = useState(false);
  const [removeFailed, setRemoveFailed] = useState(false);
  const [removing, setRemoving] = useState(false);
  const removeActionRef = useRef<View>(null);
  const adaptiveWidth = width === undefined ? {} : { width };

  return (
    <>
      <AdaptiveScreen
      {...adaptiveWidth}
      primary={
        <>
          <ScreenHeader
            backAction={onGoBack}
            eyebrow={detail.corrected === true
              ? `${detail.statusLabel.toUpperCase()} · CORRECTED`
              : detail.statusLabel.toUpperCase()}
            title="Workout details"
          />
          <View style={styles.summary}>
            <Text
              style={[
                typeScale.sectionTitle as TextStyle,
                { color: colors.textPrimary },
              ]}
            >
              {[detail.planName, detail.dayName].filter(Boolean).join(" · ")
                || detail.sourceLabel}
            </Text>
            <Text
              style={[
                typeScale.body as TextStyle,
                { color: colors.textSecondary },
              ]}
            >
              {detail.localDate} · {durationText(detail.durationMs)}
            </Text>
            <Text
              style={[
                typeScale.bodyStrong as TextStyle,
                { color: colors.textPrimary },
              ]}
            >
              Exercises · {progressText(detail.exerciseProgress)}
            </Text>
            <Text
              style={[
                typeScale.bodyStrong as TextStyle,
                { color: colors.textPrimary },
              ]}
            >
              Working sets · {progressText(detail.workingSetProgress)}
            </Text>
            {detail.ownerNote === null || detail.ownerNote === undefined
              ? null
              : (
                <Text
                  style={[
                    typeScale.body as TextStyle,
                    { color: colors.textSecondary },
                  ]}
                >
                  Owner note · {detail.ownerNote}
                </Text>
              )}
          </View>
          {detail.exercises.map((exercise) => (
            <View
              key={exercise.id}
              style={[
                styles.exercise,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.divider,
                },
              ]}
            >
              <SectionHeader
                supportingText={`${exercise.status === "skipped" ? "Skipped" : exercise.status} · ${
                  exercise.topWorkingSet ?? "No completed working set"
                }`}
                title={exercise.name}
              />
              {exercise.effort === null ? null : (
                <Text
                  style={[
                    typeScale.body as TextStyle,
                    { color: colors.textSecondary },
                  ]}
                >
                  Effort · {exercise.effort.replace("_", " ")}
                </Text>
              )}
              {exercise.warmups.length === 0 ? null : (
                <View style={styles.setSection}>
                  <SectionHeader title="Warm-ups" />
                  {exercise.warmups.map((set) => (
                    <Text
                      accessibilityLabel={`Warm-up ${set.ordinal + 1}. ${set.value}. ${set.status}.`}
                      key={set.id}
                      style={[
                        typeScale.body as TextStyle,
                        { color: colors.textSecondary },
                      ]}
                    >
                      W{set.ordinal + 1} · {set.value} · {set.status}
                    </Text>
                  ))}
                </View>
              )}
              <View style={styles.setSection}>
                <SectionHeader title="Working sets" />
                {exercise.workingSets.map((set) => (
                  <Text
                    accessibilityLabel={`Working set ${set.ordinal + 1}. ${set.value}. ${set.status}.`}
                    key={set.id}
                    style={[
                      typeScale.body as TextStyle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Set {set.ordinal + 1} · {set.value} · {set.status}
                  </Text>
                ))}
              </View>
              <SecondaryAction
                label={`View ${exercise.name} history`}
                onPress={() => onOpenExerciseHistory(exercise)}
              />
            </View>
          ))}
          {detail.nonLoadOutcomes.length === 0 ? null : (
            <View
              accessibilityLabel="Manual review outcomes"
              style={[
                styles.outcomes,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.divider,
                },
              ]}
            >
              <Text
                accessibilityRole="header"
                style={[
                  typeScale.sectionTitle as TextStyle,
                  { color: colors.textPrimary },
                ]}
              >
                Manual review
              </Text>
              {detail.nonLoadOutcomes.map((outcome) => {
                const exercise = sourceExercise(detail, outcome);
                return (
                  <View
                    key={`${outcome.source.sessionExerciseId}:${outcome.rule.id}:${outcome.rule.version}`}
                    style={styles.outcome}
                  >
                    <Text
                      style={[
                        typeScale.bodyStrong as TextStyle,
                        { color: colors.textPrimary },
                      ]}
                    >
                      {outcome.exerciseName}
                    </Text>
                    <Text
                      style={[
                        typeScale.body as TextStyle,
                        { color: colors.textSecondary },
                      ]}
                    >
                      This target has no automatic change.
                    </Text>
                    <Text
                      style={[
                        typeScale.secondary as TextStyle,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {`Rule · ${outcome.rule.id} v${outcome.rule.version}`}
                    </Text>
                    <Text
                      style={[
                        typeScale.secondary as TextStyle,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {`Current target · ${targetText(outcome.currentTarget)}`}
                    </Text>
                    <Text
                      style={[
                        typeScale.secondary as TextStyle,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {sourceEvidenceText(outcome)}
                    </Text>
                    <Text
                      style={[
                        typeScale.body as TextStyle,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {outcome.reason}
                    </Text>
                    <SecondaryAction
                      label={`View ${outcome.exerciseName} history`}
                      onPress={() => onOpenExerciseHistory(exercise)}
                    />
                  </View>
                );
              })}
            </View>
          )}
          <InlineNotice
            body={
              detail.recommendationStatus === "accepted"
                ? "Accepted"
                : detail.recommendationStatus === "kept_current"
                  ? "Kept current target"
                  : detail.recommendationStatus === "pending"
                    ? "Suggestion pending"
                    : "No recommendation"
            }
            heading="Recommendation"
            tone="neutral"
          />
          {onCorrectWorkout !== undefined
            && (detail.status === "completed" || detail.status === "partial") ? (
              <SecondaryAction
                label="Correct workout"
                onPress={onCorrectWorkout}
              />
            ) : null}
          {onRemoveFromHistory !== undefined && detail.status === "completed" ? (
            <SecondaryAction
              destructive
              label="Remove from history"
              onPress={() => {
                setRemoveFailed(false);
                setRemoveConfirmationVisible(true);
              }}
              ref={removeActionRef}
            />
          ) : null}
          {detail.resumable ? (
            <PrimaryAction label="Resume workout" onPress={onResume} />
          ) : null}
        </>
      }
      />
      <ConfirmationSheet
        body={removeFailed
          ? "Remove from history failed. The workout remains in ordinary history. Try again when ready."
          : "This hides the workout from ordinary Calendar, history, records, and recommendations. You can restore it later from Removed sessions."}
        cancelLabel="Cancel"
        confirmBusy={removing}
        confirmTestID="remove-from-history-confirm"
        confirmLabel="Remove from history"
        destructive
        heading="Remove from history?"
        onCancel={() => {
          setRemoveConfirmationVisible(false);
          setRemoveFailed(false);
        }}
        onConfirm={() => {
          if (onRemoveFromHistory === undefined || removing) {
            return;
          }
          setRemoving(true);
          setRemoveFailed(false);
          void Promise.resolve(onRemoveFromHistory()).then(() => {
            setRemoveConfirmationVisible(false);
          }).catch(() => {
            setRemoveFailed(true);
          }).finally(() => {
            setRemoving(false);
          });
        }}
        restoreFocusRef={removeActionRef}
        visible={removeConfirmationVisible}
      />
    </>
  );
}

const styles = StyleSheet.create({
  exercise: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[4],
    padding: space[4],
  },
  outcome: {
    gap: space[2],
  },
  outcomes: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[4],
    padding: space[4],
  },
  setSection: {
    gap: space[2],
  },
  summary: {
    gap: space[2],
  },
});

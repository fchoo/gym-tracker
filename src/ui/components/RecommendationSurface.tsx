import React from "react";
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
  ProgressRecommendationReview,
} from "../../domains/progress";
import type {
  SessionRecommendation,
} from "../../domains/workout";
import {
  formatLoadGrams,
} from "./SetRow";
import {
  FocusablePressable,
  PrimaryAction,
  SecondaryAction,
} from "./index";
import {
  radius,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

type RecommendationSurfaceRecommendation =
  | SessionRecommendation
  | ProgressRecommendationReview;

function isReview(
  recommendation: RecommendationSurfaceRecommendation,
): recommendation is ProgressRecommendationReview {
  return "metricIdentity" in recommendation;
}

function reps(values: readonly number[]): string {
  return values.length === 0 ? "current range" : values.join(" / ");
}

function targetText(target: MetricTarget): string {
  switch (target.profile) {
    case "load_reps":
      return `${formatLoadGrams(target.loadGrams)} kg × ${
        target.targetReps?.[0] ?? target.maxReps
      }${target.perSide ? " per side" : ""}`;
    case "bodyweight_reps":
      return `Bodyweight × ${target.maxReps}${target.perSide ? " per side" : ""}`;
    case "added_load_reps":
      return `BW + ${formatLoadGrams(target.addedLoadGrams)} kg × ${target.maxReps}${target.perSide ? " per side" : ""}`;
    case "assisted_reps":
      return `${formatLoadGrams(target.assistanceGrams)} kg assist × ${target.maxReps}${target.perSide ? " per side" : ""}`;
    case "timed_hold":
      return target.version === 1
        ? `${target.durationSeconds} sec${target.perSide ? " per side" : ""}`
        : `${target.durationMs / 1_000} sec${target.perSide ? " per side" : ""}`;
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

function legacyHeading(recommendation: SessionRecommendation): string {
  if (recommendation.decision === "increase") {
    return `Move to ${formatLoadGrams(recommendation.proposedLoadGrams)} kg next time`;
  }
  if (recommendation.decision === "manual") {
    return "Choose the next target manually";
  }
  return `Repeat ${formatLoadGrams(recommendation.proposedLoadGrams)} kg next time`;
}

function lifecycleLabel(
  lifecycle: ProgressRecommendationReview["lifecycle"],
): string {
  switch (lifecycle) {
    case "pending":
      return "Pending review";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Kept current target";
    case "invalidated":
    case "superseded":
      return "Recommendation no longer applies";
  }
}

function lifecycleSummary(
  lifecycle: ProgressRecommendationReview["lifecycle"],
): string {
  switch (lifecycle) {
    case "pending":
      return "Your current target remains unchanged until you choose a committed decision.";
    case "accepted":
      return "The proposed target was accepted. Progress is shown from saved facts.";
    case "rejected":
      return "The current target was kept. Progress is shown from saved facts.";
    case "invalidated":
    case "superseded":
      return "The current target was not changed by this recommendation.";
  }
}

function ReviewSurface({
  recommendation,
  busy,
  onAccept,
  onKeepCurrent,
  onOpenSource,
}: Readonly<{
  recommendation: ProgressRecommendationReview;
  busy: boolean;
  onAccept(): void;
  onKeepCurrent(): void;
  onOpenSource?(sessionId: string): void;
}>) {
  const { colors } = useAppTheme();
  const pending = recommendation.lifecycle === "pending";
  const noLongerApplies = recommendation.lifecycle === "invalidated"
    || recommendation.lifecycle === "superseded";
  const historical = !pending;

  return (
    <View
      accessibilityLabel={`Recommendation review for ${recommendation.exerciseName}`}
      style={[styles.surface, { backgroundColor: colors.surface, borderColor: colors.divider }]}
    >
      <Text style={[typeScale.label as TextStyle, { color: colors.action }]}>
        NEXT TARGET REVIEW
      </Text>
      <Text
        accessibilityRole="header"
        style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}
      >
        {`Review next target for ${recommendation.exerciseName}`}
      </Text>
      <Text style={[typeScale.bodyStrong as TextStyle, { color: noLongerApplies ? colors.timerAttention : colors.textPrimary }]}>
        {lifecycleLabel(recommendation.lifecycle)}
      </Text>
      <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
        {`${historical ? "Current target at review time" : "Current target"} · ${targetText(recommendation.currentTarget)}`}
      </Text>
      <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
        {`${historical ? "Proposed target at review time" : "Proposed target"} · ${targetText(recommendation.proposedTarget)}`}
      </Text>
      <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>
        {`Rule · ${recommendation.rule.id} v${recommendation.rule.version}`}
      </Text>
      <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>
        {`Confidence · ${recommendation.confidence}`}
      </Text>
      <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
        {recommendation.reason}
      </Text>
      <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>
        {lifecycleSummary(recommendation.lifecycle)}
      </Text>
      {recommendation.sourceSessionId === null || onOpenSource === undefined ? null : (
        <FocusablePressable
          accessibilityLabel={`Open source workout for ${recommendation.exerciseName}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: false }}
          focusable
          onPress={() => onOpenSource(recommendation.sourceSessionId!)}
          style={({ pressed }) => [
            styles.sourceAction,
            { borderColor: colors.divider, opacity: pressed ? 0.76 : 1 },
          ]}
        >
          <Text style={[typeScale.secondary as TextStyle, { color: colors.textPrimary }]}>
            Open source workout
          </Text>
        </FocusablePressable>
      )}
      {pending ? (
        <View style={styles.actions}>
          <PrimaryAction
            busy={busy}
            label={`Use proposed target for ${recommendation.exerciseName}`}
            onPress={onAccept}
          />
          <SecondaryAction
            disabled={busy}
            label={`Keep current target for ${recommendation.exerciseName}`}
            onPress={onKeepCurrent}
          />
        </View>
      ) : null}
    </View>
  );
}

function LegacySurface({
  recommendation,
  busy,
  onAccept,
  onKeepCurrent,
}: Readonly<{
  recommendation: SessionRecommendation;
  busy: boolean;
  onAccept(): void;
  onKeepCurrent(): void;
}>) {
  const { colors } = useAppTheme();
  const currentLoad = `${formatLoadGrams(recommendation.currentLoadGrams)} kg`;
  const proposedLoad = `${formatLoadGrams(recommendation.proposedLoadGrams)} kg`;

  return (
    <View
      accessibilityLabel={`Next target for ${recommendation.exerciseName}`}
      style={[styles.surface, { backgroundColor: colors.surface, borderColor: colors.divider }]}
    >
      <Text style={[typeScale.label as TextStyle, { color: colors.action }]}>NEXT TARGET</Text>
      <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>
        {legacyHeading(recommendation)}
      </Text>
      <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
        {recommendation.comparableReps.length === 0
          ? `No comparable working-set history yet. Repeat ${currentLoad} to establish a baseline.`
          : `You completed ${reps(recommendation.comparableReps)} at ${currentLoad}. ${recommendation.reason}.`}
      </Text>
      <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
        Increase only after every working set reaches 8 reps and effort is Easy or On target.
      </Text>
      <Text style={[typeScale.targetValue as TextStyle, { color: colors.textPrimary }]}>
        {proposedLoad} · aim for {reps(recommendation.proposedTargetReps)}
      </Text>
      {recommendation.status === "pending" ? (
        <View style={styles.actions}>
          <PrimaryAction busy={busy} label="Use this target next time" onPress={onAccept} />
          <SecondaryAction disabled={busy} label="Keep current target" onPress={onKeepCurrent} />
        </View>
      ) : (
        <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.completed }]}>
          {recommendation.status === "accepted"
            ? "Accepted"
            : recommendation.status === "rejected"
              ? "Kept current target"
              : "Suggestion no longer applies"}
        </Text>
      )}
    </View>
  );
}

export function RecommendationSurface({
  recommendation,
  busy = false,
  onAccept,
  onKeepCurrent,
  onOpenSource,
}: Readonly<{
  recommendation: RecommendationSurfaceRecommendation;
  busy?: boolean;
  onAccept: () => void;
  onKeepCurrent: () => void;
  onOpenSource?: (sessionId: string) => void;
}>) {
  return isReview(recommendation)
    ? (
        <ReviewSurface
          busy={busy}
          onAccept={onAccept}
          onKeepCurrent={onKeepCurrent}
          recommendation={recommendation}
          {...(onOpenSource === undefined ? {} : { onOpenSource })}
        />
      )
    : (
        <LegacySurface
          busy={busy}
          onAccept={onAccept}
          onKeepCurrent={onKeepCurrent}
          recommendation={recommendation}
        />
      );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: radius.emphasized,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[4],
    padding: space[4],
  },
  actions: {
    gap: space[2],
  },
  sourceAction: {
    alignSelf: "flex-start",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
});

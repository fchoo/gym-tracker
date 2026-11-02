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
  ActionRow,
  FocusablePressable,
  InlineNotice,
  PrimaryAction,
  SecondaryAction,
} from "./index";
import { BottomSheet } from "./BottomSheet";
import {
  radius,
  sizes,
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

export function recommendationTargetText(target: MetricTarget): string {
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

type ReviewDecision = "use" | "keep";
/**
 * Route owners may own command reconciliation and intentionally return void.
 * Only a returned promise is observed for the local busy/failure presentation.
 */
type DecisionCallback = () => unknown;

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return value !== null
    && typeof value === "object"
    && "then" in value
    && typeof (value as Readonly<{ then?: unknown }>).then === "function";
}

function ReviewSurface({
  recommendation,
  busy,
  onAccept,
  onKeepCurrent,
  onOpenSource,
  sourceActionRef,
}: Readonly<{
  recommendation: ProgressRecommendationReview;
  busy: boolean;
  onAccept: DecisionCallback;
  onKeepCurrent: DecisionCallback;
  onOpenSource?(sessionId: string): void;
  sourceActionRef?: React.Ref<View>;
}>) {
  const { colors } = useAppTheme();
  const reviewTriggerRef = React.useRef<View>(null);
  const submittingRef = React.useRef(false);
  const [sheetVisible, setSheetVisible] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [selectedDecision, setSelectedDecision] = React.useState<ReviewDecision | null>(null);
  const [decisionFailed, setDecisionFailed] = React.useState(false);
  const pending = recommendation.lifecycle === "pending";
  const noLongerApplies = recommendation.lifecycle === "invalidated"
    || recommendation.lifecycle === "superseded";
  const historical = !pending;
  const commandBusy = busy || submitting;

  const openReview = () => {
    setDecisionFailed(false);
    setSelectedDecision(null);
    setSheetVisible(true);
  };
  const dismissReview = () => {
    if (!commandBusy) {
      setSheetVisible(false);
    }
  };
  const submit = (decision: ReviewDecision, command: DecisionCallback) => {
    if (commandBusy || submittingRef.current) {
      return;
    }
    setDecisionFailed(false);
    setSelectedDecision(decision);
    let result: unknown;
    try {
      result = command();
    } catch {
      setDecisionFailed(true);
      return;
    }
    // Existing route owners may initiate a command and reconcile a fresh
    // projection separately. A void callback is never treated as a commit.
    if (!isPromiseLike(result)) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    void result.catch(() => {
      setDecisionFailed(true);
    }).finally(() => {
      submittingRef.current = false;
      setSubmitting(false);
    });
  };
  const selectedLabel = (decision: ReviewDecision, normal: string, saving: string) => (
    selectedDecision === decision && commandBusy ? saving : normal
  );

  if (pending) {
    return (
      <>
        <View
          accessibilityLabel={`Recommendation review for ${recommendation.exerciseName}`}
          style={[styles.surface, { backgroundColor: colors.surface, borderColor: colors.divider }]}
        >
          <Text style={[typeScale.label as TextStyle, { color: colors.action }]}>NEXT TARGET REVIEW</Text>
          <Text
            accessibilityRole="header"
            style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}
          >
            {recommendation.exerciseName}
          </Text>
          <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
            {`Current · ${recommendationTargetText(recommendation.currentTarget)}`}
          </Text>
          <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
            {`Proposed · ${recommendationTargetText(recommendation.proposedTarget)}`}
          </Text>
          <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>
            {recommendation.reason}
          </Text>
          <PrimaryAction
            label={`Review target for ${recommendation.exerciseName}`}
            onPress={openReview}
            ref={reviewTriggerRef}
          />
        </View>
        <BottomSheet
          cancelDisabled={commandBusy}
          cancelLabel="Close review target"
          heading="Review target"
          onCancel={dismissReview}
          restoreFocusRef={reviewTriggerRef}
          scrollTestID="recommendation-review-sheet-content"
          testID="recommendation-review-sheet"
          visible={sheetVisible}
        >
          <View
            accessibilityLabel={`Recommendation review for ${recommendation.exerciseName}`}
            style={styles.sheetContent}
          >
            <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>
              {`${recommendation.exerciseName} · personal completed history only`}
            </Text>
            <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
              {`Current target · ${recommendationTargetText(recommendation.currentTarget)}`}
            </Text>
            <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
              {`Proposed target · ${recommendationTargetText(recommendation.proposedTarget)}`}
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
            {recommendation.sourceSessionId === null || onOpenSource === undefined ? null : (
              <FocusablePressable
                accessibilityLabel={`Open source workout for ${recommendation.exerciseName}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: false }}
                focusable
                onPress={() => onOpenSource(recommendation.sourceSessionId!)}
                ref={sourceActionRef}
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
            <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>
              No automatic change without confirmation.
            </Text>
            {decisionFailed ? (
              <InlineNotice
                action={<SecondaryAction label="Retry target decision" onPress={() => {
                  if (selectedDecision === "use") submit("use", onAccept);
                  if (selectedDecision === "keep") submit("keep", onKeepCurrent);
                }} />}
                body="Your current target is unchanged. Review the evidence and try again."
                heading="Target decision was not saved"
                tone="error"
              />
            ) : null}
            <ActionRow>
              <SecondaryAction
                busy={selectedDecision === "keep" && commandBusy}
                disabled={commandBusy}
                label={selectedLabel("keep", "Keep target unchanged", "Saving keep target")}
                onPress={() => submit("keep", onKeepCurrent)}
              />
              <PrimaryAction
                busy={selectedDecision === "use" && commandBusy}
                disabled={commandBusy}
                label={selectedLabel("use", "Use target", "Saving use target")}
                onPress={() => submit("use", onAccept)}
              />
            </ActionRow>
          </View>
        </BottomSheet>
      </>
    );
  }

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
        {`${historical ? "Current target at review time" : "Current target"} · ${recommendationTargetText(recommendation.currentTarget)}`}
      </Text>
      <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
        {`${historical ? "Proposed target at review time" : "Proposed target"} · ${recommendationTargetText(recommendation.proposedTarget)}`}
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
        <ActionRow>
          <PrimaryAction busy={busy} label="Use this target next time" onPress={onAccept} />
          <SecondaryAction disabled={busy} label="Keep current target" onPress={onKeepCurrent} />
        </ActionRow>
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
  sourceActionRef,
}: Readonly<{
  recommendation: RecommendationSurfaceRecommendation;
  busy?: boolean;
  onAccept: DecisionCallback;
  onKeepCurrent: DecisionCallback;
  onOpenSource?: (sessionId: string) => void;
  sourceActionRef?: React.Ref<View>;
}>) {
  return isReview(recommendation)
    ? (
        <ReviewSurface
          busy={busy}
          onAccept={onAccept}
          onKeepCurrent={onKeepCurrent}
          recommendation={recommendation}
          {...(onOpenSource === undefined ? {} : { onOpenSource })}
          {...(sourceActionRef === undefined ? {} : { sourceActionRef })}
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
  sheetContent: {
    gap: space[4],
  },
  sourceAction: {
    alignSelf: "flex-start",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
});

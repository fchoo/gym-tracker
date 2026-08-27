import React, {
  useCallback,
  useEffect,
  useMemo,
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
  ExerciseReplacementCommandResult,
  ExerciseReplacementPreview,
  ReplacePlanExerciseInput,
} from "../../domains/plans/planImpactCommands";
import type {
  MetricTarget,
} from "../../domains/metrics";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  EmptyState,
  FocusablePressable,
  InlineNotice,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SectionHeader,
  SkeletonBlock,
} from "../components";
import {
  ImpactPreview,
} from "../components/ImpactPreview";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

type ReplacementScope = "this_occurrence" | "all_occurrences";
type ReviewKey =
  | "targets"
  | "warmups"
  | "rest"
  | "progression"
  | "historyImmutable";
type LoadState = "loading" | "ready" | "error";

export type ExerciseReplacementScreenProps = Readonly<{
  planId: string;
  occurrenceId: string;
  loadPreview(input: Readonly<{
    planId: string;
    occurrenceId: string;
  }>): Promise<ExerciseReplacementPreview>;
  replaceExercise(
    input: ReplacePlanExerciseInput,
  ): Promise<ExerciseReplacementCommandResult>;
  onBack(): void;
  onSaved(planId: string): void;
  createRequestId?(): string;
  width?: number;
}>;

const reviewLabels: readonly Readonly<{
  key: ReviewKey;
  label: string;
}>[] = [
  { key: "targets", label: "Targets reviewed" },
  { key: "warmups", label: "Warm-ups reviewed" },
  { key: "rest", label: "Rest reviewed" },
  { key: "progression", label: "Progression reviewed" },
  { key: "historyImmutable", label: "History remains unchanged" },
];

function targetSummary(target: MetricTarget): string {
  switch (target.profile) {
    case "load_reps":
      return `${target.loadGrams / 1_000} kg · ${target.minReps}–${target.maxReps} reps`;
    case "bodyweight_reps":
      return `${target.minReps}–${target.maxReps} reps`;
    case "added_load_reps":
      return `${target.addedLoadGrams / 1_000} kg added · ${target.minReps}–${target.maxReps} reps`;
    case "assisted_reps":
      return `${target.assistanceGrams / 1_000} kg assistance · ${target.minReps}–${target.maxReps} reps`;
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
      return "Completion";
  }
}

function occurrenceSummary(
  occurrence: ExerciseReplacementPreview["occurrences"][number],
): string {
  const warmupCount = occurrence.warmups.length;
  const warmups = `${warmupCount} ${warmupCount === 1 ? "warm-up" : "warm-ups"}`;
  const targets = occurrence.targets.map(({ target }) =>
    targetSummary(target)
  ).join(" · ");
  return `${warmups} · ${targets} · ${occurrence.restSeconds} sec rest`;
}

function policySummary(
  occurrence: ExerciseReplacementPreview["occurrences"][number],
): string {
  if (occurrence.policy.kind === "manual_hold") {
    return "Manual Hold";
  }
  return occurrence.policy.kind === "automatic"
    ? `Automatic · ${occurrence.policy.policyId}`
    : `Plan-authored · ${occurrence.policy.policyId}`;
}

function SelectionRow({
  checked,
  disabled = false,
  label,
  supportingText,
  role,
  onPress,
}: Readonly<{
  checked: boolean;
  disabled?: boolean;
  label: string;
  supportingText?: string;
  role: "checkbox" | "radio";
  onPress(): void;
}>) {
  const { colors } = useAppTheme();
  return (
    <FocusablePressable
      accessibilityLabel={label}
      accessibilityRole={role}
      accessibilityState={
        role === "checkbox"
          ? { checked, disabled }
          : { checked, disabled }
      }
      disabled={disabled}
      focusable={!disabled}
      onPress={onPress}
      style={[
        styles.selection,
        {
          backgroundColor: checked ? colors.surfaceSubtle : colors.surface,
          borderColor: checked ? colors.action : colors.divider,
          opacity: disabled ? 0.62 : 1,
        },
      ]}
    >
      <Text style={[
        typeScale.bodyStrong as TextStyle,
        { color: colors.textPrimary },
      ]}>
        {checked ? `Selected · ${label}` : label}
      </Text>
      {supportingText === undefined ? null : (
        <Text style={[
          typeScale.secondary as TextStyle,
          { color: colors.textSecondary },
        ]}>
          {supportingText}
        </Text>
      )}
    </FocusablePressable>
  );
}

export function ExerciseReplacementScreen({
  planId,
  occurrenceId,
  loadPreview,
  replaceExercise,
  onBack,
  onSaved,
  createRequestId,
  width,
}: ExerciseReplacementScreenProps) {
  const { colors } = useAppTheme();
  const requestRef = useRef<Readonly<{
    fingerprint: string;
    requestId: string;
  }> | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [preview, setPreview] = useState<ExerciseReplacementPreview | null>(
    null,
  );
  const [replacementExerciseId, setReplacementExerciseId] = useState<
    string | null
  >(null);
  const [scope, setScope] = useState<ReplacementScope>("this_occurrence");
  const [review, setReview] = useState<ReplacePlanExerciseInput["review"]>({
    targets: false,
    warmups: false,
    rest: false,
    progression: false,
    historyImmutable: false,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<"failed" | "stale" | null>(null);
  const adaptiveWidth = width === undefined ? {} : { width };

  useEffect(() => {
    let active = true;
    setState("loading");
    void loadPreview({ planId, occurrenceId }).then((loaded) => {
      if (!active) {
        return;
      }
      setPreview(loaded);
      setState("ready");
    }).catch(() => {
      if (active) {
        setState("error");
      }
    });
    return () => {
      active = false;
    };
  }, [loadPreview, occurrenceId, planId, retryGeneration]);

  const compatible = useMemo(
    () => preview?.candidates.filter(({ compatible: value }) => value) ?? [],
    [preview],
  );
  const incompatible = useMemo(
    () => preview?.candidates.filter(({ compatible: value }) => !value) ?? [],
    [preview],
  );
  const selectedOccurrences = useMemo(() => {
    if (preview === null) {
      return [];
    }
    return scope === "this_occurrence"
      ? preview.occurrences.filter(({ occurrenceId: id }) => id === occurrenceId)
      : preview.occurrences;
  }, [occurrenceId, preview, scope]);
  const affected = useMemo(() => {
    if (preview === null) {
      return [];
    }
    const replacementName = preview.candidates.find(({ exerciseId }) =>
      exerciseId === replacementExerciseId
    )?.name ?? "Choose a compatible replacement";
    return selectedOccurrences.map((occurrence) => ({
      id: occurrence.occurrenceId,
      label:
        `${occurrence.dayName} · occurrence ${occurrence.occurrenceOrdinal + 1}`,
      before: preview.sourceExerciseName,
      after: replacementName,
    }));
  }, [preview, replacementExerciseId, selectedOccurrences]);
  const reviewComplete = review.targets
    && review.warmups
    && review.rest
    && review.progression
    && review.historyImmutable;

  const save = useCallback(async () => {
    if (
      preview === null
      || replacementExerciseId === null
      || !reviewComplete
    ) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    const inputBase = {
      planId,
      sourceOccurrenceId: occurrenceId,
      expectedPlanRevision: preview.planRevision,
      previewToken: preview.previewToken,
      scope,
      replacementExerciseId,
      review,
      occurrences: selectedOccurrences,
    } as const;
    const fingerprint = JSON.stringify(inputBase);
    const requestId = requestRef.current?.fingerprint === fingerprint
      ? requestRef.current.requestId
      : createRequestId?.()
        ?? `plan-impact-replace:${planId}:${occurrenceId}:${preview.previewToken.slice(-12)}`;
    requestRef.current = { fingerprint, requestId };
    try {
      await replaceExercise({ requestId, ...inputBase });
      onSaved(planId);
    } catch (error) {
      const code = typeof error === "object"
          && error !== null
          && "code" in error
          && typeof error.code === "string"
        ? error.code
        : null;
      if (code === "plan_impact_preview_stale") {
        requestRef.current = null;
        setSaveError("stale");
        setRetryGeneration((value) => value + 1);
      } else {
        setSaveError("failed");
      }
    } finally {
      setSaving(false);
    }
  }, [
    createRequestId,
    occurrenceId,
    onSaved,
    planId,
    preview,
    replaceExercise,
    replacementExerciseId,
    review,
    reviewComplete,
    scope,
    selectedOccurrences,
  ]);

  if (state === "loading") {
    return (
      <AdaptiveScreen
        primary={(
          <View style={styles.screen} testID="exercise-replacement-loading">
            <SkeletonBlock height={48} width="55%" />
            <SkeletonBlock height={180} />
            <SkeletonBlock height={240} />
          </View>
        )}
        {...adaptiveWidth}
      />
    );
  }

  if (state === "error" || preview === null) {
    return (
      <AdaptiveScreen
        primary={(
          <EmptyState
            body="Your plan was not changed. Try again."
            heading="Replacement could not be loaded"
            primaryAction={(
              <PrimaryAction
                label="Retry"
                onPress={() => setRetryGeneration((value) => value + 1)}
              />
            )}
            secondaryAction={(
              <SecondaryAction label="Go back" onPress={onBack} />
            )}
          />
        )}
        {...adaptiveWidth}
      />
    );
  }

  if (compatible.length === 0) {
    return (
      <AdaptiveScreen
        primary={(
          <View style={styles.screen}>
            <ScreenHeader
              backAction={onBack}
              eyebrow={preview.planName}
              title="Review replacement"
            />
            <EmptyState
              body="No available exercise has the same complete metric identity. Your plan was not changed."
              heading="No compatible replacements"
              primaryAction={(
                <SecondaryAction label="Go back" onPress={onBack} />
              )}
            />
          </View>
        )}
        {...adaptiveWidth}
      />
    );
  }

  return (
    <AdaptiveScreen
      onRequestBack={onBack}
      primary={(
        <View style={styles.screen}>
          <ScreenHeader
            backAction={onBack}
            eyebrow={`${preview.planName} · ${preview.sourceExerciseName}`}
            title="Review replacement"
          />
          {preview.currentWorkoutUnaffected ? (
            <InlineNotice
              body="This workout uses an immutable snapshot. The replacement changes only future plan use."
              heading="Current workout is unaffected"
            />
          ) : null}
          <SectionHeader title="Scope" />
          <View accessibilityRole="radiogroup" style={styles.selectionGroup}>
            <SelectionRow
              checked={scope === "this_occurrence"}
              label="This occurrence"
              onPress={() => setScope("this_occurrence")}
              role="radio"
            />
            <SelectionRow
              checked={scope === "all_occurrences"}
              label="All occurrences in this plan"
              onPress={() => setScope("all_occurrences")}
              role="radio"
            />
          </View>
          <ImpactPreview
            affected={affected}
            countNoun="occurrence"
            emptyHeading="No affected occurrences"
            heading="Exercise impact"
            revisionLabel={`Plan revision ${preview.planRevision}`}
          />
          <SectionHeader
            supportingText="Same profile, contract version, and exercise metric generation"
            title="Compatible metric identity"
          />
          <View accessibilityRole="radiogroup" style={styles.selectionGroup}>
            {compatible.map((candidate) => (
              <SelectionRow
                checked={candidate.exerciseId === replacementExerciseId}
                key={candidate.exerciseId}
                label={`${candidate.name}. Compatible metric identity`}
                onPress={() => {
                  setReplacementExerciseId(candidate.exerciseId);
                  setSaveError(null);
                }}
                role="radio"
                supportingText={`${candidate.metricIdentity.profile} · contract ${candidate.metricIdentity.contractVersion} · generation ${candidate.metricIdentity.exerciseMetricGeneration}`}
              />
            ))}
          </View>
          {incompatible.length === 0 ? null : (
            <>
              <SectionHeader
                supportingText="Shown for transparency and unavailable for replacement"
                title="Other metric identities"
              />
              <View accessibilityRole="radiogroup" style={styles.selectionGroup}>
                {incompatible.map((candidate) => (
                  <SelectionRow
                    checked={false}
                    disabled
                    key={candidate.exerciseId}
                    label={`${candidate.name}. Incompatible metric identity`}
                    onPress={() => undefined}
                    role="radio"
                    supportingText={`${candidate.metricIdentity.profile} · contract ${candidate.metricIdentity.contractVersion} · generation ${candidate.metricIdentity.exerciseMetricGeneration}`}
                  />
                ))}
              </View>
            </>
          )}
          <SectionHeader title="Review current values" />
          {selectedOccurrences.map((occurrence) => (
            <View
              key={occurrence.occurrenceId}
              style={[styles.fact, { borderColor: colors.divider }]}
            >
              <Text style={[
                typeScale.bodyStrong as TextStyle,
                { color: colors.textPrimary },
              ]}>
                {`${occurrence.dayName} · occurrence ${occurrence.occurrenceOrdinal + 1}`}
              </Text>
              <Text style={[
                typeScale.body as TextStyle,
                { color: colors.textSecondary },
              ]}>
                {occurrenceSummary(occurrence)}
              </Text>
              <Text style={[
                typeScale.body as TextStyle,
                { color: colors.textPrimary },
              ]}>
                {policySummary(occurrence)}
              </Text>
            </View>
          ))}
          <InlineNotice
            body="Compatibility does not mean historical comparability. Existing sessions and snapshots are unchanged."
            heading="No history migration"
          />
          <View style={styles.selectionGroup}>
            {reviewLabels.map(({ key, label }) => (
              <SelectionRow
                checked={review[key]}
                key={key}
                label={label}
                onPress={() => {
                  setReview((current) => ({
                    ...current,
                    [key]: !current[key],
                  }));
                  setSaveError(null);
                }}
                role="checkbox"
              />
            ))}
          </View>
          {saveError === "stale" ? (
            <InlineNotice
              body="Impact changed. Review the current preview before trying again."
              heading="Preview refreshed"
              tone="attention"
            />
          ) : null}
          {saveError === "failed" ? (
            <InlineNotice
              body="Replacement could not be saved. Your review is still here. Try again."
              heading="Save replacement failed"
              tone="error"
            />
          ) : null}
          <PrimaryAction
            busy={saving}
            disabled={replacementExerciseId === null || !reviewComplete}
            label="Save replacement"
            onPress={() => {
              void save();
            }}
          />
        </View>
      )}
      {...adaptiveWidth}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: space[4],
  },
  selectionGroup: {
    gap: space[2],
  },
  selection: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[1],
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  fact: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space[1],
    paddingTop: space[4],
  },
});

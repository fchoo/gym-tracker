import React, {
  useCallback,
  useEffect,
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
  MetricIdentity,
} from "../../domains/metrics";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  ConfirmationSheet,
  ContentCard,
  EmptyState,
  IconAction,
  InlineNotice,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SectionHeader,
  SkeletonBlock,
} from "../components";
import {
  radius,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export type ExerciseDetailSnapshot = Readonly<{
  exerciseId: string;
  name: string;
  origin: "bundled" | "custom" | "copied";
  originLabel: "Built-in" | "Custom";
  exerciseType: string;
  movementClass: string;
  aliases: readonly string[];
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  equipment: readonly string[];
  metricIdentity: MetricIdentity;
  defaultRestSeconds: number;
  availability: "available" | "unavailable";
  favorite: boolean;
  hidden: boolean;
  archived: boolean;
  exerciseRevision: number;
  preferenceRevision: number | null;
  source: Readonly<{
    namespace: string;
    revision: string;
    license: string;
    attribution: string;
  }> | null;
  references: readonly ExerciseDetailPlanReference[];
}>;

export type ExerciseDetailPlanReference = Readonly<{
  planId: string;
  planName: string;
  dayId: string;
  dayName: string;
  occurrenceId: string;
  statusLabel: "Archived" | null;
  runnable: true;
}>;

export type ExerciseDetailArchivePreview = Readonly<{
  exerciseId: string;
  exerciseRevision: number;
  preferenceRevision: number | null;
  previewRevision: string;
  affectedPlans: readonly Readonly<{
    planId: string;
    planName: string;
    planRevision: number;
    occurrences: readonly Readonly<{
      occurrenceId: string;
      occurrenceRevision: number;
      dayId: string;
      dayName: string;
    }>[];
  }>[];
}>;

type ExerciseDetailScreenProps = Readonly<{
  exerciseId: string;
  loadExercise(exerciseId: string): Promise<ExerciseDetailSnapshot | null>;
  setFavorite(input: Readonly<{
    exercise: ExerciseDetailSnapshot;
    favorite: boolean;
  }>): Promise<ExerciseDetailSnapshot>;
  setHidden(input: Readonly<{
    exercise: ExerciseDetailSnapshot;
    hidden: boolean;
  }>): Promise<ExerciseDetailSnapshot>;
  previewArchive(
    exercise: ExerciseDetailSnapshot,
  ): Promise<ExerciseDetailArchivePreview>;
  setArchived(input: Readonly<{
    exercise: ExerciseDetailSnapshot;
    archived: boolean;
    preview: ExerciseDetailArchivePreview;
  }>): Promise<ExerciseDetailSnapshot>;
  onBack(): void;
  onCreateCustomCopy(exerciseId: string): void;
  onEdit(exerciseId: string): void;
  onChangeMetricProfile(exerciseId: string): void;
  onOpenHistory(exerciseId: string, exerciseName: string): void;
  onOpenPlan(reference: ExerciseDetailPlanReference): void;
  width?: number;
}>;

type LoadState = "loading" | "ready" | "empty" | "error";

function joined(values: readonly string[], fallback: string): string {
  return values.length === 0 ? fallback : values.join(", ");
}

function archivePreviewBody(
  snapshot: ExerciseDetailSnapshot,
  preview: ExerciseDetailArchivePreview,
): string {
  const affected = preview.affectedPlans.flatMap((plan) =>
    plan.occurrences.map((occurrence) =>
      `${plan.planName} · ${occurrence.dayName}`
    )
  );
  const list = affected.length === 0
    ? "No current plan occurrences are affected."
    : affected.join("\n");
  return [
    "This removes the exercise from new selection.",
    "Existing plans remain runnable and show Archived until you restore or replace it.",
    list,
    `${snapshot.name} and its history will not be deleted.`,
  ].join("\n\n");
}

function Fact({
  label,
  value,
  tone = "default",
}: Readonly<{
  label: string;
  value: string;
  tone?: "default" | "card";
}>) {
  const { colors } = useAppTheme();
  const primary = tone === "card" ? colors.contentCardText : colors.textPrimary;
  const secondary = tone === "card"
    ? colors.contentCardTextSecondary
    : colors.textSecondary;
  return (
    <View style={styles.fact}>
      <Text style={[
        typeScale.label as TextStyle,
        { color: secondary },
      ]}>
        {label}
      </Text>
      <Text style={[
        typeScale.body as TextStyle,
        { color: primary },
      ]}>
        {value}
      </Text>
    </View>
  );
}

export function ExerciseDetailScreen({
  exerciseId,
  loadExercise,
  setFavorite,
  setHidden,
  previewArchive,
  setArchived,
  onBack,
  onCreateCustomCopy,
  onEdit,
  onChangeMetricProfile,
  onOpenHistory,
  onOpenPlan,
  width,
}: ExerciseDetailScreenProps) {
  const { colors } = useAppTheme();
  const archiveActionRef = useRef<View>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [snapshot, setSnapshot] = useState<ExerciseDetailSnapshot | null>(
    null,
  );
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [archivePreview, setArchivePreview] =
    useState<ExerciseDetailArchivePreview | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const value = await loadExercise(exerciseId);
      setSnapshot(value);
      setState(value === null ? "empty" : "ready");
    } catch {
      setSnapshot(null);
      setState("error");
    }
  }, [exerciseId, loadExercise]);

  useEffect(() => {
    void load();
  }, [load, retryGeneration]);

  async function mutate(
    command: () => Promise<ExerciseDetailSnapshot>,
  ): Promise<void> {
    setBusy(true);
    setActionError(false);
    try {
      setSnapshot(await command());
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }

  async function openArchivePreview(): Promise<void> {
    if (snapshot === null) {
      return;
    }
    setBusy(true);
    setActionError(false);
    try {
      setArchivePreview(await previewArchive(snapshot));
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }

  async function restore(): Promise<void> {
    if (snapshot === null) {
      return;
    }
    setBusy(true);
    setActionError(false);
    try {
      const preview = await previewArchive(snapshot);
      setSnapshot(await setArchived({
        exercise: snapshot,
        archived: false,
        preview,
      }));
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return (
      <AdaptiveScreen
        onRequestBack={onBack}
        primary={(
          <View style={styles.screen}>
            <ScreenHeader backAction={onBack} title="Exercise" />
            {[1, 2, 3, 4].map((index) => (
              <SkeletonBlock
                height={index === 1 ? 72 : 96}
                key={index}
                testID={`exercise-detail-skeleton-${index}`}
              />
            ))}
          </View>
        )}
        testID="exercise-detail-screen"
        {...(width === undefined ? {} : { width })}
      />
    );
  }

  if (state === "empty") {
    return (
      <AdaptiveScreen
        onRequestBack={onBack}
        primary={(
          <View style={styles.screen}>
            <ScreenHeader backAction={onBack} title="Exercise" />
            <EmptyState
              body="This exercise is no longer available from this route."
              heading="Exercise not found"
              primaryAction={(
                <PrimaryAction label="Go back" onPress={onBack} />
              )}
            />
          </View>
        )}
        testID="exercise-detail-screen"
        {...(width === undefined ? {} : { width })}
      />
    );
  }

  if (state === "error" || snapshot === null) {
    return (
      <AdaptiveScreen
        onRequestBack={onBack}
        primary={(
          <View style={styles.screen}>
            <ScreenHeader backAction={onBack} title="Exercise" />
            <EmptyState
              body="Your exercise and plan references were not changed. Try again."
              heading="Exercise could not be loaded"
              primaryAction={(
                <PrimaryAction
                  label="Retry"
                  onPress={() => setRetryGeneration((value) => value + 1)}
                />
              )}
            />
          </View>
        )}
        testID="exercise-detail-screen"
        {...(width === undefined ? {} : { width })}
      />
    );
  }

  const isBuiltIn = snapshot.origin === "bundled";
  const archivedCount = snapshot.references.length;
  return (
    <>
      <AdaptiveScreen
        onRequestBack={onBack}
        primary={(
          <View style={styles.screen}>
            <ScreenHeader
              backAction={onBack}
              eyebrow={snapshot.originLabel}
              title={snapshot.name}
            />
            <View style={styles.labels}>
              <Text style={[
                typeScale.label as TextStyle,
                styles.label,
                {
                  borderColor: colors.divider,
                  color: colors.textPrimary,
                },
              ]}>
                {snapshot.originLabel}
              </Text>
              {snapshot.availability === "unavailable" ? (
                <Text style={[
                  typeScale.label as TextStyle,
                  styles.label,
                  {
                    borderColor: colors.timerAttention,
                    color: colors.timerAttention,
                  },
                ]}>
                  Unavailable
                </Text>
              ) : null}
              {snapshot.archived ? (
                <Text style={[
                  typeScale.label as TextStyle,
                  styles.label,
                  {
                    borderColor: colors.timerAttention,
                    color: colors.timerAttention,
                  },
                ]}>
                  Archived
                </Text>
              ) : null}
              {snapshot.hidden ? (
                <Text style={[
                  typeScale.label as TextStyle,
                  styles.label,
                  {
                    borderColor: colors.divider,
                    color: colors.textSecondary,
                  },
                ]}>
                  Hidden
                </Text>
              ) : null}
            </View>
            {snapshot.availability === "unavailable" ? (
              <InlineNotice
                body="This built-in exercise remains readable and runnable from existing references, but it cannot be added to a new plan."
                heading="Unavailable"
                tone="attention"
              />
            ) : null}
            <ContentCard testID="exercise-detail-facts-card">
              <SectionHeader title="Exercise facts" tone="card" />
              <View style={styles.factGrid}>
                <Fact label="Exercise type" tone="card" value={snapshot.exerciseType} />
                <Fact label="Movement" tone="card" value={snapshot.movementClass} />
              <Fact
                label="Primary muscles"
                tone="card"
                value={joined(snapshot.primaryMuscles, "Not specified")}
              />
              <Fact
                label="Secondary muscles"
                tone="card"
                value={joined(snapshot.secondaryMuscles, "Not specified")}
              />
              <Fact
                label="Equipment"
                tone="card"
                value={joined(snapshot.equipment, "Not specified")}
              />
              <Fact
                label="Aliases"
                tone="card"
                value={joined(snapshot.aliases, "None")}
              />
              <Fact
                label="Metric profile"
                tone="card"
                value={`${snapshot.metricIdentity.profile} · contract ${snapshot.metricIdentity.contractVersion} · generation ${snapshot.metricIdentity.exerciseMetricGeneration}`}
              />
              <Fact
                label="Default rest"
                tone="card"
                value={`${snapshot.defaultRestSeconds} sec`}
              />
              </View>
            </ContentCard>
            <ContentCard testID="exercise-detail-history-card">
              <SectionHeader
                supportingText="Best, Average, and Last stay separated by metric identity and comparable targets."
                title="History"
                tone="card"
              />
              <SecondaryAction
                label="View exercise history"
                onPress={() => onOpenHistory(snapshot.exerciseId, snapshot.name)}
              />
            </ContentCard>
            <ContentCard testID="exercise-detail-source-card">
              <SectionHeader title="Source" tone="card" />
            {snapshot.source === null ? (
              <InlineNotice
                body="This exercise is user-owned. It has no bundled source pack or upstream identity."
                card
                heading="Custom"
              />
            ) : (
              <View style={styles.factGrid}>
                <Fact label="Source pack" tone="card" value={snapshot.source.namespace} />
                <Fact label="Revision" tone="card" value={snapshot.source.revision} />
                <Fact label="License" tone="card" value={snapshot.source.license} />
                <Fact label="Attribution" tone="card" value={snapshot.source.attribution} />
              </View>
            )}
            </ContentCard>
            <ContentCard testID="exercise-detail-references-card">
              <SectionHeader
              supportingText={`${archivedCount} affected plan ${
                archivedCount === 1 ? "occurrence" : "occurrences"
              }`}
              title="Plan references"
              tone="card"
            />
            {snapshot.references.length === 0 ? (
              <Text style={[
                typeScale.body as TextStyle,
                  { color: colors.contentCardTextSecondary },
              ]}>
                No plan references
              </Text>
            ) : snapshot.references.map((reference) => (
              <SecondaryAction
                key={reference.occurrenceId}
                label={`Open ${reference.planName} ${reference.dayName}`}
                onPress={() => onOpenPlan(reference)}
              />
            ))}
            {snapshot.references.map((reference) => (
              <Text
                key={`${reference.occurrenceId}:label`}
                style={[
                  typeScale.body as TextStyle,
                  { color: colors.contentCardText },
                ]}
              >
                {`${reference.planName} · ${reference.dayName}${
                  reference.statusLabel === null
                    ? ""
                    : ` · ${reference.statusLabel}`
                }`}
              </Text>
            ))}
            </ContentCard>
            <SectionHeader title="Actions" />
            <View style={styles.actions}>
              <View style={styles.utilityActions}>
                <IconAction
                  accessibilityLabel={snapshot.favorite
                    ? "Remove from favorites"
                    : "Add to favorites"}
                  busy={busy}
                  icon="favorite"
                  onPress={() => {
                    void mutate(() => setFavorite({
                      exercise: snapshot,
                      favorite: !snapshot.favorite,
                    }));
                  }}
                  selected={snapshot.favorite}
                />
                <IconAction
                  accessibilityLabel={snapshot.hidden
                    ? "Show exercise"
                    : "Hide exercise"}
                  busy={busy}
                  icon={snapshot.hidden ? "show" : "hide"}
                  onPress={() => {
                    void mutate(() => setHidden({
                      exercise: snapshot,
                      hidden: !snapshot.hidden,
                    }));
                  }}
                  selected={snapshot.hidden}
                />
              </View>
              {isBuiltIn ? (
                <PrimaryAction
                  label="Create custom copy"
                  onPress={() => onCreateCustomCopy(snapshot.exerciseId)}
                />
              ) : (
                <>
                  <PrimaryAction
                    label="Edit exercise"
                    onPress={() => onEdit(snapshot.exerciseId)}
                  />
                  <SecondaryAction
                    label="Change metric profile"
                    onPress={() =>
                      onChangeMetricProfile(snapshot.exerciseId)}
                  />
                  {snapshot.archived ? (
                    <SecondaryAction
                      busy={busy}
                      label="Restore exercise"
                      onPress={() => {
                        void restore();
                      }}
                    />
                  ) : (
                    <SecondaryAction
                      busy={busy}
                      destructive
                      label="Archive exercise"
                      onPress={() => {
                        void openArchivePreview();
                      }}
                      ref={archiveActionRef}
                    />
                  )}
                </>
              )}
            </View>
            {actionError ? (
              <InlineNotice
                body="The exercise action could not be saved. Source facts and your current view are unchanged."
                heading="Action failed"
                tone="error"
              />
            ) : null}
          </View>
        )}
        testID="exercise-detail-screen"
        {...(width === undefined ? {} : { width })}
      />
      <ConfirmationSheet
        body={archivePreview === null
          ? ""
          : archivePreviewBody(snapshot, archivePreview)}
        cancelLabel="Keep exercise"
        confirmLabel="Archive exercise"
        destructive
        heading={`Archive ${snapshot.name}?`}
        onCancel={() => setArchivePreview(null)}
        onConfirm={() => {
          if (archivePreview === null) {
            return;
          }
          const preview = archivePreview;
          setArchivePreview(null);
          void mutate(() => setArchived({
            exercise: snapshot,
            archived: true,
            preview,
          }));
        }}
        restoreFocusRef={archiveActionRef}
        visible={archivePreview !== null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: space[4],
    maxWidth: 960,
    width: "100%",
  },
  labels: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  label: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
  factGrid: {
    gap: space[2],
  },
  fact: {
    gap: space[1],
    minWidth: 0,
  },
  actions: {
    gap: space[2],
  },
  utilityActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
});

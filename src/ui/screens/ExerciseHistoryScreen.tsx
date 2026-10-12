import React, {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import {
  projectLoadMetricHistorySeries,
  type EffectiveMetricHistorySet,
  type ExerciseMetricHistory,
} from "../../domains/history";
import {
  formatMetricDuration,
  roundMetricAggregateForPresentation,
  type MetricAggregate,
  type MetricObservation,
} from "../../domains/metrics";
import {
  formatObservation,
} from "../components/SetRow";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  ContentCard,
  EmptyState,
  FocusablePressable,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SectionHeader,
  SkeletonBlock,
} from "../components";
import {
  FactualHistoryChart,
  type ProgressFactualSeries,
} from "../components/FactualHistoryChart";
import {
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export type ExerciseHistoryScreenProps = Readonly<{
  exerciseId: string;
  exerciseName: string;
  loadExerciseHistory(exerciseId: string): Promise<ExerciseMetricHistory>;
  onBack(): void;
  onOpenSource?(sessionId: string, sourceRevision: number): void;
  width?: number;
}>;

type LoadState = "loading" | "ready" | "error";

function identityText(
  identity: ExerciseMetricHistory["segments"][number]["identity"],
): string {
  return `${identity.profile} · contract ${identity.contractVersion} · generation ${identity.exerciseMetricGeneration}`;
}

function aggregateText(aggregate: MetricAggregate | null): string {
  if (aggregate === null) {
    return "Not applicable";
  }
  const rounded = roundMetricAggregateForPresentation(aggregate, {
    loadFractionDigits: 2,
    assistanceFractionDigits: 2,
    distanceFractionDigits: 1,
  });
  switch (rounded.profile) {
    case "load_reps":
      return `${rounded.meanLoadGrams / 1_000} kg × ${rounded.meanReps}`;
    case "bodyweight_reps":
      return `Bodyweight × ${rounded.meanReps}`;
    case "added_load_reps":
      return `BW + ${rounded.meanAddedLoadGrams / 1_000} kg × ${rounded.meanReps}`;
    case "assisted_reps":
      return `${rounded.meanAssistanceGrams / 1_000} kg assist × ${rounded.meanReps}`;
    case "timed_hold":
      return rounded.version === 1
        ? `${rounded.meanDurationSeconds} sec`
        : formatMetricDuration(rounded.meanDurationMs);
    case "fixed_distance":
      return formatMetricDuration(rounded.meanDurationMs);
    case "fixed_time":
      return `${rounded.meanDistanceMeters} m`;
    case "intervals":
      return `${rounded.meanCompletedRounds} rounds · ${formatMetricDuration(rounded.meanCompletedWorkMs)} work`;
    case "unscored":
      return rounded.completionRate === 1
        ? "Completed"
        : `${Math.round(rounded.completionRate * 100)}% completed`;
  }
}

function observationText(observation: MetricObservation | null): string {
  return observation === null ? "Not recorded" : formatObservation(observation);
}

function longDate(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return localDate;
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function visitText(set: EffectiveMetricHistorySet, kind: "Warm-up" | "Working"): string {
  return `${kind} visit · ${longDate(set.localDate)} · ${kind === "Warm-up" ? "W" : "Set "}${set.setOrdinal + 1}`;
}

function MetricSummary({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.summary}>
      <Text style={[typeScale.label as TextStyle, {
        color: colors.contentCardTextSecondary,
      }]}>
        {label}
      </Text>
      <Text style={[typeScale.bodyStrong as TextStyle, {
        color: colors.contentCardText,
      }]}>
        {value}
      </Text>
    </View>
  );
}

function formatRelative(value: number | null): string {
  return value === null || !Number.isFinite(value) || value <= 0
    ? "—"
    : `${Number(value.toFixed(3))}× bodyweight`;
}

function LoadHistory({
  exerciseName,
  onOpenSource,
  segment,
}: Readonly<{
  exerciseName: string;
  onOpenSource?: ExerciseHistoryScreenProps["onOpenSource"];
  segment: ExerciseMetricHistory["segments"][number];
}>) {
  const { colors } = useAppTheme();
  const load = projectLoadMetricHistorySeries(segment, "load");
  const [view, setView] = useState<"load" | "relative">("load");
  if (load === null) return null;
  const selected = view === "relative"
    ? projectLoadMetricHistorySeries(segment, "relative") ?? load
    : load;
  const series: ProgressFactualSeries = Object.freeze({
    distanceMeters: 0,
    fasterIsLower: false,
    metricLabel: `${exerciseName} ${view === "relative" ? "relative strength" : "load"}`,
    directionLabel: "Higher comparable load is better.",
    rangeLabel: "All time",
    unitLabel: view === "relative" ? "bodyweight ratio" : "kg",
    currentTargetSeconds: selected.currentTarget,
    points: Object.freeze(selected.points.map((point) => Object.freeze({
      activityId: null,
      workoutSessionId: point.sessionId,
      evidence: point.sourceRevision === null ? null : "workout_session" as const,
      localDate: point.localDate,
      sourceRevision: point.sourceRevision,
      status: point.sourceRevision === null ? "unavailable" as const : "accepted_current" as const,
      statusLabel: point.statusLabel,
      targetAtDateSeconds: point.targetAtDate,
      timeBasis: "elapsed" as const,
      valueSeconds: point.value,
      basisLabel: view === "relative" ? point.basisDisclosure : null,
    }))),
  });
  return <View style={styles.loadHistory}>
    <View accessibilityLabel="History view" style={styles.historyViewControls}>
      <FocusablePressable
        accessibilityLabel="Load"
        accessibilityRole="button"
        accessibilityState={{ selected: view === "load" }}
        onPress={() => setView("load")}
        style={[styles.historyViewControl, { borderColor: colors.focusRing }]}
      >
        <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.focusRing }]}>Load</Text>
      </FocusablePressable>
      {load.relativeAvailable ? <FocusablePressable
        accessibilityLabel="Relative"
        accessibilityRole="button"
        accessibilityState={{ selected: view === "relative" }}
        onPress={() => setView("relative")}
        style={[styles.historyViewControl, { borderColor: colors.focusRing }]}
      >
        <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.focusRing }]}>Relative</Text>
      </FocusablePressable> : null}
    </View>
    <FactualHistoryChart
      formatValue={view === "relative"
        ? formatRelative
        : (value) => value === null ? "—" : `${Number(value.toFixed(3))} kg`}
      {...(onOpenSource === undefined ? {} : {
        onOpenSource: (source: Parameters<NonNullable<React.ComponentProps<typeof FactualHistoryChart>["onOpenSource"]>>[0]) => {
          if ("sessionId" in source) onOpenSource(source.sessionId, source.sourceRevision);
        },
      })}
      series={series}
    />
    {view === "relative" ? <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Bodyweight-relative strength is a view only and never changes targets.</Text> : null}
  </View>;
}

export function ExerciseHistoryScreen({
  exerciseId,
  exerciseName,
  loadExerciseHistory,
  onBack,
  onOpenSource,
  width,
}: ExerciseHistoryScreenProps) {
  const { colors } = useAppTheme();
  const [state, setState] = useState<LoadState>("loading");
  const [history, setHistory] = useState<ExerciseMetricHistory | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [warmupsVisible, setWarmupsVisible] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      setHistory(await loadExerciseHistory(exerciseId));
      setState("ready");
    } catch {
      setHistory(null);
      setState("error");
    }
  }, [exerciseId, loadExerciseHistory]);

  useEffect(() => {
    void load();
  }, [load, retryGeneration]);

  const adaptiveWidth = width === undefined ? {} : { width };
  if (state === "loading") {
    return (
      <AdaptiveScreen
        {...adaptiveWidth}
        onRequestBack={onBack}
        primary={(
          <View style={styles.screen}>
            <ScreenHeader backAction={onBack} title="Exercise history" />
            <SkeletonBlock height={56} testID="exercise-history-skeleton-title" />
            <SkeletonBlock height={184} testID="exercise-history-skeleton-summary" />
          </View>
        )}
        testID="exercise-history-screen"
      />
    );
  }

  if (state === "error" || history === null) {
    return (
      <AdaptiveScreen
        {...adaptiveWidth}
        onRequestBack={onBack}
        primary={(
          <View style={styles.screen}>
            <ScreenHeader backAction={onBack} title="Exercise history" />
            <EmptyState
              body="Your saved workouts were not changed. Retry loading history."
              heading="Exercise history could not be loaded"
              primaryAction={(
                <PrimaryAction
                  label="Retry exercise history"
                  onPress={() => setRetryGeneration((value) => value + 1)}
                />
              )}
            />
          </View>
        )}
        testID="exercise-history-screen"
      />
    );
  }

  if (history.segments.length === 0) {
    return (
      <AdaptiveScreen
        {...adaptiveWidth}
        onRequestBack={onBack}
        primary={(
          <View style={styles.screen}>
            <ScreenHeader backAction={onBack} title="Exercise history" />
            <Text style={[typeScale.sectionTitle as TextStyle, {
              color: colors.textPrimary,
            }]}>
              {exerciseName}
            </Text>
            <EmptyState
              body="Complete every planned working set for this exercise to establish a comparable history."
              heading="No comparable working sets yet"
              primaryAction={(<PrimaryAction label="Go back" onPress={onBack} />)}
            />
          </View>
        )}
        testID="exercise-history-screen"
      />
    );
  }

  const warmupLabel = `${warmupsVisible ? "Hide" : "Show"} ${history.warmupVisits.length} warm-up ${history.warmupVisits.length === 1 ? "visit" : "visits"}`;
  const resolvedExerciseName = history.exerciseName ?? exerciseName;
  return (
    <AdaptiveScreen
      {...adaptiveWidth}
      onRequestBack={onBack}
      primary={(
        <View style={styles.screen}>
          <ScreenHeader backAction={onBack} title="Exercise history" />
          <View style={styles.introduction}>
            <Text style={[typeScale.sectionTitle as TextStyle, {
              color: colors.textPrimary,
            }]}>
              {resolvedExerciseName}
            </Text>
            <Text style={[typeScale.body as TextStyle, {
              color: colors.textSecondary,
            }]}>
              Working sets only
            </Text>
          </View>
          {history.segments.map((segment, index) => (
            <ContentCard
              key={`${segment.identity.profile}:${segment.identity.contractVersion}:${segment.identity.exerciseMetricGeneration}:${index}`}
              testID={`exercise-history-segment-${index}`}
            >
              <SectionHeader
                supportingText={identityText(segment.identity)}
                title="Comparable working sets"
                tone="card"
              />
              <View style={styles.summaries}>
                <MetricSummary
                  label="Best"
                  value={observationText(segment.best?.observation ?? null)}
                />
                <MetricSummary label="Average" value={aggregateText(segment.average)} />
                <MetricSummary
                  label="Last"
                  value={observationText(segment.last?.observation ?? null)}
                />
              </View>
              <LoadHistory
                exerciseName={resolvedExerciseName}
                onOpenSource={onOpenSource}
                segment={segment}
              />
              <View style={styles.visitList}>
                {segment.comparableSets.map((set) => (
                  <Text
                    key={set.setId}
                    style={[typeScale.secondary as TextStyle, {
                      color: colors.contentCardTextSecondary,
                    }]}
                  >
                    {visitText(set, "Working")} · {observationText(set.observation)}
                  </Text>
                ))}
              </View>
            </ContentCard>
          ))}
          {history.warmupVisits.length === 0 ? null : (
            <View style={styles.warmups}>
              <SecondaryAction
                label={warmupLabel}
                onPress={() => setWarmupsVisible((visible) => !visible)}
              />
              {warmupsVisible ? (
                <View style={styles.warmupList}>
                  {history.warmupVisits.map((set) => (
                    <View key={set.setId} style={styles.warmupVisit}>
                      <Text style={[typeScale.body as TextStyle, {
                        color: colors.textSecondary,
                      }]}>
                        {visitText(set, "Warm-up")}
                      </Text>
                      <Text style={[typeScale.body as TextStyle, {
                        color: colors.textSecondary,
                      }]}>
                        {observationText(set.observation)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          )}
        </View>
      )}
      testID="exercise-history-screen"
    />
  );
}

const styles = StyleSheet.create({
  historyViewControl: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: space[2],
  },
  historyViewControls: {
    flexDirection: "row",
    gap: space[2],
  },
  introduction: {
    gap: space[1],
  },
  loadHistory: {
    gap: space[2],
  },
  screen: {
    gap: space[4],
    maxWidth: 960,
    width: "100%",
  },
  summaries: {
    gap: space[2],
  },
  summary: {
    gap: space[1],
  },
  visitList: {
    gap: space[1],
  },
  warmupList: {
    gap: space[1],
  },
  warmupVisit: {
    gap: space[1],
  },
  warmups: {
    gap: space[2],
  },
});

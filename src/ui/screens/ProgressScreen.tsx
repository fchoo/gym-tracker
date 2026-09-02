import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type {
  ProgressPeriod,
  ProgressPeriodProjection,
  ProgressProjectionDiagnostic,
  ProgressProjectionFreshness,
  ProgressRecommendationReview,
  ProgressRecord,
  ProgressSourceReference,
} from "../../domains/progress";
import {
  parseMetricIdentity,
  parseMetricObservationJson,
} from "../../domains/metrics";
import {
  ContentCard,
  EmptyState,
  FocusablePressable,
  InlineNotice,
  M3SearchField,
  PrimaryAction,
  ScreenHeader,
  SectionHeader,
  SkeletonBlock,
} from "../components";
import {
  RecommendationSurface,
} from "../components/RecommendationSurface";
import {
  ProgressTrend,
} from "../components/ProgressTrend";
import {
  formatObservation,
} from "../components/SetRow";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  radius,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

type ProgressSnapshot = Readonly<{
  period: ProgressPeriod;
  freshness: ProgressProjectionFreshness;
  projection: ProgressPeriodProjection | null;
  diagnostic?: ProgressProjectionDiagnostic;
}>;

export type ProgressScreenProps = Readonly<{
  nowLocalDate: string;
  workoutRefreshGeneration?: number;
  loadProgress(input: Readonly<{
    period: ProgressPeriod;
    nowLocalDate: string;
  }>): Promise<ProgressSnapshot>;
  onOpenExercise(exerciseId: string, exerciseName: string): void;
  onOpenSession(sessionId: string): void;
  onAcceptRecommendation?(recommendationId: string): Promise<unknown>;
  onKeepCurrentTarget?(recommendationId: string): Promise<unknown>;
  width?: number;
}>;

const PERIODS: readonly Readonly<{
  value: ProgressPeriod;
  label: string;
}>[] = [
  { value: "4_weeks", label: "4 weeks" },
  { value: "12_weeks", label: "12 weeks" },
  { value: "all_time", label: "All time" },
];

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

function observationText(record: ProgressRecord): string {
  try {
    const [profile, contractVersion, exerciseMetricGeneration] = record.identityKey.split(":");
    const identity = parseMetricIdentity({
      profile,
      contractVersion: Number(contractVersion),
      exerciseMetricGeneration: Number(exerciseMetricGeneration),
    });
    return formatObservation(parseMetricObservationJson(identity, record.observationJson));
  } catch {
    return "Recorded result";
  }
}

function hasFactualEvidence(projection: ProgressPeriodProjection): boolean {
  return projection.trend.length > 0
    || projection.exercises.length > 0
    || projection.records.length > 0
    || projection.recommendations.length > 0
    || projection.summary.scheduledOpportunities.planned > 0
    || projection.summary.workingSets.planned > 0;
}

function stateText(state: ProgressPeriodProjection["state"]): string | null {
  if (state === "baseline") {
    return "Baseline";
  }
  if (state === "hold") {
    return "Hold";
  }
  return null;
}

function SourceActions({
  label,
  source,
  onOpenExercise,
  onOpenSession,
}: Readonly<{
  label: string;
  source: ProgressSourceReference;
  onOpenExercise(exerciseId: string, exerciseName: string): void;
  onOpenSession(sessionId: string): void;
}>) {
  const { colors } = useAppTheme();
  if (source.sessionIds.length === 0 && source.exercises.length === 0) {
    return (
      <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
        {"No source workout or exercise is available for " + label + "."}
      </Text>
    );
  }
  return (
    <View style={styles.sourceActions}>
      {source.sessionIds.map((sessionId) => (
        <FocusablePressable
          accessibilityLabel={"Open source workout for " + label}
          accessibilityRole="button"
          focusable
          key={sessionId}
          onPress={() => onOpenSession(sessionId)}
          style={({ pressed }: { pressed: boolean }) => [
            styles.textAction,
            { borderColor: colors.contentCardBorder, opacity: pressed ? 0.76 : 1 },
          ]}
        >
          <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardText }]}>
            {"Workout source " + sessionId}
          </Text>
        </FocusablePressable>
      ))}
      {source.exercises.map(({ exerciseId, exerciseName }) => (
        <FocusablePressable
          accessibilityLabel={"Open " + exerciseName + " exercise history for " + label}
          accessibilityRole="button"
          focusable
          key={exerciseId}
          onPress={() => onOpenExercise(exerciseId, exerciseName)}
          style={({ pressed }: { pressed: boolean }) => [
            styles.textAction,
            { borderColor: colors.contentCardBorder, opacity: pressed ? 0.76 : 1 },
          ]}
        >
          <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardText }]}>
            {"Exercise source " + exerciseName}
          </Text>
        </FocusablePressable>
      ))}
    </View>
  );
}

function rebuildDiagnosticText(
  diagnostic: ProgressProjectionDiagnostic | undefined,
): string | null {
  if (diagnostic === undefined) {
    return null;
  }
  const affected = diagnostic.affectedSubjects;
  const scope = affected.length === 0
    ? "saved progress history"
    : affected.length === 2
      ? "overall and exercise progress history"
      : affected[0] === "all_period"
        ? "overall progress history"
        : "exercise progress history";
  return diagnostic.code === "history_projection_unavailable"
    ? `${scope.slice(0, 1).toUpperCase() + scope.slice(1)} is temporarily unavailable. Reload to try again.`
    : `Rebuilding ${scope}. Results refresh automatically.`;
}

function PeriodControls({
  selected,
  onChange,
}: Readonly<{
  selected: ProgressPeriod;
  onChange(period: ProgressPeriod): void;
}>) {
  const { colors } = useAppTheme();
  return (
    <View accessibilityLabel="Progress period" style={styles.periodControls}>
      {PERIODS.map((period) => {
        const isSelected = selected === period.value;
        return (
          <FocusablePressable
            accessibilityLabel={period.label}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            focusable
            key={period.value}
            onPress={() => onChange(period.value)}
            style={({ pressed }: { pressed: boolean }) => [
              styles.periodControl,
              {
                backgroundColor: isSelected
                  ? colors.action
                  : pressed ? colors.surfaceSubtle : colors.surface,
                borderColor: isSelected ? colors.action : colors.divider,
              },
            ]}
          >
            <Text style={[typeScale.bodyStrong as TextStyle, {
              color: isSelected ? colors.onAction : colors.textPrimary,
            }]}>
              {period.label}
            </Text>
          </FocusablePressable>
        );
      })}
    </View>
  );
}

function OverallProgress({
  projection,
  onOpenExercise,
  onOpenSession,
}: Readonly<{
  projection: ProgressPeriodProjection;
  onOpenExercise(exerciseId: string, exerciseName: string): void;
  onOpenSession(sessionId: string): void;
}>) {
  const { colors } = useAppTheme();
  const improvingRecords = projection.records.filter((record) =>
    projection.exercises.some((exercise) =>
      exercise.exerciseId === record.exerciseId && exercise.status === "improving"
    )
  );
  const state = stateText(projection.state);

  return (
    <View style={styles.section}>
      <SectionHeader
        supportingText={longDate(projection.window.start) + " to " + longDate(projection.window.end)}
        title="Overall Progress"
      />
      <ContentCard testID="progress-overall-card">
        <View style={styles.summaryRows}>
          <View style={styles.summaryRow}>
            <Text style={[typeScale.body as TextStyle, { color: colors.contentCardText }]}>
              {"Scheduled opportunities · " + projection.summary.scheduledOpportunities.completed + " of " + projection.summary.scheduledOpportunities.planned + " completed"}
            </Text>
            <SourceActions
              label="Scheduled opportunities"
              onOpenExercise={onOpenExercise}
              onOpenSession={onOpenSession}
              source={projection.summary.sourceReferences.scheduledOpportunities}
            />
          </View>
          <View style={styles.summaryRow}>
            <Text style={[typeScale.body as TextStyle, { color: colors.contentCardText }]}>
              {"Working sets · " + projection.summary.workingSets.completed + " of " + projection.summary.workingSets.planned + " completed"}
            </Text>
            <SourceActions
              label="Working sets"
              onOpenExercise={onOpenExercise}
              onOpenSession={onOpenSession}
              source={projection.summary.sourceReferences.workingSets}
            />
          </View>
          <View style={styles.summaryRow}>
            <Text style={[typeScale.body as TextStyle, { color: colors.contentCardText }]}>
              {projection.summary.improvingCount + " improving · " + projection.summary.holdingCount + " holding · " + projection.summary.baselineCount + " baseline"}
            </Text>
            <SourceActions
              label="Progress status"
              onOpenExercise={onOpenExercise}
              onOpenSession={onOpenSession}
              source={projection.summary.sourceReferences.exerciseStatuses}
            />
          </View>
          {projection.summary.attentionCount === 0 ? null : (
            <View style={styles.summaryRow}>
              <Text style={[typeScale.body as TextStyle, { color: colors.contentCardText }]}>
                {projection.summary.attentionCount + " review " + (projection.summary.attentionCount === 1 ? "available" : "items available")}
              </Text>
              <SourceActions
                label="Review available"
                onOpenExercise={onOpenExercise}
                onOpenSession={onOpenSession}
                source={projection.summary.sourceReferences.attention}
              />
            </View>
          )}
        </View>
        {state === null ? null : (
          <View style={styles.summaryRow}>
            <InlineNotice
              body={state === "Baseline"
                ? "More comparable working sets are needed before a change is shown."
                : "Comparable evidence is unchanged for this period."}
              card
              heading={state}
              tone="neutral"
            />
            <SourceActions
              label={state}
              onOpenExercise={onOpenExercise}
              onOpenSession={onOpenSession}
              source={projection.stateSourceReferences}
            />
          </View>
        )}
        {improvingRecords.length === 0 ? null : (
          <View style={styles.records}>
            <Text accessibilityRole="header" style={[typeScale.label as TextStyle, { color: colors.contentCardText }]}>Recent improvements</Text>
            {improvingRecords.map((record) => (
              <FocusablePressable
                accessibilityLabel={"Open workout details for record on " + longDate(record.localDate)}
                accessibilityRole="button"
                focusable
                key={record.exerciseId + ":" + record.setId}
                onPress={() => onOpenSession(record.sessionId)}
                style={({ pressed }: { pressed: boolean }) => [
                  styles.recordRow,
                  { borderColor: colors.contentCardBorder, opacity: pressed ? 0.76 : 1 },
                ]}
              >
                <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>
                  {record.exerciseName + " · " + observationText(record)}
                </Text>
                <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
                  {"Record · " + longDate(record.localDate) + " · " + record.identityKey}
                </Text>
              </FocusablePressable>
            ))}
          </View>
        )}
      </ContentCard>
    </View>
  );
}

function NeedsAttention({
  projection,
  onOpenExercise,
  onOpenSession,
  onAcceptRecommendation,
  onKeepCurrentTarget,
  onRecommendationDecisionComplete,
  onRecommendationDecisionNotice,
}: Readonly<{
  projection: ProgressPeriodProjection;
  onOpenExercise(exerciseId: string, exerciseName: string): void;
  onOpenSession(sessionId: string): void;
  onAcceptRecommendation?(recommendationId: string): Promise<unknown>;
  onKeepCurrentTarget?(recommendationId: string): Promise<unknown>;
  onRecommendationDecisionComplete(): void;
  onRecommendationDecisionNotice(
    notice: "superseded" | "failed",
  ): void;
}>) {
  const { colors } = useAppTheme();
  const [busyRecommendationId, setBusyRecommendationId] = useState<string | null>(null);
  const recommendations = projection.recommendations.filter(
    ({ lifecycle }) => lifecycle === "pending",
  );
  if (recommendations.length === 0) {
    return null;
  }
  const decide = async (
    recommendation: ProgressRecommendationReview,
    decision: "accept" | "keep",
  ) => {
    const command = decision === "accept"
      ? onAcceptRecommendation
      : onKeepCurrentTarget;
    if (command === undefined || busyRecommendationId !== null) {
      return;
    }
    setBusyRecommendationId(recommendation.id);
    try {
      const result = await command(recommendation.id);
      if (
        result !== null
        && typeof result === "object"
        && "status" in result
        && result.status === "superseded"
      ) {
        onRecommendationDecisionNotice("superseded");
      }
    } catch {
      onRecommendationDecisionNotice("failed");
    } finally {
      setBusyRecommendationId(null);
      onRecommendationDecisionComplete();
    }
  };
  return (
    <View style={styles.section}>
      <SectionHeader
        supportingText="A review is available for this target."
        title="Needs attention"
      />
      <ContentCard>
        <View style={styles.attentionRows}>
          {recommendations.map((recommendation) => (
            <View key={recommendation.id} style={styles.recommendationReview}>
              <RecommendationSurface
                busy={busyRecommendationId === recommendation.id}
                onAccept={() => { void decide(recommendation, "accept"); }}
                onKeepCurrent={() => { void decide(recommendation, "keep"); }}
                recommendation={recommendation}
                {...(recommendation.sourceSessionId === null
                  ? {}
                  : { onOpenSource: onOpenSession })}
              />
              <FocusablePressable
                accessibilityLabel={"Open exercise history for " + recommendation.exerciseName}
                accessibilityRole="button"
                focusable
                onPress={() => onOpenExercise(
                  recommendation.exerciseId,
                  recommendation.exerciseName,
                )}
                style={({ pressed }: { pressed: boolean }) => [
                  styles.textAction,
                  { borderColor: colors.contentCardBorder, opacity: pressed ? 0.76 : 1 },
                ]}
              >
                <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardText }]}>
                  Exercise history
                </Text>
              </FocusablePressable>
            </View>
          ))}
        </View>
      </ContentCard>
    </View>
  );
}

function ReviewHistory({
  projection,
  onOpenSession,
}: Readonly<{
  projection: ProgressPeriodProjection;
  onOpenSession(sessionId: string): void;
}>) {
  const reviews = projection.recommendations.filter(
    ({ lifecycle }) => lifecycle !== "pending",
  );
  if (reviews.length === 0) {
    return null;
  }
  return (
    <View style={styles.section}>
      <SectionHeader
        supportingText="Saved target review history. These records do not change your target."
        title="Target review history"
      />
      <ContentCard>
        <View style={styles.attentionRows}>
          {reviews.map((recommendation) => (
            <RecommendationSurface
              busy={false}
              key={recommendation.id}
              onAccept={() => undefined}
              onKeepCurrent={() => undefined}
              recommendation={recommendation}
              {...(recommendation.sourceSessionId === null
                ? {}
                : { onOpenSource: onOpenSession })}
            />
          ))}
        </View>
      </ContentCard>
    </View>
  );
}

function ExerciseProgress({
  projection,
  onOpenExercise,
}: Readonly<{
  projection: ProgressPeriodProjection;
  onOpenExercise(exerciseId: string, exerciseName: string): void;
}>) {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState("");
  const exercises = useMemo(() => projection.exercises
    .slice().sort((left, right) => right.localDate.localeCompare(left.localDate))
    .filter((exercise) => exercise.exerciseName.toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())), [projection.exercises, query]);

  return (
    <View style={styles.section}>
      <SectionHeader
        supportingText="Comparable working-set evidence, ordered by recent training."
        title="Exercise progress"
      />
      <M3SearchField
        label="Search exercises"
        onChangeText={setQuery}
        onSearch={() => setQuery((value) => value.trim())}
        resultCount={exercises.length}
        state={query.trim().length === 0 ? "results" : exercises.length === 0 ? "empty" : "results"}
        stateSlots={{
          empty: null,
          results: null,
        }}
        testID="progress-exercise-search"
        value={query}
      />
      {exercises.length === 0 ? (
        <EmptyState
          body="Try a different exercise name."
          heading="No matching exercises"
          primaryAction={<PrimaryAction label="Clear search" onPress={() => setQuery("")} />}
        />
      ) : (
        <View style={styles.exerciseRows}>
          {exercises.map((exercise) => (
            <FocusablePressable
              accessibilityLabel={"Open exercise history for " + exercise.exerciseName}
              accessibilityRole="button"
              focusable
              key={exercise.exerciseId + ":" + exercise.identityKey + ":" + exercise.comparatorKey}
              onPress={() => onOpenExercise(exercise.exerciseId, exercise.exerciseName)}
              style={({ pressed }: { pressed: boolean }) => [
                styles.exerciseRow,
                {
                  backgroundColor: colors.contentCard,
                  borderColor: colors.contentCardBorder,
                  opacity: pressed ? 0.76 : 1,
                },
              ]}
            >
              <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>{exercise.exerciseName}</Text>
              <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
                {(exercise.status === "improving" ? "Improving" : exercise.status === "holding" ? "Hold" : "Baseline") + " · " + longDate(exercise.localDate) + " · " + exercise.identityKey}
              </Text>
            </FocusablePressable>
          ))}
        </View>
      )}
    </View>
  );
}

export function ProgressScreen({
  nowLocalDate,
  workoutRefreshGeneration = 0,
  loadProgress,
  onOpenExercise,
  onOpenSession,
  onAcceptRecommendation,
  onKeepCurrentTarget,
  width,
}: ProgressScreenProps) {
  const [period, setPeriod] = useState<ProgressPeriod>("4_weeks");
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [requestGeneration, setRequestGeneration] = useState(0);
  const [recommendationDecisionNotice, setRecommendationDecisionNotice] = useState<
    "superseded" | "failed" | null
  >(null);
  const adaptiveWidth = width === undefined ? {} : { width };

  useEffect(() => {
    let active = true;
    setFailed(false);
    setSnapshot(null);
    void loadProgress({ period, nowLocalDate }).then((next) => {
      if (active) {
        setSnapshot(next);
      }
    }).catch(() => {
      if (active) {
        setFailed(true);
      }
    });
    return () => { active = false; };
  }, [loadProgress, nowLocalDate, period, requestGeneration, workoutRefreshGeneration]);

  useEffect(() => {
    if (snapshot?.freshness !== "updating") {
      return;
    }
    const timer = setTimeout(() => {
      setRequestGeneration((value) => value + 1);
    }, 250);
    return () => clearTimeout(timer);
  }, [snapshot]);

  const header = (
    <>
      <ScreenHeader title="Progress" />
      <PeriodControls onChange={setPeriod} selected={period} />
      {recommendationDecisionNotice === null ? null : (
        <View accessibilityRole="alert">
          <InlineNotice
            body={recommendationDecisionNotice === "superseded"
              ? "The current target was not changed. Progress was reloaded from saved facts."
              : "The saved target was not changed. It may already have changed or no longer be available. Progress was reloaded from saved facts."}
            heading={recommendationDecisionNotice === "superseded"
              ? "Recommendation no longer applies"
              : "Recommendation decision needs review"}
            tone={recommendationDecisionNotice === "superseded"
              ? "attention"
              : "error"}
          />
        </View>
      )}
    </>
  );

  if (failed) {
    return (
      <AdaptiveScreen
        {...adaptiveWidth}
        primary={(
          <View style={styles.screen}>
            {header}
            <EmptyState
              body="Your saved workouts and targets were not changed. Retry loading progress."
              heading="Progress could not be loaded"
              primaryAction={<PrimaryAction label="Retry loading progress" onPress={() => setRequestGeneration((value) => value + 1)} />}
            />
          </View>
        )}
        testID="progress-screen"
      />
    );
  }

  if (snapshot === null) {
    return (
      <AdaptiveScreen
        {...adaptiveWidth}
        primary={(
          <View style={styles.screen}>
            {header}
            <SkeletonBlock height={180} testID="progress-skeleton-overall" />
            <SkeletonBlock height={184} testID="progress-skeleton-consistency" />
          </View>
        )}
        testID="progress-screen"
      />
    );
  }

  if (snapshot.freshness !== "current" || snapshot.projection === null) {
    const diagnosticBody = rebuildDiagnosticText(snapshot.diagnostic);
    return (
      <AdaptiveScreen
        {...adaptiveWidth}
        primary={(
          <View style={styles.screen}>
            {header}
            <InlineNotice
              body={diagnosticBody ?? "Saved history is being recalculated. Results refresh automatically."}
              heading="Updating progress"
              tone="neutral"
            />
            <PrimaryAction
              label="Refresh progress"
              onPress={() => setRequestGeneration((value) => value + 1)}
            />
          </View>
        )}
        testID="progress-screen"
      />
    );
  }

  const projection = snapshot.projection;
  if (!hasFactualEvidence(projection)) {
    return (
      <AdaptiveScreen
        {...adaptiveWidth}
        primary={(
          <View style={styles.screen}>
            {header}
            <EmptyState
              body="Completed working sets and planned opportunities will appear here after you train."
              heading="No progress history yet"
              primaryAction={<PrimaryAction label="Refresh progress" onPress={() => setRequestGeneration((value) => value + 1)} />}
            />
          </View>
        )}
        testID="progress-screen"
      />
    );
  }

  return (
    <AdaptiveScreen
      {...adaptiveWidth}
      primary={(
        <View style={styles.screen}>
          {header}
          <OverallProgress
            onOpenExercise={onOpenExercise}
            onOpenSession={onOpenSession}
            projection={projection}
          />
          <ProgressTrend
            onOpenExercise={onOpenExercise}
            onOpenSession={onOpenSession}
            rows={projection.trend}
          />
          <NeedsAttention
              {...(onAcceptRecommendation === undefined
                ? {}
                : { onAcceptRecommendation })}
              {...(onKeepCurrentTarget === undefined
                ? {}
                : { onKeepCurrentTarget })}
            onOpenExercise={onOpenExercise}
            onOpenSession={onOpenSession}
            onRecommendationDecisionComplete={() => {
              setRequestGeneration((value) => value + 1);
            }}
            onRecommendationDecisionNotice={setRecommendationDecisionNotice}
            projection={projection}
          />
          <ReviewHistory
            onOpenSession={onOpenSession}
            projection={projection}
          />
          <ExerciseProgress onOpenExercise={onOpenExercise} projection={projection} />
        </View>
      )}
      testID="progress-screen"
    />
  );
}

const styles = StyleSheet.create({
  attentionActions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  attentionRow: { borderBottomWidth: StyleSheet.hairlineWidth, gap: space[1], paddingBottom: space[4] },
  attentionRows: { gap: space[4] },
  exerciseRow: { borderRadius: radius.standard, borderWidth: StyleSheet.hairlineWidth, gap: space[1], minHeight: 72, padding: space[4] },
  exerciseRows: { gap: space[2] },
  periodControl: { alignItems: "center", borderRadius: radius.standard, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center", minHeight: 48, paddingHorizontal: space[4] },
  periodControls: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  recommendationReview: { gap: space[2] },
  recordRow: { borderRadius: radius.standard, borderWidth: StyleSheet.hairlineWidth, gap: space[1], minHeight: 56, padding: space[2] },
  records: { gap: space[2] },
  screen: { gap: space[4], maxWidth: 960, width: "100%" },
  section: { gap: space[2] },
  sourceActions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  summaryRow: { gap: space[2] },
  summaryRows: { gap: space[4] },
  textAction: { borderRadius: radius.standard, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center", minHeight: 48, paddingHorizontal: space[2] },
});

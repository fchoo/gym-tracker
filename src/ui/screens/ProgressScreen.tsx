import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent, type TextStyle } from "react-native";

import type { ProgressPeriod, ProgressPeriodProjection, ProgressProjectionDiagnostic, ProgressProjectionFreshness, ProgressRecommendationReview } from "../../domains/progress";
import type { RecommendationDecisionResult } from "../../domains/progression";
import type { ProgressDashboardProjection, ProgressPlannedNext, ProgressRefreshMetadata, ProgressRunningGoal, ProgressSport, ProgressStrengthGoal, ProgressStrengthValueFormat } from "../../domains/progress/contracts";
import { runningTargetForDistance, type RunningPlanAggregate } from "../../domains/running/contracts";
import type { RunningPlanRuntimePort } from "../../bootstrap/runningPlanRuntime";
import type { ProgressBodyweightEntry, ProgressBodyweightSaveInput } from "../../bootstrap/workoutAppRuntime";
import { EmptyState, FocusablePressable, IconAction, InlineNotice, PrimaryAction, ScreenHeader, SkeletonBlock } from "../components";
import { BodyweightEditorSheet } from "../components/BodyweightEditorSheet";
import { BodyweightHistorySheet } from "../components/BodyweightHistorySheet";
import { ProgressSettingsSheet } from "../components/ProgressSettingsSheet";
import { RecommendationSurface, recommendationTargetText } from "../components/RecommendationSurface";
import { RunningHistorySheet, runningGoalToFactualSeries } from "../components/RunningHistorySheet";
import { RunningTargetSheet } from "../components/RunningTargetSheet";
import { FactualHistoryChart, formatFactualDuration, type FactualHistorySource, type ProgressFactualSeries } from "../components/FactualHistoryChart";
import { useOptionalSemanticToast } from "../components/SemanticToast";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import type { RootFocusTarget } from "../shell/rootFocus";
import { radius, sizes, space, typeScale, useAppTheme } from "../theme";

type ProgressSnapshot = Readonly<{
  period: ProgressPeriod;
  freshness: ProgressProjectionFreshness;
  sport?: ProgressSport;
  dashboard?: ProgressDashboardProjection | null;
  projection?: ProgressPeriodProjection | null;
  diagnostic?: ProgressProjectionDiagnostic;
  refresh?: ProgressRefreshMetadata;
  runningTargetSources?: readonly RunningPlanAggregate[];
}>;

export type ProgressScreenProps = Readonly<{
  nowLocalDate: string;
  workoutRefreshGeneration?: number;
  loadProgress(input: Readonly<{ sport: ProgressSport; period: ProgressPeriod; nowLocalDate: string }>): Promise<ProgressSnapshot>;
  onOpenExercise(exerciseId: string, exerciseName: string, returnFocusToken?: string): void;
  onOpenSession(sessionId: string, returnFocusToken?: string, sourceRevision?: number): void;
  onOpenRunningSource?(source: FactualHistorySource, returnFocusToken: string): void;
  onOpenSettings?(): void;
  runningTargetRuntime?: Pick<RunningPlanRuntimePort, "createId" | "loadPlan" | "saveRunningTarget">;
  progressRecommendationRuntime?: Readonly<{
    decide(recommendation: ProgressRecommendationReview, decision: "use_target" | "keep_current_target"): Promise<RecommendationDecisionResult>;
  }>;
  progressBodyweightRuntime?: Readonly<{
    createId(kind: string): string;
    loadHistory(): Promise<readonly ProgressBodyweightEntry[]>;
    save(input: ProgressBodyweightSaveInput): Promise<readonly ProgressBodyweightEntry[]>;
    delete(entry: ProgressBodyweightEntry, requestId: string): Promise<readonly ProgressBodyweightEntry[]>;
  }>;
  returnFocusVersion?: number;
  returnFocusToken?: string;
  width?: number;
  fontScale?: number;
  headingRef?: React.RefObject<RootFocusTarget | null>;
  settingsActionRef?: React.RefObject<RootFocusTarget | null>;
  settingsActionNativeID?: string;
}>;

const SPORTS: readonly Readonly<{ value: ProgressSport; label: ProgressSport }>[] = [
  { value: "All", label: "All" },
  { value: "Strength", label: "Strength" },
  { value: "Running", label: "Running" },
];
const PERIODS: readonly Readonly<{ value: ProgressPeriod; label: string }>[] = [
  { value: "4_weeks", label: "4 weeks" },
  { value: "12_weeks", label: "12 weeks" },
  { value: "all_time", label: "All time" },
];

function rebuildText(diagnostic?: ProgressProjectionDiagnostic): string {
  if (diagnostic?.code === "history_projection_unavailable") {
    return "Progress is temporarily unavailable. Reload to try again.";
  }
  return "Saved history is being recalculated. Results refresh automatically.";
}

function SegmentedControls<T extends string>({
  label,
  role,
  values,
  selected,
  onChange,
}: Readonly<{
  label: string;
  role: "tab" | "button";
  values: readonly Readonly<{ value: T; label: string }>[];
  selected: T;
  onChange(value: T): void;
}>) {
  const { colors } = useAppTheme();
  const itemRefs = useRef(new Map<T, View>());
  const move = (index: number, key: string) => {
    const next = key === "Home" ? 0 : key === "End" ? values.length - 1 : key === "ArrowLeft" ? Math.max(0, index - 1) : key === "ArrowRight" ? Math.min(values.length - 1, index + 1) : index;
    if (next !== index || key === "Home" || key === "End") {
      const value = values[next]!.value;
      onChange(value);
      requestAnimationFrame(() => itemRefs.current.get(value)?.focus?.());
    }
  };
  return (
    <View accessibilityLabel={label} accessibilityRole={role === "tab" ? "tablist" : "radiogroup"} style={styles.segmented}>
      {values.map((item, index) => {
        const isSelected = item.value === selected;
        return (
          <FocusablePressable
            {...({ onKeyDown: (event: { nativeEvent: { key: string; preventDefault?: () => void } }) => {
              const key = event.nativeEvent.key;
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) {
                event.nativeEvent.preventDefault?.();
                move(index, key);
              } else if (key === "Enter" || key === " ") {
                event.nativeEvent.preventDefault?.();
                onChange(item.value);
              }
            } } as object)}
            accessibilityLabel={item.label}
            accessibilityRole={role}
            accessibilityState={role === "tab" ? { selected: isSelected } : { selected: isSelected, checked: isSelected }}
            focusable
            key={item.value}
            onPress={() => onChange(item.value)}
            ref={(node) => { if (node === null) itemRefs.current.delete(item.value); else itemRefs.current.set(item.value, node); }}
            style={({ pressed }: { pressed: boolean }) => [
              styles.segment,
              { backgroundColor: isSelected ? colors.action : colors.surface, borderColor: isSelected ? colors.focusRing : colors.divider, opacity: pressed ? 0.78 : 1 },
            ]}
          >
            <Text style={[typeScale.bodyStrong as TextStyle, { color: isSelected ? colors.onAction : colors.textPrimary }]}>{item.label}</Text>
          </FocusablePressable>
        );
      })}
    </View>
  );
}

function distanceLabel(distanceMeters: number): string {
  if (distanceMeters === 2_400) return "2.4 km";
  if (distanceMeters === 10_000) return "10 km";
  if (distanceMeters === 21_097) return "Half Marathon";
  return `${distanceMeters} m`;
}

function PlannedNext({ value }: Readonly<{ value: ProgressPlannedNext | null | undefined }>) {
  const { colors } = useAppTheme();
  if (value === null || value === undefined) return null;
  return <View style={styles.goalRows} testID="progress-planned-next">
    <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Planned next</Text>
    <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{`${value.sport} · ${value.activityName} · ${value.localDate}`}</Text>
    <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{value.planName}</Text>
  </View>;
}

function HeroFactRow({ facts, stacked }: Readonly<{
  facts: readonly Readonly<{ label: "Latest" | "Best" | "Target"; value: string }>[];
  stacked: boolean;
}>) {
  const { colors } = useAppTheme();
  return <View
    style={[styles.factRow, stacked ? styles.factRowStacked : null, { borderColor: colors.divider }]}
    testID="progress-hero-facts"
  >
    {facts.map(({ label, value }, index) => <View
      key={label}
      style={[
        styles.factCell,
        index === 0 ? null : stacked ? styles.factCellStackedDivider : styles.factCellRowDivider,
        { borderColor: colors.divider },
      ]}
      testID={`progress-hero-fact-${label.toLowerCase()}`}
    >
      <Text style={[typeScale.targetValue as TextStyle, { color: colors.textPrimary }]}>{`${label} · ${value}`}</Text>
    </View>)}
  </View>;
}

function RunningRoot({ dashboard, historyTriggerRef, onOpenHistory, onOpenTarget, onRetry, rangeLabel, stackHeroFacts, targetSources, targetTriggerRefs }: Readonly<{
  dashboard: Extract<ProgressDashboardProjection, { sport: "Running" }>;
  historyTriggerRef: React.RefObject<View | null>;
  onOpenHistory(goal: ProgressRunningGoal): void;
  onOpenTarget(distanceMeters: number): void;
  onRetry(): void;
  rangeLabel: string;
  stackHeroFacts: boolean;
  targetSources: readonly RunningPlanAggregate[];
  targetTriggerRefs: React.MutableRefObject<Map<number, View>>;
}>) {
  const { colors } = useAppTheme();
  const goalRow = (distanceMeters: number) => {
    const label = distanceLabel(distanceMeters);
    const effort = dashboard.goals.find((candidate) => candidate.distanceMeters === distanceMeters);
    const source = targetSources[0];
    const target = effort?.target === null || effort?.target === undefined
      ? "Target unset"
      : formatFactualDuration(effort.target.durationSeconds);
    const evidence = effort?.best === null || effort?.best === undefined
      ? "No effort recorded"
      : `Best ${formatFactualDuration(effort.best.durationSeconds)}`;
    const copy = `${label} · ${target} · ${evidence} · Set target`;
    if (source === undefined) return <Text key={distanceMeters} style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>{copy}</Text>;
    return <FocusablePressable
      accessibilityLabel={`Set target for ${label}`}
      accessibilityRole="button"
      focusable
      key={distanceMeters}
      onPress={() => onOpenTarget(distanceMeters)}
      ref={(node) => { if (node === null) targetTriggerRefs.current.delete(distanceMeters); else targetTriggerRefs.current.set(distanceMeters, node); }}
      style={[styles.goalAction, { borderColor: colors.divider }]}
    ><Text style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>{copy}</Text></FocusablePressable>;
  };
  const goal = dashboard.goals.find((candidate) => candidate.distanceMeters === 2400) ?? dashboard.goals[0];
  if (goal === undefined) return <View style={styles.content}>
    <InlineNotice body="Running facts and best efforts come from accepted imported Garmin activities. Exact-distance efforts require sufficient source-reported summary/lap evidence; sampled charts are not evidence. Matching never completes a scheduled workout without confirmation." heading="Garmin imported" tone="neutral" />
    <EmptyState body="Goals can remain saved, but no zero chart or direction is shown until a Garmin activity is imported." heading="No imported running efforts yet" primaryAction={<PrimaryAction label="Refresh progress" onPress={onRetry} />} />
    <View style={styles.goalRows}><Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Running goals</Text>{goalRow(2_400)}{goalRow(10_000)}{goalRow(21_097)}</View>
    <PlannedNext value={dashboard.plannedNext} />
  </View>;
  const target = goal.target === null ? "Target unset" : formatFactualDuration(goal.target.durationSeconds);
  const latest = goal.latest === null ? "—" : `${formatFactualDuration(goal.latest.durationSeconds)} elapsed`;
  const best = goal.best === null ? "—" : `${formatFactualDuration(goal.best.durationSeconds)} elapsed`;
  return (
    <View style={styles.content}>
      <InlineNotice body="Running facts and best efforts come from accepted imported Garmin activities. Exact-distance efforts require sufficient source-reported summary/lap evidence; sampled charts are not evidence. Matching never completes a scheduled workout without confirmation." heading="Garmin imported" tone="neutral" />
      {dashboard.state === "sparse" ? <InlineNotice body={goal.evidenceCount === 0 ? "Complete or import a comparable result to calculate Best and Gap." : "One comparable result is not enough to call a trend."} heading={goal.evidenceCount === 0 ? "Target saved" : "More data needed"} tone="attention" /> : null}
      <View style={[styles.hero, { borderTopColor: colors.textPrimary }]}>
        <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>{`${distanceLabel(goal.distanceMeters)} goal`}</Text>
        <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Best efforts compare elapsed time at the same distance. Faster is lower on the clock.</Text>
        <HeroFactRow facts={[
          { label: "Latest", value: latest },
          { label: "Best", value: best },
          { label: "Target", value: target },
        ]} stacked={stackHeroFacts} />
        <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{goal.gap}</Text>
        {goal.pacing === null ? null : <View style={styles.pacing}>
          <Text style={[typeScale.targetValue as TextStyle, { color: colors.textPrimary }]}>{`Pace · ${goal.pacing.pacePerKm}`}</Text>
          <Text style={[typeScale.targetValue as TextStyle, { color: colors.textPrimary }]}>{`400 m · ${goal.pacing.per400m.replace("/400 m", "")}`}</Text>
          <Text style={[typeScale.targetValue as TextStyle, { color: colors.textPrimary }]}>{`200 m · ${goal.pacing.per200m.replace("/200 m", "")}`}</Text>
        </View>}
        <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{`Evidence · ${goal.evidenceCount} accepted imported ${goal.evidenceCount === 1 ? "activity" : "activities"}`}</Text>
        <FactualHistoryChart series={runningGoalToFactualSeries(goal, rangeLabel)} />
        <View style={styles.actions}>
          <FocusablePressable accessibilityLabel={`Open history for ${distanceLabel(goal.distanceMeters)}`} accessibilityRole="button" focusable onPress={() => onOpenHistory(goal)} ref={historyTriggerRef} style={[styles.goalAction, { borderColor: colors.focusRing }]}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.focusRing }]}>Open history</Text></FocusablePressable>
          {targetSources.length > 0 ? <FocusablePressable accessibilityLabel={`Edit target for ${distanceLabel(goal.distanceMeters)}`} accessibilityRole="button" focusable onPress={() => onOpenTarget(goal.distanceMeters)} ref={(node) => { if (node === null) targetTriggerRefs.current.delete(goal.distanceMeters); else targetTriggerRefs.current.set(goal.distanceMeters, node); }} style={[styles.goalAction, { borderColor: colors.focusRing }]}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.focusRing }]}>Set target</Text></FocusablePressable> : null}
        </View>
      </View>
      <View style={styles.goalRows}>
        <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Running goals</Text>
        {goalRow(2_400)}{goalRow(10_000)}{goalRow(21_097)}
      </View>
      <View style={styles.goalRows}>
        <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Best efforts</Text>
        {[2_400, 10_000, 21_097].map((distance) => {
          const candidate = dashboard.goals.find(({ distanceMeters }) => distanceMeters === distance);
          return <Text key={distance} style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>{`${distanceLabel(distance)} · ${candidate?.best === null || candidate?.best === undefined ? "No effort recorded" : formatFactualDuration(candidate.best.durationSeconds)}`}</Text>;
        })}
      </View>
      <PlannedNext value={dashboard.plannedNext} />
    </View>
  );
}

function formatStrengthValue(format: ProgressStrengthValueFormat, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const exact = Number(value.toFixed(3));
  switch (format) {
    case "kilograms": return `${exact} kg`;
    case "repetitions": return `${exact} reps`;
    case "seconds": return `${exact} sec`;
    case "duration": return formatFactualDuration(value);
    case "meters": return `${exact} m`;
    case "rounds": return `${exact} rounds`;
    case "completion": return value >= 1 ? "Completed" : "Not completed";
  }
}

function strengthSeries(goal: ProgressStrengthGoal, rangeLabel: string): ProgressFactualSeries {
  return Object.freeze({
    distanceMeters: 0,
    fasterIsLower: goal.fasterIsLower,
    metricLabel: `${goal.exerciseName} personal history`,
    directionLabel: goal.directionLabel,
    rangeLabel,
    unitLabel: goal.unitLabel,
    currentTargetSeconds: goal.target?.value ?? null,
    points: Object.freeze(goal.history.map((point) => Object.freeze({
      activityId: null,
      workoutSessionId: point.sessionId,
      evidence: "workout_session" as const,
      localDate: point.localDate,
      sourceRevision: point.sourceRevision,
      status: "accepted_current" as const,
      targetAtDateSeconds: point.targetAtDate,
      timeBasis: "elapsed" as const,
      valueSeconds: point.value,
    }))),
  });
}

function StrengthGoalHero({ goal, heading, historyActionRef, onOpenHistory, onOpenSource, rangeLabel, registerSourceAction, stackHeroFacts }: Readonly<{
  goal: ProgressStrengthGoal;
  heading: string;
  historyActionRef(node: View | null): void;
  onOpenHistory(): void;
  onOpenSource(source: FactualHistorySource): void;
  rangeLabel: string;
  registerSourceAction(source: FactualHistorySource, node: View | null): void;
  stackHeroFacts: boolean;
}>) {
  const { colors } = useAppTheme();
  return <View style={[styles.hero, { borderTopColor: colors.textPrimary }]}>
    <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>{heading}</Text>
    <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>{`${goal.exerciseName} · ${goal.directionLabel}`}</Text>
    <HeroFactRow facts={[
      { label: "Latest", value: goal.latest.label },
      { label: "Best", value: goal.best.label },
      { label: "Target", value: goal.target?.label ?? "Target unset" },
    ]} stacked={stackHeroFacts} />
    <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{goal.gap}</Text>
    <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{`Evidence · ${goal.evidenceCount} completed working ${goal.evidenceCount === 1 ? "set" : "sets"} · ${goal.status}`}</Text>
    <FactualHistoryChart
      formatValue={(value) => formatStrengthValue(goal.valueFormat, value)}
      onOpenSource={onOpenSource}
      registerSourceAction={registerSourceAction}
      series={strengthSeries(goal, rangeLabel)}
    />
    <FocusablePressable accessibilityLabel={`Open exercise history for ${goal.exerciseName}`} accessibilityRole="button" focusable onPress={onOpenHistory} ref={historyActionRef} style={[styles.goalAction, { borderColor: colors.focusRing }]}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.focusRing }]}>Open history</Text></FocusablePressable>
  </View>;
}

function DashboardContent({ dashboard, exerciseActionRefs, onDecideRecommendation, onOpenExercise, onOpenSession, onRetry, onSelectSport, period, rangeLabel, recommendationSourceRefs, recommendations, returnActionRefs, stackHeroFacts, staleRecommendation }: Readonly<{
  dashboard: Exclude<ProgressDashboardProjection, { sport: "Running" }>;
  exerciseActionRefs: React.MutableRefObject<Map<string, View>>;
  onDecideRecommendation?: ((recommendation: ProgressRecommendationReview, decision: "use_target" | "keep_current_target") => Promise<unknown>) | undefined;
  onOpenExercise(exerciseId: string, exerciseName: string, returnFocusToken?: string): void;
  onOpenSession(sessionId: string, returnFocusToken?: string, sourceRevision?: number): void;
  onRetry(): void;
  onSelectSport(sport: ProgressSport): void;
  period: ProgressPeriod;
  rangeLabel: string;
  recommendationSourceRefs: React.MutableRefObject<Map<string, View>>;
  recommendations: readonly ProgressRecommendationReview[];
  returnActionRefs: React.MutableRefObject<Map<string, View>>;
  stackHeroFacts: boolean;
  staleRecommendation: ProgressRecommendationReview | null;
}>) {
  const { colors } = useAppTheme();
  if (dashboard.state === "empty") {
    return <View style={styles.content}>
      {dashboard.sport === "Strength"
        ? <EmptyState body="Complete comparable working sets to establish personal history." heading="No comparable Strength history yet" primaryAction={<PrimaryAction label="Refresh progress" onPress={onRetry} />} />
        : <EmptyState body="Completed Strength history and accepted Running efforts will appear here after you train or import an activity." heading="No progress history yet" primaryAction={<PrimaryAction label="Refresh progress" onPress={onRetry} />} />}
      <PlannedNext value={dashboard.plannedNext} />
    </View>;
  }
  if (dashboard.state === "unavailable") {
    return <InlineNotice body="The requested progress facts are unavailable. Reload to try again." heading="Progress is temporarily unavailable" tone="error" />;
  }
  if (dashboard.sport === "All") {
    const primaryGoal = dashboard.primaryGoal;
    if (primaryGoal === null) return <EmptyState body="Add a persisted goal and comparable completed history to show the nearest active goal." heading="No active goal yet" primaryAction={<PrimaryAction label="Refresh progress" onPress={onRetry} />} />;
    if (primaryGoal.sport === "Strength") {
      const goal = primaryGoal.goal;
      const historyToken = `progress:All:${period}:hero-history:${goal.exerciseId}:${goal.latest.sourceRevision ?? 0}`;
      return <View style={styles.content}>
        {dashboard.state === "sparse" ? <InlineNotice body="One comparable result is not enough to call a trend." heading="More data needed" tone="attention" /> : null}
        <StrengthGoalHero
          goal={goal}
          heading="Nearest active goal"
          historyActionRef={(node) => { if (node === null) returnActionRefs.current.delete(historyToken); else returnActionRefs.current.set(historyToken, node); }}
          onOpenHistory={() => onOpenExercise(goal.exerciseId, goal.exerciseName, historyToken)}
          onOpenSource={(source) => { if ("sessionId" in source) onOpenSession(source.sessionId, `progress:All:${period}:hero-source:${source.sessionId}:${source.sourceRevision ?? 0}`, source.sourceRevision ?? undefined); }}
          rangeLabel={rangeLabel}
          registerSourceAction={(source, node) => {
            if (!("sessionId" in source)) return;
            const token = `progress:All:${period}:hero-source:${source.sessionId}:${source.sourceRevision ?? 0}`;
            if (node === null) returnActionRefs.current.delete(token); else returnActionRefs.current.set(token, node);
          }}
          stackHeroFacts={stackHeroFacts}
        />
        <FocusablePressable accessibilityLabel="Open Strength goal" accessibilityRole="button" focusable onPress={() => onSelectSport("Strength")} style={[styles.goalAction, { borderColor: colors.divider }]}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>Open Strength goal</Text></FocusablePressable>
        <View style={styles.goalRows}><Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Active goals</Text>{dashboard.activeGoals.map((entry) => <Text key={`${entry.sport}:${entry.sport === "Strength" ? entry.goal.goalId : entry.goal.distanceMeters}`} style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>{entry.sport === "Strength" ? `${entry.goal.exerciseName} · ${entry.goal.target?.label ?? "Target unset"} · ${entry.goal.status}` : `${distanceLabel(entry.goal.distanceMeters)} · ${entry.goal.target === null ? "Target unset" : formatFactualDuration(entry.goal.target.durationSeconds)} · ${entry.goal.gap}`}</Text>)}</View>
        <PlannedNext value={dashboard.plannedNext} />
      </View>;
    }
    const goal = primaryGoal.goal;
    return <View style={styles.content}>
      {dashboard.state === "sparse" ? <InlineNotice body={goal.evidenceCount === 0 ? "Complete or import a comparable result to calculate Best and Gap." : "One comparable result is not enough to call a trend."} heading={goal.evidenceCount === 0 ? "Target saved" : "More data needed"} tone="attention" /> : null}
      <View style={[styles.hero, { borderTopColor: colors.textPrimary }]}><Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Nearest active goal</Text><Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>{`Running · ${distanceLabel(goal.distanceMeters)}`}</Text><HeroFactRow facts={[{ label: "Latest", value: goal.latest === null ? "—" : formatFactualDuration(goal.latest.durationSeconds) }, { label: "Best", value: goal.best === null ? "—" : formatFactualDuration(goal.best.durationSeconds) }, { label: "Target", value: goal.target === null ? "Target unset" : formatFactualDuration(goal.target.durationSeconds) }]} stacked={stackHeroFacts} /><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{goal.gap}</Text><Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{`Evidence · ${goal.evidenceCount} accepted imported ${goal.evidenceCount === 1 ? "activity" : "activities"}`}</Text><FactualHistoryChart series={runningGoalToFactualSeries(goal, rangeLabel)} /><FocusablePressable accessibilityLabel="Open Running goal" accessibilityRole="button" focusable onPress={() => onSelectSport("Running")} style={[styles.goalAction, { borderColor: colors.divider }]}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>Open Running goal</Text></FocusablePressable></View>
      <PlannedNext value={dashboard.plannedNext} />
    </View>;
  }
  const primary = dashboard.goals[0];
  const primaryHistoryToken = primary === undefined
    ? null
    : `progress:Strength:${period}:hero-history:${primary.exerciseId}:${primary.latest.sourceRevision ?? 0}`;
  return <View style={styles.content}>
    {dashboard.state === "sparse" ? <InlineNotice body="One comparable result is not enough to call a trend." heading="More data needed" tone="attention" /> : null}
    {staleRecommendation === null ? null : <InlineNotice body="The current target was not changed. Progress was reloaded from saved facts." heading="Recommendation no longer applies" tone="attention" />}
    {primary === undefined || primaryHistoryToken === null ? null : <StrengthGoalHero goal={primary} heading="Strength progress" historyActionRef={(node) => { if (node === null) returnActionRefs.current.delete(primaryHistoryToken); else returnActionRefs.current.set(primaryHistoryToken, node); }} onOpenHistory={() => onOpenExercise(primary.exerciseId, primary.exerciseName, primaryHistoryToken)} onOpenSource={(source) => { if ("sessionId" in source) onOpenSession(source.sessionId, `progress:Strength:${period}:hero-source:${source.sessionId}:${source.sourceRevision ?? 0}`, source.sourceRevision ?? undefined); }} rangeLabel={rangeLabel} registerSourceAction={(source, node) => {
      if (!("sessionId" in source)) return;
      const token = `progress:Strength:${period}:hero-source:${source.sessionId}:${source.sourceRevision ?? 0}`;
      if (node === null) returnActionRefs.current.delete(token); else returnActionRefs.current.set(token, node);
    }} stackHeroFacts={stackHeroFacts} />}
    {recommendations.length === 0 ? null : <View style={styles.goalRows}>
      <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Needs review</Text>
      {recommendations.map((recommendation) => <RecommendationSurface
        key={recommendation.id}
        recommendation={recommendation}
        onAccept={() => onDecideRecommendation?.(recommendation, "use_target")}
        onKeepCurrent={() => onDecideRecommendation?.(recommendation, "keep_current_target")}
        onOpenSource={(sessionId) => onOpenSession(sessionId, `progress:Strength:${period}:recommendation:${recommendation.id}`)}
        sourceActionRef={(node) => {
          if (node === null) recommendationSourceRefs.current.delete(recommendation.id);
          else recommendationSourceRefs.current.set(recommendation.id, node);
        }}
      />)}
    </View>}
    <View style={styles.goalRows}>
      <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Exercise progress</Text>
      {dashboard.goals.map((goal) => <FocusablePressable accessibilityLabel={`Open exercise history for ${goal.exerciseName}`} accessibilityRole="button" focusable key={goal.goalId} onPress={() => onOpenExercise(goal.exerciseId, goal.exerciseName, `progress:Strength:${period}:exercise:${goal.exerciseId}`)} ref={(node) => { if (node === null) exerciseActionRefs.current.delete(goal.exerciseId); else exerciseActionRefs.current.set(goal.exerciseId, node); }} style={[styles.goalAction, { borderColor: colors.divider }]}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{goal.exerciseName}</Text><Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{`Latest ${goal.latest.label} · ${goal.target?.label ?? "Target unset"} · ${goal.status}`}</Text></FocusablePressable>)}
    </View>
    <PlannedNext value={dashboard.plannedNext} />
  </View>;
}

export function ProgressScreen({ nowLocalDate, workoutRefreshGeneration = 0, loadProgress, onOpenExercise, onOpenSession, onOpenRunningSource, onOpenSettings = () => undefined, runningTargetRuntime, progressRecommendationRuntime, progressBodyweightRuntime, returnFocusToken, returnFocusVersion = 0, width, fontScale, headingRef, settingsActionRef, settingsActionNativeID }: ProgressScreenProps) {
  const { colors } = useAppTheme();
  const windowDimensions = useWindowDimensions();
  const [sport, setSport] = useState<ProgressSport>("All");
  const [period, setPeriod] = useState<ProgressPeriod>("4_weeks");
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const requestRef = useRef(0);
  const automaticRefreshAttemptRef = useRef(0);
  const historyTriggerRef = useRef<View>(null);
  const targetTriggerRefs = useRef(new Map<number, View>());
  const bodyMetricsTriggerRef = useRef<View>(null);
  const progressSettingsTriggerRef = useRef<View>(null);
  const bodyweightSettingsActionRef = useRef<View>(null);
  const bodyweightEditorRestoreFocusRef = useRef<View>(null);
  const exerciseActionRefs = useRef(new Map<string, View>());
  const recommendationSourceRefs = useRef(new Map<string, View>());
  const runningSourceActionRefs = useRef(new Map<string, View>());
  const returnActionRefs = useRef(new Map<string, View>());
  const scrollOffsetRef = useRef(0);
  const [historyGoal, setHistoryGoal] = useState<ProgressRunningGoal | null>(null);
  const [targetDistanceMeters, setTargetDistanceMeters] = useState<number | null>(null);
  const [progressSettingsVisible, setProgressSettingsVisible] = useState(false);
  const [bodyweightVisible, setBodyweightVisible] = useState(false);
  const [bodyweightInvoker, setBodyweightInvoker] = useState<"body_metrics" | "settings">("body_metrics");
  const [bodyweightEntries, setBodyweightEntries] = useState<readonly ProgressBodyweightEntry[]>([]);
  const [bodyweightEditor, setBodyweightEditor] = useState<Readonly<{ mode: "add" | "edit"; entry?: ProgressBodyweightEntry }> | null>(null);
  const [staleRecommendation, setStaleRecommendation] = useState<ProgressRecommendationReview | null>(null);
  const bodyweightRequestRef = useRef<string | null>(null);
  const bodyweightDeleteRequestsRef = useRef(new Map<string, string>());
  const semanticToast = useOptionalSemanticToast();
  const adaptiveWidth = width === undefined ? {} : { width };
  const stackHeroFacts = (fontScale ?? windowDimensions.fontScale) >= 2
    || (width ?? windowDimensions.width) < 360;

  const readProgress = useCallback(async (showLoading: boolean) => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    if (showLoading) setSnapshot(null);
    setFailed(false);
    try {
      const next = await loadProgress({ sport, period, nowLocalDate });
      if (request !== requestRef.current || (next.dashboard !== null && next.dashboard !== undefined && next.dashboard.sport !== sport)) return null;
      setSnapshot(next);
      return next;
    } catch (error) {
      if (request === requestRef.current) setFailed(true);
      throw error;
    }
  }, [loadProgress, nowLocalDate, period, sport]);

  useEffect(() => {
    automaticRefreshAttemptRef.current = 0;
    void readProgress(true).catch(() => undefined);
    return () => {
      requestRef.current += 1;
    };
  }, [readProgress, retry, workoutRefreshGeneration]);

  useEffect(() => {
    if (snapshot?.freshness !== "updating" || snapshot.refresh === undefined) return;
    const attempt = automaticRefreshAttemptRef.current;
    const { automaticRefresh } = snapshot.refresh;
    if (attempt >= automaticRefresh.maxAttempts || automaticRefresh.backoffMs.length === 0) return;
    const delay = automaticRefresh.backoffMs[
      Math.min(attempt, automaticRefresh.backoffMs.length - 1)
    ]!;
    const activeRequest = requestRef.current;
    const timer = setTimeout(() => {
      if (requestRef.current !== activeRequest) return;
      automaticRefreshAttemptRef.current = attempt + 1;
      void readProgress(false).catch(() => undefined);
    }, delay);
    return () => clearTimeout(timer);
  }, [readProgress, snapshot]);

  useEffect(() => {
    if (returnFocusVersion === 0 || returnFocusToken === undefined) return;
    const exerciseMatch = /^progress:Strength:[A-Za-z0-9_]+:exercise:([A-Za-z0-9._:-]{1,128})$/u.exec(returnFocusToken);
    const recommendationMatch = /^progress:Strength:[A-Za-z0-9_]+:recommendation:([A-Za-z0-9._:-]{1,128})$/u.exec(returnFocusToken);
    const runningSourceMatch = /^running-history:\d+:([A-Za-z0-9._:-]{1,128}):(\d+)$/u.exec(returnFocusToken);
    const target = returnActionRefs.current.get(returnFocusToken) ?? (exerciseMatch === null
      ? recommendationMatch !== null
        ? recommendationSourceRefs.current.get(recommendationMatch[1]!) ?? null
        : runningSourceMatch !== null
          ? runningSourceActionRefs.current.get(`${runningSourceMatch[1]}:${runningSourceMatch[2]}`) ?? null
          : returnFocusToken.startsWith("running-target:")
            ? targetTriggerRefs.current.get(Number(returnFocusToken.split(":").at(-1))) ?? null
            : returnFocusToken.startsWith("running-history:")
              ? historyTriggerRef.current
              : null
      : exerciseActionRefs.current.get(exerciseMatch[1]!) ?? null);
    requestAnimationFrame(() => target?.focus?.());
  }, [returnFocusToken, returnFocusVersion]);

  const closeLocalSurfaces = () => {
    setHistoryGoal(null);
    setTargetDistanceMeters(null);
    setProgressSettingsVisible(false);
    setBodyweightVisible(false);
    setBodyweightEditor(null);
  };

  const openBodyweight = async (invoker: "body_metrics" | "settings") => {
    if (progressBodyweightRuntime === undefined) return;
    const entries = await progressBodyweightRuntime.loadHistory();
    setBodyweightEntries(entries);
    setProgressSettingsVisible(false);
    setBodyweightInvoker(invoker);
    setBodyweightEditor(null);
    setBodyweightVisible(true);
  };

  const decideRecommendation = async (
    recommendation: ProgressRecommendationReview,
    decision: "use_target" | "keep_current_target",
  ) => {
    if (progressRecommendationRuntime === undefined) throw new Error("progress_recommendation_runtime_unavailable");
    const result = await progressRecommendationRuntime.decide(recommendation, decision);
    const readBack = await readProgress(false);
    if (readBack === null) throw new Error("progress_recommendation_readback_obsolete");
    const committed = readBack.projection?.recommendations.find(({ id }) => id === recommendation.id);
    if (result.status === "superseded" || committed?.lifecycle === "superseded") {
      setStaleRecommendation(recommendation);
      return result;
    }
    const expectedLifecycle = decision === "use_target" ? "accepted" : "rejected";
    if (committed?.lifecycle !== expectedLifecycle) {
      throw new Error("progress_recommendation_readback_missing");
    }
    setStaleRecommendation(null);
    semanticToast?.enqueue({
      message: decision === "use_target"
        ? `${recommendation.exerciseName} target updated to ${recommendationTargetText(recommendation.proposedTarget)}.`
        : `Current ${recommendation.exerciseName} target kept.`,
    });
    return result;
  };

  const header = <>
    <ScreenHeader {...(headingRef === undefined ? {} : { ref: headingRef as React.Ref<View> })} action={<IconAction accessibilityHint="Opens App Settings" accessibilityLabel="Open App Settings" icon="settings" nativeID={settingsActionNativeID} onPress={onOpenSettings} ref={settingsActionRef as React.Ref<View>} />} title="Progress" />
    {progressBodyweightRuntime === undefined ? null : <View style={styles.supplementaryActions}>
      <FocusablePressable accessibilityLabel="Body metrics" accessibilityRole="button" focusable onPress={() => { closeLocalSurfaces(); void openBodyweight("body_metrics"); }} ref={bodyMetricsTriggerRef} style={styles.supplementaryAction}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>Body metrics</Text></FocusablePressable>
      <FocusablePressable accessibilityLabel="Settings" accessibilityRole="button" focusable onPress={() => { closeLocalSurfaces(); setProgressSettingsVisible(true); }} ref={progressSettingsTriggerRef} style={styles.supplementaryAction}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>Settings</Text></FocusablePressable>
    </View>}
    <SegmentedControls<ProgressSport> label="Progress sport" onChange={(next) => { closeLocalSurfaces(); setSport(next); }} role="tab" selected={sport} values={SPORTS} />
    <SegmentedControls<ProgressPeriod> label="Progress range" onChange={(next) => { closeLocalSurfaces(); setPeriod(next); }} role="button" selected={period} values={PERIODS} />
  </>;
  const retryAction = <PrimaryAction label="Refresh progress" onPress={() => setRetry((current) => current + 1)} />;
  const rangeLabel = PERIODS.find(({ value }) => value === period)?.label ?? period;
  let content: React.ReactNode;
  if (failed) content = <EmptyState body="Your saved workouts and targets were not changed. Retry loading progress." heading="Progress could not be loaded" primaryAction={<PrimaryAction label="Retry loading progress" onPress={() => setRetry((current) => current + 1)} />} />;
  else if (snapshot === null) content = <View accessibilityLabel="Loading progress" accessibilityRole="progressbar" style={styles.content}><SkeletonBlock height={180} testID="progress-skeleton" /></View>;
  else if (snapshot.freshness !== "current" || snapshot.dashboard === null || snapshot.dashboard === undefined) content = <View style={styles.content}><InlineNotice body={rebuildText(snapshot.diagnostic)} heading="Updating progress" tone="neutral" />{retryAction}</View>;
  else if (snapshot.dashboard.sport === "Running") {
    const runningDashboard = snapshot.dashboard;
    content = <RunningRoot
      dashboard={runningDashboard}
      historyTriggerRef={historyTriggerRef}
      onOpenHistory={(goal) => { setTargetDistanceMeters(null); setHistoryGoal(goal); }}
      onOpenTarget={(distanceMeters) => { setHistoryGoal(null); setTargetDistanceMeters(distanceMeters); }}
      onRetry={() => setRetry((current) => current + 1)}
      rangeLabel={rangeLabel}
      stackHeroFacts={stackHeroFacts}
      targetSources={runningTargetRuntime === undefined ? [] : snapshot.runningTargetSources ?? []}
      targetTriggerRefs={targetTriggerRefs}
    />;
  } else content = <DashboardContent
    dashboard={snapshot.dashboard}
    exerciseActionRefs={exerciseActionRefs}
    {...(progressRecommendationRuntime === undefined ? {} : { onDecideRecommendation: decideRecommendation })}
    onOpenExercise={onOpenExercise}
    onOpenSession={onOpenSession}
    onRetry={() => setRetry((current) => current + 1)}
    onSelectSport={(next) => { closeLocalSurfaces(); setSport(next); }}
    period={period}
    rangeLabel={rangeLabel}
    recommendationSourceRefs={recommendationSourceRefs}
    recommendations={snapshot.projection?.recommendations ?? []}
    returnActionRefs={returnActionRefs}
    stackHeroFacts={stackHeroFacts}
    staleRecommendation={staleRecommendation}
  />;

  const targetSources = targetDistanceMeters === null
    ? []
    : (snapshot?.runningTargetSources ?? []);

  return <>
    <AdaptiveScreen
      {...adaptiveWidth}
      onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => { scrollOffsetRef.current = event.nativeEvent.contentOffset.y; }}
      primary={<View style={styles.screen}>{header}{content}</View>}
      scrollOffset={scrollOffsetRef.current}
      {...(returnFocusVersion === 0 ? {} : { scrollRestoreKey: `${returnFocusToken ?? "progress"}:${returnFocusVersion}` })}
      testID="progress-screen"
    />
    <RunningHistorySheet
      goal={historyGoal}
      onClose={() => setHistoryGoal(null)}
      registerSourceAction={(source, node) => {
        if (!("activityId" in source)) return;
        const key = `${source.activityId}:${source.sourceRevision}`;
        if (node === null) runningSourceActionRefs.current.delete(key);
        else runningSourceActionRefs.current.set(key, node);
      }}
      {...(onOpenRunningSource === undefined ? {} : {
        onOpenSource: (source: FactualHistorySource) => {
          if (!("activityId" in source)) return;
          onOpenRunningSource(
            source,
            `running-history:${historyGoal?.distanceMeters ?? 0}:${source.activityId}:${source.sourceRevision}`,
          );
        },
      })}
      rangeLabel={rangeLabel}
      restoreFocusRef={historyTriggerRef}
      visible={historyGoal !== null}
    />
    {runningTargetRuntime === undefined ? null : <RunningTargetSheet
      initialDistanceMeters={targetDistanceMeters ?? 2_400}
      key={`running-target-${targetDistanceMeters ?? "closed"}`}
      onClose={() => setTargetDistanceMeters(null)}
      onSaved={async (saved) => {
        const readBack = await readProgress(false);
        const targetSource = readBack?.runningTargetSources?.find(({ id }) => id === saved.id);
        const savedTarget = runningTargetForDistance(saved, targetDistanceMeters ?? 2_400);
        const sourceTarget = targetSource === undefined
          ? undefined
          : runningTargetForDistance(targetSource, targetDistanceMeters ?? 2_400);
        if (readBack === null
          || targetSource === undefined
          || targetSource.revision !== saved.revision
          || savedTarget === undefined
          || sourceTarget?.revision !== savedTarget.revision) {
          throw new Error("running_target_root_readback_obsolete");
        }
        semanticToast?.enqueue({ message: `${distanceLabel(savedTarget.goalDistanceMeters)} target saved.` });
      }}
      restoreFocusRef={{ current: targetDistanceMeters === null ? null : targetTriggerRefs.current.get(targetDistanceMeters) ?? null }}
      runtime={runningTargetRuntime}
      sources={targetSources}
      todayLocalDate={nowLocalDate}
      visible={targetDistanceMeters !== null && targetSources.length > 0}
    />}
    <ProgressSettingsSheet
      bodyweightActionRef={bodyweightSettingsActionRef}
      onClose={() => setProgressSettingsVisible(false)}
      onOpenBodyweightHistory={() => { void openBodyweight("settings"); }}
      restoreFocusRef={progressSettingsTriggerRef}
      visible={progressSettingsVisible}
    />
    {progressBodyweightRuntime === undefined ? null : <BodyweightHistorySheet
      editorRestoreFocusRef={bodyweightEditorRestoreFocusRef}
      entries={bodyweightEntries}
      onAdd={() => {
        bodyweightRequestRef.current = progressBodyweightRuntime.createId("bodyweight-save");
        setBodyweightVisible(false);
        setBodyweightEditor({ mode: "add" });
      }}
      onClose={() => {
        setBodyweightVisible(false);
        if (bodyweightInvoker === "settings") setProgressSettingsVisible(true);
      }}
      onDelete={async (entry) => {
        const requestId = bodyweightDeleteRequestsRef.current.get(entry.entryId)
          ?? progressBodyweightRuntime.createId("bodyweight-delete");
        bodyweightDeleteRequestsRef.current.set(entry.entryId, requestId);
        const entries = await progressBodyweightRuntime.delete(entry, requestId);
        bodyweightDeleteRequestsRef.current.delete(entry.entryId);
        setBodyweightEntries(entries);
        semanticToast?.enqueue({ message: "Bodyweight entry deleted." });
        return entries;
      }}
      onEdit={(entry) => {
        bodyweightRequestRef.current = progressBodyweightRuntime.createId("bodyweight-save");
        setBodyweightVisible(false);
        setBodyweightEditor({ mode: "edit", entry });
      }}
      restoreFocusRef={bodyweightInvoker === "settings" ? bodyweightSettingsActionRef : bodyMetricsTriggerRef}
      visible={bodyweightVisible}
    />}
    {progressBodyweightRuntime === undefined ? null : <BodyweightEditorSheet
      expectedRevision={bodyweightEditor?.entry?.revision ?? 0}
      {...(bodyweightEditor?.entry === undefined ? {} : {
        initialGrams: bodyweightEditor.entry.grams,
        initialLocalDate: bodyweightEditor.entry.localDate,
      })}
      mode={bodyweightEditor?.mode ?? "add"}
      onClose={() => { bodyweightRequestRef.current = null; setBodyweightEditor(null); setBodyweightVisible(true); }}
      onSave={async (input) => {
        const requestId = bodyweightRequestRef.current ?? progressBodyweightRuntime.createId("bodyweight-save");
        bodyweightRequestRef.current = requestId;
        const entries = await progressBodyweightRuntime.save({
          ...input,
          entryId: bodyweightEditor?.entry?.entryId ?? progressBodyweightRuntime.createId("bodyweight-entry"),
          requestId,
        });
        bodyweightRequestRef.current = null;
        setBodyweightEntries(entries);
        setBodyweightEditor(null);
        setBodyweightVisible(true);
        semanticToast?.enqueue({ message: "Bodyweight entry saved." });
      }}
      restoreFocusRef={bodyweightEditorRestoreFocusRef}
      todayLocalDate={nowLocalDate}
      visible={bodyweightEditor !== null}
    />}
  </>;
}

const styles = StyleSheet.create({
  content: { gap: space[4] },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  factCell: { flex: 1, justifyContent: "center", minHeight: sizes.minimumTarget, paddingHorizontal: space[2], paddingVertical: space[2] },
  factCellRowDivider: { borderLeftWidth: 1 },
  factCellStackedDivider: { borderLeftWidth: 0, borderTopWidth: 1 },
  factRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row" },
  factRowStacked: { flexDirection: "column" },
  goalAction: { borderRadius: radius.standard, borderWidth: StyleSheet.hairlineWidth, gap: space[1], minHeight: sizes.minimumTarget, padding: space[2] },
  goalRows: { gap: space[2] },
  hero: { borderTopWidth: 2, gap: space[2], marginTop: 18, paddingTop: space[4] },
  pacing: { gap: space[1] },
  screen: { gap: space[4], maxWidth: 960, width: "100%" },
  segment: { alignItems: "center", borderRadius: radius.emphasized, borderWidth: StyleSheet.hairlineWidth, flex: 1, justifyContent: "center", minHeight: sizes.minimumTarget, paddingHorizontal: space[1] },
  segmented: { flexDirection: "row", gap: 3 },
  supplementaryAction: { alignItems: "center", justifyContent: "center", minHeight: sizes.minimumTarget, paddingHorizontal: space[2] },
  supplementaryActions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});

import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type TextStyle } from "react-native";

import type { ProgressPeriod, ProgressPeriodProjection, ProgressProjectionDiagnostic, ProgressProjectionFreshness, ProgressRecommendationReview } from "../../domains/progress";
import type { ProgressDashboardProjection, ProgressRunningGoal, ProgressSport } from "../../domains/progress/contracts";
import type { RunningPlanAggregate } from "../../domains/running/contracts";
import type { RunningPlanRuntimePort } from "../../bootstrap/runningPlanRuntime";
import type { ProgressBodyweightEntry, ProgressBodyweightSaveInput } from "../../bootstrap/workoutAppRuntime";
import { EmptyState, FocusablePressable, IconAction, InlineNotice, PrimaryAction, ScreenHeader, SkeletonBlock } from "../components";
import { BodyweightEditorSheet } from "../components/BodyweightEditorSheet";
import { BodyweightHistorySheet } from "../components/BodyweightHistorySheet";
import { ProgressSettingsSheet } from "../components/ProgressSettingsSheet";
import { RecommendationSurface, recommendationTargetText } from "../components/RecommendationSurface";
import { RunningHistorySheet } from "../components/RunningHistorySheet";
import { RunningTargetSheet } from "../components/RunningTargetSheet";
import type { FactualHistorySource } from "../components/FactualHistoryChart";
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
  runningTargetSources?: readonly RunningPlanAggregate[];
}>;

export type ProgressScreenProps = Readonly<{
  nowLocalDate: string;
  workoutRefreshGeneration?: number;
  loadProgress(input: Readonly<{ sport: ProgressSport; period: ProgressPeriod; nowLocalDate: string }>): Promise<ProgressSnapshot>;
  onOpenExercise(exerciseId: string, exerciseName: string, returnFocusToken?: string): void;
  onOpenSession(sessionId: string, returnFocusToken?: string): void;
  onOpenRunningSource?(source: FactualHistorySource, returnFocusToken: string): void;
  onOpenSettings?(): void;
  runningTargetRuntime?: Pick<RunningPlanRuntimePort, "createId" | "loadPlan" | "saveRunningTarget">;
  progressRecommendationRuntime?: Readonly<{
    decide(recommendation: ProgressRecommendationReview, decision: "use_target" | "keep_current_target"): Promise<unknown>;
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

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function runningGap(goal: ProgressRunningGoal): string {
  if (goal.target === null) return "Gap · Target unset";
  const difference = goal.target.durationSeconds - goal.best.durationSeconds;
  if (difference === 0) return "Gap · At target";
  const amount = `${Math.abs(difference)} ${Math.abs(difference) === 1 ? "second" : "seconds"}`;
  return difference > 0 ? `Gap · ${amount} ahead of target` : `Gap · ${amount} behind target`;
}

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

function RunningRoot({ dashboard, historyTriggerRef, onOpenHistory, onOpenTarget, onRetry, targetSources, targetTriggerRefs }: Readonly<{
  dashboard: Extract<ProgressDashboardProjection, { sport: "Running" }>;
  historyTriggerRef: React.RefObject<View | null>;
  onOpenHistory(goal: ProgressRunningGoal): void;
  onOpenTarget(distanceMeters: number): void;
  onRetry(): void;
  targetSources: readonly RunningPlanAggregate[];
  targetTriggerRefs: React.MutableRefObject<Map<number, View>>;
}>) {
  const { colors } = useAppTheme();
  const goalRow = (distanceMeters: number) => {
    const label = distanceLabel(distanceMeters);
    const source = targetSources.find(({ goal: sourceGoal }) => sourceGoal.goalDistanceMeters === distanceMeters);
    const effort = dashboard.goals.find((candidate) => candidate.distanceMeters === distanceMeters);
    const target = source?.goal.targetDurationMs === undefined
      ? "Target unset"
      : formatDuration(source.goal.targetDurationMs / 1_000);
    const evidence = effort === undefined
      ? "No effort recorded"
      : `Best ${formatDuration(effort.best.durationSeconds)}`;
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
    <InlineNotice body="Running facts and best efforts come from accepted imported Garmin activities." heading="Imported activity evidence" tone="neutral" />
    <EmptyState body="Import or accept a 2.4 km effort to establish a benchmark. No zero result is shown." heading="No 2.4 km effort recorded" primaryAction={<PrimaryAction label="Refresh progress" onPress={onRetry} />} />
    <View style={styles.goalRows}><Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Running goals</Text>{goalRow(10_000)}{goalRow(21_097)}</View>
  </View>;
  const target = goal.target === null ? "Target unset" : formatDuration(goal.target.durationSeconds);
  const pace = goal.target === null || goal.distanceMeters !== 2400 ? null : Math.round(goal.target.durationSeconds / 2.4);
  return (
    <View style={styles.content}>
      <InlineNotice body="Running facts and best efforts come from accepted imported Garmin activities." heading="Imported activity evidence" tone="neutral" />
      <View style={[styles.hero, { borderTopColor: colors.textPrimary }]}>
        <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>2.4 km goal</Text>
        <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Best efforts compare elapsed time at the same distance. Faster is lower on the clock.</Text>
        <View style={[styles.factRow, { borderColor: colors.divider }]}>
          <Text style={[typeScale.targetValue as TextStyle, { color: colors.textPrimary }]}>{`Latest · ${formatDuration(goal.latest.durationSeconds)} elapsed`}</Text>
          <Text style={[typeScale.targetValue as TextStyle, { color: colors.textPrimary }]}>{`Best · ${formatDuration(goal.best.durationSeconds)} elapsed`}</Text>
          <Text style={[typeScale.targetValue as TextStyle, { color: colors.textPrimary }]}>{`Target · ${target}`}</Text>
        </View>
        <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{runningGap(goal)}</Text>
        {pace === null ? null : <View style={styles.pacing}>
          <Text style={[typeScale.targetValue as TextStyle, { color: colors.textPrimary }]}>{`Pace · ${formatDuration(pace)}/km`}</Text>
          <Text style={[typeScale.targetValue as TextStyle, { color: colors.textPrimary }]}>{`400 m · ${formatDuration(Math.round(goal.target!.durationSeconds / 6))}`}</Text>
          <Text style={[typeScale.targetValue as TextStyle, { color: colors.textPrimary }]}>{`200 m · ${formatDuration(Math.round(goal.target!.durationSeconds / 12))}`}</Text>
        </View>}
        <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{`Evidence · ${goal.evidenceCount} accepted imported ${goal.evidenceCount === 1 ? "activity" : "activities"}`}</Text>
        <View style={styles.actions}>
          <FocusablePressable accessibilityLabel={`Open history for ${distanceLabel(goal.distanceMeters)}`} accessibilityRole="button" focusable onPress={() => onOpenHistory(goal)} ref={historyTriggerRef} style={[styles.goalAction, { borderColor: colors.focusRing }]}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.focusRing }]}>Open history</Text></FocusablePressable>
          {targetSources.some(({ goal: sourceGoal }) => sourceGoal.goalDistanceMeters === goal.distanceMeters) ? <FocusablePressable accessibilityLabel={`Set target for ${distanceLabel(goal.distanceMeters)}`} accessibilityRole="button" focusable onPress={() => onOpenTarget(goal.distanceMeters)} ref={(node) => { if (node === null) targetTriggerRefs.current.delete(goal.distanceMeters); else targetTriggerRefs.current.set(goal.distanceMeters, node); }} style={[styles.goalAction, { borderColor: colors.focusRing }]}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.focusRing }]}>Set target</Text></FocusablePressable> : null}
        </View>
      </View>
      <View style={styles.goalRows}>
        <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Running goals</Text>
        {goalRow(10_000)}
        {goalRow(21_097)}
      </View>
    </View>
  );
}

function DashboardContent({ dashboard, exerciseActionRefs, onDecideRecommendation, onOpenExercise, onOpenSession, onRetry, onSelectSport, period, recommendations }: Readonly<{
  dashboard: Exclude<ProgressDashboardProjection, { sport: "Running" }>;
  exerciseActionRefs: React.MutableRefObject<Map<string, View>>;
  onDecideRecommendation?: ((recommendation: ProgressRecommendationReview, decision: "use_target" | "keep_current_target") => Promise<unknown>) | undefined;
  onOpenExercise(exerciseId: string, exerciseName: string, returnFocusToken?: string): void;
  onOpenSession(sessionId: string, returnFocusToken?: string): void;
  onRetry(): void;
  onSelectSport(sport: ProgressSport): void;
  period: ProgressPeriod;
  recommendations: readonly ProgressRecommendationReview[];
}>) {
  const { colors } = useAppTheme();
  if (dashboard.state === "empty") {
    return <EmptyState body="Completed, accepted source facts appear here when they establish a comparable goal. Missing facts are not shown as zero." heading="No progress history yet" primaryAction={<PrimaryAction label="Refresh progress" onPress={onRetry} />} />;
  }
  if (dashboard.state === "sparse" || dashboard.state === "more_data_needed") {
    return <View style={styles.content}><InlineNotice body="One factual result is available, but more comparable evidence is needed before a trend or gap is shown." heading="More data needed" tone="attention" /><PrimaryAction label="Refresh progress" onPress={onRetry} /></View>;
  }
  if (dashboard.state === "unavailable") {
    return <InlineNotice body="The requested progress facts are unavailable. Reload to try again." heading="Progress is temporarily unavailable" tone="error" />;
  }
  if (dashboard.sport === "All") {
    const primaryGoal = dashboard.primaryGoal;
    if (primaryGoal === null) return <EmptyState body="Add a persisted goal and comparable completed history to show the nearest active goal." heading="No active goal yet" primaryAction={<PrimaryAction label="Refresh progress" onPress={onRetry} />} />;
    const target = primaryGoal.targetDurationSeconds === null ? "Target unset" : formatDuration(primaryGoal.targetDurationSeconds);
    return <View style={styles.content}><View style={[styles.hero, { borderTopColor: colors.textPrimary }]}><Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Nearest active goal</Text><Text style={[typeScale.targetValue as TextStyle, { color: colors.textPrimary }]}>{`${primaryGoal.sport} · Target · ${target}`}</Text><Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>More data needed before Latest, Best, and Gap are comparable.</Text><FocusablePressable accessibilityLabel={`Open ${primaryGoal.sport} goal`} accessibilityRole="button" focusable onPress={() => onSelectSport(primaryGoal.sport)} style={[styles.goalAction, { borderColor: colors.divider }]}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{`Open ${primaryGoal.sport} goal`}</Text></FocusablePressable></View></View>;
  }
  return <View style={styles.content}>
    <View style={[styles.hero, { borderTopColor: colors.textPrimary }]}><Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Strength progress</Text><Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>{`${dashboard.facts.length} comparable completed ${dashboard.facts.length === 1 ? "fact" : "facts"} in this range.`}</Text><Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Targets and gaps appear only for compatible saved metrics.</Text></View>
    {recommendations.length === 0 ? null : <View style={styles.goalRows}>
      <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Needs review</Text>
      {recommendations.map((recommendation) => <RecommendationSurface
        key={recommendation.id}
        recommendation={recommendation}
        onAccept={() => onDecideRecommendation?.(recommendation, "use_target")}
        onKeepCurrent={() => onDecideRecommendation?.(recommendation, "keep_current_target")}
        onOpenSource={(sessionId) => onOpenSession(sessionId, `progress:Strength:${period}:recommendation:${recommendation.id}`)}
      />)}
    </View>}
    <View style={styles.goalRows}>
      <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Exercise progress</Text>
      {dashboard.facts.map((fact) => <FocusablePressable accessibilityLabel={`Open exercise history for ${fact.exerciseName}`} accessibilityRole="button" focusable key={`${fact.exerciseId}:${fact.setId}`} onPress={() => onOpenExercise(fact.exerciseId, fact.exerciseName, `progress:Strength:${period}:exercise:${fact.exerciseId}`)} ref={(node) => { if (node === null) exerciseActionRefs.current.delete(fact.exerciseId); else exerciseActionRefs.current.set(fact.exerciseId, node); }} style={[styles.goalAction, { borderColor: colors.divider }]}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{fact.exerciseName}</Text><Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Target unavailable</Text></FocusablePressable>)}
    </View>
  </View>;
}

export function ProgressScreen({ nowLocalDate, workoutRefreshGeneration = 0, loadProgress, onOpenExercise, onOpenSession, onOpenRunningSource, onOpenSettings = () => undefined, runningTargetRuntime, progressRecommendationRuntime, progressBodyweightRuntime, returnFocusToken, returnFocusVersion = 0, width, headingRef, settingsActionRef, settingsActionNativeID }: ProgressScreenProps) {
  const { colors } = useAppTheme();
  const [sport, setSport] = useState<ProgressSport>("All");
  const [period, setPeriod] = useState<ProgressPeriod>("4_weeks");
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const requestRef = useRef(0);
  const historyTriggerRef = useRef<View>(null);
  const targetTriggerRefs = useRef(new Map<number, View>());
  const bodyMetricsTriggerRef = useRef<View>(null);
  const progressSettingsTriggerRef = useRef<View>(null);
  const bodyweightSettingsActionRef = useRef<View>(null);
  const bodyweightEditorRestoreFocusRef = useRef<View>(null);
  const exerciseActionRefs = useRef(new Map<string, View>());
  const scrollOffsetRef = useRef(0);
  const [historyGoal, setHistoryGoal] = useState<ProgressRunningGoal | null>(null);
  const [targetDistanceMeters, setTargetDistanceMeters] = useState<number | null>(null);
  const [progressSettingsVisible, setProgressSettingsVisible] = useState(false);
  const [bodyweightVisible, setBodyweightVisible] = useState(false);
  const [bodyweightEntries, setBodyweightEntries] = useState<readonly ProgressBodyweightEntry[]>([]);
  const [bodyweightEditor, setBodyweightEditor] = useState<Readonly<{ mode: "add" | "edit"; entry?: ProgressBodyweightEntry }> | null>(null);
  const bodyweightRequestRef = useRef<string | null>(null);
  const bodyweightDeleteRequestsRef = useRef(new Map<string, string>());
  const semanticToast = useOptionalSemanticToast();
  const adaptiveWidth = width === undefined ? {} : { width };

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
    void readProgress(true).catch(() => undefined);
  }, [readProgress, retry, workoutRefreshGeneration]);

  useEffect(() => {
    if (returnFocusVersion === 0 || returnFocusToken === undefined) return;
    const exerciseMatch = /^progress:Strength:[A-Za-z0-9_]+:exercise:([A-Za-z0-9._:-]{1,128})$/u.exec(returnFocusToken);
    const target = exerciseMatch === null
      ? returnFocusToken.startsWith("running-target:")
        ? targetTriggerRefs.current.get(Number(returnFocusToken.split(":").at(-1))) ?? null
        : returnFocusToken.startsWith("running-history:")
          ? historyTriggerRef.current
          : null
      : exerciseActionRefs.current.get(exerciseMatch[1]!) ?? null;
    requestAnimationFrame(() => target?.focus?.());
  }, [returnFocusToken, returnFocusVersion]);

  const closeLocalSurfaces = () => {
    setHistoryGoal(null);
    setTargetDistanceMeters(null);
    setProgressSettingsVisible(false);
    setBodyweightVisible(false);
    setBodyweightEditor(null);
  };

  const openBodyweight = async () => {
    if (progressBodyweightRuntime === undefined) return;
    const entries = await progressBodyweightRuntime.loadHistory();
    setBodyweightEntries(entries);
    setProgressSettingsVisible(false);
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
      <FocusablePressable accessibilityLabel="Body metrics" accessibilityRole="button" focusable onPress={() => { closeLocalSurfaces(); void openBodyweight(); }} ref={bodyMetricsTriggerRef} style={styles.supplementaryAction}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>Body metrics</Text></FocusablePressable>
      <FocusablePressable accessibilityLabel="Settings" accessibilityRole="button" focusable onPress={() => { closeLocalSurfaces(); setProgressSettingsVisible(true); }} ref={progressSettingsTriggerRef} style={styles.supplementaryAction}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>Settings</Text></FocusablePressable>
    </View>}
    <SegmentedControls<ProgressSport> label="Progress sport" onChange={(next) => { closeLocalSurfaces(); setSport(next); }} role="tab" selected={sport} values={SPORTS} />
    <SegmentedControls<ProgressPeriod> label="Progress range" onChange={(next) => { closeLocalSurfaces(); setPeriod(next); }} role="button" selected={period} values={PERIODS} />
  </>;
  const retryAction = <PrimaryAction label="Refresh progress" onPress={() => setRetry((current) => current + 1)} />;
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
    recommendations={snapshot.projection?.recommendations ?? []}
  />;

  const rangeLabel = PERIODS.find(({ value }) => value === period)?.label ?? period;
  const targetSources = targetDistanceMeters === null
    ? []
    : (snapshot?.runningTargetSources ?? []).filter(({ goal }) => goal.goalDistanceMeters === targetDistanceMeters);

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
      {...(onOpenRunningSource === undefined ? {} : {
        onOpenSource: (source: FactualHistorySource) => onOpenRunningSource(
          source,
          `running-history:${historyGoal?.distanceMeters ?? 0}`,
        ),
      })}
      rangeLabel={rangeLabel}
      restoreFocusRef={historyTriggerRef}
      visible={historyGoal !== null}
    />
    {runningTargetRuntime === undefined ? null : <RunningTargetSheet
      key={`running-target-${targetDistanceMeters ?? "closed"}`}
      onClose={() => setTargetDistanceMeters(null)}
      onSaved={async (saved) => {
        await readProgress(false);
        semanticToast?.enqueue({ message: `${distanceLabel(saved.goal.goalDistanceMeters)} target saved.` });
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
      onOpenBodyweightHistory={() => { void openBodyweight(); }}
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
      onClose={() => setBodyweightVisible(false)}
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
      restoreFocusRef={bodyMetricsTriggerRef}
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
  factRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth, gap: space[2], paddingVertical: space[2] },
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

import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import type { ProgressPeriod, ProgressProjectionDiagnostic, ProgressProjectionFreshness } from "../../domains/progress";
import type { ProgressDashboardProjection, ProgressRunningGoal, ProgressSport } from "../../domains/progress/contracts";
import { EmptyState, FocusablePressable, IconAction, InlineNotice, PrimaryAction, ScreenHeader, SkeletonBlock } from "../components";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import type { RootFocusTarget } from "../shell/rootFocus";
import { radius, sizes, space, typeScale, useAppTheme } from "../theme";

type ProgressSnapshot = Readonly<{
  period: ProgressPeriod;
  freshness: ProgressProjectionFreshness;
  sport?: ProgressSport;
  dashboard?: ProgressDashboardProjection | null;
  diagnostic?: ProgressProjectionDiagnostic;
}>;

export type ProgressScreenProps = Readonly<{
  nowLocalDate: string;
  workoutRefreshGeneration?: number;
  loadProgress(input: Readonly<{ sport: ProgressSport; period: ProgressPeriod; nowLocalDate: string }>): Promise<ProgressSnapshot>;
  onOpenExercise(exerciseId: string, exerciseName: string): void;
  onOpenSession(sessionId: string): void;
  onOpenSettings?(): void;
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
  const move = (index: number, key: string) => {
    const next = key === "Home" ? 0 : key === "End" ? values.length - 1 : key === "ArrowLeft" ? Math.max(0, index - 1) : key === "ArrowRight" ? Math.min(values.length - 1, index + 1) : index;
    if (next !== index || key === "Home" || key === "End") onChange(values[next]!.value);
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
              }
            } } as object)}
            accessibilityLabel={item.label}
            accessibilityRole={role}
            accessibilityState={role === "tab" ? { selected: isSelected } : { selected: isSelected, checked: isSelected }}
            focusable
            key={item.value}
            onPress={() => onChange(item.value)}
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

function RunningRoot({ dashboard, onRetry }: Readonly<{ dashboard: Extract<ProgressDashboardProjection, { sport: "Running" }>; onRetry(): void }>) {
  const { colors } = useAppTheme();
  const goal = dashboard.goals.find((candidate) => candidate.distanceMeters === 2400) ?? dashboard.goals[0];
  if (goal === undefined) return <View style={styles.content}>
    <InlineNotice body="Running facts and best efforts come from accepted imported Garmin activities." heading="Imported activity evidence" tone="neutral" />
    <EmptyState body="Import or accept a 2.4 km effort to establish a benchmark. No zero result is shown." heading="No 2.4 km effort recorded" primaryAction={<PrimaryAction label="Refresh progress" onPress={onRetry} />} />
    <View style={styles.goalRows}><Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Running goals</Text><Text style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>10 km · Target unset · No effort recorded · Set target</Text><Text style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>Half Marathon · Target unset · No effort recorded · Set target</Text></View>
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
      </View>
      <View style={styles.goalRows}>
        <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Running goals</Text>
        <Text style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>10 km · Target unset · No effort recorded · Set target</Text>
        <Text style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>Half Marathon · Target unset · No effort recorded · Set target</Text>
      </View>
    </View>
  );
}

function DashboardContent({ dashboard, onRetry, onOpenExercise, onSelectSport }: Readonly<{ dashboard: ProgressDashboardProjection; onRetry(): void; onOpenExercise(exerciseId: string, exerciseName: string): void; onSelectSport(sport: ProgressSport): void }>) {
  const { colors } = useAppTheme();
  if (dashboard.sport === "Running") return <RunningRoot dashboard={dashboard} onRetry={onRetry} />;
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
  return <View style={styles.content}><View style={[styles.hero, { borderTopColor: colors.textPrimary }]}><Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Strength progress</Text><Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>{`${dashboard.facts.length} comparable completed ${dashboard.facts.length === 1 ? "fact" : "facts"} in this range.`}</Text><Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Targets and gaps appear only for compatible saved metrics.</Text></View>{dashboard.facts.map((fact) => <FocusablePressable accessibilityLabel={`Open exercise history for ${fact.exerciseName}`} accessibilityRole="button" focusable key={`${fact.exerciseId}:${fact.setId}`} onPress={() => onOpenExercise(fact.exerciseId, fact.exerciseName)} style={[styles.goalAction, { borderColor: colors.divider }]}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{fact.exerciseName}</Text><Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Target unavailable</Text></FocusablePressable>)}</View>;
}

export function ProgressScreen({ nowLocalDate, workoutRefreshGeneration = 0, loadProgress, onOpenExercise, onOpenSettings = () => undefined, width, headingRef, settingsActionRef, settingsActionNativeID }: ProgressScreenProps) {
  const [sport, setSport] = useState<ProgressSport>("All");
  const [period, setPeriod] = useState<ProgressPeriod>("4_weeks");
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const requestRef = useRef(0);
  const adaptiveWidth = width === undefined ? {} : { width };

  useEffect(() => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    setSnapshot(null);
    setFailed(false);
    void loadProgress({ sport, period, nowLocalDate }).then((next) => {
      if (request !== requestRef.current || (next.dashboard !== null && next.dashboard !== undefined && next.dashboard.sport !== sport)) return;
      setSnapshot(next);
    }).catch(() => {
      if (request === requestRef.current) setFailed(true);
    });
  }, [loadProgress, nowLocalDate, period, retry, sport, workoutRefreshGeneration]);

  const header = <>
    <ScreenHeader {...(headingRef === undefined ? {} : { ref: headingRef as React.Ref<View> })} action={<IconAction accessibilityHint="Opens App Settings" accessibilityLabel="Open App Settings" icon="settings" nativeID={settingsActionNativeID} onPress={onOpenSettings} ref={settingsActionRef as React.Ref<View>} />} title="Progress" />
    <SegmentedControls<ProgressSport> label="Progress sport" onChange={setSport} role="tab" selected={sport} values={SPORTS} />
    <SegmentedControls<ProgressPeriod> label="Progress range" onChange={setPeriod} role="button" selected={period} values={PERIODS} />
  </>;
  const retryAction = <PrimaryAction label="Refresh progress" onPress={() => setRetry((current) => current + 1)} />;
  let content: React.ReactNode;
  if (failed) content = <EmptyState body="Your saved workouts and targets were not changed. Retry loading progress." heading="Progress could not be loaded" primaryAction={<PrimaryAction label="Retry loading progress" onPress={() => setRetry((current) => current + 1)} />} />;
  else if (snapshot === null) content = <View accessibilityLabel="Loading progress" accessibilityRole="progressbar" style={styles.content}><SkeletonBlock height={180} testID="progress-skeleton" /></View>;
  else if (snapshot.freshness !== "current" || snapshot.dashboard === null || snapshot.dashboard === undefined) content = <View style={styles.content}><InlineNotice body={rebuildText(snapshot.diagnostic)} heading="Updating progress" tone="neutral" />{retryAction}</View>;
  else content = <DashboardContent dashboard={snapshot.dashboard} onOpenExercise={onOpenExercise} onRetry={() => setRetry((current) => current + 1)} onSelectSport={setSport} />;

  return <AdaptiveScreen {...adaptiveWidth} primary={<View style={styles.screen}>{header}{content}</View>} testID="progress-screen" />;
}

const styles = StyleSheet.create({
  content: { gap: space[4] },
  factRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth, gap: space[2], paddingVertical: space[2] },
  goalAction: { borderRadius: radius.standard, borderWidth: StyleSheet.hairlineWidth, gap: space[1], minHeight: sizes.minimumTarget, padding: space[2] },
  goalRows: { gap: space[2] },
  hero: { borderTopWidth: 2, gap: space[2], marginTop: 18, paddingTop: space[4] },
  pacing: { gap: space[1] },
  screen: { gap: space[4], maxWidth: 960, width: "100%" },
  segment: { alignItems: "center", borderRadius: radius.emphasized, borderWidth: StyleSheet.hairlineWidth, flex: 1, justifyContent: "center", minHeight: sizes.minimumTarget, paddingHorizontal: space[1] },
  segmented: { flexDirection: "row", gap: 3 },
});

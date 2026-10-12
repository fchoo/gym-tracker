import React from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import type { ProgressRunningGoal } from "../../domains/progress/contracts";
import { space, typeScale, useAppTheme } from "../theme";
import { BottomSheet, type BottomSheetProps } from "./BottomSheet";
import { FocusablePressable } from "./index";
import {
  FactualHistoryChart,
  formatFactualDuration,
  type FactualHistorySource,
  type ProgressFactualSeries,
} from "./FactualHistoryChart";

export type RunningHistoryState = "loading" | "ready" | "rebuilding" | "source_error";

export type RunningHistorySheetProps = Readonly<{
  goal: ProgressRunningGoal | null;
  onClose: () => void;
  onOpenSource?: (source: FactualHistorySource) => void;
  onRetry?: () => void;
  rangeLabel: string;
  state?: RunningHistoryState;
  visible: boolean;
  restoreFocusNativeID?: BottomSheetProps["restoreFocusNativeID"];
  restoreFocusRef?: BottomSheetProps["restoreFocusRef"];
  requestNativeFocus?: BottomSheetProps["requestNativeFocus"];
}>;

function formatDistance(distanceMeters: number): string {
  return distanceMeters === 2_400
    ? "2.4 km"
    : distanceMeters >= 1_000
      ? `${(distanceMeters / 1_000).toFixed(distanceMeters % 1_000 === 0 ? 0 : 1)} km`
      : `${distanceMeters} m`;
}

function isQualifiedEffort(effort: ProgressRunningGoal["history"][number]["effort"]): boolean {
  return effort.activityId.length > 0
    && Number.isSafeInteger(effort.sourceRevision)
    && effort.sourceRevision > 0
    && Number.isFinite(effort.durationSeconds)
    && effort.durationSeconds > 0
    && (effort.evidence === "source_summary" || effort.evidence === "source_laps");
}

/** Converts the Phase 18-qualified goal history without parsing provider payloads. */
export function runningGoalToFactualSeries(goal: ProgressRunningGoal, rangeLabel: string): ProgressFactualSeries {
  return Object.freeze({
    currentTargetSeconds: goal.target?.durationSeconds ?? null,
    distanceMeters: goal.distanceMeters,
    fasterIsLower: true,
    points: Object.freeze(goal.history.map(({ effort, targetAtDate }) => Object.freeze({
      activityId: effort.activityId,
      evidence: effort.evidence,
      localDate: effort.localDate,
      sourceRevision: effort.sourceRevision,
      status: isQualifiedEffort(effort) ? "accepted_current" as const : "unavailable" as const,
      targetAtDateSeconds: targetAtDate?.durationSeconds ?? null,
      timeBasis: effort.timeBasis,
      valueSeconds: isQualifiedEffort(effort) ? effort.durationSeconds : null,
    }))),
    rangeLabel,
    unitLabel: "elapsed time",
  });
}

function SheetFact({ label, value }: Readonly<{ label: string; value: string }>) {
  const { colors } = useAppTheme();
  return <View style={styles.fact}>
    <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{label}</Text>
    <Text style={[typeScale.screenTitle as TextStyle, { color: colors.textPrimary }]}>{value}</Text>
  </View>;
}

export function RunningHistorySheet({
  goal,
  onClose,
  onOpenSource,
  onRetry,
  rangeLabel,
  state = "ready",
  visible,
  restoreFocusNativeID,
  restoreFocusRef,
  requestNativeFocus,
}: RunningHistorySheetProps) {
  const { colors } = useAppTheme();
  const distance = formatDistance(goal?.distanceMeters ?? 2_400);
  const heading = `${distance} best efforts`;
  const series = goal === null ? null : runningGoalToFactualSeries(goal, rangeLabel);
  const body = state === "loading" ? <View accessibilityLabel="Loading progress" accessibilityLiveRegion="polite" accessibilityRole="progressbar" accessibilityState={{ busy: true, disabled: true }} style={styles.notice}><Text style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>Loading progress</Text></View>
    : state === "rebuilding" ? <View accessibilityLiveRegion="polite" style={styles.notice}><Text style={[typeScale.screenTitle as TextStyle, { color: colors.textPrimary }]}>Updating progress</Text><Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Saved history is being recalculated. Results refresh automatically.</Text></View>
      : state === "source_error" ? <View accessibilityLiveRegion="assertive" style={styles.notice}><Text style={[typeScale.screenTitle as TextStyle, { color: colors.textPrimary }]}>History could not be loaded</Text><Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Your saved history was not changed. Retry loading this history.</Text>{onRetry === undefined ? null : <FocusablePressable accessibilityLabel="Retry history" accessibilityRole="button" onPress={onRetry} style={[styles.retry, { borderColor: colors.focusRing }]}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.focusRing }]}>Retry history</Text></FocusablePressable>}</View>
        : series === null || series.points.length === 0 ? <View style={styles.notice}>{goal === null ? null : <View style={styles.heroFacts}><SheetFact label="Best" value="No effort recorded" /><SheetFact label="Target" value={goal.target === null ? "Target unset" : formatFactualDuration(goal.target.durationSeconds)} /></View>}<Text style={[typeScale.screenTitle as TextStyle, { color: colors.textPrimary }]}>No effort recorded</Text><Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Import or accept a {distance} effort to establish a benchmark. No zero result is plotted.</Text></View>
          : <View style={styles.content}>
            <View style={styles.heroFacts}>
              <SheetFact label="Best" value={formatFactualDuration(goal!.best.durationSeconds)} />
              <SheetFact label="Target" value={formatFactualDuration(goal!.target?.durationSeconds ?? null)} />
            </View>
            <FactualHistoryChart series={series} {...(onOpenSource === undefined ? {} : { onOpenSource })} />
          </View>;

  return <BottomSheet
    heading={heading}
    onCancel={onClose}
    requestNativeFocus={requestNativeFocus}
    restoreFocusNativeID={restoreFocusNativeID}
    restoreFocusRef={restoreFocusRef}
    visible={visible}
  >
    <View style={styles.container}>
      <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Best efforts compare elapsed time at the same distance. Faster is lower on the clock.</Text>
      {body}
    </View>
  </BottomSheet>;
}

const styles = StyleSheet.create({
  container: { gap: space[4] },
  content: { gap: space[4] },
  fact: { flex: 1, gap: space[1] },
  heroFacts: { flexDirection: "row", gap: space[4] },
  notice: { gap: space[2], paddingVertical: space[4] },
  retry: { alignItems: "center", alignSelf: "flex-start", borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center", minHeight: 48, paddingHorizontal: space[4] },
});

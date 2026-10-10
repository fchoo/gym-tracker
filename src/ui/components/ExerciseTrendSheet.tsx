import React from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

import type { ExerciseMetricHistory } from "../../domains/history";
import { projectComparableExerciseTrend } from "../../domains/history";
import { formatObservation } from "./SetRow";
import { BottomSheet } from "./BottomSheet";
import { space, typeScale, useAppTheme } from "../theme";

export type ExerciseTrendSheetProps = Readonly<{
  exerciseName: string;
  history: ExerciseMetricHistory | null;
  onClose(): void;
  visible: boolean;
}>;

function longDate(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return localDate;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  const { colors } = useAppTheme();
  return <View style={styles.fact}>
    <Text style={[typeScale.label as TextStyle, { color: colors.textSecondary }]}>{label}</Text>
    <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{value}</Text>
  </View>;
}

export function ExerciseTrendSheet({ exerciseName, history, onClose, visible }: ExerciseTrendSheetProps) {
  const { colors } = useAppTheme();
  const trend = history === null ? null : projectComparableExerciseTrend(history);
  const chartLabel = `${exerciseName} comparable history chart`;
  return <BottomSheet heading={`${exerciseName} trend`} onCancel={onClose} scrollTestID="exercise-trend-sheet-content" visible={visible}>
    {trend === null ? <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Not enough comparable history yet.</Text> : <View style={styles.content}>
      <View style={styles.facts}>
        <Fact label="Recent" value={formatObservation(trend.recent.observation!)} />
        <Fact label="Best" value={formatObservation(trend.best.observation!)} />
        <Fact label="Change" value={trend.previous === null ? "One comparable session recorded" : `${formatObservation(trend.previous.observation!)} → ${formatObservation(trend.recent.observation!)}`} />
      </View>
      <View accessibilityLabel={chartLabel} style={styles.chart}>
        <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Newest comparable sessions; the data table gives exact recorded results.</Text>
        <Svg accessibilityElementsHidden height={72} importantForAccessibility="no-hide-descendants" width="100%">
          <Line stroke={colors.divider} strokeWidth={1} x1="8" x2="292" y1="60" y2="60" />
          {trend.sessions.map((set, index) => <Circle cx={16 + index * 52} cy={60} fill={colors.focusRing} key={set.setId} r={5} />)}
        </Svg>
      </View>
      <View accessibilityLabel="Comparable history data" style={styles.rows}>
        {trend.sessions.map((set) => <Text key={set.setId} style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{`${longDate(set.localDate)} · ${formatObservation(set.observation!)}`}</Text>)}
      </View>
    </View>}
  </BottomSheet>;
}

const styles = StyleSheet.create({
  chart: { gap: space[2] },
  content: { gap: space[4] },
  fact: { gap: space[1] },
  facts: { gap: space[2] },
  rows: { gap: space[1] },
});

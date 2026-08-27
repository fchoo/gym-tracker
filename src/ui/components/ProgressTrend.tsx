import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type {
  ProgressTrendRow,
} from "../../domains/progress";
import {
  radius,
  space,
  typeScale,
  useAppTheme,
} from "../theme";
import {
  ContentCard,
  FocusablePressable,
  SectionHeader,
} from "./index";

type ProgressTrendProps = Readonly<{
  rows: readonly ProgressTrendRow[];
  onOpenExercise(exerciseId: string): void;
  onOpenSession(sessionId: string): void;
}>;

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

function rowText(row: ProgressTrendRow): string {
  return longDate(row.localDate)
    + " · " + row.scheduledOpportunities.completed
    + " of " + row.scheduledOpportunities.planned
    + " scheduled completed · " + row.workingSets.completed
    + " of " + row.workingSets.planned + " working sets completed";
}

function completionWidth(row: ProgressTrendRow): `${number}%` {
  const planned = row.scheduledOpportunities.planned;
  const percent = planned === 0
    ? 0
    : Math.round((row.scheduledOpportunities.completed / planned) * 100);
  return `${Math.max(0, Math.min(100, percent))}%`;
}

function SourceLinks({
  row,
  onOpenExercise,
  onOpenSession,
}: Readonly<{
  row: ProgressTrendRow;
  onOpenExercise(exerciseId: string): void;
  onOpenSession(sessionId: string): void;
}>) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.sourceLinks}>
      {row.sessionIds.map((sessionId) => (
        <FocusablePressable
          accessibilityLabel={"Open workout details for " + sessionId}
          accessibilityRole="button"
          focusable
          key={sessionId}
          onPress={() => onOpenSession(sessionId)}
          style={({ pressed }: { pressed: boolean }) => [
            styles.sourceLink,
            { borderColor: colors.contentCardBorder, opacity: pressed ? 0.76 : 1 },
          ]}
        >
          <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardText }]}>Workout details</Text>
        </FocusablePressable>
      ))}
      {row.exerciseIds.map((exerciseId) => (
        <FocusablePressable
          accessibilityLabel={"Open exercise history for " + exerciseId}
          accessibilityRole="button"
          focusable
          key={exerciseId}
          onPress={() => onOpenExercise(exerciseId)}
          style={({ pressed }: { pressed: boolean }) => [
            styles.sourceLink,
            { borderColor: colors.contentCardBorder, opacity: pressed ? 0.76 : 1 },
          ]}
        >
          <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardText }]}>Exercise history</Text>
        </FocusablePressable>
      ))}
    </View>
  );
}

export function ProgressTrend({
  rows,
  onOpenExercise,
  onOpenSession,
}: ProgressTrendProps) {
  const { colors } = useAppTheme();
  return (
    <ContentCard testID="progress-consistency-card">
      <SectionHeader
        supportingText={rows.length === 0
          ? "More comparable working sets are needed before a change is shown."
          : "Scheduled opportunities and completed working sets by date."}
        title="Consistency"
        tone="card"
      />
      {rows.length === 0 ? (
        <Text style={[typeScale.body as TextStyle, { color: colors.contentCardTextSecondary }]}>Baseline</Text>
      ) : (
        <View accessibilityLabel="Consistency visual trend" style={styles.visualRows}>
          {rows.map((row) => {
            const text = rowText(row);
            return (
              <View accessibilityLabel={text} key={row.localDate} style={styles.visualRow}>
                <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>{text}</Text>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[styles.track, { backgroundColor: colors.surfaceSubtle }]}
                >
                  <View style={[styles.fill, { backgroundColor: colors.action, width: completionWidth(row) }]} />
                </View>
                <SourceLinks onOpenExercise={onOpenExercise} onOpenSession={onOpenSession} row={row} />
              </View>
            );
          })}
        </View>
      )}
      <View accessibilityLabel="Consistency data table" style={styles.table} testID="progress-trend-table">
        <Text accessibilityRole="header" style={[typeScale.label as TextStyle, { color: colors.contentCardText }]}>Consistency data</Text>
        {rows.length === 0 ? (
          <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>Baseline · More comparable working sets are needed before a change is shown.</Text>
        ) : rows.map((row) => (
          <View key={row.localDate} style={styles.tableRow}>
            <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>{rowText(row)}</Text>
            <SourceLinks onOpenExercise={onOpenExercise} onOpenSession={onOpenSession} row={row} />
          </View>
        ))}
      </View>
    </ContentCard>
  );
}

const styles = StyleSheet.create({
  fill: { borderRadius: radius.full, height: "100%" },
  sourceLink: { borderRadius: radius.standard, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center", minHeight: 48, paddingHorizontal: space[2] },
  sourceLinks: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  table: { borderTopWidth: StyleSheet.hairlineWidth, gap: space[2], paddingTop: space[4] },
  tableRow: { gap: space[2] },
  track: { borderRadius: radius.full, height: 8, overflow: "hidden", width: "100%" },
  visualRow: { gap: space[2] },
  visualRows: { gap: space[4] },
});

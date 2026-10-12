import React, { useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type TextStyle,
} from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";

import { space, sizes, typeScale, useAppTheme } from "../theme";
import { FocusablePressable } from "./index";

export type FactualHistoryPointStatus =
  | "accepted_current"
  | "corrected_effective"
  | "incompatible"
  | "removed"
  | "unavailable";

export type FactualHistorySource =
  | Readonly<{ activityId: string; sourceRevision: number }>
  | Readonly<{ sessionId: string; sourceRevision: number }>;

export type ProgressFactualHistoryPoint = Readonly<{
  activityId: string | null;
  evidence: "source_summary" | "source_laps" | "workout_session" | null;
  localDate: string;
  sourceRevision: number | null;
  status: FactualHistoryPointStatus;
  targetAtDateSeconds: number | null;
  timeBasis: "elapsed" | "moving" | "timer";
  valueSeconds: number | null;
  workoutSessionId?: string | null;
  basisLabel?: string | null;
  statusLabel?: string;
}>;

/** Immutable presentation input. SVG coordinates are derived only from this series. */
export type ProgressFactualSeries = Readonly<{
  distanceMeters: number;
  fasterIsLower: boolean;
  points: readonly ProgressFactualHistoryPoint[];
  rangeLabel: string;
  unitLabel: string;
  currentTargetSeconds?: number | null;
  metricLabel?: string;
  directionLabel?: string;
}>;

type PlotPoint = Readonly<{
  point: ProgressFactualHistoryPoint;
  sourceIndex: number;
}>;

export type FactualVisualProjection = Readonly<{
  actualSegments: readonly (readonly PlotPoint[])[];
  targetSegments: readonly (readonly PlotPoint[])[];
}>;

const CHART_HEIGHT = 142;
const CHART_WIDTH = 320;
const MAX_VISUAL_POINTS = 120;

function positiveFinite(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function isPlotFact(point: ProgressFactualHistoryPoint): point is ProgressFactualHistoryPoint & {
  valueSeconds: number;
  sourceRevision: number;
  evidence: "source_summary" | "source_laps" | "workout_session";
} {
  return point.status === "accepted_current"
    && positiveFinite(point.valueSeconds)
    && ((typeof point.activityId === "string" && point.activityId.length > 0)
      || (typeof point.workoutSessionId === "string" && point.workoutSessionId.length > 0))
    && typeof point.sourceRevision === "number"
    && Number.isSafeInteger(point.sourceRevision)
    && point.sourceRevision > 0
    && (point.evidence === "source_summary"
      || point.evidence === "source_laps"
      || point.evidence === "workout_session");
}

function localExtremaIndexes(points: readonly PlotPoint[]): readonly number[] {
  const indexes: number[] = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    const before = points[index - 1]?.point.valueSeconds ?? null;
    const current = points[index]?.point.valueSeconds ?? null;
    const after = points[index + 1]?.point.valueSeconds ?? null;
    if (!positiveFinite(before) || !positiveFinite(current) || !positiveFinite(after)) continue;
    if ((current < before && current < after) || (current > before && current > after)) indexes.push(index);
  }
  return indexes;
}

function targetCrossingIndexes(points: readonly PlotPoint[]): readonly number[] {
  const indexes: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]?.point;
    const current = points[index]?.point;
    if (previous === undefined || current === undefined
      || !positiveFinite(previous.valueSeconds) || !positiveFinite(current.valueSeconds)
      || !positiveFinite(previous.targetAtDateSeconds) || !positiveFinite(current.targetAtDateSeconds)) continue;
    const previousGap = previous.valueSeconds - previous.targetAtDateSeconds;
    const currentGap = current.valueSeconds - current.targetAtDateSeconds;
    if (previousGap === 0 || currentGap === 0 || (previousGap < 0) !== (currentGap < 0)) {
      indexes.push(index - 1, index);
    }
  }
  return indexes;
}

/**
 * Deterministic, visual-only sampling. The original series stays complete for
 * the summary, accessibility description, data rows, and source actions.
 */
export function sampleFactualVisualPoints(
  points: readonly PlotPoint[],
  fasterIsLower: boolean,
  maximum = MAX_VISUAL_POINTS,
): readonly PlotPoint[] {
  if (points.length <= maximum) return points;
  const best = points.reduce((selected, candidate, index) => {
    const current = candidate.point.valueSeconds!;
    const selectedValue = points[selected]!.point.valueSeconds!;
    return (fasterIsLower ? current < selectedValue : current > selectedValue) ? index : selected;
  }, 0);
  const required = new Set<number>([
    0,
    points.length - 1,
    best,
    ...localExtremaIndexes(points),
    ...targetCrossingIndexes(points),
  ]);
  const spacing = Math.max(1, Math.ceil(points.length / maximum));
  for (let index = 0; index < points.length; index += spacing) required.add(index);
  const ordered = [...required].sort((left, right) => left - right);
  if (ordered.length <= maximum) return ordered.map((index) => points[index]!);

  const priority = new Set<number>([0, points.length - 1, best]);
  const retained = ordered.filter((index) => priority.has(index));
  for (const index of ordered) {
    if (retained.length >= maximum) break;
    if (!priority.has(index)) retained.push(index);
  }
  return retained.sort((left, right) => left - right).map((index) => points[index]!);
}

function contiguousRuns(
  series: ProgressFactualSeries,
  include: (point: ProgressFactualHistoryPoint) => boolean,
): readonly (readonly PlotPoint[])[] {
  const runs: PlotPoint[][] = [];
  let current: PlotPoint[] = [];
  series.points.forEach((point, sourceIndex) => {
    if (!isPlotFact(point) || !include(point)) {
      if (current.length > 0) runs.push(current);
      current = [];
      return;
    }
    current.push({ point, sourceIndex });
  });
  if (current.length > 0) runs.push(current);
  return runs;
}

export function projectFactualVisualSeries(series: ProgressFactualSeries): FactualVisualProjection {
  const actualRuns = contiguousRuns(series, () => true);
  const perRun = Math.max(2, Math.floor(MAX_VISUAL_POINTS / Math.max(1, actualRuns.length)));
  return Object.freeze({
    actualSegments: Object.freeze(actualRuns.map((run) => Object.freeze(sampleFactualVisualPoints(run, series.fasterIsLower, perRun)))),
    targetSegments: Object.freeze(contiguousRuns(series, (point) => positiveFinite(point.targetAtDateSeconds))
      .map((run) => Object.freeze(sampleFactualVisualPoints(run, series.fasterIsLower, perRun)))),
  });
}

export function formatFactualDuration(totalSeconds: number | null): string {
  if (!positiveFinite(totalSeconds)) return "—";
  const rounded = Math.round(totalSeconds);
  const seconds = rounded % 60;
  const totalMinutes = Math.floor(rounded / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${totalMinutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDistance(distanceMeters: number): string {
  if (distanceMeters === 2_400) return "2.4 km";
  return distanceMeters >= 1_000
    ? `${(distanceMeters / 1_000).toFixed(distanceMeters % 1_000 === 0 ? 0 : 1)} km`
    : `${distanceMeters} m`;
}

function longDate(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return localDate;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC", year: "numeric" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function statusText(point: ProgressFactualHistoryPoint): string {
  if (point.statusLabel !== undefined) return point.statusLabel;
  switch (point.status) {
    case "accepted_current": return `Accepted/current · ${point.evidence?.replace("_", " ") ?? "source evidence"}`;
    case "corrected_effective": return "Corrected effective fact";
    case "incompatible": return "Incompatible fact";
    case "removed": return "Removed source";
    case "unavailable": return "Unavailable source evidence";
  }
}

function chartPath(points: readonly PlotPoint[], valueFor: (point: ProgressFactualHistoryPoint) => number | null, minimum: number, maximum: number, sourceCount: number): string {
  const range = Math.max(1, maximum - minimum);
  const count = Math.max(1, sourceCount - 1);
  return points.map(({ point, sourceIndex }) => {
    const value = valueFor(point) ?? minimum;
    const x = 12 + (sourceIndex / count) * (CHART_WIDTH - 24);
    const y = 12 + ((value - minimum) / range) * (CHART_HEIGHT - 32);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function sourceFor(point: ProgressFactualHistoryPoint): FactualHistorySource | null {
  if (!isPlotFact(point)) return null;
  if (typeof point.workoutSessionId === "string" && point.workoutSessionId.length > 0) {
    return { sessionId: point.workoutSessionId, sourceRevision: point.sourceRevision };
  }
  return typeof point.activityId === "string" && point.activityId.length > 0
    ? { activityId: point.activityId, sourceRevision: point.sourceRevision }
    : null;
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  const { colors } = useAppTheme();
  return <View style={[styles.fact, { borderColor: colors.line }]}>
    <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{label}</Text>
    <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{value}</Text>
  </View>;
}

export type FactualHistoryChartProps = Readonly<{
  onOpenSource?: (source: FactualHistorySource) => void;
  series: ProgressFactualSeries;
  formatValue?: (value: number | null) => string;
}>;

export function FactualHistoryChart({ formatValue, onOpenSource, series }: FactualHistoryChartProps) {
  const { colors } = useAppTheme();
  const { fontScale, height, width } = useWindowDimensions();
  const [dataVisible, setDataVisible] = useState(false);
  const facts = useMemo(() => series.points.filter(isPlotFact), [series.points]);
  const latest = facts.at(-1) ?? null;
  const best = facts.reduce<ProgressFactualHistoryPoint | null>((selected, candidate) => {
    if (selected === null || !positiveFinite(selected.valueSeconds) || !positiveFinite(candidate.valueSeconds)) return candidate;
    return series.fasterIsLower
      ? candidate.valueSeconds < selected.valueSeconds ? candidate : selected
      : candidate.valueSeconds > selected.valueSeconds ? candidate : selected;
  }, null);
  const target = positiveFinite(series.currentTargetSeconds ?? null)
    ? series.currentTargetSeconds!
    : latest?.targetAtDateSeconds ?? null;
  const gap = best !== null && positiveFinite(best.valueSeconds) && positiveFinite(target)
    ? Math.abs(best.valueSeconds - target)
    : null;
  const visual = useMemo(() => projectFactualVisualSeries(series), [series]);
  const allVisualPoints = visual.actualSegments.flatMap((segment) => segment);
  const values = allVisualPoints.flatMap(({ point }) => [point.valueSeconds, point.targetAtDateSeconds])
    .filter(positiveFinite);
  const minimum = values.length === 0 ? 0 : Math.min(...values);
  const maximum = values.length === 0 ? 1 : Math.max(...values);
  const valueText = formatValue ?? formatFactualDuration;
  const metricLabel = series.metricLabel ?? formatDistance(series.distanceMeters);
  const directionLabel = series.directionLabel
    ?? (series.fasterIsLower ? "Faster is lower on the clock." : "Higher values are better.");
  const label = `${metricLabel} personal history for ${series.rangeLabel}: ${facts.length} factual points. ${directionLabel} goal line ${visual.targetSegments.length > 0 ? "present" : "absent"}.`;
  const showStackedFacts = fontScale >= 2 || width > height;

  if (facts.length === 0) {
    return <View accessibilityLabel={label} accessible style={styles.empty}>
      {positiveFinite(target) ? <View style={styles.facts} testID="factual-history-facts"><Fact label="Target" value={formatFactualDuration(target)} /></View> : null}
      <Text style={[typeScale.screenTitle as TextStyle, { color: colors.textPrimary }]}>No effort recorded</Text>
      <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Import or accept a {formatDistance(series.distanceMeters)} effort to establish a benchmark. No zero result is plotted.</Text>
    </View>;
  }

  return <View style={styles.container} testID="factual-history-chart">
    <View style={[styles.facts, showStackedFacts ? styles.factsStacked : undefined]} testID="factual-history-facts">
      <Fact label="Latest" value={valueText(latest?.valueSeconds ?? null)} />
      <Fact label="Best" value={valueText(best?.valueSeconds ?? null)} />
      <Fact label="Target" value={valueText(target)} />
      <Fact label="Gap" value={gap === null ? "—" : `${valueText(gap)} ${series.fasterIsLower ? best!.valueSeconds! < target! ? "faster" : "slower" : best!.valueSeconds! > target! ? "higher" : "lower"}`} />
    </View>
    <View accessible accessibilityLabel={label} style={styles.chartSummary}>
      <Text style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>Personal history</Text>
      <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{`${series.rangeLabel} · ${facts.length} evidence ${facts.length === 1 ? "point" : "points"} · ${directionLabel}`}</Text>
      {facts.length === 1 ? <Text style={[typeScale.secondary as TextStyle, { color: colors.yellow }]}>More data needed</Text> : null}
      {latest?.basisLabel ? <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{latest.basisLabel}</Text> : null}
    </View>
    <View style={[styles.chart, { borderColor: colors.line }]}>
      <Svg accessibilityElementsHidden height={CHART_HEIGHT} importantForAccessibility="no-hide-descendants" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} width="100%">
        {visual.targetSegments.map((segment, index) => segment.length < 2 ? null : <Polyline fill="none" key={`target-${index}`} points={chartPath(segment, (point) => point.targetAtDateSeconds, minimum, maximum, series.points.length)} stroke={colors.yellow} strokeDasharray="7 5" strokeWidth={2} />)}
        {visual.actualSegments.map((segment, index) => segment.length < 2 ? null : <Polyline fill="none" key={`actual-${index}`} points={chartPath(segment, (point) => point.valueSeconds, minimum, maximum, series.points.length)} stroke={colors.green} strokeWidth={2} />)}
        {visual.actualSegments.flatMap((segment) => segment).map(({ point, sourceIndex }) => {
          const value = point.valueSeconds!;
          const x = 12 + (sourceIndex / Math.max(1, series.points.length - 1)) * (CHART_WIDTH - 24);
          const y = 12 + ((value - minimum) / Math.max(1, maximum - minimum)) * (CHART_HEIGHT - 32);
          return <Circle cx={x} cy={y} fill={colors.paper} key={`${point.activityId}-${sourceIndex}`} r={4} stroke={colors.green} strokeWidth={2} />;
        })}
      </Svg>
    </View>
    {positiveFinite(target) ? <Text style={[typeScale.secondary as TextStyle, { color: colors.yellow }]}>{`Goal ${valueText(target)}`}</Text> : null}
    <FocusablePressable accessibilityLabel={dataVisible ? "Hide history data" : "Show history data"} accessibilityRole="button" onPress={() => setDataVisible((visible) => !visible)} style={[styles.disclosure, { borderColor: colors.focusRing }]}>
      <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.focusRing }]}>{dataVisible ? "Hide history data" : "Show history data"}</Text>
    </FocusablePressable>
    {dataVisible ? <View accessibilityLabel="Factual history data" style={styles.data}>
      <Text accessibilityRole="header" style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>History data</Text>
      {series.points.map((point, index) => {
        const source = sourceFor(point);
        return <View key={`${point.localDate}-${point.activityId ?? "unavailable"}-${index}`} style={[styles.dataRow, { borderColor: colors.line }]}>
          <Text style={[typeScale.secondary as TextStyle, { color: colors.textPrimary }]}>{longDate(point.localDate)}</Text>
          <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{formatValue === undefined ? `${valueText(point.valueSeconds)} · ${series.unitLabel}` : valueText(point.valueSeconds)}</Text>
          <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{positiveFinite(point.targetAtDateSeconds) ? `Target at date ${valueText(point.targetAtDateSeconds)}` : "Target unset"}</Text>
          {point.basisLabel ? <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{point.basisLabel}</Text> : null}
          <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{statusText(point)}</Text>
          {source !== null && onOpenSource !== undefined ? <FocusablePressable accessibilityLabel="Open source" accessibilityRole="button" onPress={() => onOpenSource(source)} style={[styles.sourceAction, { borderColor: colors.focusRing }]}><Text style={[typeScale.secondary as TextStyle, { color: colors.focusRing }]}>Open source</Text></FocusablePressable> : <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Source unavailable</Text>}
        </View>;
      })}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  chart: { borderWidth: StyleSheet.hairlineWidth, minHeight: CHART_HEIGHT },
  chartSummary: { gap: space[1] },
  container: { gap: space[2] },
  data: { gap: space[2] },
  dataRow: { borderTopWidth: StyleSheet.hairlineWidth, gap: space[1], paddingTop: space[2] },
  disclosure: { alignItems: "center", borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center", minHeight: sizes.minimumTarget, paddingHorizontal: space[4] },
  empty: { gap: space[2], paddingVertical: space[6] },
  fact: { flex: 1, gap: space[1], minHeight: sizes.minimumTarget, paddingRight: space[2] },
  facts: { flexDirection: "row", gap: space[2] },
  factsStacked: { flexDirection: "column" },
  sourceAction: { alignSelf: "flex-start", borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center", minHeight: sizes.minimumTarget, paddingHorizontal: space[2] },
});

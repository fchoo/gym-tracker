import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import type { PlannedStrengthOccurrenceDetail } from "../../domains/workout";
import {
  METRIC_PROFILES,
  parseMetricTarget,
  type MetricProfile,
} from "../../domains/metrics";
import { formatWorkoutTarget } from "../../domains/workout/workoutPresentation";
import { EmptyState, PrimaryAction, ScreenHeader, SkeletonBlock } from "../components";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import { space, typeScale, useAppTheme } from "../theme";

type LoadState = "loading" | "ready" | "missing" | "error";

function isDeepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every(isDeepFrozen);
}

function targetText(targetJson: string): string | null {
  try {
    const decoded = JSON.parse(targetJson) as Readonly<Record<string, unknown>>;
    const profile = decoded.profile;
    const version = decoded.version;
    if (typeof profile !== "string"
      || !METRIC_PROFILES.includes(profile as MetricProfile)
      || !Number.isSafeInteger(version)) return null;
    return formatWorkoutTarget(parseMetricTarget({
      profile: profile as MetricProfile,
      contractVersion: version as number,
      exerciseMetricGeneration: 1,
    }, decoded));
  } catch {
    return null;
  }
}

function hasTargets(detail: PlannedStrengthOccurrenceDetail): boolean {
  return detail.exercises.length > 0
    && detail.exercises.every((exercise) => exercise.targets.length > 0
      && exercise.targets.every((target) => targetText(target.targetJson) !== null));
}

/** Exact-occurrence Calendar preview with no session or command capability. */
export function PlannedWorkoutDetailScreen({
  occurrenceId,
  loadOccurrence,
  onBack,
}: Readonly<{
  occurrenceId: string;
  loadOccurrence(occurrenceId: string): Promise<PlannedStrengthOccurrenceDetail | null>;
  onBack(): void;
}>) {
  const { colors } = useAppTheme();
  const [detail, setDetail] = useState<PlannedStrengthOccurrenceDetail | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [generation, setGeneration] = useState(0);
  const requestGeneration = useRef(0);

  useEffect(() => {
    const request = requestGeneration.current + 1;
    requestGeneration.current = request;
    if (occurrenceId.length === 0) {
      setDetail(null);
      setState("missing");
      return undefined;
    }
    let mounted = true;
    setState("loading");
    void loadOccurrence(occurrenceId).then((result) => {
      if (!mounted || request !== requestGeneration.current) return;
      if (result === null || result.occurrenceId !== occurrenceId || !isDeepFrozen(result) || !hasTargets(result)) {
        setDetail(null);
        setState("missing");
        return;
      }
      setDetail(result);
      setState("ready");
    }).catch(() => {
      if (!mounted || request !== requestGeneration.current) return;
      setDetail(null);
      setState("error");
    });
    return () => {
      mounted = false;
      if (requestGeneration.current === request) requestGeneration.current += 1;
    };
  }, [generation, loadOccurrence, occurrenceId]);

  if (state === "loading") {
    return <AdaptiveScreen primary={<><ScreenHeader backAction={onBack} title="Workout preview" /><SkeletonBlock height={48} width="64%" /><SkeletonBlock height={160} /></>} />;
  }
  if (state === "error") {
    return <AdaptiveScreen primary={<><ScreenHeader backAction={onBack} title="Workout preview" /><EmptyState body="The planned workout was not changed. Try loading this preview again." heading="Workout preview could not be loaded" primaryAction={<PrimaryAction label="Retry preview" onPress={() => setGeneration((value) => value + 1)} />} /></>} />;
  }
  if (state === "missing" || detail === null) {
    return <AdaptiveScreen primary={<><ScreenHeader backAction={onBack} title="Workout preview" /><EmptyState body="This plan occurrence changed or is no longer available. Return to Calendar and refresh." heading="Workout preview unavailable" primaryAction={<PrimaryAction label="Back to Calendar" onPress={onBack} />} /></>} />;
  }

  const targets = detail.exercises.flatMap((exercise) => exercise.targets.map((target) => ({
    exerciseOrdinal: exercise.ordinal,
    target,
    value: targetText(target.targetJson)!,
  })));
  return (
    <AdaptiveScreen
      primary={<>
        <ScreenHeader backAction={onBack} title="Workout preview" />
        <View style={styles.summary} testID="planned-workout-summary">
          <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Planned preview · read only</Text>
          <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>{detail.localDate}</Text>
          <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{`0 of ${targets.length} sets`}</Text>
        </View>
        <View accessibilityLabel="Planned Strength target facts" style={styles.table}>
          <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Set · Previous · Target · State</Text>
          {targets.map(({ exerciseOrdinal, target, value }) => (
            <View key={target.id} style={styles.row} testID={`planned-target-${target.id}`}>
              <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{`Exercise ${exerciseOrdinal + 1} · Set ${target.ordinal + 1}`}</Text>
              <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>—</Text>
              <Text style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>{value}</Text>
              <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Planned</Text>
            </View>
          ))}
        </View>
      </>}
    />
  );
}

const styles = StyleSheet.create({
  row: { gap: space[2], minHeight: 48, paddingVertical: space[1] },
  summary: { gap: space[2], paddingVertical: space[4] },
  table: { gap: space[1], paddingVertical: space[2] },
});

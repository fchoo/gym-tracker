import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { DEFAULT_TWO_POINT_FOUR_KM_TARGET_MS, runningTargetForDistance, type RunningPlanAggregate } from "../../domains/running/contracts";
import type { RunningPlanRuntimePort, RunningTargetMutationInput } from "../../bootstrap/runningPlanRuntime";
import { BottomSheet } from "./BottomSheet";
import { ActionRow, FocusablePressable, InlineNotice, PrimaryAction, SecondaryAction } from "./index";
import { radius, sizes, space, typeScale, useAppTheme } from "../theme";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const DISTANCES = [2_400, 10_000, 21_097] as const;
type Weekday = (typeof WEEKDAYS)[number];
type Draft = Readonly<{
  targetTime: string;
  targetDate: string;
  trainingDays: readonly Weekday[];
  expectedSourceRevision: number;
}>;
type ErrorState = "save" | "stale" | "refresh" | null;
type RetainedRequestIdentity = Readonly<{
  fingerprint: string;
  requestId: string;
}>;

export type RunningTargetSheetProps = Readonly<{
  initialDistanceMeters?: number;
  visible: boolean;
  sources: readonly RunningPlanAggregate[];
  runtime: Pick<RunningPlanRuntimePort, "createId" | "loadPlan" | "saveRunningTarget">;
  onClose(): void;
  onSaved?(plan: RunningPlanAggregate): unknown;
  restoreFocusRef?: React.RefObject<View | null> | undefined;
  todayLocalDate: string;
}>;

function distanceLabel(meters: number): string {
  if (meters === 2400) return "2.4 km";
  if (meters === 10_000) return "10 km";
  if (meters === 21_097) return "Half Marathon";
  return `${meters} m`;
}

function formatTime(durationMs: number | undefined): string {
  if (durationMs === undefined) return "";
  const seconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function parseTargetTime(value: string): number | null {
  const segments = value.trim().split(":");
  if (segments.length < 2 || segments.length > 3 || segments.some((segment) => !/^\d{1,2}$/u.test(segment))) return null;
  const numbers = segments.map(Number);
  const [hours, minutes, seconds] = segments.length === 3
    ? numbers as [number, number, number]
    : [0, numbers[0]!, numbers[1]!];
  if (minutes > 59 || seconds > 59) return null;
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  return totalSeconds >= 60 && totalSeconds < 86_400 ? totalSeconds * 1000 : null;
}

function isFutureDate(value: string, today: string): boolean {
  if (value === "") return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const candidate = new Date(year!, month! - 1, day!);
  return candidate.getFullYear() === year && candidate.getMonth() === month! - 1
    && candidate.getDate() === day && value > today;
}

function draftFrom(source: RunningPlanAggregate, distanceMeters: number): Draft {
  const currentTarget = runningTargetForDistance(source, distanceMeters);
  return Object.freeze({
    targetTime: formatTime(currentTarget !== undefined
      ? currentTarget.targetDurationMs
      : distanceMeters === 2_400
        ? DEFAULT_TWO_POINT_FOUR_KM_TARGET_MS
        : undefined),
    targetDate: currentTarget?.targetLocalDate ?? "",
    trainingDays: [...(currentTarget?.trainingDays ?? source.goal.trainingDays)],
    expectedSourceRevision: source.revision,
  });
}

function requestFingerprint(
  input: Omit<RunningTargetMutationInput, "requestId">,
): string {
  return JSON.stringify({
    ...input,
    trainingDays: [...input.trainingDays].sort((left, right) =>
      left.localeCompare(right)
    ),
  });
}

function benchmarkLabel(source: RunningPlanAggregate, distanceMeters: number): string {
  const target = runningTargetForDistance(source, distanceMeters) ?? source.goal;
  const benchmark = target.benchmarks === undefined
    ? target.benchmark?.distanceMeters === distanceMeters ? target.benchmark : undefined
    : distanceMeters === 2_400
      ? target.benchmarks.twoPointFourKm
      : distanceMeters === 10_000
        ? target.benchmarks.tenKilometres
        : target.benchmarks.halfMarathon;
  if (benchmark === undefined) return "No benchmark yet";
  const provenance = benchmark.source.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `${formatTime(benchmark.durationMs)} · ${provenance} · ${benchmark.localDate}`;
}

function pacingLabel(durationMs: number | null, distanceMeters: number): string | null {
  if (durationMs === null) return null;
  const paceSeconds = Math.round((durationMs / 1000) / (distanceMeters / 1000));
  return `Pace ${Math.floor(paceSeconds / 60)}:${String(paceSeconds % 60).padStart(2, "0")}/km`;
}

export function RunningTargetSheet({
  initialDistanceMeters,
  onClose,
  onSaved,
  restoreFocusRef,
  runtime,
  sources,
  todayLocalDate,
  visible,
}: RunningTargetSheetProps) {
  const { colors } = useAppTheme();
  const [selectedDistanceMeters, setSelectedDistanceMeters] = useState(
    () => initialDistanceMeters ?? 2_400,
  );
  const draftsRef = useRef(new Map<string, Draft>());
  const requestIdsRef = useRef(new Map<string, RetainedRequestIdentity>());
  const [renderVersion, setRenderVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorState>(null);
  const [validation, setValidation] = useState({ date: false, time: false });
  const [committedPlan, setCommittedPlan] = useState<RunningPlanAggregate | null>(null);
  const targetRef = useRef<TextInput>(null);
  const dateRef = useRef<TextInput>(null);
  const dayRef = useRef<View>(null);
  const dayRefs = useRef(WEEKDAYS.map(() => React.createRef<View>()));
  const distanceRefs = useRef(DISTANCES.map(() => React.createRef<View>()));
  const source = sources.find(({ active, lifecycle }) => active && lifecycle === "active") ?? sources[0];
  const draftKey = source === undefined ? "" : `${source.id}:${selectedDistanceMeters}`;
  const draft = source === undefined
    ? undefined
    : draftsRef.current.get(draftKey) ?? draftFrom(source, selectedDistanceMeters);
  const durationMs = draft === undefined ? null : parseTargetTime(draft.targetTime);
  const pace = source === undefined ? null : pacingLabel(durationMs, selectedDistanceMeters);

  useEffect(() => {
    if (!visible) return;
    const next = sources.find(({ active, lifecycle }) => active && lifecycle === "active") ?? sources[0];
    if (next === undefined) return;
    const initial = initialDistanceMeters ?? 2_400;
    setSelectedDistanceMeters(initial);
    for (const distanceMeters of DISTANCES) {
      const key = `${next.id}:${distanceMeters}`;
      if (!draftsRef.current.has(key)) {
        draftsRef.current.set(key, draftFrom(next, distanceMeters));
      }
    }
    setError(null);
    setValidation({ date: false, time: false });
  }, [initialDistanceMeters, sources, visible]);

  const update = (next: Partial<Draft>) => {
    if (source === undefined || draft === undefined) return;
    draftsRef.current.set(draftKey, Object.freeze({ ...draft, ...next }));
    setRenderVersion((value) => value + 1);
    setError(null);
  };

  const save = async () => {
    if (source === undefined || draft === undefined || busy) return;
    setValidation({ date: true, time: true });
    const parsedDuration = parseTargetTime(draft.targetTime);
    if (parsedDuration === null) {
      targetRef.current?.focus();
      return;
    }
    if (!isFutureDate(draft.targetDate, todayLocalDate)) {
      dateRef.current?.focus();
      return;
    }
    if (draft.trainingDays.length === 0) {
      dayRef.current?.focus?.();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const targetInput = {
        planId: source.id,
        expectedSourceRevision: draft.expectedSourceRevision,
        goalDistanceMeters: selectedDistanceMeters,
        targetDurationMs: parsedDuration,
        targetLocalDate: draft.targetDate === "" ? undefined : draft.targetDate,
        trainingDays: [...draft.trainingDays],
      } satisfies Omit<RunningTargetMutationInput, "requestId">;
      const fingerprint = requestFingerprint(targetInput);
      const retainedRequest = requestIdsRef.current.get(draftKey);
      const requestId = retainedRequest?.fingerprint === fingerprint
        ? retainedRequest.requestId
        : runtime.createId("running-target-save");
      requestIdsRef.current.set(draftKey, Object.freeze({ fingerprint, requestId }));
      const saved = await runtime.saveRunningTarget({ ...targetInput, requestId });
      try {
        await onSaved?.(saved.plan);
      } catch {
        setCommittedPlan(saved.plan);
        setError("refresh");
        return;
      }
      requestIdsRef.current.delete(draftKey);
      setCommittedPlan(null);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error && cause.message.includes("revision_conflict") ? "stale" : "save");
    } finally {
      setBusy(false);
    }
  };

  const retryCommittedRefresh = async () => {
    if (committedPlan === null || busy) return;
    setBusy(true);
    try {
      await onSaved?.(committedPlan);
      requestIdsRef.current.delete(`${committedPlan.id}:${committedPlan.goal.goalDistanceMeters}`);
      setCommittedPlan(null);
      setError(null);
      onClose();
    } catch {
      setError("refresh");
    } finally {
      setBusy(false);
    }
  };

  const reload = async () => {
    if (source === undefined) return;
    try {
      const reloaded = await runtime.loadPlan(source.id);
      if (reloaded === null) return;
      // Preserve the draft for comparison; only its revision fence changes.
      const current = draftsRef.current.get(draftKey) ?? draftFrom(source, selectedDistanceMeters);
      draftsRef.current.set(draftKey, Object.freeze({ ...current, expectedSourceRevision: reloaded.revision }));
      requestIdsRef.current.delete(draftKey);
      setError(null);
      setRenderVersion((value) => value + 1);
    } catch {
      setError("save");
    }
  };

  const timeError = validation.time && draft !== undefined && durationMs === null ? "Enter a valid target time." : undefined;
  const dateError = validation.date && draft !== undefined && !isFutureDate(draft.targetDate, todayLocalDate) ? "Enter a valid target date." : undefined;
  const _renderVersion = renderVersion;
  void _renderVersion;

  return (
    <BottomSheet
      cancelLabel="Discard target changes"
      heading="Running target"
      onCancel={onClose}
      restoreFocusRef={restoreFocusRef}
      scrollTestID="running-target-sheet-content"
      testID="running-target-sheet"
      visible={visible}
    >
      {source === undefined || draft === undefined ? null : (
        <View style={styles.content}>
          <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Distance</Text>
          <View accessibilityRole="tablist" style={styles.distances}>
            {DISTANCES.map((distanceMeters, index) => (
              <FocusablePressable
                {...({ onKeyDown: (event: { nativeEvent: { key: string; preventDefault?: () => void } }) => {
                  const key = event.nativeEvent.key;
                  if (key === "Enter" || key === " ") {
                    event.nativeEvent.preventDefault?.();
                    setSelectedDistanceMeters(distanceMeters);
                    setValidation({ date: false, time: false });
                    setError(null);
                    return;
                  }
                  const nextIndex = key === "Home" ? 0 : key === "End" ? DISTANCES.length - 1 : key === "ArrowLeft" ? (index + DISTANCES.length - 1) % DISTANCES.length : key === "ArrowRight" ? (index + 1) % DISTANCES.length : null;
                  if (nextIndex !== null) {
                    event.nativeEvent.preventDefault?.();
                    const nextDistance = DISTANCES[nextIndex]!;
                    setSelectedDistanceMeters(nextDistance);
                    setValidation({ date: false, time: false });
                    setError(null);
                    requestAnimationFrame(() => distanceRefs.current[nextIndex]?.current?.focus?.());
                  }
                } } as object)}
                accessibilityLabel={distanceLabel(distanceMeters)}
                accessibilityRole="tab"
                accessibilityState={{ selected: distanceMeters === selectedDistanceMeters }}
                key={distanceMeters}
                onPress={() => { setSelectedDistanceMeters(distanceMeters); setValidation({ date: false, time: false }); setError(null); }}
                ref={(node) => { distanceRefs.current[index]!.current = node; }}
                style={[styles.distance, { backgroundColor: distanceMeters === selectedDistanceMeters ? colors.contentCardSelected : colors.surface, borderColor: colors.divider }]}
              >
                <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{distanceLabel(distanceMeters)}</Text>
              </FocusablePressable>
            ))}
          </View>
          <Field label="Target time" inputRef={targetRef} value={draft.targetTime} onBlur={() => setValidation((current) => ({ ...current, time: true }))} onChangeText={(targetTime) => update({ targetTime })} error={timeError} />
          <Field label="Optional target date" inputRef={dateRef} value={draft.targetDate} onBlur={() => setValidation((current) => ({ ...current, date: true }))} onChangeText={(targetDate) => update({ targetDate })} error={dateError} placeholder="YYYY-MM-DD" />
          <View style={styles.fact}>
            <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Current benchmark</Text>
            <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>{benchmarkLabel(source, selectedDistanceMeters)}</Text>
          </View>
          <View style={styles.fact}>
            <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Available training days</Text>
            <View style={styles.days}>
              {WEEKDAYS.map((day, index) => {
                const selected = draft.trainingDays.includes(day);
                const toggle = () => update({ trainingDays: WEEKDAYS.filter((value) => selected ? value !== day && draft.trainingDays.includes(value) : value === day || draft.trainingDays.includes(value)) });
                return <FocusablePressable
                  {...({ onKeyDown: (event: { nativeEvent: { key: string; preventDefault?: () => void } }) => {
                    const key = event.nativeEvent.key;
                    if (key === "Enter" || key === " ") {
                      event.nativeEvent.preventDefault?.();
                      toggle();
                      return;
                    }
                    const nextIndex = key === "Home" ? 0 : key === "End" ? WEEKDAYS.length - 1 : key === "ArrowLeft" ? (index + WEEKDAYS.length - 1) % WEEKDAYS.length : key === "ArrowRight" ? (index + 1) % WEEKDAYS.length : null;
                    if (nextIndex !== null) {
                      event.nativeEvent.preventDefault?.();
                      requestAnimationFrame(() => dayRefs.current[nextIndex]?.current?.focus?.());
                    }
                  } } as object)}
                  accessibilityLabel={day}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  key={day}
                  onPress={toggle}
                  ref={(node) => {
                    dayRefs.current[index]!.current = node;
                    if (index === 0) dayRef.current = node;
                  }}
                  style={[styles.day, { backgroundColor: selected ? colors.contentCardSelected : colors.surface, borderColor: colors.divider }]}
                ><Text style={[typeScale.secondary as TextStyle, { color: colors.textPrimary }]}>{day.slice(0, 3)}</Text></FocusablePressable>;
              })}
            </View>
          </View>
          <View style={styles.pacing}>
            {pace === null ? null : <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{pace}</Text>}
            <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Calculated pacing guides do not predict or guarantee an outcome.</Text>
          </View>
          {error === "save" ? <InlineNotice action={<SecondaryAction label="Retry saving target" onPress={() => { void save(); }} />} body="Your current target is unchanged. Review the draft and try again." heading="Target was not saved" tone="error" /> : null}
          {error === "stale" ? <InlineNotice action={<SecondaryAction label="Reload target" onPress={() => { void reload(); }} />} body="Review the latest target before saving again." heading="Target changed since this sheet opened" tone="error" /> : null}
          {error === "refresh" ? <InlineNotice action={<SecondaryAction label="Retry loading progress" onPress={() => { void retryCommittedRefresh(); }} />} body="The target was committed, but the root has not read the matching saved revision yet. Retrying will not submit the target again." heading="Target saved; Progress needs refreshing" tone="attention" /> : null}
          <ActionRow>
            <SecondaryAction disabled={busy} label="Discard target changes" onPress={onClose} />
            <PrimaryAction busy={busy} label="Save target" onPress={() => { void save(); }} />
          </ActionRow>
        </View>
      )}
    </BottomSheet>
  );
}

function Field({ error, inputRef, label, onBlur, onChangeText, placeholder, value }: Readonly<{
  label: string;
  value: string;
  onBlur(): void;
  onChangeText(value: string): void;
  inputRef: React.RefObject<TextInput | null>;
  error?: string | undefined;
  placeholder?: string | undefined;
}>) {
  const { colors } = useAppTheme();
  return <View style={styles.field}><Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>{label}</Text><TextInput accessibilityLabel={label} onBlur={onBlur} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textSecondary} ref={inputRef} style={[typeScale.bodyNumeric as TextStyle, styles.input, { borderColor: error === undefined ? colors.divider : colors.destructive, color: colors.textPrimary }]} value={value} />{error === undefined ? null : <Text accessibilityLiveRegion="polite" style={[typeScale.secondary as TextStyle, { color: colors.destructive }]}>{error}</Text>}</View>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  content: { gap: space[4] },
  day: { alignItems: "center", borderRadius: radius.standard, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center", minHeight: sizes.minimumTarget, minWidth: sizes.minimumTarget, paddingHorizontal: space[1] },
  days: { flexDirection: "row", flexWrap: "wrap", gap: space[1] },
  distance: { alignItems: "center", borderRadius: radius.standard, borderWidth: StyleSheet.hairlineWidth, minHeight: sizes.minimumTarget, justifyContent: "center", paddingHorizontal: space[2] },
  distances: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  fact: { gap: space[1] },
  field: { gap: space[1] },
  input: { borderRadius: radius.standard, borderWidth: StyleSheet.hairlineWidth, minHeight: sizes.minimumTarget, paddingHorizontal: space[2], paddingVertical: space[1] },
  pacing: { gap: space[1] },
} satisfies Record<string, ViewStyle>);

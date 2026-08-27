import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type {
  AvailableCorrectionExercise,
  CorrectHistorySessionInput,
  CorrectHistorySessionResult,
  HistoryAuditEvent,
  HistoryCorrectionEditorState,
  HistoryCorrectionSnapshot,
} from "../../domains/history";
import {
  HistoryCorrectionConflictError,
} from "../../domains/history";
import {
  CalendarField,
  ContentCard,
  EmptyState,
  FocusablePressable,
  InlineNotice,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SectionHeader,
  SkeletonBlock,
} from "../components";
import {
  PlanEditorTextField,
  SemanticNumberField,
} from "../components/PlanEditorFields";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

type LoadState = "loading" | "ready" | "error";
type SaveState = "idle" | "saving" | "failure" | "conflict";
type DraftText = Readonly<Record<string, string>>;
type CorrectionSet = HistoryCorrectionSnapshot["exercises"][number]["sets"][number];

export type SessionCorrectionScreenProps = Readonly<{
  sessionId: string;
  loadCorrectionSession(sessionId: string): Promise<HistoryCorrectionEditorState>;
  listAvailableExercises(): Promise<readonly AvailableCorrectionExercise[]>;
  correctSession(
    input: Omit<CorrectHistorySessionInput, "nowMs">,
  ): Promise<CorrectHistorySessionResult>;
  onBack(): void;
  onSaved(sessionId: string): void;
  createAddedSetId?(): string;
  width?: number;
}>;

function cloneSnapshot(snapshot: HistoryCorrectionSnapshot): HistoryCorrectionSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as HistoryCorrectionSnapshot;
}

function setKey(setId: string, field: string): string {
  return setId + ":" + field;
}

function fallbackValue(set: CorrectionSet, field: string): string {
  const observation = set.observation;
  if (observation === undefined) {
    return "";
  }
  if (field === "loadKg" && observation.profile === "load_reps") {
    return String(observation.loadGrams / 1_000);
  }
  if (field === "reps" && (
    observation.profile === "load_reps"
    || observation.profile === "bodyweight_reps"
    || observation.profile === "added_load_reps"
    || observation.profile === "assisted_reps"
  )) {
    return String(observation.reps);
  }
  if (field === "addedLoadKg" && observation.profile === "added_load_reps") {
    return String(observation.addedLoadGrams / 1_000);
  }
  if (field === "assistanceKg" && observation.profile === "assisted_reps") {
    return String(observation.assistanceGrams / 1_000);
  }
  if (field === "durationSeconds" && observation.profile === "timed_hold") {
    return String(observation.version === 1
      ? observation.durationSeconds
      : observation.durationMs / 1_000);
  }
  if (field === "durationSeconds" && (
    observation.profile === "fixed_distance" || observation.profile === "fixed_time"
  )) {
    return String(observation.durationMs / 1_000);
  }
  if (field === "distanceMeters" && (
    observation.profile === "fixed_distance" || observation.profile === "fixed_time"
  )) {
    return String(observation.distanceMeters);
  }
  if (field === "rounds" && observation.profile === "intervals") {
    return String(observation.completedRounds);
  }
  if (field === "workSeconds" && observation.profile === "intervals") {
    return String(observation.completedWorkMs / 1_000);
  }
  return "";
}

function updatedObservation(
  set: CorrectionSet,
  text: DraftText,
  label: string,
): Readonly<{ observation: CorrectionSet["observation"]; error: string | null }> {
  const value = (field: string) => text[setKey(set.id, field)] ?? fallbackValue(set, field);
  const integer = (field: string, minimum: number, multiplier = 1): number | null => {
    const parsed = Number(value(field));
    const result = parsed * multiplier;
    return Number.isSafeInteger(result) && result >= minimum ? result : null;
  };
  const source = "manual" as const;
  switch (set.target.profile) {
    case "load_reps": {
      const loadGrams = integer("loadKg", 0, 1_000);
      const reps = integer("reps", 1);
      return loadGrams === null || reps === null
        ? { observation: set.observation, error: "Enter a valid number for " + label + " load kg." }
        : { observation: { version: 1, profile: "load_reps", loadGrams, reps, source }, error: null };
    }
    case "bodyweight_reps": {
      const reps = integer("reps", 1);
      return reps === null
        ? { observation: set.observation, error: "Enter a valid number for " + label + " reps." }
        : { observation: { version: 1, profile: "bodyweight_reps", reps, source }, error: null };
    }
    case "added_load_reps": {
      const addedLoadGrams = integer("addedLoadKg", 0, 1_000);
      const reps = integer("reps", 1);
      return addedLoadGrams === null || reps === null
        ? { observation: set.observation, error: "Enter a valid number for " + label + " added load kg." }
        : { observation: { version: 1, profile: "added_load_reps", addedLoadGrams, reps, source }, error: null };
    }
    case "assisted_reps": {
      const assistanceGrams = integer("assistanceKg", 0, 1_000);
      const reps = integer("reps", 1);
      return assistanceGrams === null || reps === null
        ? { observation: set.observation, error: "Enter a valid number for " + label + " assistance kg." }
        : { observation: { version: 1, profile: "assisted_reps", assistanceGrams, reps, source }, error: null };
    }
    case "timed_hold": {
      const seconds = integer("durationSeconds", 1);
      if (seconds === null) {
        return { observation: set.observation, error: "Enter a valid number for " + label + " duration seconds." };
      }
      return set.target.version === 1
        ? { observation: { version: 1, profile: "timed_hold", durationSeconds: seconds, source }, error: null }
        : { observation: { version: 2, profile: "timed_hold", durationMs: seconds * 1_000, source }, error: null };
    }
    case "fixed_distance": {
      const distanceMeters = integer("distanceMeters", 1);
      const durationMs = integer("durationSeconds", 1, 1_000);
      return distanceMeters === null || durationMs === null
        ? { observation: set.observation, error: "Enter valid distance and duration values for " + label + "." }
        : { observation: { version: 1, profile: "fixed_distance", distanceMeters, durationMs, source }, error: null };
    }
    case "fixed_time": {
      const durationMs = integer("durationSeconds", 1, 1_000);
      const distanceMeters = integer("distanceMeters", 0);
      return durationMs === null || distanceMeters === null
        ? { observation: set.observation, error: "Enter valid duration and distance values for " + label + "." }
        : { observation: { version: 1, profile: "fixed_time", durationMs, distanceMeters, source }, error: null };
    }
    case "intervals": {
      const completedRounds = integer("rounds", 0);
      const completedWorkMs = integer("workSeconds", 0, 1_000);
      return completedRounds === null || completedWorkMs === null
        ? { observation: set.observation, error: "Enter valid rounds and work values for " + label + "." }
        : { observation: { version: 1, profile: "intervals", protocolId: set.target.protocolId, completedRounds, completedWorkMs, source }, error: null };
    }
    case "unscored":
      return { observation: { version: 1, profile: "unscored", completed: true, source }, error: null };
  }
}

function fieldsForSet(set: CorrectionSet, label: string): readonly Readonly<{
  field: string;
  label: string;
  kind: "integer" | "decimal";
  minimum: number;
}>[] {
  switch (set.target.profile) {
    case "load_reps": return [{ field: "loadKg", label: label + " load kg", kind: "decimal", minimum: 0 }, { field: "reps", label: label + " reps", kind: "integer", minimum: 1 }];
    case "bodyweight_reps": return [{ field: "reps", label: label + " reps", kind: "integer", minimum: 1 }];
    case "added_load_reps": return [{ field: "addedLoadKg", label: label + " added load kg", kind: "decimal", minimum: 0 }, { field: "reps", label: label + " reps", kind: "integer", minimum: 1 }];
    case "assisted_reps": return [{ field: "assistanceKg", label: label + " assistance kg", kind: "decimal", minimum: 0 }, { field: "reps", label: label + " reps", kind: "integer", minimum: 1 }];
    case "timed_hold": return [{ field: "durationSeconds", label: label + " duration seconds", kind: "integer", minimum: 1 }];
    case "fixed_distance": return [{ field: "distanceMeters", label: label + " distance meters", kind: "integer", minimum: 1 }, { field: "durationSeconds", label: label + " duration seconds", kind: "integer", minimum: 1 }];
    case "fixed_time": return [{ field: "durationSeconds", label: label + " duration seconds", kind: "integer", minimum: 1 }, { field: "distanceMeters", label: label + " distance meters", kind: "integer", minimum: 0 }];
    case "intervals": return [{ field: "rounds", label: label + " rounds", kind: "integer", minimum: 0 }, { field: "workSeconds", label: label + " work seconds", kind: "integer", minimum: 0 }];
    case "unscored": return [];
  }
}

function localTimeParts(instantMs: number, timezone: string): Readonly<{
  hour: string;
  minute: string;
}> {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      timeZone: timezone,
    });
    const parts = new Map(formatter.formatToParts(new Date(instantMs))
      .filter(({ type }) => type === "hour" || type === "minute")
      .map(({ type, value }) => [type, value]));
    return {
      hour: parts.get("hour") ?? "0",
      minute: parts.get("minute") ?? "0",
    };
  } catch {
    return { hour: "0", minute: "0" };
  }
}

function instantForLocalTime(
  localDate: string,
  timezone: string,
  hour: number,
  minute: number,
): number | null {
  const center = Date.parse(localDate + "T12:00:00Z");
  if (!Number.isSafeInteger(center)) {
    return null;
  }
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone: timezone,
      year: "numeric",
    });
    for (let offsetMinutes = -1_440; offsetMinutes <= 1_440; offsetMinutes += 1) {
      const candidate = center + offsetMinutes * 60_000;
      const parts = new Map(formatter.formatToParts(new Date(candidate))
        .filter(({ type }) => (
          type === "year" || type === "month" || type === "day"
          || type === "hour" || type === "minute"
        ))
        .map(({ type, value }) => [type, value]));
      const candidateDate = (parts.get("year") ?? "")
        + "-" + (parts.get("month") ?? "")
        + "-" + (parts.get("day") ?? "");
      if (
        candidateDate === localDate
        && Number(parts.get("hour")) === hour
        && Number(parts.get("minute")) === minute
      ) {
        return candidate;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function safeClockPart(value: string, maximum: number): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= maximum
    ? parsed
    : null;
}

function auditLabel(event: HistoryAuditEvent): string {
  const field = event.fieldIdentity === "session.ownerNote"
    ? "Owner note"
    : event.fieldIdentity.replace(/^session\./u, "").replace(/([A-Z])/gu, " $1");
  const display = (value: unknown) => value === null || value === undefined
    ? "No value"
    : typeof value === "string" || typeof value === "number"
      ? String(value)
      : "Updated value";
  return field + " · " + display(event.before) + " → " + display(event.after);
}

export function SessionCorrectionScreen({
  sessionId,
  loadCorrectionSession,
  listAvailableExercises,
  correctSession,
  onBack,
  onSaved,
  createAddedSetId,
  width,
}: SessionCorrectionScreenProps) {
  const { colors } = useAppTheme();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [editor, setEditor] = useState<HistoryCorrectionEditorState | null>(null);
  const [draft, setDraft] = useState<HistoryCorrectionSnapshot | null>(null);
  const [available, setAvailable] = useState<readonly AvailableCorrectionExercise[]>([]);
  const [text, setText] = useState<DraftText>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [auditVisible, setAuditVisible] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);
  const addSequence = useRef(0);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const loaded = await loadCorrectionSession(sessionId);
      const exercises = await listAvailableExercises().catch(() => []);
      setEditor(loaded);
      setDraft(cloneSnapshot(loaded.snapshot));
      setAvailable(exercises);
      setText({});
      setValidationError(null);
      setSaveState("idle");
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [listAvailableExercises, loadCorrectionSession, sessionId]);

  useEffect(() => { void load(); }, [load]);

  const changeSet = useCallback((exerciseId: string, setId: string, update: (set: CorrectionSet) => CorrectionSet) => {
    setDraft((current) => current === null ? null : {
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id !== exerciseId
        ? exercise
        : { ...exercise, sets: exercise.sets.map((set) => set.id === setId ? update(set) : set) }),
    });
  }, []);

  const addSet = useCallback((exerciseId: string) => {
    addSequence.current += 1;
    setDraft((current) => {
      if (current === null) { return null; }
      return {
        ...current,
        exercises: current.exercises.map((exercise) => {
          if (exercise.id !== exerciseId || exercise.sets.length === 0) { return exercise; }
          const source = exercise.sets[exercise.sets.length - 1]!;
          return {
            ...exercise,
            sets: [...exercise.sets, {
              ...source,
              id: createAddedSetId?.() ?? "history-added:" + sessionId + ":" + addSequence.current,
              kind: "working",
              ordinal: source.ordinal + 1,
              completedAtMs: current.session.completedAtMs ?? current.session.startedAtMs,
            }],
          };
        }),
      };
    });
  }, [createAddedSetId, sessionId]);

  const save = useCallback(async () => {
    if (editor === null || draft === null) { return; }
    let error: string | null = null;
    const startLocal = localTimeParts(draft.session.startedAtMs, draft.session.timezone);
    const startHour = safeClockPart(text.startHour ?? startLocal.hour, 23);
    const startMinute = safeClockPart(text.startMinute ?? startLocal.minute, 59);
    const completedLocal = draft.session.completedAtMs === null
      ? null
      : localTimeParts(draft.session.completedAtMs, draft.session.timezone);
    const completedHour = completedLocal === null
      ? null
      : safeClockPart(text.completedHour ?? completedLocal.hour, 23);
    const completedMinute = completedLocal === null
      ? null
      : safeClockPart(text.completedMinute ?? completedLocal.minute, 59);
    const startedAtMs = startHour === null || startMinute === null
      ? null
      : instantForLocalTime(
        draft.session.localDate,
        draft.session.timezone,
        startHour,
        startMinute,
      );
    const completedAtMs = completedLocal === null
      ? null
      : completedHour === null || completedMinute === null
        ? null
        : instantForLocalTime(
          draft.session.localDate,
          draft.session.timezone,
          completedHour,
          completedMinute,
        );
    if (startedAtMs === null) {
      error = "Enter a valid local start time.";
    }
    if (error === null && completedLocal !== null && completedAtMs === null) {
      error = "Enter a valid local completed time.";
    }
    if (error === null && startedAtMs !== null && completedAtMs !== null && completedAtMs < startedAtMs) {
      error = "Completed time must be after start time.";
    }
    const next = {
      ...draft,
      session: {
        ...draft.session,
        startedAtMs: startedAtMs ?? draft.session.startedAtMs,
        completedAtMs,
      },
      exercises: draft.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set) => {
          const label = (set.kind === "warmup" ? "Warm-up " : "Working set ") + (set.ordinal + 1);
          const result = updatedObservation(set, text, label);
          if (error === null && result.error !== null) { error = result.error; }
          return result.observation === undefined ? set : { ...set, observation: result.observation };
        }),
      })),
    };
    if (error !== null) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setSaveState("saving");
    try {
      await correctSession({
        base: editor.snapshot,
        expectedEffectiveRevision: editor.effectiveRevision,
        next,
      });
      onSaved(sessionId);
    } catch (errorValue) {
      setSaveState(errorValue instanceof HistoryCorrectionConflictError
        || (typeof errorValue === "object" && errorValue !== null && "kind" in errorValue && errorValue.kind === "conflict")
        ? "conflict"
        : "failure");
    }
  }, [correctSession, draft, editor, onSaved, sessionId, text]);

  const adaptiveWidth = width === undefined ? {} : { width };
  const screen = (primary: React.ReactNode) => (
    <View style={[styles.root, { backgroundColor: colors.canvas }]} testID="session-correction-screen">
      <AdaptiveScreen {...adaptiveWidth} onRequestBack={onBack} primary={primary} />
    </View>
  );
  if (loadState === "loading") {
    return screen(<><ScreenHeader backAction={onBack} title="Correct workout" /><View testID="session-correction-skeleton"><SkeletonBlock height={64} /><SkeletonBlock height={160} /><SkeletonBlock height={160} /></View></>);
  }
  if (loadState === "error" || editor === null || draft === null) {
    return screen(<><ScreenHeader backAction={onBack} title="Correct workout" /><EmptyState body="The saved workout was not changed. Retry loading the correction editor." heading="Workout correction could not be loaded" primaryAction={<PrimaryAction label="Retry correction" onPress={() => void load()} />} /></>);
  }
  return screen(<>
    <ScreenHeader backAction={onBack} eyebrow="EDIT HISTORY" title="Correct workout" />
    <InlineNotice body="The original workout remains unchanged. Saving writes a new effective history revision." heading="Correction draft" />
    {saveState === "conflict" ? <InlineNotice action={<SecondaryAction label="Reload workout" onPress={() => void load()} />} body="Reload the latest saved workout before saving this correction. Your local inputs stay here until you choose Reload workout." heading="Workout changed elsewhere" tone="attention" /> : null}
    {saveState === "failure" ? <InlineNotice body="Your edits are still here. Try saving the correction again." heading="Save failed" tone="error" /> : null}
    {validationError === null ? null : <InlineNotice body={validationError} heading="Correction needs attention" tone="error" />}
    <SectionHeader title="Session" />
    <CalendarField label="Workout date" onChange={(localDate) => setDraft((current) => current === null ? null : { ...current, session: { ...current.session, localDate } })} value={draft.session.localDate} />
    <View style={styles.timeRow}>
      <View style={styles.timeField}>
        <SemanticNumberField kind="integer" label="Start hour" maximum={23} minimum={0} onChangeText={(value) => setText((current) => ({ ...current, startHour: value }))} value={text.startHour ?? localTimeParts(draft.session.startedAtMs, draft.session.timezone).hour} />
      </View>
      <View style={styles.timeField}>
        <SemanticNumberField kind="integer" label="Start minute" maximum={59} minimum={0} onChangeText={(value) => setText((current) => ({ ...current, startMinute: value }))} value={text.startMinute ?? localTimeParts(draft.session.startedAtMs, draft.session.timezone).minute} />
      </View>
    </View>
    {draft.session.completedAtMs === null ? null : <View style={styles.timeRow}>
      <View style={styles.timeField}>
        <SemanticNumberField kind="integer" label="Completed hour" maximum={23} minimum={0} onChangeText={(value) => setText((current) => ({ ...current, completedHour: value }))} value={text.completedHour ?? localTimeParts(draft.session.completedAtMs!, draft.session.timezone).hour} />
      </View>
      <View style={styles.timeField}>
        <SemanticNumberField kind="integer" label="Completed minute" maximum={59} minimum={0} onChangeText={(value) => setText((current) => ({ ...current, completedMinute: value }))} value={text.completedMinute ?? localTimeParts(draft.session.completedAtMs!, draft.session.timezone).minute} />
      </View>
    </View>}
    <PlanEditorTextField help={"Stored timezone · " + draft.session.timezone} label="Owner note" multiline onChangeText={(ownerNote) => setDraft((current) => current === null ? null : { ...current, session: { ...current.session, ownerNote: ownerNote === "" ? null : ownerNote } })} value={draft.session.ownerNote ?? ""} />
    <SectionHeader title="Exercises and sets" />
    {draft.exercises.map((exercise) => <ContentCard key={exercise.id} testID={"correction-exercise-" + exercise.id}><View style={styles.exercise}>
      <SectionHeader supportingText={exercise.metricIdentity.profile.replaceAll("_", " ")} title={exercise.name} />
      <View accessibilityLabel={exercise.name + " effort"} accessibilityRole="radiogroup" style={styles.options}>
        {(["easy", "on_target", "hard", "failed"] as const).map((effort) => <FocusablePressable accessibilityLabel={effort.replaceAll("_", " ")} accessibilityRole="radio" accessibilityState={{ selected: exercise.effort === effort }} focusable key={effort} onPress={() => setDraft((current) => current === null ? null : { ...current, exercises: current.exercises.map((item) => item.id === exercise.id ? { ...item, effort } : item) })} style={[styles.option, { backgroundColor: exercise.effort === effort ? colors.surfaceSubtle : colors.surface, borderColor: exercise.effort === effort ? colors.action : colors.divider }]}><Text style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>{effort.replaceAll("_", " ")}</Text></FocusablePressable>)}
      </View>
      <SecondaryAction label={"Replace " + exercise.name} onPress={() => setReplacing(replacing === exercise.id ? null : exercise.id)} />
      {replacing !== exercise.id ? null : <View accessibilityLabel={"Replace " + exercise.name} accessibilityRole="radiogroup" style={styles.options}>
        {available.map((candidate) => {
          const compatible = candidate.metricIdentity.profile === exercise.metricIdentity.profile && candidate.metricIdentity.contractVersion === exercise.metricIdentity.contractVersion && candidate.metricIdentity.exerciseMetricGeneration === exercise.metricIdentity.exerciseMetricGeneration;
          return <FocusablePressable accessibilityLabel={candidate.name + (compatible ? "" : ". Incompatible recorded metric identity")} accessibilityRole="radio" accessibilityState={{ disabled: !compatible, selected: candidate.exerciseId === exercise.exerciseId }} disabled={!compatible} focusable={compatible} key={candidate.exerciseId} onPress={() => setDraft((current) => current === null ? null : { ...current, exercises: current.exercises.map((item) => item.id === exercise.id ? { ...item, exerciseId: candidate.exerciseId, name: candidate.name, metricIdentity: candidate.metricIdentity } : item) })} style={[styles.option, { backgroundColor: colors.surface, borderColor: candidate.exerciseId === exercise.exerciseId ? colors.action : colors.divider }]}><Text style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>{candidate.name}</Text></FocusablePressable>;
        })}
      </View>}
      {exercise.sets.map((set) => {
        const label = (set.kind === "warmup" ? "Warm-up " : "Working set ") + (set.ordinal + 1);
        return <View key={set.id} style={[styles.set, { borderColor: colors.divider }]}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{label}</Text>{fieldsForSet(set, label).map((field) => <SemanticNumberField key={field.field} kind={field.kind} label={field.label} minimum={field.minimum} onChangeText={(value) => setText((current) => ({ ...current, [setKey(set.id, field.field)]: value }))} value={text[setKey(set.id, field.field)] ?? fallbackValue(set, field.field)} />)}<SecondaryAction label={"Change set " + (set.ordinal + 1) + " to " + (set.kind === "working" ? "warm-up" : "working")} onPress={() => changeSet(exercise.id, set.id, (entry) => ({ ...entry, kind: entry.kind === "working" ? "warmup" : "working" }))} /><SecondaryAction destructive label={"Remove set " + (set.ordinal + 1)} onPress={() => setDraft((current) => current === null ? null : { ...current, exercises: current.exercises.map((item) => item.id === exercise.id ? { ...item, sets: item.sets.filter((entry) => entry.id !== set.id) } : item) })} /></View>;
      })}
      <SecondaryAction label={"Add set to " + exercise.name} onPress={() => addSet(exercise.id)} />
    </View></ContentCard>)}
    <SectionHeader title="Association" />
    <PlanEditorTextField label="Plan ID" onChangeText={(planId) => setDraft((current) => current === null ? null : { ...current, session: { ...current.session, planId: planId === "" ? null : planId, planDayId: planId === "" ? null : current.session.planDayId } })} value={draft.session.planId ?? ""} />
    <PlanEditorTextField label="Plan day ID" onChangeText={(planDayId) => setDraft((current) => current === null ? null : { ...current, session: { ...current.session, planDayId: planDayId === "" ? null : planDayId } })} value={draft.session.planDayId ?? ""} />
    <SecondaryAction label={(auditVisible ? "Hide" : "Show") + " correction history"} onPress={() => setAuditVisible((current) => !current)} />
    {auditVisible ? <View style={styles.audit}><SectionHeader title="Correction history" />{editor.auditEvents.length === 0 ? <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>No corrections have been saved for this workout.</Text> : editor.auditEvents.map((event) => <View key={event.id} style={[styles.auditEvent, { borderColor: colors.divider }]}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{auditLabel(event)}</Text><Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>Saved correction</Text></View>)}</View> : null}
    <View style={styles.actions}><SecondaryAction label="Cancel" onPress={onBack} /><PrimaryAction busy={saveState === "saving"} label="Save correction" onPress={() => void save()} /></View>
  </>);
}

const styles = StyleSheet.create({
  actions: { gap: space[2] },
  audit: { gap: space[2] },
  auditEvent: { borderBottomWidth: StyleSheet.hairlineWidth, gap: space[1], paddingBottom: space[2] },
  exercise: { gap: space[4] },
  option: { borderRadius: radius.standard, borderWidth: StyleSheet.hairlineWidth, minHeight: sizes.minimumTarget, padding: space[2] },
  options: { gap: space[2] },
  root: { flex: 1 },
  set: { borderTopWidth: StyleSheet.hairlineWidth, gap: space[2], paddingTop: space[4] },
  timeField: { flex: 1, minWidth: 0 },
  timeRow: { flexDirection: "row", gap: space[2] },
});

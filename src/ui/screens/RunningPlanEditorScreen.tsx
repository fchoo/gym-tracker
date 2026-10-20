import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, TextInput, View, type TextStyle } from "react-native";

import { RUNNING_SESSION_KINDS, type RunningPlanAggregate, type RunningSessionKind } from "../../domains/running/contracts";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { EmptyState, FocusablePressable, InlineNotice, PrimaryAction, ScreenHeader, SecondaryAction } from "../components";
import { PlanEditorReorderableRow, PlanEditorTextField, TimeDurationField } from "../components/PlanEditorFields";
import { runningSessionReadback } from "../components/RunningSessionFields";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import { space, typeScale, useAppTheme } from "../theme";
import { requestAndroidViewFocus } from "../../bootstrap/androidViewFocus";
import {
  addRunningSessionDraft, deleteRunningSessionDraft, makeRunningSessionDraft,
  reorderRunningSessionDraft, runningPlanCommandFromDraft, validateRunningPlanDraft,
  type RunningPlanDraft, type RunningPlanDraftValidation,
} from "../running/runningFormDraft";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const sessionName = (kind: RunningSessionKind) => kind === "long_run" ? "Long run" : `${kind[0]!.toUpperCase()}${kind.slice(1)}`;
const validationCopy: Record<RunningPlanDraftValidation, string> = {
  running_goal_distance_invalid: "Enter a valid goal distance.",
  running_goal_days_invalid: "Choose at least one available day.",
  running_goal_duration_invalid: "Enter a valid target time.",
  running_goal_target_date_invalid: "Choose a future target date or leave it blank.",
  running_goal_runs_per_week_invalid: "",
  running_goal_long_run_day_invalid: "Choose a long-run day from the available days.",
  running_goal_weekly_distance_invalid: "Enter a valid current weekly distance.",
  running_goal_benchmark_invalid: "Enter a valid benchmark distance, time, and recorded date.",
  running_session_invalid: "Review the saved session order and details.",
};
const benchmarkSourceLabel = (source: "owner_selected" | "imported_activity" | "personal_history" | "manual") => ({ owner_selected: "Manual", imported_activity: "Imported activity", personal_history: "Personal history", manual: "Manual" })[source];
const nextBenchmarkSource = (source: "owner_selected" | "imported_activity" | "personal_history" | "manual") => ({ owner_selected: "imported_activity", imported_activity: "personal_history", personal_history: "manual", manual: "imported_activity" } as const)[source];

export type SessionDeleteFocusTarget = Readonly<{ kind: "row"; slotRootId: string }> | Readonly<{ kind: "add" }>;

export function sessionDeleteFocusTarget(slotRootIds: readonly string[], deletedIndex: number): SessionDeleteFocusTarget {
  const next = slotRootIds[deletedIndex + 1];
  if (next !== undefined) return { kind: "row", slotRootId: next };
  const previous = slotRootIds[deletedIndex - 1];
  return previous === undefined ? { kind: "add" } : { kind: "row", slotRootId: previous };
}

const sessionEditNativeID = (slotRootId: string) => `running-plan-session-edit-${slotRootId}`;
const sessionDeleteNativeID = (slotRootId: string) => `running-plan-session-delete-${slotRootId}`;

/** A screen-local draft editor; commits only through the owning revisioned command. */
export function RunningPlanEditorScreen(props: Readonly<{
  initialDraft: RunningPlanDraft;
  createId(kind: string): string;
  savePlan(draft: RunningPlanDraft): Promise<RunningPlanAggregate>;
  onBack(): void;
  onSaved(planId: string): void;
  onOpenSession?(sessionRootId?: string): void;
  title?: string;
}>) {
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState(props.initialDraft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leaveVisible, setLeaveVisible] = useState(false);
  const [pendingSession, setPendingSession] = useState<string | undefined | null>(null);
  const [pendingDeleteSlotRootId, setPendingDeleteSlotRootId] = useState<string | null>(null);
  const [pendingPostDeleteFocus, setPendingPostDeleteFocus] = useState<SessionDeleteFocusTarget | null>(null);
  const [deleteRestoreNativeID, setDeleteRestoreNativeID] = useState<string | undefined>(undefined);
  const [leaveRestoreNativeID, setLeaveRestoreNativeID] = useState<string | undefined>(undefined);
  const saveRef = useRef<View>(null);
  const saveErrorRef = useRef<View>(null);
  const distanceRef = useRef<TextInput>(null);
  const timeRef = useRef<View>(null);
  const dateRef = useRef<TextInput>(null);
  const runsRef = useRef<TextInput>(null);
  const daysRef = useRef<View>(null);
  const longRunRef = useRef<View>(null);
  const weeklyDistanceRef = useRef<TextInput>(null);
  const addSessionRef = useRef<View>(null);
  const deleteRestoreRef = useRef<View>(null);
  const leaveRestoreRef = useRef<View>(null);
  const sessionEditRefs = useRef(new Map<string, View | null>());
  const sessionDeleteRefs = useRef(new Map<string, View | null>());

  useEffect(() => { setDraft(props.initialDraft); }, [props.initialDraft]);
  useEffect(() => {
    if (pendingPostDeleteFocus === null) return;
    const target = pendingPostDeleteFocus.kind === "add"
      ? addSessionRef.current
      : sessionEditRefs.current.get(pendingPostDeleteFocus.slotRootId) ?? null;
    const nativeID = pendingPostDeleteFocus.kind === "add"
      ? "running-plan-add-session"
      : sessionEditNativeID(pendingPostDeleteFocus.slotRootId);
    target?.focus?.();
    void requestAndroidViewFocus(nativeID);
    setPendingPostDeleteFocus(null);
  }, [draft.sessions, pendingPostDeleteFocus]);
  useEffect(() => {
    if (error === null || !error.startsWith("Running plan could not be saved.")) return;
    requestAnimationFrame(() => {
      saveErrorRef.current?.focus?.();
      void requestAndroidViewFocus("running-plan-save-error-heading");
    });
  }, [error]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(props.initialDraft), [draft, props.initialDraft]);
  const add = (kind: RunningSessionKind) => setDraft((current) => addRunningSessionDraft(current, makeRunningSessionDraft({
    id: props.createId("running-session-revision"), rootId: props.createId("running-session"),
    slotId: props.createId("running-slot-revision"), slotRootId: props.createId("running-slot"),
    planId: current.id, kind, weekday: current.goal.trainingDays[0] ?? "Monday", ordinal: current.sessions.length, createdAtMs: current.createdAtMs,
  })));
  const move = (from: number, to: number) => setDraft((current) => {
    const order = current.sessions.map((entry) => entry.slot.rootId);
    const [moved] = order.splice(from, 1);
    if (moved === undefined) return current;
    order.splice(to, 0, moved);
    return reorderRunningSessionDraft(current, order);
  });
  const pendingDelete = pendingDeleteSlotRootId === null ? undefined : draft.sessions.find((entry) => entry.slot.rootId === pendingDeleteSlotRootId);
  const focusFirstInvalid = (validation: RunningPlanDraftValidation) => {
    const target = validation === "running_goal_distance_invalid" ? distanceRef
      : validation === "running_goal_duration_invalid" ? timeRef
      : validation === "running_goal_target_date_invalid" ? dateRef
      : validation === "running_goal_runs_per_week_invalid" ? runsRef
      : validation === "running_goal_days_invalid" ? daysRef
      : validation === "running_goal_long_run_day_invalid" ? longRunRef
      : validation === "running_goal_weekly_distance_invalid" ? weeklyDistanceRef
      : saveRef;
    requestAnimationFrame(() => target.current?.focus?.());
  };
  const save = async () => {
    const validation = validateRunningPlanDraft(draft);
    if (validation !== null) {
      const message = validation === "running_goal_runs_per_week_invalid"
        ? `Choose enough available days for your ${draft.goal.runsPerWeek ?? 0} weekly sessions, or add another ordered session to a selected day.`
        : validationCopy[validation];
      setError(`Running plan needs attention. ${message}`);
      AccessibilityInfo.announceForAccessibility("Running plan needs attention.");
      focusFirstInvalid(validation);
      return;
    }
    setSaving(true); setError(null);
    try {
      const committed = await props.savePlan(runningPlanCommandFromDraft(draft));
      AccessibilityInfo.announceForAccessibility(`${props.title === undefined ? "Running plan created" : "Running plan saved"}. Activation stays separate.`);
      props.onSaved(committed.id);
      if (pendingSession !== null) props.onOpenSession?.(pendingSession);
    } catch {
      setError("Running plan could not be saved. Your edits are still here. Try again.");
      AccessibilityInfo.announceForAccessibility("Running plan could not be saved. Your edits are still here. Retry saving plan.");
    } finally { setSaving(false); }
  };
  const leave = () => {
    setLeaveVisible(false);
    if (pendingSession !== null) props.onOpenSession?.(pendingSession); else props.onBack();
  };
  const createLabel = props.title === undefined ? "Create running plan" : "Save running plan";
  const invalid = (code: RunningPlanDraftValidation) => code === "running_goal_runs_per_week_invalid"
    ? (error?.includes("weekly sessions") ? error.replace("Running plan needs attention. ", "") : undefined)
    : (validationCopy[code] !== "" && error?.includes(validationCopy[code]) ? validationCopy[code] : undefined);
  const saveFailure = error?.startsWith("Running plan could not be saved.") ?? false;
  const primary = <>
    <ScreenHeader backAction={() => dirty ? setLeaveVisible(true) : props.onBack()} density="deep" eyebrow="RUNNING" title={props.title ?? "Goal and weekly sessions"} />
    <Text style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Goal and weekly sessions</Text>
    <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Set the outcome, then choose the purpose and structure of each run.</Text>
    <PlanEditorTextField label="Plan name" onChangeText={(name) => setDraft((current) => ({ ...current, name }))} value={draft.name} />
    <PlanEditorTextField error={invalid("running_goal_distance_invalid")} help="Required. Enter metres." inputRef={distanceRef} keyboardType="decimal-pad" label="Goal distance (metres)" onChangeText={(value) => setDraft((current) => ({ ...current, goal: { ...current.goal, goalDistanceMeters: Number(value) } }))} value={draft.goal.goalDistanceMeters === 0 ? "" : String(draft.goal.goalDistanceMeters)} />
    <TimeDurationField {...(invalid("running_goal_duration_invalid") === undefined ? {} : { error: invalid("running_goal_duration_invalid") })} help="Required. Enter hours, minutes, and seconds." label="Target time" onChangeText={(seconds) => setDraft((current) => ({ ...current, goal: { ...current.goal, targetDurationMs: seconds === "" ? undefined : Number(seconds) * 1000 } }))} triggerRef={timeRef} value={draft.goal.targetDurationMs === undefined ? "" : String(draft.goal.targetDurationMs / 1000)} />
    {draft.goal.benchmark === undefined ? <><Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Current benchmark</Text><Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>No benchmark recorded</Text><SecondaryAction label="Add manual benchmark" onPress={() => setDraft((current) => ({ ...current, goal: { ...current.goal, benchmark: { source: "manual", distanceMeters: 0, durationMs: 0, localDate: "" } } }))} /></> : <><Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Current benchmark</Text><PlanEditorTextField error={invalid("running_goal_benchmark_invalid")} help="Recorded metres." keyboardType="decimal-pad" label="Benchmark distance (metres)" onChangeText={(value) => setDraft((current) => current.goal.benchmark === undefined ? current : ({ ...current, goal: { ...current.goal, benchmark: { ...current.goal.benchmark, distanceMeters: Number(value) } } }))} value={draft.goal.benchmark.distanceMeters === 0 ? "" : String(draft.goal.benchmark.distanceMeters)} /><TimeDurationField help="Recorded benchmark duration." label="Benchmark time" onChangeText={(seconds) => setDraft((current) => current.goal.benchmark === undefined ? current : ({ ...current, goal: { ...current.goal, benchmark: { ...current.goal.benchmark, durationMs: Number(seconds) * 1000 } } }))} value={draft.goal.benchmark.durationMs === 0 ? "" : String(draft.goal.benchmark.durationMs / 1000)} /><SecondaryAction label={`Benchmark source: ${benchmarkSourceLabel(draft.goal.benchmark.source)}`} onPress={() => setDraft((current) => current.goal.benchmark === undefined ? current : ({ ...current, goal: { ...current.goal, benchmark: { ...current.goal.benchmark, source: nextBenchmarkSource(current.goal.benchmark.source) } } }))} /><PlanEditorTextField error={invalid("running_goal_benchmark_invalid")} help="Required. Use YYYY-MM-DD." label="Benchmark recorded date" onChangeText={(localDate) => setDraft((current) => current.goal.benchmark === undefined ? current : ({ ...current, goal: { ...current.goal, benchmark: { ...current.goal.benchmark, localDate } } }))} value={draft.goal.benchmark.localDate} /></>}
    <PlanEditorTextField error={invalid("running_goal_target_date_invalid")} help="Optional. Use YYYY-MM-DD." inputRef={dateRef} label="Target date (optional)" onChangeText={(targetLocalDate) => setDraft((current) => ({ ...current, goal: { ...current.goal, targetLocalDate: targetLocalDate === "" ? undefined : targetLocalDate } }))} value={draft.goal.targetLocalDate ?? ""} />
    <PlanEditorTextField error={invalid("running_goal_runs_per_week_invalid")} help="Required whole number." inputRef={runsRef} keyboardType="number-pad" label="Runs per week" onChangeText={(value) => setDraft((current) => ({ ...current, goal: { ...current.goal, runsPerWeek: Number(value) } }))} value={draft.goal.runsPerWeek === undefined ? "" : String(draft.goal.runsPerWeek)} />
    <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Available days</Text>
    <View style={styles.dayGrid}>{WEEKDAYS.map((day, index) => { const selected = draft.goal.trainingDays.includes(day); return <FocusablePressable accessibilityLabel={`${day}, ${selected ? "selected" : "not selected"}`} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} focusable key={day} onPress={() => setDraft((current) => ({ ...current, goal: { ...current.goal, trainingDays: selected ? current.goal.trainingDays.filter((value) => value !== day) : [...current.goal.trainingDays, day] } }))} ref={index === 0 ? daysRef : undefined} style={[styles.dayOption, { backgroundColor: selected ? colors.blueBg : colors.surface, borderColor: selected ? colors.action : colors.divider }]} testID={index === 0 ? "running-plan-training-day-Monday" : `running-plan-training-day-${day}`}><Text style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>{day}</Text></FocusablePressable>; })}</View>
    {invalid("running_goal_days_invalid") === undefined ? null : <Text accessibilityLiveRegion="polite" style={[typeScale.secondary as TextStyle, { color: colors.destructive }]}>{validationCopy.running_goal_days_invalid}</Text>}
    <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Long-run day</Text>
    <View style={styles.dayGrid}><FocusablePressable accessibilityLabel="Long-run day not set" accessibilityRole="radio" accessibilityState={{ selected: draft.goal.longRunDay === undefined }} focusable onPress={() => setDraft((current) => ({ ...current, goal: { ...current.goal, longRunDay: undefined } }))} ref={longRunRef} style={[styles.dayOption, { backgroundColor: draft.goal.longRunDay === undefined ? colors.blueBg : colors.surface, borderColor: draft.goal.longRunDay === undefined ? colors.action : colors.divider }]}><Text style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>Not set</Text></FocusablePressable>{draft.goal.trainingDays.map((day) => <FocusablePressable accessibilityLabel={`Long-run day ${day}`} accessibilityRole="radio" accessibilityState={{ selected: draft.goal.longRunDay === day }} focusable key={day} onPress={() => setDraft((current) => ({ ...current, goal: { ...current.goal, longRunDay: day } }))} style={[styles.dayOption, { backgroundColor: draft.goal.longRunDay === day ? colors.blueBg : colors.surface, borderColor: draft.goal.longRunDay === day ? colors.action : colors.divider }]}><Text style={[typeScale.body as TextStyle, { color: colors.textPrimary }]}>{day}</Text></FocusablePressable>)}</View>
    {invalid("running_goal_long_run_day_invalid") === undefined ? null : <Text accessibilityLiveRegion="polite" style={[typeScale.secondary as TextStyle, { color: colors.destructive }]}>{validationCopy.running_goal_long_run_day_invalid}</Text>}
    <PlanEditorTextField error={invalid("running_goal_weekly_distance_invalid")} help="Optional. Enter metres; this is a descriptive fact, not a prescription." inputRef={weeklyDistanceRef} keyboardType="decimal-pad" label="Current weekly distance (metres)" onChangeText={(value) => setDraft((current) => ({ ...current, goal: { ...current.goal, currentWeeklyDistanceMeters: value === "" ? undefined : Number(value) } }))} value={draft.goal.currentWeeklyDistanceMeters === undefined ? "" : String(draft.goal.currentWeeklyDistanceMeters)} />
    <View style={styles.summary}><Text style={[typeScale.label as TextStyle, { color: colors.textSecondary }]}>Sessions</Text><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{draft.goal.runsPerWeek === undefined ? "Not set" : `${draft.goal.runsPerWeek} / week`}</Text><Text style={[typeScale.label as TextStyle, { color: colors.textSecondary }]}>Schedule</Text><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{draft.goal.trainingDays.join(", ") || "Not set"}</Text></View>
    <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Weekly structure</Text>
    <View style={styles.actionList}>{RUNNING_SESSION_KINDS.map((kind) => <SecondaryAction key={kind} label={`Add ${sessionName(kind)} session`} onPress={() => add(kind)} />)}</View>
    {draft.sessions.length === 0 ? <EmptyState body="Add a Recovery, Long run, Progression, Tempo, Intervals, Hills, or Fartlek session." heading="No sessions yet" primaryAction={<SecondaryAction label="Add session" nativeID="running-plan-add-session" onPress={() => add("recovery")} ref={addSessionRef} />} /> : draft.sessions.map((session, index) => <PlanEditorReorderableRow key={session.slot.rootId} count={draft.sessions.length} label={`${session.slot.weekday} · ${sessionName(session.session.sessionKind)}`} moveEarlierLabel={`Move ${sessionName(session.session.sessionKind)} earlier`} moveLaterLabel={`Move ${sessionName(session.session.sessionKind)} later`} onMoveDown={() => move(index, index + 1)} onMoveUp={() => move(index, index - 1)} position={index}><View style={styles.sessionSummary}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{`${session.slot.weekday} · ${sessionName(session.session.sessionKind)}`}</Text><Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{runningSessionReadback(session)}</Text><SecondaryAction label={`Edit ${sessionName(session.session.sessionKind)} session`} nativeID={sessionEditNativeID(session.slot.rootId)} onPress={() => { leaveRestoreRef.current = sessionEditRefs.current.get(session.slot.rootId) ?? null; setLeaveRestoreNativeID(sessionEditNativeID(session.slot.rootId)); if (dirty) { setPendingSession(session.session.rootId); setLeaveVisible(true); } else props.onOpenSession?.(session.session.rootId); }} ref={(node) => { sessionEditRefs.current.set(session.slot.rootId, node); }} /><SecondaryAction destructive label={`Delete ${sessionName(session.session.sessionKind)} session`} nativeID={sessionDeleteNativeID(session.slot.rootId)} onPress={() => { deleteRestoreRef.current = sessionDeleteRefs.current.get(session.slot.rootId) ?? null; setDeleteRestoreNativeID(sessionDeleteNativeID(session.slot.rootId)); setPendingDeleteSlotRootId(session.slot.rootId); }} ref={(node) => { sessionDeleteRefs.current.set(session.slot.rootId, node); }} /></View></PlanEditorReorderableRow>)}
    {error === null ? null : <InlineNotice action={<SecondaryAction label="Retry saving plan" onPress={() => void save()} />} body={error} heading={saveFailure ? "Running plan could not be saved" : "Running plan needs attention"} {...(saveFailure ? { focusable: true, nativeID: "running-plan-save-error-heading", noticeRef: saveErrorRef } : {})} tone="error" />}
    <PrimaryAction busy={saving} disabled={saving} label={saving ? "Saving plan…" : createLabel} onPress={() => void save()} ref={saveRef} />
  </>;
  return <><AdaptiveScreen primary={primary} testID="running-plan-editor" />
    <ConfirmationDialog alternateLabel="Discard changes" body="Your edits are still here. Choose whether to save the complete plan, discard the local draft, or keep editing." cancelLabel="Keep editing" confirmBusy={saving} confirmLabel="Save changes" heading="Save changes?" onAlternate={leave} onCancel={() => { setLeaveVisible(false); setPendingSession(null); }} onConfirm={() => void save()} requestNativeFocus={requestAndroidViewFocus} restoreFocusNativeID={leaveRestoreNativeID} restoreFocusRef={leaveRestoreRef} visible={leaveVisible} />
    <ConfirmationDialog body="This removes the session from future versions of this plan. Past occurrences and matched activities stay unchanged." cancelLabel="Keep session" confirmLabel="Delete session" destructive heading={`Delete ${pendingDelete === undefined ? "" : sessionName(pendingDelete.session.sessionKind)} session?`} onCancel={() => setPendingDeleteSlotRootId(null)} onConfirm={() => { if (pendingDelete !== undefined) { const index = draft.sessions.findIndex((entry) => entry.slot.rootId === pendingDelete.slot.rootId); setPendingPostDeleteFocus(sessionDeleteFocusTarget(draft.sessions.map((entry) => entry.slot.rootId), index)); setDraft((current) => deleteRunningSessionDraft(current, pendingDelete.slot.rootId)); } setPendingDeleteSlotRootId(null); }} requestNativeFocus={requestAndroidViewFocus} restoreFocusNativeID={deleteRestoreNativeID} restoreFocusRef={deleteRestoreRef} visible={pendingDelete !== undefined} />
  </>;
}

const styles = StyleSheet.create({ actionList: { gap: space[2] }, dayGrid: { flexDirection: "row", flexWrap: "wrap", gap: space[2] }, dayOption: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center", minHeight: 48, paddingHorizontal: space[2] }, sessionSummary: { gap: space[2] }, summary: { gap: space[1] } });

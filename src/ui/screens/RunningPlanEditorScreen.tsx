import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import { RUNNING_SESSION_KINDS, type RunningPlanAggregate, type RunningSessionKind } from "../../domains/running/contracts";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { EmptyState, InlineNotice, PrimaryAction, ScreenHeader, SecondaryAction } from "../components";
import { PlanEditorReorderableRow, PlanEditorTextField, TimeDurationField } from "../components/PlanEditorFields";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import { space, typeScale, useAppTheme } from "../theme";
import {
  addRunningSessionDraft,
  deleteRunningSessionDraft,
  makeRunningSessionDraft,
  reorderRunningSessionDraft,
  runningPlanCommandFromDraft,
  validateRunningPlanDraft,
  type RunningPlanDraft,
} from "../running/runningFormDraft";

const sessionName = (kind: RunningSessionKind) => kind === "long_run" ? "Long run" : `${kind[0]!.toUpperCase()}${kind.slice(1)}`;

/** A screen-local draft editor; commits only through the owning command. */
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
  const saveRef = useRef<View>(null);
  useEffect(() => { setDraft(props.initialDraft); }, [props.initialDraft]);
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
  const save = async () => {
    const validation = validateRunningPlanDraft(draft);
    if (validation !== null) { setError(`Running plan needs attention. ${validation}`); return; }
    setSaving(true); setError(null);
    try {
      const committed = await props.savePlan(runningPlanCommandFromDraft(draft));
      props.onSaved(committed.id);
      if (pendingSession !== null) props.onOpenSession?.(pendingSession);
    } catch {
      setError("Running plan could not be saved. Your edits are still here. Try again.");
    } finally { setSaving(false); }
  };
  const leave = () => {
    setLeaveVisible(false);
    if (pendingSession !== null) props.onOpenSession?.(pendingSession); else props.onBack();
  };
  const createLabel = props.title === undefined ? "Create running plan" : "Save running plan";
  const primary = <>
    <ScreenHeader backAction={() => dirty ? setLeaveVisible(true) : props.onBack()} density="deep" eyebrow="RUNNING" title={props.title ?? "Goal and weekly sessions"} />
    <Text style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Goal and weekly sessions</Text>
    <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Set the outcome, then choose the purpose and structure of each run.</Text>
    <PlanEditorTextField label="Plan name" onChangeText={(name) => setDraft((current) => ({ ...current, name }))} value={draft.name} />
    <PlanEditorTextField help="Enter metres." keyboardType="decimal-pad" label="Goal distance (metres)" onChangeText={(value) => setDraft((current) => ({ ...current, goal: { ...current.goal, goalDistanceMeters: Number(value) } }))} value={String(draft.goal.goalDistanceMeters)} />
    <TimeDurationField help="Optional target time." label="Target time" onChangeText={(seconds) => setDraft((current) => ({ ...current, goal: { ...current.goal, targetDurationMs: seconds === "" ? undefined : Number(seconds) * 1000 } }))} value={draft.goal.targetDurationMs === undefined ? "" : String(draft.goal.targetDurationMs / 1000)} />
    <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Available days</Text>
    <View style={styles.actionList}>{draft.goal.trainingDays.map((day) => <Text key={day} style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>{day}</Text>)}</View>
    <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Weekly structure</Text>
    <View style={styles.actionList}>{RUNNING_SESSION_KINDS.map((kind) => <SecondaryAction key={kind} label={`Add ${sessionName(kind)} session`} onPress={() => add(kind)} />)}</View>
    {draft.sessions.length === 0 ? <EmptyState body="Add a Recovery, Long run, Progression, Tempo, Intervals, Hills, or Fartlek session." heading="No sessions yet" primaryAction={<SecondaryAction label="Add session" onPress={() => add("recovery")} />} /> : draft.sessions.map((session, index) => <PlanEditorReorderableRow key={session.slot.rootId} count={draft.sessions.length} label={`${session.slot.weekday} · ${sessionName(session.session.sessionKind)}`} moveEarlierLabel={`Move ${sessionName(session.session.sessionKind)} earlier`} moveLaterLabel={`Move ${sessionName(session.session.sessionKind)} later`} onMoveDown={() => move(index, index + 1)} onMoveUp={() => move(index, index - 1)} position={index}><View style={styles.sessionSummary}><Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{`${session.slot.weekday} · ${sessionName(session.session.sessionKind)}`}</Text><Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>{`${session.session.phases.length} phase${session.session.phases.length === 1 ? "" : "s"}`}</Text><SecondaryAction label={`Edit ${sessionName(session.session.sessionKind)} session`} onPress={() => dirty ? (setPendingSession(session.session.rootId), setLeaveVisible(true)) : props.onOpenSession?.(session.session.rootId)} /><SecondaryAction destructive label={`Delete ${sessionName(session.session.sessionKind)} session`} onPress={() => setPendingDeleteSlotRootId(session.slot.rootId)} /></View></PlanEditorReorderableRow>)}
    {error === null ? null : <InlineNotice action={<SecondaryAction label="Retry saving plan" onPress={() => void save()} />} body={error} heading="Save failed" tone="error" />}
    <PrimaryAction busy={saving} disabled={saving} label={saving ? "Saving plan…" : createLabel} onPress={() => void save()} ref={saveRef} />
  </>;
  return <><AdaptiveScreen primary={primary} testID="running-plan-editor" />
    <ConfirmationDialog alternateLabel="Discard changes" body="Your edits are still here. Choose whether to save the complete plan, discard the local draft, or keep editing." cancelLabel="Keep editing" confirmBusy={saving} confirmLabel="Save changes" heading="Save changes?" onAlternate={leave} onCancel={() => { setLeaveVisible(false); setPendingSession(null); }} onConfirm={() => void save()} restoreFocusRef={saveRef} visible={leaveVisible} />
    <ConfirmationDialog body="This removes the session from future versions of this plan. Past occurrences and matched activities stay unchanged." cancelLabel="Keep session" confirmLabel="Delete session" destructive heading={`Delete ${pendingDelete === undefined ? "" : sessionName(pendingDelete.session.sessionKind)} session?`} onCancel={() => setPendingDeleteSlotRootId(null)} onConfirm={() => { if (pendingDelete !== undefined) setDraft((current) => deleteRunningSessionDraft(current, pendingDelete.slot.rootId)); setPendingDeleteSlotRootId(null); }} restoreFocusRef={saveRef} visible={pendingDelete !== undefined} />
  </>;
}

const styles = StyleSheet.create({ actionList: { gap: space[2] }, sessionSummary: { gap: space[2] } });

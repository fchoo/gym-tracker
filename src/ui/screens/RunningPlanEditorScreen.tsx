import React, { useEffect, useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { RUNNING_SESSION_KINDS, type RunningPlanAggregate, type RunningSessionKind } from "../../domains/running/contracts";
import { PrimaryAction, ScreenHeader, SecondaryAction } from "../components";
import {
  addRunningSessionDraft,
  deleteRunningSessionDraft,
  makeRunningSessionDraft,
  reorderRunningSessionDraft,
  runningPlanCommandFromDraft,
  updateRunningSessionDraft,
  validateRunningPlanDraft,
  type RunningPlanDraft,
} from "../running/runningFormDraft";

export function RunningPlanEditorScreen(props: Readonly<{
  initialDraft: RunningPlanDraft;
  createId(kind: string): string;
  savePlan(draft: RunningPlanDraft): Promise<RunningPlanAggregate>;
  onBack(): void;
  onSaved(planId: string): void;
  onOpenSession?(sessionRootId?: string): void;
  title?: string;
}>) {
  const [draft, setDraft] = useState(props.initialDraft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leaveVisible, setLeaveVisible] = useState(false);
  const [pendingSession, setPendingSession] = useState<string | undefined | null>(null);
  const [pendingDeleteSlotRootId, setPendingDeleteSlotRootId] = useState<string | null>(null);
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
  const pendingDelete = pendingDeleteSlotRootId === null
    ? undefined
    : draft.sessions.find((entry) => entry.slot.rootId === pendingDeleteSlotRootId);
  const save = async () => {
    const validation = validateRunningPlanDraft(draft);
    if (validation !== null) { setError(validation); return; }
    setSaving(true); setError(null);
    try {
      const committed = await props.savePlan(runningPlanCommandFromDraft(draft));
      props.onSaved(committed.id);
      if (pendingSession !== null) props.onOpenSession?.(pendingSession);
    } catch {
      setError("running_save_failed");
    } finally { setSaving(false); }
  };
  return <View testID="running-plan-editor">
    <ScreenHeader backAction={() => dirty ? setLeaveVisible(true) : props.onBack()} eyebrow="RUNNING PLAN" title={props.title ?? "New Running plan"} />
    <TextInput accessibilityLabel="Plan name" value={draft.name} onChangeText={(name) => setDraft((current) => ({ ...current, name }))} />
    <TextInput accessibilityLabel="Goal distance metres" keyboardType="number-pad" value={String(draft.goal.goalDistanceMeters)} onChangeText={(value) => setDraft((current) => ({ ...current, goal: { ...current.goal, goalDistanceMeters: Number(value) } }))} />
    <TextInput accessibilityLabel="Target time milliseconds" keyboardType="number-pad" value={draft.goal.targetDurationMs === undefined ? "" : String(draft.goal.targetDurationMs)} onChangeText={(value) => setDraft((current) => ({ ...current, goal: { ...current.goal, ...(value === "" ? {} : { targetDurationMs: Number(value) }) } }))} />
    <Text>Available days · {draft.goal.trainingDays.join(", ")}</Text>
    {RUNNING_SESSION_KINDS.map((kind) => <SecondaryAction key={kind} label={`Add ${kind.replace("_", " ")}`} onPress={() => add(kind)} />)}
    {draft.sessions.length === 0 ? <Text accessibilityRole="summary">No sessions yet</Text> : null}
    {draft.sessions.map((session, index) => <View key={session.slot.rootId}>
      <Text>{`${session.slot.weekday} · ${session.session.sessionKind.replaceAll("_", " ")}`}</Text>
      <Text accessibilityRole="summary">{`${session.session.phases.length} phase${session.session.phases.length === 1 ? "" : "s"} · revision ${session.session.revision}`}</Text>
      <SecondaryAction label={`Edit ${session.session.sessionKind.replaceAll("_", " ")}`} onPress={() => {
        if (dirty) { setPendingSession(session.session.rootId); setLeaveVisible(true); } else props.onOpenSession?.(session.session.rootId);
      }} />
      <SecondaryAction label={`Delete ${session.session.sessionKind}`} onPress={() => setPendingDeleteSlotRootId(session.slot.rootId)} />
      <SecondaryAction disabled={index === 0} label={`Move ${session.session.sessionKind} earlier`} onPress={() => move(index, index - 1)} />
      <SecondaryAction disabled={index === draft.sessions.length - 1} label={`Move ${session.session.sessionKind} later`} onPress={() => move(index, index + 1)} />
    </View>)}
    {error === null ? null : <Text accessibilityRole="alert">{error}</Text>}
    <PrimaryAction busy={saving} disabled={saving} label="Save changes" onPress={() => void save()} />
    {pendingDelete === undefined ? null : <View accessibilityViewIsModal><Text>{`Remove ${pendingDelete.session.sessionKind.replace("_", " ")} session?`}</Text><SecondaryAction label="Keep session" onPress={() => setPendingDeleteSlotRootId(null)} /><PrimaryAction label="Remove session" onPress={() => { setDraft((current) => deleteRunningSessionDraft(current, pendingDelete.slot.rootId)); setPendingDeleteSlotRootId(null); }} /></View>}
    {leaveVisible ? <View accessibilityViewIsModal><Text>Save changes before leaving?</Text><PrimaryAction busy={saving} disabled={saving} label="Save changes" onPress={() => void save()} /><SecondaryAction label="Discard changes" onPress={() => { setLeaveVisible(false); if (pendingSession !== null) props.onOpenSession?.(pendingSession); else props.onBack(); }} /><SecondaryAction label="Keep editing" onPress={() => { setLeaveVisible(false); setPendingSession(null); }} /></View> : null}
  </View>;
}

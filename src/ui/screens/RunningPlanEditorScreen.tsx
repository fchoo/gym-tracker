import React, { useState } from "react";
import { Text, TextInput, View } from "react-native";

import { RUNNING_SESSION_KINDS, type RunningPlanAggregate, type RunningSessionKind } from "../../domains/running/contracts";
import { PrimaryAction, ScreenHeader, SecondaryAction } from "../components";
import { RunningSessionFields } from "../components/RunningSessionFields";
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
}>) {
  const [draft, setDraft] = useState(props.initialDraft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const add = (kind: RunningSessionKind) => setDraft((current) => addRunningSessionDraft(current, makeRunningSessionDraft({
    id: props.createId("running-session-revision"), rootId: props.createId("running-session"),
    slotId: props.createId("running-slot-revision"), slotRootId: props.createId("running-slot"),
    planId: current.id, kind, weekday: current.goal.trainingDays[0] ?? "Monday", ordinal: current.sessions.length, createdAtMs: current.createdAtMs,
  })));
  const save = async () => {
    const validation = validateRunningPlanDraft(draft);
    if (validation !== null) { setError(validation); return; }
    setSaving(true); setError(null);
    try {
      const committed = await props.savePlan(runningPlanCommandFromDraft(draft));
      props.onSaved(committed.id);
    } catch {
      setError("running_save_failed");
    } finally { setSaving(false); }
  };
  return <View testID="running-plan-editor">
    <ScreenHeader backAction={props.onBack} eyebrow="RUNNING PLAN" title="New Running plan" />
    <TextInput accessibilityLabel="Plan name" value={draft.name} onChangeText={(name) => setDraft((current) => ({ ...current, name }))} />
    <TextInput accessibilityLabel="Goal distance metres" keyboardType="number-pad" value={String(draft.goal.goalDistanceMeters)} onChangeText={(value) => setDraft((current) => ({ ...current, goal: { ...current.goal, goalDistanceMeters: Number(value) } }))} />
    <TextInput accessibilityLabel="Target time milliseconds" keyboardType="number-pad" value={draft.goal.targetDurationMs === undefined ? "" : String(draft.goal.targetDurationMs)} onChangeText={(value) => setDraft((current) => ({ ...current, goal: { ...current.goal, ...(value === "" ? {} : { targetDurationMs: Number(value) }) } }))} />
    <Text>Available days · {draft.goal.trainingDays.join(", ")}</Text>
    {RUNNING_SESSION_KINDS.map((kind) => <SecondaryAction key={kind} label={`Add ${kind.replace("_", " ")}`} onPress={() => add(kind)} />)}
    {draft.sessions.map((session, index) => <View key={session.slot.rootId}>
      <RunningSessionFields session={session} onChange={(entry) => setDraft((current) => updateRunningSessionDraft(current, entry))} />
      <SecondaryAction label={`Delete ${session.session.sessionKind}`} onPress={() => setDraft((current) => deleteRunningSessionDraft(current, session.slot.rootId))} />
      <SecondaryAction disabled={index === 0} label={`Move ${session.session.sessionKind} earlier`} onPress={() => setDraft((current) => reorderRunningSessionDraft(current, current.sessions.map((entry, position) => position === index ? current.sessions[index - 1]!.slot.rootId : position === index - 1 ? session.slot.rootId : entry.slot.rootId)))} />
    </View>)}
    {error === null ? null : <Text accessibilityRole="alert">{error}</Text>}
    <PrimaryAction busy={saving} disabled={saving} label="Save changes" onPress={() => void save()} />
  </View>;
}

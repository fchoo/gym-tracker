import React, { useState } from "react";
import { Text, TextInput, View } from "react-native";

import type { RunningPlanAggregate, RunningPlanSession } from "../../domains/running/contracts";
import { PrimaryAction, ScreenHeader, SecondaryAction } from "../components";
import { RunningSessionFields } from "../components/RunningSessionFields";
import { validateRunningPlanDraft, type RunningPlanDraft } from "../running/runningFormDraft";

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
  const addRecovery = () => setDraft((current) => {
    const session: RunningPlanSession = {
      slot: { id: props.createId("running-slot-revision"), rootId: props.createId("running-slot"), weekday: current.goal.trainingDays[0] ?? "Monday", revision: 1, ordinal: current.sessions.length },
      session: { version: 1, id: props.createId("running-session-revision"), rootId: props.createId("running-session"), planId: current.id, sessionKind: "recovery", revision: 1, createdAtMs: current.createdAtMs, phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "duration", durationMs: 60_000 }] }], contextual: {} },
    };
    return { ...current, sessions: [...current.sessions, session] };
  });
  const save = async () => {
    const validation = validateRunningPlanDraft(draft);
    if (validation !== null) { setError(validation); return; }
    setSaving(true); setError(null);
    try {
      const committed = await props.savePlan(draft);
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
    <SecondaryAction label="Add recovery" onPress={addRecovery} />
    {draft.sessions.map((session) => <View key={session.slot.rootId}>
      <RunningSessionFields session={session} onChange={(entry) => setDraft((current) => ({ ...current, sessions: current.sessions.map((item) => item.slot.rootId === entry.slot.rootId ? entry : item) }))} />
      <SecondaryAction label={`Delete ${session.session.sessionKind}`} onPress={() => setDraft((current) => ({ ...current, sessions: current.sessions.filter((item) => item.slot.rootId !== session.slot.rootId) }))} />
    </View>)}
    {error === null ? null : <Text accessibilityRole="alert">{error}</Text>}
    <PrimaryAction busy={saving} disabled={saving} label="Save changes" onPress={() => void save()} />
  </View>;
}

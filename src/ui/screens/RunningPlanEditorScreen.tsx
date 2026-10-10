import React, { useState } from "react";
import { Button, Text, TextInput, View } from "react-native";
import type { RunningPlanAggregate } from "../../domains/running/contracts";
import { validateRunningPlanDraft, type RunningPlanDraft } from "../running/runningFormDraft";
import { RunningSessionFields } from "../components/RunningSessionFields";

export function RunningPlanEditorScreen(props: Readonly<{
  initialDraft: RunningPlanDraft;
  savePlan(draft: RunningPlanDraft): Promise<RunningPlanAggregate>;
  onBack(): void;
  onSaved(planId: string): void;
}>) {
  const [draft, setDraft] = useState(props.initialDraft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const validation = validateRunningPlanDraft(draft);
    if (validation !== null) { setError(validation); return; }
    setSaving(true); setError(null);
    try { const committed = await props.savePlan(draft); props.onSaved(committed.id); }
    catch { setError("running_save_failed"); }
    finally { setSaving(false); }
  };
  return <View><Text>New Running plan</Text><TextInput accessibilityLabel="Plan name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} />
    {draft.sessions.map((session) => <RunningSessionFields key={session.slot.rootId} session={session} />)}
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    <Button title="Save changes" disabled={saving} onPress={() => void save()} /><Button title="Back" onPress={props.onBack} />
  </View>;
}

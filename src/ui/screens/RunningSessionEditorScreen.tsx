import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, TextInput, View, type TextStyle } from "react-native";

import type { RunningPlanAggregate, RunningPlanSession, RunningSessionKind } from "../../domains/running/contracts";
import { InlineNotice, PrimaryAction, ScreenHeader, SecondaryAction } from "../components";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import { space, typeScale, useAppTheme } from "../theme";
import {
  RunningSessionFields,
  initialRunningSessionFormDraft,
  runningSessionFieldNativeID,
  type RunningSessionFormDraft,
  type RunningSessionInvalidField,
  type RunningSessionValidation,
  validateRunningSessionFormDraft,
} from "../components/RunningSessionFields";
import { requestAndroidViewFocus } from "../../bootstrap/androidViewFocus";

function targetFromDraft(target: RunningSessionFormDraft["target"]): { paceMsPerKm?: number; heartRateZone?: number; rpe?: number } {
  if (target.mode === "pace") return { paceMsPerKm: Number(target.paceMsPerKm) };
  if (target.mode === "heart_rate_zone") return { heartRateZone: Number(target.heartRateZone) };
  return { rpe: Number(target.rpe) };
}

function targetDraft(target: { paceMsPerKm?: number | undefined; heartRateZone?: number | undefined; rpe?: number | undefined } | undefined): RunningSessionFormDraft["target"] {
  if (target?.paceMsPerKm !== undefined) return { mode: "pace", paceMsPerKm: String(target.paceMsPerKm), heartRateZone: "", rpe: "" };
  if (target?.heartRateZone !== undefined) return { mode: "heart_rate_zone", paceMsPerKm: "", heartRateZone: String(target.heartRateZone), rpe: "" };
  return { mode: "rpe", paceMsPerKm: "", heartRateZone: "", rpe: target?.rpe === undefined ? "" : String(target.rpe) };
}

export function runningSessionKindLabel(kind: RunningSessionKind): string {
  return kind === "long_run" ? "Long run" : `${kind[0]!.toUpperCase()}${kind.slice(1)}`;
}

export function makeRunningSessionSpec(draft: RunningSessionFormDraft) {
  const quantity = (value: string, unit: "distance" | "duration") => unit === "distance" ? { distanceMeters: Number(value) } : { durationMs: Number(value) };
  const selectedWork = draft.kind === "tempo" || draft.kind === "intervals" || draft.kind === "hills" || (draft.kind === "fartlek" && draft.fartlekStyle === "structured")
    ? quantity(draft.work, draft.workUnit)
    : draft.kind === "fartlek" ? undefined : quantity(draft.volume, draft.volumeUnit);
  const work = selectedWork === undefined ? undefined : "distanceMeters" in selectedWork
    ? { ordinal: 0, kind: "distance" as const, distanceMeters: selectedWork.distanceMeters }
    : { ordinal: 0, kind: "duration" as const, durationMs: selectedWork.durationMs };
  const phases = [
    ...(draft.warmUp === "" ? [] : [{ ordinal: 0, kind: "warm_up" as const, steps: [{ ordinal: 0, kind: "duration" as const, durationMs: Number(draft.warmUp) }] }]),
    ...(work === undefined ? [] : [{ ordinal: draft.warmUp === "" ? 0 : 1, kind: "work" as const, steps: [work] }]),
    ...(draft.coolDown === "" ? [] : [{ ordinal: (draft.warmUp === "" ? 0 : 1) + (work === undefined ? 0 : 1), kind: "cool_down" as const, steps: [{ ordinal: 0, kind: "duration" as const, durationMs: Number(draft.coolDown) }] }]),
  ];
  if (draft.kind === "recovery") return { sessionKind: draft.kind, weekday: draft.weekday, phases, advisoryTarget: targetFromDraft(draft.target), contextual: {} };
  if (draft.kind === "long_run") return { sessionKind: draft.kind, weekday: draft.weekday, phases, advisoryTarget: targetFromDraft(draft.target), contextual: { finish: draft.finish } };
  if (draft.kind === "progression") return { sessionKind: draft.kind, weekday: draft.weekday, phases, contextual: { stages: Number(draft.stages), startTarget: targetFromDraft(draft.startTarget), finishTarget: targetFromDraft(draft.finishTarget) } };
  if (draft.kind === "tempo") return { sessionKind: draft.kind, weekday: draft.weekday, phases, advisoryTarget: targetFromDraft(draft.target), contextual: draft.tempoFormat === "continuous" ? { format: "continuous" as const, work: quantity(draft.work, draft.workUnit) } : { format: "tempo_repeats" as const, repetitions: Number(draft.repeats), work: quantity(draft.work, draft.workUnit), recovery: quantity(draft.recovery, draft.recoveryUnit) } };
  if (draft.kind === "intervals") return { sessionKind: draft.kind, weekday: draft.weekday, phases, advisoryTarget: targetFromDraft(draft.target), contextual: { repetitions: Number(draft.repeats), work: quantity(draft.work, draft.workUnit), recovery: quantity(draft.recovery, draft.recoveryUnit) } };
  if (draft.kind === "hills") return { sessionKind: draft.kind, weekday: draft.weekday, phases, advisoryTarget: targetFromDraft(draft.target), contextual: { repetitions: Number(draft.repeats), work: quantity(draft.work, draft.workUnit), returnRecovery: quantity(draft.recovery, draft.recoveryUnit) } };
  if (draft.kind === "fartlek") return { sessionKind: draft.kind, weekday: draft.weekday, phases, advisoryTarget: targetFromDraft(draft.target), contextual: draft.fartlekStyle === "structured" ? { format: "structured" as const, repetitions: Number(draft.repeats), work: quantity(draft.work, draft.workUnit), recovery: quantity(draft.recovery, draft.recoveryUnit) } : { format: "unstructured" as const, repetitions: Number(draft.repeats), fastCue: draft.fastCue.trim(), easyRecoveryCue: draft.easyRecoveryCue.trim() } };
  throw new Error("running_session_kind_not_supported_by_route");
}

export type RunningSessionSaveRequest = Readonly<{
  planId: string;
  expectedPlanRevision: number;
  sessionRootId: string | undefined;
  expectedSessionRevision: number | undefined;
  slotRootId: string | undefined;
  expectedSlotRevision: number | undefined;
  requestId: string;
  draft: RunningSessionFormDraft;
}>;

export type RunningSessionSaveResult = Readonly<{ plan: RunningPlanAggregate; sessionRootId: string }>;

function draftFromSession(session: RunningPlanSession): RunningSessionFormDraft {
  const work = session.session.phases.find((phase) => phase.kind === "work")?.steps[0];
  const base: RunningSessionFormDraft = {
    ...initialRunningSessionFormDraft(session.session.sessionKind, session.slot.weekday),
    volume: work?.kind === "distance" ? String(work.distanceMeters) : String(work?.durationMs ?? ""),
    volumeUnit: work?.kind === "distance" ? "distance" : "duration",
  };
  const quantity = (value: { distanceMeters: number } | { durationMs: number }) => "distanceMeters" in value ? { value: String(value.distanceMeters), unit: "distance" as const } : { value: String(value.durationMs), unit: "duration" as const };
  const contextual = session.session.contextual;
  if (session.session.sessionKind === "tempo") {
    const typed = contextual as { format: "continuous"; work: { distanceMeters: number } | { durationMs: number } } | { format: "tempo_repeats"; repetitions: number; work: { distanceMeters: number } | { durationMs: number }; recovery: { distanceMeters: number } | { durationMs: number } };
    const selectedWork = quantity(typed.work);
    return { ...base, tempoFormat: typed.format, repeats: typed.format === "tempo_repeats" ? String(typed.repetitions) : "", work: selectedWork.value, workUnit: selectedWork.unit, recovery: typed.format === "tempo_repeats" ? quantity(typed.recovery).value : "", recoveryUnit: typed.format === "tempo_repeats" ? quantity(typed.recovery).unit : "duration", target: targetDraft(session.session.advisoryTarget) };
  }
  if (session.session.sessionKind === "intervals") { const typed = contextual as { repetitions: number; work: { distanceMeters: number } | { durationMs: number }; recovery: { distanceMeters: number } | { durationMs: number } }; const selectedWork = quantity(typed.work); const recovery = quantity(typed.recovery); return { ...base, repeats: String(typed.repetitions), work: selectedWork.value, workUnit: selectedWork.unit, recovery: recovery.value, recoveryUnit: recovery.unit, target: targetDraft(session.session.advisoryTarget) }; }
  if (session.session.sessionKind === "hills") { const typed = contextual as { repetitions: number; work: { distanceMeters: number } | { durationMs: number }; returnRecovery: { distanceMeters: number } | { durationMs: number } }; const selectedWork = quantity(typed.work); const recovery = quantity(typed.returnRecovery); return { ...base, repeats: String(typed.repetitions), work: selectedWork.value, workUnit: selectedWork.unit, recovery: recovery.value, recoveryUnit: recovery.unit, target: targetDraft(session.session.advisoryTarget) }; }
  if (session.session.sessionKind === "fartlek") { const typed = contextual as { format: "structured"; repetitions: number; work: { distanceMeters: number } | { durationMs: number }; recovery: { distanceMeters: number } | { durationMs: number } } | { format: "unstructured"; repetitions: number; fastCue: string; easyRecoveryCue: string }; if (typed.format === "structured") { const selectedWork = quantity(typed.work); const recovery = quantity(typed.recovery); return { ...base, fartlekStyle: "structured", repeats: String(typed.repetitions), work: selectedWork.value, workUnit: selectedWork.unit, recovery: recovery.value, recoveryUnit: recovery.unit, target: targetDraft(session.session.advisoryTarget) }; } return { ...base, fartlekStyle: "unstructured", repeats: String(typed.repetitions), fastCue: typed.fastCue, easyRecoveryCue: typed.easyRecoveryCue, target: targetDraft(session.session.advisoryTarget) }; }
  if (session.session.sessionKind === "long_run") return { ...base, finish: (contextual as { finish: RunningSessionFormDraft["finish"] }).finish, target: targetDraft(session.session.advisoryTarget) };
  if (session.session.sessionKind === "progression") { const typed = contextual as { stages: number; startTarget: Parameters<typeof targetDraft>[0]; finishTarget: Parameters<typeof targetDraft>[0] }; return { ...base, stages: String(typed.stages), startTarget: targetDraft(typed.startTarget), finishTarget: targetDraft(typed.finishTarget) }; }
  return { ...base, target: targetDraft(session.session.advisoryTarget) };
}

export function RunningSessionEditorScreen(props: Readonly<{
  loadPlan(planId: string): Promise<RunningPlanAggregate | null>;
  saveSession(input: RunningSessionSaveRequest): Promise<RunningSessionSaveResult>;
  createRequestId(): string;
  mode: "create" | "edit";
  planId: string;
  sessionId?: string;
  onBack(): void;
  onSaved(sessionRootId: string): void;
}>) {
  const { colors } = useAppTheme();
  const [plan, setPlan] = useState<RunningPlanAggregate | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [drafts, setDrafts] = useState<Partial<Record<RunningSessionKind, RunningSessionFormDraft>>>({});
  const [kind, setKind] = useState<RunningSessionKind>("recovery");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const requestId = useRef<string | null>(null);
  const saveRef = useRef<View>(null);
  const saveErrorRef = useRef<View>(null);
  const fieldFocusRefs = useRef<Partial<Record<RunningSessionInvalidField, TextInput | null>>>({});

  useEffect(() => {
    let active = true;
    setState("loading");
    void props.loadPlan(props.planId).then((next) => {
      if (!active) return;
      if (next === null) { setState("missing"); return; }
      const existing = props.mode === "edit" ? next.sessions.find((entry) => entry.session.rootId === props.sessionId) : undefined;
      if (props.mode === "edit" && existing === undefined) { setState("missing"); return; }
      const first = existing === undefined
        ? initialRunningSessionFormDraft("recovery", next.goal.trainingDays[0] ?? "Monday")
        : draftFromSession(existing);
      setPlan(next); setKind(first.kind); setDrafts({ [first.kind]: first }); setState("ready");
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [loadAttempt, props.loadPlan, props.mode, props.planId, props.sessionId]);

  const draft = useMemo(() => drafts[kind] ?? initialRunningSessionFormDraft(kind, plan?.goal.trainingDays[0] ?? "Monday"), [drafts, kind, plan]);
  const existing = plan?.sessions.find((entry) => entry.session.rootId === props.sessionId);
  const selectKind = (nextKind: RunningSessionKind) => {
    setKind(nextKind);
    setError(null);
    setDrafts((current) => current[nextKind] === undefined
      ? { ...current, [nextKind]: initialRunningSessionFormDraft(nextKind, draft.weekday) }
      : current);
  };
  const update = (next: RunningSessionFormDraft) => { setDrafts((current) => ({ ...current, [kind]: next })); setError(null); };
  const focusFirstInvalid = (validation: RunningSessionValidation) => {
    const targetMode = validation.field === "target" ? draft.target.mode
      : validation.field === "start_target" ? draft.startTarget.mode
      : validation.field === "finish_target" ? draft.finishTarget.mode
      : undefined;
    const nativeID = runningSessionFieldNativeID(draft.kind, validation.field, targetMode);
    fieldFocusRefs.current[validation.field]?.focus?.();
    void requestAndroidViewFocus(nativeID);
  };
  useEffect(() => {
    if (error === null || !error.includes("could not be saved.")) return;
    requestAnimationFrame(() => {
      saveErrorRef.current?.focus?.();
      void requestAndroidViewFocus("running-session-save-error-heading");
    });
  }, [error]);
  const save = async () => {
    if (plan === null) return;
    const validation = validateRunningSessionFormDraft(draft);
    if (validation !== null) { const label = runningSessionKindLabel(draft.kind); setError(`${label} session needs attention. ${validation.message}`); AccessibilityInfo.announceForAccessibility(`Running ${label} session needs attention.`); focusFirstInvalid(validation); return; }
    setSaving(true); setError(null);
    try {
      const result = await props.saveSession({
        planId: plan.id,
        expectedPlanRevision: plan.revision,
        sessionRootId: existing?.session.rootId,
        expectedSessionRevision: existing?.session.revision,
        slotRootId: existing?.slot.rootId,
        expectedSlotRevision: existing?.slot.revision,
        requestId: requestId.current ?? (requestId.current = props.createRequestId()),
        draft,
      });
      AccessibilityInfo.announceForAccessibility("Running session saved. Activation stays separate.");
      props.onSaved(result.sessionRootId);
    } catch {
      const label = runningSessionKindLabel(draft.kind);
      setError(`${label} session could not be saved. Your edits are still here. Try again.`);
      AccessibilityInfo.announceForAccessibility(`Running ${label} session could not be saved. Your edits are still here. Retry saving ${label} session.`);
    } finally { setSaving(false); }
  };

  const header = <ScreenHeader backAction={() => setConfirmDiscard(true)} density="deep" eyebrow="RUNNING" title={props.mode === "create" ? "New session" : "Edit session"} />;
  if (state === "loading") return <AdaptiveScreen primary={<>{header}<View accessibilityLiveRegion="polite" accessibilityRole="progressbar"><Text style={styles.srOnly}>Loading session</Text></View><Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Loading session…</Text></>} testID="running-session-editor" />;
  if (state === "missing") return <AdaptiveScreen primary={<>{header}<InlineNotice action={<SecondaryAction label="Back to running plan" onPress={props.onBack} />} body="This item is no longer available." heading="Session not found" tone="error" /></>} testID="running-session-editor" />;
  if (state === "error") return <AdaptiveScreen primary={<>{header}<InlineNotice action={<SecondaryAction label="Retry loading session" onPress={() => setLoadAttempt((attempt) => attempt + 1)} />} body="Your edits were not changed. Try again." heading="Session could not be loaded" tone="error" /></>} testID="running-session-editor" />;

  const validationError = error?.includes("needs attention.") ?? false;
  const saveFailure = error !== null && !validationError;
  return <><AdaptiveScreen primary={<><>{header}</><Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Configure only the steps this workout needs.</Text><Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Workout type</Text><View style={styles.choices}>{(["recovery", "long_run", "progression", "tempo", "intervals", "hills", "fartlek"] as const).map((entry) => <SecondaryAction key={entry} label={`Workout type ${runningSessionKindLabel(entry)}`} onPress={() => selectKind(entry)} />)}</View><RunningSessionFields draft={draft} onChange={update} onFocusTargetRef={(field, node) => { fieldFocusRefs.current[field] = node; }} />{error === null ? null : <InlineNotice {...(saveFailure ? { action: <SecondaryAction label={`Retry saving ${runningSessionKindLabel(draft.kind)} session`} onPress={() => void save()} />, focusable: true, nativeID: "running-session-save-error-heading", noticeRef: saveErrorRef } : {})} body={error} heading={validationError ? `${runningSessionKindLabel(draft.kind)} session needs attention` : `${runningSessionKindLabel(draft.kind)} session could not be saved`} tone="error" />}<PrimaryAction busy={saving} disabled={saving} label={saving ? "Saving session…" : "Save session"} onPress={() => void save()} ref={saveRef} /></>} testID="running-session-editor" /><ConfirmationDialog alternateLabel="Discard changes" body="Your edits are still here. Choose whether to save the complete plan, discard the local draft, or keep editing." cancelLabel="Keep editing" confirmBusy={saving} confirmLabel="Save changes" heading="Save changes?" onAlternate={props.onBack} onCancel={() => setConfirmDiscard(false)} onConfirm={() => void save()} restoreFocusRef={saveRef} visible={confirmDiscard} /></>;
}

const styles = StyleSheet.create({ choices: { gap: space[2] }, srOnly: { height: 1, opacity: 0, width: 1 } });

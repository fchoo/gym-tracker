import React from "react";
import { StyleSheet, Text, TextInput, View, type TextStyle } from "react-native";

import type { RunningPlanSession, RunningSessionKind } from "../../domains/running/contracts";
import { PrimaryAction, SecondaryAction } from ".";
import { PlanEditorTextField } from "./PlanEditorFields";
import { space, typeScale, useAppTheme } from "../theme";

export type RunningSessionTargetDraft = Readonly<{
  mode: "pace" | "heart_rate_zone" | "rpe";
  paceMsPerKm: string;
  heartRateZone: string;
  rpe: string;
}>;

export type RunningSessionFormDraft = Readonly<{
  kind: RunningSessionKind;
  weekday: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
  warmUp: string;
  coolDown: string;
  volume: string;
  volumeUnit: "distance" | "duration";
  target: RunningSessionTargetDraft;
  finish: "easy_throughout" | "steady_finish" | "progression_finish";
  stages: string;
  startTarget: RunningSessionTargetDraft;
  finishTarget: RunningSessionTargetDraft;
  tempoFormat: "continuous" | "tempo_repeats";
  fartlekStyle: "structured" | "unstructured";
  repeats: string;
  work: string;
  workUnit: "distance" | "duration";
  recovery: string;
  recoveryUnit: "distance" | "duration";
  fastCue: string;
  easyRecoveryCue: string;
}>;

export const RUNNING_SESSION_INVALID_FIELDS = [
  "warm_up", "cool_down", "volume", "target", "stages", "start_target", "finish_target",
  "repeats", "work", "recovery", "fast_cue", "easy_recovery_cue",
] as const;

export type RunningSessionInvalidField = (typeof RUNNING_SESSION_INVALID_FIELDS)[number];
export type RunningSessionValidation = Readonly<{
  field: RunningSessionInvalidField;
  message: string;
}>;

export function runningSessionFieldNativeID(
  kind: RunningSessionKind,
  field: RunningSessionInvalidField,
  targetMode?: RunningSessionTargetDraft["mode"],
): string {
  return `running-session-${kind}-${field}${targetMode === undefined ? "" : `-${targetMode}`}`;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

const emptyTarget = (): RunningSessionTargetDraft => ({
  mode: "rpe", paceMsPerKm: "", heartRateZone: "", rpe: "",
});

export function initialRunningSessionFormDraft(
  kind: RunningSessionKind,
  weekday: RunningSessionFormDraft["weekday"],
): RunningSessionFormDraft {
  return {
    kind,
    weekday,
    warmUp: "",
    coolDown: "",
    volume: "",
    volumeUnit: "distance",
    target: emptyTarget(),
    finish: "easy_throughout",
    stages: "",
    startTarget: emptyTarget(),
    finishTarget: emptyTarget(),
    tempoFormat: "continuous",
    fartlekStyle: "structured",
    repeats: "",
    work: "",
    workUnit: "duration",
    recovery: "",
    recoveryUnit: "duration",
    fastCue: "",
    easyRecoveryCue: "",
  };
}

function validPositiveInteger(value: string): boolean {
  return /^\d+$/u.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function validTarget(target: RunningSessionTargetDraft): boolean {
  if (target.mode === "pace") return validPositiveInteger(target.paceMsPerKm);
  if (target.mode === "heart_rate_zone") return /^[1-5]$/u.test(target.heartRateZone);
  return /^(?:[1-9]|10)$/u.test(target.rpe);
}

export function validateRunningSessionFormDraft(draft: RunningSessionFormDraft): RunningSessionValidation | null {
  const invalid = (field: RunningSessionInvalidField, message: string): RunningSessionValidation => ({ field, message });
  if (draft.warmUp !== "" && !validPositiveInteger(draft.warmUp)) return invalid("warm_up", "Warm-up must be positive when supplied.");
  if (draft.coolDown !== "" && !validPositiveInteger(draft.coolDown)) return invalid("cool_down", "Cool-down must be positive when supplied.");
  if ((draft.kind === "recovery" || draft.kind === "long_run" || draft.kind === "progression") && !validPositiveInteger(draft.volume)) return invalid("volume", "Enter a positive Volume.");
  if (draft.kind === "recovery" || draft.kind === "long_run") {
    if (!validTarget(draft.target)) return invalid("target", "Choose a valid target.");
  }
  if (draft.kind === "progression") {
    if (!/^(?:[2-9]|[1-9]\d+)$/u.test(draft.stages)) return invalid("stages", "Stages must be a whole number of at least 2.");
    if (!validTarget(draft.startTarget)) return invalid("start_target", "Choose a valid Start target.");
    if (!validTarget(draft.finishTarget)) return invalid("finish_target", "Choose a valid Finish target.");
  }
  const requiresTarget = draft.kind === "tempo" || draft.kind === "intervals" || draft.kind === "hills" || draft.kind === "fartlek";
  if (requiresTarget && !validTarget(draft.target)) return invalid("target", "Choose a valid intensity target.");
  const validQuantity = (value: string) => validPositiveInteger(value);
  if (draft.kind === "tempo") {
    if (!validQuantity(draft.work)) return invalid("work", "Enter a positive Work duration or distance.");
    if (draft.tempoFormat === "tempo_repeats" && !validPositiveInteger(draft.repeats)) return invalid("repeats", "Tempo repeats need a whole Repeats value.");
    if (draft.tempoFormat === "tempo_repeats" && !validQuantity(draft.recovery)) return invalid("recovery", "Tempo repeats need a positive Recovery.");
  }
  if (draft.kind === "intervals" && !validPositiveInteger(draft.repeats)) return invalid("repeats", "Intervals need a whole Repeats value.");
  if (draft.kind === "intervals" && !validQuantity(draft.work)) return invalid("work", "Intervals need a positive Work duration or distance.");
  if (draft.kind === "intervals" && !validQuantity(draft.recovery)) return invalid("recovery", "Intervals need a positive Recovery.");
  if (draft.kind === "hills" && !validPositiveInteger(draft.repeats)) return invalid("repeats", "Hills need a whole Repeats value.");
  if (draft.kind === "hills" && !validQuantity(draft.work)) return invalid("work", "Hills need a positive Uphill duration or distance.");
  if (draft.kind === "hills" && !validQuantity(draft.recovery)) return invalid("recovery", "Hills need a positive Return recovery.");
  if (draft.kind === "fartlek") {
    if (!validPositiveInteger(draft.repeats)) return invalid("repeats", "Fartlek needs a whole Surges / repeats value.");
    if (draft.fartlekStyle === "structured" && !validQuantity(draft.work)) return invalid("work", "Structured Fartlek needs a positive Fast segment.");
    if (draft.fartlekStyle === "structured" && !validQuantity(draft.recovery)) return invalid("recovery", "Structured Fartlek needs a positive Easy float / recovery.");
    if (draft.fartlekStyle === "unstructured" && (draft.fastCue.trim().length === 0 || draft.fastCue.trim().length > 120)) return invalid("fast_cue", "Unstructured Fartlek needs a bounded Fast cue.");
    if (draft.fartlekStyle === "unstructured" && (draft.easyRecoveryCue.trim().length === 0 || draft.easyRecoveryCue.trim().length > 120)) return invalid("easy_recovery_cue", "Unstructured Fartlek needs a bounded Easy recovery cue.");
  }
  return null;
}

function targetText(target: RunningSessionTargetDraft): string {
  if (target.mode === "pace") {
    if (target.paceMsPerKm === "") return "Pace";
    const seconds = Math.round(Number(target.paceMsPerKm) / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} / km`;
  }
  if (target.mode === "heart_rate_zone") return target.heartRateZone === "" ? "HR zone" : `Z${target.heartRateZone}`;
  return target.rpe === "" ? "RPE" : `RPE ${target.rpe}`;
}

export function runningSessionPreview(draft: RunningSessionFormDraft): string | null {
  if (validateRunningSessionFormDraft(draft) !== null) return null;
  const quantityLabel = (value: string, unit: "distance" | "duration") => unit === "distance"
    ? `${value} m`
    : `${Math.round(Number(value) / 60_000)} min`;
  const volume = quantityLabel(draft.volume, draft.volumeUnit);
  if (draft.kind === "recovery") return `${volume} · ${targetText(draft.target)}`;
  if (draft.kind === "long_run") return `${volume} · ${draft.finish.replaceAll("_", " ")}`;
  if (draft.kind === "progression") return `${volume} · ${draft.stages} stages · ${targetText(draft.startTarget)} → ${targetText(draft.finishTarget)}`;
  const quantity = quantityLabel;
  if (draft.kind === "tempo") return draft.tempoFormat === "continuous"
    ? `${quantity(draft.work, draft.workUnit)} continuous · ${targetText(draft.target)}`
    : `${draft.repeats} × ${quantity(draft.work, draft.workUnit)} · ${quantity(draft.recovery, draft.recoveryUnit)}`;
  if (draft.kind === "intervals") return `${draft.repeats} × ${quantity(draft.work, draft.workUnit)} · ${quantity(draft.recovery, draft.recoveryUnit)} · ${targetText(draft.target)}`;
  if (draft.kind === "hills") return `${draft.repeats} × uphill ${quantity(draft.work, draft.workUnit)} · return recovery ${quantity(draft.recovery, draft.recoveryUnit)} · ${targetText(draft.target)}`;
  if (draft.kind === "fartlek") return draft.fartlekStyle === "structured"
    ? `${draft.repeats} × ${quantity(draft.work, draft.workUnit)} · easy ${quantity(draft.recovery, draft.recoveryUnit)} · ${targetText(draft.target)}`
    : `${draft.repeats} surges · ${draft.fastCue.trim()} / ${draft.easyRecoveryCue.trim()}`;
  return null;
}

/** User-facing persisted session facts; keep this shared by detail and editable rows. */
export function runningSessionReadback(entry: RunningPlanSession): string {
  const quantity = (value: { distanceMeters: number } | { durationMs: number }) => "distanceMeters" in value ? `${value.distanceMeters} m` : `${Math.round(value.durationMs / 60_000)} min`;
  const target = (value: { paceMsPerKm?: number | undefined; heartRateZone?: number | undefined; rpe?: number | undefined } | undefined) => value?.paceMsPerKm !== undefined ? `${Math.floor(value.paceMsPerKm / 60_000)}:${String(Math.floor((value.paceMsPerKm % 60_000) / 1000)).padStart(2, "0")} / km` : value?.heartRateZone !== undefined ? `Z${value.heartRateZone}` : value?.rpe !== undefined ? `RPE ${value.rpe}` : "No target";
  const work = entry.session.phases.flatMap((phase) => phase.steps).map((step) => step.kind === "distance" ? `${step.distanceMeters} m` : `${Math.round(step.durationMs / 60_000)} min`).join(" + ");
  const contextual = entry.session.contextual;
  if (entry.session.sessionKind === "recovery") return `${work} · easy ${target(entry.session.advisoryTarget)}`;
  if (entry.session.sessionKind === "long_run") return `${work} · ${target(entry.session.advisoryTarget)} · ${(contextual as { finish: string }).finish.replaceAll("_", " ")}`;
  if (entry.session.sessionKind === "progression") { const c = contextual as { stages: number; startTarget: Parameters<typeof target>[0]; finishTarget: Parameters<typeof target>[0] }; return `${work} · ${c.stages} stages · ${target(c.startTarget)} → ${target(c.finishTarget)}`; }
  if (entry.session.sessionKind === "tempo") { const c = contextual as { format: string; repetitions?: number; work: { distanceMeters: number } | { durationMs: number }; recovery?: { distanceMeters: number } | { durationMs: number } }; return `${c.format === "continuous" ? "continuous" : `${c.repetitions} ×`} ${quantity(c.work)}${c.recovery === undefined ? "" : ` · recovery ${quantity(c.recovery)}`} · ${target(entry.session.advisoryTarget)}`; }
  if (entry.session.sessionKind === "intervals") { const c = contextual as { repetitions: number; work: { distanceMeters: number } | { durationMs: number }; recovery: { distanceMeters: number } | { durationMs: number } }; return `${c.repetitions} × ${quantity(c.work)} · recovery ${quantity(c.recovery)} · ${target(entry.session.advisoryTarget)}`; }
  if (entry.session.sessionKind === "hills") { const c = contextual as { repetitions: number; work: { distanceMeters: number } | { durationMs: number }; returnRecovery: { distanceMeters: number } | { durationMs: number } }; return `${c.repetitions} × uphill ${quantity(c.work)} · return recovery ${quantity(c.returnRecovery)} · ${target(entry.session.advisoryTarget)}`; }
  const c = contextual as { format: string; repetitions: number; work?: { distanceMeters: number } | { durationMs: number }; recovery?: { distanceMeters: number } | { durationMs: number }; fastCue?: string; easyRecoveryCue?: string };
  return c.format === "structured" ? `${c.repetitions} × ${quantity(c.work!)} · easy ${quantity(c.recovery!)} · ${target(entry.session.advisoryTarget)}` : `${c.repetitions} surges · ${c.fastCue} · recover ${c.easyRecoveryCue} · ${target(entry.session.advisoryTarget)}`;
}

function QuantityFields(props: Readonly<{
  label: string;
  value: string;
  unit: "distance" | "duration";
  onChange(value: string, unit?: "distance" | "duration"): void;
  focusRef(node: TextInput | null): void;
  nativeID: string;
}>) {
  const { colors } = useAppTheme();
  const durationValue = props.unit === "duration" && props.value !== ""
    ? String(Number(props.value) / 60_000)
    : props.value;
  return <View accessibilityLabel={props.label} style={styles.field}>
    <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>{props.label}</Text>
    <View style={styles.choiceGroup}>
      <SecondaryAction label={`${props.label} unit distance`} onPress={() => props.onChange(props.value, "distance")} />
      <SecondaryAction label={`${props.label} unit duration`} onPress={() => props.onChange(props.value, "duration")} />
    </View>
    <PlanEditorTextField
      keyboardType="decimal-pad"
      label={props.unit === "distance" ? `${props.label} (metres)` : `${props.label} (minutes)`}
      inputRef={props.focusRef}
      nativeID={props.nativeID}
      onChangeText={(value) => props.onChange(props.unit === "duration" && value !== "" ? String(Math.round(Number(value) * 60_000)) : value)}
      value={durationValue}
    />
  </View>;
}

function TargetFields(props: Readonly<{
  label: string;
  target: RunningSessionTargetDraft;
  onChange(target: RunningSessionTargetDraft): void;
  focusRef(node: TextInput | null): void;
  nativeID(kind: RunningSessionTargetDraft["mode"]): string;
}>) {
  const prefix = props.label === "Easy target" || props.label === "Effort target" ? "" : `${props.label} `;
  const { colors } = useAppTheme();
  const paceSeconds = Math.round(Number(props.target.paceMsPerKm) / 1000);
  const paceValue = props.target.paceMsPerKm === "" ? "" : `${Math.floor(paceSeconds / 60)}:${String(paceSeconds % 60).padStart(2, "0")}`;
  return <View accessibilityLabel={props.label} style={styles.field}>
    <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>{props.label}</Text>
    <View style={styles.choiceGroup}>
      <SecondaryAction label={`${prefix}Target: Pace`} onPress={() => props.onChange({ ...props.target, mode: "pace" })} />
      <SecondaryAction label={`${prefix}Target: HR zone`} onPress={() => props.onChange({ ...props.target, mode: "heart_rate_zone" })} />
      <SecondaryAction label={`${prefix}Target: RPE`} onPress={() => props.onChange({ ...props.target, mode: "rpe" })} />
    </View>
    {props.target.mode === "pace" ? <PlanEditorTextField help="Minutes:seconds per kilometre, for example 5:30." inputRef={props.focusRef} label={`${prefix}Pace / km`} nativeID={props.nativeID("pace")} onChangeText={(pace) => { const [minutes, seconds = "0"] = pace.split(":"); const value = Number(minutes) * 60_000 + Number(seconds) * 1000; props.onChange({ ...props.target, paceMsPerKm: Number.isFinite(value) ? String(value) : "" }); }} value={paceValue} /> : null}
    {props.target.mode === "heart_rate_zone" ? <PlanEditorTextField inputRef={props.focusRef} keyboardType="number-pad" label={`${prefix}HR zone (Z1–Z5)`} nativeID={props.nativeID("heart_rate_zone")} onChangeText={(heartRateZone) => props.onChange({ ...props.target, heartRateZone })} value={props.target.heartRateZone} /> : null}
    {props.target.mode === "rpe" ? <PlanEditorTextField inputRef={props.focusRef} keyboardType="number-pad" label={`${prefix}RPE (1–10)`} nativeID={props.nativeID("rpe")} onChangeText={(rpe) => props.onChange({ ...props.target, rpe })} value={props.target.rpe} /> : null}
  </View>;
}

export function RunningSessionFields(props: Readonly<{
  draft: RunningSessionFormDraft;
  onChange(draft: RunningSessionFormDraft): void;
  onFocusTargetRef?(field: RunningSessionInvalidField, node: TextInput | null): void;
}>) {
  const { draft, onChange, onFocusTargetRef } = props;
  const focusRef = (field: RunningSessionInvalidField) => (node: TextInput | null) => onFocusTargetRef?.(field, node);
  const nativeID = (field: RunningSessionInvalidField, targetMode?: RunningSessionTargetDraft["mode"]) => runningSessionFieldNativeID(draft.kind, field, targetMode);
  const update = (next: Partial<RunningSessionFormDraft>) => onChange({ ...draft, ...next });
  const preview = runningSessionPreview(draft);
  const isContextual = draft.kind === "recovery" || draft.kind === "long_run" || draft.kind === "progression";

  const kindLabel = draft.kind.replaceAll("_", " ").replace(/^./u, (value) => value.toUpperCase());
  const { colors } = useAppTheme();
  const durationValue = (value: string) => value === "" ? "" : String(Number(value) / 60_000);
  const durationUpdate = (key: "warmUp" | "coolDown", value: string) => update({ [key]: value === "" ? "" : String(Math.round(Number(value) * 60_000)) });
  return <View accessibilityLabel={`Running ${kindLabel} session`} style={styles.form}>
    <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Day</Text>
    <View style={styles.choiceGroup}>{WEEKDAYS.map((weekday) => <SecondaryAction key={weekday} label={`Day ${weekday}`} onPress={() => update({ weekday })} />)}</View>
    <PlanEditorTextField help="Optional. Enter minutes; zero is shown as None after save." inputRef={focusRef("warm_up")} keyboardType="decimal-pad" label="Warm-up (minutes)" nativeID={nativeID("warm_up")} onChangeText={(warmUp) => durationUpdate("warmUp", warmUp)} value={durationValue(draft.warmUp)} />
    <PlanEditorTextField help="Optional. Enter minutes; zero is shown as None after save." inputRef={focusRef("cool_down")} keyboardType="decimal-pad" label="Cool-down (minutes)" nativeID={nativeID("cool_down")} onChangeText={(coolDown) => durationUpdate("coolDown", coolDown)} value={durationValue(draft.coolDown)} />
    {isContextual ? <>
      <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Volume</Text>
      <View style={styles.choiceGroup}>
        <SecondaryAction label="Volume unit distance" onPress={() => update({ volumeUnit: "distance" })} />
        <SecondaryAction label="Volume unit duration" onPress={() => update({ volumeUnit: "duration" })} />
      </View>
      <PlanEditorTextField inputRef={focusRef("volume")} keyboardType="decimal-pad" label={draft.volumeUnit === "distance" ? "Volume (metres)" : "Volume (minutes)"} nativeID={nativeID("volume")} onChangeText={(volume) => update({ volume: draft.volumeUnit === "duration" && volume !== "" ? String(Math.round(Number(volume) * 60_000)) : volume })} value={draft.volumeUnit === "duration" ? durationValue(draft.volume) : draft.volume} />
    </> : null}
    {draft.kind === "recovery" ? <TargetFields focusRef={focusRef("target")} label="Easy target" nativeID={(mode) => nativeID("target", mode)} target={draft.target} onChange={(target) => update({ target })} /> : null}
    {draft.kind === "long_run" ? <>
      <TargetFields focusRef={focusRef("target")} label="Effort target" nativeID={(mode) => nativeID("target", mode)} target={draft.target} onChange={(target) => update({ target })} />
      <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Finish</Text>
      {([
        ["easy_throughout", "Easy throughout"],
        ["steady_finish", "Steady finish"],
        ["progression_finish", "Progression finish"],
      ] as const).map(([finish, label]) => <SecondaryAction key={finish} label={label} onPress={() => update({ finish })} />)}
    </> : null}
    {draft.kind === "progression" ? <>
      <PlanEditorTextField inputRef={focusRef("stages")} keyboardType="number-pad" label="Stages" nativeID={nativeID("stages")} onChangeText={(stages) => update({ stages })} value={draft.stages} />
      <TargetFields focusRef={focusRef("start_target")} label="Start target" nativeID={(mode) => nativeID("start_target", mode)} target={draft.startTarget} onChange={(startTarget) => update({ startTarget })} />
      <TargetFields focusRef={focusRef("finish_target")} label="Finish target" nativeID={(mode) => nativeID("finish_target", mode)} target={draft.finishTarget} onChange={(finishTarget) => update({ finishTarget})} />
    </> : null}
    {draft.kind === "tempo" ? <>
      <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Format</Text>
      <SecondaryAction label="Format Continuous" onPress={() => update({ tempoFormat: "continuous" })} />
      <SecondaryAction label="Format Tempo repeats" onPress={() => update({ tempoFormat: "tempo_repeats" })} />
      {draft.tempoFormat === "tempo_repeats" ? <PlanEditorTextField inputRef={focusRef("repeats")} keyboardType="number-pad" label="Repeats" nativeID={nativeID("repeats")} onChangeText={(repeats) => update({ repeats })} value={draft.repeats} /> : null}
      <QuantityFields focusRef={focusRef("work")} label="Work" nativeID={nativeID("work")} value={draft.work} unit={draft.workUnit} onChange={(work, workUnit) => update({ work, ...(workUnit === undefined ? {} : { workUnit }) })} />
      {draft.tempoFormat === "tempo_repeats" ? <QuantityFields focusRef={focusRef("recovery")} label="Recovery" nativeID={nativeID("recovery")} value={draft.recovery} unit={draft.recoveryUnit} onChange={(recovery, recoveryUnit) => update({ recovery, ...(recoveryUnit === undefined ? {} : { recoveryUnit }) })} /> : null}
      <TargetFields focusRef={focusRef("target")} label="Intensity target" nativeID={(mode) => nativeID("target", mode)} target={draft.target} onChange={(target) => update({ target })} />
    </> : null}
    {draft.kind === "intervals" ? <>
      <PlanEditorTextField inputRef={focusRef("repeats")} keyboardType="number-pad" label="Repeats" nativeID={nativeID("repeats")} onChangeText={(repeats) => update({ repeats })} value={draft.repeats} />
      <QuantityFields focusRef={focusRef("work")} label="Work" nativeID={nativeID("work")} value={draft.work} unit={draft.workUnit} onChange={(work, workUnit) => update({ work, ...(workUnit === undefined ? {} : { workUnit }) })} />
      <QuantityFields focusRef={focusRef("recovery")} label="Recovery" nativeID={nativeID("recovery")} value={draft.recovery} unit={draft.recoveryUnit} onChange={(recovery, recoveryUnit) => update({ recovery, ...(recoveryUnit === undefined ? {} : { recoveryUnit }) })} />
      <TargetFields focusRef={focusRef("target")} label="Intensity target" nativeID={(mode) => nativeID("target", mode)} target={draft.target} onChange={(target) => update({ target })} />
    </> : null}
    {draft.kind === "hills" ? <>
      <PlanEditorTextField inputRef={focusRef("repeats")} keyboardType="number-pad" label="Repeats" nativeID={nativeID("repeats")} onChangeText={(repeats) => update({ repeats })} value={draft.repeats} />
      <QuantityFields focusRef={focusRef("work")} label="Uphill" nativeID={nativeID("work")} value={draft.work} unit={draft.workUnit} onChange={(work, workUnit) => update({ work, ...(workUnit === undefined ? {} : { workUnit }) })} />
      <QuantityFields focusRef={focusRef("recovery")} label="Return recovery" nativeID={nativeID("recovery")} value={draft.recovery} unit={draft.recoveryUnit} onChange={(recovery, recoveryUnit) => update({ recovery, ...(recoveryUnit === undefined ? {} : { recoveryUnit }) })} />
      <TargetFields focusRef={focusRef("target")} label="Effort target" nativeID={(mode) => nativeID("target", mode)} target={draft.target} onChange={(target) => update({ target })} />
    </> : null}
    {draft.kind === "fartlek" ? <>
      <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Style</Text>
      <SecondaryAction label="Style Structured" onPress={() => update({ fartlekStyle: "structured" })} />
      <SecondaryAction label="Style Unstructured" onPress={() => update({ fartlekStyle: "unstructured" })} />
      <PlanEditorTextField inputRef={focusRef("repeats")} keyboardType="number-pad" label="Surges / repeats" nativeID={nativeID("repeats")} onChangeText={(repeats) => update({ repeats })} value={draft.repeats} />
      {draft.fartlekStyle === "structured" ? <><QuantityFields focusRef={focusRef("work")} label="Fast segment" nativeID={nativeID("work")} value={draft.work} unit={draft.workUnit} onChange={(work, workUnit) => update({ work, ...(workUnit === undefined ? {} : { workUnit }) })} /><QuantityFields focusRef={focusRef("recovery")} label="Easy float / recovery" nativeID={nativeID("recovery")} value={draft.recovery} unit={draft.recoveryUnit} onChange={(recovery, recoveryUnit) => update({ recovery, ...(recoveryUnit === undefined ? {} : { recoveryUnit }) })} /></> : <><PlanEditorTextField inputRef={focusRef("fast_cue")} label="Fast cue" maxLength={120} nativeID={nativeID("fast_cue")} onChangeText={(fastCue) => update({ fastCue })} value={draft.fastCue} /><PlanEditorTextField inputRef={focusRef("easy_recovery_cue")} label="Easy recovery cue" maxLength={120} nativeID={nativeID("easy_recovery_cue")} onChangeText={(easyRecoveryCue) => update({ easyRecoveryCue })} value={draft.easyRecoveryCue} /></>}
      <TargetFields focusRef={focusRef("target")} label="Effort target" nativeID={(mode) => nativeID("target", mode)} target={draft.target} onChange={(target) => update({ target })} />
    </> : null}
    <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>Session preview</Text>
    <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>{preview ?? "Complete the visible fields to preview this session."}</Text>
  </View>;
}

const styles = StyleSheet.create({
  choiceGroup: { gap: space[2] },
  field: { gap: space[1] },
  form: { gap: space[4] },
});

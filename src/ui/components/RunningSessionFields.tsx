import React from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import type { RunningSessionKind } from "../../domains/running/contracts";
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

export function validateRunningSessionFormDraft(draft: RunningSessionFormDraft): string | null {
  if ((draft.warmUp !== "" && !validPositiveInteger(draft.warmUp)) || (draft.coolDown !== "" && !validPositiveInteger(draft.coolDown))) {
    return "Warm-up and Cool-down must be positive when supplied.";
  }
  if ((draft.kind === "recovery" || draft.kind === "long_run" || draft.kind === "progression") && !validPositiveInteger(draft.volume)) return "Enter a positive Volume.";
  if (draft.kind === "recovery" || draft.kind === "long_run") {
    if (!validTarget(draft.target)) return "Choose a valid target.";
  }
  if (draft.kind === "progression") {
    if (!/^(?:[2-9]|[1-9]\d+)$/u.test(draft.stages)) return "Stages must be a whole number of at least 2.";
    if (!validTarget(draft.startTarget) || !validTarget(draft.finishTarget)) return "Choose valid Start target and Finish target values.";
  }
  const requiresTarget = draft.kind === "tempo" || draft.kind === "intervals" || draft.kind === "hills" || draft.kind === "fartlek";
  if (requiresTarget && !validTarget(draft.target)) return "Choose a valid intensity target.";
  const validQuantity = (value: string) => validPositiveInteger(value);
  if (draft.kind === "tempo") {
    if (!validQuantity(draft.work)) return "Enter a positive Work duration or distance.";
    if (draft.tempoFormat === "tempo_repeats" && (!validPositiveInteger(draft.repeats) || !validQuantity(draft.recovery))) return "Tempo repeats need whole Repeats and positive Recovery.";
  }
  if (draft.kind === "intervals" && (!validPositiveInteger(draft.repeats) || !validQuantity(draft.work) || !validQuantity(draft.recovery))) return "Intervals need whole Repeats, positive Work, and positive Recovery.";
  if (draft.kind === "hills" && (!validPositiveInteger(draft.repeats) || !validQuantity(draft.work) || !validQuantity(draft.recovery))) return "Hills need whole Repeats, positive Uphill, and positive Return recovery.";
  if (draft.kind === "fartlek") {
    if (!validPositiveInteger(draft.repeats)) return "Fartlek needs whole Surges / repeats.";
    if (draft.fartlekStyle === "structured" && (!validQuantity(draft.work) || !validQuantity(draft.recovery))) return "Structured Fartlek needs positive Fast segment and Easy float / recovery.";
    if (draft.fartlekStyle === "unstructured" && (draft.fastCue.trim().length === 0 || draft.fastCue.trim().length > 120 || draft.easyRecoveryCue.trim().length === 0 || draft.easyRecoveryCue.trim().length > 120)) return "Unstructured Fartlek needs bounded Fast cue and Easy recovery cue.";
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
  if (draft.kind === "hills") return `${draft.repeats} × ${quantity(draft.work, draft.workUnit)} · ${quantity(draft.recovery, draft.recoveryUnit)}`;
  if (draft.kind === "fartlek") return draft.fartlekStyle === "structured"
    ? `${draft.repeats} × ${quantity(draft.work, draft.workUnit)} / ${quantity(draft.recovery, draft.recoveryUnit)}`
    : `${draft.repeats} surges · ${draft.fastCue.trim()} / ${draft.easyRecoveryCue.trim()}`;
  return null;
}

function QuantityFields(props: Readonly<{
  label: string;
  value: string;
  unit: "distance" | "duration";
  onChange(value: string, unit?: "distance" | "duration"): void;
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
      onChangeText={(value) => props.onChange(props.unit === "duration" && value !== "" ? String(Math.round(Number(value) * 60_000)) : value)}
      value={durationValue}
    />
  </View>;
}

function TargetFields(props: Readonly<{
  label: string;
  target: RunningSessionTargetDraft;
  onChange(target: RunningSessionTargetDraft): void;
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
    {props.target.mode === "pace" ? <PlanEditorTextField help="Minutes:seconds per kilometre, for example 5:30." label={`${prefix}Pace / km`} onChangeText={(pace) => { const [minutes, seconds = "0"] = pace.split(":"); const value = Number(minutes) * 60_000 + Number(seconds) * 1000; props.onChange({ ...props.target, paceMsPerKm: Number.isFinite(value) ? String(value) : "" }); }} value={paceValue} /> : null}
    {props.target.mode === "heart_rate_zone" ? <PlanEditorTextField keyboardType="number-pad" label={`${prefix}HR zone (Z1–Z5)`} onChangeText={(heartRateZone) => props.onChange({ ...props.target, heartRateZone })} value={props.target.heartRateZone} /> : null}
    {props.target.mode === "rpe" ? <PlanEditorTextField keyboardType="number-pad" label={`${prefix}RPE (1–10)`} onChangeText={(rpe) => props.onChange({ ...props.target, rpe })} value={props.target.rpe} /> : null}
  </View>;
}

export function RunningSessionFields(props: Readonly<{
  draft: RunningSessionFormDraft;
  onChange(draft: RunningSessionFormDraft): void;
}>) {
  const { draft, onChange } = props;
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
    <PlanEditorTextField help="Optional. Enter minutes; zero is shown as None after save." keyboardType="decimal-pad" label="Warm-up (minutes)" onChangeText={(warmUp) => durationUpdate("warmUp", warmUp)} value={durationValue(draft.warmUp)} />
    <PlanEditorTextField help="Optional. Enter minutes; zero is shown as None after save." keyboardType="decimal-pad" label="Cool-down (minutes)" onChangeText={(coolDown) => durationUpdate("coolDown", coolDown)} value={durationValue(draft.coolDown)} />
    {isContextual ? <>
      <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Volume</Text>
      <View style={styles.choiceGroup}>
        <SecondaryAction label="Volume unit distance" onPress={() => update({ volumeUnit: "distance" })} />
        <SecondaryAction label="Volume unit duration" onPress={() => update({ volumeUnit: "duration" })} />
      </View>
      <PlanEditorTextField keyboardType="decimal-pad" label={draft.volumeUnit === "distance" ? "Volume (metres)" : "Volume (minutes)"} onChangeText={(volume) => update({ volume: draft.volumeUnit === "duration" && volume !== "" ? String(Math.round(Number(volume) * 60_000)) : volume })} value={draft.volumeUnit === "duration" ? durationValue(draft.volume) : draft.volume} />
    </> : null}
    {draft.kind === "recovery" ? <TargetFields label="Easy target" target={draft.target} onChange={(target) => update({ target })} /> : null}
    {draft.kind === "long_run" ? <>
      <TargetFields label="Effort target" target={draft.target} onChange={(target) => update({ target })} />
      <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Finish</Text>
      {([
        ["easy_throughout", "Easy throughout"],
        ["steady_finish", "Steady finish"],
        ["progression_finish", "Progression finish"],
      ] as const).map(([finish, label]) => <SecondaryAction key={finish} label={label} onPress={() => update({ finish })} />)}
    </> : null}
    {draft.kind === "progression" ? <>
      <PlanEditorTextField keyboardType="number-pad" label="Stages" onChangeText={(stages) => update({ stages })} value={draft.stages} />
      <TargetFields label="Start target" target={draft.startTarget} onChange={(startTarget) => update({ startTarget })} />
      <TargetFields label="Finish target" target={draft.finishTarget} onChange={(finishTarget) => update({ finishTarget })} />
    </> : null}
    {draft.kind === "tempo" ? <>
      <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Format</Text>
      <SecondaryAction label="Format Continuous" onPress={() => update({ tempoFormat: "continuous" })} />
      <SecondaryAction label="Format Tempo repeats" onPress={() => update({ tempoFormat: "tempo_repeats" })} />
      {draft.tempoFormat === "tempo_repeats" ? <PlanEditorTextField keyboardType="number-pad" label="Repeats" onChangeText={(repeats) => update({ repeats })} value={draft.repeats} /> : null}
      <QuantityFields label="Work" value={draft.work} unit={draft.workUnit} onChange={(work, workUnit) => update({ work, ...(workUnit === undefined ? {} : { workUnit }) })} />
      {draft.tempoFormat === "tempo_repeats" ? <QuantityFields label="Recovery" value={draft.recovery} unit={draft.recoveryUnit} onChange={(recovery, recoveryUnit) => update({ recovery, ...(recoveryUnit === undefined ? {} : { recoveryUnit }) })} /> : null}
      <TargetFields label="Intensity target" target={draft.target} onChange={(target) => update({ target })} />
    </> : null}
    {draft.kind === "intervals" ? <>
      <PlanEditorTextField keyboardType="number-pad" label="Repeats" onChangeText={(repeats) => update({ repeats })} value={draft.repeats} />
      <QuantityFields label="Work" value={draft.work} unit={draft.workUnit} onChange={(work, workUnit) => update({ work, ...(workUnit === undefined ? {} : { workUnit }) })} />
      <QuantityFields label="Recovery" value={draft.recovery} unit={draft.recoveryUnit} onChange={(recovery, recoveryUnit) => update({ recovery, ...(recoveryUnit === undefined ? {} : { recoveryUnit }) })} />
      <TargetFields label="Intensity target" target={draft.target} onChange={(target) => update({ target })} />
    </> : null}
    {draft.kind === "hills" ? <>
      <PlanEditorTextField keyboardType="number-pad" label="Repeats" onChangeText={(repeats) => update({ repeats })} value={draft.repeats} />
      <QuantityFields label="Uphill" value={draft.work} unit={draft.workUnit} onChange={(work, workUnit) => update({ work, ...(workUnit === undefined ? {} : { workUnit }) })} />
      <QuantityFields label="Return recovery" value={draft.recovery} unit={draft.recoveryUnit} onChange={(recovery, recoveryUnit) => update({ recovery, ...(recoveryUnit === undefined ? {} : { recoveryUnit }) })} />
      <TargetFields label="Effort target" target={draft.target} onChange={(target) => update({ target })} />
    </> : null}
    {draft.kind === "fartlek" ? <>
      <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Style</Text>
      <SecondaryAction label="Style Structured" onPress={() => update({ fartlekStyle: "structured" })} />
      <SecondaryAction label="Style Unstructured" onPress={() => update({ fartlekStyle: "unstructured" })} />
      <PlanEditorTextField keyboardType="number-pad" label="Surges / repeats" onChangeText={(repeats) => update({ repeats })} value={draft.repeats} />
      {draft.fartlekStyle === "structured" ? <><QuantityFields label="Fast segment" value={draft.work} unit={draft.workUnit} onChange={(work, workUnit) => update({ work, ...(workUnit === undefined ? {} : { workUnit }) })} /><QuantityFields label="Easy float / recovery" value={draft.recovery} unit={draft.recoveryUnit} onChange={(recovery, recoveryUnit) => update({ recovery, ...(recoveryUnit === undefined ? {} : { recoveryUnit }) })} /></> : <><PlanEditorTextField label="Fast cue" maxLength={120} onChangeText={(fastCue) => update({ fastCue })} value={draft.fastCue} /><PlanEditorTextField label="Easy recovery cue" maxLength={120} onChangeText={(easyRecoveryCue) => update({ easyRecoveryCue })} value={draft.easyRecoveryCue} /></>}
      <TargetFields label="Effort target" target={draft.target} onChange={(target) => update({ target })} />
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

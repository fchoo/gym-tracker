import React from "react";
import { Text, TextInput, View } from "react-native";

import type { RunningSessionKind } from "../../domains/running/contracts";
import { PrimaryAction, SecondaryAction } from ".";

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
  if (!validPositiveInteger(draft.volume)) return "Enter a positive Volume.";
  if (draft.kind === "recovery" || draft.kind === "long_run") {
    if (!validTarget(draft.target)) return "Choose a valid target.";
  }
  if (draft.kind === "progression") {
    if (!/^(?:[2-9]|[1-9]\d+)$/u.test(draft.stages)) return "Stages must be a whole number of at least 2.";
    if (!validTarget(draft.startTarget) || !validTarget(draft.finishTarget)) return "Choose valid Start target and Finish target values.";
  }
  return null;
}

function targetText(target: RunningSessionTargetDraft): string {
  if (target.mode === "pace") return target.paceMsPerKm === "" ? "Pace" : `${target.paceMsPerKm} ms/km`;
  if (target.mode === "heart_rate_zone") return target.heartRateZone === "" ? "HR zone" : `Z${target.heartRateZone}`;
  return target.rpe === "" ? "RPE" : `RPE ${target.rpe}`;
}

export function runningSessionPreview(draft: RunningSessionFormDraft): string | null {
  if (validateRunningSessionFormDraft(draft) !== null) return null;
  const volume = draft.volumeUnit === "distance" ? `${draft.volume} m` : `${draft.volume} ms`;
  if (draft.kind === "recovery") return `${volume} · ${targetText(draft.target)}`;
  if (draft.kind === "long_run") return `${volume} · ${draft.finish.replaceAll("_", " ")}`;
  if (draft.kind === "progression") return `${volume} · ${draft.stages} stages · ${targetText(draft.startTarget)} → ${targetText(draft.finishTarget)}`;
  return null;
}

function TargetFields(props: Readonly<{
  label: string;
  target: RunningSessionTargetDraft;
  onChange(target: RunningSessionTargetDraft): void;
}>) {
  const prefix = props.label === "Easy target" || props.label === "Effort target" ? "" : `${props.label} `;
  return <View accessibilityLabel={props.label}>
    <Text>{props.label}</Text>
    <View>
      <SecondaryAction label={`${prefix}Target: Pace`} onPress={() => props.onChange({ ...props.target, mode: "pace" })} />
      <SecondaryAction label={`${prefix}Target: HR zone`} onPress={() => props.onChange({ ...props.target, mode: "heart_rate_zone" })} />
      <SecondaryAction label={`${prefix}Target: RPE`} onPress={() => props.onChange({ ...props.target, mode: "rpe" })} />
    </View>
    {props.target.mode === "pace" ? <TextInput accessibilityLabel={`${prefix}Pace milliseconds per kilometre`} keyboardType="number-pad" onChangeText={(paceMsPerKm) => props.onChange({ ...props.target, paceMsPerKm })} value={props.target.paceMsPerKm} /> : null}
    {props.target.mode === "heart_rate_zone" ? <TextInput accessibilityLabel={`${prefix}HR zone`} keyboardType="number-pad" onChangeText={(heartRateZone) => props.onChange({ ...props.target, heartRateZone })} value={props.target.heartRateZone} /> : null}
    {props.target.mode === "rpe" ? <TextInput accessibilityLabel={`${prefix}RPE`} keyboardType="number-pad" onChangeText={(rpe) => props.onChange({ ...props.target, rpe })} value={props.target.rpe} /> : null}
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
  return <View accessibilityLabel={`Running ${kindLabel} session`}>
    <Text>Day</Text>
    <View>{WEEKDAYS.map((weekday) => <SecondaryAction key={weekday} label={`Day ${weekday}`} onPress={() => update({ weekday })} />)}</View>
    <TextInput accessibilityLabel="Warm-up duration milliseconds" keyboardType="number-pad" onChangeText={(warmUp) => update({ warmUp })} value={draft.warmUp} />
    <TextInput accessibilityLabel="Cool-down duration milliseconds" keyboardType="number-pad" onChangeText={(coolDown) => update({ coolDown })} value={draft.coolDown} />
    {isContextual ? <>
      <Text>Volume</Text>
      <View>
        <SecondaryAction label="Volume unit distance" onPress={() => update({ volumeUnit: "distance" })} />
        <SecondaryAction label="Volume unit duration" onPress={() => update({ volumeUnit: "duration" })} />
      </View>
      <TextInput
        accessibilityLabel={`Volume ${draft.volumeUnit === "distance" ? "distance metres" : "duration milliseconds"}`}
        keyboardType="number-pad"
        onChangeText={(volume) => update({ volume })}
        value={draft.volume}
      />
    </> : null}
    {draft.kind === "recovery" ? <TargetFields label="Easy target" target={draft.target} onChange={(target) => update({ target })} /> : null}
    {draft.kind === "long_run" ? <>
      <TargetFields label="Effort target" target={draft.target} onChange={(target) => update({ target })} />
      <Text>Finish</Text>
      {([
        ["easy_throughout", "Easy throughout"],
        ["steady_finish", "Steady finish"],
        ["progression_finish", "Progression finish"],
      ] as const).map(([finish, label]) => <SecondaryAction key={finish} label={label} onPress={() => update({ finish })} />)}
    </> : null}
    {draft.kind === "progression" ? <>
      <TextInput accessibilityLabel="Stages" keyboardType="number-pad" onChangeText={(stages) => update({ stages })} value={draft.stages} />
      <TargetFields label="Start target" target={draft.startTarget} onChange={(startTarget) => update({ startTarget })} />
      <TargetFields label="Finish target" target={draft.finishTarget} onChange={(finishTarget) => update({ finishTarget })} />
    </> : null}
    <Text>Session preview</Text>
    <Text>{preview ?? "Complete the visible fields to preview this session."}</Text>
  </View>;
}

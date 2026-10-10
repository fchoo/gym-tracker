import React from "react";
import { Text, TextInput, View } from "react-native";

import type { RunningPlanSession } from "../../domains/running/contracts";

const LABELS: Readonly<Record<RunningPlanSession["session"]["sessionKind"], string>> = {
  recovery: "Recovery",
  long_run: "Long run",
  progression: "Progression",
  tempo: "Tempo",
  intervals: "Intervals",
  hills: "Hills",
  fartlek: "Fartlek",
};

export function RunningSessionFields(props: Readonly<{
  session: RunningPlanSession;
  onChange?(entry: RunningPlanSession): void;
}>) {
  const phase = props.session.session.phases[0];
  const step = phase?.steps[0];
  const value = step?.kind === "distance" ? String(step.distanceMeters) : String(step?.durationMs ?? "");
  const updateQuantity = (next: string) => {
    const quantity = Number(next);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || step === undefined || phase === undefined) return;
    const updatedStep = step.kind === "distance"
      ? { ...step, distanceMeters: quantity }
      : step.kind === "duration"
        ? { ...step, durationMs: quantity }
        : { ...step, durationMs: quantity };
    props.onChange?.({
      ...props.session,
      session: {
        ...props.session.session,
        phases: [{ ...phase, steps: [updatedStep] }, ...props.session.session.phases.slice(1)],
      },
    });
  };
  return (
    <View accessibilityLabel={`Running ${LABELS[props.session.session.sessionKind]} session`}>
      <Text>{LABELS[props.session.session.sessionKind]}</Text>
      <Text>Day · {props.session.slot.weekday}</Text>
      <Text>Warm-up · Work · Cool-down</Text>
      <TextInput
        accessibilityLabel={`${LABELS[props.session.session.sessionKind]} work duration`}
        keyboardType="number-pad"
        onChangeText={updateQuantity}
        value={value}
      />
      {props.session.session.sessionKind === "progression" ? <Text>Progression stages and pace</Text> : null}
      {props.session.session.sessionKind === "tempo" ? <Text>Tempo format and duration</Text> : null}
      {props.session.session.sessionKind === "intervals" ? <Text>Intervals repetitions, work and recovery</Text> : null}
      {props.session.session.sessionKind === "hills" ? <Text>Hills repetitions, work and return recovery</Text> : null}
      {props.session.session.sessionKind === "fartlek" ? <Text>Fartlek format, work and recovery</Text> : null}
    </View>
  );
}

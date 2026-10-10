import React from "react";
import { Text, View } from "react-native";
import type { RunningPlanSession } from "../../domains/running/contracts";

export function RunningSessionFields(props: Readonly<{ session: RunningPlanSession }>) {
  return <View accessibilityLabel={`Running ${props.session.session.sessionKind} session`}><Text>{props.session.session.sessionKind}</Text></View>;
}

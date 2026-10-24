import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";

import {
  collectV12ProductionRecoveryPhase,
  v12ProductionRecoveryEnabled,
} from "../src/testing/v12ProductionRecovery";
import { V12RecoveryRootContext } from "../src/testing/v12RecoveryRootContext";

type RoutePhase = "arm" | "recover";
type RouteState = "executing" | "armed" | "observed" | "failed";

function RecoveryExecution(input: Readonly<{
  identity: Parameters<typeof v12ProductionRecoveryEnabled>[0];
  phase: RoutePhase;
}>) {
  const [state, setState] = React.useState<RouteState>("executing");
  React.useEffect(() => {
    const controller = new AbortController();
    void collectV12ProductionRecoveryPhase({
      identity: input.identity,
      phase: input.phase,
      onArmed: () => { if (!controller.signal.aborted) setState("armed"); },
      emit: (line) => {
        console.info(line);
      },
      signal: controller.signal,
    }).then((result) => {
      if (!controller.signal.aborted) {
        setState(result === "armed" ? "armed" : "observed");
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        console.info(`GYM_TRACKER_V12_DOMAIN_RESULT:${JSON.stringify({
          schema_version: 2,
          nonce: input.identity.nonce,
          kind: "error",
          code: "domain_failed",
        })}`);
        setState("failed");
      }
    });
    return () => controller.abort();
  }, [input.identity, input.phase]);

  const heading = state === "armed"
    ? "Recovery cut armed"
    : state === "observed"
      ? "Recovery observation complete"
      : state === "failed"
        ? "Recovery observation failed"
        : input.phase === "arm"
          ? "Executing recovery cut"
          : "Reading recovery facts";
  return <View><Text accessibilityRole="header">{heading}</Text></View>;
}

export default function V12ProductionRecoveryRoute() {
  const rootScope = React.useContext(V12RecoveryRootContext);
  const {
    nonce,
    caseId,
    stepId,
    cutId,
    phase,
  } = useLocalSearchParams<{
    nonce?: string;
    caseId?: string;
    stepId?: string;
    cutId?: string;
    phase?: string;
  }>();
  const extra = Constants.expoConfig?.extra;
  const identity = React.useMemo(() => ({
    packageName: Constants.expoConfig?.android?.package,
    buildProfile: extra?.buildProfile,
    nativeContractsEnabled: extra?.nativeContractsEnabled,
    suite: extra?.nativeContractSuite,
    nonce,
    caseId,
    stepId,
    cutId,
  }), [caseId, cutId, extra, nonce, stepId]);
  const enabled = (phase === "arm" || phase === "recover")
    && v12ProductionRecoveryEnabled(identity);
  if (!enabled) return <Redirect href="/" />;
  // A deep link can mount the leaf in the previous navigator before the root
  // replaces it. Only the validated isolated branch may start native work.
  if (rootScope?.databaseName !== `gym-tracker-phase20-recovery-shell-${nonce}.db`) {
    return <View><Text accessibilityRole="header">Preparing recovery route</Text></View>;
  }
  return <RecoveryExecution identity={identity} phase={phase as RoutePhase} />;
}

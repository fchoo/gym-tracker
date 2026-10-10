import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";

import { useWorkoutAppRuntime } from "../src/bootstrap/workoutAppRuntime";

function enabled(): boolean {
  const extra = Constants.expoConfig?.extra;
  return extra?.buildProfile === "development-test"
    && extra.nativeContractsEnabled === true
    && extra.nativeContractSuite === "phase17";
}

function Phase17Port() {
  const runtime = useWorkoutAppRuntime();
  const { operation, case: caseId, baseline } = useLocalSearchParams<{ operation?: string; case?: string; baseline?: string }>();
  const [output, setOutput] = React.useState("PHASE17_PORT_PENDING");
  React.useEffect(() => {
    if (runtime.launchState !== "trusted" || typeof caseId !== "string") return;
    void runtime.collectPhase17SourceStateProof().then((proof) => {
      const digest = proof.digest_sha256;
      if (operation === "probe") setOutput(`PHASE17_SOURCE_PROBE case=${caseId} digest_sha256=${digest}`);
      else if (operation === "setup") setOutput(`PHASE17_SETUP_READY case=${caseId} baseline_sha256=${digest}`);
      else if (operation === "cleanup") setOutput(
        baseline === digest
          ? `PHASE17_CLEANUP_READY case=${caseId} baseline_sha256=${digest}`
          : `PHASE17_CLEANUP_MISMATCH case=${caseId}`,
      );
      else setOutput("PHASE17_PORT_INVALID_OPERATION");
    }).catch(() => setOutput("PHASE17_PORT_ERROR"));
  }, [baseline, caseId, operation, runtime]);
  return <View><Text accessibilityLabel={output} selectable>{output}</Text></View>;
}

export default function Phase17MaestroPortRoute() {
  return enabled() ? <Phase17Port /> : <Redirect href="/" />;
}

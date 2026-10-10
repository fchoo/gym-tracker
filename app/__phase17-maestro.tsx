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
  const { operation, case: caseId, fixtureToken, sourceTable, expectedState } = useLocalSearchParams<{
    operation?: string; case?: string; fixtureToken?: string; sourceTable?: string; expectedState?: string;
  }>();
  const [output, setOutput] = React.useState("PHASE17_PORT_PENDING");
  React.useEffect(() => {
    if (runtime.launchState !== "trusted" || typeof caseId !== "string") return;
    if (operation === "setup") {
      void runtime.setupPhase17Fixture(caseId).then((fixture) => setOutput(
        `PHASE17_SETUP_READY case=${fixture.caseId} fixture_token=${fixture.fixtureToken} baseline_sha256=${fixture.baselineDigest} source_table=${fixture.sourceTable} expected_state=${fixture.expectedState} selectors=${Object.entries(fixture.selectors).map(([key, value]) => `${key}:${value}`).join(",")}`,
      )).catch(() => setOutput("PHASE17_PORT_ERROR"));
      return;
    }
    if (typeof fixtureToken !== "string") { setOutput("PHASE17_PORT_FIXTURE_TOKEN_MISSING"); return; }
    if (operation === "probe" && typeof sourceTable === "string" && typeof expectedState === "string") {
      void runtime.probePhase17Fixture({ caseId, fixtureToken, sourceTable, expectedState }).then((proof) => setOutput(
        `PHASE17_SOURCE_PROBE case=${proof.caseId} fixture_token=${proof.fixtureToken} source_table=${proof.sourceTable} expected_state=${proof.expectedState} row_count=${proof.rowCount} identity_hash=${proof.identityHash} verdict=${proof.verdict}`,
      )).catch(() => setOutput("PHASE17_PORT_ERROR"));
      return;
    }
    if (operation === "cleanup") {
      void runtime.cleanupPhase17Fixture({ caseId, fixtureToken }).then((receipt) => setOutput(
        `PHASE17_CLEANUP_READY case=${receipt.caseId} fixture_token=${receipt.fixtureToken} baseline_sha256=${receipt.baselineDigest} verdict=${receipt.verdict}`,
      )).catch(() => setOutput("PHASE17_PORT_ERROR"));
      return;
    }
    setOutput("PHASE17_PORT_INVALID_OPERATION");
  }, [caseId, expectedState, fixtureToken, operation, runtime, sourceTable]);
  return <View><Text accessibilityLabel={output} selectable>{output}</Text></View>;
}

export default function Phase17MaestroPortRoute() {
  return enabled() ? <Phase17Port /> : <Redirect href="/" />;
}

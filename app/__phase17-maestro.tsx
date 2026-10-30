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
  const { operation, case: caseId, fixtureToken, sourceTable } = useLocalSearchParams<{
    operation?: string; case?: string; fixtureToken?: string; sourceTable?: string;
  }>();
  const [output, setOutput] = React.useState("PHASE17_PORT_PENDING");
  React.useEffect(() => {
    if (runtime.launchState !== "trusted" || typeof caseId !== "string") return;
    if (operation === "setup") {
      void runtime.setupPhase17Fixture(caseId).then((fixture) => setOutput(
        `PHASE17_SETUP_READY case=${fixture.caseId} proof_mode=${fixture.proofMode} fixture_token=${fixture.fixtureToken} baseline_sha256=${fixture.baselineDigest} source_table=${fixture.sourceTable} expected_pre_state_hash=${fixture.expectedPreStateHash} expected_post_state_hash=${fixture.expectedPostStateHash} action_receipt_id=${fixture.actionReceiptId ?? "none"} selectors=${Object.entries(fixture.selectors).map(([key, value]) => `${key}:${value}`).join(",") || "none"} action_inputs=${Object.entries(fixture.actionInputs).map(([key, value]) => `${key}:${value}`).join(",") || "none"}`,
      )).catch(() => setOutput("PHASE17_PORT_ERROR"));
      return;
    }
    if (typeof fixtureToken !== "string") { setOutput("PHASE17_PORT_FIXTURE_TOKEN_MISSING"); return; }
    if (operation === "activate") {
      void runtime.hydratePhase17ActionEnvelopes({ caseId, fixtureToken }).then((active) => setOutput(
        active ? `PHASE17_ACTION_ENVELOPE_READY case=${caseId} fixture_token=${fixtureToken}` : "PHASE17_ACTION_ENVELOPE_MISSING",
      )).catch(() => setOutput("PHASE17_PORT_ERROR"));
      return;
    }
    if (operation === "probe" && typeof sourceTable === "string") {
      void runtime.probePhase17Fixture({ caseId, fixtureToken, sourceTable }).then((proof) => setOutput(
        `PHASE17_SOURCE_PROBE case=${proof.caseId} fixture_token=${proof.fixtureToken} source_table=${proof.sourceTable} row_count=${proof.rowCount} identity_hash=${proof.identityHash} expected_post_state_hash=${proof.expectedPostStateHash} verdict=${proof.verdict}`,
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
  }, [caseId, fixtureToken, operation, runtime, sourceTable]);
  return <View><Text accessibilityLabel={output} selectable>{output}</Text></View>;
}

export default function Phase17MaestroPortRoute() {
  return enabled() ? <Phase17Port /> : <Redirect href="/" />;
}

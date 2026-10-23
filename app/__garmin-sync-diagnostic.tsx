import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { getGarminConnectNativeModule } from "../modules/garmin-connect/src";
import { garminBridgeDiagnosticEnabled } from "../src/testing/garminBridgeDiagnostic";
import { runGarminSyncDiagnostic as verifyReadOnlyGarminStages } from "../src/testing/garminSyncDiagnostic";

function Probe({ nonce }: Readonly<{ nonce: string }>) {
  const [status, setStatus] = React.useState("Checking read-only Garmin stages");
  React.useEffect(() => {
    let mounted = true;
    void (async () => {
      let result;
      try { result = await verifyReadOnlyGarminStages(getGarminConnectNativeModule()); }
      catch { result = { status: "failed", stage: "module", code: "temporary_failure" }; }
      if (!mounted) return;
      console.log(`GYM_TRACKER_GARMIN_SYNC_DIAGNOSTIC:${JSON.stringify({ schema_version: 1, nonce, ...result })}`);
      setStatus(result.status === "passed" ? "Read-only native stages ready" : "Read-only stage failed");
    })();
    return () => { mounted = false; };
  }, [nonce]);
  return <View><Text accessibilityRole="header">{status}</Text></View>;
}

export default function GarminSyncDiagnosticRoute() {
  const { nonce } = useLocalSearchParams<{ nonce?: string }>();
  const extra = Constants.expoConfig?.extra;
  if (!garminBridgeDiagnosticEnabled({ packageName: Constants.expoConfig?.android?.package,
    profile: extra?.buildProfile, enabled: extra?.nativeContractsEnabled, suite: extra?.nativeContractSuite }, nonce)) return <Redirect href="/" />;
  return <Probe nonce={nonce} />;
}

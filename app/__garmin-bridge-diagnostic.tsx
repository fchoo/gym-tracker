import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { getGarminConnectNativeModule } from "../modules/garmin-connect/src";
import { garminBridgeDiagnosticEnabled, runGarminBridgeDiagnostic as verifyGarminBridge } from "../src/testing/garminBridgeDiagnostic";

function Probe({ nonce }: Readonly<{ nonce: string }>) {
  const [status, setStatus] = React.useState("Checking inert transport readiness");
  React.useEffect(() => {
    let mounted = true;
    void (async () => {
      let result;
      try { result = await verifyGarminBridge(getGarminConnectNativeModule(), nonce); }
      catch { result = { status: "failed", stage: "module", code: "native_bridge_rejected" }; }
      if (!mounted) return;
      console.log(`GYM_TRACKER_GARMIN_BRIDGE_DIAGNOSTIC:${JSON.stringify({ schema_version: 1, nonce, ...result })}`);
      setStatus(result.status === "passed" ? "Inert transport ready (no login or handshake)" : "Native bridge failed");
    })();
    return () => { mounted = false; };
  }, [nonce]);
  return <View><Text accessibilityRole="header">{status}</Text></View>;
}

export default function GarminBridgeDiagnosticRoute() {
  const { nonce } = useLocalSearchParams<{ nonce?: string }>();
  const extra = Constants.expoConfig?.extra;
  if (!garminBridgeDiagnosticEnabled({ packageName: Constants.expoConfig?.android?.package,
    profile: extra?.buildProfile, enabled: extra?.nativeContractsEnabled, suite: extra?.nativeContractSuite }, nonce)) return <Redirect href="/" />;
  return <Probe nonce={nonce} />;
}

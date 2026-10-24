import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { getGarminConnectNativeModule } from "../modules/garmin-connect/src";
import { garminBridgeDiagnosticEnabled } from "../src/testing/garminBridgeDiagnostic";
import { resolveGarminSyncDiagnosticMode, runGarminSyncDiagnostic as verifyReadOnlyGarminStages, type GarminSyncDiagnosticMode } from "../src/testing/garminSyncDiagnostic";

function sha256(value: string) {
  const { CryptoDigestAlgorithm, digestStringAsync } = require("expo-crypto") as typeof import("expo-crypto");
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
}

function Probe({ nonce, mode }: Readonly<{ nonce: string; mode: GarminSyncDiagnosticMode }>) {
  const [status, setStatus] = React.useState("Checking read-only Garmin stages");
  React.useEffect(() => {
    let mounted = true;
    void (async () => {
      let result;
      try {
        const native = getGarminConnectNativeModule();
        result = mode === "components" ? await verifyReadOnlyGarminStages(native, nonce)
          : await verifyReadOnlyGarminStages(native, nonce, mode, mode === "normalize" ? sha256 : undefined);
      }
      catch { result = { status: "failed", stage: "module", code: "temporary_failure" }; }
      if (!mounted) return;
      console.log(`GYM_TRACKER_GARMIN_SYNC_DIAGNOSTIC:${JSON.stringify({ schema_version: 1, nonce, ...result })}`);
      setStatus(result.status === "passed" ? "Read-only native stages ready" : "Read-only stage failed");
    })();
    return () => { mounted = false; };
  }, [nonce, mode]);
  return <View><Text accessibilityRole="header">{status}</Text></View>;
}

export default function GarminSyncDiagnosticRoute() {
  const { nonce, mode: requestedMode } = useLocalSearchParams<{ nonce?: string; mode?: string }>();
  const mode = resolveGarminSyncDiagnosticMode(requestedMode);
  const extra = Constants.expoConfig?.extra;
  if (!garminBridgeDiagnosticEnabled({ packageName: Constants.expoConfig?.android?.package,
    profile: extra?.buildProfile, enabled: extra?.nativeContractsEnabled, suite: extra?.nativeContractSuite }, nonce) || mode === undefined) return <Redirect href="/" />;
  return <Probe nonce={nonce} mode={mode} />;
}

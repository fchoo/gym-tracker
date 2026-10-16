import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";

import { collectV12ProductionGarminDomain, v12ProductionGarminEnabled } from "../src/bootstrap/v12ProductionGarminDomain";

function GarminObservation({ nonce, confirmation, mode }: Readonly<{
  nonce: string;
  confirmation: string;
  mode: "preflight" | "execute";
}>) {
  React.useEffect(() => {
    const controller = new AbortController();
    const extra = Constants.expoConfig?.extra;
    void collectV12ProductionGarminDomain({ packageName: Constants.expoConfig?.android?.package, buildProfile: extra?.buildProfile, nativeContractsEnabled: extra?.nativeContractsEnabled, suite: extra?.nativeContractSuite, nonce, confirmation, mode }, (line) => console.info(line), controller.signal).catch(() => {
      if (!controller.signal.aborted) console.info(`GYM_TRACKER_V12_DOMAIN_RESULT:${JSON.stringify({ schema_version: 2, nonce, kind: "error", code: "domain_failed" })}`);
    });
    return () => controller.abort();
  }, [nonce, confirmation, mode]);
  return <View><Text accessibilityRole="header">Garmin native observation</Text></View>;
}

export default function V12ProductionGarminRoute() {
  const { nonce, confirmation, mode } = useLocalSearchParams<{ nonce?: string; confirmation?: string; mode?: string }>();
  const extra = Constants.expoConfig?.extra;
  if (!v12ProductionGarminEnabled({ packageName: Constants.expoConfig?.android?.package, buildProfile: extra?.buildProfile, nativeContractsEnabled: extra?.nativeContractsEnabled, suite: extra?.nativeContractSuite, nonce, confirmation, mode })) return <Redirect href="/" />;
  return <GarminObservation nonce={nonce!} confirmation={confirmation!} mode={(mode ?? "execute") as "preflight" | "execute"} />;
}

import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";

import { collectV12ProductionGarminDomain, v12ProductionGarminEnabled } from "../src/bootstrap/v12ProductionGarminDomain";

function GarminObservation({ nonce, confirmation }: Readonly<{ nonce: string; confirmation: string }>) {
  React.useEffect(() => {
    const controller = new AbortController();
    const extra = Constants.expoConfig?.extra;
    void collectV12ProductionGarminDomain({ packageName: Constants.expoConfig?.android?.package, buildProfile: extra?.buildProfile, nativeContractsEnabled: extra?.nativeContractsEnabled, suite: extra?.nativeContractSuite, nonce, confirmation }, (line) => console.info(line), controller.signal).catch(() => {
      if (!controller.signal.aborted) console.info(`GYM_TRACKER_V12_DOMAIN_RESULT:${JSON.stringify({ schema_version: 1, nonce, kind: "error", code: "domain_failed" })}`);
    });
    return () => controller.abort();
  }, [nonce, confirmation]);
  return <View><Text accessibilityRole="header">Garmin native observation</Text></View>;
}

export default function V12ProductionGarminRoute() {
  const { nonce, confirmation } = useLocalSearchParams<{ nonce?: string; confirmation?: string }>();
  const extra = Constants.expoConfig?.extra;
  if (!v12ProductionGarminEnabled({ packageName: Constants.expoConfig?.android?.package, buildProfile: extra?.buildProfile, nativeContractsEnabled: extra?.nativeContractsEnabled, suite: extra?.nativeContractSuite, nonce, confirmation })) return <Redirect href="/" />;
  return <GarminObservation nonce={nonce!} confirmation={confirmation!} />;
}

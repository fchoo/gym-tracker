import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { rollbackNativeEnabled, collectNativeRollbackBridge, type RollbackNativeIdentity } from "../src/testing/v12NativeRollbackBridge";

function Execution({ identity, nonce }: Readonly<{ identity: RollbackNativeIdentity; nonce: string }>) {
  const [state, setState] = React.useState("Verifying recovery archive");
  React.useEffect(() => {
    let mounted = true;
    void collectNativeRollbackBridge(identity, nonce).then(() => {
      if (mounted) setState("Recovery archive verified");
    }).catch(() => {
      if (mounted) setState("Recovery archive failed");
    });
    return () => { mounted = false; };
  }, [identity, nonce]);
  return <View><Text accessibilityRole="header">{state}</Text></View>;
}

/** Parent root navigator must bypass normal app runtime, effects, and workout database startup. */
export default function V12RollbackBridgeRoute() {
  const { nonce } = useLocalSearchParams<{ nonce?: string }>();
  const identity = React.useMemo(() => ({
    packageName: Constants.expoConfig?.android?.package, buildProfile: Constants.expoConfig?.extra?.buildProfile,
    nativeContractsEnabled: Constants.expoConfig?.extra?.nativeContractsEnabled, suite: Constants.expoConfig?.extra?.nativeContractSuite,
  }), []);
  if (!rollbackNativeEnabled(identity) || typeof nonce !== "string" || !/^[a-f0-9]{32}$/u.test(nonce)) return <Redirect href="/" />;
  return <Execution identity={identity} nonce={nonce} />;
}

import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  GARMIN_ACCEPTANCE_HOST_CASE_IDS,
  GARMIN_ACCEPTANCE_NATIVE_PREREQUISITE_IDS,
} from "../src/testing/contracts/garminImport.contract";
import {
  PHASE18_GARMIN_BENCHMARK_MARKER,
  createPhase18GarminBenchmarkMarkerReport,
  phase18GarminAcceptanceBenchmarkEnabled,
  phase18GarminAcceptanceEnabled,
} from "../src/testing/phase18GarminAcceptance";

function Phase18GarminBenchmarkScreen({ nonce }: Readonly<{ nonce: string }>) {
  const [status, setStatus] = React.useState("benchmark-pending");
  React.useEffect(() => {
    const report = createPhase18GarminBenchmarkMarkerReport({
      nonce,
      pid: 1,
    });
    console.log(`${PHASE18_GARMIN_BENCHMARK_MARKER}${JSON.stringify(report)}`);
    setStatus("benchmark-ready");
  }, [nonce]);
  return (
    <View style={styles.root} accessibilityLabel="Phase 18 Garmin benchmark">
      <Text style={styles.title}>Phase 18 Garmin benchmark</Text>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.detail}>installed-route-log</Text>
    </View>
  );
}

export default function Phase18GarminAcceptanceScreen() {
  const { confirmation, mode, nonce } = useLocalSearchParams<{
    confirmation?: string;
    mode?: string;
    nonce?: string;
  }>();
  const extra = Constants.expoConfig?.extra;
  const params = {
    buildProfile: extra?.buildProfile,
    nativeContractsEnabled: extra?.nativeContractsEnabled,
    suite: extra?.nativeContractSuite,
    confirmation,
    mode,
    nonce,
  };
  const benchmarkEnabled = phase18GarminAcceptanceBenchmarkEnabled(params);
  const enabled = phase18GarminAcceptanceEnabled(params);

  if (benchmarkEnabled) return <Phase18GarminBenchmarkScreen nonce={nonce} />;
  if (!enabled) return <Redirect href="/" />;

  return (
    <View style={styles.root} accessibilityLabel="Phase 18 Garmin acceptance">
      <Text style={styles.title}>Phase 18 Garmin acceptance</Text>
      <Text style={styles.status}>host-passed-native-deferred</Text>
      <Text style={styles.detail}>synthetic-redacted-only</Text>
      <Text style={styles.detail}>
        {GARMIN_ACCEPTANCE_HOST_CASE_IDS.length} deterministic cases
      </Text>
      <Text style={styles.detail}>
        {GARMIN_ACCEPTANCE_NATIVE_PREREQUISITE_IDS.length} native prerequisites
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    backgroundColor: "#F6F8FB",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  title: { color: "#171A1C", fontSize: 28, fontWeight: "700" },
  status: { color: "#22543D", fontSize: 18, marginTop: 12 },
  detail: { color: "#4F5B66", fontSize: 16, marginTop: 8 },
});

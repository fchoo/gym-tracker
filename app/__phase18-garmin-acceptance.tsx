import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import {
  GARMIN_ACCEPTANCE_HOST_CASE_IDS,
  GARMIN_ACCEPTANCE_NATIVE_PREREQUISITE_IDS,
} from "../src/testing/contracts/garminImport.contract";
import {
  phase18GarminAcceptanceEnabled,
} from "../src/testing/phase18GarminAcceptance";

export default function Phase18GarminAcceptanceScreen() {
  const { confirmation } = useLocalSearchParams<{ confirmation?: string }>();
  const extra = Constants.expoConfig?.extra;
  const enabled = phase18GarminAcceptanceEnabled({
    buildProfile: extra?.buildProfile,
    nativeContractsEnabled: extra?.nativeContractsEnabled,
    suite: extra?.nativeContractSuite,
    confirmation,
  });

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

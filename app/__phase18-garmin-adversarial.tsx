import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  PHASE18_GARMIN_ADVERSARIAL_CONFIRMATION,
  PHASE18_GARMIN_ADVERSARIAL_RESULT_MARKER,
  phase18GarminAdversarialEnabled,
  runPhase18GarminAdversarialNativeSuite as collectAdversarialReport,
} from "../src/testing/phase18GarminAdversarial";

const INITIAL_STATUS = "native-proof-running";
const REPORT_MARKER = "GYM_TRACKER_PHASE18_GARMIN_ADVERSARIAL_REPORT:";

function Phase18GarminAdversarialContent() {
  const [status, setStatus] = React.useState(INITIAL_STATUS);
  const buildIdentity = Constants.expoConfig?.extra?.phase18GarminAdversarialBuildIdentity;
  React.useEffect(() => {
    let active = true;
    void collectAdversarialReport(undefined, buildIdentity).then((report) => {
      if (!active) return;
      for (const entry of report.cases) {
        console.log(`${PHASE18_GARMIN_ADVERSARIAL_RESULT_MARKER}${JSON.stringify(entry)}`);
      }
      console.log(`${REPORT_MARKER}${JSON.stringify(report)}`);
      setStatus(report.status);
    }).catch(() => {
      if (active) setStatus("TECHNICAL_REVIEW_REQUIRED");
    });
    return () => {
      active = false;
    };
  }, [buildIdentity]);
  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={styles.title}>
        Garmin adversarial proof
      </Text>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.notice}>
        Installed native lifecycle and injected-failure evidence is emitted only for Phase 20 collection.
      </Text>
    </View>
  );
}

export default function Phase18GarminAdversarialRoute() {
  const { confirmation } = useLocalSearchParams<{ confirmation?: string }>();
  const extra = Constants.expoConfig?.extra;
  const enabled = phase18GarminAdversarialEnabled({
    buildProfile: extra?.buildProfile,
    nativeContractsEnabled: extra?.nativeContractsEnabled,
    suite: extra?.nativeContractSuite,
    confirmation,
  });
  if (!enabled || confirmation !== PHASE18_GARMIN_ADVERSARIAL_CONFIRMATION) {
    return <Redirect href="/" />;
  }
  return <Phase18GarminAdversarialContent />;
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#F6F8FB",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  title: { color: "#171A1C", fontSize: 28, fontWeight: "700" },
  status: { color: "#4F5B66", fontSize: 16, marginBottom: 24, marginTop: 8 },
  notice: { color: "#4F5B66", fontSize: 14, lineHeight: 20 },
});

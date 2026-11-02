import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { performPhase12GoogleCleanup } from "../src/bootstrap/phase12GoogleCleanup";
import {
  PHASE12_GOOGLE_CLEANUP_RESULT_MARKER,
  phase12GoogleCleanupEnabled,
} from "../src/testing/phase12GoogleCleanup";

type State = "disabled" | "running" | "finished" | "failed";

export default function Phase12GoogleCleanupScreen() {
  const { confirmation } = useLocalSearchParams<{ confirmation?: string }>();
  const started = useRef(false);
  const extra = Constants.expoConfig?.extra;
  const enabled = phase12GoogleCleanupEnabled({
    buildProfile: extra?.buildProfile,
    nativeContractsEnabled: extra?.nativeContractsEnabled,
    suite: process.env.EXPO_PUBLIC_NATIVE_CONTRACT_SUITE,
    confirmation,
  });
  const [state, setState] = useState<State>(enabled ? "running" : "disabled");

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    const webClientId = extra?.googleOAuth?.webClientId;
    if (typeof webClientId !== "string") {
      setState("failed");
      return;
    }
    void performPhase12GoogleCleanup(webClientId).then((result) => {
      console.log(`${PHASE12_GOOGLE_CLEANUP_RESULT_MARKER}${JSON.stringify(result)}`);
      setState("finished");
    }).catch(() => { setState("failed"); });
  }, [enabled, extra?.googleOAuth?.webClientId]);

  if (state === "disabled") return <Redirect href="/" />;
  return <View style={styles.root}><Text style={styles.title}>Phase 12 cleanup</Text><Text style={styles.status}>{state}</Text></View>;
}

const styles = StyleSheet.create({
  root: { alignItems: "center", backgroundColor: "#F6F8FB", flex: 1, justifyContent: "center", padding: 24 },
  title: { color: "#171A1C", fontSize: 28, fontWeight: "700" },
  status: { color: "#4F5B66", fontSize: 18, marginTop: 12 },
});

import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { performPhase12GoogleAuthSmoke } from "../src/bootstrap/phase12GoogleAuthSmoke";
import {
  PHASE12_GOOGLE_AUTH_SMOKE_RESULT_MARKER,
  phase12GoogleAuthSmokeEnabled,
} from "../src/testing/phase12GoogleAuthSmoke";

type State = "disabled" | "running" | "finished" | "failed";

export default function Phase12GoogleAuthSmokeScreen() {
  const { confirmation } = useLocalSearchParams<{ confirmation?: string }>();
  const started = useRef(false);
  const extra = Constants.expoConfig?.extra;
  const enabled = phase12GoogleAuthSmokeEnabled({
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
    void performPhase12GoogleAuthSmoke(webClientId).then((result) => {
      console.log(`${PHASE12_GOOGLE_AUTH_SMOKE_RESULT_MARKER}${JSON.stringify(result)}`);
      setState("finished");
    }).catch(() => { setState("failed"); });
  }, [enabled, extra?.googleOAuth?.webClientId]);

  if (state === "disabled") return <Redirect href="/" />;
  return <View style={styles.root}><Text style={styles.title}>Phase 12 Google auth</Text><Text style={styles.status}>{state}</Text></View>;
}

const styles = StyleSheet.create({
  root: { alignItems: "center", backgroundColor: "#F6F8FB", flex: 1, justifyContent: "center", padding: 24 },
  title: { color: "#171A1C", fontSize: 28, fontWeight: "700" },
  status: { color: "#4F5B66", fontSize: 18, marginTop: 12 },
});

import Constants from "expo-constants";
import {
  Redirect,
} from "expo-router";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
} from "react-native";

import {
  PHASE12_BENCHMARK_ERROR_MARKER,
  PHASE12_BENCHMARK_RESULT_MARKER,
  PHASE12_BENCHMARK_START_MARKER,
  performPhase12BackupBenchmark,
  phase12BenchmarkStartupAction,
  type Phase12BackupBenchmarkResult,
} from "../src/bootstrap/phase12BackupBenchmark";

const suite = process.env.EXPO_PUBLIC_NATIVE_CONTRACT_SUITE;

type RouteState =
  | Readonly<{ status: "disabled" | "running" }>
  | Readonly<{ status: "finished"; result: Phase12BackupBenchmarkResult }>
  | Readonly<{ status: "failed"; errorCode: string }>;

export default function Phase12BenchmarkScreen() {
  const started = useRef(false);
  const nativeContractsEnabled =
    Constants.expoConfig?.extra?.nativeContractsEnabled === true;
  const [state, setState] = useState<RouteState>(
    nativeContractsEnabled && suite === "phase12"
      ? { status: "running" }
      : { status: "disabled" },
  );

  useEffect(() => {
    const action = phase12BenchmarkStartupAction({
      enabled: nativeContractsEnabled,
      launchState: "trusted",
      started: started.current,
      suite,
    });
    if (action === "fail") {
      console.error(`${PHASE12_BENCHMARK_ERROR_MARKER}${JSON.stringify({
        message: "phase12_benchmark_runtime_failed",
      })}`);
      setState({ status: "failed", errorCode: "phase12_benchmark_runtime_failed" });
      return;
    }
    if (action !== "start") return;
    started.current = true;
    console.log(`${PHASE12_BENCHMARK_START_MARKER}${JSON.stringify({
      suite: "phase12",
      mode: "automated-only",
    })}`);
    void performPhase12BackupBenchmark().then((result) => {
      console.log(`${PHASE12_BENCHMARK_RESULT_MARKER}${JSON.stringify(result)}`);
      setState({ status: "finished", result });
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "phase12_benchmark_failed";
      console.error(`${PHASE12_BENCHMARK_ERROR_MARKER}${JSON.stringify({ message })}`);
      setState({ status: "failed", errorCode: "phase12_benchmark_failed" });
    });
  }, [nativeContractsEnabled]);

  if (state.status === "disabled") return <Redirect href="/" />;
  const completed = state.status === "finished" ? state.result : undefined;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>Development Test</Text>
      <Text style={styles.title}>Phase 12 Backup Benchmark</Text>
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {state.status === "running"
          ? "Measuring local backup safeguards…"
          : state.status === "failed"
            ? "Phase 12 backup benchmark failed."
            : `${completed?.measurements.merge_preflight_ms.length ?? 0} merge preflights complete`}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#F6F8FB", flexGrow: 1, padding: 24, paddingTop: 64 },
  eyebrow: { color: "#4F5B66", fontSize: 13, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { color: "#171A1C", fontSize: 28, fontWeight: "700", marginTop: 8 },
  status: { color: "#176B3A", fontSize: 18, fontWeight: "600", marginTop: 16 },
});

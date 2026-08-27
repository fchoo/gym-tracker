import Constants from "expo-constants";
import {
  Redirect,
  useLocalSearchParams,
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
  PHASE1_BENCHMARK_RESULT_MARKER,
  boundedPhase1BenchmarkSamples,
  performPhase1Benchmark,
  type Phase1BenchmarkResult,
} from "../src/bootstrap/phase1Benchmark";

type RouteState =
  | Readonly<{ status: "disabled" | "running" }>
  | Readonly<{ status: "finished"; result: Phase1BenchmarkResult }>
  | Readonly<{ status: "failed"; errorCode: string }>;

export default function Phase1BenchmarkScreen() {
  const parameters = useLocalSearchParams<{ samples?: string | string[] }>();
  const samples = boundedPhase1BenchmarkSamples(parameters.samples);
  const started = useRef(false);
  const enabled = Constants.expoConfig?.extra?.nativeContractsEnabled === true;
  const [state, setState] = useState<RouteState>(
    enabled ? { status: "running" } : { status: "disabled" },
  );

  useEffect(() => {
    if (!enabled || started.current) {
      return;
    }
    started.current = true;

    void performPhase1Benchmark(samples).then((result) => {
        console.log(
          `${PHASE1_BENCHMARK_RESULT_MARKER}${JSON.stringify(result)}`,
        );
        setState({ status: "finished", result });
      }).catch(() => {
        setState({
          status: "failed",
          errorCode: "phase1_benchmark_failed",
        });
      });
  }, [enabled, samples]);

  if (state.status === "disabled") {
    return <Redirect href="/" />;
  }
  const result = state.status === "finished" ? state.result : null;
  const statusText = state.status === "running"
    ? `Running ${samples} command-to-dock samples…`
    : state.status === "failed"
      ? "Phase 1 benchmark failed."
      : `${result?.samplesCompleted ?? 0} samples complete`;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>Development Test</Text>
      <Text style={styles.title}>Phase 1 Performance Benchmark</Text>
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.status, state.status === "failed" && styles.failed]}
      >
        {statusText}
      </Text>
      {result === null ? null : (
        <Text style={styles.summary}>
          Measurement: {result.measurement}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F6F8FB",
    flexGrow: 1,
    padding: 24,
    paddingTop: 64,
  },
  eyebrow: {
    color: "#4F5B66",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    color: "#171A1C",
    fontSize: 28,
    fontWeight: "700",
    marginTop: 8,
  },
  status: {
    color: "#176B3A",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  failed: {
    color: "#B42318",
  },
  summary: {
    color: "#4F5B66",
    fontSize: 15,
    marginTop: 24,
  },
});

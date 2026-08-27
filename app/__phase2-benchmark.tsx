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
  PHASE2_BENCHMARK_ERROR_MARKER,
  PHASE2_BENCHMARK_RESULT_CHUNK_MARKER,
  boundedPhase2BenchmarkSamples,
  phase2BenchmarkStartupAction,
  performPhase2Benchmark,
  type Phase2BenchmarkResult,
} from "../src/bootstrap/phase2Benchmark";
import {
  useWorkoutAppRuntime,
} from "../src/bootstrap/workoutAppRuntime";

const RESULT_CHUNK_SIZE = 2_000;

type RouteState =
  | Readonly<{ status: "disabled" | "running" }>
  | Readonly<{ status: "finished"; result: Phase2BenchmarkResult }>
  | Readonly<{ status: "failed"; errorCode: string }>;

function logPhase2BenchmarkResult(result: Phase2BenchmarkResult): void {
  const serialized = JSON.stringify(result);
  const total = Math.ceil(serialized.length / RESULT_CHUNK_SIZE);
  const resultId = `${result.startedAt}|${result.finishedAt}`;
  for (let index = 0; index < total; index += 1) {
    console.log(
      `${PHASE2_BENCHMARK_RESULT_CHUNK_MARKER}${JSON.stringify({
        transportVersion: 1,
        resultId,
        index,
        total,
        chunk: serialized.slice(
          index * RESULT_CHUNK_SIZE,
          (index + 1) * RESULT_CHUNK_SIZE,
        ),
      })}`,
    );
  }
}

export default function Phase2BenchmarkScreen() {
  const parameters = useLocalSearchParams<{ samples?: string | string[] }>();
  const samples = boundedPhase2BenchmarkSamples(parameters.samples);
  const started = useRef(false);
  const { launchState } = useWorkoutAppRuntime();
  const enabled = Constants.expoConfig?.extra?.nativeContractsEnabled === true;
  const [state, setState] = useState<RouteState>(
    enabled ? { status: "running" } : { status: "disabled" },
  );

  useEffect(() => {
    const action = phase2BenchmarkStartupAction({
      enabled,
      launchState,
      started: started.current,
    });
    if (action === "fail") {
      console.error(
        `${PHASE2_BENCHMARK_ERROR_MARKER}${JSON.stringify({
          message: "phase2_benchmark_runtime_failed",
        })}`,
      );
      setState({
        status: "failed",
        errorCode: "phase2_benchmark_runtime_failed",
      });
      return;
    }
    if (action !== "start") {
      return;
    }
    started.current = true;

    void performPhase2Benchmark(samples).then((result) => {
      logPhase2BenchmarkResult(result);
      setState({ status: "finished", result });
    }).catch((error: unknown) => {
      console.error(
        `${PHASE2_BENCHMARK_ERROR_MARKER}${JSON.stringify({
          message: error instanceof Error
            ? error.message
            : "phase2_benchmark_failed",
        })}`,
      );
      setState({
        status: "failed",
        errorCode: "phase2_benchmark_failed",
      });
    });
  }, [enabled, launchState, samples]);

  if (state.status === "disabled") {
    return <Redirect href="/" />;
  }
  const result = state.status === "finished" ? state.result : null;
  const statusText = state.status === "running"
    ? `Running ${samples} search and working-set samples…`
    : state.status === "failed"
      ? "Phase 2 benchmark failed."
      : `${result?.measurements.length ?? 0} measurements complete`;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>Development Test</Text>
      <Text style={styles.title}>Phase 2 Performance Benchmark</Text>
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.status, state.status === "failed" && styles.failed]}
      >
        {statusText}
      </Text>
      {result === null ? null : (
        <Text style={styles.summary}>
          Search page and working-set save samples passed.
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

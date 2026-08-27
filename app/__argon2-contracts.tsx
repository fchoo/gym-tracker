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
  View,
} from "react-native";

import {
  ARGON2_FEASIBILITY_RESULT_MARKER,
  performArgon2Feasibility,
  type Argon2FeasibilityResult,
} from "../src/testing/contracts/argon2Feasibility.contract";

function boundedRunId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.replace(/[^A-Za-z0-9._-]/gu, "").slice(0, 48)
    || `argon2-${Date.now()}`;
}

function boundedInteger(
  value: string | string[] | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

export default function Argon2ContractsScreen() {
  const parameters = useLocalSearchParams<{
    iterations?: string | string[];
    memoryKiB?: string | string[];
    runId?: string | string[];
    samples?: string | string[];
  }>();
  const runId = boundedRunId(parameters.runId);
  const samples = boundedInteger(parameters.samples, 3, 3, 10);
  const memoryKiB = boundedInteger(parameters.memoryKiB, 19_456, 19_456, 65_536);
  const iterations = boundedInteger(parameters.iterations, 2, 2, 4);
  const started = useRef(false);
  const enabled = Constants.expoConfig?.extra?.nativeContractsEnabled === true;
  const [result, setResult] = useState<Argon2FeasibilityResult>();

  useEffect(() => {
    if (!enabled || started.current) {
      return;
    }
    started.current = true;
    void performArgon2Feasibility({
      samples,
      memoryKiB,
      iterations,
    }).then((nextResult) => {
      console.log(
        `${ARGON2_FEASIBILITY_RESULT_MARKER}${JSON.stringify(nextResult)}`,
      );
      setResult(nextResult);
    });
  }, [enabled, iterations, memoryKiB, runId, samples]);

  if (!enabled) {
    return <Redirect href="/" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>Development Test</Text>
      <Text style={styles.title}>Argon2id Feasibility</Text>
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {result === undefined
          ? "Running bounded Argon2id checks…"
          : result.status === "passed"
            ? "Argon2id feasibility passed"
            : "Argon2id feasibility blocked"}
      </Text>
      {result !== undefined && (
        <View style={styles.results}>
          <Text>{`Known-answer test: ${result.katPassed ? "passed" : "failed"}`}</Text>
          <Text>{`Interaction probe: ${result.responsive ? "responsive" : "blocked"}`}</Text>
          <Text>{`Samples: ${result.samplesMs.length}`}</Text>
          <Text>{`Parameters: ${result.parameters.memoryKiB} KiB · t=${result.parameters.iterations} · p=${result.parameters.parallelism}`}</Text>
          <Text>{`${result.provider} ${result.providerVersion}`}</Text>
        </View>
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
  results: {
    gap: 8,
    marginTop: 24,
  },
});

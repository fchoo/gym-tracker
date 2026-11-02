import Constants from "expo-constants";
import { Redirect } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import {
  createPhase15WorkoutBenchmarkRecorder,
  PHASE15_BENCHMARK_MINIMUM_SAMPLES,
  PHASE15_BENCHMARK_RESULT_MARKER,
  type Phase15WorkoutBenchmarkResult,
} from "../src/bootstrap/phase15WorkoutBenchmark";
import { WorkoutActionDock } from "../src/ui/components/WorkoutActionDock";
import { RestDock } from "../src/ui/components/RestDock";

type RouteState =
  | Readonly<{ status: "disabled" | "running" }>
  | Readonly<{ status: "finished"; result: Phase15WorkoutBenchmarkResult }>
  | Readonly<{ status: "failed" }>;

const suite = process.env.EXPO_PUBLIC_NATIVE_CONTRACT_SUITE;

/** Development-test-only route. It renders the shipped compact and RestDock components. */
export default function Phase15WorkoutBenchmarkScreen() {
  const nativeContractsEnabled =
    Constants.expoConfig?.extra?.nativeContractsEnabled === true;
  const enabled = nativeContractsEnabled && suite === "phase15";
  const recorder = useRef(createPhase15WorkoutBenchmarkRecorder(() => performance.now()));
  const [state, setState] = useState<RouteState>(
    enabled ? { status: "running" } : { status: "disabled" },
  );
  const [sample, setSample] = useState(0);
  const [showRestDock, setShowRestDock] = useState(false);
  const frameRecordedForSample = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || sample >= PHASE15_BENCHMARK_MINIMUM_SAMPLES || showRestDock) {
      return;
    }
    recorder.current.measureActiveJsTask(() => {
      recorder.current.markActivation();
      // This route is only enabled in a retained development-test APK. The
      // marker denotes the synthetic fixture's committed rest fact; the next
      // onLayout is the actual native frame containing the shipped RestDock.
      recorder.current.markAuthoritativeCommit();
      setShowRestDock(true);
    });
  }, [enabled, sample, showRestDock]);

  const onRestDockLayout = () => {
    if (frameRecordedForSample.current === sample) return;
    frameRecordedForSample.current = sample;
    recorder.current.markFirstRestDockFrame();
    const renderStartedAt = performance.now();
    const scrollStartedAt = performance.now();
    const interactionStartedAt = performance.now();
    recorder.current.markLongSessionWork("render", renderStartedAt);
    recorder.current.markLongSessionWork("scroll", scrollStartedAt);
    recorder.current.markLongSessionWork("interaction", interactionStartedAt);
    setShowRestDock(false);
    if (sample + 1 === PHASE15_BENCHMARK_MINIMUM_SAMPLES) {
      try {
        const result = recorder.current.result();
        console.log(`${PHASE15_BENCHMARK_RESULT_MARKER}${JSON.stringify(result)}`);
        setState({ status: "finished", result });
      } catch {
        setState({ status: "failed" });
      }
      return;
    }
    setSample((current) => current + 1);
  };

  if (state.status === "disabled") return <Redirect href="/" />;
  const completed = state.status === "finished" ? state.result : null;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>Development Test</Text>
      <Text style={styles.title}>Phase 15 Rendered Workout Benchmark</Text>
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {state.status === "running"
          ? `Measuring rendered RestDock transition ${sample + 1}/${PHASE15_BENCHMARK_MINIMUM_SAMPLES}…`
          : state.status === "failed"
            ? "Phase 15 rendered benchmark failed."
            : `${completed?.measurements.render_transition_ms.length ?? 0} rendered samples complete`}
      </Text>
      <View onLayout={showRestDock ? onRestDockLayout : undefined}>
        {showRestDock ? (
          <RestDock
            state={{ version: 1, state: "running", revision: 1, startedAtMs: 0, endsAtMs: 120_000, nextSetId: "benchmark-next-set" }}
            nowMs={() => 0}
            nextSetIndex={2}
            nextTarget="Source-backed representative set"
            notificationPermission="granted"
            onAdjust={() => undefined}
            onExpired={() => undefined}
            onOpenSettings={() => undefined}
            onPause={() => undefined}
            onResume={() => undefined}
            onSkip={() => undefined}
          />
        ) : (
          <WorkoutActionDock
            completeLabel="Complete Set"
            onAddExercise={() => undefined}
            onComplete={() => undefined}
            state="ready"
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#F6F8FB", flexGrow: 1, gap: 16, padding: 24, paddingTop: 64 },
  eyebrow: { color: "#4F5B66", fontSize: 13, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { color: "#171A1C", fontSize: 28, fontWeight: "700" },
  status: { color: "#176B3A", fontSize: 18, fontWeight: "600" },
});

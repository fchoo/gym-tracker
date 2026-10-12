import Constants from "expo-constants";
import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  GARMIN_ACCEPTANCE_HOST_CASE_IDS,
  GARMIN_ACCEPTANCE_NATIVE_PREREQUISITE_IDS,
} from "../src/testing/contracts/garminImport.contract";
import { useWorkoutAppRuntime } from "../src/bootstrap/workoutAppRuntime";
import {
  PHASE18_GARMIN_BENCHMARK_MARKER,
  createInstalledPhase18GarminBenchmarkMeasurementPort,
  createPhase18GarminBenchmarkBoundedSync,
  createPhase18GarminBenchmarkMarkerReport,
  parsePhase18GarminColdStartHandshake,
  phase18GarminAcceptanceBenchmarkEnabled,
  phase18GarminAcceptanceEnabled,
  type Phase18GarminBenchmarkRenderProbe,
  type Phase18GarminBenchmarkRenderProbeKind,
} from "../src/testing/phase18GarminAcceptance";

function Phase18GarminBenchmarkScreen({
  coldStartSamples,
  coldStartSequence,
  nonce,
}: Readonly<{
  coldStartSamples?: string;
  coldStartSequence?: string;
  nonce: string;
}>) {
  const application = useWorkoutAppRuntime().garminImport;
  const [status, setStatus] = React.useState("benchmark-pending");
  const [renderProbeState, setRenderProbeState] = React.useState<Readonly<{
    generation: number;
    kind: Phase18GarminBenchmarkRenderProbeKind;
  }> | null>(null);
  const renderProbeGenerationRef = React.useRef(0);
  const pendingRenderProbeRef = React.useRef<Readonly<{
    generation: number;
    kind: Phase18GarminBenchmarkRenderProbeKind;
    startedAt: number;
    resolve(value: Awaited<ReturnType<Phase18GarminBenchmarkRenderProbe>>): void;
    reject(error: Error): void;
  }> | null>(null);
  const renderProbe = React.useCallback<Phase18GarminBenchmarkRenderProbe>((kind) => new Promise((resolve, reject) => {
    if (pendingRenderProbeRef.current !== null) {
      reject(new Error("phase18_render_probe_busy"));
      return;
    }
    const generation = ++renderProbeGenerationRef.current;
    pendingRenderProbeRef.current = Object.freeze({
      generation,
      kind,
      startedAt: performance.now(),
      resolve,
      reject,
    });
    setRenderProbeState(Object.freeze({ generation, kind }));
  }), []);
  const runBoundedSync = React.useMemo(() => createPhase18GarminBenchmarkBoundedSync({
    nonce,
    repository: Object.freeze({
      confirmGarminImport: application.confirmGarminImport,
    }),
    sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
  }), [application.confirmGarminImport, nonce]);
  const measurementPort = React.useMemo(
    () => createInstalledPhase18GarminBenchmarkMeasurementPort({
      renderProbe,
      runBoundedSync,
      coldStartHandshake: parsePhase18GarminColdStartHandshake({
        sequence: coldStartSequence,
        samples: coldStartSamples,
      }) ?? Object.freeze({ sequence: 0, prior_samples: Object.freeze([]) }),
    }),
    [coldStartSamples, coldStartSequence, renderProbe, runBoundedSync],
  );

  React.useEffect(() => {
    let active = true;
    setStatus("benchmark-measuring");
    void createPhase18GarminBenchmarkMarkerReport({
      nonce,
      measurementPort,
    }).then((report) => {
      if (!active) return;
      console.log(`${PHASE18_GARMIN_BENCHMARK_MARKER}${JSON.stringify(report)}`);
      setStatus(report.status === "passed" ? "benchmark-ready" : "REVIEW_REQUIRED");
    }).catch(() => {
      if (active) setStatus("REVIEW_REQUIRED");
    });
    return () => {
      active = false;
    };
  }, [measurementPort, nonce]);

  React.useEffect(() => () => {
    pendingRenderProbeRef.current?.reject(new Error("phase18_render_probe_unmounted"));
    pendingRenderProbeRef.current = null;
  }, []);

  const finishRenderProbe = React.useCallback(() => {
    const pending = pendingRenderProbeRef.current;
    if (pending === null || pending.generation !== renderProbeState?.generation) return;
    const observedAt = performance.now();
    pendingRenderProbeRef.current = null;
    setRenderProbeState(null);
    pending.resolve(Object.freeze({
      value: observedAt - pending.startedAt,
      observed_at_monotonic_ms: observedAt,
    }));
  }, [renderProbeState?.generation]);

  return (
    <View style={styles.root} accessibilityLabel="Phase 18 Garmin benchmark">
      <Text style={styles.title}>Phase 18 Garmin benchmark</Text>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.detail}>installed-observation-port</Text>
      {renderProbeState === null ? null : (
        <View
          key={`${renderProbeState.kind}:${renderProbeState.generation}`}
          onLayout={finishRenderProbe}
          style={styles.probe}
        >
          {renderProbeState.kind === "route" ? (
            <>
              <Text style={styles.probeHeading}>Observed activity detail</Text>
              <Text style={styles.detail}>5.00 km · 26:00 · 4:55/km</Text>
            </>
          ) : Array.from({ length: 10 }, (_, index) => (
            <View key={index} style={styles.lapRow}>
              <Text style={styles.detail}>{`Lap ${index + 1}`}</Text>
              <Text style={styles.detail}>4:55</Text>
              <Text style={styles.detail}>4:55/km</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function Phase18GarminAcceptanceScreen() {
  const { coldStartSamples, coldStartSequence, confirmation, mode, nonce } = useLocalSearchParams<{
    coldStartSamples?: string;
    coldStartSequence?: string;
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

  if (benchmarkEnabled && typeof nonce === "string") {
    return (
      <Phase18GarminBenchmarkScreen
        nonce={nonce}
        {...(coldStartSamples === undefined ? {} : { coldStartSamples })}
        {...(coldStartSequence === undefined ? {} : { coldStartSequence })}
      />
    );
  }
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
  probe: { marginTop: 16, width: "100%" },
  probeHeading: { color: "#171A1C", fontSize: 18, fontWeight: "700" },
  lapRow: { flexDirection: "row", justifyContent: "space-between" },
});

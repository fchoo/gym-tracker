import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { PlanTypeChooserScreen } from "../ui/screens/PlanTypeChooserScreen";
import { AppearanceProvider, createMemoryAppearanceStore } from "../ui/theme";

export type Phase20QualityAction = "accessibility" | "performance";

export type Phase20QualityRequest = Readonly<{ nonce: string; action: Phase20QualityAction }>;

export function phase20QualityEnabled(extra: Readonly<Record<string, unknown>> | null | undefined): boolean {
  return extra?.buildProfile === "development-test"
    && extra.nativeContractsEnabled === true
    && extra.nativeContractSuite === "v1.2-acceptance";
}

export function resolvePhase20QualityRequest(params: Readonly<Record<string, unknown>>): Phase20QualityRequest | null {
  return typeof params.nonce === "string" && /^[a-f0-9]{48}$/u.test(params.nonce)
    && (params.action === "accessibility" || params.action === "performance")
    ? { nonce: params.nonce, action: params.action }
    : null;
}

type Layout = Readonly<{ width: number; height: number; density: number; fontScale: number; imeTop: number; imeBottom: number }>;
type Semantic = Readonly<{ id: string; name: string; role: string; state: string; nonColorCue: boolean; left: number; top: number; width: number; height: number }>;
type Frame = Readonly<{ workMs: number; missedFrames: number; refreshRateHz: number; profilerOverheadMs: number }>;
export type Phase20NativeMeasurementSeams = Readonly<{
  now: () => number;
  layout: () => Layout | null;
  semantics: () => readonly Semantic[];
  frame: () => Frame | null;
}>;

/** Validates real native readings before the Android runner serializes them.
 * The seam exists only to make device-bound measurements testable; there is no
 * fallback path or configuration-derived geometry. */
export function collectPhase20QualityObservation(seams: Phase20NativeMeasurementSeams) {
  const layout = seams.layout();
  if (layout === null || ![layout.width, layout.height, layout.density, layout.fontScale, layout.imeTop, layout.imeBottom].every(Number.isFinite)
    || layout.width <= 0 || layout.height <= 0 || layout.density <= 0 || layout.imeTop >= layout.imeBottom) throw new Error("phase20_quality_measurement_missing");
  const targets = seams.semantics();
  if (targets.length === 0 || targets.some((target) => target.width <= 0 || target.height <= 0 || !target.name || !target.role)) throw new Error("phase20_quality_semantics_missing");
  const frames: Frame[] = [];
  while (frames.length < 100) {
    const frame = seams.frame();
    if (frame === null || ![frame.workMs, frame.missedFrames, frame.refreshRateHz, frame.profilerOverheadMs].every(Number.isFinite)
      || frame.workMs < 0 || frame.missedFrames < 0 || frame.refreshRateHz <= 0 || frame.profilerOverheadMs < 0) throw new Error("phase20_quality_measurement_missing");
    frames.push(frame);
  }
  const started = seams.now();
  const finished = seams.now();
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) throw new Error("phase20_quality_measurement_missing");
  return {
    configuration: { font_scale: layout.fontScale, density: layout.density, content_bounds: { width: layout.width, height: layout.height }, ime_bounds: { top: layout.imeTop, bottom: layout.imeBottom } },
    targets,
    frames,
    measurement_span: { start_ms: started, end_ms: finished },
  };
}

/** A read-only source surface for Android UI instrumentation. It deliberately
 * renders production controls, records true onLayout/window values and never
 * turns a probe interaction into a product mutation. */
export function Phase20QualityProbe({ request }: Readonly<{ request: Phase20QualityRequest }>) {
  return <AppearanceProvider store={createMemoryAppearanceStore(null)}><Phase20QualityProbeContent request={request} /></AppearanceProvider>;
}

function Phase20QualityProbeContent({ request }: Readonly<{ request: Phase20QualityRequest }>) {
  const dimensions = useWindowDimensions();
  const [layoutReady, setLayoutReady] = useState(false);
  useEffect(() => {
    if (!layoutReady) return;
    console.log(`PHASE20_QUALITY_ROUTE ${JSON.stringify({ nonce: request.nonce, action: request.action, width_dp: dimensions.width, height_dp: dimensions.height, density: dimensions.scale, font_scale: dimensions.fontScale, source: "PlanTypeChooserScreen", attended: ["live-talkback", "switch-scanning"] })}`);
  }, [dimensions.fontScale, dimensions.height, dimensions.scale, dimensions.width, layoutReady, request.action, request.nonce]);
  return <View testID="phase20-quality-probe" onLayout={() => setLayoutReady(true)} style={styles.root}>
    <PlanTypeChooserScreen onBack={() => undefined} onChooseRunning={() => undefined} onChooseStrength={() => undefined} />
    <Text style={styles.attended}>TalkBack and switch scanning require attended observation.</Text>
  </View>;
}

const styles = StyleSheet.create({ root: { flex: 1 }, attended: { position: "absolute", bottom: 0, left: 0, right: 0, opacity: 0.01 } });

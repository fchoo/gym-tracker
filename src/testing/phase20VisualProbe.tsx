import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Dimensions, StyleSheet, useWindowDimensions, View } from "react-native";

import {
  AppearanceProvider,
  createMemoryAppearanceStore,
  useAppTheme,
} from "../ui/theme";
import {
  PHASE20_VISUAL_FIXTURE_ID,
  phase20VisualState,
} from "./phase20VisualStateRegistry";
import {
  resolvePhase20VisualRequest,
  type Phase20VisualRequest,
} from "./phase20VisualRequest";
import type { ActiveWorkoutRestState } from "../domains/workout";
import { Phase20VisualContextProvider, type Phase20VisualProductionMount, type Phase20VisualScrollOffset } from "./phase20VisualContext";
import { clearPhase20VisualCleanupStatus, phase20VisualCleanupStatus } from "./phase20VisualFixtureRuntime";

export const resolvePhase20VisualProbe = resolvePhase20VisualRequest;

async function phase20VisualSha256(value: unknown): Promise<string> {
  const { CryptoDigestAlgorithm, digestStringAsync } = require("expo-crypto") as typeof import("expo-crypto");
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(value));
}

export async function phase20VisualProbeDigests(
  state: NonNullable<ReturnType<typeof phase20VisualState>>,
  scrollOffsets: readonly Phase20VisualScrollOffset[] = [],
): Promise<Readonly<{
  registry_sha256: string;
  readiness_sha256: string;
  assertions_sha256: string;
  scroll_offsets: readonly Readonly<{ native_id_sha256: string; x: number; y: number }>[];
}>> {
  const assertions = state.readiness.source_receipt.assertions;
  const [registrySha256, readinessSha256, assertionsSha256] = await Promise.all([
    phase20VisualSha256([
      state.route, state.component, state.name, state.fixture_seed,
      state.fixture_variant, state.scenario, state.readiness.screen_test_id,
      state.readiness.test_ids, state.focus_target, state.evidence_scope,
    ]),
    phase20VisualSha256([
      state.readiness.semantics, state.readiness.actions, state.readiness.order,
      state.readiness.non_color, assertions,
    ]),
    phase20VisualSha256(assertions),
  ]);
  return Object.freeze({
    registry_sha256: registrySha256,
    readiness_sha256: readinessSha256,
    assertions_sha256: assertionsSha256,
    scroll_offsets: Object.freeze(await Promise.all(scrollOffsets.map(async ({ native_id: nativeId, x, y }) => Object.freeze({
      native_id_sha256: await phase20VisualSha256(nativeId),
      x,
      y,
    })))),
  });
}

export type Phase20VisualTimerReceipt = Readonly<{
  state: ActiveWorkoutRestState["state"];
  revision: number;
  remaining_ms: number | null;
  ends_at_ms: number | null;
}>;

export function phase20VisualTimerReceipt(
  rest: ActiveWorkoutRestState,
): Phase20VisualTimerReceipt {
  return Object.freeze({
    state: rest.state,
    revision: rest.revision,
    remaining_ms: rest.state === "paused" ? rest.remainingMs : null,
    ends_at_ms: rest.state === "running" ? rest.endsAtMs : null,
  });
}

/** Isolated fixture route: the selected production route owns all rendered UI. */
export function Phase20VisualProbe({
  children,
  ready,
  request,
  timerReceipt = null,
}: Readonly<{
  children: React.ReactNode;
  ready: boolean;
  request: Phase20VisualRequest;
  timerReceipt?: Phase20VisualTimerReceipt | null;
}>) {
  const store = useMemo(() => createMemoryAppearanceStore(
    request.appearance === "System" ? null : request.appearance,
  ), [request.appearance]);
  const [mount, setMount] = useState<Phase20VisualProductionMount | null>(null);
  const [scrollOffsets, setScrollOffsets] = useState<readonly Phase20VisualScrollOffset[]>([]);
  const reportScrollOffset = useCallback((offset: Phase20VisualScrollOffset) => {
    setScrollOffsets((current) => Object.freeze([
      ...current.filter(({ native_id: nativeId }) => nativeId !== offset.native_id),
      Object.freeze({ ...offset }),
    ].sort((left, right) => left.native_id.localeCompare(right.native_id))));
  }, []);
  return (
    <AppearanceProvider store={store}>
      <Phase20VisualContextProvider onProductionMount={setMount} onScrollOffset={reportScrollOffset} request={request}>
        <ObservedScreen mount={mount} ready={ready} request={request} scrollOffsets={scrollOffsets} timerReceipt={timerReceipt}>{children}</ObservedScreen>
      </Phase20VisualContextProvider>
    </AppearanceProvider>
  );
}

function ObservedScreen({ children, mount, ready, request, scrollOffsets, timerReceipt }: Readonly<{
  children: React.ReactNode;
  mount: Phase20VisualProductionMount | null;
  ready: boolean;
  request: Phase20VisualRequest;
  scrollOffsets: readonly Phase20VisualScrollOffset[];
  timerReceipt: Phase20VisualTimerReceipt | null;
}>) {
  const { appearance, colorScheme } = useAppTheme();
  const window = useWindowDimensions();
  const [laidOut, setLaidOut] = useState(false);
  const [cleanupReady, setCleanupReady] = useState(request.mode !== "reset");
  const state = phase20VisualState(request.state);
  if (state === null) return null;
  useEffect(() => {
    if (request.mode !== "reset") { setCleanupReady(true); return; }
    let cancelled = false;
    const poll = () => {
      if (cancelled) return;
      const status = phase20VisualCleanupStatus(request.nonce);
      if (status === "complete") { setCleanupReady(true); return; }
      if (status === "failed") { console.error("phase20_visual_cleanup_failed"); return; }
      setTimeout(poll, 25);
    };
    poll();
    return () => { cancelled = true; };
  }, [request.mode, request.nonce]);
  useEffect(() => {
    if (!laidOut || !ready || !cleanupReady || (request.mode === "capture" && (mount === null || scrollOffsets.length === 0))) return;
    let cancelled = false;
    let second: number | undefined;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        void phase20VisualProbeDigests(state, scrollOffsets).then((digests) => {
          if (cancelled) return;
          const screen = Dimensions.get("screen");
          console.log(`PHASE20_VISUAL_RESULT ${JSON.stringify({
            schema_version: 3,
            nonce: request.nonce,
            state_id: request.state,
            configuration_id: request.configuration,
            fixture_id: PHASE20_VISUAL_FIXTURE_ID,
            mode: request.mode,
            status: request.mode === "reset" ? "reset" : state.readiness.status,
            appearance,
            color_scheme: colorScheme,
            width_dp: window.width,
            height_dp: window.height,
            screen_width_dp: screen.width,
            screen_height_dp: screen.height,
            font_scale: window.fontScale,
            density: window.scale,
            registry_sha256: digests.registry_sha256,
            readiness_sha256: digests.readiness_sha256,
            source_revision: 18,
            source_read_only: true,
            source_receipt: {
              schema_version: 3,
              nonce: request.nonce,
              state_id: request.state,
              assertions_sha256: digests.assertions_sha256,
              ...(mount ?? { production_instance_id: "", mount_id: "" }),
              scroll_offsets: digests.scroll_offsets,
              timer: timerReceipt,
            },
          })}`);
          if (request.mode === "reset") clearPhase20VisualCleanupStatus(request.nonce);
        }).catch(() => { console.error("phase20_visual_digest_failed"); });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(first);
      if (second !== undefined) cancelAnimationFrame(second);
    };
  }, [appearance, cleanupReady, colorScheme, laidOut, mount, ready, request, scrollOffsets, state, timerReceipt, window.fontScale, window.height, window.scale, window.width]);
  return (
    <View onLayout={() => setLaidOut(true)} style={styles.root}
      nativeID={`phase20-visual-state-${request.state}`}
      accessible={false}
      testID={request.mode === "reset" ? "phase20-visual-reset" : "phase20-visual-capture"}>
      {request.mode === "capture" ? children : null}
    </View>
  );
}


const styles = StyleSheet.create({ root: { flex: 1 } });

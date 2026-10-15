import React, { useEffect, useMemo, useState } from "react";
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
import { Phase20VisualContextProvider } from "./phase20VisualContext";
import { clearPhase20VisualCleanupStatus, phase20VisualCleanupStatus } from "./phase20VisualFixtureRuntime";

export const resolvePhase20VisualProbe = resolvePhase20VisualRequest;

/** Isolated fixture route: the selected production route owns all rendered UI. */
export function Phase20VisualProbe({
  children,
  ready,
  request,
}: Readonly<{
  children: React.ReactNode;
  ready: boolean;
  request: Phase20VisualRequest;
}>) {
  const store = useMemo(() => createMemoryAppearanceStore(
    request.appearance === "System" ? null : request.appearance,
  ), [request.appearance]);
  return (
    <AppearanceProvider store={store}>
      <Phase20VisualContextProvider request={request}>
        <ObservedScreen ready={ready} request={request}>{children}</ObservedScreen>
      </Phase20VisualContextProvider>
    </AppearanceProvider>
  );
}

function ObservedScreen({ children, ready, request }: Readonly<{
  children: React.ReactNode;
  ready: boolean;
  request: Phase20VisualRequest;
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
    if (!laidOut || !ready || !cleanupReady) return;
    let second: number | undefined;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const screen = Dimensions.get("screen");
        console.log(`PHASE20_VISUAL_RESULT ${JSON.stringify({
          schema_version: 1,
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
          route: "/__phase20-visual-probe",
          source_route: state.route,
          source_component: state.component,
          source_state: state.name,
          fixture_seed: state.fixture_seed,
          fixture_variant: state.fixture_variant,
          scenario: state.scenario,
          screen_test_id: state.readiness.screen_test_id,
          readiness_test_ids: state.readiness.test_ids,
          readiness_semantics: state.readiness.semantics,
          readiness_actions: state.readiness.actions,
          readiness_order: state.readiness.order,
          readiness_non_color: state.readiness.non_color,
          focus_target: state.focus_target,
          evidence_scope: state.evidence_scope,
          source_revision: 18,
          source_read_only: true,
        })}`);
        if (request.mode === "reset") clearPhase20VisualCleanupStatus(request.nonce);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      if (second !== undefined) cancelAnimationFrame(second);
    };
  }, [appearance, cleanupReady, colorScheme, laidOut, ready, request, state, window.fontScale, window.height, window.scale, window.width]);
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

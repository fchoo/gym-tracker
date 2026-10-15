import React, { useEffect, useMemo, useState } from "react";
import { Dimensions, StyleSheet, useWindowDimensions, View } from "react-native";

import { PlanTypeChooserScreen } from "../ui/screens/PlanTypeChooserScreen";
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

export const resolvePhase20VisualProbe = resolvePhase20VisualRequest;

/** Isolated synthetic, read-only route: the actual production screen owns its
 * copy, target geometry and unselected state. No database/runtime is opened.
 * A press invalidates observation rather than pretending an action succeeded.
 */
export function Phase20VisualProbe({ request }: Readonly<{ request: Phase20VisualRequest }>) {
  const store = useMemo(() => createMemoryAppearanceStore(
    request.appearance === "System" ? null : request.appearance,
  ), [request.appearance]);
  return (
    <AppearanceProvider store={store}>
      <ObservedScreen request={request} />
    </AppearanceProvider>
  );
}

function ObservedScreen({ request }: Readonly<{ request: Phase20VisualRequest }>) {
  const { appearance, colorScheme } = useAppTheme();
  const window = useWindowDimensions();
  const [laidOut, setLaidOut] = useState(false);
  const [invalidated, setInvalidated] = useState(false);
  const state = phase20VisualState(request.state);
  if (state === null) return null;
  useEffect(() => {
    if (!laidOut) return;
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
          status: invalidated ? "invalidated" : request.mode === "reset" ? "reset" : "ready",
          appearance,
          color_scheme: colorScheme,
          width_dp: window.width,
          height_dp: window.height,
          screen_width_dp: screen.width,
          screen_height_dp: screen.height,
          font_scale: window.fontScale,
          density: window.scale,
          route: "/__phase20-visual-probe",
          source_state: state.name,
          source_revision: 18,
          source_read_only: true,
        })}`);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      if (second !== undefined) cancelAnimationFrame(second);
    };
  }, [appearance, colorScheme, invalidated, laidOut, request, window.fontScale, window.height, window.scale, window.width]);
  return (
    <View onLayout={() => setLaidOut(true)} style={styles.root}
      testID={request.mode === "reset" ? "phase20-visual-reset" : invalidated ? "phase20-visual-invalidated" : "phase20-visual-capture"}>
      {request.mode === "capture" && !invalidated && state.component === "PlanTypeChooserScreen" && (
        <PlanTypeChooserScreen
          onBack={() => setInvalidated(true)}
          onChooseRunning={() => setInvalidated(true)}
          onChooseStrength={() => setInvalidated(true)}
        />
      )}
    </View>
  );
}


const styles = StyleSheet.create({ root: { flex: 1 } });

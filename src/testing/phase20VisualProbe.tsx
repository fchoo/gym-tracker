import React, { useEffect, useMemo, useState } from "react";
import { Dimensions, StyleSheet, useWindowDimensions, View } from "react-native";

import { PlanTypeChooserScreen } from "../ui/screens/PlanTypeChooserScreen";
import {
  AppearanceProvider,
  createMemoryAppearanceStore,
  useAppTheme,
  type AppearancePreference,
} from "../ui/theme";

type VisualProbeRequest = Readonly<{
  nonce: string;
  state: "BW-054";
  configuration: string;
  appearance: AppearancePreference;
  mode: "capture" | "reset";
}>;

export function resolvePhase20VisualProbe(params: Readonly<Record<string, unknown>>): VisualProbeRequest | null {
  const { nonce, state, configuration, fixture, mode } = params;
  if (typeof nonce !== "string" || !/^[a-f0-9]{32}$/u.test(nonce)
    || state !== "BW-054" || fixture !== "v12-synthetic-fixtures-r18"
    || typeof configuration !== "string" || (mode !== "capture" && mode !== "reset")) return null;
  const match = /^AP-(L|D|SL|SD)-(C360|C390|M600|X840)-(P|L)-F(100|200)$/u.exec(configuration);
  if (match === null) return null;
  return { nonce, state, configuration, mode,
    appearance: mode === "reset" || match[1]?.startsWith("S") ? "System" : match[1] === "L" ? "Light" : "Dark" };
}

/** Isolated synthetic, read-only route: the actual production screen owns its
 * copy, target geometry and unselected state. No database/runtime is opened.
 * A press invalidates observation rather than pretending an action succeeded.
 */
export function Phase20VisualProbe({ request }: Readonly<{ request: VisualProbeRequest }>) {
  const store = useMemo(() => createMemoryAppearanceStore(
    request.appearance === "System" ? null : request.appearance,
  ), [request.appearance]);
  return (
    <AppearanceProvider store={store}>
      <ObservedScreen request={request} />
    </AppearanceProvider>
  );
}

function ObservedScreen({ request }: Readonly<{ request: VisualProbeRequest }>) {
  const { appearance, colorScheme } = useAppTheme();
  const window = useWindowDimensions();
  const [laidOut, setLaidOut] = useState(false);
  const [invalidated, setInvalidated] = useState(false);
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
          fixture_id: "v12-synthetic-fixtures-r18",
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
          source_state: "plan-type-chooser",
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
      {request.mode === "capture" && !invalidated && (
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

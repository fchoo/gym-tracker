import Constants from "expo-constants";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";
import { View } from "react-native";

import { useWorkoutAppRuntime } from "../src/bootstrap/workoutAppRuntime";
import { RunningPlanRuntimeProvider } from "../src/bootstrap/runningPlanRuntime";
import {
  Phase20VisualProbe,
  phase20VisualTimerReceipt,
  resolvePhase20VisualProbe,
  type Phase20VisualTimerReceipt,
} from "../src/testing/phase20VisualProbe";
import { phase20VisualState } from "../src/testing/phase20VisualStateRegistry";
import { usePhase20VisualProductionMountReporter } from "../src/testing/phase20VisualContext";
import { AppLoadingShell } from "../src/ui/screens/RootScreens";
import { AppTabs, rootDestinations } from "../src/ui/components";
import { AppRootShell } from "../src/ui/shell/AppRootShell";
import type { RootRouteKey } from "../src/ui/shell/rootFocus";
import { RootSettingsContent } from "./(tabs)/_layout";

type ProductionRouteComponent = React.ComponentType;
let nextProductionMount = 0;

function productionRouteComponent(route: string): ProductionRouteComponent {
  switch (route) {
    case "/(tabs)": return (require("./(tabs)/index") as typeof import("./(tabs)/index")).default;
    case "/(tabs)/calendar": return (require("./(tabs)/calendar") as typeof import("./(tabs)/calendar")).default;
    case "/(tabs)/library": return (require("./(tabs)/library") as typeof import("./(tabs)/library")).default;
    case "/(tabs)/progress": return (require("./(tabs)/progress") as typeof import("./(tabs)/progress")).default;
    case "/workout/[sessionId]": return (require("./workout/[sessionId]") as typeof import("./workout/[sessionId]")).default;
    case "/calendar/plan/[occurrenceId]": return (require("./calendar/plan/[occurrenceId]") as typeof import("./calendar/plan/[occurrenceId]")).default;
    case "/library/plan/[planId]": return (require("./library/plan/[planId]/index") as typeof import("./library/plan/[planId]/index")).default;
    case "/library/plan/[planId]/edit": return (require("./library/plan/[planId]/edit") as typeof import("./library/plan/[planId]/edit")).default;
    case "/library/plan/[planId]/schedule": return (require("./library/plan/[planId]/schedule") as typeof import("./library/plan/[planId]/schedule")).default;
    case "/library/starter/[templateId]": return (require("./library/starter/[templateId]") as typeof import("./library/starter/[templateId]")).default;
    case "/library/starter/[templateId]/activate": return (require("./library/starter/[templateId]/activate") as typeof import("./library/starter/[templateId]/activate")).default;
    case "/library/running/[planId]": return (require("./library/running/[planId]") as typeof import("./library/running/[planId]")).default;
    case "/library/running/[planId]/edit": return (require("./library/running/[planId]/edit") as typeof import("./library/running/[planId]/edit")).default;
    case "/library/running/[planId]/session/[sessionId]": return (require("./library/running/[planId]/session/[sessionId]") as typeof import("./library/running/[planId]/session/[sessionId]")).default;
    case "/library/plan/create": return (require("./library/plan/create") as typeof import("./library/plan/create")).default;
    case "/library/plan/create-strength": return (require("./library/plan/create-strength") as typeof import("./library/plan/create-strength")).default;
    case "/library/running/create": return (require("./library/running/create") as typeof import("./library/running/create")).default;
    case "/library/exercise/[exerciseId]": return (require("./library/exercise/[exerciseId]") as typeof import("./library/exercise/[exerciseId]")).default;
    case "/library/exercise/[exerciseId]/edit": return (require("./library/exercise/[exerciseId]/edit") as typeof import("./library/exercise/[exerciseId]/edit")).default;
    case "/library/exercise/create": return (require("./library/exercise/create") as typeof import("./library/exercise/create")).default;
    case "/exercise-history/[exerciseId]": return (require("./exercise-history/[exerciseId]") as typeof import("./exercise-history/[exerciseId]")).default;
    case "/garmin/index": return (require("./garmin/index") as typeof import("./garmin/index")).default;
    case "/garmin/activity/[activityId]": return (require("./garmin/activity/[activityId]") as typeof import("./garmin/activity/[activityId]")).default;
    case "/garmin/match/[activityId]": return (require("./garmin/match/[activityId]") as typeof import("./garmin/match/[activityId]")).default;
    default: throw new Error(`phase20_visual_route_missing:${route}`);
  }
}

function ProductionVisualState({
  route,
}: Readonly<{
  route: string;
}>) {
  const Route = productionRouteComponent(route);
  const reportProductionMount = usePhase20VisualProductionMountReporter();
  const [mount] = React.useState(() => {
    nextProductionMount += 1;
    return Object.freeze({
      production_instance_id: `phase20-production-instance-${nextProductionMount}`,
      mount_id: `phase20-production-mount-${nextProductionMount}`,
    });
  });
  React.useEffect(() => { reportProductionMount?.(mount); }, [mount, reportProductionMount]);
  const root = ({ "/(tabs)": "index", "/(tabs)/calendar": "calendar", "/(tabs)/library": "library", "/(tabs)/progress": "progress" } as const)[route as "/(tabs)" | "/(tabs)/calendar" | "/(tabs)/library" | "/(tabs)/progress"] as RootRouteKey | undefined;
  const settingsTriggerRef = React.useRef<View>(null);
  const removedSessionsTriggerRef = React.useRef<View>(null);
  const dataAndRecoveryTriggerRef = React.useRef<View>(null);
  const screen = <Route />;
  let content = screen;
  if (root !== undefined) {
    const routes = rootDestinations.map(({ name }) => ({ key: `phase20-${name}`, name }));
    const index = Math.max(0, routes.findIndex(({ name }) => name === root));
    content = (
      <AppRootShell
        activeRoot={root}
        currentPath={route}
        settingsContent={(closeSettings) => (
          <RootSettingsContent
            dataAndRecoveryTriggerRef={dataAndRecoveryTriggerRef}
            onNavigate={closeSettings}
            onRegisterOrigin={() => undefined}
            removedSessionsTriggerRef={removedSessionsTriggerRef}
          />
        )}
        settingsTriggerRef={settingsTriggerRef}
      >
        {screen}
        <AppTabs
          navigation={{
            emit: () => ({ defaultPrevented: false }),
            navigate: () => undefined,
          }}
          state={{ index, routes }}
        />
      </AppRootShell>
    );
  }
  return (
    <View
      collapsable={false}
      nativeID={mount.production_instance_id}
      style={{ flex: 1 }}
      testID="phase20-production-mount"
    >
      {content}
    </View>
  );
}

function RuntimeBoundProductionVisualState({
  ready,
  request,
  route,
}: Readonly<{
  ready: boolean;
  request: NonNullable<ReturnType<typeof resolvePhase20VisualProbe>>;
  route: string;
}>) {
  const runtime = useWorkoutAppRuntime();
  const routeParams = phase20VisualState(request.state)?.route_params;
  const sessionId = routeParams !== undefined && Object.hasOwn(routeParams, "sessionId")
    ? (routeParams as Readonly<{ sessionId: string }>).sessionId
    : undefined;
  const [timerReceipt, setTimerReceipt] = React.useState<Phase20VisualTimerReceipt | null | undefined>(
    sessionId === undefined ? null : undefined,
  );
  const [receiptFailed, setReceiptFailed] = React.useState(false);
  React.useEffect(() => {
    let mounted = true;
    if (runtime.launchState !== "trusted" || sessionId === undefined || request.mode === "reset") {
      setReceiptFailed(false);
      setTimerReceipt(null);
      return () => { mounted = false; };
    }
    setReceiptFailed(false);
    setTimerReceipt(undefined);
    void runtime.getActiveWorkout(sessionId).then((workout) => {
      if (mounted) setTimerReceipt(phase20VisualTimerReceipt(workout.rest));
    }).catch(() => { if (mounted) setReceiptFailed(true); });
    return () => { mounted = false; };
  }, [request.mode, request.nonce, runtime, sessionId]);
  if (runtime.launchState !== "trusted") return <AppLoadingShell />;
  if (runtime.runningPlanRuntime === null) throw new Error("phase20_visual_running_runtime_missing");
  if (receiptFailed) throw new Error("phase20_visual_source_receipt_failed");
  if (timerReceipt === undefined) return <AppLoadingShell />;
  return (
    <RunningPlanRuntimeProvider runtime={runtime.runningPlanRuntime}>
      <Phase20VisualProbe ready={ready} request={request} timerReceipt={timerReceipt}>
        <ProductionVisualState route={route} />
      </Phase20VisualProbe>
    </RunningPlanRuntimeProvider>
  );
}

export default function Phase20VisualProbeRoute() {
  const params = useLocalSearchParams();
  const extra = Constants.expoConfig?.extra;
  const request = React.useMemo(
    () => resolvePhase20VisualProbe(params),
    [params.configuration, params.fixture, params.mode, params.nonce, params.state],
  );
  const state = React.useMemo(
    () => request === null ? null : phase20VisualState(request.state),
    [request],
  );
  if (extra?.buildProfile !== "development-test"
    || extra?.nativeContractsEnabled !== true
    || extra?.nativeContractSuite !== "v1.2-acceptance"
    || request === null
    || state === null) return <Redirect href="/" />;
  return (
    <RuntimeBoundProductionVisualState
      key={request.nonce}
      ready={request.mode === "reset" || params.ready === request.nonce}
      request={request}
      route={state.route}
    />
  );
}

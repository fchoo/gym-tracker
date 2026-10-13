import { router, Stack, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useRef } from "react";
import { View, type TextStyle } from "react-native";

import { useRunningPlanRuntime } from "../../../src/bootstrap/runningPlanRuntime";
import { useWorkoutAppRuntime } from "../../../src/bootstrap/workoutAppRuntime";
import { parseCalendarRouteOrigin, parseScalarRouteParam } from "../../../src/navigation/routeOrigin";
import { CalendarRunningPlanRouteAdapter } from "../../../src/ui/calendar/CalendarRouteAdapters";
import { EmptyState, ScreenHeader, SecondaryAction } from "../../../src/ui/components";
import { AdaptiveScreen } from "../../../src/ui/layout/AdaptiveScreen";
import { RunningPlanDetailScreen } from "../../../src/ui/screens/RunningPlanDetailScreen";
import { calendarTypeScale } from "../../../src/ui/theme";

function routeId(value: string | string[] | undefined): string | null {
  const parsed = parseScalarRouteParam(value);
  return parsed.kind === "value" ? parsed.value : null;
}

function RunningPlanRouteUnavailable({ calendar = false }: Readonly<{ calendar?: boolean }>) {
  const backActionRef = useRef<View>(null);
  useEffect(() => {
    if (calendar) backActionRef.current?.focus?.();
  }, [calendar]);
  return <>
    <Stack.Screen options={{ gestureEnabled: false }} />
    <AdaptiveScreen
      primary={<><ScreenHeader backAction={() => router.back()} density="deep" eyebrow="RUNNING" title="Running plan" {...(calendar ? { backActionLabel: "Back to Calendar agenda", backActionRef, titleStyle: calendarTypeScale.heading as TextStyle } : {})} /><EmptyState body="This route is invalid or no longer available." heading="Running plan not found" {...(calendar ? { headingStyle: calendarTypeScale.heading as TextStyle } : {})} primaryAction={<SecondaryAction label={calendar ? "Back to Calendar" : "Go back"} onPress={() => router.back()} />} /></>}
    />
  </>;
}

function ManagementRunningPlanDetailRoute({ planId }: Readonly<{ planId: string }>) {
  const runtime = useRunningPlanRuntime();
  const appRuntime = useWorkoutAppRuntime();
  return <>
    <Stack.Screen options={{ gestureEnabled: false }} />
    <RunningPlanDetailScreen
      loadPlan={runtime.loadPlan}
      onBack={() => router.back()}
      onEdit={() => router.push(`/library/running/${planId}/edit` as Href)}
      onEditSession={(sessionId) => router.push(`/library/running/${planId}/session/${sessionId}` as Href)}
      onGarmin={() => router.push({
        pathname: "/garmin",
        params: { origin: "library" },
      } as Href)}
      onNewSession={() => router.push(`/library/running/${planId}/session/new` as Href)}
      planId={planId}
      createLifecycleRequestId={() => appRuntime.createPhase17ActionRequestId("running-lifecycle", runtime.createId("running-lifecycle"))}
      previewLifecycle={runtime.previewLifecycle}
      confirmLifecycle={runtime.confirmLifecycle}
      createCollisionRequestId={() => appRuntime.createPhase17ActionRequestId("schedule-collision", runtime.createId("schedule-collision"))}
      previewScheduleCollision={runtime.previewScheduleCollision}
      previewScheduleCollisionForPlan={runtime.previewScheduleCollisionForPlan}
      commitScheduleCollisionChoice={runtime.commitScheduleCollisionChoice}
    />
  </>;
}

export default function RunningPlanDetailRoute() {
  const {
    origin: rawOrigin,
    planId: rawPlanId,
    sessionId: rawSessionId,
  } = useLocalSearchParams<{
    origin?: string | string[];
    planId?: string | string[];
    sessionId?: string | string[];
  }>();
  const planId = routeId(rawPlanId);
  const sessionId = routeId(rawSessionId);
  const origin = parseCalendarRouteOrigin(rawOrigin, {
    absentManagementOrigin: "library",
    managementOrigins: ["library"] as const,
  });
  if (origin.kind === "invalid") return <RunningPlanRouteUnavailable />;
  if (planId === null) return <RunningPlanRouteUnavailable calendar={origin.kind === "calendar"} />;
  if (origin.kind === "calendar") {
    if (sessionId === null) return <RunningPlanRouteUnavailable calendar />;
    return <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <CalendarRunningPlanRouteAdapter planId={planId} sessionId={sessionId} onBack={() => router.back()} />
    </>;
  }
  return <ManagementRunningPlanDetailRoute planId={planId} />;
}

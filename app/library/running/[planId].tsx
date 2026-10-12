import { router, Stack, useLocalSearchParams, type Href } from "expo-router";

import { useRunningPlanRuntime } from "../../../src/bootstrap/runningPlanRuntime";
import { useWorkoutAppRuntime } from "../../../src/bootstrap/workoutAppRuntime";
import { CalendarRunningPlanRouteAdapter } from "../../../src/ui/calendar/CalendarRouteAdapters";
import { RunningPlanDetailScreen } from "../../../src/ui/screens/RunningPlanDetailScreen";

function routeId(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
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
  } = useLocalSearchParams<{
    origin?: string | string[];
    planId?: string | string[];
  }>();
  const planId = routeId(rawPlanId);
  const calendarOrigin = routeId(rawOrigin) === "calendar";
  if (planId === null) return null;
  if (calendarOrigin) {
    return <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <CalendarRunningPlanRouteAdapter planId={planId} onBack={() => router.back()} />
    </>;
  }
  return <ManagementRunningPlanDetailRoute planId={planId} />;
}

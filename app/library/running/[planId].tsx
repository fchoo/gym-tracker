import { router, Stack, useLocalSearchParams, type Href } from "expo-router";

import { useRunningPlanRuntime } from "../../../src/bootstrap/runningPlanRuntime";
import { RunningPlanDetailScreen } from "../../../src/ui/screens/RunningPlanDetailScreen";

function routeId(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export default function RunningPlanDetailRoute() {
  const runtime = useRunningPlanRuntime();
  const { planId: rawPlanId } = useLocalSearchParams<{ planId?: string | string[] }>();
  const planId = routeId(rawPlanId);
  if (planId === null) return null;
  return <>
    <Stack.Screen options={{ gestureEnabled: false }} />
    <RunningPlanDetailScreen
      loadPlan={runtime.loadPlan}
      onBack={() => router.back()}
      onEdit={() => router.push(`/library/running/${planId}/edit` as Href)}
      onEditSession={(sessionId) => router.push(`/library/running/${planId}/session/${sessionId}` as Href)}
      onGarmin={() => undefined}
      onNewSession={() => router.push(`/library/running/${planId}/session/new` as Href)}
      planId={planId}
      createLifecycleRequestId={() => runtime.createId("running-lifecycle")}
      previewLifecycle={runtime.previewLifecycle}
      confirmLifecycle={runtime.confirmLifecycle}
      createCollisionRequestId={() => runtime.createId("schedule-collision")}
      previewScheduleCollision={runtime.previewScheduleCollision}
      previewScheduleCollisionForPlan={runtime.previewScheduleCollisionForPlan}
      commitScheduleCollisionChoice={runtime.commitScheduleCollisionChoice}
    />
  </>;
}

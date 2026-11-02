import {
  router,
  Stack,
  useLocalSearchParams,
  type Href,
} from "expo-router";

import {
  useWorkoutAppRuntime,
} from "../../../../src/bootstrap/workoutAppRuntime";
import {
  OwnedPlanDetailScreen,
} from "../../../../src/ui/screens/OwnedPlanDetailScreen";

function routeId(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export default function OwnedPlanDetailRoute() {
  const { planId: rawPlanId } = useLocalSearchParams<{
    planId?: string | string[];
  }>();
  const planId = routeId(rawPlanId);
  const runtime = useWorkoutAppRuntime();

  if (planId === null) {
    return null;
  }

  return <>
    <Stack.Screen options={{ gestureEnabled: false }} />
    <OwnedPlanDetailScreen
      archivePlan={runtime.archiveOwnedPlan}
      duplicatePlan={runtime.duplicateOwnedPlan}
      loadPlan={runtime.loadOwnedPlan}
      onBack={() => router.back()}
      onDuplicated={(duplicatedPlanId) =>
        router.replace(`/library/plan/${duplicatedPlanId}` as Href)}
      onEdit={() => router.push(`/library/plan/${planId}/edit` as Href)}
      onSchedule={() =>
        router.push(`/library/plan/${planId}/schedule` as Href)}
      planId={planId}
      restorePlan={runtime.restoreOwnedPlan}
    />
  </>;
}

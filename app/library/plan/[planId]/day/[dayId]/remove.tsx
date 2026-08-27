import {
  router,
  Stack,
  useLocalSearchParams,
} from "expo-router";

import {
  useWorkoutAppRuntime,
} from "../../../../../../src/bootstrap/workoutAppRuntime";
import {
  PlanDayRemovalScreen,
} from "../../../../../../src/ui/screens/PlanDayRemovalScreen";

function firstParameter(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function RemoveOwnedPlanDayRoute() {
  const parameters = useLocalSearchParams<{
    planId: string | string[];
    dayId: string | string[];
  }>();
  const runtime = useWorkoutAppRuntime();
  const planId = firstParameter(parameters.planId);
  const dayId = firstParameter(parameters.dayId);

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <PlanDayRemovalScreen
        createRequestId={() =>
          runtime.createOwnedPlanId("plan-impact-remove")}
        dayId={dayId}
        loadPreview={runtime.previewOwnedPlanDayRemoval}
        onBack={() => router.back()}
        onSaved={() => router.back()}
        planId={planId}
        removeDay={runtime.removeOwnedPlanDayWithImpact}
      />
    </>
  );
}

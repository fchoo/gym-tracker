import {
  router,
  Stack,
  useLocalSearchParams,
} from "expo-router";

import {
  useScheduleRuntime,
} from "../../../../src/bootstrap/scheduleRuntime";
import {
  useWorkoutAppRuntime,
} from "../../../../src/bootstrap/workoutAppRuntime";
import {
  ScheduleEditorScreen,
} from "../../../../src/ui/screens/ScheduleEditorScreen";

export default function ScheduleRoute() {
  const { planId } = useLocalSearchParams<{
    planId: string | string[];
  }>();
  const runtime = useScheduleRuntime(useWorkoutAppRuntime());
  const resolvedPlanId = Array.isArray(planId)
    ? planId[0] ?? ""
    : planId ?? "";

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScheduleEditorScreen
        loadSchedule={runtime.loadSchedule}
        onBack={() => router.back()}
        onSaved={() => router.back()}
        planId={resolvedPlanId}
        saveSchedule={runtime.saveSchedule}
        setDateOverride={runtime.setDateOverride}
      />
    </>
  );
}

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
  OwnedPlanEditorScreen,
} from "../../../../src/ui/screens/OwnedPlanEditorScreen";

export default function EditOwnedPlanRoute() {
  const { planId } = useLocalSearchParams<{
    planId: string | string[];
  }>();
  const runtime = useWorkoutAppRuntime();
  const resolvedPlanId = Array.isArray(planId)
    ? planId[0] ?? ""
    : planId ?? "";

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <OwnedPlanEditorScreen
        archivePlan={runtime.archiveOwnedPlan}
        createDraft={runtime.createOwnedPlanDraft}
        createId={runtime.createOwnedPlanId}
        duplicatePlan={runtime.duplicateOwnedPlan}
        listExercises={runtime.listOwnedPlanExercises}
        loadPlan={runtime.loadOwnedPlan}
        mode="edit"
        onBack={() => router.back()}
        onSchedule={() =>
          router.push(`/library/plan/${resolvedPlanId}/schedule` as Href)}
        onRemoveDay={(dayId) =>
          router.push(
            `/library/plan/${resolvedPlanId}/day/${dayId}/remove` as Href,
          )}
        onReplaceOccurrence={(occurrenceId) =>
          router.push(
            `/library/plan/${resolvedPlanId}/replace/${occurrenceId}` as Href,
          )}
        onSaved={(savedPlanId) => {
          if (savedPlanId !== resolvedPlanId) {
            router.replace(`/library/plan/${savedPlanId}/edit` as Href);
          }
        }}
        planId={resolvedPlanId}
        restorePlan={runtime.restoreOwnedPlan}
        savePlan={runtime.saveOwnedPlan}
      />
    </>
  );
}

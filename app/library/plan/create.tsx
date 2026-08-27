import {
  router,
  Stack,
  type Href,
} from "expo-router";

import {
  useWorkoutAppRuntime,
} from "../../../src/bootstrap/workoutAppRuntime";
import {
  OwnedPlanEditorScreen,
} from "../../../src/ui/screens/OwnedPlanEditorScreen";

export default function CreateOwnedPlanRoute() {
  const runtime = useWorkoutAppRuntime();

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <OwnedPlanEditorScreen
        createDraft={runtime.createOwnedPlanDraft}
        createId={runtime.createOwnedPlanId}
        archivePlan={runtime.archiveOwnedPlan}
        duplicatePlan={runtime.duplicateOwnedPlan}
        listExercises={runtime.listOwnedPlanExercises}
        loadPlan={runtime.loadOwnedPlan}
        mode="create"
        onBack={() => router.back()}
        onSaved={(planId) =>
          router.replace(`/library/plan/${planId}/edit` as Href)}
        restorePlan={runtime.restoreOwnedPlan}
        savePlan={runtime.saveOwnedPlan}
      />
    </>
  );
}

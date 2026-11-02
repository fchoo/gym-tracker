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

/**
 * The Strength-specific destination behind the neutral plan-type chooser.
 *
 * The editor retains ownership of its local aggregate draft.  This wrapper
 * only supplies the authoritative runtime commands and navigation callbacks.
 */
export default function CreateStrengthPlanRoute() {
  const runtime = useWorkoutAppRuntime();

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

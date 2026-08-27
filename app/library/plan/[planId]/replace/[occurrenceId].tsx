import {
  router,
  Stack,
  useLocalSearchParams,
} from "expo-router";

import {
  useWorkoutAppRuntime,
} from "../../../../../src/bootstrap/workoutAppRuntime";
import {
  ExerciseReplacementScreen,
} from "../../../../../src/ui/screens/ExerciseReplacementScreen";

function firstParameter(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function ReplaceOwnedPlanExerciseRoute() {
  const parameters = useLocalSearchParams<{
    planId: string | string[];
    occurrenceId: string | string[];
  }>();
  const runtime = useWorkoutAppRuntime();
  const planId = firstParameter(parameters.planId);
  const occurrenceId = firstParameter(parameters.occurrenceId);

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ExerciseReplacementScreen
        createRequestId={() =>
          runtime.createOwnedPlanId("plan-impact-replace")}
        loadPreview={runtime.previewOwnedPlanExerciseReplacement}
        occurrenceId={occurrenceId}
        onBack={() => router.back()}
        onSaved={() => router.back()}
        planId={planId}
        replaceExercise={runtime.replaceOwnedPlanExercise}
      />
    </>
  );
}

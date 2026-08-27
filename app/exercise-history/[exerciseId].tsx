import {
  router,
  useLocalSearchParams,
} from "expo-router";

import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import {
  ExerciseHistoryScreen,
} from "../../src/ui/screens/ExerciseHistoryScreen";

export default function ExerciseHistoryRoute() {
  const { exerciseId, exerciseName } = useLocalSearchParams<{
    exerciseId: string | string[];
    exerciseName?: string | string[];
  }>();
  const runtime = useWorkoutAppRuntime();
  const resolvedExerciseId = Array.isArray(exerciseId)
    ? exerciseId[0] ?? ""
    : exerciseId ?? "";
  const resolvedExerciseName = Array.isArray(exerciseName)
    ? exerciseName[0] ?? "Exercise"
    : exerciseName ?? "Exercise";

  return (
    <ExerciseHistoryScreen
      exerciseId={resolvedExerciseId}
      exerciseName={resolvedExerciseName}
      loadExerciseHistory={runtime.loadExerciseMetricHistory}
      onBack={() => router.back()}
    />
  );
}

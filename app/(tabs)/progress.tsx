import {
  router,
  type Href,
} from "expo-router";

import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import {
  ProgressScreen,
} from "../../src/ui/screens/ProgressScreen";

export default function ProgressRoute() {
  const runtime = useWorkoutAppRuntime();
  const now = new Date();
  const nowLocalDate = [
    now.getFullYear().toString().padStart(4, "0"),
    (now.getMonth() + 1).toString().padStart(2, "0"),
    now.getDate().toString().padStart(2, "0"),
  ].join("-");

  return (
    <ProgressScreen
      loadProgress={runtime.loadProgress}
      nowLocalDate={nowLocalDate}
      onAcceptRecommendation={async (recommendationId) => {
        const result = await runtime.acceptRecommendation(recommendationId);
        await runtime.refresh();
        return result;
      }}
      onOpenExercise={(exerciseId) =>
        router.push(("/exercise-history/" + exerciseId + "?exerciseName=" + encodeURIComponent(exerciseId)) as Href)}
      onOpenSession={(sessionId) => router.push(("/session/" + sessionId) as Href)}
      onKeepCurrentTarget={async (recommendationId) => {
        const result = await runtime.keepCurrentTarget(recommendationId);
        await runtime.refresh();
        return result;
      }}
    />
  );
}

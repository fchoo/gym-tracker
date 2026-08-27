import {
  router,
  useFocusEffect,
  useLocalSearchParams,
  type Href,
} from "expo-router";
import {
  useCallback,
  useState,
} from "react";

import {
  useCustomExerciseRuntime,
} from "../../../src/bootstrap/customExerciseRuntime";
import {
  ExerciseDetailScreen,
} from "../../../src/ui/screens/ExerciseDetailScreen";

export default function ExerciseDetailRoute() {
  const { exerciseId } = useLocalSearchParams<{
    exerciseId: string | string[];
  }>();
  const runtime = useCustomExerciseRuntime();
  const resolvedExerciseId = Array.isArray(exerciseId)
    ? exerciseId[0] ?? ""
    : exerciseId ?? "";
  const [focusGeneration, setFocusGeneration] = useState(0);

  useFocusEffect(useCallback(() => {
    setFocusGeneration((current) => current + 1);
  }, []));

  return (
    <ExerciseDetailScreen
      exerciseId={resolvedExerciseId}
      key={`${resolvedExerciseId}:${focusGeneration}`}
      loadExercise={runtime.loadExercise}
      onBack={() => router.back()}
      onChangeMetricProfile={(selectedExerciseId) =>
        router.push(
          `/library/exercise/${selectedExerciseId}/edit?mode=metric` as Href,
        )}
      onCreateCustomCopy={(selectedExerciseId) =>
        router.push(
          `/library/exercise/${selectedExerciseId}/edit?mode=copy` as Href,
        )}
      onEdit={(selectedExerciseId) =>
        router.push(`/library/exercise/${selectedExerciseId}/edit` as Href)}
      onOpenHistory={(selectedExerciseId, exerciseName) =>
        router.push(
          (`/exercise-history/${selectedExerciseId}?exerciseName=${encodeURIComponent(exerciseName)}`) as Href,
        )}
      onOpenPlan={(reference) =>
        router.push(`/library/plan/${reference.planId}/edit` as Href)}
      previewArchive={runtime.previewArchive}
      setArchived={runtime.setArchived}
      setFavorite={runtime.setFavorite}
      setHidden={runtime.setHidden}
    />
  );
}

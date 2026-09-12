import {
  router,
  useFocusEffect,
  type Href,
} from "expo-router";
import {
  useCallback,
  useRef,
  useState,
} from "react";

import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import {
  STARTER_TEMPLATE_UPDATE_MODE,
} from "../../src/bootstrap/starterPlanRuntime";
import {
  LibraryScreen,
} from "../../src/ui/screens/LibraryScreen";

export default function LibraryRoute() {
  const runtime = useWorkoutAppRuntime();
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const hasFocused = useRef(false);

  useFocusEffect(useCallback(() => {
    if (hasFocused.current) {
      setRefreshGeneration((current) => current + 1);
    } else {
      hasFocused.current = true;
    }
  }, []));

  return (
    <LibraryScreen
      {...(runtime.contentUpdateResult === undefined
        ? {}
        : { contentUpdateResult: runtime.contentUpdateResult })}
      {...(runtime.contentUpdateFailed === undefined
        ? {}
        : { contentUpdateFailed: runtime.contentUpdateFailed })}
      loadLibrary={runtime.loadLibrary}
      refreshGeneration={refreshGeneration}
      listRecentExercises={runtime.listLibraryRecentExercises}
      onCreateExercise={() =>
        router.push("/library/exercise/create" as Href)}
      onCreatePlan={() => router.push("/library/plan/create" as Href)}
      onOpenExercise={(exerciseId) =>
        router.push(`/library/exercise/${exerciseId}` as Href)}
      onOpenPlan={(planId) =>
        router.push(`/library/plan/${planId}/edit` as Href)}
      onOpenStarter={(templateId) =>
        router.push(`/library/starter/${templateId}` as Href)}
      onOpenTemplateUpdate={({ ownedPlanId, templateId }) =>
        router.push(
          `/library/starter/${templateId}/activate?mode=${STARTER_TEMPLATE_UPDATE_MODE}&ownedPlanId=${ownedPlanId}` as Href,
        )}
      searchExercises={runtime.searchLibraryExercises}
      setExerciseFavorite={runtime.setLibraryExerciseFavorite}
      setSection={runtime.setLibrarySection}
    />
  );
}

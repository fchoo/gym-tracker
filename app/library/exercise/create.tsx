import {
  router,
  Stack,
  type Href,
} from "expo-router";

import {
  useCustomExerciseRuntime,
} from "../../../src/bootstrap/customExerciseRuntime";
import {
  ExerciseEditorScreen,
} from "../../../src/ui/screens/ExerciseEditorScreen";

export default function CreateCustomExerciseRoute() {
  const runtime = useCustomExerciseRuntime();

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ExerciseEditorScreen
        createId={runtime.createId}
        mode="create"
        onBack={() => router.back()}
        onSaved={(exerciseId) =>
          router.replace(`/library/exercise/${exerciseId}` as Href)}
        origin={runtime.ordinaryCreateOrigin}
        saveExercise={runtime.saveExercise}
      />
    </>
  );
}

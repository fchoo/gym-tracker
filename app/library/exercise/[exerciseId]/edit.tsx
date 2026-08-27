import React, {
  useEffect,
  useState,
} from "react";
import {
  router,
  Stack,
  useLocalSearchParams,
  type Href,
} from "expo-router";

import {
  useCustomExerciseRuntime,
} from "../../../../src/bootstrap/customExerciseRuntime";
import {
  ExerciseEditorScreen,
  type ExerciseEditorDraft,
} from "../../../../src/ui/screens/ExerciseEditorScreen";
import {
  MetricMigrationScreen,
} from "../../../../src/ui/screens/MetricMigrationScreen";
import {
  AppLoadingShell,
} from "../../../../src/ui/screens/RootScreens";

type EditDraft = Readonly<{
  draft: ExerciseEditorDraft;
  expectedExerciseRevision?: number;
  origin?: React.ComponentProps<typeof ExerciseEditorScreen>["origin"];
}>;

export default function EditCustomExerciseRoute() {
  const parameters = useLocalSearchParams<{
    exerciseId: string | string[];
    mode?: string | string[];
  }>();
  const runtime = useCustomExerciseRuntime();
  const exerciseId = Array.isArray(parameters.exerciseId)
    ? parameters.exerciseId[0] ?? ""
    : parameters.exerciseId ?? "";
  const mode = Array.isArray(parameters.mode)
    ? parameters.mode[0]
    : parameters.mode;
  const [loaded, setLoaded] = useState<EditDraft | null | undefined>(
    undefined,
  );
  const openSavedExercise = (savedExerciseId: string) => {
    if (mode === "copy" || savedExerciseId !== exerciseId) {
      router.replace(`/library/exercise/${savedExerciseId}` as Href);
      return;
    }
    router.back();
  };

  useEffect(() => {
    if (mode === "metric") {
      return;
    }
    const loader = mode === "copy"
      ? runtime.loadCustomCopyDraft(exerciseId)
      : runtime.loadEditDraft(exerciseId);
    void loader.then(setLoaded);
  }, [exerciseId, mode, runtime]);

  if (mode === "metric") {
    return (
      <MetricMigrationScreen
        createId={runtime.createId}
        exerciseId={exerciseId}
        loadMigration={runtime.loadMigration}
        migrate={runtime.migrate}
        onBack={() => router.back()}
        onSaved={openSavedExercise}
      />
    );
  }

  if (loaded === undefined) {
    return <AppLoadingShell />;
  }

  if (loaded === null) {
    router.back();
    return null;
  }

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ExerciseEditorScreen
        createId={runtime.createId}
        {...(mode === "copy" ? {} : { exerciseId })}
        {...(loaded.expectedExerciseRevision === undefined
          ? {}
          : { expectedExerciseRevision: loaded.expectedExerciseRevision })}
        initialDraft={loaded.draft}
        mode={mode === "copy" ? "create" : "edit"}
        onBack={() => router.back()}
        onSaved={openSavedExercise}
        origin={loaded.origin ?? { kind: "ordinary_create" }}
        saveExercise={runtime.saveExercise}
      />
    </>
  );
}

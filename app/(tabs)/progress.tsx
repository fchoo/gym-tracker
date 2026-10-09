import React from "react";
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
import { useRootSettingsController } from "../../src/ui/shell/AppRootShell";
import {
  rootSettingsTriggerNativeID,
  useRootHeadingRef,
} from "../../src/ui/shell/rootFocus";

export default function ProgressRoute() {
  const settingsActionNativeID = rootSettingsTriggerNativeID("progress");
  const headingRef = useRootHeadingRef("progress");
  const settingsActionRef = React.useRef(null);
  const rootSettings = useRootSettingsController();
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
      workoutRefreshGeneration={runtime.workoutRefreshGeneration}
      onAcceptRecommendation={async (recommendationId) => {
        const result = await runtime.acceptRecommendation(recommendationId);
        await runtime.refresh();
        return result;
      }}
      onOpenExercise={(exerciseId, exerciseName) =>
        router.push(("/exercise-history/" + exerciseId + "?exerciseName=" + encodeURIComponent(exerciseName)) as Href)}
      onOpenSettings={() => rootSettings.openRootSettings({
        root: "progress",
        triggerNativeID: settingsActionNativeID,
        triggerRef: settingsActionRef,
      })}
      onOpenSession={(sessionId) => router.push(("/session/" + sessionId) as Href)}
      onKeepCurrentTarget={async (recommendationId) => {
        const result = await runtime.keepCurrentTarget(recommendationId);
        await runtime.refresh();
        return result;
      }}
      headingRef={headingRef}
      settingsActionRef={settingsActionRef}
      settingsActionNativeID={settingsActionNativeID}
    />
  );
}

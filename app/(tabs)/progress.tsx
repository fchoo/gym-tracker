import React from "react";
import {
  router,
  useFocusEffect,
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
import { createImportedActivityDetailHref } from "../garmin/activity/[activityId]";

export default function ProgressRoute() {
  const settingsActionNativeID = rootSettingsTriggerNativeID("progress");
  const headingRef = useRootHeadingRef("progress");
  const settingsActionRef = React.useRef(null);
  const rootSettings = useRootSettingsController();
  const runtime = useWorkoutAppRuntime();
  const [returnFocusVersion, setReturnFocusVersion] = React.useState(0);
  const hasFocused = React.useRef(false);
  const now = new Date();
  const nowLocalDate = [
    now.getFullYear().toString().padStart(4, "0"),
    (now.getMonth() + 1).toString().padStart(2, "0"),
    now.getDate().toString().padStart(2, "0"),
  ].join("-");

  useFocusEffect(React.useCallback(() => {
    if (hasFocused.current) {
      setReturnFocusVersion((current) => current + 1);
    } else {
      hasFocused.current = true;
    }
  }, []));

  return (
    <ProgressScreen
      loadProgress={(input) => runtime.loadProgress(input)}
      nowLocalDate={nowLocalDate}
      workoutRefreshGeneration={runtime.workoutRefreshGeneration}
      onOpenExercise={(exerciseId, exerciseName) =>
        router.push(("/exercise-history/" + exerciseId + "?exerciseName=" + encodeURIComponent(exerciseName)) as Href)}
      onOpenRunningSource={(source) => {
        if (!("activityId" in source)) return;
        router.push(createImportedActivityDetailHref({
          activityId: source.activityId,
          origin: "progress",
          sourceRevision: source.sourceRevision,
        }));
      }}
      onOpenSettings={() => rootSettings.openRootSettings({
        root: "progress",
        triggerNativeID: settingsActionNativeID,
        triggerRef: settingsActionRef,
      })}
      onOpenSession={(sessionId) => router.push(("/session/" + sessionId) as Href)}
      runningTargetRuntime={runtime.progressRunningTargetRuntime}
      returnFocusVersion={returnFocusVersion}
      headingRef={headingRef}
      settingsActionRef={settingsActionRef}
      settingsActionNativeID={settingsActionNativeID}
    />
  );
}

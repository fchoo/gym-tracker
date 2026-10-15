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
import { usePhase20VisualRequest } from "../../src/testing/phase20VisualContext";
import { phase20VisualState } from "../../src/testing/phase20VisualStateRegistry";

const OPAQUE_ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const RETURN_TOKEN = /^[A-Za-z0-9._:-]{1,256}$/u;

export default function ProgressRoute() {
  const settingsActionNativeID = rootSettingsTriggerNativeID("progress");
  const headingRef = useRootHeadingRef("progress");
  const settingsActionRef = React.useRef(null);
  const rootSettings = useRootSettingsController();
  const runtime = useWorkoutAppRuntime();
  const visualRequest = usePhase20VisualRequest();
  const visualScenario = visualRequest === null
    ? undefined
    : phase20VisualState(visualRequest.state)?.fixture_variant;
  const visualSport = visualScenario?.includes("running") || visualScenario?.startsWith("progress-settings-")
    ? "Running" as const
    : visualScenario?.includes("strength") || visualScenario === "progress-recommendation"
      ? "Strength" as const
      : visualScenario === undefined ? undefined : "All" as const;
  const visualPeriod = visualScenario?.endsWith("-12w")
    ? "12_weeks" as const
    : visualScenario?.endsWith("-all") && visualScenario !== "progress-all"
      ? "all_time" as const
      : visualScenario === undefined ? undefined : "4_weeks" as const;
  const loadProgress = React.useCallback(
    (input: Parameters<typeof runtime.loadProgress>[0]) => {
      const source = runtime.loadProgress(input);
      return visualRequest?.state === "BW-089"
        ? source.then(() => new Promise<never>(() => undefined))
        : source;
    },
    [runtime.loadProgress, visualRequest?.state],
  );
  const [returnFocusVersion, setReturnFocusVersion] = React.useState(0);
  const [returnFocusToken, setReturnFocusToken] = React.useState<string>();
  const pendingReturnFocusTokenRef = React.useRef<string | null>(null);
  const hasFocused = React.useRef(false);
  const now = new Date();
  const nowLocalDate = visualRequest === null ? [
    now.getFullYear().toString().padStart(4, "0"),
    (now.getMonth() + 1).toString().padStart(2, "0"),
    now.getDate().toString().padStart(2, "0"),
  ].join("-") : "2026-10-01";

  useFocusEffect(React.useCallback(() => {
    if (hasFocused.current) {
      const token = pendingReturnFocusTokenRef.current;
      if (token !== null) {
        pendingReturnFocusTokenRef.current = null;
        setReturnFocusToken(token);
        setReturnFocusVersion((current) => current + 1);
      }
    } else {
      hasFocused.current = true;
    }
  }, []));

  return (
    <ProgressScreen
      loadProgress={loadProgress}
      nowLocalDate={nowLocalDate}
      {...(visualPeriod === undefined ? {} : { initialPeriod: visualPeriod })}
      {...(visualSport === undefined ? {} : { initialSport: visualSport })}
      workoutRefreshGeneration={runtime.workoutRefreshGeneration}
      onOpenExercise={(exerciseId, exerciseName, returnToken) => {
        if (!OPAQUE_ID.test(exerciseId)
          || returnToken === undefined
          || !RETURN_TOKEN.test(returnToken)) return;
        pendingReturnFocusTokenRef.current = returnToken;
        router.push({
          pathname: "/exercise-history/[exerciseId]",
          params: {
            exerciseId,
            exerciseName,
            origin: "progress",
            returnToken,
          },
        } as Href);
      }}
      onOpenRunningSource={(source, returnToken) => {
        if (!("activityId" in source)) return;
        pendingReturnFocusTokenRef.current = returnToken;
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
      onOpenSession={(sessionId, returnToken, sourceRevision) => {
        if (!OPAQUE_ID.test(sessionId)) return;
        if (returnToken !== undefined) pendingReturnFocusTokenRef.current = returnToken;
        router.push(sourceRevision === undefined ? (("/session/" + sessionId) as Href) : ({
          pathname: "/session/[sessionId]",
          params: {
            origin: "progress",
            sessionId,
            sourceRevision: String(sourceRevision),
          },
        } as Href));
      }}
      progressBodyweightRuntime={runtime.progressBodyweightRuntime}
      progressRecommendationRuntime={runtime.progressRecommendationRuntime}
      runningTargetRuntime={runtime.progressRunningTargetRuntime}
      returnFocusVersion={returnFocusVersion}
      {...(returnFocusToken === undefined ? {} : { returnFocusToken })}
      headingRef={headingRef}
      settingsActionRef={settingsActionRef}
      settingsActionNativeID={settingsActionNativeID}
    />
  );
}

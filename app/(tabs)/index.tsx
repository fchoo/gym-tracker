import {
  router,
  type Href,
} from "expo-router";
import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import type {
  ProgressRecommendationReview,
} from "../../src/domains/progress";
import { TodayScreen } from "../../src/ui/screens/TodayScreen";
import { useRootSettingsController } from "../../src/ui/shell/AppRootShell";
import {
  rootSettingsTriggerNativeID,
  useRootHeadingRef,
} from "../../src/ui/shell/rootFocus";

export default function TodayRoute() {
  const settingsActionNativeID = rootSettingsTriggerNativeID("index");
  const headingRef = useRootHeadingRef("index");
  const settingsActionRef = useRef(null);
  const rootSettings = useRootSettingsController();
  const runtime = useWorkoutAppRuntime();
  const {
    launchState,
    loadProgress,
    workoutRefreshGeneration,
  } = runtime;
  const [pendingRecommendations, setPendingRecommendations] = useState<
    readonly ProgressRecommendationReview[]
  >([]);
  const optionalStateProps = {
    ...(runtime.actionFailure === undefined
      ? {}
      : { actionFailure: runtime.actionFailure }),
    ...(runtime.failure === undefined ? {} : { failure: runtime.failure }),
    ...(runtime.view === undefined ? {} : { view: runtime.view }),
  };
  const openActiveWorkout = (sessionId: string) => {
    router.push({
      pathname: "/workout/[sessionId]",
      params: { sessionId, returnTo: "/(tabs)" },
    } as unknown as Href);
  };
  useEffect(() => {
    let active = true;
    if (
      launchState !== "trusted"
      || typeof loadProgress !== "function"
    ) {
      setPendingRecommendations((current) =>
        current.length === 0 ? current : []
      );
      return () => { active = false; };
    }
    const now = new Date();
    const nowLocalDate = [
      now.getFullYear().toString().padStart(4, "0"),
      (now.getMonth() + 1).toString().padStart(2, "0"),
      now.getDate().toString().padStart(2, "0"),
    ].join("-");
    void loadProgress({
      period: "all_time",
      nowLocalDate,
    }).then(({ freshness, projection }) => {
      if (!active) {
        return;
      }
      if (freshness === "current" && projection !== null) {
        setPendingRecommendations(projection.recommendations.filter(
          ({ lifecycle }) => lifecycle === "pending",
        ));
        return;
      }
      setPendingRecommendations((current) =>
        current.length === 0 ? current : []
      );
    }).catch(() => {
      if (active) {
        setPendingRecommendations((current) =>
          current.length === 0 ? current : []
        );
      }
    });
    return () => { active = false; };
  }, [launchState, loadProgress, workoutRefreshGeneration]);

  return (
    <TodayScreen
      {...optionalStateProps}
      launchState={runtime.launchState}
      pendingRecommendations={pendingRecommendations}
      onOpenSettings={() => rootSettings.openRootSettings({
        root: "index",
        triggerNativeID: settingsActionNativeID,
        triggerRef: settingsActionRef,
      })}
      onReviewSuggestion={() => router.push("/progress" as Href)}
      onOpenRunningPlan={(planId) => {
        router.push(`/library/running/${planId}` as Href);
      }}
      onSyncGarmin={() => {
        router.push({
          pathname: "/garmin",
          params: { origin: "workout" },
        } as Href);
      }}
      onActivatePlan={() => {
        void runtime.activatePlan();
      }}
      onResumeWorkout={(sessionId, expectedRevision) => {
        if (expectedRevision === undefined) {
          openActiveWorkout(sessionId);
          return;
        }
        void runtime.resumePartialWorkout({
          sessionId,
          expectedSessionRevision: expectedRevision,
          resumedAtMs: Date.now(),
        }).then(() => {
          openActiveWorkout(sessionId);
        }).catch(() => undefined);
      }}
      onRetry={runtime.retry}
      onStartEmpty={() => {
        void runtime.startEmptyWorkout().then((sessionId) => {
          return runtime.recordTrainAnyway({
            workout: { kind: "empty", planDayId: null },
            advanceRotation: false,
          }).catch(() => null).then(() => sessionId);
        }).then((sessionId) => {
          openActiveWorkout(sessionId);
        }).catch(() => undefined);
      }}
      onStartPlanDay={(dayId, mode) => {
        void runtime.startPlanDay(dayId, mode).then((sessionId) => {
          const consumeOverride = runtime.scheduleToday?.overrideState
              === "pending"
            ? runtime.consumeDateOverride(
                runtime.scheduleToday.localDate,
              )
            : Promise.resolve(null);
          if (mode === "scheduled") {
            return consumeOverride.catch(() => null).then(() => sessionId);
          }
          return consumeOverride.catch(() => null).then(() =>
            runtime.recordTrainAnyway({
              workout: { kind: "plan_day", planDayId: dayId },
              advanceRotation: false,
            }).catch(() => null)
          ).then(() => sessionId);
        }).then((sessionId) => {
          openActiveWorkout(sessionId);
        }).catch(() => undefined);
      }}
      onStartOccurrence={(occurrence) => {
        void runtime.startSelectedStrengthOccurrence(occurrence).then((sessionId) => {
          const consumeOverride = runtime.scheduleToday?.overrideState === "pending"
            ? runtime.consumeDateOverride(occurrence.localDate)
            : Promise.resolve(null);
          return consumeOverride.catch(() => null).then(() => sessionId);
        }).then(openActiveWorkout).catch(() => undefined);
      }}
      planDays={runtime.planDays}
      {...(runtime.selectedStrengthOccurrence === undefined
        ? {}
        : { selectedStrengthOccurrence: runtime.selectedStrengthOccurrence })}
      {...(runtime.scheduleToday === undefined
        ? {}
        : { scheduleToday: runtime.scheduleToday })}
      chooseScheduleTimeZone={(choice) => {
        void runtime.chooseTimeZone(choice).then(() => runtime.refresh());
      }}
      headingRef={headingRef}
      settingsActionRef={settingsActionRef}
      settingsActionNativeID={settingsActionNativeID}
    />
  );
}

import {
  router,
  type Href,
} from "expo-router";
import React, {
  useEffect,
  useState,
} from "react";

import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import type {
  ProgressRecommendationReview,
} from "../../src/domains/progress";
import { TodayScreen } from "../../src/ui/screens/TodayScreen";

export default function TodayRoute() {
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
      onOpenSettings={() => router.push("/more" as Href)}
      onReviewSuggestion={() => router.push("/progress" as Href)}
      onActivatePlan={() => {
        void runtime.activatePlan();
      }}
      onResumeWorkout={(sessionId, expectedRevision) => {
        if (expectedRevision === undefined) {
          router.push(`/workout/${sessionId}`);
          return;
        }
        void runtime.resumePartialWorkout({
          sessionId,
          expectedSessionRevision: expectedRevision,
          resumedAtMs: Date.now(),
        }).then(() => {
          router.push(`/workout/${sessionId}`);
        }).catch(() => undefined);
      }}
      onRetry={runtime.retry}
      onStartEmpty={(advanceRotation = false) => {
        void runtime.startEmptyWorkout().then((sessionId) => {
          return runtime.recordTrainAnyway({
            workout: { kind: "empty", planDayId: null },
            advanceRotation,
          }).catch(() => null).then(() => sessionId);
        }).then((sessionId) => {
          router.push(`/workout/${sessionId}`);
        }).catch(() => undefined);
      }}
      onStartPlanDay={(dayId, mode, advanceRotation = false) => {
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
              advanceRotation,
            }).catch(() => null)
          ).then(() => sessionId);
        }).then((sessionId) => {
          router.push(`/workout/${sessionId}`);
        }).catch(() => undefined);
      }}
      planDays={runtime.planDays}
      {...(runtime.scheduleToday === undefined
        ? {}
        : { scheduleToday: runtime.scheduleToday })}
      chooseScheduleTimeZone={(choice) => {
        void runtime.chooseTimeZone(choice).then(() => runtime.refresh());
      }}
    />
  );
}

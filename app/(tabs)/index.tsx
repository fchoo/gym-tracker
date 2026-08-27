import {
  router,
  type Href,
} from "expo-router";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import type { RestAlertPreferences } from "../../src/domains/rest";
import type {
  ProgressRecommendationReview,
} from "../../src/domains/progress";
import { TodayScreen } from "../../src/ui/screens/TodayScreen";

const DEFAULT_REST_ALERT_PREFERENCES: RestAlertPreferences = Object.freeze({
  soundEnabled: true,
  vibrationEnabled: true,
});

export default function TodayRoute() {
  const runtime = useWorkoutAppRuntime();
  const {
    launchState,
    loadProgress,
    workoutRefreshGeneration,
  } = runtime;
  const [restAlertPreferences, setRestAlertPreferences] = useState(
    DEFAULT_REST_ALERT_PREFERENCES,
  );
  const [restAlertPreferencesLoading, setRestAlertPreferencesLoading] =
    useState(false);
  const preferenceReadGeneration = useRef(0);
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
  const readRestAlertPreferences = useCallback(async () => {
    if (runtime.launchState !== "trusted") {
      return;
    }
    const generation = preferenceReadGeneration.current + 1;
    preferenceReadGeneration.current = generation;
    setRestAlertPreferencesLoading(true);
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const preferences = await runtime.readRestAlertPreferences();
      if (generation === preferenceReadGeneration.current) {
        setRestAlertPreferences(preferences);
      }
    } catch {
      if (generation === preferenceReadGeneration.current) {
        setRestAlertPreferences(DEFAULT_REST_ALERT_PREFERENCES);
      }
    } finally {
      if (generation === preferenceReadGeneration.current) {
        setRestAlertPreferencesLoading(false);
      }
    }
  }, [runtime]);

  useEffect(() => {
    if (runtime.launchState !== "trusted") {
      preferenceReadGeneration.current += 1;
      setRestAlertPreferences(DEFAULT_REST_ALERT_PREFERENCES);
      setRestAlertPreferencesLoading(false);
    }
  }, [runtime.launchState]);

  useEffect(() => () => {
    preferenceReadGeneration.current += 1;
  }, []);

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
      restAlertPreferences={restAlertPreferences}
      restAlertPreferencesLoading={restAlertPreferencesLoading}
      onReadRestAlertPreferences={readRestAlertPreferences}
      onChangeRestAlertPreferences={async (preferences) => {
        const result = await runtime.setRestAlertPreferences(preferences);
        setRestAlertPreferences(result.preferences);
        return result;
      }}
      notificationPermission={runtime.notificationPermission}
      onOpenRestNotificationSettings={runtime.openRestNotificationSettings}
      onOpenMore={() => router.push("/more" as Href)}
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
      actOnSchedule={(action) => {
        void runtime.actOnToday(action).then(() => runtime.refresh());
      }}
      chooseScheduleTimeZone={(choice) => {
        void runtime.chooseTimeZone(choice).then(() => runtime.refresh());
      }}
      onWeekdaySkip={() => {
        void runtime.actOnToday("skip").then(() => runtime.refresh());
      }}
    />
  );
}

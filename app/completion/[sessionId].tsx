import {
  router,
  useLocalSearchParams,
  type Href,
} from "expo-router";
import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import type {
  ExerciseEffort,
} from "../../src/domains/progression";
import type {
  CompletedWorkoutPlanWriteBackState,
  SessionDetail,
} from "../../src/domains/workout";
import {
  WorkoutCompletionScreen,
} from "../../src/ui/screens/WorkoutCompletionScreen";
import {
  AdaptiveScreen,
} from "../../src/ui/layout/AdaptiveScreen";
import {
  EmptyState,
  PrimaryAction,
  ScreenHeader,
  SkeletonBlock,
} from "../../src/ui/components";

export default function WorkoutCompletionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const resolvedSessionId = sessionId ?? "unknown";
  const runtime = useWorkoutAppRuntime();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [effortBusy, setEffortBusy] = useState(false);
  const [recommendationBusy, setRecommendationBusy] = useState(false);
  const [planWriteBack, setPlanWriteBack] =
    useState<CompletedWorkoutPlanWriteBackState>({
      state: "completed",
      disposition: "not_eligible",
    });

  const load = useCallback(async () => {
    setSummaryError(false);
    try {
      const nextDetail = await runtime.getSessionDetail(resolvedSessionId);
      setDetail(nextDetail);
      if (nextDetail.status === "completed") {
        setPlanWriteBack(await runtime.previewCompletedWorkoutPlanWriteBack(
          resolvedSessionId,
        ));
      } else {
        setPlanWriteBack({ state: "completed", disposition: "not_eligible" });
      }
    } catch {
      setSummaryError(true);
    }
  }, [resolvedSessionId, runtime]);

  useEffect(() => {
    void load();
  }, [load, runtime.workoutRefreshGeneration]);

  if (detail === null) {
    if (summaryError) {
      return (
        <AdaptiveScreen
          primary={
            <>
              <ScreenHeader title="Workout saved" />
              <EmptyState
                body="The committed workout remains saved. Try loading its factual summary again."
                heading="Summary could not be loaded"
                primaryAction={
                  <PrimaryAction label="Retry summary" onPress={() => void load()} />
                }
              />
            </>
          }
        />
      );
    }
    return (
      <AdaptiveScreen
        primary={
          <>
            <ScreenHeader title="Workout saved" />
            <SkeletonBlock height={40} width="64%" />
            <SkeletonBlock height={72} />
            <SkeletonBlock height={120} />
          </>
        }
      />
    );
  }

  const recordEffort = async (
    sessionExerciseId: string,
    effort: ExerciseEffort,
  ) => {
    const exercise = detail.exercises.find(
      ({ id }) => id === sessionExerciseId,
    );
    if (exercise === undefined) {
      return;
    }
    setEffortBusy(true);
    try {
      await runtime.recordExerciseEffort({
        sessionId: detail.id,
        sessionExerciseId,
        expectedExerciseRevision: exercise.revision,
        effort,
        recordedAtMs: Date.now(),
      });
      setDetail(await runtime.getSessionDetail(detail.id));
    } finally {
      setEffortBusy(false);
    }
  };

  const decide = async (
    recommendationId: string,
    decision: "accept" | "keep",
  ) => {
    setRecommendationBusy(true);
    try {
      if (decision === "accept") {
        await runtime.acceptRecommendation(recommendationId);
      } else {
        await runtime.keepCurrentTarget(recommendationId);
      }
      setDetail(await runtime.getSessionDetail(detail.id));
    } finally {
      setRecommendationBusy(false);
    }
  };

  const keepPlanAsIs = (state: Extract<
    CompletedWorkoutPlanWriteBackState,
    Readonly<{ state: "awaiting_choice" | "save_failed" }>
  >) => {
    const result = runtime.keepCompletedWorkoutPlanAsIs(state);
    setPlanWriteBack(result);
    router.replace("/(tabs)");
  };

  const applyPlanWriteBack = async (state: Extract<
    CompletedWorkoutPlanWriteBackState,
    Readonly<{ state: "awaiting_choice" | "save_failed" }>
  >) => {
    setPlanWriteBack({ state: "applying", preview: state.preview });
    const result = await runtime.applyCompletedWorkoutPlanWriteBack(state);
    if (result.state === "completed" && result.disposition === "saved") {
      router.replace("/(tabs)");
      return;
    }
    if (result.state === "save_failed") {
      setPlanWriteBack(result);
      return;
    }
    setPlanWriteBack(result);
  };

  return (
    <WorkoutCompletionScreen
      detail={detail}
      effortBusy={effortBusy}
      onAcceptRecommendation={(recommendationId) => {
        void decide(recommendationId, "accept");
      }}
      onKeepCurrentTarget={(recommendationId) => {
        void decide(recommendationId, "keep");
      }}
      onApplyPlanWriteBack={(state) => {
        void applyPlanWriteBack(state);
      }}
      onKeepPlanAsIs={keepPlanAsIs}
      onRecordEffort={(sessionExerciseId, effort) => {
        void recordEffort(sessionExerciseId, effort);
      }}
      onRetrySummary={() => void load()}
      onReturnToday={() => router.replace("/(tabs)")}
      onViewDetails={() => router.push({
        pathname: "/session/[sessionId]",
        params: { sessionId: resolvedSessionId },
      } as unknown as Href)}
      recommendationBusy={recommendationBusy}
      planWriteBack={planWriteBack}
      summaryError={summaryError}
    />
  );
}

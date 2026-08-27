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

  const load = useCallback(async () => {
    setSummaryError(false);
    try {
      setDetail(await runtime.getSessionDetail(resolvedSessionId));
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
      summaryError={summaryError}
    />
  );
}

import {
  router,
  useLocalSearchParams,
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
  SessionDetail,
} from "../../src/domains/workout";
import {
  AdaptiveScreen,
} from "../../src/ui/layout/AdaptiveScreen";
import {
  EmptyState,
  PrimaryAction,
  ScreenHeader,
  SkeletonBlock,
} from "../../src/ui/components";
import {
  SessionDetailScreen,
} from "../../src/ui/screens/SessionDetailScreen";

export default function SessionDetailRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const resolvedSessionId = sessionId ?? "unknown";
  const runtime = useWorkoutAppRuntime();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    void runtime.getSessionDetail(resolvedSessionId).then((next) => {
      if (active) {
        setDetail(next);
      }
    }).catch(() => {
      if (active) {
        setFailed(true);
      }
    });
    return () => {
      active = false;
    };
  }, [
    resolvedSessionId,
    runtime,
    runtime.workoutRefreshGeneration,
  ]);

  if (failed) {
    return (
      <AdaptiveScreen
        primary={
          <>
            <ScreenHeader backAction={() => router.back()} title="Workout details" />
            <EmptyState
              body="The session was not changed."
              heading="Workout details could not be loaded"
              primaryAction={
                <PrimaryAction label="Go back" onPress={() => router.back()} />
              }
            />
          </>
        }
      />
    );
  }

  if (detail === null) {
    return (
      <AdaptiveScreen
        primary={
          <>
            <ScreenHeader backAction={() => router.back()} title="Workout details" />
            <SkeletonBlock height={40} width="64%" />
            <SkeletonBlock height={96} />
            <SkeletonBlock height={160} />
          </>
        }
      />
    );
  }

  return (
    <SessionDetailScreen
      detail={detail}
      onGoBack={() => router.back()}
      onCorrectWorkout={() => {
        if (detail.status === "completed" || detail.status === "partial") {
          router.push((`/session/${detail.id}/correct`) as Href);
        }
      }}
      onRemoveFromHistory={() => runtime.removeHistorySession({
        sessionId: detail.id,
        expectedEffectiveRevision: detail.revision,
        confirmation: "remove_from_history",
      }).then(() => {
        router.back();
      })}
      onOpenExerciseHistory={(exercise) =>
        router.push(
          (`/exercise-history/${exercise.exerciseId}?exerciseName=${encodeURIComponent(exercise.name)}`) as Href,
        )}
      onResume={() => {
        if (detail.status === "partial") {
          void runtime.resumePartialWorkout({
            sessionId: detail.id,
            expectedSessionRevision: detail.revision,
            resumedAtMs: Date.now(),
          }).then(() => {
            router.replace(`/workout/${detail.id}`);
          }).catch(() => undefined);
          return;
        }
        router.replace(`/workout/${detail.id}`);
      }}
    />
  );
}

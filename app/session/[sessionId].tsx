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
import {
  CalendarReadOnlyWorkout,
} from "../../src/ui/calendar/CalendarReadOnlyWorkout";

type RouteParam = string | readonly string[] | undefined;

function exactRouteParam(value: RouteParam): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isCalendarOrigin(value: RouteParam): boolean {
  return value === "calendar";
}

function CalendarUnavailable() {
  return (
    <AdaptiveScreen
      primary={
        <>
          <ScreenHeader backAction={() => router.back()} title="Workout details" />
          <EmptyState
            body="This workout was removed or changed. Return to Calendar to refresh."
            heading="Workout details unavailable"
            primaryAction={<PrimaryAction label="Back to Calendar" onPress={() => router.back()} />}
          />
        </>
      }
    />
  );
}

function CalendarSessionDetail({
  sessionId,
  readSession,
}: Readonly<{
  sessionId: string;
  readSession: Readonly<{ getSessionDetail(id: string): Promise<SessionDetail> }>;
}>) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    setDetail(null);
    setMissing(false);
    void readSession.getSessionDetail(sessionId).then((next) => {
      if (active) setDetail(next);
    }).catch(() => {
      if (active) setMissing(true);
    });
    return () => { active = false; };
  }, [readSession, sessionId]);

  if (missing) return <CalendarUnavailable />;
  if (detail === null) {
    return <AdaptiveScreen primary={<><ScreenHeader backAction={() => router.back()} title="Workout details" /><SkeletonBlock height={40} width="64%" /><SkeletonBlock height={96} /></>} />;
  }
  return <CalendarReadOnlyWorkout detail={detail} onGoBack={() => router.back()} />;
}

export default function SessionDetailRoute() {
  const { sessionId, origin } = useLocalSearchParams() as Readonly<{
    sessionId?: RouteParam;
    origin?: RouteParam;
  }>;
  const resolvedSessionId = exactRouteParam(sessionId);
  const runtime = useWorkoutAppRuntime();

  if (isCalendarOrigin(origin)) {
    if (resolvedSessionId === null) return <CalendarUnavailable />;
    return <CalendarSessionDetail sessionId={resolvedSessionId} readSession={{ getSessionDetail: runtime.getSessionDetail }} />;
  }

  const managementSessionId = resolvedSessionId ?? "unknown";
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    void runtime.getSessionDetail(managementSessionId).then((next) => {
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
    managementSessionId,
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

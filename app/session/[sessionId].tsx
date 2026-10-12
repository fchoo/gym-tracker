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
  parseCalendarRouteOrigin,
  parseScalarRouteParam,
  type RouteParam,
} from "../../src/navigation/routeOrigin";
import {
  EmptyState,
  PrimaryAction,
  ScreenHeader,
  SkeletonBlock,
} from "../../src/ui/components";
import {
  CalendarSessionDetailRouteAdapter,
} from "../../src/ui/calendar/CalendarRouteAdapters";
import {
  AdaptiveScreen,
} from "../../src/ui/layout/AdaptiveScreen";
import {
  SessionDetailScreen,
} from "../../src/ui/screens/SessionDetailScreen";

function exactRouteParam(value: RouteParam): string | null {
  const parsed = parseScalarRouteParam(value);
  return parsed.kind === "value" ? parsed.value : null;
}

function SessionRouteUnavailable() {
  return (
    <AdaptiveScreen
      primary={<><ScreenHeader backAction={() => router.back()} title="Workout details" /><EmptyState body="This workout route is invalid or no longer available." heading="Workout details unavailable" primaryAction={<PrimaryAction label="Go back" onPress={() => router.back()} />} /></>}
    />
  );
}

function ManagementSessionDetailRoute({ sessionId }: Readonly<{ sessionId: string }>) {
  const runtime = useWorkoutAppRuntime();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);
  const [failedSessionId, setFailedSessionId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadedSessionId(null);
    setDetail(null);
    setFailedSessionId(null);
    void runtime.getSessionDetail(sessionId).then((next) => {
      if (active) {
        setDetail(next);
        setLoadedSessionId(sessionId);
      }
    }).catch(() => {
      if (active) {
        setFailedSessionId(sessionId);
      }
    });
    return () => {
      active = false;
    };
  }, [
    sessionId,
    runtime.getSessionDetail,
    runtime.workoutRefreshGeneration,
  ]);

  if (failedSessionId === sessionId) {
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

  const visibleDetail = loadedSessionId === sessionId ? detail : null;

  if (visibleDetail === null) {
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
      detail={visibleDetail}
      onGoBack={() => router.back()}
      onCorrectWorkout={() => {
        if (visibleDetail.status === "completed" || visibleDetail.status === "partial") {
          router.push((`/session/${visibleDetail.id}/correct`) as Href);
        }
      }}
      onRemoveFromHistory={() => runtime.removeHistorySession({
        sessionId: visibleDetail.id,
        expectedEffectiveRevision: visibleDetail.revision,
        confirmation: "remove_from_history",
      }).then(() => {
        router.back();
      })}
      onOpenExerciseHistory={(exercise) =>
        router.push(
          (`/exercise-history/${exercise.exerciseId}?exerciseName=${encodeURIComponent(exercise.name)}`) as Href,
        )}
      onResume={() => {
        if (visibleDetail.status === "partial") {
          void runtime.resumePartialWorkout({
            sessionId: visibleDetail.id,
            expectedSessionRevision: visibleDetail.revision,
            resumedAtMs: Date.now(),
          }).then(() => {
              router.replace(`/workout/${visibleDetail.id}`);
          }).catch(() => undefined);
          return;
        }
        router.replace(`/workout/${visibleDetail.id}`);
      }}
    />
  );
}

export default function SessionDetailRoute() {
  const { sessionId, origin: rawOrigin } = useLocalSearchParams() as Readonly<{
    sessionId?: RouteParam;
    origin?: RouteParam;
  }>;
  const resolvedSessionId = exactRouteParam(sessionId);
  const origin = parseCalendarRouteOrigin(rawOrigin, {
    absentManagementOrigin: "direct",
    managementOrigins: ["progress"] as const,
  });

  if (origin.kind === "invalid") return <SessionRouteUnavailable />;
  if (origin.kind === "calendar") {
    return (
      <CalendarSessionDetailRouteAdapter
        onBack={() => router.back()}
        sessionId={resolvedSessionId}
      />
    );
  }
  return resolvedSessionId === null
    ? <SessionRouteUnavailable />
    : <ManagementSessionDetailRoute sessionId={resolvedSessionId} />;
}

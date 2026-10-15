import {
  router,
  useLocalSearchParams,
  type Href,
} from "expo-router";
import React, {
  useEffect,
  useState,
} from "react";
import Constants from "expo-constants";

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
import { CalendarReadOnlyWorkout } from "../../src/ui/calendar/CalendarReadOnlyWorkout";
import {
  AdaptiveScreen,
} from "../../src/ui/layout/AdaptiveScreen";
import {
  SessionDetailScreen,
} from "../../src/ui/screens/SessionDetailScreen";
import { phase20CalendarFixtureRequestFromNativeContract, phase20CalendarSessionDetail } from "../../src/testing/phase20CalendarFixture";

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

function ManagementSessionDetailRoute({ expectedSourceRevision, sessionId }: Readonly<{
  expectedSourceRevision?: number;
  sessionId: string;
}>) {
  const runtime = useWorkoutAppRuntime();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);
  const [failedSessionId, setFailedSessionId] = useState<string | null>(null);
  const [sourceUnavailableSessionId, setSourceUnavailableSessionId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadedSessionId(null);
    setDetail(null);
    setFailedSessionId(null);
    setSourceUnavailableSessionId(null);
    const read = expectedSourceRevision === undefined
      ? runtime.getSessionDetail(sessionId)
      : runtime.getSessionDetailAtRevision(sessionId, expectedSourceRevision);
    void read.then((next) => {
      if (active) {
        setDetail(next);
        setLoadedSessionId(sessionId);
      }
    }).catch(() => {
      if (active) {
        if (expectedSourceRevision === undefined) setFailedSessionId(sessionId);
        else setSourceUnavailableSessionId(sessionId);
      }
    });
    return () => {
      active = false;
    };
  }, [
    sessionId,
    expectedSourceRevision,
    runtime.getSessionDetail,
    runtime.getSessionDetailAtRevision,
    runtime.workoutRefreshGeneration,
  ]);

  if (sourceUnavailableSessionId === sessionId) {
    return (
      <AdaptiveScreen
        primary={
          <>
            <ScreenHeader backAction={() => router.back()} title="Workout details" />
            <EmptyState
              body="The exact workout revision used by Progress was corrected or removed. Return to Progress to load current saved facts."
              heading="Workout source unavailable"
              primaryAction={<PrimaryAction label="Go back" onPress={() => router.back()} />}
            />
          </>
        }
      />
    );
  }

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
  const { sessionId, origin: rawOrigin, sourceRevision: rawSourceRevision, phase20CalendarFixture, phase20CalendarEvidenceNonce, phase20CalendarRequirementsSha256 } = useLocalSearchParams() as Readonly<{
    sessionId?: RouteParam;
    origin?: RouteParam;
    sourceRevision?: RouteParam;
    phase20CalendarFixture?: RouteParam;
    phase20CalendarEvidenceNonce?: RouteParam;
    phase20CalendarRequirementsSha256?: RouteParam;
  }>;
  const resolvedSessionId = exactRouteParam(sessionId);
  const origin = parseCalendarRouteOrigin(rawOrigin, {
    absentManagementOrigin: "direct",
    managementOrigins: ["progress"] as const,
  });
  const parsedSourceRevision = parseScalarRouteParam(rawSourceRevision);
  const sourceRevision = parsedSourceRevision.kind === "value" && /^\d+$/u.test(parsedSourceRevision.value)
    ? Number(parsedSourceRevision.value)
    : undefined;
  const progressSourceValid = origin.kind !== "management" || origin.origin !== "progress"
    || (parsedSourceRevision.kind === "value"
      && Number.isSafeInteger(sourceRevision)
      && sourceRevision! > 0);
  const extra = Constants.expoConfig?.extra;
  const fixtureEnabled = phase20CalendarFixtureRequestFromNativeContract({
    packageName: Constants.expoConfig?.android?.package,
    buildProfile: extra?.buildProfile,
    nativeContractsEnabled: extra?.nativeContractsEnabled,
    suite: extra?.nativeContractSuite,
    fixtureId: exactRouteParam(phase20CalendarFixture),
    nonce: exactRouteParam(phase20CalendarEvidenceNonce),
    requirementsSha256: exactRouteParam(phase20CalendarRequirementsSha256),
  });
  const fixtureDetail = fixtureEnabled && resolvedSessionId !== null ? phase20CalendarSessionDetail(resolvedSessionId) : null;

  if (origin.kind === "invalid" || !progressSourceValid) return <SessionRouteUnavailable />;
  if (origin.kind === "calendar") {
    if (fixtureDetail !== null) return <CalendarReadOnlyWorkout detail={fixtureDetail} onGoBack={() => router.back()} />;
    return (
      <CalendarSessionDetailRouteAdapter
        onBack={() => router.back()}
        sessionId={resolvedSessionId}
      />
    );
  }
  if (fixtureDetail !== null) {
    const fixtureQuery = new URLSearchParams({
      phase20CalendarFixture: exactRouteParam(phase20CalendarFixture)!,
      phase20CalendarEvidenceNonce: exactRouteParam(phase20CalendarEvidenceNonce)!,
      phase20CalendarRequirementsSha256: exactRouteParam(phase20CalendarRequirementsSha256)!,
    }).toString();
    return <SessionDetailScreen detail={fixtureDetail} onGoBack={() => router.back()} onCorrectWorkout={() => router.push(`/session/${fixtureDetail.id}/correct?${fixtureQuery}` as Href)} onRemoveFromHistory={() => Promise.resolve()} onOpenExerciseHistory={() => undefined} onResume={() => undefined} />;
  }
  return resolvedSessionId === null
    ? <SessionRouteUnavailable />
    : <ManagementSessionDetailRoute
        {...(sourceRevision === undefined ? {} : { expectedSourceRevision: sourceRevision })}
        sessionId={resolvedSessionId}
      />;
}

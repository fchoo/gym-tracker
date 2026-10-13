import React, { useEffect, useState } from "react";

import {
  useCalendarActivityReadPort,
  useCalendarSessionReadPort,
  useCalendarStrengthOccurrenceReadPort,
} from "../../bootstrap/workoutAppRuntime";
import { useCalendarRunningPlanReadPort } from "../../bootstrap/runningPlanRuntime";
import { WorkoutOutcomeConflictError, type SessionDetail } from "../../domains/workout";
import { EmptyState, PrimaryAction, ScreenHeader, SkeletonBlock } from "../components";
import { GarminRouteShell } from "../garmin/GarminRouteShell";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import {
  ImportedActivityDetailScreen,
  type ImportedActivityDetailScreenState,
} from "../screens/ImportedActivityDetailScreen";
import { PlannedWorkoutDetailScreen } from "../screens/PlannedWorkoutDetailScreen";
import { RunningPlanDetailScreen } from "../screens/RunningPlanDetailScreen";
import { CalendarReadOnlyWorkout } from "./CalendarReadOnlyWorkout";

function CalendarSessionUnavailable({ onBack }: Readonly<{ onBack(): void }>) {
  return (
    <AdaptiveScreen
      primary={
        <>
          <ScreenHeader backAction={onBack} title="Workout details" />
          <EmptyState
            body="This workout was removed or changed. Return to Calendar to refresh."
            heading="Workout details unavailable"
            primaryAction={<PrimaryAction label="Back to Calendar" onPress={onBack} />}
          />
        </>
      }
    />
  );
}

export function CalendarSessionDetailRouteAdapter({
  onBack,
  sessionId,
}: Readonly<{
  onBack(): void;
  sessionId: string | null;
}>) {
  const readSession = useCalendarSessionReadPort();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">(
    sessionId === null ? "missing" : "loading",
  );
  const [retryGeneration, setRetryGeneration] = useState(0);

  useEffect(() => {
    if (sessionId === null) {
      setDetail(null);
      setState("missing");
      return undefined;
    }
    let active = true;
    setDetail(null);
    setState("loading");
    void readSession.loadCalendarSessionDetail(sessionId).then((next) => {
      if (active) {
        setDetail(next);
        setState(next === null ? "missing" : "ready");
      }
    }).catch((error: unknown) => {
      if (!active) return;
      setState(error instanceof WorkoutOutcomeConflictError
        && error.code === "workout_session_not_found"
        ? "missing"
        : "error");
    });
    return () => { active = false; };
  }, [readSession.loadCalendarSessionDetail, retryGeneration, sessionId]);

  if (state === "missing") return <CalendarSessionUnavailable onBack={onBack} />;
  if (state === "error") {
    return (
      <AdaptiveScreen
        primary={<><ScreenHeader backAction={onBack} title="Workout details" /><EmptyState body="Your saved workout was not changed. Try loading these details again." heading="Workout details could not be loaded" primaryAction={<PrimaryAction label="Retry workout details" onPress={() => setRetryGeneration((value) => value + 1)} />} /></>}
      />
    );
  }
  if (state === "loading" || detail === null) {
    return <AdaptiveScreen primary={<><ScreenHeader backAction={onBack} title="Workout details" /><SkeletonBlock height={40} width="64%" /><SkeletonBlock height={96} /></>} />;
  }
  return <CalendarReadOnlyWorkout detail={detail} onGoBack={onBack} />;
}

export function CalendarPlannedStrengthRouteAdapter({
  occurrenceId,
  onBack,
}: Readonly<{
  occurrenceId: string;
  onBack(): void;
}>) {
  const readOccurrence = useCalendarStrengthOccurrenceReadPort();
  return (
    <PlannedWorkoutDetailScreen
      occurrenceId={occurrenceId}
      loadOccurrence={readOccurrence.loadPlannedStrengthOccurrence}
      onBack={onBack}
    />
  );
}

export function CalendarRunningPlanRouteAdapter({
  planId,
  sessionId,
  onBack,
}: Readonly<{
  planId: string;
  sessionId: string;
  onBack(): void;
}>) {
  const readPlan = useCalendarRunningPlanReadPort();
  return (
    <RunningPlanDetailScreen
      loadPlan={readPlan.loadScheduledSessionPlan}
      mode="calendar"
      onBack={onBack}
      planId={planId}
      sessionId={sessionId}
    />
  );
}

export function CalendarImportedActivityRouteAdapter({
  activityId,
  onBack,
}: Readonly<{
  activityId: string | null;
  onBack(): void;
}>) {
  const readActivity = useCalendarActivityReadPort();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ImportedActivityDetailScreenState>(
    activityId === null ? { kind: "missing" } : { kind: "loading" },
  );

  useEffect(() => {
    if (activityId === null) {
      setState({ kind: "missing" });
      return undefined;
    }
    let active = true;
    setState({ kind: "loading" });
    void readActivity.loadImportedActivityDetail(activityId).then(async (result) => {
      if (!active) return;
      if (result.kind !== "revision_review") {
        setState(result);
        return;
      }
      const review = await readActivity.loadGarminRevisionReview(activityId);
      if (active) setState(review === null ? result : { kind: "revision_review", review });
    }).catch(() => {
      if (active) setState({ kind: "projection_error", code: "accepted_payload_unavailable" });
    });
    return () => { active = false; };
  }, [
    activityId,
    attempt,
    readActivity.loadGarminRevisionReview,
    readActivity.loadImportedActivityDetail,
  ]);

  return (
    <GarminRouteShell origin="calendar">
      <ImportedActivityDetailScreen
        mode="calendar"
        onBack={onBack}
        onRetry={() => setAttempt((current) => current + 1)}
        state={state}
      />
    </GarminRouteShell>
  );
}

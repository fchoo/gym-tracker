import { router, useLocalSearchParams, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { parseGarminRootOrigin } from "../../../src/bootstrap/garminImportRuntime";
import { useWorkoutAppRuntime } from "../../../src/bootstrap/workoutAppRuntime";
import { parseImportedActivityLocalId } from "../../../src/domains/activities/activityDetails";
import type {
  RunningActivityMatchCandidate,
  RunningActivityMatchReadResult,
} from "../../../src/domains/running/activityMatchCommands";
import { GarminRouteShell } from "../../../src/ui/garmin/GarminRouteShell";
import {
  ActivityMatchScreen,
  type ActivityMatchScreenState,
} from "../../../src/ui/screens/ActivityMatchScreen";

const MATCH_RETURN_FOCUS_TOKEN = /^match:[A-Za-z0-9_-]{1,96}$/u;

function scalar(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function createActivityMatchHref(activityId: string): Href {
  const localActivityId = parseImportedActivityLocalId(activityId);
  if (localActivityId === null) throw new Error("activity_match_route_invalid");
  return {
    pathname: "/garmin/match/[activityId]",
    params: { activityId: localActivityId },
  } as Href;
}

export default function ActivityMatchRoute() {
  const params = useLocalSearchParams() as Readonly<{
    activityId?: string | readonly string[];
    origin?: string | readonly string[];
    returnFocusToken?: string | readonly string[];
  }>;
  const runtime = useWorkoutAppRuntime();
  const rawActivityId = scalar(params.activityId);
  const origin = parseGarminRootOrigin(scalar(params.origin));
  const returnFocusToken = scalar(params.returnFocusToken);
  const activityId = useMemo(() => parseImportedActivityLocalId(rawActivityId), [rawActivityId]);
  const validReturnFocusToken = useMemo(
    () => returnFocusToken === undefined || MATCH_RETURN_FOCUS_TOKEN.test(returnFocusToken),
    [returnFocusToken],
  );
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ActivityMatchScreenState>(
    activityId === null || !validReturnFocusToken
      ? { kind: "missing", activityId: "invalid-local-activity" }
      : { kind: "loading" },
  );
  const loadMatchState = useCallback(async (): Promise<RunningActivityMatchReadResult> => {
    if (activityId === null || !validReturnFocusToken) {
      return { kind: "missing", activityId: "invalid-local-activity" };
    }
    return runtime.loadRunningActivityMatch(activityId);
  }, [activityId, runtime.loadRunningActivityMatch, validReturnFocusToken]);

  useEffect(() => {
    if (activityId === null || !validReturnFocusToken) {
      setState({ kind: "missing", activityId: "invalid-local-activity" });
      return undefined;
    }
    let active = true;
    void loadMatchState()
      .then((result: RunningActivityMatchReadResult) => {
        if (active) setState(result);
      })
      .catch(() => {
        if (active) setState({ kind: "projection_error" });
      });
    return () => {
      active = false;
    };
  }, [activityId, attempt, loadMatchState, validReturnFocusToken]);

  return (
    <GarminRouteShell origin={origin}>
      <ActivityMatchScreen
        onBack={() => router.back()}
        onConfirm={(candidate: RunningActivityMatchCandidate) => runtime.confirmActivityMatch(candidate)}
        onLeaveUnmatched={() => router.back()}
        onReassign={(input) => runtime.reassignActivityMatch(input)}
        onReloadMatchState={async () => {
          try {
            setState(await loadMatchState());
          } catch (error) {
            setState({ kind: "projection_error" });
            throw error;
          }
        }}
        onRetry={() => {
          setState({ kind: "loading" });
          setAttempt((current) => current + 1);
        }}
        onUnmatch={(candidate) => runtime.unmatchActivityMatch(candidate)}
        state={state}
      />
    </GarminRouteShell>
  );
}

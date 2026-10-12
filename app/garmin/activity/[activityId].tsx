import {
  router,
  useFocusEffect,
  useLocalSearchParams,
  type Href,
} from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  randomUUID,
} from "expo-crypto";

import {
  type GarminRootOrigin,
} from "../../../src/bootstrap/garminImportRuntime";
import {
  parseImportedActivityLocalId,
  type ImportedActivityDetailReadResult,
} from "../../../src/domains/activities/activityDetails";
import {
  parseCalendarRouteOrigin,
  parseScalarRouteParam,
} from "../../../src/navigation/routeOrigin";
import {
  CALENDAR_RETURN_TOKEN,
  createImportedActivityDetailHref,
} from "../../../src/navigation/importedActivityRoute";
import { useWorkoutAppRuntime } from "../../../src/bootstrap/workoutAppRuntime";
import { CalendarImportedActivityRouteAdapter } from "../../../src/ui/calendar/CalendarRouteAdapters";
import { GarminRouteShell } from "../../../src/ui/garmin/GarminRouteShell";
import {
  ImportedActivityDetailScreen,
  type ImportedActivityDetailScreenState,
} from "../../../src/ui/screens/ImportedActivityDetailScreen";

const MATCH_RETURN_FOCUS_TOKEN = /^match:[A-Za-z0-9_-]{1,96}$/u;

function hasRevisionReview(
  state: ImportedActivityDetailScreenState,
): state is Extract<
  ImportedActivityDetailScreenState,
  Readonly<{ kind: "revision_review"; review: unknown }>
> {
  return state.kind === "revision_review" && "review" in state;
}

export { createImportedActivityDetailHref };

function ManagementImportedActivityDetailRoute({
  activityId,
  origin,
}: Readonly<{
  activityId: string | null;
  origin: Exclude<GarminRootOrigin, "calendar">;
}>) {
  const runtime = useWorkoutAppRuntime();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ImportedActivityDetailScreenState>(
    activityId === null ? { kind: "missing" } : { kind: "loading" },
  );
  const [matchReturnFocusToken, setMatchReturnFocusToken] = useState<string>();
  const [matchReturnFocusVersion, setMatchReturnFocusVersion] = useState(0);
  const pendingMatchReturnFocusTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (activityId === null) {
      setState({ kind: "missing" });
      return undefined;
    }
    let active = true;
    void runtime.loadImportedActivityDetail(activityId).then(async (result: ImportedActivityDetailReadResult) => {
      if (!active) return;
      if (result.kind !== "revision_review") {
        setState(result);
        return;
      }
      const review = await runtime.loadGarminRevisionReview(activityId);
      if (!active) return;
      setState(review === null ? result : { kind: "revision_review", review });
    }).catch(() => {
      if (active) {
        setState({ kind: "projection_error", code: "accepted_payload_unavailable" });
      }
    });
    return () => {
      active = false;
    };
  }, [activityId, attempt, runtime.loadGarminRevisionReview, runtime.loadImportedActivityDetail]);

  useFocusEffect(useCallback(() => {
    const token = pendingMatchReturnFocusTokenRef.current;
    if (token === null || !MATCH_RETURN_FOCUS_TOKEN.test(token)) {
      return undefined;
    }
    setMatchReturnFocusToken(token);
    setMatchReturnFocusVersion((current) => current + 1);
    pendingMatchReturnFocusTokenRef.current = null;
    return undefined;
  }, []));

  const match = useCallback(() => {
    if (activityId === null) return;
    const returnFocusToken = `match:${activityId}`;
    pendingMatchReturnFocusTokenRef.current = returnFocusToken;
    router.push({
      pathname: "/garmin/match/[activityId]",
      params: { activityId, origin, returnFocusToken },
    } as Href);
  }, [activityId, origin]);

  const resolveRevision = useCallback(async (action: "accept" | "keep") => {
    if (activityId === null || !hasRevisionReview(state)) {
      return;
    }
    const requestId = `garmin-revision-${action}-${randomUUID()}`;
    const requestSha256 = await digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      JSON.stringify({
        version: 1,
        action,
        activityId: state.review.activityId,
        expectedAggregateRevision: state.review.acceptedRevision,
        proposedRevision: state.review.proposedRevision,
        expectedProposedSha256: state.review.expectedProposedSha256,
      }),
    );
    const result = await runtime.resolveGarminRevision({
      action,
      requestId,
      requestSha256,
      activityId: state.review.activityId,
      expectedAggregateRevision: state.review.acceptedRevision,
      proposedRevision: state.review.proposedRevision,
      expectedProposedSha256: state.review.expectedProposedSha256,
      occurredAtMs: Date.now(),
    });
    if (result.kind === "conflict") {
      throw new Error("stale");
    }
    setState({ kind: "loading" });
    setAttempt((current) => current + 1);
  }, [activityId, runtime, state]);

  return (
    <GarminRouteShell origin={origin}>
      <ImportedActivityDetailScreen
        onBack={() => router.back()}
        mode="management"
        onRetry={() => {
          setState({ kind: "loading" });
          setAttempt((current) => current + 1);
        }}
        onAcceptRevision={() => resolveRevision("accept")}
        onKeepRevision={() => resolveRevision("keep")}
        onMatch={match}
        {...(matchReturnFocusToken === undefined
          ? {}
          : {
              returnFocusMatchActionToken: matchReturnFocusToken,
              returnFocusMatchActionVersion: matchReturnFocusVersion,
            })}
        state={state}
      />
    </GarminRouteShell>
  );
}

export default function ImportedActivityDetailRoute() {
  const params = useLocalSearchParams() as Readonly<{
    activityId?: string | readonly string[];
    origin?: string | readonly string[];
    returnToken?: string | readonly string[];
  }>;
  const parsedOrigin = parseCalendarRouteOrigin(params.origin, {
    absentManagementOrigin: "workout",
    managementOrigins: ["workout", "library", "progress"] as const,
  });
  const parsedActivityId = parseScalarRouteParam(params.activityId);
  const parsedReturnToken = parseScalarRouteParam(params.returnToken);
  const validReturnToken = parsedReturnToken.kind === "absent"
    || (parsedOrigin.kind === "calendar"
      && parsedReturnToken.kind === "value"
      && CALENDAR_RETURN_TOKEN.test(parsedReturnToken.value));
  const activityId = parsedOrigin.kind === "invalid"
    || parsedActivityId.kind !== "value"
    || !validReturnToken
    ? null
    : parseImportedActivityLocalId(parsedActivityId.value);
  if (parsedOrigin.kind === "invalid" || !validReturnToken) {
    return <CalendarImportedActivityRouteAdapter activityId={null} onBack={() => router.back()} />;
  }
  if (parsedOrigin.kind === "calendar") {
    return <CalendarImportedActivityRouteAdapter activityId={activityId} onBack={() => router.back()} />;
  }
  return <ManagementImportedActivityDetailRoute activityId={activityId} origin={parsedOrigin.origin} />;
}

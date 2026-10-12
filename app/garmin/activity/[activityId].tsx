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
  parseGarminRootOrigin,
} from "../../../src/bootstrap/garminImportRuntime";
import {
  parseImportedActivityLocalId,
  type ImportedActivityDetailReadResult,
} from "../../../src/domains/activities/activityDetails";
import { useWorkoutAppRuntime } from "../../../src/bootstrap/workoutAppRuntime";
import { GarminRouteShell } from "../../../src/ui/garmin/GarminRouteShell";
import {
  ImportedActivityDetailScreen,
  type ImportedActivityDetailScreenState,
} from "../../../src/ui/screens/ImportedActivityDetailScreen";

const CALENDAR_RETURN_TOKEN = /^calendar:[A-Za-z0-9:_-]{1,80}$/u;
const MATCH_RETURN_FOCUS_TOKEN = /^match:[A-Za-z0-9_-]{1,96}$/u;

type ActivityDetailRouteInput = Readonly<{
  activityId: string;
  origin: "workout" | "calendar" | "library" | "progress";
  returnToken?: string;
  sourceRevision?: number;
}>;

function scalar(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function hasRevisionReview(
  state: ImportedActivityDetailScreenState,
): state is Extract<
  ImportedActivityDetailScreenState,
  Readonly<{ kind: "revision_review"; review: unknown }>
> {
  return state.kind === "revision_review" && "review" in state;
}

function parsedSourceRevision(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function validRouteContext(origin: unknown, returnToken: unknown, sourceRevision: number | undefined | null): boolean {
  if (origin !== undefined && origin !== "workout" && origin !== "calendar" && origin !== "library" && origin !== "progress") {
    return false;
  }
  if (sourceRevision === null || (sourceRevision !== undefined && origin !== "progress")) return false;
  if (returnToken === undefined) return true;
  return origin === "calendar"
    && typeof returnToken === "string"
    && CALENDAR_RETURN_TOKEN.test(returnToken);
}

export function createImportedActivityDetailHref(input: ActivityDetailRouteInput): Href {
  const activityId = parseImportedActivityLocalId(input.activityId);
  if (activityId === null
    || !["workout", "calendar", "library", "progress"].includes(input.origin)
    || (input.origin !== "calendar" && input.returnToken !== undefined)
    || (input.sourceRevision !== undefined && (
      input.origin !== "progress"
      || !Number.isSafeInteger(input.sourceRevision)
      || input.sourceRevision <= 0
    ))
    || (input.returnToken !== undefined && !CALENDAR_RETURN_TOKEN.test(input.returnToken))) {
    throw new Error("imported_activity_route_invalid");
  }
  return {
    pathname: "/garmin/activity/[activityId]",
    params: {
      activityId,
      origin: input.origin,
      ...(input.returnToken === undefined ? {} : { returnToken: input.returnToken }),
      ...(input.sourceRevision === undefined ? {} : { sourceRevision: String(input.sourceRevision) }),
    },
  } as Href;
}

export default function ImportedActivityDetailRoute() {
  const params = useLocalSearchParams() as Readonly<{
    activityId?: string | readonly string[];
    origin?: string | readonly string[];
    returnToken?: string | readonly string[];
    sourceRevision?: string | readonly string[];
  }>;
  const runtime = useWorkoutAppRuntime();
  const rawActivityId = scalar(params.activityId);
  const origin = parseGarminRootOrigin(scalar(params.origin));
  const returnToken = scalar(params.returnToken);
  const sourceRevision = parsedSourceRevision(scalar(params.sourceRevision));
  const activityId = useMemo(
    () => validRouteContext(origin, returnToken, sourceRevision)
      ? parseImportedActivityLocalId(rawActivityId)
      : null,
    [origin, rawActivityId, returnToken, sourceRevision],
  );
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
    const load = sourceRevision === undefined
      ? runtime.loadImportedActivityDetail(activityId)
      : runtime.loadImportedActivityDetail(activityId, sourceRevision ?? undefined);
    void load.then(async (result: ImportedActivityDetailReadResult) => {
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
  }, [activityId, attempt, runtime.loadGarminRevisionReview, runtime.loadImportedActivityDetail, sourceRevision]);

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
        mode={origin === "calendar" ? "calendar" : "management"}
        onRetry={() => {
          setState({ kind: "loading" });
          setAttempt((current) => current + 1);
        }}
        {...(origin === "calendar"
          ? {}
          : {
              onAcceptRevision: () => resolveRevision("accept"),
              onKeepRevision: () => resolveRevision("keep"),
              onMatch: match,
            })}
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

import {
  router,
  useFocusEffect,
  useLocalSearchParams,
  type Href,
} from "expo-router";
import Constants from "expo-constants";
import React, {
  useCallback,
  useEffect,
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
import {
  phase20CalendarFixtureRequestFromNativeContract,
  phase20CalendarImportedActivityDetail,
} from "../../../src/testing/phase20CalendarFixture";

const MATCH_RETURN_FOCUS_TOKEN = /^match:[A-Za-z0-9_-]{1,96}$/u;
const loadPhase20CalendarActivity = async (activityId: string) => phase20CalendarImportedActivityDetail(activityId);
const loadNoPhase20Revision = async () => null;

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
  sourceRevision,
}: Readonly<{
  activityId: string | null;
  origin: Exclude<GarminRootOrigin, "calendar">;
  sourceRevision?: number;
}>) {
  const runtime = useWorkoutAppRuntime();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ImportedActivityDetailScreenState>(
    activityId === null ? { kind: "missing" } : { kind: "loading" },
  );
  const requestIdentity = activityId === null
    ? null
    : `${activityId}:${sourceRevision ?? "current"}`;
  const [loadedIdentity, setLoadedIdentity] = useState<string | null>(null);
  const [matchReturnFocusToken, setMatchReturnFocusToken] = useState<string>();
  const [matchReturnFocusVersion, setMatchReturnFocusVersion] = useState(0);
  const pendingMatchReturnFocusTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (activityId === null) {
      setLoadedIdentity(null);
      setState({ kind: "missing" });
      return undefined;
    }
    let active = true;
    setLoadedIdentity(null);
    setState({ kind: "loading" });
    const load = sourceRevision === undefined
      ? runtime.loadImportedActivityDetail(activityId)
      : runtime.loadImportedActivityDetail(activityId, sourceRevision);
    void load.then(async (result: ImportedActivityDetailReadResult) => {
      if (!active) return;
      if (result.kind !== "revision_review") {
        setState(result);
        setLoadedIdentity(requestIdentity);
        return;
      }
      const review = await runtime.loadGarminRevisionReview(activityId);
      if (!active) return;
      setState(review === null ? result : { kind: "revision_review", review });
      setLoadedIdentity(requestIdentity);
    }).catch(() => {
      if (active) {
        setState({ kind: "projection_error", code: "accepted_payload_unavailable" });
        setLoadedIdentity(requestIdentity);
      }
    });
    return () => {
      active = false;
    };
  }, [activityId, attempt, requestIdentity, runtime.loadGarminRevisionReview, runtime.loadImportedActivityDetail, sourceRevision]);

  const visibleState: ImportedActivityDetailScreenState = activityId === null
    ? { kind: "missing" }
    : loadedIdentity === requestIdentity ? state : { kind: "loading" };

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
    if (activityId === null || !hasRevisionReview(visibleState)) {
      return;
    }
    const requestId = `garmin-revision-${action}-${randomUUID()}`;
    const requestSha256 = await digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      JSON.stringify({
        version: 1,
        action,
        activityId: visibleState.review.activityId,
        expectedAggregateRevision: visibleState.review.acceptedRevision,
        proposedRevision: visibleState.review.proposedRevision,
        expectedProposedSha256: visibleState.review.expectedProposedSha256,
      }),
    );
    const result = await runtime.resolveGarminRevision({
      action,
      requestId,
      requestSha256,
      activityId: visibleState.review.activityId,
      expectedAggregateRevision: visibleState.review.acceptedRevision,
      proposedRevision: visibleState.review.proposedRevision,
      expectedProposedSha256: visibleState.review.expectedProposedSha256,
      occurredAtMs: Date.now(),
    });
    if (result.kind === "conflict") {
      throw new Error("stale");
    }
    setState({ kind: "loading" });
    setAttempt((current) => current + 1);
  }, [activityId, runtime, visibleState]);

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
        state={visibleState}
      />
    </GarminRouteShell>
  );
}

export default function ImportedActivityDetailRoute() {
  const params = useLocalSearchParams() as Readonly<{
    activityId?: string | readonly string[];
    origin?: string | readonly string[];
    returnToken?: string | readonly string[];
    sourceRevision?: string | readonly string[];
    phase20CalendarFixture?: string | readonly string[];
    phase20CalendarEvidenceNonce?: string | readonly string[];
    phase20CalendarRequirementsSha256?: string | readonly string[];
  }>;
  const parsedOrigin = parseCalendarRouteOrigin(params.origin, {
    absentManagementOrigin: "workout",
    managementOrigins: ["workout", "library", "progress"] as const,
  });
  const parsedActivityId = parseScalarRouteParam(params.activityId);
  const parsedReturnToken = parseScalarRouteParam(params.returnToken);
  const parsedSourceRevision = parseScalarRouteParam(params.sourceRevision);
  const parsedFixture = parseScalarRouteParam(params.phase20CalendarFixture);
  const parsedEvidenceNonce = parseScalarRouteParam(params.phase20CalendarEvidenceNonce);
  const parsedRequirementsSha256 = parseScalarRouteParam(params.phase20CalendarRequirementsSha256);
  const extra = Constants.expoConfig?.extra;
  const phase20FixtureEnabled = phase20CalendarFixtureRequestFromNativeContract({
    packageName: Constants.expoConfig?.android?.package,
    buildProfile: extra?.buildProfile,
    nativeContractsEnabled: extra?.nativeContractsEnabled,
    suite: extra?.nativeContractSuite,
    fixtureId: parsedFixture.kind === "value" ? parsedFixture.value : undefined,
    nonce: parsedEvidenceNonce.kind === "value" ? parsedEvidenceNonce.value : undefined,
    requirementsSha256: parsedRequirementsSha256.kind === "value" ? parsedRequirementsSha256.value : undefined,
  });
  const sourceRevision = parsedSourceRevision.kind === "absent"
    ? undefined
    : parsedSourceRevision.kind === "value" && /^\d+$/u.test(parsedSourceRevision.value)
      ? Number(parsedSourceRevision.value)
      : null;
  const validReturnToken = parsedReturnToken.kind === "absent"
    || (parsedOrigin.kind === "calendar"
      && parsedReturnToken.kind === "value"
      && CALENDAR_RETURN_TOKEN.test(parsedReturnToken.value));
  const validSourceRevision = sourceRevision === undefined
    || (typeof sourceRevision === "number"
      && parsedOrigin.kind === "management"
      && parsedOrigin.origin === "progress"
      && Number.isSafeInteger(sourceRevision)
      && sourceRevision > 0);
  const activityId = parsedOrigin.kind === "invalid"
    || parsedActivityId.kind !== "value"
    || !validReturnToken
    || !validSourceRevision
    ? null
    : parseImportedActivityLocalId(parsedActivityId.value);
  if (parsedOrigin.kind === "invalid" || !validReturnToken || !validSourceRevision) {
    return <CalendarImportedActivityRouteAdapter activityId={null} onBack={() => router.back()} />;
  }
  if (parsedOrigin.kind === "calendar") {
    return <CalendarImportedActivityRouteAdapter
      activityId={activityId}
      {...(phase20FixtureEnabled ? {
        loadActivityDetail: loadPhase20CalendarActivity,
        loadRevisionReview: loadNoPhase20Revision,
      } : {})}
      onBack={() => router.back()}
    />;
  }
  return <ManagementImportedActivityDetailRoute
    activityId={activityId}
    origin={parsedOrigin.origin}
    {...(typeof sourceRevision === "number" ? { sourceRevision } : {})}
  />;
}

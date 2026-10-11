import {
  router,
  useLocalSearchParams,
  type Href,
} from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  parseImportedActivityLocalId,
  type ImportedActivityDetailReadResult,
} from "../../../src/domains/activities/activityDetails";
import { useWorkoutAppRuntime } from "../../../src/bootstrap/workoutAppRuntime";
import {
  ImportedActivityDetailScreen,
  type ImportedActivityDetailScreenState,
} from "../../../src/ui/screens/ImportedActivityDetailScreen";

const CALENDAR_RETURN_TOKEN = /^calendar:[A-Za-z0-9:_-]{1,80}$/u;

type ActivityDetailRouteInput = Readonly<{
  activityId: string;
  origin: "calendar";
  returnToken?: string;
}>;

function scalar(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function validCalendarContext(origin: unknown, returnToken: unknown): boolean {
  if (origin !== undefined && origin !== "calendar") return false;
  if (returnToken === undefined) return true;
  return origin === "calendar"
    && typeof returnToken === "string"
    && CALENDAR_RETURN_TOKEN.test(returnToken);
}

export function createImportedActivityDetailHref(input: ActivityDetailRouteInput): Href {
  const activityId = parseImportedActivityLocalId(input.activityId);
  if (activityId === null
    || input.origin !== "calendar"
    || (input.returnToken !== undefined && !CALENDAR_RETURN_TOKEN.test(input.returnToken))) {
    throw new Error("imported_activity_route_invalid");
  }
  return {
    pathname: "/garmin/activity/[activityId]",
    params: {
      activityId,
      origin: "calendar",
      ...(input.returnToken === undefined ? {} : { returnToken: input.returnToken }),
    },
  } as Href;
}

export default function ImportedActivityDetailRoute() {
  const params = useLocalSearchParams() as Readonly<{
    activityId?: string | readonly string[];
    origin?: string | readonly string[];
    returnToken?: string | readonly string[];
  }>;
  const runtime = useWorkoutAppRuntime();
  const rawActivityId = scalar(params.activityId);
  const origin = scalar(params.origin);
  const returnToken = scalar(params.returnToken);
  const activityId = useMemo(
    () => validCalendarContext(origin, returnToken)
      ? parseImportedActivityLocalId(rawActivityId)
      : null,
    [origin, rawActivityId, returnToken],
  );
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
    void runtime.loadImportedActivityDetail(activityId).then((result: ImportedActivityDetailReadResult) => {
      if (active) setState(result);
    }).catch(() => {
      if (active) {
        setState({ kind: "projection_error", code: "accepted_payload_unavailable" });
      }
    });
    return () => {
      active = false;
    };
  }, [activityId, attempt, runtime.loadImportedActivityDetail]);

  const match = useCallback(() => {
    if (activityId === null) return;
    router.push({
      pathname: "/garmin/match/[activityId]",
      params: { activityId },
    } as Href);
  }, [activityId]);

  return (
    <ImportedActivityDetailScreen
      onBack={() => router.back()}
      onMatch={match}
      onRetry={() => {
        setState({ kind: "loading" });
        setAttempt((current) => current + 1);
      }}
      state={state}
    />
  );
}

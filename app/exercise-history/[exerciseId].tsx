import {
  router,
  useLocalSearchParams,
  type Href,
} from "expo-router";

import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import {
  ExerciseHistoryScreen,
} from "../../src/ui/screens/ExerciseHistoryScreen";
import {
  AdaptiveScreen,
} from "../../src/ui/layout/AdaptiveScreen";
import {
  EmptyState,
  PrimaryAction,
  ScreenHeader,
} from "../../src/ui/components";

type RouteParam = string | readonly string[] | undefined;

const OPAQUE_ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const RETURN_TOKEN = /^[A-Za-z0-9._:-]{1,256}$/u;
const SAFE_NAME = /^[^\u0000-\u001F\u007F]{1,120}$/u;

function exactIdentifier(value: RouteParam): string | null {
  return typeof value === "string" && OPAQUE_ID.test(value) ? value : null;
}

function trustedName(value: RouteParam): string {
  return typeof value === "string"
    && SAFE_NAME.test(value)
    && !value.startsWith("/")
    && !value.includes("://")
    ? value
    : "Exercise";
}

function routeContextValid(input: Readonly<{
  origin: RouteParam;
  returnToken: RouteParam;
}>): boolean {
  const originValid = input.origin === undefined
    || input.origin === "progress"
    || input.origin === "workout"
    || input.origin === "library";
  const returnTokenValid = input.returnToken === undefined
    || (typeof input.returnToken === "string" && RETURN_TOKEN.test(input.returnToken));
  return originValid && returnTokenValid;
}

function ExerciseHistoryUnavailable() {
  return <AdaptiveScreen primary={<>
    <ScreenHeader backAction={() => router.back()} title="Exercise history" />
    <EmptyState
      body="The requested exercise identity or return context is invalid. No source was opened."
      heading="Exercise history unavailable"
      primaryAction={<PrimaryAction label="Go back" onPress={() => router.back()} />}
    />
  </>} />;
}

export default function ExerciseHistoryRoute() {
  const {
    exerciseId,
    exerciseName,
    origin,
    returnToken,
  } = useLocalSearchParams<{
    exerciseId?: string | string[];
    exerciseName?: string | string[];
    origin?: string | string[];
    returnToken?: string | string[];
  }>();
  const runtime = useWorkoutAppRuntime();
  const resolvedExerciseId = exactIdentifier(exerciseId);
  if (resolvedExerciseId === null || !routeContextValid({ origin, returnToken })) {
    return <ExerciseHistoryUnavailable />;
  }
  const resolvedExerciseName = trustedName(exerciseName);

  return (
    <ExerciseHistoryScreen
      exerciseId={resolvedExerciseId}
      exerciseName={resolvedExerciseName}
      loadExerciseHistory={runtime.loadExerciseMetricHistory}
      onBack={() => router.back()}
      onOpenSource={(sessionId, sourceRevision) => {
        if (!OPAQUE_ID.test(sessionId)
          || !Number.isSafeInteger(sourceRevision)
          || sourceRevision <= 0) return;
        router.push({
          pathname: "/session/[sessionId]",
          params: {
            origin: "progress",
            sessionId,
            sourceRevision: String(sourceRevision),
          },
        } as Href);
      }}
    />
  );
}

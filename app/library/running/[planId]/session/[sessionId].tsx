import { router, Stack, useLocalSearchParams, type Href } from "expo-router";

import { useRunningPlanRuntime } from "../../../../../src/bootstrap/runningPlanRuntime";
import { useWorkoutAppRuntime } from "../../../../../src/bootstrap/workoutAppRuntime";
import { makeRunningSessionSpec, RunningSessionEditorScreen } from "../../../../../src/ui/screens/RunningSessionEditorScreen";

function routeId(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export default function EditRunningSessionRoute() {
  const runtime = useRunningPlanRuntime();
  const appRuntime = useWorkoutAppRuntime();
  const { planId: rawPlanId, sessionId: rawSessionId } = useLocalSearchParams<{
    planId?: string | string[];
    sessionId?: string | string[];
  }>();
  const planId = routeId(rawPlanId);
  const sessionId = routeId(rawSessionId);
  if (planId === null || sessionId === null) return null;
  return <>
    <Stack.Screen options={{ gestureEnabled: false }} />
    <RunningSessionEditorScreen
      createRequestId={() => appRuntime.createPhase17ActionRequestId("running-session-save", runtime.createId("running-session-save"))}
      loadPlan={runtime.loadPlan}
      mode="edit"
      onBack={() => router.back()}
      onSaved={(savedSessionId) => router.replace(`/library/running/${planId}/session/${savedSessionId}` as Href)}
      planId={planId}
      sessionId={sessionId}
      saveSession={(input) => runtime.saveSession({
        ...input,
        session: makeRunningSessionSpec(input.draft),
      })}
    />
  </>;
}

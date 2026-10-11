import { router, Stack, useLocalSearchParams, type Href } from "expo-router";

import { useRunningPlanRuntime } from "../../../../../src/bootstrap/runningPlanRuntime";
import { useWorkoutAppRuntime } from "../../../../../src/bootstrap/workoutAppRuntime";
import { makeRunningSessionSpec, RunningSessionEditorScreen } from "../../../../../src/ui/screens/RunningSessionEditorScreen";

function routeId(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export default function NewRunningSessionRoute() {
  const runtime = useRunningPlanRuntime();
  const appRuntime = useWorkoutAppRuntime();
  const { planId: rawPlanId } = useLocalSearchParams<{ planId?: string | string[] }>();
  const planId = routeId(rawPlanId);
  if (planId === null) return null;
  return <>
    <Stack.Screen options={{ gestureEnabled: false }} />
    <RunningSessionEditorScreen
      createRequestId={() => appRuntime.createPhase17ActionRequestId("running-session-save", runtime.createId("running-session-save"))}
      loadPlan={runtime.loadPlan}
      mode="create"
      onBack={() => router.back()}
      onSaved={(sessionId) => router.replace(`/library/running/${planId}/session/${sessionId}` as Href)}
      planId={planId}
      saveSession={(input) => runtime.saveSession({
        ...input,
        session: makeRunningSessionSpec(input.draft),
      })}
    />
  </>;
}

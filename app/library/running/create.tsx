import { router, Stack, type Href } from "expo-router";
import { useMemo } from "react";
import { useRunningPlanRuntime } from "../../../src/bootstrap/runningPlanRuntime";
import { useWorkoutAppRuntime } from "../../../src/bootstrap/workoutAppRuntime";
import { RunningPlanEditorScreen } from "../../../src/ui/screens/RunningPlanEditorScreen";

export default function CreateRunningPlanRoute() {
  const runtime = useRunningPlanRuntime();
  const appRuntime = useWorkoutAppRuntime();
  const draft = useMemo(() => {
    const id = runtime.createId("running-plan"); const now = Date.now();
    return { version: 1 as const, id, name: "Running plan", revision: 1, createdAtMs: now,
      goal: { version: 1 as const, id: runtime.createId("running-goal"), planId: id, revision: 1, goalDistanceMeters: 0, trainingDays: [], createdAtMs: now }, sessions: [] };
  }, [runtime]);
  return <><Stack.Screen options={{ gestureEnabled: false }} /><RunningPlanEditorScreen createId={runtime.createId} initialDraft={draft} onBack={() => router.back()} onSaved={(id) => router.replace(`/library/running/${id}` as Href)} savePlan={(plan) => runtime.createInactivePlan({ plan, requestId: appRuntime.createPhase17ActionRequestId("running-plan-create", runtime.createId("running-plan-create")) })} /></>;
}

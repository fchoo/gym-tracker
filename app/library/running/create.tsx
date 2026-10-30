import { router, Stack, useLocalSearchParams, type Href } from "expo-router";
import { useMemo } from "react";
import { useRunningPlanRuntime } from "../../../src/bootstrap/runningPlanRuntime";
import { useWorkoutAppRuntime } from "../../../src/bootstrap/workoutAppRuntime";
import { RunningPlanEditorScreen } from "../../../src/ui/screens/RunningPlanEditorScreen";

export default function CreateRunningPlanRoute() {
  const runtime = useRunningPlanRuntime();
  const appRuntime = useWorkoutAppRuntime();
  const { fixturePlanId } = useLocalSearchParams<{ fixturePlanId?: string }>();
  const draft = useMemo(() => {
    const id = typeof fixturePlanId === "string" && /^phase17:running-plan:[a-z0-9-]{16,128}$/u.test(fixturePlanId) ? fixturePlanId : runtime.createId("running-plan"); const now = Date.now();
    return { version: 1 as const, id, name: "Running plan", revision: 1, createdAtMs: now,
      goal: { version: 1 as const, id: runtime.createId("running-goal"), planId: id, revision: 1, goalDistanceMeters: 0, trainingDays: [], createdAtMs: now }, sessions: [] };
  }, [fixturePlanId, runtime]);
  return <><Stack.Screen options={{ gestureEnabled: false }} /><RunningPlanEditorScreen createId={runtime.createId} initialDraft={draft} onBack={() => router.back()} onSaved={(id) => router.replace(`/library/running/${id}` as Href)} savePlan={async (plan) => {
    const requestId = await appRuntime.createPhase17ActionRequestId("running-plan-create", runtime.createId("running-plan-create"));
    return runtime.createInactivePlan({ plan, requestId });
  }} /></>;
}

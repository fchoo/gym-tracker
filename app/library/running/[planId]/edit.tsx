import { router, Stack, useLocalSearchParams, type Href } from "expo-router";
import React, { useEffect, useState } from "react";

import { useRunningPlanRuntime } from "../../../../src/bootstrap/runningPlanRuntime";
import { RunningPlanEditorScreen } from "../../../../src/ui/screens/RunningPlanEditorScreen";
import { draftFromRunningPlan } from "../../../../src/ui/running/runningFormDraft";

function routeId(value: string | string[] | undefined): string | null { return typeof value === "string" && value.trim() !== "" ? value : null; }

export default function EditRunningPlanRoute() {
  const runtime = useRunningPlanRuntime();
  const { planId: rawPlanId } = useLocalSearchParams<{ planId?: string | string[] }>();
  const planId = routeId(rawPlanId);
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof runtime.loadPlan>>>(null);
  useEffect(() => { if (planId !== null) void runtime.loadPlan(planId).then(setSnapshot); }, [planId]);
  if (planId === null || snapshot === null) return null;
  return <><Stack.Screen options={{ gestureEnabled: false }} /><RunningPlanEditorScreen
    createId={runtime.createId} initialDraft={draftFromRunningPlan(snapshot)} savePlan={runtime.savePlan}
    onBack={() => router.back()} onSaved={(id) => router.replace(`/library/running/${id}` as Href)} title="Edit Running plan"
    onOpenSession={(sessionId) => router.push((sessionId === undefined ? `/library/running/${planId}/session/new` : `/library/running/${planId}/session/${sessionId}`) as Href)}
  /></>;
}

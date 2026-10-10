import React, { createContext, useContext } from "react";

import { createInactiveRunningPlan, type CreateInactiveRunningPlanInput } from "../domains/running/commands";
import type { RunningPlanAggregate } from "../domains/running/contracts";
import type { SqliteKernel } from "../platform/sqlite";
import { createRunningPlanRepository } from "../platform/sqlite/repositories/runningPlanRepository";

export type RunningPlanRuntimePort = Readonly<{
  createId(kind: string): string;
  createInactivePlan(input: Omit<CreateInactiveRunningPlanInput, "requestId" | "requestSha256">): Promise<RunningPlanAggregate>;
  loadPlan(planId: string): Promise<RunningPlanAggregate | null>;
}>;

const RunningPlanRuntimeContext = createContext<RunningPlanRuntimePort | null>(null);

export function createRunningPlanRuntimePort(kernel: SqliteKernel, dependencies: Readonly<{
  nowMs(): number;
  randomUUID(): string;
  sha256(value: string): Promise<string>;
}>): RunningPlanRuntimePort {
  const repository = createRunningPlanRepository(kernel);
  const createId = (kind: string) => `${kind}:${dependencies.randomUUID()}`;
  return Object.freeze({
    createId,
    loadPlan: (planId) => repository.readAggregate(planId),
    createInactivePlan: async (input) => {
      const requestId = createId("running-plan-create");
      const requestSha256 = await dependencies.sha256(JSON.stringify({ requestId, plan: input.plan }));
      return createInactiveRunningPlan(repository, { ...input, requestId, requestSha256 });
    },
  });
}

export function RunningPlanRuntimeProvider(props: Readonly<{ runtime: RunningPlanRuntimePort; children: React.ReactNode }>) {
  return <RunningPlanRuntimeContext.Provider value={props.runtime}>{props.children}</RunningPlanRuntimeContext.Provider>;
}

export function useRunningPlanRuntime(): RunningPlanRuntimePort {
  const runtime = useContext(RunningPlanRuntimeContext);
  if (runtime === null) throw new Error("running_plan_runtime_unavailable");
  return runtime;
}

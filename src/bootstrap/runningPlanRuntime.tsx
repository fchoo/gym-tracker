import React, { createContext, useContext } from "react";

import { canonicalRunningRequestHash, createInactiveRunningPlan, saveRunningSourceGraph, type CreateInactiveRunningPlanInput } from "../domains/running/commands";
import type { RunningPlanAggregate, RunningSessionRevision } from "../domains/running/contracts";
import type { RunningLifecycleAction, RunningLifecyclePreview } from "../domains/running/lifecycle";
import type { CommitScheduleCollisionChoiceInput, ScheduleCollisionPreview } from "../domains/scheduling/collisionCommands";
import type { SqliteKernel } from "../platform/sqlite";
import {
  createRunningPlanRepository,
} from "../platform/sqlite/repositories/runningPlanRepository";
import { createScheduleCollisionRepository, type ScheduleCollisionCommandResult } from "../platform/sqlite/repositories/scheduleCollisionRepository";

export type RunningPlanRuntimePort = Readonly<{
  createId(kind: string): string;
  createInactivePlan(input: Omit<CreateInactiveRunningPlanInput, "requestId" | "requestSha256"> & Readonly<{ requestId?: string }>): Promise<RunningPlanAggregate>;
  loadPlan(planId: string): Promise<RunningPlanAggregate | null>;
  savePlan(input: Omit<RunningPlanAggregate, "active" | "lifecycle"> & Readonly<{ requestId?: string }>): Promise<RunningPlanAggregate>;
  saveSession(input: RunningSessionMutationInput): Promise<RunningSessionMutationResult>;
  previewLifecycle(planId: string, action: RunningLifecycleAction): Promise<RunningLifecyclePreview>;
  confirmLifecycle(input: RunningLifecycleConfirmationInput): Promise<RunningPlanAggregate>;
  previewScheduleCollision(input: Omit<ScheduleCollisionPreview, "confirmationToken">): Promise<ScheduleCollisionPreview>;
  previewScheduleCollisionForPlan(planId: string): Promise<ScheduleCollisionPreview | null>;
  commitScheduleCollisionChoice(input: CommitScheduleCollisionChoiceInput): Promise<ScheduleCollisionCommandResult>;
}>;

export type RunningLifecycleConfirmationInput = Readonly<{
  action: RunningLifecycleAction;
  preview: RunningLifecyclePreview;
  requestId: string;
}>;

export type RunningSessionMutationInput = Readonly<{
  planId: string;
  expectedPlanRevision: number;
  requestId: string;
  sessionRootId?: string | undefined;
  expectedSessionRevision?: number | undefined;
  slotRootId?: string | undefined;
  expectedSlotRevision?: number | undefined;
  session: Readonly<{
    sessionKind: RunningSessionRevision["sessionKind"];
    weekday: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
    phases: RunningSessionRevision["phases"];
    advisoryTarget?: RunningSessionRevision["advisoryTarget"];
    contextual: RunningSessionRevision["contextual"];
  }>;
}>;

export type RunningSessionMutationResult = Readonly<{ plan: RunningPlanAggregate; sessionRootId: string }>;

const RunningPlanRuntimeContext = createContext<RunningPlanRuntimePort | null>(null);

export function createRunningPlanRuntimePort(kernel: SqliteKernel, dependencies: Readonly<{
  nowMs(): number;
  randomUUID(): string;
  sha256(value: string): Promise<string>;
}>): RunningPlanRuntimePort {
  const repository = createRunningPlanRepository(kernel);
  const collisions = createScheduleCollisionRepository(kernel, dependencies.sha256);
  const createId = (kind: string) => `${kind}:${dependencies.randomUUID()}`;
  const sessionCommands = new Map<string, ReturnType<typeof buildSessionCommand>>();
  const lifecycleCommands = new Map<string, RunningLifecycleConfirmationInput>();
  return Object.freeze({
    createId,
    loadPlan: (planId) => repository.readAggregate(planId),
    createInactivePlan: async (input) => {
      const requestId = input.requestId ?? createId("running-plan-create");
      const requestSha256 = await dependencies.sha256(JSON.stringify({ requestId, plan: input.plan }));
      const committed = await createInactiveRunningPlan(repository, { ...input, requestId, requestSha256 });
      const readBack = await repository.readAggregate(committed.id);
      if (readBack === null) throw new Error("running_plan_readback_missing");
      return readBack;
    },
    savePlan: async (input) => {
      const current = await repository.readAggregate(input.id);
      if (current === null || current.revision !== input.revision) throw new Error("running_plan_revision_conflict");
      const now = dependencies.nowMs();
      const command = {
        requestId: input.requestId ?? createId("running-plan-save"), operation: "edit" as const, planId: current.id,
        expectedPlanRevision: current.revision, createdAtMs: now,
        goal: { ...input.goal, id: createId("running-goal-revision"), revision: current.goal.revision + 1, createdAtMs: now },
        sessions: input.sessions.map((entry) => ({ ...entry.session, id: createId("running-session-revision"), revision: entry.session.revision + 1, createdAtMs: now })),
        slots: input.sessions.map((entry, index) => ({ id: createId("running-slot-revision"), rootId: entry.slot.rootId, weekday: entry.slot.weekday, revision: entry.slot.revision + 1, ordinal: index, sessionRootId: entry.session.rootId, sessionRevisionId: "" })),
      };
      const slots = command.slots.map((slot, index) => ({ ...slot, sessionRevisionId: command.sessions[index]!.id }));
      const hashInput = { ...command, slots };
      await saveRunningSourceGraph(repository, { ...hashInput, completeMembership: true, requestSha256: canonicalRunningRequestHash({ ...hashInput, completeMembership: true }) });
      const readBack = await repository.readAggregate(current.id);
      if (readBack === null) throw new Error("running_plan_readback_missing");
      return readBack;
    },
    saveSession: async (input) => {
      const plan = await repository.readAggregate(input.planId);
      if (plan === null || plan.revision !== input.expectedPlanRevision) throw new Error("running_plan_revision_conflict");
      const existing = input.sessionRootId === undefined
        ? undefined
        : plan.sessions.find((entry) => entry.session.rootId === input.sessionRootId);
      if (input.sessionRootId !== undefined && (
        existing === undefined || existing.session.revision !== input.expectedSessionRevision
        || existing.slot.rootId !== input.slotRootId || existing.slot.revision !== input.expectedSlotRevision
      )) throw new Error("running_session_revision_conflict");
      const command = sessionCommands.get(input.requestId) ?? buildSessionCommand({ plan, input, existing, createId, now: dependencies.nowMs() });
      sessionCommands.set(input.requestId, command);
      await saveRunningSourceGraph(repository, {
        ...command, completeMembership: true,
        requestSha256: canonicalRunningRequestHash({ ...command, completeMembership: true }),
      });
      const readBack = await repository.readAggregate(plan.id);
      if (readBack === null) throw new Error("running_plan_readback_missing");
      return Object.freeze({ plan: readBack, sessionRootId: command.sessions[0]!.rootId });
    },
    previewLifecycle: (planId, action) => repository.previewLifecycle(planId, action),
    confirmLifecycle: async (input) => {
      const command = lifecycleCommands.get(input.requestId) ?? input;
      lifecycleCommands.set(input.requestId, command);
      const requestSha256 = canonicalRunningRequestHash({
        action: command.action,
        preview: command.preview,
        requestId: command.requestId,
      });
      const committed = await repository.confirmLifecycle({
        action: command.action,
        requestId: command.requestId,
        requestSha256,
        confirmationToken: command.preview.confirmationToken,
        preview: command.preview,
        committedAtMs: dependencies.nowMs(),
      });
      const readBack = await repository.readAggregate(committed.planId);
      if (readBack === null || readBack.lifecycle !== committed.lifecycle) {
        throw new Error("running_lifecycle_readback_missing");
      }
      return readBack;
    },
    previewScheduleCollision: (input) => collisions.preview(input),
    previewScheduleCollisionForPlan: (planId) => collisions.previewForRunningPlan(planId),
    commitScheduleCollisionChoice: (input) => collisions.confirm(input),
  });
}

function buildSessionCommand(input: Readonly<{
  plan: RunningPlanAggregate;
  input: RunningSessionMutationInput;
  existing: RunningPlanAggregate["sessions"][number] | undefined;
  createId(kind: string): string;
  now: number;
}>) {
  const { weekday, ...sessionDefinition } = input.input.session;
  const sessionRootId = input.existing?.session.rootId ?? input.createId("running-session");
  const sessionRevision = (input.existing?.session.revision ?? 0) + 1;
  const slotRootId = input.existing?.slot.rootId ?? input.createId("running-slot");
  const slotRevision = (input.existing?.slot.revision ?? 0) + 1;
  const session = {
    version: 1 as const, id: input.createId("running-session-revision"), rootId: sessionRootId,
    planId: input.plan.id, revision: sessionRevision, createdAtMs: input.now, ...sessionDefinition,
  } as RunningSessionRevision;
  const slot = {
    id: input.createId("running-slot-revision"), rootId: slotRootId, weekday,
    revision: slotRevision, ordinal: input.existing?.slot.ordinal ?? input.plan.sessions.filter((entry) => entry.slot.weekday === weekday).length,
    sessionRootId, sessionRevisionId: session.id,
  };
  const retained = input.plan.sessions.filter((entry) => entry.session.rootId !== sessionRootId);
  const retainedSessions = retained.map((entry) => entry.session);
  const retainedSlots = retained.map((entry) => ({
    id: input.createId("running-slot-revision"), rootId: entry.slot.rootId,
    weekday: entry.slot.weekday, revision: entry.slot.revision + 1,
    ordinal: entry.slot.ordinal, sessionRootId: entry.session.rootId,
    sessionRevisionId: entry.session.id,
  }));
  return {
    requestId: input.input.requestId, operation: "edit" as const, planId: input.plan.id,
    expectedPlanRevision: input.plan.revision, createdAtMs: input.now,
    goal: { ...input.plan.goal, id: input.createId("running-goal-revision"), revision: input.plan.goal.revision + 1, createdAtMs: input.now },
    sessions: [session, ...retainedSessions], slots: [slot, ...retainedSlots],
  };
}

export function RunningPlanRuntimeProvider(props: Readonly<{ runtime: RunningPlanRuntimePort; children: React.ReactNode }>) {
  return <RunningPlanRuntimeContext.Provider value={props.runtime}>{props.children}</RunningPlanRuntimeContext.Provider>;
}

export function useRunningPlanRuntime(): RunningPlanRuntimePort {
  const runtime = useContext(RunningPlanRuntimeContext);
  if (runtime === null) throw new Error("running_plan_runtime_unavailable");
  return runtime;
}

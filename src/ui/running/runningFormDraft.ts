import type { RunningPlanAggregate } from "../../domains/running/contracts";

export type RunningPlanDraft = Omit<RunningPlanAggregate, "active">;

export function draftFromRunningPlan(plan: RunningPlanAggregate): RunningPlanDraft {
  return { ...plan, goal: { ...plan.goal }, sessions: plan.sessions.map((entry) => ({ slot: { ...entry.slot }, session: { ...entry.session, phases: entry.session.phases.map((phase) => ({ ...phase, steps: phase.steps.map((step) => ({ ...step })) })) } })) };
}

export function validateRunningPlanDraft(draft: RunningPlanDraft): "running_goal_invalid" | null {
  return draft.goal.goalDistanceMeters > 0 && draft.goal.trainingDays.length > 0 ? null : "running_goal_invalid";
}

import {
  RUNNING_SESSION_KINDS,
  parseRunningSessionRevision,
  type RunningPlanAggregate,
  type RunningPlanSession,
  type RunningSessionKind,
  type RunningSessionRevision,
} from "../../domains/running/contracts";

export { RUNNING_SESSION_KINDS };

export type RunningPlanDraft = Omit<RunningPlanAggregate, "active" | "lifecycle">;
export type RunningPlanDraftValidation =
  | "running_goal_distance_invalid"
  | "running_goal_days_invalid"
  | "running_goal_duration_invalid"
  | "running_goal_target_date_invalid"
  | "running_goal_runs_per_week_invalid"
  | "running_goal_long_run_day_invalid"
  | "running_goal_weekly_distance_invalid"
  | "running_session_invalid";

export const RUNNING_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export function draftFromRunningPlan(plan: RunningPlanAggregate): RunningPlanDraft {
  return {
    ...plan,
    goal: { ...plan.goal, trainingDays: [...plan.goal.trainingDays] },
    sessions: plan.sessions.map((entry) => ({
      slot: { ...entry.slot },
      session: {
        ...entry.session,
        phases: entry.session.phases.map((phase) => ({
          ...phase,
          steps: phase.steps.map((step) => ({ ...step })),
        })),
      },
    })),
  };
}

export function validateRunningPlanDraft(draft: RunningPlanDraft): RunningPlanDraftValidation | null {
  if (!Number.isSafeInteger(draft.goal.goalDistanceMeters) || draft.goal.goalDistanceMeters <= 0) return "running_goal_distance_invalid";
  if (draft.goal.trainingDays.length === 0 || new Set(draft.goal.trainingDays).size !== draft.goal.trainingDays.length) return "running_goal_days_invalid";
  if (draft.goal.targetDurationMs !== undefined && (!Number.isSafeInteger(draft.goal.targetDurationMs) || draft.goal.targetDurationMs <= 0)) return "running_goal_duration_invalid";
  if (draft.goal.targetLocalDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/u.test(draft.goal.targetLocalDate)) return "running_goal_target_date_invalid";
  if (!Number.isSafeInteger(draft.goal.runsPerWeek) || draft.goal.runsPerWeek === undefined || draft.goal.runsPerWeek < 1) return "running_goal_runs_per_week_invalid";
  if (draft.goal.currentWeeklyDistanceMeters !== undefined && (!Number.isFinite(draft.goal.currentWeeklyDistanceMeters) || draft.goal.currentWeeklyDistanceMeters <= 0)) return "running_goal_weekly_distance_invalid";
  const longRunExists = draft.sessions.some((entry) => entry.session.sessionKind === "long_run");
  if (longRunExists && (draft.goal.longRunDay === undefined || !draft.goal.trainingDays.includes(draft.goal.longRunDay))) return "running_goal_long_run_day_invalid";
  const hasSameDaySlots = draft.sessions.some((entry, index) => draft.sessions.some((other, otherIndex) => otherIndex !== index && other.slot.weekday === entry.slot.weekday));
  if (draft.goal.runsPerWeek > draft.goal.trainingDays.length && !hasSameDaySlots) return "running_goal_runs_per_week_invalid";
  const slots = new Set<string>();
  for (const entry of draft.sessions) {
    const key = `${entry.slot.weekday}:${entry.slot.ordinal}`;
    if (slots.has(key) || entry.session.planId !== draft.id) return "running_session_invalid";
    slots.add(key);
  }
  return null;
}

export function runningPlanCommandFromDraft(draft: RunningPlanDraft): Omit<RunningPlanAggregate, "active" | "lifecycle"> {
  const validation = validateRunningPlanDraft(draft);
  if (validation !== null) throw new Error(validation);
  return draftFromRunningPlan({ ...draft, active: false, lifecycle: "inactive" });
}

export function makeRunningSessionDraft(input: Readonly<{
  id: string;
  rootId: string;
  slotId: string;
  slotRootId: string;
  planId: string;
  kind: RunningSessionKind;
  weekday: (typeof RUNNING_WEEKDAYS)[number];
  ordinal: number;
  createdAtMs: number;
}>): RunningPlanSession {
  const contextual = input.kind === "long_run" ? { finish: "easy_throughout" as const }
    : input.kind === "progression" ? {
      stages: 2,
      startTarget: { rpe: 4 },
      finishTarget: { rpe: 7 },
    }
    : input.kind === "tempo" ? { format: "continuous" as const, work: { durationMs: 60_000 } }
    : input.kind === "intervals" ? { repetitions: 1, work: { durationMs: 60_000 }, recovery: { durationMs: 60_000 } }
    : input.kind === "hills" ? { repetitions: 1, work: { durationMs: 60_000 }, returnRecovery: { durationMs: 60_000 } }
    : input.kind === "fartlek" ? { format: "structured" as const, repetitions: 1, work: { durationMs: 60_000 }, recovery: { durationMs: 60_000 } }
    : {};
  const session = parseRunningSessionRevision({
    version: 1 as const,
    id: input.id,
    rootId: input.rootId,
    planId: input.planId,
    sessionKind: input.kind,
    revision: 1,
    createdAtMs: input.createdAtMs,
    phases: [{ ordinal: 0, kind: "work" as const, steps: [{ ordinal: 0, kind: "duration" as const, durationMs: 60_000 }] }],
    contextual,
  });
  return { slot: { id: input.slotId, rootId: input.slotRootId, weekday: input.weekday, revision: 1, ordinal: input.ordinal }, session };
}

export function addRunningSessionDraft(draft: RunningPlanDraft, entry: RunningPlanSession): RunningPlanDraft {
  return { ...draft, sessions: [...draft.sessions, entry] };
}

export function updateRunningSessionDraft(draft: RunningPlanDraft, entry: RunningPlanSession): RunningPlanDraft {
  return { ...draft, sessions: draft.sessions.map((current) => current.slot.rootId === entry.slot.rootId ? entry : current) };
}

export function deleteRunningSessionDraft(draft: RunningPlanDraft, slotRootId: string): RunningPlanDraft {
  return { ...draft, sessions: draft.sessions.filter((entry) => entry.slot.rootId !== slotRootId) };
}

export function reorderRunningSessionDraft(draft: RunningPlanDraft, slotRootIds: readonly string[]): RunningPlanDraft {
  const position = new Map(slotRootIds.map((id, index) => [id, index]));
  if (position.size !== draft.sessions.length || draft.sessions.some((entry) => !position.has(entry.slot.rootId))) throw new Error("running_session_reorder_invalid");
  return {
    ...draft,
    sessions: draft.sessions.map((entry) => ({ ...entry, slot: { ...entry.slot, ordinal: position.get(entry.slot.rootId)! } }))
      .sort((left, right) => left.slot.ordinal - right.slot.ordinal),
  };
}

export function isRunningSessionKind(value: string): value is RunningSessionKind {
  return (RUNNING_SESSION_KINDS as readonly string[]).includes(value);
}

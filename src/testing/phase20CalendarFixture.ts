import type { CalendarReadPort, CalendarRange } from "../ui/calendar/calendarPorts";
import { parseLocalDate } from "../domains/scheduling";
import type { PlannedStrengthOccurrenceDetail, SessionDetail } from "../domains/workout";
import type { RunningPlanAggregate } from "../domains/running/contracts";
import type { HistoryCorrectionEditorState } from "../domains/history";

export const PHASE20_CALENDAR_FIXTURE_ID = "v12-calendar-isolated-facts-v1";
const HASH = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;

export function phase20CalendarFixtureRequestFromNativeContract(input: Readonly<{
  packageName: unknown;
  buildProfile: unknown;
  nativeContractsEnabled: unknown;
  suite: unknown;
  fixtureId: unknown;
  nonce: unknown;
  requirementsSha256: unknown;
}>): boolean {
  return input.packageName === "com.fchoo.gymtracker.devtest"
    && input.buildProfile === "development-test"
    && input.nativeContractsEnabled === true
    && input.suite === "v1.2-acceptance"
    && input.fixtureId === PHASE20_CALENDAR_FIXTURE_ID
    && typeof input.nonce === "string" && NONCE.test(input.nonce)
    && typeof input.requirementsSha256 === "string" && HASH.test(input.requirementsSha256);
}
const OCTOBER_15 = parseLocalDate("2026-10-15");
const OCTOBER_22 = parseLocalDate("2026-10-22");
const OCTOBER_29 = parseLocalDate("2026-10-29");

const events = Object.freeze([
  Object.freeze({
    id: "v12-cal-strength-complete", source: "strength" as const, sport: "strength" as const,
    status: "completed" as const, title: "Full body progression", displaySummary: "3 working sets completed",
    sourceLabel: "Strength", localDate: OCTOBER_15, timeZone: "Asia/Singapore", scheduleId: "v12-strength-schedule",
    scheduleVersionId: "v12-strength-version", planId: "v12-strength-plan", slotId: null, revision: 1, state: "completed",
    destination: Object.freeze({ kind: "session" as const, sessionId: "v12-strength-complete" }),
  }),
  Object.freeze({
    id: "v12-cal-strength-partial", source: "strength" as const, sport: "strength" as const,
    status: "partial" as const, title: "Upper body strength", displaySummary: "2 of 4 working sets completed",
    sourceLabel: "Strength", localDate: OCTOBER_15, timeZone: "Asia/Singapore", scheduleId: "v12-strength-schedule",
    scheduleVersionId: "v12-strength-version", planId: "v12-strength-plan", slotId: null, revision: 2, state: "partial",
    destination: Object.freeze({ kind: "session" as const, sessionId: "v12-strength-partial" }),
  }),
  Object.freeze({
    id: "v12-cal-strength-planned", source: "strength" as const, sport: "strength" as const,
    status: "planned" as const, title: "Lower body plan", displaySummary: "4 working sets planned",
    sourceLabel: "Strength", localDate: OCTOBER_22, timeZone: "Asia/Singapore", scheduleId: "v12-strength-schedule",
    scheduleVersionId: "v12-strength-version", planId: "v12-strength-plan", slotId: null, revision: 1, state: "planned",
    destination: Object.freeze({ kind: "occurrence" as const, occurrenceId: "v12-strength-occurrence" }),
  }),
  Object.freeze({
    id: "v12-cal-running-planned", source: "running" as const, sport: "running" as const,
    status: "planned" as const, title: "Tempo progression", displaySummary: "Tempo · 35 min",
    sourceLabel: "Running plan", localDate: OCTOBER_22, timeZone: "Asia/Singapore", scheduleId: "v12-running-schedule",
    scheduleVersionId: "v12-running-version", planId: "v12-running-plan", slotId: null, revision: 1, state: "planned",
    destination: Object.freeze({ kind: "plan" as const, planId: "v12-running-plan", sessionId: "v12-running-session" }),
  }),
  Object.freeze({
    id: "v12-cal-running-imported", source: "imported_activity" as const, sport: "running" as const,
    status: "imported" as const, title: "Outdoor run", displaySummary: "5.00 km · 28:30",
    sourceLabel: "Garmin", localDate: OCTOBER_29, timeZone: "Asia/Singapore", scheduleId: null,
    scheduleVersionId: null, planId: null, slotId: null, revision: 1, state: "imported",
    sourceIdentity: Object.freeze({ sourceKind: "garmin_connect_account" as const, accountNamespace: "v12-isolated", externalActivityId: "v12-outdoor-1" }),
    destination: Object.freeze({ kind: "activity" as const, activityId: "v12-garmin-outdoor" }),
  }),
]);

const range = Object.freeze({ events, days: Object.freeze([]) }) as CalendarRange;

export const phase20CalendarFixtureReadPort: CalendarReadPort = Object.freeze({
  loadCalendarRange: async ({ startLocalDate, endLocalDateExclusive }) => Object.freeze({
    events: Object.freeze(range.events.filter(({ localDate }) => localDate >= startLocalDate && localDate < endLocalDateExclusive)),
    days: Object.freeze([]),
  }) as CalendarRange,
  loadPlannedStrengthOccurrence: async () => null,
});

const sessionDetail = Object.freeze({
  id: "v12-strength-complete", status: "completed", statusLabel: "Complete", sourceLabel: "Isolated native fixture",
  planName: "Full body progression", dayName: "Full body day", localDate: OCTOBER_15, timezone: "Asia/Singapore",
  startedAtMs: 1, endedAtMs: 60_001, durationMs: 60_000, revision: 1, modifiedFromPlan: false,
  exerciseProgress: { completed: 1, planned: 1, percent: 100 }, workingSetProgress: { completed: 1, planned: 2, percent: 50 },
  exercises: [{ id: "v12-exercise", exerciseId: "bench-press", name: "Bench press", metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 }, metricProfile: "load_reps", ordinal: 0, status: "completed", revision: 1, effort: null, topWorkingSet: "50 kg × 5", totalWorkingReps: 5, warmups: [], workingSets: [
    { id: "v12-set-complete", kind: "working", ordinal: 0, status: "completed", metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 }, target: { profile: "load_reps", version: 1, loadGrams: 50_000, minReps: 5, maxReps: 5, incrementGrams: 2_500, perSide: false }, observation: { profile: "load_reps", version: 1, loadGrams: 50_000, reps: 5, source: "manual" }, value: "50 kg × 5" },
    { id: "v12-set-planned", kind: "working", ordinal: 1, status: "planned", metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 }, target: { profile: "load_reps", version: 1, loadGrams: 50_000, minReps: 5, maxReps: 5, incrementGrams: 2_500, perSide: false }, observation: null, value: "50 kg × 5" },
  ] }], nonLoadOutcomes: [], recommendations: [], recommendationStatus: "none", resumable: false, readOnly: true,
}) as unknown as SessionDetail;

export function phase20CalendarSessionDetail(id: string): SessionDetail | null {
  if (id === "v12-strength-complete") return sessionDetail;
  if (id === "v12-strength-partial") return Object.freeze({ ...sessionDetail, id, status: "partial", statusLabel: "Partial", resumable: true });
  return null;
}

const plannedOccurrence = Object.freeze({
  occurrenceId: "v12-strength-occurrence", planId: "v12-strength-plan", planName: "Full body progression",
  planDayId: "v12-strength-day", dayName: "Lower body plan", scheduleId: "v12-strength-schedule", scheduleVersionId: "v12-strength-version",
  localDate: OCTOBER_22, timezone: "Asia/Singapore", sourceRevisions: Object.freeze({ plan: 1, day: 1, schedule: 1, opportunity: 1 }),
  exercises: Object.freeze([Object.freeze({ id: "v12-planned-exercise", exerciseId: "squat", exerciseName: "Squat", ordinal: 0,
    targets: Object.freeze([Object.freeze({ id: "v12-target", ordinal: 0, targetJson: JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 60_000, minReps: 5, maxReps: 5, incrementGrams: 2_500, perSide: false }), unitJson: "{}", previousObservationJson: null })]) })]),
}) as PlannedStrengthOccurrenceDetail;

export function phase20CalendarPlannedOccurrence(id: string): PlannedStrengthOccurrenceDetail | null {
  return id === plannedOccurrence.occurrenceId ? plannedOccurrence : null;
}

const runningPlan = Object.freeze({
  version: 1, id: "v12-running-plan", name: "Tempo progression", revision: 1, active: true, lifecycle: "active", createdAtMs: 1,
  goal: { version: 1, id: "v12-running-goal", planId: "v12-running-plan", revision: 1, goalDistanceMeters: 5_000, targetDurationMs: 1_800_000, trainingDays: ["Thursday"], createdAtMs: 1 },
  sessions: [{ slot: { id: "v12-running-slot", rootId: "v12-running-slot", weekday: "Thursday", revision: 1, ordinal: 0 },
    session: { version: 1, id: "v12-running-session", rootId: "v12-running-session", planId: "v12-running-plan", sessionKind: "tempo", revision: 1, createdAtMs: 1,
      phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "duration", durationMs: 2_100_000 }] }], contextual: { format: "continuous", work: { durationMs: 2_100_000 } } } }],
}) as RunningPlanAggregate;

export function phase20CalendarRunningPlan(id: string): RunningPlanAggregate | null {
  return id === runningPlan.id ? runningPlan : null;
}

const correctionState = Object.freeze({
  effectiveRevision: 8,
  snapshot: { version: 1, session: { id: "v12-strength-complete", source: "manual", status: "completed", planId: null,
    planDayId: null, planName: "Full body progression", dayName: "Full body day", localDate: OCTOBER_15,
    timezone: "Asia/Singapore", startedAtMs: 1, completedAtMs: 60_001, ownerNote: null }, exercises: [{ id: "v12-exercise",
    exerciseId: "bench-press", name: "Bench press", ordinal: 0, status: "completed", metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 }, effort: "on_target",
    sets: [{ id: "v12-set-complete", kind: "working", ordinal: 0, status: "completed", target: { version: 1, profile: "load_reps", loadGrams: 50_000, minReps: 5, maxReps: 5, incrementGrams: 2_500, perSide: false }, observation: { version: 1, profile: "load_reps", loadGrams: 50_000, reps: 5, source: "manual" }, completedAtMs: 60_001 }] }] },
  auditEvents: [{ id: "v12-audit", effectiveRevision: 8, eventType: "correction", fieldIdentity: "session.ownerNote", before: null, after: "Isolated correction", occurredAtMs: 60_002 }],
}) as unknown as HistoryCorrectionEditorState;

export function phase20CalendarCorrectionState(id: string): HistoryCorrectionEditorState | null {
  return id === "v12-strength-complete" ? correctionState : null;
}

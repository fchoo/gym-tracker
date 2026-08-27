import {
  useMemo,
} from "react";

import {
  activateOwnedPlanSchedule,
  advanceRotation,
  changeScheduleTimeZone,
  completeScheduledOpportunity,
  consumeScheduleDateOverride,
  createScheduleVersionPreviewToken,
  markWeekdayOpportunityMissed,
  recordTrainAnyway,
  repeatRotation,
  saveScheduleVersion,
  setDateOverride,
  skipOpportunity,
} from "../domains/scheduling/scheduleCommands";
import type {
  ActivateOwnedPlanScheduleInput,
  ActiveSchedulePairExpectation,
  ScheduleVersionInput,
  TargetScheduleExpectation,
} from "../domains/scheduling/scheduleCommands";
import type {
  Weekday,
} from "../domains/scheduling/localDate";
import {
  addLocalDays,
  parseLocalDate,
  WEEKDAYS,
} from "../domains/scheduling/localDate";
import type {
  MetricIdentity,
  MetricProfile,
  MetricTarget,
} from "../domains/metrics";
import {
  parseMetricTargetJson,
} from "../domains/metrics";
import type {
  ActivatedPlanDay,
} from "../domains/plans";
import type {
  TodayExercise,
  TodayView,
} from "../domains/workout";
import {
  formatMetricDuration,
} from "../domains/metrics/aggregates";
import {
  FOLLOW_DEVICE_TIMEZONE_LABEL,
  KEEP_CURRENT_TIMEZONE_LABEL,
  type ScheduleDateOverrideV1,
  type ScheduleOverrideSelection,
  type ScheduleTimeZoneChoice,
} from "../domains/scheduling/scheduleState";
import {
  localDateAtInstant,
  parseStoredTimeZone,
} from "../domains/scheduling/timeZone";
import type {
  SqliteKernel,
} from "../platform/sqlite";
import type {
  OwnedPlanRuntimePort,
} from "./ownedPlanRuntime";
import {
  createScheduleRepository,
  type ScheduleVersionSnapshot,
} from "../platform/sqlite/repositories/scheduleRepository";

export type ScheduleEditorDay = Readonly<{
  id: string;
  name: string;
  ordinal: number;
}>;

export type ScheduleEditorWeekdayBinding = Readonly<{
  ordinal: number;
  weekIndex: number;
  weekday: Weekday;
  planDayId: string;
}>;

export type ScheduleEditorRotationBinding = Readonly<{
  ordinal: number;
  planDayId: string;
}>;

export type ScheduleEditorVersion = Readonly<{
  id: string;
  versionNumber: number;
  effectiveLocalDate: string;
  mode: "weekday" | "rotation";
  timeZone: string;
  rotationPointer: number | null;
  bindings: readonly (
    | ScheduleEditorWeekdayBinding
    | ScheduleEditorRotationBinding
  )[];
}>;

export type ScheduleEditorSnapshot = Readonly<{
  planId: string;
  planName: string;
  planRevision: number;
  graphStatus: "missing_valid_target" | "valid";
  missingRequirement: string | null;
  days: readonly ScheduleEditorDay[];
  todayLocalDate: string;
  deviceTimeZone: string;
  scheduleId: string | null;
  scheduleRevision: number | null;
  scheduleLifecycle: "active" | "inactive" | null;
  activeSchedule: ActiveSchedulePairExpectation;
  current: ScheduleEditorVersion | null;
  dateOverride?: ScheduleDateOverrideV1 | null;
}>;

export type ScheduleSaveDraft = Readonly<{
  planId: string;
  scheduleId: string | null;
  expectedPlanRevision: number;
  expectedScheduleRevision: number | null;
  expectedActivePair: ActiveSchedulePairExpectation;
  before: ScheduleEditorVersion | null;
  todayLocalDate: string;
  next: ScheduleVersionInput;
}>;

export type ScheduleRuntimeSource = Readonly<{
  actOnToday(action: ScheduleTodayAction): Promise<ScheduleTodayRead>;
  chooseTimeZone(
    choice: ScheduleTimeZoneChoice,
    detectedDeviceTimeZone?: string,
  ): Promise<ScheduleTodayRead>;
  completeScheduledSession(
    sessionId: string,
  ): Promise<ScheduleTodayRead | null>;
  consumeDateOverride(
    localDate: string,
  ): Promise<ScheduleEditorSnapshot>;
  loadSchedule(planId: string): Promise<ScheduleEditorSnapshot | null>;
  loadToday(instantMs: number): Promise<ScheduleTodayRead | null>;
  markWeekdayMissed(localDate: string): Promise<ScheduleTodayRead>;
  recordTrainAnyway(input: Readonly<{
    workout:
      | Readonly<{ kind: "plan_day"; planDayId: string }>
      | Readonly<{ kind: "rest_day" | "empty"; planDayId: null }>;
    advanceRotation: boolean;
  }>): Promise<ScheduleTodayRead | null>;
  saveSchedule(input: ScheduleSaveDraft): Promise<ScheduleEditorSnapshot>;
  setDateOverride(input: Readonly<{
    localDate: string;
    replacement: ScheduleOverrideSelection;
    confirmation?: "replace_pending_override";
  }>): Promise<ScheduleEditorSnapshot>;
  refresh?(): Promise<void>;
}>;

export type ScheduleRuntimeAdapter = Readonly<{
  actOnToday(action: ScheduleTodayAction): Promise<ScheduleTodayRead>;
  chooseTimeZone(
    choice: ScheduleTimeZoneChoice,
    detectedDeviceTimeZone?: string,
  ): Promise<ScheduleTodayRead>;
  completeScheduledSession(
    sessionId: string,
  ): Promise<ScheduleTodayRead | null>;
  consumeDateOverride(
    localDate: string,
  ): Promise<ScheduleEditorSnapshot>;
  loadSchedule(planId: string): Promise<ScheduleEditorSnapshot | null>;
  loadToday(instantMs: number): Promise<ScheduleTodayRead | null>;
  markWeekdayMissed(localDate: string): Promise<ScheduleTodayRead>;
  recordTrainAnyway(input: Readonly<{
    workout:
      | Readonly<{ kind: "plan_day"; planDayId: string }>
      | Readonly<{ kind: "rest_day" | "empty"; planDayId: null }>;
    advanceRotation: boolean;
  }>): Promise<ScheduleTodayRead | null>;
  saveSchedule(input: ScheduleSaveDraft): Promise<ScheduleEditorSnapshot>;
  setDateOverride(input: Readonly<{
    localDate: string;
    replacement: ScheduleOverrideSelection;
    confirmation?: "replace_pending_override";
  }>): Promise<ScheduleEditorSnapshot>;
}>;

export type ScheduleTodayAction = "repeat" | "skip" | "advance";

export type ScheduleTodayPresentation = Readonly<{
  localDate: string;
  mode: "weekday" | "rotation";
  currentDayName: string | null;
  nextDayName: string | null;
  opportunityState:
    | "pending"
    | "consumed"
    | "rest_day";
  overrideState: "pending" | "consumed" | null;
  missedLabel: "Planned but not completed" | null;
  timezonePrompt: Readonly<{
    storedTimeZone: string;
    deviceTimeZone: string;
  }> | null;
}>;

export type ScheduleTodayRead = Readonly<{
  scheduleId: string;
  scheduleRevision: number;
  planId: string;
  planRevision: number;
  localDate: string;
  timeZone: string;
  mode: "weekday" | "rotation";
  planDays: readonly ActivatedPlanDay[];
  scheduleToday: ScheduleTodayPresentation;
  view: TodayView;
}>;

type ScheduleRuntimeDependencies = Readonly<{
  now(): Date;
  nowMs(): number;
  randomUUID(): string;
  sha256(value: string): Promise<string>;
}>;

function localContext(
  now: Date,
): Readonly<{ localDate: string; timeZone: string }> {
  const localDate = [
    now.getFullYear().toString().padStart(4, "0"),
    (now.getMonth() + 1).toString().padStart(2, "0"),
    now.getDate().toString().padStart(2, "0"),
  ].join("-");
  return {
    localDate,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

function weekday(value: string): Weekday {
  if (WEEKDAYS.includes(value as Weekday)) {
    return value as Weekday;
  }
  throw new Error("schedule_weekday_invalid");
}

function editorVersion(
  version: ScheduleVersionSnapshot,
): ScheduleEditorVersion {
  return Object.freeze({
    id: version.id,
    versionNumber: version.versionNumber,
    effectiveLocalDate: version.effectiveLocalDate,
    mode: version.mode,
    timeZone: version.timeZone,
    rotationPointer: version.rotationPointer,
    bindings: Object.freeze(version.bindings.map((binding) => (
      "weekday" in binding
        ? Object.freeze({
            ordinal: binding.ordinal,
            weekIndex: binding.weekIndex,
            weekday: weekday(binding.weekday),
            planDayId: binding.planDayId,
          })
        : Object.freeze({
            ordinal: binding.ordinal,
            planDayId: binding.planDayId,
          })
    ))),
  });
}

function sameEditorVersion(
  left: ScheduleEditorVersion | null,
  right: ScheduleEditorVersion | null,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameSaveDraft(
  left: ScheduleSaveDraft,
  right: ScheduleSaveDraft,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

type ActiveScheduleRow = Readonly<{
  schedule_id: string;
  schedule_revision: number;
  plan_id: string;
  plan_revision: number;
  plan_name: string;
  estimate_minutes: number;
}>;

type TodayExerciseRow = Readonly<{
  exercise_id: string;
  exercise_name: string;
  metric_profile: MetricProfile;
  metric_contract_version: number;
  exercise_metric_generation: number;
  target_json: string;
  recommendation_count: number;
}>;

function identity(row: TodayExerciseRow): MetricIdentity {
  return Object.freeze({
    profile: row.metric_profile,
    contractVersion: row.metric_contract_version,
    exerciseMetricGeneration: row.exercise_metric_generation,
  });
}

function formatTarget(target: MetricTarget): string {
  switch (target.profile) {
    case "load_reps":
      return `${target.loadGrams / 1_000} kg × ${target.maxReps}`;
    case "bodyweight_reps":
      return `${target.maxReps} reps · ${target.variationId}`;
    case "added_load_reps":
      return `+${target.addedLoadGrams / 1_000} kg × ${target.maxReps}`;
    case "assisted_reps":
      return `${target.assistanceGrams / 1_000} kg assist × ${target.maxReps}`;
    case "timed_hold":
      return target.version === 1
        ? `${target.durationSeconds} sec`
        : formatMetricDuration(target.durationMs);
    case "fixed_distance":
      return `${target.plannedDistanceMeters} m`;
    case "fixed_time":
      return formatMetricDuration(target.plannedDurationMs);
    case "intervals":
      return `${target.plannedRounds} rounds · ${
        formatMetricDuration(target.workIntervalMs)
      } work`;
    case "unscored":
      return "Completion";
  }
}

async function readTodayExercises(
  kernel: SqliteKernel,
  planDayId: string,
): Promise<readonly TodayExercise[]> {
  const rows = await kernel.queryAll<TodayExerciseRow>(
    `SELECT occurrence.exercise_id,
            exercise.name AS exercise_name,
            occurrence.metric_profile,
            occurrence.metric_contract_version,
            occurrence.exercise_metric_generation,
            MIN(target.target_json) AS target_json,
            COUNT(recommendation.id) AS recommendation_count
     FROM owned_plan_day_exercises occurrence
     JOIN exercises exercise ON exercise.id = occurrence.exercise_id
     JOIN owned_plan_working_set_targets target
       ON target.plan_day_exercise_id = occurrence.id
     LEFT JOIN owned_progression_recommendations recommendation
       ON recommendation.owned_plan_working_set_target_id = target.id
      AND recommendation.status = 'pending'
     WHERE occurrence.plan_day_id = ?
     GROUP BY occurrence.id
     ORDER BY occurrence.ordinal`,
    [planDayId],
  );
  return Object.freeze(rows.map((row) => Object.freeze({
    exerciseId: row.exercise_id,
    name: row.exercise_name,
    metricProfile: row.metric_profile,
    nextTarget: formatTarget(parseMetricTargetJson(
      identity(row),
      row.target_json,
    )),
    history: null,
    recommendationStatus: row.recommendation_count > 0
      ? "pending" as const
      : "none" as const,
  })));
}

function instantWithinLocalDate(
  localDate: string,
  timeZone: string,
): number {
  const storedTimeZone = parseStoredTimeZone(timeZone);
  const center = Date.parse(`${localDate}T12:00:00Z`);
  for (let offsetHours = -24; offsetHours <= 24; offsetHours += 1) {
    const candidate = center + offsetHours * 3_600_000;
    if (localDateAtInstant(candidate, storedTimeZone) === localDate) {
      return candidate;
    }
  }
  throw new Error("schedule_local_date_instant_unavailable");
}

export function createScheduleRuntimePort(
  kernel: SqliteKernel,
  ownedPlans: OwnedPlanRuntimePort,
  dependencies: ScheduleRuntimeDependencies,
): ScheduleRuntimeAdapter {
  const repository = createScheduleRepository(kernel);
  let pendingActivation: Readonly<{
    draft: ScheduleSaveDraft;
    command: ActivateOwnedPlanScheduleInput;
  }> | null = null;

  function activeExpectation(
    active: ActiveScheduleRow | null,
  ): ActiveSchedulePairExpectation {
    return active === null
      ? Object.freeze({ kind: "none" as const })
      : Object.freeze({
          kind: "pair" as const,
          planId: active.plan_id,
          planRevision: active.plan_revision,
          scheduleId: active.schedule_id,
          scheduleRevision: active.schedule_revision,
        });
  }

  async function loadSchedule(
    planId: string,
    overrideLocalDate?: string,
  ): Promise<ScheduleEditorSnapshot | null> {
    const plan = await ownedPlans.loadPlan(planId);
    if (plan === null) {
      return null;
    }
    const context = localContext(dependencies.now());
    const schedule = plan.scheduleDefaults;
    const active = await activeSchedule();
    const timezoneState = schedule === null
      ? null
      : await repository.readTimeZoneState({ scheduleId: schedule.id });
    const dateOverride = schedule === null
      ? null
      : await repository.readDateOverride({
          scheduleId: schedule.id,
          localDate: overrideLocalDate ?? (
            timezoneState === null
              ? context.localDate
              : localDateAtInstant(
                  dependencies.nowMs(),
                  timezoneState.state.timeZone,
                )
          ),
        });
    const todayLocalDate = timezoneState === null
      ? context.localDate
      : localDateAtInstant(
          dependencies.nowMs(),
          timezoneState.state.timeZone,
        );
    return Object.freeze({
      planId: plan.id,
      planName: plan.name,
      planRevision: plan.revision,
      graphStatus: plan.graphStatus,
      missingRequirement: plan.missingRequirement,
      days: Object.freeze(plan.days.map(({ id, name, ordinal }) =>
        Object.freeze({ id, name, ordinal })
      )),
      todayLocalDate,
      deviceTimeZone: context.timeZone,
      scheduleId: schedule?.id ?? null,
      scheduleRevision: timezoneState?.scheduleRevision
        ?? schedule?.revision
        ?? null,
      scheduleLifecycle: schedule?.lifecycle ?? null,
      activeSchedule: activeExpectation(active),
      current: timezoneState === null
        ? null
        : editorVersion(timezoneState.version),
      dateOverride,
    });
  }

  async function activeSchedule(): Promise<ActiveScheduleRow | null> {
    const rows = await kernel.queryAll<ActiveScheduleRow>(
      `SELECT schedule.id AS schedule_id,
              schedule.revision AS schedule_revision,
              plan.id AS plan_id,
              plan.revision AS plan_revision,
              plan.name AS plan_name,
              plan.estimate_minutes
       FROM owned_plan_schedules schedule
       JOIN plans plan ON plan.id = schedule.plan_id
       WHERE schedule.lifecycle = 'active'
         AND plan.is_active = 1
       ORDER BY schedule.id`,
    );
    if (rows.length > 1) {
      throw new Error("schedule_active_state_invalid");
    }
    return rows[0] ?? null;
  }

  async function planDays(planId: string): Promise<readonly ActivatedPlanDay[]> {
    return Object.freeze(await kernel.queryAll<ActivatedPlanDay>(
      `SELECT id, name, ordinal
       FROM plan_days
       WHERE plan_id = ?
       ORDER BY ordinal`,
      [planId],
    ));
  }

  async function missedLabel(scheduleId: string) {
    const [row] = await kernel.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM owned_plan_schedule_opportunities
       WHERE schedule_id = ?
         AND outcome = 'planned_not_completed'`,
      [scheduleId],
    );
    return (row?.count ?? 0) > 0
      ? "Planned but not completed" as const
      : null;
  }

  function dayName(
    days: readonly ActivatedPlanDay[],
    planDayId: string | null | undefined,
  ): string | null {
    if (planDayId === null || planDayId === undefined) {
      return null;
    }
    return days.find(({ id }) => id === planDayId)?.name ?? planDayId;
  }

  async function timezonePrompt(
    scheduleId: string,
    storedTimeZone: string,
    deviceTimeZone: string,
  ): Promise<ScheduleTodayPresentation["timezonePrompt"]> {
    const current = await repository.readTimeZoneState({ scheduleId });
    if (
      current === null
      || storedTimeZone === deviceTimeZone
      || current.state.lastDeviceTimeZoneDecision?.detectedDeviceTimeZone
        === deviceTimeZone
    ) {
      return null;
    }
    return Object.freeze({
      storedTimeZone,
      deviceTimeZone,
    });
  }

  async function findNextOpportunity(
    scheduleId: string,
    localDate: string,
    timeZone: string,
  ) {
    for (let offset = 1; offset <= 35; offset += 1) {
      const candidateDate = addLocalDays(parseLocalDate(localDate), offset);
      const candidate = await repository.readEffectiveOpportunity({
        scheduleId,
        instantMs: instantWithinLocalDate(candidateDate, timeZone),
      });
      if (
        candidate?.opportunity !== null
        && candidate?.opportunity.state === "pending"
        && candidate.opportunity.planDayId !== null
      ) {
        return candidate;
      }
    }
    return null;
  }

  return Object.freeze({
    loadSchedule,
    async loadToday(instantMs) {
      const active = await activeSchedule();
      if (active === null) {
        return null;
      }
      const [effective, days] = await Promise.all([
        repository.readEffectiveOpportunity({
          scheduleId: active.schedule_id,
          instantMs,
        }),
        planDays(active.plan_id),
      ]);
      if (effective === null) {
        return null;
      }
      const dayNames = new Map(days.map(({ id, name }) => [id, name]));
      const currentOpportunity = effective.opportunity;
      const deviceTimeZone = localContext(dependencies.now()).timeZone;
      const currentDayName = dayName(days, currentOpportunity?.planDayId);
      const rotationBindings = effective.version.bindings;
      const nextRotationDayId = effective.version.mode === "rotation"
        && rotationBindings.length > 0
        ? rotationBindings[
            ((effective.version.rotationPointer ?? 0) + 1)
              % rotationBindings.length
          ]?.planDayId
        : null;
      let view: TodayView;
      if (
        currentOpportunity !== null
        && currentOpportunity.state === "pending"
        && currentOpportunity.planDayId !== null
      ) {
        const dayId = currentOpportunity.planDayId;
        view = Object.freeze({
          state: "scheduled",
          planId: active.plan_id,
          planName: active.plan_name,
          dayId,
          dayName: dayNames.get(dayId) ?? dayId,
          estimateMinutes: active.estimate_minutes,
          exercises: await readTodayExercises(kernel, dayId),
        });
      } else {
        const next = await findNextOpportunity(
          active.schedule_id,
          effective.localDate,
          effective.timeZone,
        );
        const nextPlanDayId = next?.opportunity?.planDayId ?? null;
        if (
          next === null
          || next.opportunity === null
          || nextPlanDayId === null
        ) {
          throw new Error("schedule_next_opportunity_unavailable");
        }
        view = Object.freeze({
          state: "rest_day",
          planId: active.plan_id,
          planName: active.plan_name,
          nextDayId: nextPlanDayId,
          nextDayName:
            dayNames.get(nextPlanDayId)
            ?? nextPlanDayId,
          nextLocalDate: next.localDate,
        });
      }
      return Object.freeze({
        scheduleId: active.schedule_id,
        scheduleRevision: effective.scheduleRevision,
        planId: active.plan_id,
        planRevision: active.plan_revision,
        localDate: effective.localDate,
        timeZone: effective.timeZone,
        mode: effective.version.mode,
        planDays: days,
        scheduleToday: Object.freeze({
          localDate: effective.localDate,
          mode: effective.version.mode,
          currentDayName,
          nextDayName: effective.version.mode === "rotation"
            ? dayName(days, nextRotationDayId)
            : view.state === "rest_day"
              ? view.nextDayName
              : null,
          opportunityState: currentOpportunity === null
            ? "rest_day"
            : currentOpportunity.state,
          overrideState: effective.override?.state ?? null,
          missedLabel: await missedLabel(active.schedule_id),
          timezonePrompt: await timezonePrompt(
            active.schedule_id,
            effective.timeZone,
            deviceTimeZone,
          ),
        }),
        view,
      });
    },
    async actOnToday(action) {
      const today = await this.loadToday(dependencies.nowMs());
      if (today === null) {
        throw new Error("schedule_state_unavailable");
      }
      const context = {
        repository,
        invalidate: async () => undefined,
        sha256: dependencies.sha256,
        input: {
          requestId: `schedule-${action}:${dependencies.randomUUID()}`,
          scheduleId: today.scheduleId,
          planId: today.planId,
          expectedScheduleRevision: today.scheduleRevision,
          expectedPlanRevision: today.planRevision,
          instantMs: dependencies.nowMs(),
          occurredAtMs: dependencies.nowMs(),
        },
      };
      if (action === "repeat") {
        await repeatRotation(context);
      } else if (action === "skip") {
        await skipOpportunity(context);
      } else {
        await advanceRotation(context);
      }
      const next = await this.loadToday(dependencies.nowMs());
      if (next === null) {
        throw new Error("schedule_readback_unavailable");
      }
      return next;
    },
    async setDateOverride(input) {
      const active = await activeSchedule();
      if (active === null) {
        throw new Error("schedule_state_unavailable");
      }
      const current = await repository.readDateOverride({
        scheduleId: active.schedule_id,
        localDate: input.localDate,
      });
      await setDateOverride({
        repository,
        invalidate: async () => undefined,
        sha256: dependencies.sha256,
        input: {
          requestId: `schedule-override:${dependencies.randomUUID()}`,
          scheduleId: active.schedule_id,
          planId: active.plan_id,
          expectedScheduleRevision: active.schedule_revision,
          expectedPlanRevision: active.plan_revision,
          expectedOverrideRevision: current?.revision ?? 0,
          overrideId: current?.id
            ?? `schedule-override:${dependencies.randomUUID()}`,
          localDate: input.localDate,
          replacement: input.replacement,
          ...(input.confirmation === undefined
            ? {}
            : { confirmation: input.confirmation }),
          occurredAtMs: dependencies.nowMs(),
        },
      });
      const next = await loadSchedule(active.plan_id, input.localDate);
      if (next === null) {
        throw new Error("schedule_readback_unavailable");
      }
      return next;
    },
    async consumeDateOverride(localDate) {
      const active = await activeSchedule();
      if (active === null) {
        throw new Error("schedule_state_unavailable");
      }
      const current = await repository.readDateOverride({
        scheduleId: active.schedule_id,
        localDate,
      });
      if (current === null) {
        throw new Error("schedule_override_unavailable");
      }
      await consumeScheduleDateOverride({
        repository,
        invalidate: async () => undefined,
        sha256: dependencies.sha256,
        input: {
          requestId: `schedule-override-use:${dependencies.randomUUID()}`,
          scheduleId: active.schedule_id,
          planId: active.plan_id,
          expectedScheduleRevision: active.schedule_revision,
          expectedPlanRevision: active.plan_revision,
          expectedOverrideRevision: current.revision,
          overrideId: current.id,
          localDate,
          opportunityId: `schedule-override-opportunity:${dependencies.randomUUID()}`,
          occurredAtMs: dependencies.nowMs(),
        },
      });
      const next = await loadSchedule(active.plan_id, localDate);
      if (next === null) {
        throw new Error("schedule_readback_unavailable");
      }
      return next;
    },
    async chooseTimeZone(
      choice,
      detectedDeviceTimeZone = localContext(dependencies.now()).timeZone,
    ) {
      const today = await this.loadToday(dependencies.nowMs());
      if (today === null) {
        throw new Error("schedule_state_unavailable");
      }
      const timeZoneState = await repository.readTimeZoneState({
        scheduleId: today.scheduleId,
      });
      if (timeZoneState === null) {
        throw new Error("schedule_state_unavailable");
      }
      const effectiveLocalDate =
        choice === FOLLOW_DEVICE_TIMEZONE_LABEL
          && today.localDate <= timeZoneState.version.effectiveLocalDate
        ? addLocalDays(
            parseLocalDate(timeZoneState.version.effectiveLocalDate),
            1,
          )
        : today.localDate;
      await changeScheduleTimeZone({
        repository,
        invalidate: async () => undefined,
        sha256: dependencies.sha256,
        input: {
          requestId: `schedule-timezone:${dependencies.randomUUID()}`,
          scheduleId: today.scheduleId,
          planId: today.planId,
          expectedScheduleRevision: today.scheduleRevision,
          expectedPlanRevision: today.planRevision,
          detectedDeviceTimeZone,
          effectiveLocalDate,
          choice,
          occurredAtMs: dependencies.nowMs(),
        },
      });
      const next = await this.loadToday(dependencies.nowMs());
      if (next === null) {
        throw new Error("schedule_readback_unavailable");
      }
      return next;
    },
    async recordTrainAnyway(input) {
      const today = await this.loadToday(dependencies.nowMs());
      if (today === null || today.mode !== "rotation") {
        return today;
      }
      await recordTrainAnyway({
        repository,
        invalidate: async () => undefined,
        sha256: dependencies.sha256,
        input: {
          requestId: `schedule-train-anyway:${dependencies.randomUUID()}`,
          scheduleId: today.scheduleId,
          planId: today.planId,
          expectedScheduleRevision: today.scheduleRevision,
          expectedPlanRevision: today.planRevision,
          instantMs: dependencies.nowMs(),
          occurredAtMs: dependencies.nowMs(),
          workout: input.workout,
          advanceRotation: input.advanceRotation,
        },
      });
      return this.loadToday(dependencies.nowMs());
    },
    async markWeekdayMissed(localDate) {
      const active = await activeSchedule();
      if (active === null) {
        throw new Error("schedule_state_unavailable");
      }
      const timeZoneState = await repository.readTimeZoneState({
        scheduleId: active.schedule_id,
      });
      if (timeZoneState === null) {
        throw new Error("schedule_state_unavailable");
      }
      await markWeekdayOpportunityMissed({
        repository,
        invalidate: async () => undefined,
        sha256: dependencies.sha256,
        input: {
          requestId: `schedule-missed:${dependencies.randomUUID()}`,
          scheduleId: active.schedule_id,
          planId: active.plan_id,
          expectedScheduleRevision: active.schedule_revision,
          expectedPlanRevision: active.plan_revision,
          instantMs: instantWithinLocalDate(
            localDate,
            timeZoneState.state.timeZone,
          ),
          occurredAtMs: dependencies.nowMs(),
          observedLocalDate: localDateAtInstant(
            dependencies.nowMs(),
            timeZoneState.state.timeZone,
          ),
        },
      });
      const next = await this.loadToday(dependencies.nowMs());
      if (next === null) {
        throw new Error("schedule_readback_unavailable");
      }
      return next;
    },
    async completeScheduledSession(sessionId) {
      const [session] = await kernel.queryAll<{
        plan_id: string | null;
        plan_day_id: string | null;
        source: string;
        status: string;
        local_date: string;
        started_at_ms: number;
      }>(
        `SELECT plan_id, plan_day_id, source, status, local_date, started_at_ms
         FROM workout_sessions
         WHERE id = ?`,
        [sessionId],
      );
      if (
        session === undefined
        || session.source !== "scheduled_day"
        || session.status !== "completed"
        || session.plan_id === null
        || session.plan_day_id === null
      ) {
        return null;
      }
      const active = await activeSchedule();
      if (active === null || active.plan_id !== session.plan_id) {
        return null;
      }
      await completeScheduledOpportunity({
        repository,
        invalidate: async () => undefined,
        sha256: dependencies.sha256,
        input: {
          requestId: `schedule-complete:${sessionId}`,
          scheduleId: active.schedule_id,
          planId: active.plan_id,
          expectedScheduleRevision: active.schedule_revision,
          expectedPlanRevision: active.plan_revision,
          instantMs: session.started_at_ms,
          occurredAtMs: dependencies.nowMs(),
          sessionId,
          sessionLocalDate: session.local_date,
          planDayId: session.plan_day_id,
        },
      });
      return this.loadToday(dependencies.nowMs());
    },
    async saveSchedule(input) {
      if (pendingActivation !== null) {
        if (!sameSaveDraft(pendingActivation.draft, input)) {
          pendingActivation = null;
        } else {
          await activateOwnedPlanSchedule({
            repository,
            invalidate: async () => undefined,
            sha256: dependencies.sha256,
            input: pendingActivation.command,
          });
          const replayed = await loadSchedule(input.planId);
          if (replayed === null) {
            throw new Error("schedule_readback_unavailable");
          }
          pendingActivation = null;
          return replayed;
        }
      }
      const current = await loadSchedule(input.planId);
      if (
        current === null
        || current.scheduleId !== input.scheduleId
        || current.planRevision !== input.expectedPlanRevision
        || current.scheduleRevision !== input.expectedScheduleRevision
        || JSON.stringify(current.activeSchedule)
          !== JSON.stringify(input.expectedActivePair)
        || !sameEditorVersion(current.current, input.before)
      ) {
        throw new Error("schedule_preview_conflict");
      }
      if (
        current.scheduleLifecycle !== "active"
        || input.scheduleId === null
        || input.expectedScheduleRevision === null
      ) {
        const scheduleId = input.scheduleId
          ?? `owned-schedule:${dependencies.randomUUID()}`;
        const activationBefore = input.scheduleId === null
          ? null
          : (await repository.readTimeZoneState({
              scheduleId: input.scheduleId,
            }))?.version ?? null;
        if (input.scheduleId !== null && activationBefore === null) {
          throw new Error("schedule_state_unavailable");
        }
        const targetSchedule: TargetScheduleExpectation =
          input.scheduleId === null || input.expectedScheduleRevision === null
            ? Object.freeze({
                kind: "absent" as const,
                scheduleId,
              })
            : Object.freeze({
                kind: "inactive" as const,
                scheduleId,
                scheduleRevision: input.expectedScheduleRevision,
                before: activationBefore!,
              });
        const preview = {
          planId: input.planId,
          expectedPlanRevision: input.expectedPlanRevision,
          expectedActivePair: input.expectedActivePair,
          targetSchedule,
          after: input.next,
        };
        const confirmationToken = await createScheduleVersionPreviewToken({
          sha256: dependencies.sha256,
          preview,
        });
        const command = Object.freeze({
          requestId: `schedule-activate:${dependencies.randomUUID()}`,
          planId: input.planId,
          expectedPlanRevision: input.expectedPlanRevision,
          expectedActivePair: input.expectedActivePair,
          targetSchedule,
          todayLocalDate: input.todayLocalDate,
          activatedAtMs: dependencies.nowMs(),
          next: input.next,
          confirmationToken,
        });
        pendingActivation = Object.freeze({
          draft: input,
          command,
        });
        await activateOwnedPlanSchedule({
          repository,
          invalidate: async () => undefined,
          sha256: dependencies.sha256,
          input: command,
        });
        const activated = await loadSchedule(input.planId);
        if (activated === null) {
          throw new Error("schedule_readback_unavailable");
        }
        pendingActivation = null;
        return activated;
      }
      const timeZoneState = await repository.readTimeZoneState({
        scheduleId: input.scheduleId,
      });
      if (timeZoneState === null) {
        throw new Error("schedule_state_unavailable");
      }
      const preview = {
        scheduleId: input.scheduleId,
        planId: input.planId,
        expectedScheduleRevision: input.expectedScheduleRevision,
        expectedPlanRevision: input.expectedPlanRevision,
        before: timeZoneState.version,
        after: input.next,
      };
      const confirmationToken = await createScheduleVersionPreviewToken({
        sha256: dependencies.sha256,
        preview,
      });
      await saveScheduleVersion({
        repository,
        invalidate: async () => undefined,
        sha256: dependencies.sha256,
        input: {
          requestId: `schedule-save:${dependencies.randomUUID()}`,
          scheduleId: input.scheduleId,
          planId: input.planId,
          expectedScheduleRevision: input.expectedScheduleRevision,
          expectedPlanRevision: input.expectedPlanRevision,
          todayLocalDate: input.todayLocalDate,
          savedAtMs: dependencies.nowMs(),
          before: timeZoneState.version,
          next: input.next,
          confirmationToken,
        },
      });
      const saved = await loadSchedule(input.planId);
      if (saved === null) {
        throw new Error("schedule_readback_unavailable");
      }
      return saved;
    },
  });
}

export function createScheduleRuntimeAdapter(
  runtime: ScheduleRuntimeSource,
): ScheduleRuntimeAdapter {
  async function refreshed<Value>(
    action: () => Promise<Value>,
  ): Promise<Value> {
    const result = await action();
    await runtime.refresh?.();
    return result;
  }

  return Object.freeze({
    actOnToday: (action) => refreshed(() => runtime.actOnToday(action)),
    chooseTimeZone: (choice, detectedDeviceTimeZone) =>
      refreshed(() =>
        runtime.chooseTimeZone(choice, detectedDeviceTimeZone)
      ),
    completeScheduledSession: (sessionId) =>
      refreshed(() => runtime.completeScheduledSession(sessionId)),
    consumeDateOverride: (localDate) =>
      refreshed(() => runtime.consumeDateOverride(localDate)),
    loadSchedule: (planId) => runtime.loadSchedule(planId),
    loadToday: (instantMs) => runtime.loadToday(instantMs),
    markWeekdayMissed: (localDate) =>
      refreshed(() => runtime.markWeekdayMissed(localDate)),
    recordTrainAnyway: (input) =>
      refreshed(() => runtime.recordTrainAnyway(input)),
    async saveSchedule(input) {
      const saved = await runtime.saveSchedule(input);
      await runtime.refresh?.();
      return saved;
    },
    setDateOverride: (input) =>
      refreshed(() => runtime.setDateOverride(input)),
  });
}

export {
  FOLLOW_DEVICE_TIMEZONE_LABEL,
  KEEP_CURRENT_TIMEZONE_LABEL,
};

export function useScheduleRuntime(
  runtime: ScheduleRuntimeSource,
): ScheduleRuntimeAdapter {
  return useMemo(
    () => createScheduleRuntimeAdapter(runtime),
    [runtime],
  );
}

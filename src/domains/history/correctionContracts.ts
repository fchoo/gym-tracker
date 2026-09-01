import {
  parseMetricIdentity,
  parseMetricObservation,
  parseMetricTarget,
  type MetricIdentity,
  type MetricObservation,
  type MetricTarget,
} from "../metrics";
import {
  parseHistoryLocalDate,
  type HistorySessionStatus,
  type HistorySource,
} from "./contracts";
import {
  parseStoredTimeZone,
} from "../scheduling";
import type {
  ExerciseEffort,
} from "../progression";

type CorrectionSetKind = "warmup" | "working";
type CorrectionSetStatus = "planned" | "draft" | "completed" | "skipped";
type CorrectionExerciseStatus = "planned" | "active" | "completed" | "skipped";

export type HistoryCorrectionSnapshot = Readonly<{
  version: 1;
  session: Readonly<{
    id: string;
    source: HistorySource;
    status: Extract<HistorySessionStatus, "completed" | "partial">;
    planId: string | null;
    planDayId: string | null;
    planName: string | null;
    dayName: string | null;
    localDate: string;
    timezone: string;
    startedAtMs: number;
    completedAtMs: number | null;
    ownerNote: string | null;
  }>;
  exercises: readonly Readonly<{
    id: string;
    exerciseId: string;
    name: string;
    ordinal: number;
    status: CorrectionExerciseStatus;
    metricIdentity: MetricIdentity;
    effort: ExerciseEffort | null;
    sets: readonly Readonly<{
      id: string;
      kind: CorrectionSetKind;
      ordinal: number;
      status: CorrectionSetStatus;
      target: MetricTarget;
      observation: MetricObservation | undefined;
      completedAtMs: number | null;
      sourcePlanWorkingSetTargetId?: string;
      sourceOwnedPlanWorkingSetTargetId?: string;
    }>[];
  }>[];
}>;

export type HistoryCorrectionAuditDelta = Readonly<{
  fieldIdentity: string;
  before: unknown;
  after: unknown;
}>;

export type PreparedHistoryCorrection = Readonly<{
  next: HistoryCorrectionSnapshot;
  auditDeltas: readonly HistoryCorrectionAuditDelta[];
}>;

export class HistoryCorrectionInputError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;

  constructor(readonly code: string) {
    super(code);
    this.name = "HistoryCorrectionInputError";
  }
}

function isSafeNonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HistoryCorrectionInputError(code);
  }
  return value;
}

function stableJson(value: unknown): string {
  if (value === undefined) {
    return "null";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${stableJson(record[key])}`
  ).join(",")}}`;
}

function normalizedValue(value: unknown): unknown {
  return JSON.parse(stableJson(value)) as unknown;
}

function isEffort(value: unknown): value is ExerciseEffort | null {
  return value === null
    || value === "easy"
    || value === "on_target"
    || value === "hard"
    || value === "failed";
}

function isSessionStatus(value: unknown): value is "completed" | "partial" {
  return value === "completed" || value === "partial";
}

function isSource(value: unknown): value is HistorySource {
  return value === "scheduled_day"
    || value === "alternate_day"
    || value === "rest_day"
    || value === "empty"
    || value === "manual";
}

function isSetKind(value: unknown): value is CorrectionSetKind {
  return value === "warmup" || value === "working";
}

function isSetStatus(value: unknown): value is CorrectionSetStatus {
  return value === "planned"
    || value === "draft"
    || value === "completed"
    || value === "skipped";
}

function isExerciseStatus(value: unknown): value is CorrectionExerciseStatus {
  return value === "planned"
    || value === "active"
    || value === "completed"
    || value === "skipped";
}

function audit(
  output: HistoryCorrectionAuditDelta[],
  fieldIdentity: string,
  before: unknown,
  after: unknown,
): void {
  if (stableJson(before) !== stableJson(after)) {
    output.push(Object.freeze({
      fieldIdentity,
      before: normalizedValue(before),
      after: normalizedValue(after),
    }));
  }
}

function assertAddedIdentity(id: string): void {
  if (!id.startsWith("history-added:")) {
    throw new HistoryCorrectionInputError(
      "history_correction_added_identity_invalid",
    );
  }
}

function validateSnapshot(snapshot: HistoryCorrectionSnapshot): void {
  if (snapshot.version !== 1) {
    throw new HistoryCorrectionInputError("history_correction_snapshot_invalid");
  }
  const { session } = snapshot;
  nonEmpty(session.id, "history_correction_session_id_invalid");
  if (!isSource(session.source) || !isSessionStatus(session.status)) {
    throw new HistoryCorrectionInputError("history_correction_status_invalid");
  }
  try {
    parseHistoryLocalDate(session.localDate);
  } catch {
    throw new HistoryCorrectionInputError("history_correction_date_invalid");
  }
  try {
    parseStoredTimeZone(session.timezone);
  } catch {
    throw new HistoryCorrectionInputError("history_correction_timezone_invalid");
  }
  if (!isSafeNonnegativeInteger(session.startedAtMs)
    || (session.completedAtMs !== null
      && (!isSafeNonnegativeInteger(session.completedAtMs)
        || session.completedAtMs < session.startedAtMs))) {
    throw new HistoryCorrectionInputError("history_correction_time_invalid");
  }
  if (session.ownerNote !== null
    && (typeof session.ownerNote !== "string" || session.ownerNote.length > 2_000)) {
    throw new HistoryCorrectionInputError("history_correction_note_invalid");
  }
  if ((session.planId === null) !== (session.planDayId === null)) {
    throw new HistoryCorrectionInputError("history_correction_association_invalid");
  }
  const exerciseIds = new Set<string>();
  const setIds = new Set<string>();
  for (const exercise of snapshot.exercises) {
    nonEmpty(exercise.id, "history_correction_exercise_id_invalid");
    nonEmpty(exercise.exerciseId, "history_correction_exercise_reference_invalid");
    nonEmpty(exercise.name, "history_correction_exercise_name_invalid");
    if (exerciseIds.has(exercise.id)
      || !Number.isSafeInteger(exercise.ordinal)
      || exercise.ordinal < 0
      || !isExerciseStatus(exercise.status)
      || !isEffort(exercise.effort)) {
      throw new HistoryCorrectionInputError("history_correction_exercise_invalid");
    }
    exerciseIds.add(exercise.id);
    const previousOrdinal = new Map<CorrectionSetKind, number>();
    for (const set of exercise.sets) {
      nonEmpty(set.id, "history_correction_set_id_invalid");
      if (setIds.has(set.id)
        || !isSetKind(set.kind)
        || !isSetStatus(set.status)
        || !Number.isSafeInteger(set.ordinal)
        || set.ordinal < 0
        || set.ordinal <= (previousOrdinal.get(set.kind) ?? -1)
        || !isSafeNonnegativeInteger(set.completedAtMs) && set.completedAtMs !== null) {
        throw new HistoryCorrectionInputError("history_correction_set_invalid");
      }
      previousOrdinal.set(set.kind, set.ordinal);
      setIds.add(set.id);
      try {
        const identity = parseMetricIdentity(exercise.metricIdentity);
        parseMetricTarget(identity, set.target);
        if (set.observation !== undefined) {
          parseMetricObservation(identity, set.observation);
        }
      } catch {
        throw new HistoryCorrectionInputError("history_correction_metric_invalid");
      }
      if (set.status === "completed"
        && (set.observation === undefined || set.completedAtMs === null)) {
        throw new HistoryCorrectionInputError("history_correction_completed_set_invalid");
      }
    }
  }
}

function correctionDeltas(
  base: HistoryCorrectionSnapshot,
  next: HistoryCorrectionSnapshot,
): readonly HistoryCorrectionAuditDelta[] {
  const output: HistoryCorrectionAuditDelta[] = [];
  for (const field of [
    "source", "status", "planId", "planDayId", "planName", "dayName",
    "localDate", "timezone", "startedAtMs", "completedAtMs", "ownerNote",
  ] as const) {
    audit(output, `session.${field}`, base.session[field], next.session[field]);
  }
  const oldExercises = new Map(base.exercises.map((item) => [item.id, item]));
  const nextExercises = new Map(next.exercises.map((item) => [item.id, item]));
  for (const id of [...new Set([...oldExercises.keys(), ...nextExercises.keys()])].sort()) {
    const before = oldExercises.get(id);
    const after = nextExercises.get(id);
    if (before === undefined) {
      audit(output, `exercise:${id}.added`, null, after);
      continue;
    }
    if (after === undefined) {
      audit(output, `exercise:${id}.removed`, before, null);
      continue;
    }
    for (const field of [
      "exerciseId", "name", "ordinal", "status", "metricIdentity", "effort",
    ] as const) {
      audit(output, `exercise:${id}.${field}`, before[field], after[field]);
    }
    const oldSets = new Map(before.sets.map((item) => [item.id, item]));
    const nextSets = new Map(after.sets.map((item) => [item.id, item]));
    for (const setId of [...new Set([...oldSets.keys(), ...nextSets.keys()])].sort()) {
      const oldSet = oldSets.get(setId);
      const nextSet = nextSets.get(setId);
      if (oldSet === undefined) {
        audit(output, `set:${setId}.added`, null, nextSet);
        continue;
      }
      if (nextSet === undefined) {
        audit(output, `set:${setId}.removed`, oldSet, null);
        continue;
      }
      for (const field of [
        "kind", "ordinal", "status", "target", "observation", "completedAtMs",
        "sourcePlanWorkingSetTargetId", "sourceOwnedPlanWorkingSetTargetId",
      ] as const) {
        audit(output, `set:${setId}.${field}`, oldSet[field], nextSet[field]);
      }
    }
  }
  return Object.freeze(output.sort((left, right) =>
    left.fieldIdentity.localeCompare(right.fieldIdentity)
  ));
}

function validateImmutableIdentity(
  base: HistoryCorrectionSnapshot,
  next: HistoryCorrectionSnapshot,
): void {
  if (base.session.id !== next.session.id) {
    throw new HistoryCorrectionInputError("history_correction_session_identity_invalid");
  }
  if (base.session.source !== next.session.source
    || base.session.status !== next.session.status) {
    throw new HistoryCorrectionInputError(
      "history_correction_session_field_immutable",
    );
  }
  const oldExercises = new Map(base.exercises.map((item) => [item.id, item]));
  const nextExercises = new Map(next.exercises.map((item) => [item.id, item]));
  for (const exerciseId of oldExercises.keys()) {
    if (!nextExercises.has(exerciseId)) {
      throw new HistoryCorrectionInputError(
        "history_correction_exercise_removal_unsupported",
      );
    }
  }
  for (const exercise of next.exercises) {
    const previous = oldExercises.get(exercise.id);
    if (previous === undefined) {
      throw new HistoryCorrectionInputError(
        "history_correction_exercise_addition_unsupported",
      );
    }
    const oldSets = new Set(previous.sets.map(({ id }) => id));
    for (const set of exercise.sets) {
      if (!oldSets.has(set.id)) {
        assertAddedIdentity(set.id);
      }
    }
  }
}

export function assertValidHistoryCorrectionSnapshot(
  snapshot: HistoryCorrectionSnapshot,
): void {
  validateSnapshot(snapshot);
}

export function prepareHistoryCorrection(input: Readonly<{
  base: HistoryCorrectionSnapshot;
  baseEffectiveRevision: number;
  expectedEffectiveRevision: number;
  next: HistoryCorrectionSnapshot;
}>): PreparedHistoryCorrection {
  if (!Number.isSafeInteger(input.baseEffectiveRevision)
    || input.baseEffectiveRevision < 0
    || input.expectedEffectiveRevision !== input.baseEffectiveRevision) {
    throw new HistoryCorrectionInputError("history_correction_conflict");
  }
  validateSnapshot(input.base);
  validateSnapshot(input.next);
  validateImmutableIdentity(input.base, input.next);
  const auditDeltas = correctionDeltas(input.base, input.next);
  if (auditDeltas.length === 0) {
    throw new HistoryCorrectionInputError("history_correction_noop");
  }
  return Object.freeze({
    next: input.next,
    auditDeltas,
  });
}

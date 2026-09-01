import {
  getMetricContract,
  metricIdentityKey,
  parseMetricIdentity,
  parseMetricTarget,
  type MetricIdentity,
  type MetricTarget,
} from "../metrics";
import {
  parseHistoryLocalDate,
} from "./contracts";

export type HistorySubjectKind =
  | "date"
  | "exercise_metric"
  | "period"
  | "recommendation_target"
  | "session";

export type HistorySubject = Readonly<{
  id: string;
  kind: HistorySubjectKind;
}>;

export type HistoryImpact = Readonly<{
  subjects: readonly HistorySubject[];
  recommendationScopes: readonly string[];
}>;

export type ParsedHistorySubject = Readonly<{
  kind: HistorySubjectKind;
  scope: readonly string[];
}>;

export type EffectiveHistorySubjectExercise = Readonly<{
  exerciseId: string;
  identity: MetricIdentity;
  target: MetricTarget;
  recommendationTargetIds: readonly string[];
}>;

export type EffectiveHistorySubjectSnapshot = Readonly<{
  sessionId: string;
  localDate: string;
  lifecycle: "active" | "voided";
  exercises: readonly EffectiveHistorySubjectExercise[];
}>;

type HistorySubjectTuple = readonly [
  HistorySubjectKind,
  ...readonly string[],
];

function nonEmptyIdentifier(value: string, code: string): string {
  if (value.trim() === "") {
    throw new TypeError(code);
  }
  return value;
}

function subjectId(tuple: HistorySubjectTuple): string {
  return `history-subject/v1:${JSON.stringify(tuple)}`;
}

export function parseHistorySubjectId(subjectIdValue: string): ParsedHistorySubject {
  const prefix = "history-subject/v1:";
  if (!subjectIdValue.startsWith(prefix)) {
    throw new TypeError("history_subject_id_invalid");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(subjectIdValue.slice(prefix.length));
  } catch {
    throw new TypeError("history_subject_id_invalid");
  }
  if (!Array.isArray(parsed) || parsed.length < 2 || parsed.some((part) =>
    typeof part !== "string" || part.trim() === ""
  )) {
    throw new TypeError("history_subject_id_invalid");
  }
  const [kind, ...scope] = parsed as string[];
  if (
    kind !== "date"
    && kind !== "exercise_metric"
    && kind !== "period"
    && kind !== "recommendation_target"
    && kind !== "session"
  ) {
    throw new TypeError("history_subject_id_invalid");
  }
  return Object.freeze({
    kind,
    scope: Object.freeze(scope),
  });
}

function subject(
  kind: HistorySubjectKind,
  ...scope: readonly string[]
): HistorySubject {
  return Object.freeze({
    id: subjectId([kind, ...scope]),
    kind,
  });
}

/**
 * Returns the target-significant comparator boundary used by the approved
 * metric-exposure contract. It deliberately does not invent a universal
 * load-times-reps key.
 */
export function metricComparatorBoundaryKey(input: Readonly<{
  identity: MetricIdentity;
  target: MetricTarget;
}>): string {
  const identity = parseMetricIdentity(input.identity);
  const target = parseMetricTarget(identity, input.target);
  switch (getMetricContract(identity).exposureId) {
    case "identity":
      return "identity";
    case "completion_history":
      return "completion";
    case "identity_and_variation":
      if (target.profile !== "bodyweight_reps") {
        throw new TypeError("history_subject_metric_target_mismatch");
      }
      return `variation:${target.variationId}`;
    case "identity_and_assistance_equipment":
      if (target.profile !== "assisted_reps") {
        throw new TypeError("history_subject_metric_target_mismatch");
      }
      return `assistance_equipment:${target.assistanceEquipmentId}`;
    case "identity_and_side":
      if (target.profile !== "timed_hold") {
        throw new TypeError("history_subject_metric_target_mismatch");
      }
      return `side:${String(target.perSide)}`;
    case "identity_and_planned_distance":
      if (target.profile !== "fixed_distance") {
        throw new TypeError("history_subject_metric_target_mismatch");
      }
      return `planned_distance:${target.plannedDistanceMeters}`;
    case "identity_and_planned_duration":
      if (target.profile !== "fixed_time") {
        throw new TypeError("history_subject_metric_target_mismatch");
      }
      return `planned_duration:${target.plannedDurationMs}`;
    case "identity_and_interval_protocol":
      if (target.profile !== "intervals") {
        throw new TypeError("history_subject_metric_target_mismatch");
      }
      return [
        "interval",
        target.protocolId,
        target.comparatorId,
        target.comparatorVersion,
        target.plannedRounds,
        target.workIntervalMs,
        target.restIntervalMs,
      ].join(":");
  }
}

function subjectsForSnapshot(
  snapshot: EffectiveHistorySubjectSnapshot,
): readonly HistorySubject[] {
  const sessionId = nonEmptyIdentifier(
    snapshot.sessionId,
    "history_subject_session_id_invalid",
  );
  const localDate = parseHistoryLocalDate(snapshot.localDate);
  if (snapshot.lifecycle === "voided") {
    return Object.freeze([]);
  }
  if (snapshot.lifecycle !== "active") {
    throw new TypeError("history_subject_lifecycle_invalid");
  }
  const subjects: HistorySubject[] = [
    subject("session", sessionId),
    subject("date", localDate),
    // Daily source rows and this all-time aggregate are the only period
    // inputs Phase 4 needs to compose 4-week, 12-week, and all-time views.
    subject("period", localDate),
    subject("period", "all"),
  ];

  for (const exercise of snapshot.exercises) {
    const exerciseId = nonEmptyIdentifier(
      exercise.exerciseId,
      "history_subject_exercise_id_invalid",
    );
    const identity = parseMetricIdentity(exercise.identity);
    subjects.push(subject(
      "exercise_metric",
      exerciseId,
      metricIdentityKey(identity),
      metricComparatorBoundaryKey({
        identity,
        target: exercise.target,
      }),
    ));
    for (const recommendationTargetId of exercise.recommendationTargetIds) {
      subjects.push(subject(
        "recommendation_target",
        nonEmptyIdentifier(
          recommendationTargetId,
          "history_subject_recommendation_target_id_invalid",
        ),
      ));
    }
  }
  return Object.freeze(subjects);
}

/**
 * Collects the complete source-to-derived invalidation scope for a mutation.
 * Both sides participate, including a voided snapshot: removal must rebuild
 * the former scope and restore must rebuild the restored scope.
 */
export function collectHistorySubjects(input: Readonly<{
  oldSnapshot: EffectiveHistorySubjectSnapshot;
  newSnapshot: EffectiveHistorySubjectSnapshot;
}>): readonly HistorySubject[] {
  if (input.oldSnapshot.sessionId !== input.newSnapshot.sessionId) {
    throw new TypeError("history_subject_session_mismatch");
  }
  const unique = new Map<string, HistorySubject>();
  for (const item of [
    ...subjectsForSnapshot(input.oldSnapshot),
    ...subjectsForSnapshot(input.newSnapshot),
  ]) {
    unique.set(item.id, item);
  }
  return Object.freeze(
    [...unique.values()].sort((left, right) => left.id.localeCompare(right.id)),
  );
}

export function collectHistoryImpact(input: Readonly<{
  oldSnapshot: EffectiveHistorySubjectSnapshot;
  newSnapshot: EffectiveHistorySubjectSnapshot;
}>): HistoryImpact {
  const subjects = collectHistorySubjects(input);
  const recommendationScopes = subjects
    .filter(({ kind }) => kind === "recommendation_target")
    .map(({ id }) => parseHistorySubjectId(id).scope[0]!)
    .sort((left, right) => left.localeCompare(right));
  return Object.freeze({
    subjects,
    recommendationScopes: Object.freeze(recommendationScopes),
  });
}

import type {
  ProgressDashboardInput,
  ProgressDashboardProjection,
  ProgressGoalRevision,
  ProgressRunningActivityFact,
  ProgressRunningEffort,
  ProgressRunningGoal,
} from "./contracts";

function validIdentifier(value: string): boolean {
  return value.trim() === value && value.length > 0;
}

function validPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function compareGoals(left: ProgressGoalRevision, right: ProgressGoalRevision): number {
  return left.sourceOrder - right.sourceOrder
    || (left.effectiveAtMs === right.effectiveAtMs ? 0 : left.effectiveAtMs - right.effectiveAtMs)
    || left.sport.localeCompare(right.sport)
    || left.targetId.localeCompare(right.targetId)
    || left.revision - right.revision;
}

function isEligibleRunningFact(fact: ProgressRunningActivityFact): boolean {
  return fact.lifecycle === "active"
    && fact.accepted
    && !fact.fixture
    && validIdentifier(fact.activityId)
    && validIdentifier(fact.sourceIdentity)
    && validPositiveInteger(fact.sourceRevision)
    && Number.isSafeInteger(fact.startedAtMs) && fact.startedAtMs >= 0
    && validPositiveInteger(fact.distanceMeters)
    && validPositiveInteger(fact.durationSeconds)
    && fact.exactDistanceMeters === fact.distanceMeters
    && (fact.evidence === "source_summary" || fact.evidence === "source_laps");
}

function effort(fact: ProgressRunningActivityFact): ProgressRunningEffort {
  return Object.freeze({
    activityId: fact.activityId,
    sourceIdentity: fact.sourceIdentity,
    sourceRevision: fact.sourceRevision,
    localDate: fact.localDate,
    durationSeconds: fact.durationSeconds,
    timeBasis: fact.timeBasis,
    evidence: fact.evidence as ProgressRunningEffort["evidence"],
  });
}

function compareEffort(left: ProgressRunningActivityFact, right: ProgressRunningActivityFact): number {
  return left.startedAtMs - right.startedAtMs
    || left.sourceRevision - right.sourceRevision
    || left.activityId.localeCompare(right.activityId);
}

function targetAt(
  targets: readonly ProgressGoalRevision[],
  distanceMeters: number,
  atMs: number,
): Readonly<{ targetId: string; durationSeconds: number }> | null {
  const candidate = targets
    .filter((target) => target.sport === "Running"
      && target.distanceMeters === distanceMeters
      && target.targetDurationSeconds !== null
      && target.effectiveAtMs <= atMs
      && validPositiveInteger(target.targetDurationSeconds))
    .toSorted((left, right) => left.effectiveAtMs - right.effectiveAtMs
      || left.revision - right.revision || left.targetId.localeCompare(right.targetId))
    .at(-1);
  return candidate === undefined
    ? null
    : Object.freeze({ targetId: candidate.targetId, durationSeconds: candidate.targetDurationSeconds! });
}

function runningProjection(input: NonNullable<ProgressDashboardInput["running"]>): ProgressDashboardProjection {
  const eligible = input.activities.filter(isEligibleRunningFact)
    .toSorted(compareEffort);
  if (eligible.length === 0) {
    const hasAttemptedFact = input.activities.length > 0;
    return Object.freeze({
      sport: "Running" as const,
      state: hasAttemptedFact ? "more_data_needed" as const : "empty" as const,
      goals: Object.freeze([]),
      absenceReason: hasAttemptedFact
        ? "exact_effort_evidence_insufficient" as const
        : "no_factual_points" as const,
    });
  }
  const grouped = new Map<number, ProgressRunningActivityFact[]>();
  for (const fact of eligible) {
    const values = grouped.get(fact.distanceMeters) ?? [];
    values.push(fact);
    grouped.set(fact.distanceMeters, values);
  }
  const goals: ProgressRunningGoal[] = [];
  for (const [distanceMeters, values] of grouped) {
    const ordered = values.toSorted(compareEffort);
    const latest = ordered.at(-1)!;
    const best = ordered.reduce((current, candidate) =>
      candidate.durationSeconds < current.durationSeconds
        || (candidate.durationSeconds === current.durationSeconds && compareEffort(candidate, current) > 0)
        ? candidate
        : current,
    );
    goals.push(Object.freeze({
      distanceMeters,
      latest: effort(latest),
      best: effort(best),
      target: targetAt(input.targets, distanceMeters, latest.startedAtMs),
      targetAtDate: targetAt(input.targets, distanceMeters, latest.startedAtMs),
      evidenceCount: ordered.length,
    }));
  }
  return Object.freeze({
    sport: "Running" as const,
    state: eligible.length === 1 ? "sparse" as const : "ready" as const,
    goals: Object.freeze(goals.toSorted((left, right) => left.distanceMeters - right.distanceMeters)),
  });
}

export function projectProgressDashboard(input: ProgressDashboardInput): ProgressDashboardProjection {
  if (input.sport === "Running") {
    return runningProjection(input.running ?? { activities: [], targets: [] });
  }
  if (input.sport === "Strength") {
    const facts = input.strength?.facts ?? [];
    return Object.freeze({
      sport: "Strength" as const,
      state: facts.length === 0 ? "empty" as const : facts.length === 1 ? "sparse" as const : "ready" as const,
      facts: Object.freeze([...facts]),
    });
  }
  const goals = input.goals ?? input.running?.targets ?? [];
  return Object.freeze({
    sport: "All" as const,
    state: goals.length === 0 ? "empty" as const : "ready" as const,
    primaryGoal: goals.length === 0 ? null : goals.toSorted(compareGoals)[0]!,
  });
}

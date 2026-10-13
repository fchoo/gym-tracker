import {
  compareMetricObservations,
  parseMetricIdentity,
  parseMetricObservationJson,
  parseMetricTargetJson,
  type MetricIdentity,
  type MetricObservation,
  type MetricTarget,
} from "../metrics";
import type {
  ProgressAllGoal,
  ProgressDashboardInput,
  ProgressDashboardProjection,
  ProgressGoalRevision,
  ProgressPlannedNext,
  ProgressRecord,
  ProgressRunningActivityFact,
  ProgressRunningEffort,
  ProgressRunningGoal,
  ProgressStrengthGoal,
  ProgressStrengthValueFormat,
} from "./contracts";
import { projectStrengthComparableFacts } from "./periodProjection";
import { deriveRunningPacing } from "./runningPacing";

function validIdentifier(value: string): boolean {
  return value.trim() === value && value.length > 0;
}

function validPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function compareGoals(left: ProgressGoalRevision, right: ProgressGoalRevision): number {
  return left.sourceOrder - right.sourceOrder
    || (left.targetLocalDate ?? "\uFFFF").localeCompare(right.targetLocalDate ?? "\uFFFF")
    || left.sport.localeCompare(right.sport)
    || (left.planId ?? left.targetId).localeCompare(right.planId ?? right.targetId)
    || left.targetId.localeCompare(right.targetId)
    || left.revision - right.revision;
}

function isAuthoritativeGoal(target: ProgressGoalRevision): boolean {
  return target.active !== false
    && target.lifecycle !== "inactive"
    && target.lifecycle !== "archived"
    && validIdentifier(target.planId ?? target.targetId)
    && validIdentifier(target.targetId)
    && validPositiveInteger(target.revision)
    && Number.isSafeInteger(target.effectiveAtMs)
    && target.effectiveAtMs >= 0;
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
    .filter((target) => isAuthoritativeGoal(target)
      && target.sport === "Running"
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

function currentTarget(
  targets: readonly ProgressGoalRevision[],
  distanceMeters: number,
): Readonly<{ targetId: string; durationSeconds: number }> | null {
  const candidate = targets
    .filter((target) => isAuthoritativeGoal(target)
      && target.current !== false
      && target.sport === "Running"
      && target.distanceMeters === distanceMeters
      && target.targetDurationSeconds !== null
      && validPositiveInteger(target.targetDurationSeconds))
    .toSorted(compareGoals)
    .at(-1);
  return candidate === undefined
    ? null
    : Object.freeze({ targetId: candidate.targetId, durationSeconds: candidate.targetDurationSeconds! });
}

function runningGap(goal: Readonly<{
  best: ProgressRunningEffort | null;
  target: Readonly<{ durationSeconds: number }> | null;
}>): string {
  if (goal.target === null) return "Gap · Target unset";
  if (goal.best === null) return "Gap · More data needed";
  const difference = goal.target.durationSeconds - goal.best.durationSeconds;
  if (difference === 0) return "Gap · At target";
  const amount = `${Math.abs(difference)} ${Math.abs(difference) === 1 ? "second" : "seconds"}`;
  return difference > 0 ? `Gap · ${amount} ahead of target` : `Gap · ${amount} behind target`;
}

function plannedNextFor(
  sport: ProgressDashboardInput["sport"],
  candidates: readonly ProgressPlannedNext[],
): ProgressPlannedNext | null {
  return candidates.filter((candidate) =>
    (sport === "All" || candidate.sport === sport)
    && validIdentifier(candidate.sourceOpportunityId)
    && validPositiveInteger(candidate.sourceRevision)
    && /^\d{4}-\d{2}-\d{2}$/u.test(candidate.localDate)
    && validIdentifier(candidate.planId)
    && validIdentifier(candidate.planName)
    && validIdentifier(candidate.activityId)
    && validIdentifier(candidate.activityName)
  ).toSorted((left, right) =>
    left.localDate.localeCompare(right.localDate)
    || left.sport.localeCompare(right.sport)
    || left.sourceOpportunityId.localeCompare(right.sourceOpportunityId)
  )[0] ?? null;
}

function runningProjection(
  input: NonNullable<ProgressDashboardInput["running"]>,
  plannedNext: ProgressPlannedNext | null,
): Extract<ProgressDashboardProjection, { sport: "Running" }> {
  const eligible = input.activities.filter(isEligibleRunningFact).toSorted(compareEffort);
  const authoritativeTargets = input.targets.filter(isAuthoritativeGoal);
  const grouped = new Map<string, ProgressRunningActivityFact[]>();
  for (const fact of eligible) {
    const key = `${fact.distanceMeters}\u0000${fact.timeBasis}`;
    const values = grouped.get(key) ?? [];
    values.push(fact);
    grouped.set(key, values);
  }
  for (const target of authoritativeTargets.filter(({ current }) => current !== false)) {
    if (!validPositiveInteger(target.distanceMeters ?? 0)) continue;
    const key = `${target.distanceMeters}\u0000elapsed`;
    if (!grouped.has(key)) grouped.set(key, []);
  }
  const goals: ProgressRunningGoal[] = [];
  for (const [key, values] of grouped) {
    const [distanceText, timeBasisText] = key.split("\u0000");
    const distanceMeters = Number(distanceText);
    const timeBasis = timeBasisText as ProgressRunningActivityFact["timeBasis"];
    const ordered = values.toSorted(compareEffort);
    const latestFact = ordered.at(-1) ?? null;
    const bestFact = ordered.length === 0 ? null : ordered.reduce((current, candidate) =>
      candidate.durationSeconds < current.durationSeconds
        || (candidate.durationSeconds === current.durationSeconds && compareEffort(candidate, current) > 0)
        ? candidate
        : current,
    );
    const target = currentTarget(authoritativeTargets, distanceMeters);
    const latest = latestFact === null ? null : effort(latestFact);
    const best = bestFact === null ? null : effort(bestFact);
    const targetAtDate = latestFact === null
      ? null
      : targetAt(authoritativeTargets, distanceMeters, latestFact.startedAtMs);
    goals.push(Object.freeze({
      distanceMeters,
      timeBasis,
      latest,
      best,
      target,
      targetAtDate,
      history: Object.freeze(ordered.map((item) => Object.freeze({
        effort: effort(item),
        targetAtDate: targetAt(authoritativeTargets, distanceMeters, item.startedAtMs),
      }))),
      evidenceCount: ordered.length,
      gap: runningGap({ best, target }),
      pacing: target === null ? null : deriveRunningPacing({
        distanceMeters,
        targetDurationSeconds: target.durationSeconds,
      }),
    }));
  }
  const hasAttemptedFact = input.activities.length > 0;
  const state = eligible.length > 1
    ? "ready" as const
    : goals.length > 0
      ? "sparse" as const
      : hasAttemptedFact
        ? "more_data_needed" as const
        : "empty" as const;
  return Object.freeze({
    sport: "Running" as const,
    state,
    goals: Object.freeze(goals.toSorted((left, right) => left.distanceMeters - right.distanceMeters
      || left.timeBasis.localeCompare(right.timeBasis))),
    plannedNext,
    ...(goals.length > 0 ? {} : {
      absenceReason: hasAttemptedFact
        ? "exact_effort_evidence_insufficient" as const
        : "no_factual_points" as const,
    }),
  });
}

type ParsedStrengthFact = Readonly<{
  record: ProgressRecord;
  identity: MetricIdentity;
  target: MetricTarget;
  observation: MetricObservation;
}>;

type ScalarMetric = Readonly<{
  value: number;
  target: number | null;
  valueLabel: string;
  targetLabel: string | null;
  fasterIsLower: boolean;
  valueFormat: ProgressStrengthValueFormat;
  unitLabel: string;
  directionLabel: string;
}>;

function decimal(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function duration(seconds: number): string {
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor((rounded % 3_600) / 60);
  const remainder = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function scalarMetric(target: MetricTarget, observation: MetricObservation): ScalarMetric | null {
  if (target.profile !== observation.profile) return null;
  switch (observation.profile) {
    case "load_reps": {
      const typedTarget = target as Extract<MetricTarget, { profile: "load_reps" }>;
      const value = observation.loadGrams / 1_000;
      const targetValue = typedTarget.loadGrams / 1_000;
      return { value, target: targetValue, valueLabel: `${decimal(value)} kg × ${observation.reps}`, targetLabel: `${decimal(targetValue)} kg × ${typedTarget.targetReps?.[0] ?? typedTarget.maxReps}`, fasterIsLower: false, valueFormat: "kilograms", unitLabel: "kg", directionLabel: "Higher comparable load is better." };
    }
    case "bodyweight_reps": {
      const typedTarget = target as Extract<MetricTarget, { profile: "bodyweight_reps" }>;
      return { value: observation.reps, target: typedTarget.maxReps, valueLabel: `Bodyweight × ${observation.reps}`, targetLabel: `Bodyweight × ${typedTarget.maxReps}`, fasterIsLower: false, valueFormat: "repetitions", unitLabel: "reps", directionLabel: "More comparable repetitions are better." };
    }
    case "added_load_reps": {
      const typedTarget = target as Extract<MetricTarget, { profile: "added_load_reps" }>;
      const value = observation.addedLoadGrams / 1_000;
      const targetValue = typedTarget.addedLoadGrams / 1_000;
      return { value, target: targetValue, valueLabel: `BW + ${decimal(value)} kg × ${observation.reps}`, targetLabel: `BW + ${decimal(targetValue)} kg × ${typedTarget.maxReps}`, fasterIsLower: false, valueFormat: "kilograms", unitLabel: "kg added", directionLabel: "Higher comparable added load is better." };
    }
    case "assisted_reps": {
      const typedTarget = target as Extract<MetricTarget, { profile: "assisted_reps" }>;
      const value = observation.assistanceGrams / 1_000;
      const targetValue = typedTarget.assistanceGrams / 1_000;
      return { value, target: targetValue, valueLabel: `${decimal(value)} kg assist × ${observation.reps}`, targetLabel: `${decimal(targetValue)} kg assist × ${typedTarget.maxReps}`, fasterIsLower: true, valueFormat: "kilograms", unitLabel: "kg assistance", directionLabel: "Lower comparable assistance is better." };
    }
    case "timed_hold": {
      const typedTarget = target as Extract<MetricTarget, { profile: "timed_hold" }>;
      const value = observation.version === 1 ? observation.durationSeconds : observation.durationMs / 1_000;
      const targetValue = typedTarget.version === 1 ? typedTarget.durationSeconds : typedTarget.durationMs / 1_000;
      return { value, target: targetValue, valueLabel: duration(value), targetLabel: duration(targetValue), fasterIsLower: false, valueFormat: "seconds", unitLabel: "seconds", directionLabel: "Longer comparable holds are better." };
    }
    case "fixed_distance": {
      const value = observation.durationMs / 1_000;
      return { value, target: null, valueLabel: duration(value), targetLabel: null, fasterIsLower: true, valueFormat: "duration", unitLabel: "elapsed time", directionLabel: "Faster is lower on the clock." };
    }
    case "fixed_time": {
      return { value: observation.distanceMeters, target: null, valueLabel: `${observation.distanceMeters} m`, targetLabel: null, fasterIsLower: false, valueFormat: "meters", unitLabel: "metres", directionLabel: "More distance in the fixed time is better." };
    }
    case "intervals": {
      const typedTarget = target as Extract<MetricTarget, { profile: "intervals" }>;
      return { value: observation.completedRounds, target: typedTarget.plannedRounds, valueLabel: `${observation.completedRounds} rounds`, targetLabel: `${typedTarget.plannedRounds} rounds`, fasterIsLower: false, valueFormat: "rounds", unitLabel: "rounds", directionLabel: "More completed comparable rounds are better." };
    }
    case "unscored": {
      return { value: observation.completed ? 1 : 0, target: 1, valueLabel: observation.completed ? "Completed" : "Not completed", targetLabel: "Completed", fasterIsLower: false, valueFormat: "completion", unitLabel: "completion", directionLabel: "Completed comparable visits meet the target." };
    }
  }
}

function parseStrengthFact(record: ProgressRecord): ParsedStrengthFact | null {
  try {
    const [profile, contractVersion, exerciseMetricGeneration, ...extra] = record.identityKey.split(":");
    if (profile === undefined || contractVersion === undefined || exerciseMetricGeneration === undefined || extra.length > 0) return null;
    const identity = parseMetricIdentity({ profile, contractVersion: Number(contractVersion), exerciseMetricGeneration: Number(exerciseMetricGeneration) });
    return Object.freeze({
      record,
      identity,
      target: parseMetricTargetJson(identity, record.targetJson),
      observation: parseMetricObservationJson(identity, record.observationJson),
    });
  } catch {
    return null;
  }
}

function compareStrengthFact(left: ParsedStrengthFact, right: ParsedStrengthFact): number {
  return left.record.localDate.localeCompare(right.record.localDate)
    || left.record.sessionId.localeCompare(right.record.sessionId)
    || left.record.setId.localeCompare(right.record.setId);
}

function formatScalar(format: ProgressStrengthValueFormat, value: number): string {
  switch (format) {
    case "kilograms": return `${decimal(value)} kg`;
    case "repetitions": return `${decimal(value)} reps`;
    case "seconds": return `${decimal(value)} sec`;
    case "duration": return duration(value);
    case "meters": return `${decimal(value)} m`;
    case "rounds": return `${decimal(value)} rounds`;
    case "completion": return value >= 1 ? "Completed" : "Not completed";
  }
}

function strengthGap(best: ScalarMetric, target: number | null): string {
  if (target === null) return "Gap · Target unavailable";
  const difference = best.value - target;
  if (difference === 0) return "Gap · At target";
  const better = best.fasterIsLower ? difference < 0 : difference > 0;
  return `Gap · ${formatScalar(best.valueFormat, Math.abs(difference))} ${better ? "better than target" : "behind target"}`;
}

function strengthGoals(facts: readonly ProgressRecord[]): readonly ProgressStrengthGoal[] {
  const groups = new Map<string, ParsedStrengthFact[]>();
  for (const record of facts) {
    const parsed = parseStrengthFact(record);
    if (parsed === null) continue;
    const key = `${record.exerciseId}\u0000${record.identityKey}\u0000${record.comparatorKey}`;
    const values = groups.get(key) ?? [];
    values.push(parsed);
    groups.set(key, values);
  }
  return Object.freeze([...groups.entries()].flatMap(([goalId, values]) => {
    const ordered = values.toSorted(compareStrengthFact);
    const latest = ordered.at(-1)!;
    const latestScalar = scalarMetric(latest.target, latest.observation)!;
    const best = ordered.reduce((selected, candidate) => {
      const comparison = compareMetricObservations({
        identity: latest.identity,
        target: latest.target,
        left: candidate.observation,
        right: selected.observation,
      });
      return comparison === "better" || comparison === "equal"
        ? candidate
        : selected;
    });
    const bestScalar = scalarMetric(best.target, best.observation)!;
    const previous = ordered.at(-2);
    const status = previous === undefined
      ? "baseline" as const
      : compareMetricObservations({ identity: latest.identity, target: latest.target, left: latest.observation, right: previous.observation }) === "better"
        ? "improving" as const
        : "holding" as const;
    const valueFor = (fact: ParsedStrengthFact) => {
      const scalar = scalarMetric(fact.target, fact.observation)!;
      return Object.freeze({
        value: scalar.value,
        label: scalar.valueLabel,
        localDate: fact.record.localDate,
        sessionId: fact.record.sessionId,
        sourceRevision: validPositiveInteger(fact.record.sourceRevision ?? 0) ? fact.record.sourceRevision! : null,
      });
    };
    return [Object.freeze({
      goalId,
      exerciseId: latest.record.exerciseId,
      exerciseName: latest.record.exerciseName,
      identityKey: latest.record.identityKey,
      status,
      latest: valueFor(latest),
      best: valueFor(best),
      target: latestScalar.target === null || latestScalar.targetLabel === null ? null : Object.freeze({ value: latestScalar.target, label: latestScalar.targetLabel }),
      gap: strengthGap(bestScalar, latestScalar.target),
      evidenceCount: ordered.length,
      fasterIsLower: latestScalar.fasterIsLower,
      valueFormat: latestScalar.valueFormat,
      unitLabel: latestScalar.unitLabel,
      directionLabel: latestScalar.directionLabel,
      history: Object.freeze(ordered.map((fact) => {
        const value = valueFor(fact);
        const target = scalarMetric(fact.target, fact.observation)?.target ?? null;
        return Object.freeze({ ...value, targetAtDate: target });
      })),
    })];
  }).toSorted((left, right) => left.exerciseName.localeCompare(right.exerciseName)
    || left.goalId.localeCompare(right.goalId)));
}

export function projectProgressDashboard(input: ProgressDashboardInput): ProgressDashboardProjection {
  const plannedNext = plannedNextFor(input.sport, input.plannedNext ?? []);
  const running = runningProjection(input.running ?? {
    activities: [],
    targets: input.goals ?? [],
  }, plannedNext);
  const facts = input.strength?.candidates === undefined
    ? input.strength?.facts ?? []
    : projectStrengthComparableFacts(input.strength.candidates);
  const strength = strengthGoals(facts);
  if (input.sport === "Running") return running;
  if (input.sport === "Strength") {
    return Object.freeze({
      sport: "Strength" as const,
      state: strength.length === 0 ? "empty" as const : strength.every(({ evidenceCount }) => evidenceCount === 1) ? "sparse" as const : "ready" as const,
      facts: Object.freeze([...facts]),
      goals: strength,
      plannedNext,
    });
  }
  const activeGoals: ProgressAllGoal[] = [
    ...strength.filter(({ target }) => target !== null).map((goal) => Object.freeze({ sport: "Strength" as const, goal })),
    ...running.goals.filter(({ target }) => target !== null).map((goal) => Object.freeze({ sport: "Running" as const, goal })),
  ];
  return Object.freeze({
    sport: "All" as const,
    state: activeGoals.length === 0 ? "empty" as const : activeGoals.every(({ goal }) => goal.evidenceCount <= 1) ? "sparse" as const : "ready" as const,
    primaryGoal: activeGoals[0] ?? null,
    activeGoals: Object.freeze(activeGoals),
    plannedNext,
  });
}

export const __dashboardProjectionTestOnly = Object.freeze({
  compareGoals,
  duration,
  formatScalar,
  plannedNextFor,
  scalarMetric,
});

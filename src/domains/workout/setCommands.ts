import type {
  ActiveWorkoutRepository,
  AddWorkingSetInput,
  AddWarmupInput,
  CompleteSetInput,
  CompleteSetResult,
  CompleteWarmupInput,
  CopyPreviousWarmupInput,
  ReviseCompletedSetInput,
  SetObservation,
  SkipWorkingSetInput,
  SkipWarmupInput,
  UpdateActiveSetDraftInput,
  UpdateWarmupDraftInput,
} from "./activeWorkout";
import {
  parseMetricObservation,
  type MetricIdentity,
} from "../metrics";
import type {
  HapticsPort,
} from "./hapticsPort";

function validateObservation(
  identity: MetricIdentity,
  observation: SetObservation,
  requireCompletedValue: boolean,
): void {
  if (observation.profile === "load_reps" && observation.version !== 1) {
    throw new TypeError("unsupported_observation_version");
  }
  if (observation.profile === "load_reps") {
    if (
      Number.isSafeInteger(observation.loadGrams)
      && observation.loadGrams >= 0
      && Number.isSafeInteger(observation.reps)
      && observation.reps === 0
      && !requireCompletedValue
    ) {
      return;
    }
  }
  if (
    observation.profile === "timed_hold"
    && observation.version === 1
    && Number.isSafeInteger(observation.durationSeconds)
    && observation.durationSeconds === 0
    && !requireCompletedValue
  ) {
    return;
  }
  try {
    parseMetricObservation(identity, observation);
  } catch {
    if (observation.profile === "load_reps") {
      throw new TypeError("invalid_load_reps_observation");
    }
    if (observation.profile === "timed_hold" && observation.version === 1) {
      throw new TypeError("invalid_timed_hold_observation");
    }
    throw new TypeError("metric_observation_invalid");
  }
  if (
    requireCompletedValue
    && (
      (observation.profile === "unscored" && !observation.completed)
      || (observation.profile === "fixed_time"
        && observation.distanceMeters < 1)
      || (observation.profile === "intervals"
        && observation.completedRounds < 1
        && observation.completedWorkMs < 1)
    )
  ) {
    throw new TypeError("metric_observation_invalid");
  }
}

export async function updateActiveSetDraft(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: UpdateActiveSetDraftInput;
}>) {
  validateObservation(
    input.input.metricIdentity,
    input.input.observation,
    false,
  );
  return input.repository.updateActiveSetDraft(input.input);
}

export async function updateWarmupDraft(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: UpdateWarmupDraftInput;
}>) {
  validateObservation({
    profile: "load_reps",
    contractVersion: 1,
    exerciseMetricGeneration: 1,
  }, input.input.observation, false);
  return input.repository.updateWarmupDraft(input.input);
}

export async function addWarmup(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: AddWarmupInput;
}>) {
  validateObservation({
    profile: "load_reps",
    contractVersion: 1,
    exerciseMetricGeneration: 1,
  }, input.input.observation, false);
  return input.repository.addWarmup(input.input);
}

export async function addWorkingSet(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: AddWorkingSetInput;
}>) {
  return input.repository.addWorkingSet(input.input);
}

export async function copyPreviousWarmup(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: CopyPreviousWarmupInput;
}>) {
  return input.repository.copyPreviousWarmup(input.input);
}

export async function completeWarmup(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: CompleteWarmupInput;
}>) {
  return input.repository.completeWarmup(input.input);
}

export async function skipWarmup(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: SkipWarmupInput;
}>) {
  return input.repository.skipWarmup(input.input);
}

export async function skipWorkingSet(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: SkipWorkingSetInput;
}>) {
  return input.repository.skipWorkingSet(input.input);
}

export async function completeSet(input: Readonly<{
  repository: ActiveWorkoutRepository;
  haptics: HapticsPort;
  invalidate(): Promise<void>;
  drainEffects(): Promise<void>;
  input: CompleteSetInput;
}>): Promise<CompleteSetResult> {
  validateObservation(
    input.input.metricIdentity,
    input.input.observation,
    true,
  );
  const result = await input.repository.completeSet(input.input);
  if (result.outcome === "committed") {
    await input.invalidate().catch(() => undefined);
    await input.haptics.committed().catch(() => undefined);
    await input.drainEffects().catch(() => undefined);
  }
  return result;
}

export async function reviseCompletedSet(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: ReviseCompletedSetInput;
}>) {
  if (input.input.correctionIdempotencyKey.trim().length === 0) {
    throw new TypeError("invalid_correction_idempotency_key");
  }
  validateObservation(
    input.input.metricIdentity,
    input.input.observation,
    true,
  );
  return input.repository.reviseCompletedSet(input.input);
}

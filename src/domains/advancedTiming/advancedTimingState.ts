import type {
  AdvancedTimingCueChannels,
  AdvancedTimingConfigV1,
} from "./advancedTimingConfig";

export type AdvancedTimingStateV1 =
  | Readonly<{
      version: 1;
      state: "idle";
      revision: number;
      targetSessionSetId: null;
    }>
  | Readonly<{
      version: 1;
      state: "running";
      mode: "per_rep";
      revision: number;
      targetSessionSetId: string;
      cueChannels: AdvancedTimingCueChannels;
      intervalMs: number;
      startedAtMs: number;
      nextBoundaryAtMs: number;
      nextRepetitionIndex: number;
    }>
  | Readonly<{
      version: 1;
      state: "paused";
      mode: "per_rep";
      revision: number;
      targetSessionSetId: string;
      cueChannels: AdvancedTimingCueChannels;
      intervalMs: number;
      remainingMs: number;
      nextRepetitionIndex: number;
    }>
  | Readonly<{
      version: 1;
      state: "stopped";
      mode: "per_rep";
      revision: number;
      targetSessionSetId: string;
      stoppedAtMs: number;
      nextRepetitionIndex: number;
    }>;

export type AdvancedTimingCue = Readonly<{
  repetitionIndex: number;
  boundaryAtMs: number;
}>;

export class AdvancedTimingStateTransitionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AdvancedTimingStateTransitionError";
  }
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertTime(value: number): void {
  if (!validTime(value)) throw new AdvancedTimingStateTransitionError("advanced_timing_time_invalid");
}

function assertIdentifier(value: string): void {
  if (value.trim().length === 0 || value.length > 256) {
    throw new AdvancedTimingStateTransitionError("advanced_timing_target_invalid");
  }
}

function assertRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AdvancedTimingStateTransitionError("advanced_timing_state_invalid");
  }
}

function inactive(state: AdvancedTimingStateV1): boolean {
  return state.state === "idle" || state.state === "stopped";
}

export function startAdvancedTimingState(input: Readonly<{
  current: AdvancedTimingStateV1;
  config: AdvancedTimingConfigV1;
  sessionSetId: string;
  nowMs: number;
}>): AdvancedTimingStateV1 {
  assertTime(input.nowMs);
  assertIdentifier(input.sessionSetId);
  assertRevision(input.current.revision);
  if (!inactive(input.current)) throw new AdvancedTimingStateTransitionError("advanced_timing_already_active");
  if (input.current.state === "idle" && input.current.targetSessionSetId !== null) {
    throw new AdvancedTimingStateTransitionError("advanced_timing_state_invalid");
  }
  if (input.config.mode !== "per_rep") {
    throw new AdvancedTimingStateTransitionError("advanced_timing_config_not_per_rep");
  }
  return Object.freeze({
    version: 1,
    state: "running",
    mode: "per_rep",
    revision: input.current.revision + 1,
    targetSessionSetId: input.sessionSetId,
    cueChannels: input.config.cueChannels,
    intervalMs: input.config.intervalMs,
    startedAtMs: input.nowMs,
    nextBoundaryAtMs: input.nowMs + input.config.intervalMs,
    nextRepetitionIndex: 1,
  });
}

export function pauseAdvancedTimingState(
  state: AdvancedTimingStateV1,
  nowMs: number,
): AdvancedTimingStateV1 {
  assertTime(nowMs);
  if (state.state !== "running") throw new AdvancedTimingStateTransitionError("advanced_timing_not_running");
  return Object.freeze({
    version: 1,
    state: "paused",
    mode: "per_rep",
    revision: state.revision + 1,
    targetSessionSetId: state.targetSessionSetId,
    cueChannels: state.cueChannels,
    intervalMs: state.intervalMs,
    remainingMs: Math.max(0, state.nextBoundaryAtMs - nowMs),
    nextRepetitionIndex: state.nextRepetitionIndex,
  });
}

export function resumeAdvancedTimingState(
  state: AdvancedTimingStateV1,
  nowMs: number,
): AdvancedTimingStateV1 {
  assertTime(nowMs);
  if (state.state !== "paused") throw new AdvancedTimingStateTransitionError("advanced_timing_not_paused");
  return Object.freeze({
    version: 1,
    state: "running",
    mode: "per_rep",
    revision: state.revision + 1,
    targetSessionSetId: state.targetSessionSetId,
    cueChannels: state.cueChannels,
    intervalMs: state.intervalMs,
    startedAtMs: nowMs,
    nextBoundaryAtMs: nowMs + state.remainingMs,
    nextRepetitionIndex: state.nextRepetitionIndex,
  });
}

export function stopAdvancedTimingState(
  state: AdvancedTimingStateV1,
  nowMs: number,
): AdvancedTimingStateV1 {
  assertTime(nowMs);
  if (state.state !== "running" && state.state !== "paused") {
    throw new AdvancedTimingStateTransitionError("advanced_timing_not_active");
  }
  return Object.freeze({
    version: 1,
    state: "stopped",
    mode: "per_rep",
    revision: state.revision + 1,
    targetSessionSetId: state.targetSessionSetId,
    stoppedAtMs: nowMs,
    nextRepetitionIndex: state.nextRepetitionIndex,
  });
}

export function reconcileAdvancedTimingState(input: Readonly<{
  state: AdvancedTimingStateV1;
  nowMs: number;
  foregroundSinceMs: number;
}>): Readonly<{
  state: AdvancedTimingStateV1;
  cue: AdvancedTimingCue | null;
  skippedBoundaryCount: number;
}> {
  assertTime(input.nowMs);
  assertTime(input.foregroundSinceMs);
  if (input.foregroundSinceMs > input.nowMs) {
    throw new AdvancedTimingStateTransitionError("advanced_timing_time_invalid");
  }
  if (input.state.state !== "running" || input.nowMs < input.state.nextBoundaryAtMs) {
    return Object.freeze({ state: input.state, cue: null, skippedBoundaryCount: 0 });
  }
  const crossedCount = Math.floor(
    (input.nowMs - input.state.nextBoundaryAtMs) / input.state.intervalMs,
  ) + 1;
  const lastBoundaryAtMs = input.state.nextBoundaryAtMs
    + ((crossedCount - 1) * input.state.intervalMs);
  const firstForegroundBoundaryIndex = input.foregroundSinceMs <= input.state.nextBoundaryAtMs
    ? 1
    : Math.ceil((input.foregroundSinceMs - input.state.nextBoundaryAtMs) / input.state.intervalMs) + 1;
  const cueIsForeground = firstForegroundBoundaryIndex <= crossedCount;
  const nextBoundaryAtMs = input.state.nextBoundaryAtMs
    + (crossedCount * input.state.intervalMs);
  const nextRepetitionIndex = input.state.nextRepetitionIndex + crossedCount;
  return Object.freeze({
    state: Object.freeze({
      ...input.state,
      revision: input.state.revision + 1,
      nextBoundaryAtMs,
      nextRepetitionIndex,
    }),
    cue: cueIsForeground
      ? Object.freeze({
        repetitionIndex: input.state.nextRepetitionIndex + crossedCount - 1,
        boundaryAtMs: lastBoundaryAtMs,
      })
      : null,
    skippedBoundaryCount: cueIsForeground ? crossedCount - 1 : crossedCount,
  });
}

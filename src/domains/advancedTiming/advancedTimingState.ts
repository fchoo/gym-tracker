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
    }>
  | Readonly<{
      version: 1;
      state: "stopped";
      mode: "cluster";
      revision: number;
      targetSessionSetId: string;
      stoppedAtMs: number;
      currentGroupIndex: number;
    }>
  | Readonly<{
      version: 1;
      state: "cluster_ready";
      mode: "cluster";
      revision: number;
      targetSessionSetId: string;
      cueChannels: AdvancedTimingCueChannels;
      groupSizes: readonly number[];
      intraRestMs: number;
      currentGroupIndex: number;
    }>
  | Readonly<{
      version: 1;
      state: "cluster_gap_running";
      mode: "cluster";
      revision: number;
      targetSessionSetId: string;
      cueChannels: AdvancedTimingCueChannels;
      groupSizes: readonly number[];
      intraRestMs: number;
      currentGroupIndex: number;
      gapStartedAtMs: number;
      gapEndsAtMs: number;
    }>
  | Readonly<{
      version: 1;
      state: "cluster_gap_paused";
      mode: "cluster";
      revision: number;
      targetSessionSetId: string;
      cueChannels: AdvancedTimingCueChannels;
      groupSizes: readonly number[];
      intraRestMs: number;
      currentGroupIndex: number;
      remainingMs: number;
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

type ActiveClusterTimingState = Extract<
  AdvancedTimingStateV1,
  { state: "cluster_ready" | "cluster_gap_running" | "cluster_gap_paused" }
>;

function clusterState(
  input: Readonly<{
    base: ActiveClusterTimingState;
    state: "cluster_ready";
    revision: number;
    currentGroupIndex: number;
  }>,
): AdvancedTimingStateV1 {
  return Object.freeze({
    version: 1,
    state: input.state,
    mode: "cluster",
    revision: input.revision,
    targetSessionSetId: input.base.targetSessionSetId,
    cueChannels: input.base.cueChannels,
    groupSizes: input.base.groupSizes,
    intraRestMs: input.base.intraRestMs,
    currentGroupIndex: input.currentGroupIndex,
  });
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
  if (input.config.mode === "cluster") {
    return Object.freeze({
      version: 1,
      state: "cluster_ready",
      mode: "cluster",
      revision: input.current.revision + 1,
      targetSessionSetId: input.sessionSetId,
      cueChannels: input.config.cueChannels,
      groupSizes: input.config.groupSizes,
      intraRestMs: input.config.intraRestMs,
      currentGroupIndex: 0,
    });
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
  if (state.state === "cluster_gap_running") {
    return Object.freeze({
      version: 1,
      state: "cluster_gap_paused",
      mode: "cluster",
      revision: state.revision + 1,
      targetSessionSetId: state.targetSessionSetId,
      cueChannels: state.cueChannels,
      groupSizes: state.groupSizes,
      intraRestMs: state.intraRestMs,
      currentGroupIndex: state.currentGroupIndex,
      remainingMs: Math.max(0, state.gapEndsAtMs - nowMs),
    });
  }
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
  if (state.state === "cluster_gap_paused") {
    return Object.freeze({
      version: 1,
      state: "cluster_gap_running",
      mode: "cluster",
      revision: state.revision + 1,
      targetSessionSetId: state.targetSessionSetId,
      cueChannels: state.cueChannels,
      groupSizes: state.groupSizes,
      intraRestMs: state.intraRestMs,
      currentGroupIndex: state.currentGroupIndex,
      gapStartedAtMs: nowMs,
      gapEndsAtMs: nowMs + state.remainingMs,
    });
  }
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
  if (state.state === "cluster_ready" || state.state === "cluster_gap_running" || state.state === "cluster_gap_paused") {
    return Object.freeze({
      version: 1,
      state: "stopped",
      mode: "cluster",
      revision: state.revision + 1,
      targetSessionSetId: state.targetSessionSetId,
      stoppedAtMs: nowMs,
      currentGroupIndex: state.state === "cluster_ready"
        ? state.currentGroupIndex
        : state.currentGroupIndex + 1,
    });
  }
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

export function beginClusterGapState(
  state: AdvancedTimingStateV1,
  nowMs: number,
): AdvancedTimingStateV1 {
  assertTime(nowMs);
  if (state.state !== "cluster_ready") {
    throw new AdvancedTimingStateTransitionError("advanced_timing_cluster_not_ready");
  }
  if (state.currentGroupIndex >= state.groupSizes.length - 1) {
    throw new AdvancedTimingStateTransitionError("advanced_timing_cluster_complete");
  }
  return Object.freeze({
    version: 1,
    state: "cluster_gap_running",
    mode: "cluster",
    revision: state.revision + 1,
    targetSessionSetId: state.targetSessionSetId,
    cueChannels: state.cueChannels,
    groupSizes: state.groupSizes,
    intraRestMs: state.intraRestMs,
    currentGroupIndex: state.currentGroupIndex,
    gapStartedAtMs: nowMs,
    gapEndsAtMs: nowMs + state.intraRestMs,
  });
}

export function skipClusterGapState(
  state: AdvancedTimingStateV1,
): AdvancedTimingStateV1 {
  if (state.state !== "cluster_gap_running" && state.state !== "cluster_gap_paused") {
    throw new AdvancedTimingStateTransitionError("advanced_timing_cluster_gap_not_active");
  }
  return clusterState({
    base: state,
    state: "cluster_ready",
    revision: state.revision + 1,
    currentGroupIndex: state.currentGroupIndex + 1,
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
  if (input.state.state === "cluster_gap_running") {
    if (input.nowMs < input.state.gapEndsAtMs) {
      return Object.freeze({ state: input.state, cue: null, skippedBoundaryCount: 0 });
    }
    const cue = input.foregroundSinceMs <= input.state.gapEndsAtMs
      ? Object.freeze({
        repetitionIndex: input.state.currentGroupIndex + 2,
        boundaryAtMs: input.state.gapEndsAtMs,
      })
      : null;
    return Object.freeze({
      state: clusterState({
        base: input.state,
        state: "cluster_ready",
        revision: input.state.revision + 1,
        currentGroupIndex: input.state.currentGroupIndex + 1,
      }),
      cue,
      skippedBoundaryCount: cue === null ? 1 : 0,
    });
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

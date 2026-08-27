export type RestStateV1 =
  | Readonly<{
      version: 1;
      state: "idle";
      revision: number;
      nextSetId: string | null;
    }>
  | Readonly<{
      version: 1;
      state: "running";
      revision: number;
      startedAtMs: number;
      endsAtMs: number;
      nextSetId: string | null;
    }>
  | Readonly<{
      version: 1;
      state: "paused";
      revision: number;
      remainingMs: number;
      nextSetId: string | null;
    }>
  | Readonly<{
      version: 1;
      state: "expired";
      revision: number;
      expiredAtMs: number;
      nextSetId: string | null;
    }>;

export class RestStateTransitionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "RestStateTransitionError";
  }
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertTime(value: number): void {
  if (!validTime(value)) {
    throw new RestStateTransitionError("rest_time_invalid");
  }
}

export function remainingRestMs(
  state: RestStateV1,
  nowMs: number,
): number {
  assertTime(nowMs);
  if (state.state === "running") {
    return Math.max(0, state.endsAtMs - nowMs);
  }
  return state.state === "paused" ? state.remainingMs : 0;
}

export function startRestState(input: Readonly<{
  current: RestStateV1;
  nowMs: number;
  durationMs: number;
  nextSetId: string | null;
}>): RestStateV1 {
  assertTime(input.nowMs);
  if (!Number.isSafeInteger(input.durationMs) || input.durationMs <= 0) {
    throw new RestStateTransitionError("rest_duration_invalid");
  }
  if (input.current.state === "running" || input.current.state === "paused") {
    throw new RestStateTransitionError("rest_already_active");
  }
  return {
    version: 1,
    state: "running",
    revision: input.current.revision + 1,
    startedAtMs: input.nowMs,
    endsAtMs: input.nowMs + input.durationMs,
    nextSetId: input.nextSetId,
  };
}

export function pauseRestState(
  state: RestStateV1,
  nowMs: number,
): RestStateV1 {
  if (state.state !== "running") {
    throw new RestStateTransitionError("rest_not_running");
  }
  const remainingMs = remainingRestMs(state, nowMs);
  if (remainingMs === 0) {
    return {
      version: 1,
      state: "expired",
      revision: state.revision + 1,
      expiredAtMs: nowMs,
      nextSetId: state.nextSetId,
    };
  }
  return {
    version: 1,
    state: "paused",
    revision: state.revision + 1,
    remainingMs,
    nextSetId: state.nextSetId,
  };
}

export function resumeRestState(
  state: RestStateV1,
  nowMs: number,
): RestStateV1 {
  assertTime(nowMs);
  if (state.state !== "paused") {
    throw new RestStateTransitionError("rest_not_paused");
  }
  if (state.remainingMs === 0) {
    return {
      version: 1,
      state: "expired",
      revision: state.revision + 1,
      expiredAtMs: nowMs,
      nextSetId: state.nextSetId,
    };
  }
  return {
    version: 1,
    state: "running",
    revision: state.revision + 1,
    startedAtMs: nowMs,
    endsAtMs: nowMs + state.remainingMs,
    nextSetId: state.nextSetId,
  };
}

export function adjustRestState(
  state: RestStateV1,
  nowMs: number,
  deltaMs: number,
): RestStateV1 {
  assertTime(nowMs);
  if (
    !Number.isSafeInteger(deltaMs)
    || (deltaMs !== -15_000 && deltaMs !== 15_000)
  ) {
    throw new RestStateTransitionError("rest_adjustment_invalid");
  }
  if (state.state !== "running" && state.state !== "paused") {
    throw new RestStateTransitionError("rest_not_adjustable");
  }
  const adjustedMs = Math.max(
    0,
    remainingRestMs(state, nowMs) + deltaMs,
  );
  if (adjustedMs === 0) {
    return {
      version: 1,
      state: "expired",
      revision: state.revision + 1,
      expiredAtMs: nowMs,
      nextSetId: state.nextSetId,
    };
  }
  return state.state === "paused"
    ? {
        version: 1,
        state: "paused",
        revision: state.revision + 1,
        remainingMs: adjustedMs,
        nextSetId: state.nextSetId,
      }
    : {
        version: 1,
        state: "running",
        revision: state.revision + 1,
        startedAtMs: state.startedAtMs,
        endsAtMs: nowMs + adjustedMs,
        nextSetId: state.nextSetId,
      };
}

export function expireRestState(
  state: RestStateV1,
  nowMs: number,
): RestStateV1 {
  assertTime(nowMs);
  if (state.state !== "running") {
    throw new RestStateTransitionError("rest_not_running");
  }
  if (nowMs < state.endsAtMs) {
    throw new RestStateTransitionError("rest_not_due");
  }
  return {
    version: 1,
    state: "expired",
    revision: state.revision + 1,
    expiredAtMs: nowMs,
    nextSetId: state.nextSetId,
  };
}

export function skipRestState(state: RestStateV1): RestStateV1 {
  if (state.state === "idle") {
    throw new RestStateTransitionError("rest_not_active");
  }
  return {
    version: 1,
    state: "idle",
    revision: state.revision + 1,
    nextSetId: null,
  };
}

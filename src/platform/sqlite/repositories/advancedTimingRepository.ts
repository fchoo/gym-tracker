import {
  AdvancedTimingStateTransitionError,
  parseAdvancedTimingConfig,
  pauseAdvancedTimingState,
  reconcileAdvancedTimingState,
  resumeAdvancedTimingState,
  startAdvancedTimingState,
  stopAdvancedTimingState,
  type AdvancedTimingCommandResult,
  type AdvancedTimingConfigV1,
  type AdvancedTimingRepository,
  type AdvancedTimingRevisionInput,
  type AdvancedTimingStateV1,
} from "../../../domains/advancedTiming";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";

type AdvancedTimingRow = Readonly<{
  session_set_id: string | null;
  state_version: number;
  revision: number;
  status: "idle" | "running" | "paused" | "stopped" | "expired";
  mode: "per_rep" | "cluster" | null;
  config_json: string;
  progress_json: string;
  started_at_ms: number | null;
  next_boundary_at_ms: number | null;
  remaining_ms: number | null;
  stopped_at_ms: number | null;
}>;

type SessionRow = Readonly<{
  revision: number;
  active_set_id: string | null;
}>;

type TargetRow = Readonly<{
  status: "planned" | "draft" | "completed" | "skipped";
  advanced_timing_resolved_json: string;
}>;

export type AdvancedTimingContext = Readonly<{
  sessionId: string;
  state: AdvancedTimingStateV1;
  sessionRevision: number;
}>;

export type AdvancedTimingRepositoryPort = AdvancedTimingRepository & Readonly<{
  getAdvancedTimingContext(sessionId: string): Promise<AdvancedTimingContext | null>;
  listActiveTimingContexts(): Promise<readonly AdvancedTimingContext[]>;
}>;

export class AdvancedTimingRepositoryError extends Error {
  readonly kind = "conflict" as const;
  readonly retryable = false;

  constructor(readonly code: string) {
    super(code);
    this.name = "AdvancedTimingRepositoryError";
  }
}

type PersistedAdvancedTimingState = Exclude<
  AdvancedTimingStateV1,
  Readonly<{ state: "idle" }>
>;

type MutableTimingContext = Readonly<{
  session: SessionRow;
  stored: Readonly<{
    state: AdvancedTimingStateV1;
    config: AdvancedTimingConfigV1;
  }>;
  target: TargetRow;
}>;

type MutableTimingContextResult =
  | Readonly<{ kind: "context"; context: MutableTimingContext }>
  | Readonly<{ kind: "conflict"; code: string }>;

function idleState(revision = 0): AdvancedTimingStateV1 {
  return Object.freeze({
    version: 1,
    state: "idle",
    revision,
    targetSessionSetId: null,
  });
}

function safeProgress(row: AdvancedTimingRow): number {
  try {
    const value = JSON.parse(row.progress_json) as {
      nextRepetitionIndex?: unknown;
    };
    if (
      typeof value.nextRepetitionIndex === "number"
      && Number.isSafeInteger(value.nextRepetitionIndex)
      && value.nextRepetitionIndex >= 1
    ) {
      return value.nextRepetitionIndex;
    }
  } catch {}
  throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
}

function stateFromRow(
  row: AdvancedTimingRow | undefined,
): Readonly<{ state: AdvancedTimingStateV1; config: AdvancedTimingConfigV1 }> {
  if (row === undefined) {
    return Object.freeze({
      state: idleState(),
      config: Object.freeze({ version: 1, mode: "off" }),
    });
  }
  let config: AdvancedTimingConfigV1;
  try {
    config = parseAdvancedTimingConfig(JSON.parse(row.config_json));
  } catch {
    throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
  }
  if (row.state_version !== 1) {
    throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
  }
  if (row.status === "idle") {
    if (row.session_set_id !== null || row.mode !== null || config.mode !== "off") {
      throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
    }
    return Object.freeze({ state: idleState(row.revision), config });
  }
  if (
    row.status === "expired"
    || row.mode !== "per_rep"
    || config.mode !== "per_rep"
    || row.session_set_id === null
  ) {
    throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
  }
  const nextRepetitionIndex = safeProgress(row);
  if (row.status === "running") {
    if (row.started_at_ms === null || row.next_boundary_at_ms === null) {
      throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
    }
    return Object.freeze({
      config,
      state: Object.freeze({
        version: 1,
        state: "running",
        mode: "per_rep",
        revision: row.revision,
        targetSessionSetId: row.session_set_id,
        cueChannels: config.cueChannels,
        intervalMs: config.intervalMs,
        startedAtMs: row.started_at_ms,
        nextBoundaryAtMs: row.next_boundary_at_ms,
        nextRepetitionIndex,
      }),
    });
  }
  if (row.status === "paused") {
    if (row.remaining_ms === null) {
      throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
    }
    return Object.freeze({
      config,
      state: Object.freeze({
        version: 1,
        state: "paused",
        mode: "per_rep",
        revision: row.revision,
        targetSessionSetId: row.session_set_id,
        cueChannels: config.cueChannels,
        intervalMs: config.intervalMs,
        remainingMs: row.remaining_ms,
        nextRepetitionIndex,
      }),
    });
  }
  if (row.stopped_at_ms === null) {
    throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
  }
  return Object.freeze({
    config,
    state: Object.freeze({
      version: 1,
      state: "stopped",
      mode: "per_rep",
      revision: row.revision,
      targetSessionSetId: row.session_set_id,
      stoppedAtMs: row.stopped_at_ms,
      nextRepetitionIndex,
    }),
  });
}

function stateColumns(
  state: PersistedAdvancedTimingState,
  config: AdvancedTimingConfigV1,
): Readonly<{
  sessionSetId: string | null;
  status: AdvancedTimingRow["status"];
  mode: AdvancedTimingRow["mode"];
  configJson: string;
  progressJson: string;
  startedAtMs: number | null;
  nextBoundaryAtMs: number | null;
  remainingMs: number | null;
  stoppedAtMs: number | null;
}> {
  const common = {
    sessionSetId: state.targetSessionSetId,
    mode: "per_rep" as const,
    configJson: JSON.stringify(config),
    progressJson: JSON.stringify({
      nextRepetitionIndex: state.nextRepetitionIndex,
    }),
  };
  if (state.state === "running") {
    return {
      ...common,
      status: "running",
      startedAtMs: state.startedAtMs,
      nextBoundaryAtMs: state.nextBoundaryAtMs,
      remainingMs: null,
      stoppedAtMs: null,
    };
  }
  if (state.state === "paused") {
    return {
      ...common,
      status: "paused",
      startedAtMs: null,
      nextBoundaryAtMs: null,
      remainingMs: state.remainingMs,
      stoppedAtMs: null,
    };
  }
  return {
    ...common,
    status: "stopped",
    startedAtMs: null,
    nextBoundaryAtMs: null,
    remainingMs: null,
    stoppedAtMs: state.stoppedAtMs,
  };
}

async function readStoredState(
  executor: Pick<SqliteTransactionExecutor, "queryAll">,
  sessionId: string,
) {
  const [row] = await executor.queryAll<AdvancedTimingRow>(
    `SELECT session_set_id, state_version, revision, status, mode, config_json, progress_json,
            started_at_ms, next_boundary_at_ms, remaining_ms, stopped_at_ms
     FROM session_advanced_timing_states
     WHERE session_id = ?`,
    [sessionId],
  );
  return stateFromRow(row);
}

async function readSession(
  transaction: SqliteTransactionExecutor,
  sessionId: string,
): Promise<SessionRow | null> {
  const [row] = await transaction.queryAll<SessionRow>(
    `SELECT revision, active_set_id
     FROM workout_sessions
     WHERE id = ? AND status = 'in_progress'`,
    [sessionId],
  );
  return row ?? null;
}

async function readTarget(
  transaction: SqliteTransactionExecutor,
  sessionId: string,
  sessionSetId: string,
): Promise<TargetRow | null> {
  const [row] = await transaction.queryAll<TargetRow>(
    `SELECT ss.status, ss.advanced_timing_resolved_json
     FROM session_sets ss
     JOIN session_exercises se ON se.id = ss.session_exercise_id
     WHERE ss.id = ? AND se.session_id = ?`,
    [sessionSetId, sessionId],
  );
  return row ?? null;
}

async function persistState(
  transaction: SqliteTransactionExecutor,
  sessionId: string,
  state: PersistedAdvancedTimingState,
  config: AdvancedTimingConfigV1,
): Promise<void> {
  const columns = stateColumns(state, config);
  await transaction.execute(
    `INSERT INTO session_advanced_timing_states
      (session_id, session_set_id, state_version, revision, status, mode,
       config_json, progress_json, started_at_ms, next_boundary_at_ms,
       remaining_ms, stopped_at_ms)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       session_set_id = excluded.session_set_id,
       state_version = 1,
       revision = excluded.revision,
       status = excluded.status,
       mode = excluded.mode,
       config_json = excluded.config_json,
       progress_json = excluded.progress_json,
       started_at_ms = excluded.started_at_ms,
       next_boundary_at_ms = excluded.next_boundary_at_ms,
       remaining_ms = excluded.remaining_ms,
       stopped_at_ms = excluded.stopped_at_ms`,
    [
      sessionId,
      columns.sessionSetId,
      state.revision,
      columns.status,
      columns.mode,
      columns.configJson,
      columns.progressJson,
      columns.startedAtMs,
      columns.nextBoundaryAtMs,
      columns.remainingMs,
      columns.stoppedAtMs,
    ],
  );
}

async function readMutableTimingContext(
  transaction: SqliteTransactionExecutor,
  input: AdvancedTimingRevisionInput,
): Promise<MutableTimingContextResult> {
  const session = await readSession(transaction, input.sessionId);
  if (session === null) {
    return { kind: "conflict", code: "advanced_timing_session_missing" };
  }
  if (session.revision !== input.expectedSessionRevision) {
    return { kind: "conflict", code: "advanced_timing_session_revision_conflict" };
  }
  const target = await readTarget(transaction, input.sessionId, input.sessionSetId);
  if (target === null) {
    return { kind: "conflict", code: "advanced_timing_target_not_owned" };
  }
  if (session.active_set_id !== input.sessionSetId) {
    return { kind: "conflict", code: "advanced_timing_target_not_active" };
  }
  if (target.status !== "planned" && target.status !== "draft") {
    return { kind: "conflict", code: "advanced_timing_target_not_available" };
  }
  let stored: MutableTimingContext["stored"];
  try {
    stored = await readStoredState(transaction, input.sessionId);
  } catch (error) {
    if (error instanceof AdvancedTimingRepositoryError) {
      return { kind: "conflict", code: error.code };
    }
    throw error;
  }
  if (stored.state.revision !== input.expectedAdvancedTimingRevision) {
    return { kind: "conflict", code: "advanced_timing_revision_conflict" };
  }
  return {
    kind: "context",
    context: Object.freeze({ session, stored, target }),
  };
}

function commandResult(
  sessionId: string,
  sessionRevision: number,
  state: AdvancedTimingStateV1,
): AdvancedTimingCommandResult {
  return Object.freeze({
    state,
    sessionRevision,
    invalidationScopes: [
      ["active-workout", sessionId],
      ["today"],
    ] as const,
  });
}

type TransitionInput = AdvancedTimingRevisionInput & Readonly<{
  config?: AdvancedTimingConfigV1;
  foregroundSinceMs?: number;
  operation: "start" | "pause" | "resume" | "reconcile" | "stop";
}>;

async function configure(
  kernel: SqliteKernel,
  input: AdvancedTimingRevisionInput & Readonly<{ config: AdvancedTimingConfigV1 }>,
): Promise<AdvancedTimingCommandResult> {
  const outcome = await kernel.write(async (transaction) => {
    const context = await readMutableTimingContext(transaction, input);
    if (context.kind === "conflict") return context;
    const { session, stored } = context.context;
    if (stored.state.state !== "idle" && stored.state.state !== "stopped") {
      return { kind: "conflict" as const, code: "advanced_timing_config_active" };
    }

    const config = parseAdvancedTimingConfig(input.config);
    const configJson = JSON.stringify(config);
    const update = await transaction.execute(
      `UPDATE session_sets
       SET advanced_timing_override_json = ?,
           advanced_timing_resolved_json = ?
       WHERE id = ?
         AND set_kind = 'working'
         AND status IN ('planned', 'draft')
         AND session_exercise_id IN (
           SELECT id FROM session_exercises WHERE session_id = ?
         )`,
      [configJson, configJson, input.sessionSetId, input.sessionId],
    );
    if (update.changes !== 1) {
      return { kind: "conflict" as const, code: "advanced_timing_config_conflict" };
    }
    const sessionUpdate = await transaction.execute(
      `UPDATE workout_sessions
       SET revision = revision + 1
       WHERE id = ? AND status = 'in_progress' AND revision = ?`,
      [input.sessionId, input.expectedSessionRevision],
    );
    if (sessionUpdate.changes !== 1) {
      return { kind: "conflict" as const, code: "advanced_timing_session_revision_conflict" };
    }
    return {
      kind: "result" as const,
      result: commandResult(input.sessionId, session.revision + 1, stored.state),
    };
  });
  if (outcome.kind === "conflict") {
    throw new AdvancedTimingRepositoryError(outcome.code);
  }
  return outcome.result;
}

async function transition(
  kernel: SqliteKernel,
  input: TransitionInput,
): Promise<AdvancedTimingCommandResult & Readonly<{ cue?: ReturnType<typeof reconcileAdvancedTimingState>["cue"] }>> {
  const outcome = await kernel.write(async (transaction) => {
    const context = await readMutableTimingContext(transaction, input);
    if (context.kind === "conflict") return context;
    const { session, stored, target } = context.context;

    let snapshotConfig: AdvancedTimingConfigV1;
    try {
      snapshotConfig = parseAdvancedTimingConfig(
        JSON.parse(target.advanced_timing_resolved_json),
      );
    } catch {
      return { kind: "conflict" as const, code: "advanced_timing_snapshot_invalid" };
    }
    if (snapshotConfig.mode !== "per_rep") {
      return { kind: "conflict" as const, code: "advanced_timing_config_not_per_rep" };
    }
    if (
      input.operation === "start"
      && JSON.stringify(input.config) !== JSON.stringify(snapshotConfig)
    ) {
      return { kind: "conflict" as const, code: "advanced_timing_config_mismatch" };
    }
    if (
      input.operation !== "start"
      && stored.state.targetSessionSetId !== input.sessionSetId
    ) {
      return { kind: "conflict" as const, code: "advanced_timing_target_mismatch" };
    }

    try {
      if (input.operation === "start") {
        const state = startAdvancedTimingState({
          current: stored.state,
          config: snapshotConfig,
          sessionSetId: input.sessionSetId,
          nowMs: input.nowMs,
        });
        await persistState(
          transaction,
          input.sessionId,
          state as PersistedAdvancedTimingState,
          snapshotConfig,
        );
        return {
          kind: "result" as const,
          result: commandResult(input.sessionId, session.revision, state),
        };
      }
      if (input.operation === "pause") {
        const state = pauseAdvancedTimingState(stored.state, input.nowMs);
        await persistState(
          transaction,
          input.sessionId,
          state as PersistedAdvancedTimingState,
          stored.config,
        );
        return {
          kind: "result" as const,
          result: commandResult(input.sessionId, session.revision, state),
        };
      }
      if (input.operation === "resume") {
        const state = resumeAdvancedTimingState(stored.state, input.nowMs);
        await persistState(
          transaction,
          input.sessionId,
          state as PersistedAdvancedTimingState,
          stored.config,
        );
        return {
          kind: "result" as const,
          result: commandResult(input.sessionId, session.revision, state),
        };
      }
      if (input.operation === "stop") {
        const state = stopAdvancedTimingState(stored.state, input.nowMs);
        await persistState(
          transaction,
          input.sessionId,
          state as PersistedAdvancedTimingState,
          stored.config,
        );
        return {
          kind: "result" as const,
          result: commandResult(input.sessionId, session.revision, state),
        };
      }
      const reconciled = reconcileAdvancedTimingState({
        state: stored.state,
        nowMs: input.nowMs,
        foregroundSinceMs: input.foregroundSinceMs!,
      });
      if (reconciled.state === stored.state) {
        return {
          kind: "result" as const,
          result: Object.freeze({
            ...commandResult(input.sessionId, session.revision, reconciled.state),
            cue: reconciled.cue,
          }),
        };
      }
      await persistState(
        transaction,
        input.sessionId,
        reconciled.state as PersistedAdvancedTimingState,
        stored.config,
      );
      return {
        kind: "result" as const,
        result: Object.freeze({
          ...commandResult(input.sessionId, session.revision, reconciled.state),
          cue: reconciled.cue,
        }),
      };
    } catch (error) {
      if (
        error instanceof AdvancedTimingStateTransitionError
      ) {
        return {
          kind: "conflict" as const,
          code: error.code,
        };
      }
      throw error;
    }
  });
  if (outcome.kind === "conflict") {
    throw new AdvancedTimingRepositoryError(outcome.code);
  }
  return outcome.result;
}

export function createAdvancedTimingRepository(
  kernel: SqliteKernel,
): AdvancedTimingRepositoryPort {
  async function getAdvancedTimingContext(
    sessionId: string,
  ): Promise<AdvancedTimingContext | null> {
    const [session] = await kernel.queryAll<SessionRow>(
      `SELECT revision, active_set_id
       FROM workout_sessions
       WHERE id = ? AND status = 'in_progress'`,
      [sessionId],
    );
    if (session === undefined) return null;
    const stored = await readStoredState(
      { queryAll: kernel.queryAll.bind(kernel) },
      sessionId,
    );
    return Object.freeze({
      sessionId,
      state: stored.state,
      sessionRevision: session.revision,
    });
  }

  const repository: AdvancedTimingRepositoryPort = {
    getAdvancedTimingContext,

    configureAdvancedTiming: (input: AdvancedTimingRevisionInput & Readonly<{
      config: AdvancedTimingConfigV1;
    }>) => configure(kernel, input),

    async listActiveTimingContexts() {
      const sessions = await kernel.queryAll<{ id: string }>(
        `SELECT ws.id
         FROM workout_sessions ws
         JOIN session_advanced_timing_states ats ON ats.session_id = ws.id
         WHERE ws.status = 'in_progress' AND ats.status = 'running'
         ORDER BY ws.started_at_ms, ws.id`,
      );
      const contexts = await Promise.all(sessions.map(({ id }) =>
        getAdvancedTimingContext(id),
      ));
      return contexts.filter((context): context is AdvancedTimingContext =>
        context !== null
      );
    },

    startAdvancedTiming: (input: AdvancedTimingRevisionInput & Readonly<{
      config: AdvancedTimingConfigV1;
    }>) => transition(kernel, {
      ...input,
      operation: "start",
    }).then(({ state, sessionRevision, invalidationScopes }) =>
      Object.freeze({ state, sessionRevision, invalidationScopes })
    ),
    pauseAdvancedTiming: (input: AdvancedTimingRevisionInput) => transition(kernel, {
      ...input,
      operation: "pause",
    }).then(({ state, sessionRevision, invalidationScopes }) =>
      Object.freeze({ state, sessionRevision, invalidationScopes })
    ),
    resumeAdvancedTiming: (input: AdvancedTimingRevisionInput) => transition(kernel, {
      ...input,
      operation: "resume",
    }).then(({ state, sessionRevision, invalidationScopes }) =>
      Object.freeze({ state, sessionRevision, invalidationScopes })
    ),
    reconcileAdvancedTiming: (input: AdvancedTimingRevisionInput & Readonly<{
      foregroundSinceMs: number;
    }>) => transition(kernel, {
      ...input,
      operation: "reconcile",
    }).then(({ state, sessionRevision, invalidationScopes, cue }) =>
      Object.freeze({ state, sessionRevision, invalidationScopes, cue: cue! })
    ),
    stopAdvancedTiming: (input: AdvancedTimingRevisionInput) => transition(kernel, {
      ...input,
      operation: "stop",
    }).then(({ state, sessionRevision, invalidationScopes }) =>
      Object.freeze({ state, sessionRevision, invalidationScopes })
    ),
  };
  return Object.freeze(repository);
}

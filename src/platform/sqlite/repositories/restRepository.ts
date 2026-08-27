import {
  adjustRestState,
  expireRestState,
  pauseRestState,
  RestCommandError,
  RestStateTransitionError,
  resumeRestState,
  skipRestState,
  startRestState,
  type AdjustRestInput,
  type RestCommandResult,
  type RestRepository,
  type RestRevisionInput,
  type RestStateV1,
} from "../../../domains/rest";
import {
  enqueuePendingEffect,
} from "../effects/effectStore";
import {
  enqueueForegroundRestFeedbackAttempt,
} from "../foregroundRestFeedbackStore";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";

type RestRow = Readonly<{
  status: "idle" | "running" | "paused" | "expired";
  started_at_ms: number | null;
  ends_at_ms: number | null;
  remaining_ms: number | null;
  expired_at_ms: number | null;
  next_set_id: string | null;
  revision: number;
}>;

type SessionContext = Readonly<{
  revision: number;
  active_set_id: string | null;
  default_rest_seconds: number | null;
}>;

function idleState(): RestStateV1 {
  return {
    version: 1,
    state: "idle",
    revision: 0,
    nextSetId: null,
  };
}

function toRestState(row: RestRow | undefined): RestStateV1 {
  if (row === undefined || row.status === "idle") {
    return {
      version: 1,
      state: "idle",
      revision: row?.revision ?? 0,
      nextSetId: null,
    };
  }
  if (row.status === "running") {
    return {
      version: 1,
      state: "running",
      revision: row.revision,
      startedAtMs: row.started_at_ms!,
      endsAtMs: row.ends_at_ms!,
      nextSetId: row.next_set_id,
    };
  }
  if (row.status === "paused") {
    return {
      version: 1,
      state: "paused",
      revision: row.revision,
      remainingMs: row.remaining_ms!,
      nextSetId: row.next_set_id,
    };
  }
  return {
    version: 1,
    state: "expired",
    revision: row.revision,
    expiredAtMs: row.expired_at_ms!,
    nextSetId: row.next_set_id,
  };
}

async function readRestState(
  executor: Pick<SqliteTransactionExecutor, "queryAll">,
  sessionId: string,
): Promise<RestStateV1> {
  const [row] = await executor.queryAll<RestRow>(
    `SELECT status, started_at_ms, ends_at_ms, remaining_ms,
            expired_at_ms, next_set_id, revision
     FROM session_rest_states
     WHERE session_id = ?`,
    [sessionId],
  );
  return toRestState(row);
}

function stateColumns(state: RestStateV1): Readonly<{
  status: RestRow["status"];
  startedAtMs: number | null;
  endsAtMs: number | null;
  remainingMs: number | null;
  expiredAtMs: number | null;
  nextSetId: string | null;
}> {
  switch (state.state) {
    case "idle":
      return {
        status: "idle",
        startedAtMs: null,
        endsAtMs: null,
        remainingMs: null,
        expiredAtMs: null,
        nextSetId: null,
      };
    case "running":
      return {
        status: "running",
        startedAtMs: state.startedAtMs,
        endsAtMs: state.endsAtMs,
        remainingMs: null,
        expiredAtMs: null,
        nextSetId: state.nextSetId,
      };
    case "paused":
      return {
        status: "paused",
        startedAtMs: null,
        endsAtMs: null,
        remainingMs: state.remainingMs,
        expiredAtMs: null,
        nextSetId: state.nextSetId,
      };
    case "expired":
      return {
        status: "expired",
        startedAtMs: null,
        endsAtMs: null,
        remainingMs: null,
        expiredAtMs: state.expiredAtMs,
        nextSetId: state.nextSetId,
      };
  }
}

async function sessionContext(
  transaction: SqliteTransactionExecutor,
  sessionId: string,
): Promise<SessionContext | null> {
  const [row] = await transaction.queryAll<SessionContext>(
    `SELECT ws.revision, ws.active_set_id, se.default_rest_seconds
     FROM workout_sessions ws
     LEFT JOIN session_exercises se
       ON se.id = ws.active_session_exercise_id
     WHERE ws.id = ? AND ws.status = 'in_progress'`,
    [sessionId],
  );
  return row ?? null;
}

async function persistRestState(
  transaction: SqliteTransactionExecutor,
  sessionId: string,
  state: RestStateV1,
): Promise<void> {
  const columns = stateColumns(state);
  await transaction.execute(
    `INSERT INTO session_rest_states
      (session_id, state_version, status, started_at_ms, ends_at_ms,
       remaining_ms, expired_at_ms, next_set_id, revision)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       state_version = 1,
       status = excluded.status,
       started_at_ms = excluded.started_at_ms,
       ends_at_ms = excluded.ends_at_ms,
       remaining_ms = excluded.remaining_ms,
       expired_at_ms = excluded.expired_at_ms,
       next_set_id = excluded.next_set_id,
       revision = excluded.revision`,
    [
      sessionId,
      columns.status,
      columns.startedAtMs,
      columns.endsAtMs,
      columns.remainingMs,
      columns.expiredAtMs,
      columns.nextSetId,
      state.revision,
    ],
  );
}

async function advanceSession(
  transaction: SqliteTransactionExecutor,
  sessionId: string,
  expectedRevision: number,
): Promise<number> {
  const result = await transaction.execute(
    `UPDATE workout_sessions
     SET revision = revision + 1
     WHERE id = ? AND status = 'in_progress' AND revision = ?`,
    [sessionId, expectedRevision],
  );
  if (result.changes !== 1) {
    throw new Error("rest_session_update_failed");
  }
  return expectedRevision + 1;
}

async function enqueueReconciliation(
  transaction: SqliteTransactionExecutor,
  sessionId: string,
  state: RestStateV1,
  nowMs: number,
): Promise<void> {
  const key = `rest:${sessionId}:${state.revision}`;
  await enqueuePendingEffect(transaction, {
    id: `effect_${key}`,
    type: "reconcile_rest_notification",
    payloadVersion: 1,
    payload: {
      version: 1,
      sessionId,
      restRevision: state.revision,
    },
    idempotencyKey: key,
    subjectId: sessionId,
    expectedRevision: state.revision,
    nowMs,
  });
}

function result(
  sessionId: string,
  sessionRevision: number,
  state: RestStateV1,
): RestCommandResult {
  return {
    state,
    sessionRevision,
    invalidationScopes: [
      ["active-workout", sessionId],
      ["today"],
    ],
  };
}

async function transition(
  kernel: SqliteKernel,
  input: RestRevisionInput,
  build: (
    current: RestStateV1,
    context: SessionContext,
  ) => RestStateV1,
  foregroundFeedbackPreferences?: import("../../../domains/rest").RestAlertPreferences,
): Promise<RestCommandResult> {
  const outcome = await kernel.write(async (transaction) => {
    const context = await sessionContext(transaction, input.sessionId);
    if (context === null) {
      return {
        kind: "conflict" as const,
        code: "active_session_missing",
      };
    }
    if (context.revision !== input.expectedSessionRevision) {
      return {
        kind: "conflict" as const,
        code: "session_revision_conflict",
      };
    }
    const current = await readRestState(transaction, input.sessionId);
    if (current.revision !== input.expectedRestRevision) {
      return {
        kind: "conflict" as const,
        code: "rest_revision_conflict",
      };
    }
    let next: RestStateV1;
    try {
      next = build(current, context);
    } catch (error) {
      if (
        error instanceof RestStateTransitionError
        || error instanceof RestCommandError
      ) {
        return {
          kind: "conflict" as const,
          code: error.code,
        };
      }
      throw error;
    }
    await persistRestState(transaction, input.sessionId, next);
    const sessionRevision = await advanceSession(
      transaction,
      input.sessionId,
      input.expectedSessionRevision,
    );
    await enqueueReconciliation(
      transaction,
      input.sessionId,
      next,
      input.nowMs,
    );
    if (next.state === "expired" && foregroundFeedbackPreferences !== undefined) {
      await enqueueForegroundRestFeedbackAttempt(transaction, {
        sessionId: input.sessionId,
        restRevision: next.revision,
        nowMs: input.nowMs,
        preferences: foregroundFeedbackPreferences,
      });
    }
    return {
      kind: "result" as const,
      result: result(input.sessionId, sessionRevision, next),
    };
  });
  if (outcome.kind === "conflict") {
    throw new RestCommandError(outcome.code);
  }
  return outcome.result;
}

export function createRestRepository(kernel: SqliteKernel): RestRepository {
  const repository: RestRepository = {
    getRestState: (sessionId) => readRestState(kernel, sessionId),

    async getRestContext(sessionId) {
      const [row] = await kernel.queryAll<{
        session_revision: number;
        status: RestRow["status"] | null;
        started_at_ms: number | null;
        ends_at_ms: number | null;
        remaining_ms: number | null;
        expired_at_ms: number | null;
        next_set_id: string | null;
        rest_revision: number | null;
      }>(
        `SELECT ws.revision AS session_revision,
                rs.status, rs.started_at_ms, rs.ends_at_ms,
                rs.remaining_ms, rs.expired_at_ms, rs.next_set_id,
                rs.revision AS rest_revision
         FROM workout_sessions ws
         LEFT JOIN session_rest_states rs ON rs.session_id = ws.id
         WHERE ws.id = ? AND ws.status = 'in_progress'`,
        [sessionId],
      );
      if (row === undefined) {
        return null;
      }
      return {
        state: row.status === null
          ? idleState()
          : toRestState({
              status: row.status,
              started_at_ms: row.started_at_ms,
              ends_at_ms: row.ends_at_ms,
              remaining_ms: row.remaining_ms,
              expired_at_ms: row.expired_at_ms,
              next_set_id: row.next_set_id,
              revision: row.rest_revision!,
            }),
        sessionRevision: row.session_revision,
      };
    },

    async listActiveSessionIds() {
      const rows = await kernel.queryAll<{ id: string }>(
        `SELECT id
         FROM workout_sessions
         WHERE status = 'in_progress'
         ORDER BY started_at_ms, id`,
      );
      return rows.map(({ id }) => id);
    },

    async currentRestRevision(sessionId) {
      const [row] = await kernel.queryAll<{ revision: number }>(
        "SELECT revision FROM session_rest_states WHERE session_id = ?",
        [sessionId],
      );
      return row?.revision ?? null;
    },

    startManualRest(input) {
      return transition(kernel, input, (current, context) => {
        if (
          context.default_rest_seconds === null
          || context.default_rest_seconds <= 0
        ) {
          throw new RestCommandError("rest_duration_missing");
        }
        return startRestState({
          current,
          nowMs: input.nowMs,
          durationMs: context.default_rest_seconds * 1_000,
          nextSetId: context.active_set_id,
        });
      });
    },

    pauseRest: (input) => transition(
      kernel,
      input,
      (current) => pauseRestState(current, input.nowMs),
    ),

    resumeRest: (input) => transition(
      kernel,
      input,
      (current) => resumeRestState(current, input.nowMs),
    ),

    adjustRest(input: AdjustRestInput) {
      return transition(
        kernel,
        input,
        (current) => adjustRestState(current, input.nowMs, input.deltaMs),
      );
    },

    skipRest: (input) => transition(
      kernel,
      input,
      (current) => skipRestState(current),
    ),

    expireRest: (input) => transition(
      kernel,
      input,
      (current) => expireRestState(current, input.nowMs),
    ),

    expireRestWithForegroundFeedback: (input) => transition(
      kernel,
      input,
      (current) => expireRestState(current, input.nowMs),
      input.preferences,
    ),
  };
  return Object.freeze(repository);
}

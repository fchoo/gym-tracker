import {
  AdvancedTimingStateTransitionError,
  beginClusterGapState,
  parseAdvancedTimingConfig,
  pauseAdvancedTimingState,
  reconcileAdvancedTimingState,
  resumeAdvancedTimingState,
  skipClusterGapState,
  startAdvancedTimingState,
  stopAdvancedTimingState,
  type AdvancedTimingCommandResult,
  type AdvancedTimingConfigV1,
  type AdvancedTimingRepository,
  type AdvancedTimingRevisionInput,
  type AdvancedTimingStateV1,
  type UpdateSessionExerciseAdvancedTimingInput,
  type UpdateSessionSetAdvancedTimingInput,
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

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function validStoredTime(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function assertValidAdvancedTimingPersistenceRow(
  value: Readonly<Record<string, unknown>>,
): asserts value is AdvancedTimingRow {
  const status = value.status;
  const mode = value.mode;
  if (value.state_version !== 1
    || !validStoredTime(value.revision)
    || !["idle", "running", "paused", "stopped"].includes(String(status))) {
    throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
  }
  let config: AdvancedTimingConfigV1;
  let progress: unknown;
  try {
    config = parseAdvancedTimingConfig(JSON.parse(String(value.config_json)));
    progress = JSON.parse(String(value.progress_json));
  } catch {
    throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
  }
  if (typeof progress !== "object" || progress === null || Array.isArray(progress)) {
    throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
  }
  const progressObject = progress as Record<string, unknown>;
  if (status === "idle") {
    if (value.session_set_id !== null || mode !== null || config.mode !== "off"
      || !exactKeys(progressObject, [])
      || value.started_at_ms !== null || value.next_boundary_at_ms !== null
      || value.remaining_ms !== null || value.stopped_at_ms !== null) {
      throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
    }
    return;
  }
  if (typeof value.session_set_id !== "string" || value.session_set_id.trim().length === 0
    || (mode !== "per_rep" && mode !== "cluster") || config.mode !== mode) {
    throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
  }
  if (mode === "per_rep") {
    if (!exactKeys(progressObject, ["nextRepetitionIndex"])
      || !validStoredTime(progressObject.nextRepetitionIndex)
      || progressObject.nextRepetitionIndex < 1) {
      throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
    }
  } else {
    if (config.mode !== "cluster") {
      throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
    }
    const progressKeys = progressObject.phase === undefined
      ? ["currentGroupIndex"]
      : ["currentGroupIndex", "phase"];
    if (!exactKeys(progressObject, progressKeys)
      || !validStoredTime(progressObject.currentGroupIndex)
      || progressObject.currentGroupIndex >= config.groupSizes.length
      || (progressObject.phase !== undefined
        && progressObject.phase !== "ready"
        && progressObject.phase !== "stopped")
      || (status === "stopped"
        && progressObject.phase !== "ready"
        && progressObject.phase !== "stopped")) {
      throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
    }
  }
  const runningTimes = status === "running"
    && validStoredTime(value.started_at_ms)
    && validStoredTime(value.next_boundary_at_ms)
    && value.remaining_ms === null
    && value.stopped_at_ms === null;
  const pausedTimes = status === "paused"
    && value.started_at_ms === null
    && value.next_boundary_at_ms === null
    && validStoredTime(value.remaining_ms)
    && value.stopped_at_ms === null;
  const stoppedTimes = status === "stopped"
    && value.started_at_ms === null
    && value.next_boundary_at_ms === null
    && value.remaining_ms === null
    && validStoredTime(value.stopped_at_ms);
  if (!runningTimes && !pausedTimes && !stoppedTimes) {
    throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
  }
}

type SessionRow = Readonly<{
  revision: number;
  active_session_exercise_id: string | null;
  active_set_id: string | null;
}>;

type TargetRow = Readonly<{
  status: "planned" | "draft" | "completed" | "skipped";
  set_kind: "warmup" | "working";
  session_exercise_id: string;
  advanced_timing_resolved_json: string;
}>;

type SessionExerciseConfigRow = Readonly<{
  session_revision: number;
  exercise_revision: number;
  status: "planned" | "active" | "completed" | "skipped";
}>;

type SessionSetConfigRow = Readonly<{
  session_revision: number;
  set_revision: number;
  status: "planned" | "draft" | "completed" | "skipped";
  exercise_default_json: string;
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
type PersistedPerRepTimingState = Extract<
  PersistedAdvancedTimingState,
  { mode: "per_rep" }
>;
type PersistedClusterTimingState = Extract<
  PersistedAdvancedTimingState,
  { mode: "cluster" }
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

function safeClusterProgress(row: AdvancedTimingRow): Readonly<{
  currentGroupIndex: number;
  phase: "ready" | "stopped" | null;
}> {
  try {
    const value = JSON.parse(row.progress_json) as {
      currentGroupIndex?: unknown;
      phase?: unknown;
    };
    if (
      typeof value.currentGroupIndex === "number"
      && Number.isSafeInteger(value.currentGroupIndex)
      && value.currentGroupIndex >= 0
    ) {
      if (
        value.phase === undefined
        || value.phase === "ready"
        || value.phase === "stopped"
      ) {
        return Object.freeze({
          currentGroupIndex: value.currentGroupIndex,
          phase: value.phase ?? null,
        });
      }
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
  assertValidAdvancedTimingPersistenceRow(row);
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
  if (row.status === "expired" || row.session_set_id === null) {
    throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
  }
  if (row.mode === "cluster" || config.mode === "cluster") {
    if (row.mode !== "cluster" || config.mode !== "cluster") {
      throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
    }
    const { currentGroupIndex, phase } = safeClusterProgress(row);
    if (currentGroupIndex >= config.groupSizes.length) {
      throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
    }
    if (row.status === "running") {
      if (row.started_at_ms === null || row.next_boundary_at_ms === null) {
        throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
      }
      return Object.freeze({
        config,
        state: Object.freeze({
          version: 1,
          state: "cluster_gap_running",
          mode: "cluster",
          revision: row.revision,
          targetSessionSetId: row.session_set_id,
          cueChannels: config.cueChannels,
          groupSizes: config.groupSizes,
          intraRestMs: config.intraRestMs,
          currentGroupIndex,
          gapStartedAtMs: row.started_at_ms,
          gapEndsAtMs: row.next_boundary_at_ms,
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
          state: "cluster_gap_paused",
          mode: "cluster",
          revision: row.revision,
          targetSessionSetId: row.session_set_id,
          cueChannels: config.cueChannels,
          groupSizes: config.groupSizes,
          intraRestMs: config.intraRestMs,
          currentGroupIndex,
          remainingMs: row.remaining_ms,
        }),
      });
    }
    if (row.status === "stopped") {
      if (row.stopped_at_ms === null) {
        throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
      }
      if (phase === "ready") {
        return Object.freeze({
          config,
          state: Object.freeze({
            version: 1,
            state: "cluster_ready",
            mode: "cluster",
            revision: row.revision,
            targetSessionSetId: row.session_set_id,
            cueChannels: config.cueChannels,
            groupSizes: config.groupSizes,
            intraRestMs: config.intraRestMs,
            currentGroupIndex,
          }),
        });
      }
      if (phase !== "stopped") {
        throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
      }
      return Object.freeze({
        config,
        state: Object.freeze({
          version: 1,
          state: "stopped",
          mode: "cluster",
          revision: row.revision,
          targetSessionSetId: row.session_set_id,
          stoppedAtMs: row.stopped_at_ms,
          currentGroupIndex,
        }),
      });
    }
    throw new AdvancedTimingRepositoryError("advanced_timing_state_invalid");
  }
  if (row.mode !== "per_rep" || config.mode !== "per_rep") {
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
  if (state.mode === "cluster") {
    const cluster = state as PersistedClusterTimingState;
    const progressJson = JSON.stringify({
      currentGroupIndex: cluster.currentGroupIndex,
      phase: cluster.state === "stopped" ? "stopped" : cluster.state === "cluster_ready" ? "ready" : undefined,
    });
    if (cluster.state === "cluster_gap_running") {
      return {
        sessionSetId: cluster.targetSessionSetId,
        status: "running",
        mode: "cluster",
        configJson: JSON.stringify(config),
        progressJson,
        startedAtMs: cluster.gapStartedAtMs,
        nextBoundaryAtMs: cluster.gapEndsAtMs,
        remainingMs: null,
        stoppedAtMs: null,
      };
    }
    if (cluster.state === "cluster_gap_paused") {
      return {
        sessionSetId: cluster.targetSessionSetId,
        status: "paused",
        mode: "cluster",
        configJson: JSON.stringify(config),
        progressJson,
        startedAtMs: null,
        nextBoundaryAtMs: null,
        remainingMs: cluster.remainingMs,
        stoppedAtMs: null,
      };
    }
    return {
      sessionSetId: cluster.targetSessionSetId,
      status: "stopped",
      mode: "cluster",
      configJson: JSON.stringify(config),
      progressJson,
      startedAtMs: null,
      nextBoundaryAtMs: null,
      remainingMs: null,
      stoppedAtMs: cluster.state === "stopped" ? cluster.stoppedAtMs : 0,
    };
  }
  const perRep = state as PersistedPerRepTimingState;
  const common = {
    sessionSetId: perRep.targetSessionSetId,
    mode: perRep.mode,
    configJson: JSON.stringify(config),
    progressJson: JSON.stringify({
      nextRepetitionIndex: perRep.nextRepetitionIndex,
    }),
  };
  if (perRep.state === "running") {
    return {
      ...common,
      status: "running",
      startedAtMs: perRep.startedAtMs,
      nextBoundaryAtMs: perRep.nextBoundaryAtMs,
      remainingMs: null,
      stoppedAtMs: null,
    };
  }
  if (perRep.state === "paused") {
    return {
      ...common,
      status: "paused",
      startedAtMs: null,
      nextBoundaryAtMs: null,
      remainingMs: perRep.remainingMs,
      stoppedAtMs: null,
    };
  }
  return {
    ...common,
    status: "stopped",
    startedAtMs: null,
    nextBoundaryAtMs: null,
    remainingMs: null,
    stoppedAtMs: perRep.stoppedAtMs,
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
    `SELECT revision, active_session_exercise_id, active_set_id
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
    `SELECT ss.status, ss.set_kind, ss.session_exercise_id,
            ss.advanced_timing_resolved_json
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
  const activeTarget = target.set_kind === "working"
    ? session.active_set_id === input.sessionSetId
    : session.active_session_exercise_id === target.session_exercise_id;
  if (!activeTarget) {
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

async function updateSessionExerciseConfig(
  kernel: SqliteKernel,
  input: UpdateSessionExerciseAdvancedTimingInput,
): Promise<AdvancedTimingCommandResult> {
  const outcome = await kernel.write(async (transaction) => {
    const [context] = await transaction.queryAll<SessionExerciseConfigRow>(
      `SELECT ws.revision AS session_revision,
              se.revision AS exercise_revision,
              se.status
       FROM session_exercises se
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE se.id = ? AND se.session_id = ? AND ws.status = 'in_progress'`,
      [input.sessionExerciseId, input.sessionId],
    );
    if (context === undefined) {
      return {
        kind: "conflict" as const,
        code: "advanced_timing_session_exercise_config_conflict",
      };
    }
    if (context.session_revision !== input.expectedSessionRevision) {
      return {
        kind: "conflict" as const,
        code: "advanced_timing_session_revision_conflict",
      };
    }
    if (
      context.exercise_revision !== input.expectedSessionExerciseRevision
      || context.status === "completed"
      || context.status === "skipped"
    ) {
      return {
        kind: "conflict" as const,
        code: "advanced_timing_session_exercise_config_conflict",
      };
    }
    let stored: Awaited<ReturnType<typeof readStoredState>>;
    try {
      stored = await readStoredState(transaction, input.sessionId);
    } catch (error) {
      if (error instanceof AdvancedTimingRepositoryError) {
        return { kind: "conflict" as const, code: error.code };
      }
      throw error;
    }
    if (stored.state.state !== "idle" && stored.state.state !== "stopped") {
      return { kind: "conflict" as const, code: "advanced_timing_config_active" };
    }
    const configJson = JSON.stringify(parseAdvancedTimingConfig(input.config));
    const exerciseUpdate = await transaction.execute(
      `UPDATE session_exercises
       SET advanced_timing_default_json = ?,
           revision = revision + 1
       WHERE id = ? AND session_id = ?
         AND revision = ?
         AND status IN ('planned', 'active')`,
      [
        configJson,
        input.sessionExerciseId,
        input.sessionId,
        input.expectedSessionExerciseRevision,
      ],
    );
    if (exerciseUpdate.changes !== 1) {
      return {
        kind: "conflict" as const,
        code: "advanced_timing_session_exercise_config_conflict",
      };
    }
    await transaction.execute(
      `UPDATE session_sets
       SET advanced_timing_resolved_json = ?,
           revision = revision + 1
       WHERE session_exercise_id = ?
         AND status IN ('planned', 'draft')
         AND advanced_timing_override_json IS NULL`,
      [configJson, input.sessionExerciseId],
    );
    const sessionUpdate = await transaction.execute(
      `UPDATE workout_sessions
       SET revision = revision + 1
       WHERE id = ? AND status = 'in_progress' AND revision = ?`,
      [input.sessionId, input.expectedSessionRevision],
    );
    if (sessionUpdate.changes !== 1) {
      return {
        kind: "conflict" as const,
        code: "advanced_timing_session_revision_conflict",
      };
    }
    return {
      kind: "result" as const,
      result: commandResult(input.sessionId, context.session_revision + 1, stored.state),
    };
  });
  if (outcome.kind === "conflict") {
    throw new AdvancedTimingRepositoryError(outcome.code);
  }
  return outcome.result;
}

async function updateSessionSetConfig(
  kernel: SqliteKernel,
  input: UpdateSessionSetAdvancedTimingInput,
): Promise<AdvancedTimingCommandResult> {
  const outcome = await kernel.write(async (transaction) => {
    const [context] = await transaction.queryAll<SessionSetConfigRow>(
      `SELECT ws.revision AS session_revision,
              ss.revision AS set_revision,
              ss.status,
              se.advanced_timing_default_json AS exercise_default_json
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ss.id = ? AND se.session_id = ? AND ws.status = 'in_progress'`,
      [input.sessionSetId, input.sessionId],
    );
    if (context === undefined) {
      return {
        kind: "conflict" as const,
        code: "advanced_timing_session_set_config_conflict",
      };
    }
    if (context.session_revision !== input.expectedSessionRevision) {
      return {
        kind: "conflict" as const,
        code: "advanced_timing_session_revision_conflict",
      };
    }
    if (
      context.set_revision !== input.expectedSetRevision
      || context.status === "completed"
      || context.status === "skipped"
    ) {
      return {
        kind: "conflict" as const,
        code: "advanced_timing_session_set_config_conflict",
      };
    }
    let stored: Awaited<ReturnType<typeof readStoredState>>;
    try {
      stored = await readStoredState(transaction, input.sessionId);
    } catch (error) {
      if (error instanceof AdvancedTimingRepositoryError) {
        return { kind: "conflict" as const, code: error.code };
      }
      throw error;
    }
    if (stored.state.state !== "idle" && stored.state.state !== "stopped") {
      return { kind: "conflict" as const, code: "advanced_timing_config_active" };
    }
    const overrideJson = input.override === null
      ? null
      : JSON.stringify(parseAdvancedTimingConfig(input.override));
    let resolvedJson: string;
    try {
      resolvedJson = overrideJson
        ?? JSON.stringify(parseAdvancedTimingConfig(
          JSON.parse(context.exercise_default_json),
        ));
    } catch {
      return { kind: "conflict" as const, code: "advanced_timing_snapshot_invalid" };
    }
    const setUpdate = await transaction.execute(
      `UPDATE session_sets
       SET advanced_timing_override_json = ?,
           advanced_timing_resolved_json = ?,
           revision = revision + 1
       WHERE id = ?
         AND revision = ?
         AND status IN ('planned', 'draft')
         AND session_exercise_id IN (
           SELECT id FROM session_exercises WHERE session_id = ?
         )`,
      [
        overrideJson,
        resolvedJson,
        input.sessionSetId,
        input.expectedSetRevision,
        input.sessionId,
      ],
    );
    if (setUpdate.changes !== 1) {
      return {
        kind: "conflict" as const,
        code: "advanced_timing_session_set_config_conflict",
      };
    }
    const sessionUpdate = await transaction.execute(
      `UPDATE workout_sessions
       SET revision = revision + 1
       WHERE id = ? AND status = 'in_progress' AND revision = ?`,
      [input.sessionId, input.expectedSessionRevision],
    );
    if (sessionUpdate.changes !== 1) {
      return {
        kind: "conflict" as const,
        code: "advanced_timing_session_revision_conflict",
      };
    }
    return {
      kind: "result" as const,
      result: commandResult(input.sessionId, context.session_revision + 1, stored.state),
    };
  });
  if (outcome.kind === "conflict") {
    throw new AdvancedTimingRepositoryError(outcome.code);
  }
  return outcome.result;
}

type TransitionInput = AdvancedTimingRevisionInput & Readonly<{
  config?: AdvancedTimingConfigV1;
  foregroundSinceMs?: number;
  operation: "start" | "begin_cluster_gap" | "pause" | "resume" | "reconcile" | "skip_cluster_gap" | "stop";
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
      if (input.operation === "begin_cluster_gap") {
        const state = beginClusterGapState(stored.state, input.nowMs);
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
      if (input.operation === "skip_cluster_gap") {
        const state = skipClusterGapState(stored.state);
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

    updateSessionExerciseAdvancedTiming: (
      input: UpdateSessionExerciseAdvancedTimingInput,
    ) => updateSessionExerciseConfig(kernel, input),

    updateSessionSetAdvancedTiming: (
      input: UpdateSessionSetAdvancedTimingInput,
    ) => updateSessionSetConfig(kernel, input),

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
    beginAdvancedTimingClusterGap: (input: AdvancedTimingRevisionInput) =>
      transition(kernel, {
        ...input,
        operation: "begin_cluster_gap",
      }).then(({ state, sessionRevision, invalidationScopes }) =>
        Object.freeze({ state, sessionRevision, invalidationScopes })
      ),
    skipAdvancedTimingClusterGap: (input: AdvancedTimingRevisionInput) =>
      transition(kernel, {
        ...input,
        operation: "skip_cluster_gap",
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

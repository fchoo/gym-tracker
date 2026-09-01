import {
  collectHistoryImpact,
  type EffectiveHistorySubjectSnapshot,
} from "../../../domains/history";
import {
  HistoryCorrectionInputError,
  prepareHistoryCorrection,
  type HistoryCorrectionSnapshot,
} from "../../../domains/history/correctionContracts";
import type {
  AvailableCorrectionExercise,
  CorrectHistorySessionInput,
  CorrectHistorySessionResult,
  HistoryAuditEvent,
  HistoryCorrectionEditorState,
  HistoryCorrectionRepository,
} from "../../../domains/history/correctionCommands";
import type {
  HistoryLifecycleRepository,
  HistoryLifecycleResult,
  RestoreHistorySessionInput,
  VoidHistorySessionInput,
} from "../../../domains/history/historyLifecycleCommands";
import {
  HistoryCorrectionConflictError,
} from "../../../domains/history/correctionCommands";
import {
  parseMetricIdentity,
  parseMetricTarget,
  type MetricIdentity,
  type MetricTarget,
} from "../../../domains/metrics";
import {
  invalidateAndAdvanceHistoryProjectionSubjects,
} from "./historyProjectionRepository";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";
import {
  SqliteStorageError,
} from "../sqliteKernel";

type StoredBaseSession = Readonly<{
  id: string;
  source: HistoryCorrectionSnapshot["session"]["source"];
  status: string;
  plan_id: string | null;
  plan_day_id: string | null;
  plan_name: string | null;
  day_name: string | null;
  local_date: string;
  timezone: string;
  started_at_ms: number;
  completed_at_ms: number | null;
  revision: number;
  effective_revision: number | null;
  lifecycle: "active" | "voided" | null;
  snapshot_json: string | null;
}>;

type StoredExercise = Readonly<{
  id: string;
  exercise_id: string;
  exercise_name: string;
  ordinal: number;
  status: "planned" | "active" | "completed" | "skipped";
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
  effort: HistoryCorrectionSnapshot["exercises"][number]["effort"];
}>;

type StoredSet = Readonly<{
  id: string;
  session_exercise_id: string;
  set_kind: "warmup" | "working";
  ordinal: number;
  status: "planned" | "draft" | "completed" | "skipped";
  target_json: string;
  observed_json: string | null;
  completed_at_ms: number | null;
  source_plan_working_set_target_id: string | null;
  source_owned_plan_working_set_target_id: string | null;
}>;

export {
  HistoryCorrectionConflictError,
};

export type HistoryCommandRepository = HistoryCorrectionRepository
  & HistoryLifecycleRepository;

type StoredAuditEvent = Readonly<{
  id: string;
  effective_revision: number;
  event_type: "correction" | "void" | "restore";
  field_identity: string;
  before_json: string;
  after_json: string;
  occurred_at_ms: number;
}>;

type AvailableExerciseRow = Readonly<{
  exercise_id: string;
  canonical_name: string;
  metric_profile: HistoryCorrectionSnapshot["exercises"][number]["metricIdentity"]["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
}>;

function parseSnapshot(value: string): HistoryCorrectionSnapshot {
  try {
    return JSON.parse(value) as HistoryCorrectionSnapshot;
  } catch {
    throw new Error("history_correction_overlay_invalid");
  }
}

function parseAuditValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("history_correction_audit_invalid");
  }
}

function auditEvent(row: StoredAuditEvent): HistoryAuditEvent {
  return Object.freeze({
    id: row.id,
    effectiveRevision: row.effective_revision,
    eventType: row.event_type,
    fieldIdentity: row.field_identity,
    before: parseAuditValue(row.before_json),
    after: parseAuditValue(row.after_json),
    occurredAtMs: row.occurred_at_ms,
  });
}

function metricIdentity(row: StoredExercise): MetricIdentity {
  return parseMetricIdentity({
    profile: row.metric_profile,
    contractVersion: row.metric_contract_version,
    exerciseMetricGeneration: row.exercise_metric_generation,
  });
}

function snapshotFromSource(
  session: StoredBaseSession,
  exercises: readonly StoredExercise[],
  sets: readonly StoredSet[],
): HistoryCorrectionSnapshot {
  if (session.status !== "completed" && session.status !== "partial") {
    throw new HistoryCorrectionConflictError("history_correction_status_invalid");
  }
  return Object.freeze({
    version: 1,
    session: Object.freeze({
      id: session.id,
      source: session.source,
      status: session.status,
      planId: session.plan_id,
      planDayId: session.plan_day_id,
      planName: session.plan_name,
      dayName: session.day_name,
      localDate: session.local_date,
      timezone: session.timezone,
      startedAtMs: session.started_at_ms,
      completedAtMs: session.completed_at_ms,
      ownerNote: null,
    }),
    exercises: Object.freeze(exercises.map((exercise) => {
      const identity = metricIdentity(exercise);
      return Object.freeze({
        id: exercise.id,
        exerciseId: exercise.exercise_id,
        name: exercise.exercise_name,
        ordinal: exercise.ordinal,
        status: exercise.status,
        metricIdentity: identity,
        effort: exercise.effort,
        sets: Object.freeze(sets
          .filter(({ session_exercise_id }) => session_exercise_id === exercise.id)
          .map((set) => Object.freeze({
            id: set.id,
            kind: set.set_kind,
            ordinal: set.ordinal,
            status: set.status,
            target: JSON.parse(set.target_json),
            observation: set.observed_json === null
              ? undefined
              : JSON.parse(set.observed_json),
            completedAtMs: set.completed_at_ms,
            ...(set.source_plan_working_set_target_id === null
              ? {}
              : { sourcePlanWorkingSetTargetId: set.source_plan_working_set_target_id }),
            ...(set.source_owned_plan_working_set_target_id === null
              ? {}
              : { sourceOwnedPlanWorkingSetTargetId:
                set.source_owned_plan_working_set_target_id }),
          }))),
      });
    })),
  });
}

function toHistorySubjectSnapshot(
  snapshot: HistoryCorrectionSnapshot,
): EffectiveHistorySubjectSnapshot {
  const exercises = snapshot.exercises
    .flatMap((exercise) => exercise.sets
      .filter(({ kind }) => kind === "working")
      .map((workingSet) => {
      const identity = parseMetricIdentity(exercise.metricIdentity);
      const target = parseMetricTarget(identity, workingSet.target);
      const recommendationTargetIds = [
        workingSet.sourcePlanWorkingSetTargetId === undefined
          ? null
          : `legacy:${workingSet.sourcePlanWorkingSetTargetId}`,
        workingSet.sourceOwnedPlanWorkingSetTargetId === undefined
          ? null
          : `owned:${workingSet.sourceOwnedPlanWorkingSetTargetId}`,
      ].filter((value): value is string => value !== null);
      return Object.freeze({
        exerciseId: exercise.exerciseId,
        identity,
        target,
        recommendationTargetIds,
      });
    }));
  return Object.freeze({
    sessionId: snapshot.session.id,
    localDate: snapshot.session.localDate,
    lifecycle: "active",
    exercises: Object.freeze(exercises),
  });
}

function auditId(sessionId: string, revision: number, index: number): string {
  return `history-audit:${sessionId}:${revision}:${index}`;
}

function lifecycleAuditId(
  sessionId: string,
  revision: number,
  lifecycle: "voided" | "active",
): string {
  return `history-audit:${sessionId}:${revision}:${lifecycle}`;
}

async function loadBase(
  transaction: Pick<SqliteKernel, "queryAll"> | Pick<SqliteTransactionExecutor, "queryAll">,
  sessionId: string,
): Promise<Readonly<{
  session: StoredBaseSession;
  exercises: readonly StoredExercise[];
  sets: readonly StoredSet[];
}>> {
  const [session] = await transaction.queryAll<StoredBaseSession>(
    `SELECT ws.id, ws.source, ws.status, ws.plan_id, ws.plan_day_id,
            plan.name AS plan_name, day.name AS day_name,
            ws.local_date, ws.timezone, ws.started_at_ms, ws.completed_at_ms,
            ws.revision, overlay.effective_revision, overlay.lifecycle,
            overlay.snapshot_json
     FROM workout_sessions ws
     LEFT JOIN plans plan ON plan.id = ws.plan_id
     LEFT JOIN plan_days day ON day.id = ws.plan_day_id
     LEFT JOIN history_session_overlays overlay ON overlay.session_id = ws.id
     WHERE ws.id = ?`,
    [sessionId],
  );
  if (session === undefined) {
    throw new HistoryCorrectionConflictError("history_correction_not_found");
  }
  const [exercises, sets] = await Promise.all([
    transaction.queryAll<StoredExercise>(
      `SELECT id, exercise_id, exercise_name, ordinal, status, metric_profile,
              metric_contract_version, exercise_metric_generation, effort
       FROM session_exercises
       WHERE session_id = ?
       ORDER BY ordinal, id`,
      [sessionId],
    ),
    transaction.queryAll<StoredSet>(
      `SELECT set_row.id, set_row.session_exercise_id, set_row.set_kind,
              set_row.ordinal, set_row.status, set_row.target_json,
              set_row.observed_json, set_row.completed_at_ms,
              set_row.source_plan_working_set_target_id,
              set_row.source_owned_plan_working_set_target_id
       FROM session_sets set_row
       JOIN session_exercises exercise ON exercise.id = set_row.session_exercise_id
       WHERE exercise.session_id = ?
       ORDER BY exercise.ordinal, set_row.ordinal, set_row.id`,
      [sessionId],
    ),
  ]);
  return Object.freeze({ session, exercises, sets });
}

async function loadAuditEvents(
  executor: Pick<SqliteKernel, "queryAll"> | Pick<SqliteTransactionExecutor, "queryAll">,
  sessionId: string,
): Promise<readonly HistoryAuditEvent[]> {
  const rows = await executor.queryAll<StoredAuditEvent>(
    `SELECT id, effective_revision, event_type, field_identity, before_json,
            after_json, occurred_at_ms
     FROM history_audit_events
     WHERE session_id = ?
     ORDER BY occurred_at_ms DESC, effective_revision DESC, id DESC`,
    [sessionId],
  );
  return Object.freeze(rows.map(auditEvent));
}

async function assertAssociationExists(
  transaction: SqliteTransactionExecutor,
  snapshot: HistoryCorrectionSnapshot,
): Promise<void> {
  if (snapshot.session.planId === null || snapshot.session.planDayId === null) {
    return;
  }
  const [association] = await transaction.queryAll<{ id: string }>(
    `SELECT id
     FROM plan_days
     WHERE id = ? AND plan_id = ?`,
    [snapshot.session.planDayId, snapshot.session.planId],
  );
  if (association === undefined) {
    throw new HistoryCorrectionConflictError(
      "history_correction_association_invalid",
    );
  }
}

async function transitionLifecycle(
  transaction: SqliteTransactionExecutor,
  input: VoidHistorySessionInput | RestoreHistorySessionInput,
  targetLifecycle: "active" | "voided",
): Promise<HistoryLifecycleResult> {
  const stored = await loadBase(transaction, input.sessionId);
  const currentLifecycle = stored.session.lifecycle ?? "active";
  const effectiveRevision = stored.session.effective_revision
    ?? stored.session.revision;
  if (effectiveRevision !== input.expectedEffectiveRevision) {
    throw new HistoryCorrectionConflictError("history_lifecycle_conflict");
  }
  if (targetLifecycle === "voided") {
    if (stored.session.status !== "completed") {
      throw new HistoryCorrectionConflictError("history_remove_completed_required");
    }
    if (currentLifecycle !== "active") {
      throw new HistoryCorrectionConflictError("history_remove_requires_active");
    }
  } else if (currentLifecycle !== "voided") {
    throw new HistoryCorrectionConflictError("history_restore_requires_void");
  }

  const snapshot = stored.session.snapshot_json === null
    ? snapshotFromSource(stored.session, stored.exercises, stored.sets)
    : parseSnapshot(stored.session.snapshot_json);
  const nextRevision = effectiveRevision + 1;
  await transaction.execute(
    `INSERT INTO history_session_overlays
      (session_id, effective_revision, lifecycle, snapshot_json,
       effective_local_date, effective_timezone, effective_started_at_ms,
       effective_completed_at_ms, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       effective_revision = excluded.effective_revision,
       lifecycle = excluded.lifecycle,
       snapshot_json = excluded.snapshot_json,
       effective_local_date = excluded.effective_local_date,
       effective_timezone = excluded.effective_timezone,
       effective_started_at_ms = excluded.effective_started_at_ms,
       effective_completed_at_ms = excluded.effective_completed_at_ms,
       updated_at_ms = excluded.updated_at_ms`,
    [
      snapshot.session.id, nextRevision, targetLifecycle, JSON.stringify(snapshot),
      snapshot.session.localDate, snapshot.session.timezone,
      snapshot.session.startedAtMs, snapshot.session.completedAtMs,
      input.nowMs, input.nowMs,
    ],
  );
  await transaction.execute(
    `INSERT INTO history_audit_events
      (id, session_id, effective_revision, event_type, field_identity,
       before_json, after_json, occurred_at_ms)
     VALUES (?, ?, ?, ?, 'session.lifecycle', ?, ?, ?)`,
    [
      lifecycleAuditId(snapshot.session.id, nextRevision, targetLifecycle),
      snapshot.session.id,
      nextRevision,
      targetLifecycle === "voided" ? "void" : "restore",
      JSON.stringify(currentLifecycle),
      JSON.stringify(targetLifecycle),
      input.nowMs,
    ],
  );
  const activeSnapshot = toHistorySubjectSnapshot(snapshot);
  const historyImpact = collectHistoryImpact({
    oldSnapshot: { ...activeSnapshot, lifecycle: currentLifecycle },
    newSnapshot: { ...activeSnapshot, lifecycle: targetLifecycle },
  });
  await invalidateAndAdvanceHistoryProjectionSubjects(transaction, {
    ...historyImpact,
    nowMs: input.nowMs,
  });
  return Object.freeze({
    effectiveRevision: nextRevision,
    lifecycle: targetLifecycle,
  });
}

export function createHistoryCommandRepository(
  kernel: SqliteKernel,
): HistoryCommandRepository {
  return Object.freeze({
    async loadCorrectionSession(sessionId: string): Promise<HistoryCorrectionEditorState> {
      const stored = await loadBase(kernel, sessionId);
      if (stored.session.lifecycle === "voided") {
        throw new HistoryCorrectionConflictError("history_correction_removed");
      }
      const snapshot = stored.session.snapshot_json === null
        ? snapshotFromSource(stored.session, stored.exercises, stored.sets)
        : parseSnapshot(stored.session.snapshot_json);
      const effectiveRevision = stored.session.effective_revision
        ?? stored.session.revision;
      return Object.freeze({
        effectiveRevision,
        snapshot,
        auditEvents: await loadAuditEvents(kernel, sessionId),
      });
    },

    async listAvailableCorrectionExercises(): Promise<
      readonly AvailableCorrectionExercise[]
    > {
      const rows = await kernel.queryAll<AvailableExerciseRow>(
        `SELECT exercise_id, canonical_name, metric_profile,
                metric_contract_version, exercise_metric_generation
         FROM exercise_library_entries
         WHERE availability = 'available'
         ORDER BY canonical_name, exercise_id`,
      );
      return Object.freeze(rows.map((row) => Object.freeze({
        exerciseId: row.exercise_id,
        name: row.canonical_name,
        metricIdentity: parseMetricIdentity({
          profile: row.metric_profile,
          contractVersion: row.metric_contract_version,
          exerciseMetricGeneration: row.exercise_metric_generation,
        }),
      })));
    },

    async correctSession(
      input: CorrectHistorySessionInput,
    ): Promise<CorrectHistorySessionResult> {
      try {
        return await kernel.write(async (transaction) => {
        const stored = await loadBase(transaction, input.base.session.id);
        if (stored.session.lifecycle === "voided") {
          throw new HistoryCorrectionConflictError("history_correction_removed");
        }
        const base = stored.session.snapshot_json === null
          ? snapshotFromSource(stored.session, stored.exercises, stored.sets)
          : parseSnapshot(stored.session.snapshot_json);
        const effectiveRevision = stored.session.effective_revision
          ?? stored.session.revision;
        const prepared = prepareHistoryCorrection({
          base,
          baseEffectiveRevision: effectiveRevision,
          expectedEffectiveRevision: input.expectedEffectiveRevision,
          next: input.next,
        });
        await assertAssociationExists(transaction, prepared.next);
        const nextRevision = effectiveRevision + 1;
        await transaction.execute(
          `INSERT INTO history_session_overlays
            (session_id, effective_revision, lifecycle, snapshot_json,
             effective_local_date, effective_timezone, effective_started_at_ms,
             effective_completed_at_ms, created_at_ms, updated_at_ms)
           VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(session_id) DO UPDATE SET
             effective_revision = excluded.effective_revision,
             lifecycle = excluded.lifecycle,
             snapshot_json = excluded.snapshot_json,
             effective_local_date = excluded.effective_local_date,
             effective_timezone = excluded.effective_timezone,
             effective_started_at_ms = excluded.effective_started_at_ms,
             effective_completed_at_ms = excluded.effective_completed_at_ms,
             updated_at_ms = excluded.updated_at_ms`,
          [
            base.session.id, nextRevision, JSON.stringify(prepared.next),
            prepared.next.session.localDate, prepared.next.session.timezone,
            prepared.next.session.startedAtMs, prepared.next.session.completedAtMs,
            input.nowMs, input.nowMs,
          ],
        );
        for (const [index, delta] of prepared.auditDeltas.entries()) {
          await transaction.execute(
            `INSERT INTO history_audit_events
              (id, session_id, effective_revision, event_type, field_identity,
               before_json, after_json, occurred_at_ms)
             VALUES (?, ?, ?, 'correction', ?, ?, ?, ?)`,
            [
              auditId(base.session.id, nextRevision, index), base.session.id,
              nextRevision, delta.fieldIdentity, JSON.stringify(delta.before),
              JSON.stringify(delta.after), input.nowMs,
            ],
          );
        }
        const oldSnapshot = toHistorySubjectSnapshot(base);
        const newSnapshot = toHistorySubjectSnapshot(prepared.next);
        const historyImpact = collectHistoryImpact({ oldSnapshot, newSnapshot });
        await invalidateAndAdvanceHistoryProjectionSubjects(transaction, {
          ...historyImpact,
          nowMs: input.nowMs,
        });
        return Object.freeze({
          effectiveRevision: nextRevision,
          snapshot: prepared.next,
        });
        });
      } catch (error) {
        if (error instanceof SqliteStorageError
          && (error.cause instanceof HistoryCorrectionInputError
            || error.cause instanceof HistoryCorrectionConflictError)) {
          throw error.cause;
        }
        throw error;
      }
    },

    async voidSession(input: VoidHistorySessionInput): Promise<HistoryLifecycleResult> {
      try {
        return await kernel.write((transaction) =>
          transitionLifecycle(transaction, input, "voided"));
      } catch (error) {
        if (error instanceof SqliteStorageError
          && error.cause instanceof HistoryCorrectionConflictError) {
          throw error.cause;
        }
        throw error;
      }
    },

    async restoreSession(
      input: RestoreHistorySessionInput,
    ): Promise<HistoryLifecycleResult> {
      try {
        return await kernel.write((transaction) =>
          transitionLifecycle(transaction, input, "active"));
      } catch (error) {
        if (error instanceof SqliteStorageError
          && error.cause instanceof HistoryCorrectionConflictError) {
          throw error.cause;
        }
        throw error;
      }
    },
  });
}

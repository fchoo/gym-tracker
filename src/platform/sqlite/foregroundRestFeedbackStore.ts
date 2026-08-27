import type {
  RestAlertPreferences,
} from "../../domains/rest";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "./sqliteKernel";

export type ForegroundRestFeedbackIdentity = Readonly<{
  sessionId: string;
  restRevision: number;
}>;

export type ForegroundRestFeedbackClaimResult =
  | Readonly<{
      outcome: "claimed";
      sound: boolean;
      vibration: boolean;
    }>
  | "already_attempted"
  | "job_missing";

export type ForegroundRestFeedbackStore = Readonly<{
  listPending(): Promise<readonly ForegroundRestFeedbackIdentity[]>;
  claimPending(
    input: ForegroundRestFeedbackIdentity,
  ): Promise<ForegroundRestFeedbackClaimResult>;
  complete(input: ForegroundRestFeedbackIdentity): Promise<void>;
  prune(input: Readonly<{ nowMs: number }>): Promise<number>;
}>;

export const FOREGROUND_REST_FEEDBACK_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export async function enqueueForegroundRestFeedbackAttempt(
  transaction: SqliteTransactionExecutor,
  input: ForegroundRestFeedbackIdentity & Readonly<{
    nowMs: number;
    preferences: RestAlertPreferences;
  }>,
): Promise<void> {
  await transaction.execute(
    `INSERT INTO foreground_rest_feedback_attempts (
      session_id, rest_revision, enqueued_at_ms, sound_enabled, vibration_enabled,
      sound_status, vibration_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, rest_revision) DO NOTHING`,
    [
      input.sessionId,
      input.restRevision,
      input.nowMs,
      input.preferences.soundEnabled ? 1 : 0,
      input.preferences.vibrationEnabled ? 1 : 0,
      input.preferences.soundEnabled ? "pending" : "completed",
      input.preferences.vibrationEnabled ? "pending" : "completed",
    ],
  );
}

export function createForegroundRestFeedbackStore(
  kernel: SqliteKernel,
): ForegroundRestFeedbackStore {
  return Object.freeze({
    async listPending() {
      const rows = await kernel.queryAll<Readonly<{
        session_id: string;
        rest_revision: number;
      }>>(
        `SELECT session_id, rest_revision
         FROM foreground_rest_feedback_attempts
         WHERE sound_status = 'pending' OR vibration_status = 'pending'
         ORDER BY enqueued_at_ms, session_id, rest_revision`,
      );
      return rows.map((row) => ({
        sessionId: row.session_id,
        restRevision: row.rest_revision,
      }));
    },
    async claimPending(input) {
      return kernel.write(async (transaction) => {
        const [job] = await transaction.queryAll<Readonly<{
          sound_enabled: number;
          vibration_enabled: number;
          sound_status: "pending" | "attempted" | "completed";
          vibration_status: "pending" | "attempted" | "completed";
        }>>(
          `SELECT sound_enabled, vibration_enabled, sound_status, vibration_status
           FROM foreground_rest_feedback_attempts
           WHERE session_id = ? AND rest_revision = ?`,
          [input.sessionId, input.restRevision],
        );
        if (job === undefined) {
          return "job_missing" as const;
        }
        const sound = job.sound_enabled === 1 && job.sound_status === "pending";
        const vibration = job.vibration_enabled === 1
          && job.vibration_status === "pending";
        if (!sound && !vibration) {
          return "already_attempted" as const;
        }
        await transaction.execute(
          `UPDATE foreground_rest_feedback_attempts
           SET sound_status = CASE WHEN sound_status = 'pending' THEN 'attempted' ELSE sound_status END,
               vibration_status = CASE WHEN vibration_status = 'pending' THEN 'attempted' ELSE vibration_status END
           WHERE session_id = ? AND rest_revision = ?`,
          [input.sessionId, input.restRevision],
        );
        return { outcome: "claimed", sound, vibration } as const;
      });
    },
    async complete(input) {
      await kernel.write((transaction) => transaction.execute(
        `UPDATE foreground_rest_feedback_attempts
         SET sound_status = CASE WHEN sound_status = 'attempted' THEN 'completed' ELSE sound_status END,
             vibration_status = CASE WHEN vibration_status = 'attempted' THEN 'completed' ELSE vibration_status END
         WHERE session_id = ? AND rest_revision = ?`,
        [input.sessionId, input.restRevision],
      ));
    },
    async prune({ nowMs }) {
      const result = await kernel.write((transaction) => transaction.execute(
        `DELETE FROM foreground_rest_feedback_attempts
         WHERE enqueued_at_ms < ?
           AND NOT EXISTS (
             SELECT 1 FROM workout_sessions
             WHERE workout_sessions.id = foreground_rest_feedback_attempts.session_id
               AND workout_sessions.status = 'in_progress'
           )`,
        [nowMs - FOREGROUND_REST_FEEDBACK_RETENTION_MS],
      ));
      return result.changes;
    },
  });
}

import type {
  Migration,
} from "../migrationRunner";

export const exerciseHistoryIndexMigration: Migration = Object.freeze({
  version: 3,
  name: "exercise-history-index",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(
      `CREATE INDEX exercise_history
       ON session_exercises(exercise_id, metric_profile, session_id)`,
    );
  },
  async verify(transaction) {
    const indexes = await transaction.queryAll<{ name: string }>(
      "PRAGMA index_list(session_exercises)",
    );
    if (!indexes.some(({ name }) => name === "exercise_history")) {
      throw new Error("exercise_history_index_missing");
    }
  },
});

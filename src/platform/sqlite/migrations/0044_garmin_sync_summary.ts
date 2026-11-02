import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

export const garminSyncSummaryMigration: Migration = Object.freeze({
  version: 44,
  name: "garmin-sync-summary",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(`CREATE TABLE garmin_sync_summary (
      id INTEGER PRIMARY KEY NOT NULL CHECK(id = 1),
      attempt_id TEXT NOT NULL UNIQUE CHECK(length(attempt_id) BETWEEN 1 AND 128),
      completed_at_ms INTEGER NOT NULL CHECK(completed_at_ms >= 0),
      pages INTEGER NOT NULL CHECK(pages >= 1),
      discovered_activities INTEGER NOT NULL CHECK(discovered_activities >= 0),
      attempted_activities INTEGER NOT NULL CHECK(attempted_activities >= 0),
      new_activities INTEGER NOT NULL CHECK(new_activities >= 0),
      unchanged_activities INTEGER NOT NULL CHECK(unchanged_activities >= 0),
      review_activities INTEGER NOT NULL CHECK(review_activities >= 0),
      failed_activities INTEGER NOT NULL CHECK(failed_activities = 0),
      CHECK(discovered_activities >= attempted_activities),
      CHECK(attempted_activities = new_activities + unchanged_activities + review_activities + failed_activities)
    ) STRICT`);
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const rows = await transaction.queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'garmin_sync_summary'",
    );
    if (rows.length !== 1) throw new Error("garmin_sync_summary_schema_incomplete");
  },
});

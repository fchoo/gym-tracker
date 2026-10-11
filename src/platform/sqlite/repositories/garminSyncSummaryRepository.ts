import type { GarminDurableSyncSummary } from "../../../domains/activities/garminActivitySourcePort";
import type { SqliteKernel } from "../sqliteKernel";

type GarminSyncSummaryRow = Readonly<{
  attempt_id: unknown;
  completed_at_ms: unknown;
  pages: unknown;
  discovered_activities: unknown;
  attempted_activities: unknown;
  new_activities: unknown;
  unchanged_activities: unknown;
  review_activities: unknown;
  failed_activities: unknown;
}>;

function isBoundedInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validateSummary(summary: GarminDurableSyncSummary): void {
  const { counts } = summary;
  if (summary.attemptId.length < 1
    || summary.attemptId.length > 128
    || !isBoundedInteger(summary.completedAtMs)
    || !isBoundedInteger(counts.pages)
    || counts.pages < 1
    || !isBoundedInteger(counts.discoveredActivities)
    || !isBoundedInteger(counts.attemptedActivities)
    || !isBoundedInteger(counts.newActivities)
    || !isBoundedInteger(counts.unchangedActivities)
    || !isBoundedInteger(counts.reviewActivities)
    || !isBoundedInteger(counts.failedActivities)
    || counts.discoveredActivities < counts.attemptedActivities
    || counts.attemptedActivities !== counts.newActivities
      + counts.unchangedActivities
      + counts.reviewActivities
      + counts.failedActivities
    || counts.failedActivities !== 0) {
    throw new Error("garmin_sync_summary_invalid");
  }
}

function fromRow(row: GarminSyncSummaryRow): GarminDurableSyncSummary {
  const summary = Object.freeze({
    attemptId: typeof row.attempt_id === "string" ? row.attempt_id : "",
    completedAtMs: row.completed_at_ms as number,
    counts: Object.freeze({
      pages: row.pages as number,
      discoveredActivities: row.discovered_activities as number,
      attemptedActivities: row.attempted_activities as number,
      newActivities: row.new_activities as number,
      unchangedActivities: row.unchanged_activities as number,
      reviewActivities: row.review_activities as number,
      failedActivities: row.failed_activities as number,
    }),
  });
  validateSummary(summary);
  return summary;
}

export function createGarminSyncSummaryRepository(kernel: SqliteKernel): Readonly<{
  load(): Promise<GarminDurableSyncSummary | null>;
  save(summary: GarminDurableSyncSummary): Promise<void>;
}> {
  return Object.freeze({
    async load() {
      const rows = await kernel.queryAll<GarminSyncSummaryRow>(
        `SELECT attempt_id, completed_at_ms, pages, discovered_activities,
                attempted_activities, new_activities, unchanged_activities,
                review_activities, failed_activities
           FROM garmin_sync_summary WHERE id = 1`,
      );
      if (rows.length === 0) return null;
      if (rows.length !== 1) throw new Error("garmin_sync_summary_invalid");
      return fromRow(rows[0]!);
    },
    async save(summary) {
      validateSummary(summary);
      const counts = summary.counts;
      const outcome = await kernel.write((transaction) => transaction.execute(
        `INSERT INTO garmin_sync_summary
          (id, attempt_id, completed_at_ms, pages, discovered_activities,
           attempted_activities, new_activities, unchanged_activities,
           review_activities, failed_activities)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           attempt_id = excluded.attempt_id,
           completed_at_ms = excluded.completed_at_ms,
           pages = excluded.pages,
           discovered_activities = excluded.discovered_activities,
           attempted_activities = excluded.attempted_activities,
           new_activities = excluded.new_activities,
           unchanged_activities = excluded.unchanged_activities,
           review_activities = excluded.review_activities,
           failed_activities = excluded.failed_activities
         WHERE excluded.completed_at_ms >= garmin_sync_summary.completed_at_ms`,
        [
          summary.attemptId,
          summary.completedAtMs,
          counts.pages,
          counts.discoveredActivities,
          counts.attemptedActivities,
          counts.newActivities,
          counts.unchangedActivities,
          counts.reviewActivities,
          counts.failedActivities,
        ],
      ));
      if (outcome.changes !== 1) throw new Error("garmin_sync_summary_stale");
    },
  });
}

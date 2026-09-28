import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

export const automaticBackupDeletionProgressMigration: Migration = Object.freeze({
  version: 25,
  name: "automatic-backup-deletion-progress",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(
      "ALTER TABLE automatic_backup_state ADD COLUMN deletion_progress TEXT NOT NULL DEFAULT 'none' CHECK(deletion_progress IN ('none', 'sweep_pending', 'complete'))",
    );
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const rows = await transaction.queryAll<{ deletion_progress: string; authority_state: string }>(
      "SELECT deletion_progress, authority_state FROM automatic_backup_state WHERE id = 1",
    );
    const row = rows[0];
    if (rows.length !== 1 || row === undefined
      || (row.deletion_progress !== "none" && row.deletion_progress !== "sweep_pending" && row.deletion_progress !== "complete")
      || ((row.deletion_progress === "sweep_pending" || row.deletion_progress === "complete") && row.authority_state !== "deleted")) {
      throw new Error("automatic_backup_deletion_progress_schema_incomplete");
    }
  },
});

import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

export const automaticBackupAccountLabelMigration: Migration = Object.freeze({
  version: 26,
  name: "automatic-backup-account-label",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(
      "ALTER TABLE automatic_backup_state ADD COLUMN account_display_label TEXT CHECK(account_display_label IS NULL OR (length(account_display_label) BETWEEN 3 AND 320 AND instr(account_display_label, char(10)) = 0 AND instr(account_display_label, char(13)) = 0))",
    );
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const rows = await transaction.queryAll<{ account_display_label: string | null }>(
      "SELECT account_display_label FROM automatic_backup_state WHERE id = 1",
    );
    if (rows.length !== 1 || (rows[0]?.account_display_label !== null
      && typeof rows[0]?.account_display_label !== "string")) {
      throw new Error("automatic_backup_account_label_schema_incomplete");
    }
  },
});

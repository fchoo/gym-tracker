import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

/**
 * Stable slot roots and revisions remain immutable history.  The earlier
 * `running_session_slots` table is the current-membership projection used for
 * opportunity materialisation, so it needs an explicit retirement marker.
 */
export const runningSessionSlotMembershipMigration: Migration = Object.freeze({
  version: 39,
  name: "running-session-slot-current-membership",
  kind: "additive",
  async up(transaction) {
    await transaction.execute("DROP TRIGGER IF EXISTS running_session_slots_immutable_update");
    await transaction.execute("ALTER TABLE running_session_slots ADD COLUMN retired_at_ms INTEGER CHECK(retired_at_ms IS NULL OR retired_at_ms >= 0)");
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const columns = await transaction.queryAll<{ name: string }>("PRAGMA table_info(running_session_slots)");
    if (!columns.some((column) => column.name === "retired_at_ms")) {
      throw new Error("running_session_slot_membership_schema_incomplete");
    }
  },
});

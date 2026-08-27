import type {
  Migration,
} from "../migrationRunner";

export const outcomeEffortMigration: Migration = Object.freeze({
  version: 2,
  name: "outcome-effort",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(
      `ALTER TABLE session_exercises
       ADD COLUMN effort TEXT CHECK(
         effort IS NULL OR effort IN ('easy', 'on_target', 'hard', 'failed')
       )`,
    );
    await transaction.execute(
      `ALTER TABLE session_exercises
       ADD COLUMN effort_recorded_at_ms INTEGER CHECK(
         effort_recorded_at_ms IS NULL OR effort_recorded_at_ms >= 0
       )`,
    );
  },
  async verify(transaction) {
    const columns = await transaction.queryAll<{ name: string }>(
      "PRAGMA table_info(session_exercises)",
    );
    if (
      !columns.some(({ name }) => name === "effort")
      || !columns.some(({ name }) => name === "effort_recorded_at_ms")
    ) {
      throw new Error("outcome_effort_schema_incomplete");
    }
  },
});

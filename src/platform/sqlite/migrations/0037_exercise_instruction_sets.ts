import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

export const EXERCISE_INSTRUCTION_SETS_TABLE =
  "exercise_instruction_sets" as const;

export const exerciseInstructionSetsMigration: Migration = Object.freeze({
  version: 37,
  name: "exercise-instruction-sets",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(
      `CREATE TABLE ${EXERCISE_INSTRUCTION_SETS_TABLE} (
        exercise_id TEXT PRIMARY KEY NOT NULL
          REFERENCES exercise_library_entries(exercise_id) ON DELETE CASCADE,
        content_revision_id TEXT NOT NULL
          REFERENCES content_pack_revisions(id) ON DELETE RESTRICT,
        source_namespace TEXT NOT NULL CHECK(length(trim(source_namespace)) BETWEEN 1 AND 120),
        source_revision TEXT NOT NULL CHECK(length(trim(source_revision)) BETWEEN 1 AND 120),
        upstream_id TEXT,
        source_license TEXT NOT NULL CHECK(length(trim(source_license)) BETWEEN 1 AND 120),
        source_attribution TEXT NOT NULL CHECK(length(trim(source_attribution)) BETWEEN 1 AND 240),
        steps_json TEXT NOT NULL CHECK(
          json_valid(steps_json)
          AND json_type(steps_json) = 'array'
          AND json_array_length(steps_json) BETWEEN 1 AND 24
        ),
        revision INTEGER NOT NULL CHECK(revision >= 1)
      ) STRICT`,
    );
    await transaction.execute(
      `CREATE INDEX exercise_instruction_sets_content_revision_idx
       ON ${EXERCISE_INSTRUCTION_SETS_TABLE}(content_revision_id, exercise_id)`,
    );
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const [table] = await transaction.queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [EXERCISE_INSTRUCTION_SETS_TABLE],
    );
    if (table === undefined) {
      throw new Error("exercise_instruction_sets_schema_incomplete");
    }
  },
});

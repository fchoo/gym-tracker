import type {
  Migration,
} from "../migrationRunner";

export const EXERCISE_SEARCH_FTS_TABLE = "exercise_search_terms_fts" as const;

export const EXERCISE_SEARCH_FTS_SCHEMA_STATEMENTS = [
  `CREATE VIRTUAL TABLE exercise_search_terms_fts USING fts5(
    normalized_text,
    content = 'exercise_search_terms',
    content_rowid = 'id',
    tokenize = 'trigram'
  )`,
  `CREATE TRIGGER exercise_search_terms_fts_ai
   AFTER INSERT ON exercise_search_terms
   BEGIN
     INSERT INTO exercise_search_terms_fts(rowid, normalized_text)
     VALUES (new.id, new.normalized_text);
   END`,
  `CREATE TRIGGER exercise_search_terms_fts_ad
   AFTER DELETE ON exercise_search_terms
   BEGIN
     INSERT INTO exercise_search_terms_fts(
       exercise_search_terms_fts,
       rowid,
       normalized_text
     )
     VALUES ('delete', old.id, old.normalized_text);
   END`,
  `CREATE TRIGGER exercise_search_terms_fts_au
   AFTER UPDATE OF normalized_text ON exercise_search_terms
   BEGIN
     INSERT INTO exercise_search_terms_fts(
       exercise_search_terms_fts,
       rowid,
       normalized_text
     )
     VALUES ('delete', old.id, old.normalized_text);
     INSERT INTO exercise_search_terms_fts(rowid, normalized_text)
     VALUES (new.id, new.normalized_text);
   END`,
  `INSERT INTO exercise_search_terms_fts(exercise_search_terms_fts)
   VALUES ('rebuild')`,
] as const;

const REQUIRED_EXERCISE_SEARCH_FTS_OBJECTS = [
  ["exercise_search_terms_fts", "table"],
  ["exercise_search_terms_fts_ad", "trigger"],
  ["exercise_search_terms_fts_ai", "trigger"],
  ["exercise_search_terms_fts_au", "trigger"],
] as const;

export const exerciseSearchFtsMigration: Migration = Object.freeze({
  version: 5,
  name: "exercise-search-fts",
  kind: "additive",
  async up(transaction) {
    for (const statement of EXERCISE_SEARCH_FTS_SCHEMA_STATEMENTS) {
      await transaction.execute(statement);
    }
  },
  async verify(transaction) {
    const [capability] = await transaction.queryAll<{
      fts5_enabled: number;
    }>(
      `SELECT sqlite_compileoption_used('ENABLE_FTS5') AS fts5_enabled`,
    );
    if (capability?.fts5_enabled !== 1) {
      throw new Error("exercise_search_fts5_unavailable");
    }

    const objects = await transaction.queryAll<{
      name: string;
      type: string;
    }>(
      `SELECT name, type
       FROM sqlite_master
       WHERE name IN (
         'exercise_search_terms_fts',
         'exercise_search_terms_fts_ad',
         'exercise_search_terms_fts_ai',
         'exercise_search_terms_fts_au'
       )
       ORDER BY name`,
    );
    if (
      REQUIRED_EXERCISE_SEARCH_FTS_OBJECTS.some(
        ([requiredName, requiredType]) => !objects.some(
          ({ name, type }) =>
            name === requiredName && type === requiredType,
        ),
      )
    ) {
      throw new Error("exercise_search_fts_schema_incomplete");
    }

    const [sourceCount] = await transaction.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM exercise_search_terms",
    );
    const [indexCount] = await transaction.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM exercise_search_terms_fts_docsize",
    );
    if (sourceCount?.count !== indexCount?.count) {
      throw new Error("exercise_search_fts_row_count_mismatch");
    }

    const sourceIds = await transaction.queryAll<{ id: number }>(
      "SELECT id FROM exercise_search_terms ORDER BY id",
    );
    const indexIds = await transaction.queryAll<{ id: number }>(
      "SELECT id FROM exercise_search_terms_fts_docsize ORDER BY id",
    );
    if (
      sourceIds.length !== indexIds.length
      || sourceIds.some(({ id }, index) => id !== indexIds[index]?.id)
    ) {
      throw new Error("exercise_search_fts_stable_id_mismatch");
    }

    await transaction.execute(
      `INSERT INTO exercise_search_terms_fts(
        exercise_search_terms_fts,
        rank
      )
      VALUES ('integrity-check', 1)`,
    );
  },
});

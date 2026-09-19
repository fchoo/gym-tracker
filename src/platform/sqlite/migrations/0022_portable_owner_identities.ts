import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

const OPAQUE_ID_SQL_CHECK = "length({column}) = 32 AND {column} NOT GLOB '*[^a-f0-9]*'";

function opaqueIdCheck(column: string): string {
  return OPAQUE_ID_SQL_CHECK.replaceAll("{column}", column);
}

function immutableTrigger(
  name: string,
  table: string,
  column: string,
): string {
  return `CREATE TRIGGER ${name}
    BEFORE UPDATE OF ${column} ON ${table}
    FOR EACH ROW WHEN OLD.${column} IS NOT NULL AND NEW.${column} <> OLD.${column}
    BEGIN
      SELECT RAISE(ABORT, 'portable_identity_immutable');
    END`;
}

function validateTrigger(
  name: string,
  table: string,
  column: string,
): string {
  return `CREATE TRIGGER ${name}
    BEFORE UPDATE OF ${column} ON ${table}
    FOR EACH ROW WHEN NEW.${column} IS NOT NULL AND NOT (${opaqueIdCheck(`NEW.${column}`)})
    BEGIN
      SELECT RAISE(ABORT, 'portable_identity_invalid');
    END`;
}

function validateInsertTrigger(
  name: string,
  table: string,
  condition: string,
): string {
  return `CREATE TRIGGER ${name}
    BEFORE INSERT ON ${table}
    FOR EACH ROW WHEN ${condition}
    BEGIN
      SELECT RAISE(ABORT, 'portable_identity_invalid');
    END`;
}

function allocateOnInsertTrigger(
  name: string,
  table: string,
  condition: string,
  assignments: string,
): string {
  return `CREATE TRIGGER ${name}
    AFTER INSERT ON ${table}
    FOR EACH ROW WHEN ${condition}
    BEGIN
      UPDATE ${table} SET ${assignments} WHERE id = NEW.id;
    END`;
}

function allocateOnOriginUpdateTrigger(
  name: string,
  table: string,
): string {
  return `CREATE TRIGGER ${name}
    AFTER UPDATE OF origin ON ${table}
    FOR EACH ROW WHEN NEW.origin IN ('custom', 'copied') AND NEW.portable_id IS NULL
    BEGIN
      UPDATE ${table} SET portable_id = lower(hex(randomblob(16))) WHERE id = NEW.id;
    END`;
}

function sessionMergeFreshnessTrigger(): string {
  return `CREATE TRIGGER workout_sessions_portable_merge_freshness
    AFTER UPDATE ON workout_sessions
    FOR EACH ROW WHEN NEW.merge_modified_at_ms = OLD.merge_modified_at_ms
    BEGIN
      UPDATE workout_sessions
      SET merge_modified_at_ms = MAX(
        OLD.merge_modified_at_ms + 1,
        NEW.started_at_ms,
        COALESCE(NEW.completed_at_ms, 0)
      )
      WHERE id = NEW.id;
    END`;
}

function ownerNamespaceImmutableTrigger(): string {
  return `CREATE TRIGGER portable_owner_identity_immutable
    BEFORE UPDATE OF owner_namespace ON portable_owner_identity
    FOR EACH ROW WHEN NEW.owner_namespace <> OLD.owner_namespace
    BEGIN
      SELECT RAISE(ABORT, 'portable_identity_immutable');
    END`;
}

function ownerNamespaceDeleteTrigger(): string {
  return `CREATE TRIGGER portable_owner_identity_no_delete
    BEFORE DELETE ON portable_owner_identity
    FOR EACH ROW
    BEGIN
      SELECT RAISE(ABORT, 'portable_identity_immutable');
    END`;
}

export const PORTABLE_OWNER_IDENTITIES_TRIGGER_STATEMENTS = Object.freeze([
  ownerNamespaceImmutableTrigger(),
  ownerNamespaceDeleteTrigger(),
  validateInsertTrigger(
    "exercises_portable_id_insert_valid",
    "exercises",
    "NEW.origin IN ('custom', 'copied') AND NEW.portable_id IS NOT NULL AND NOT ("
      + opaqueIdCheck("NEW.portable_id") + ")",
  ),
  allocateOnInsertTrigger(
    "exercises_portable_id_allocate",
    "exercises",
    "NEW.origin IN ('custom', 'copied') AND NEW.portable_id IS NULL",
    "portable_id = lower(hex(randomblob(16)))",
  ),
  allocateOnOriginUpdateTrigger(
    "exercises_portable_id_allocate_on_origin",
    "exercises",
  ),
  validateInsertTrigger(
    "plans_portable_id_insert_valid",
    "plans",
    "NEW.origin IN ('custom', 'copied') AND NEW.portable_id IS NOT NULL AND NOT ("
      + opaqueIdCheck("NEW.portable_id") + ")",
  ),
  allocateOnInsertTrigger(
    "plans_portable_id_allocate",
    "plans",
    "NEW.origin IN ('custom', 'copied') AND NEW.portable_id IS NULL",
    "portable_id = lower(hex(randomblob(16)))",
  ),
  allocateOnOriginUpdateTrigger(
    "plans_portable_id_allocate_on_origin",
    "plans",
  ),
  validateInsertTrigger(
    "workout_sessions_portable_identity_insert_valid",
    "workout_sessions",
    "(NEW.portable_id IS NOT NULL AND NOT (" + opaqueIdCheck("NEW.portable_id") + ") )"
      + " OR (NEW.merge_modified_at_ms IS NOT NULL AND NEW.merge_modified_at_ms < 0)",
  ),
  allocateOnInsertTrigger(
    "workout_sessions_portable_identity_allocate",
    "workout_sessions",
    "NEW.portable_id IS NULL OR NEW.merge_modified_at_ms IS NULL",
    "portable_id = COALESCE(NEW.portable_id, lower(hex(randomblob(16)))), merge_modified_at_ms = COALESCE(NEW.merge_modified_at_ms, NEW.started_at_ms)",
  ),
  validateTrigger("exercises_portable_id_valid", "exercises", "portable_id"),
  validateTrigger("plans_portable_id_valid", "plans", "portable_id"),
  validateTrigger("workout_sessions_portable_id_valid", "workout_sessions", "portable_id"),
  immutableTrigger("exercises_portable_id_immutable", "exercises", "portable_id"),
  immutableTrigger("plans_portable_id_immutable", "plans", "portable_id"),
  immutableTrigger("workout_sessions_portable_id_immutable", "workout_sessions", "portable_id"),
  sessionMergeFreshnessTrigger(),
] as const);

export const PORTABLE_OWNER_IDENTITIES_SCHEMA_STATEMENTS = [
  `CREATE TABLE portable_owner_identity (
    id INTEGER PRIMARY KEY NOT NULL CHECK(id = 1),
    owner_namespace TEXT NOT NULL CHECK(${opaqueIdCheck("owner_namespace")})
  ) STRICT`,
  "INSERT INTO portable_owner_identity(id, owner_namespace) VALUES (1, lower(hex(randomblob(16))))",
  "ALTER TABLE exercises ADD COLUMN portable_id TEXT",
  "ALTER TABLE plans ADD COLUMN portable_id TEXT",
  "ALTER TABLE workout_sessions ADD COLUMN portable_id TEXT",
  "ALTER TABLE workout_sessions ADD COLUMN merge_modified_at_ms INTEGER",
  "UPDATE exercises SET portable_id = lower(hex(randomblob(16))) WHERE origin IN ('custom', 'copied')",
  "UPDATE plans SET portable_id = lower(hex(randomblob(16))) WHERE origin IN ('custom', 'copied')",
  "UPDATE workout_sessions SET portable_id = lower(hex(randomblob(16))), merge_modified_at_ms = started_at_ms",
  "CREATE UNIQUE INDEX exercises_portable_id_unique ON exercises(portable_id) WHERE portable_id IS NOT NULL",
  "CREATE UNIQUE INDEX plans_portable_id_unique ON plans(portable_id) WHERE portable_id IS NOT NULL",
  "CREATE UNIQUE INDEX workout_sessions_portable_id_unique ON workout_sessions(portable_id) WHERE portable_id IS NOT NULL",
  "CREATE INDEX workout_sessions_portable_merge_freshness_idx ON workout_sessions(merge_modified_at_ms, portable_id)",
  ...PORTABLE_OWNER_IDENTITIES_TRIGGER_STATEMENTS,
] as const;

const REQUIRED_COLUMNS = Object.freeze([
  ["exercises", "portable_id"],
  ["plans", "portable_id"],
  ["workout_sessions", "portable_id"],
  ["workout_sessions", "merge_modified_at_ms"],
] as const);

const REQUIRED_TRIGGER_NAMES = Object.freeze([
  "portable_owner_identity_immutable",
  "portable_owner_identity_no_delete",
  "exercises_portable_id_insert_valid",
  "exercises_portable_id_allocate",
  "exercises_portable_id_allocate_on_origin",
  "plans_portable_id_insert_valid",
  "plans_portable_id_allocate",
  "plans_portable_id_allocate_on_origin",
  "workout_sessions_portable_identity_insert_valid",
  "workout_sessions_portable_identity_allocate",
  "exercises_portable_id_valid",
  "plans_portable_id_valid",
  "workout_sessions_portable_id_valid",
  "exercises_portable_id_immutable",
  "plans_portable_id_immutable",
  "workout_sessions_portable_id_immutable",
  "workout_sessions_portable_merge_freshness",
] as const);

const PORTABLE_ID_TRIGGERS_BY_NAME = new Map(
  REQUIRED_TRIGGER_NAMES.map((name, index) => [
    name,
    PORTABLE_OWNER_IDENTITIES_TRIGGER_STATEMENTS[index]!,
  ] as const),
);

function normalizedSql(sql: string): string {
  return sql.replace(/\s+/gu, " ").trim();
}

export const portableOwnerIdentitiesMigration: Migration = Object.freeze({
  version: 22,
  name: "portable-owner-identities",
  kind: "additive",
  async up(transaction) {
    for (const statement of PORTABLE_OWNER_IDENTITIES_SCHEMA_STATEMENTS) {
      await transaction.execute(statement);
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    for (const [table, column] of REQUIRED_COLUMNS) {
      const columns = await transaction.queryAll<{ name: string }>(
        `PRAGMA table_info(${table})`,
      );
      if (!columns.some(({ name }) => name === column)) {
        throw new Error("portable_owner_identity_schema_incomplete");
      }
    }
    const owner = await transaction.queryAll<{ id: number; owner_namespace: string }>(
      "SELECT id, owner_namespace FROM portable_owner_identity",
    );
    if (owner.length !== 1 || owner[0]?.id !== 1
      || !new RegExp(`^[a-f0-9]{32}$`, "u").test(owner[0].owner_namespace)) {
      throw new Error("portable_owner_identity_schema_incomplete");
    }
    const invalidRows = await transaction.queryAll<{ count: number }>(
      `SELECT (
        (SELECT COUNT(*) FROM exercises
          WHERE origin IN ('custom', 'copied')
            AND (portable_id IS NULL OR NOT (${opaqueIdCheck("portable_id")})))
        +
        (SELECT COUNT(*) FROM plans
          WHERE origin IN ('custom', 'copied')
            AND (portable_id IS NULL OR NOT (${opaqueIdCheck("portable_id")})))
        +
        (SELECT COUNT(*) FROM workout_sessions
          WHERE portable_id IS NULL
            OR merge_modified_at_ms IS NULL
            OR merge_modified_at_ms < 0
            OR NOT (${opaqueIdCheck("portable_id")}))
      ) AS count`,
    );
    if (invalidRows[0]?.count !== 0) {
      throw new Error("portable_owner_identity_schema_incomplete");
    }
    const objects = await transaction.queryAll<{ name: string; sql: string; type: string }>(
      `SELECT name, sql, type FROM sqlite_master
       WHERE name IN (${[
         "exercises_portable_id_unique",
         "plans_portable_id_unique",
         "workout_sessions_portable_id_unique",
         "workout_sessions_portable_merge_freshness_idx",
         ...REQUIRED_TRIGGER_NAMES,
       ].map((name) => `'${name}'`).join(", ")})`,
    );
    const names = new Set(objects.map(({ name }) => name));
    const requiredIndexes = [
      "exercises_portable_id_unique",
      "plans_portable_id_unique",
      "workout_sessions_portable_id_unique",
      "workout_sessions_portable_merge_freshness_idx",
    ];
    if (requiredIndexes.some((name) => !names.has(name))
      || REQUIRED_TRIGGER_NAMES.some((name) => !names.has(name))
      || objects.filter(({ type }) => type === "trigger").some(({ name, sql }) => {
        const expectedSql = PORTABLE_ID_TRIGGERS_BY_NAME.get(
          name as typeof REQUIRED_TRIGGER_NAMES[number],
        );
        return expectedSql === undefined || normalizedSql(sql) !== normalizedSql(expectedSql);
      })) {
      throw new Error("portable_owner_identity_schema_incomplete");
    }
  },
});

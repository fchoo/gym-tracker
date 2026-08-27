import type {
  Migration,
} from "../migrationRunner";
import type {
  SqliteTransactionExecutor,
} from "../sqliteKernel";

export function creationTimezoneOffsetMinutes(
  timezone: string,
  startedAtMs: number,
): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  });
  const zone = formatter.formatToParts(new Date(startedAtMs)).find(
    ({ type }) => type === "timeZoneName",
  )?.value;
  if (zone === "GMT" || zone === "UTC") {
    return 0;
  }
  const match = /^GMT([+-])(\d{2}):(\d{2})$/u.exec(zone ?? "");
  if (match === null) {
    throw new Error("history_creation_offset_unavailable");
  }
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? minutes : -minutes;
}

export const HISTORY_INTEGRITY_SCHEMA_STATEMENTS = [
  `ALTER TABLE workout_sessions
   ADD COLUMN creation_timezone_offset_minutes INTEGER
   CHECK(
     creation_timezone_offset_minutes IS NULL
     OR creation_timezone_offset_minutes BETWEEN -840 AND 840
   )`,
  `CREATE TABLE history_session_overlays (
    session_id TEXT PRIMARY KEY NOT NULL
      REFERENCES workout_sessions(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    effective_revision INTEGER NOT NULL CHECK(effective_revision >= 1),
    lifecycle TEXT NOT NULL CHECK(lifecycle IN ('active', 'voided')),
    snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
    effective_local_date TEXT NOT NULL CHECK(length(effective_local_date) = 10),
    effective_timezone TEXT NOT NULL CHECK(length(trim(effective_timezone)) > 0),
    effective_started_at_ms INTEGER NOT NULL CHECK(effective_started_at_ms >= 0),
    effective_completed_at_ms INTEGER CHECK(
      effective_completed_at_ms IS NULL
      OR effective_completed_at_ms >= effective_started_at_ms
    ),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms)
  ) STRICT`,
  `CREATE TABLE history_audit_events (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL
      REFERENCES workout_sessions(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    effective_revision INTEGER NOT NULL CHECK(effective_revision >= 1),
    event_type TEXT NOT NULL CHECK(event_type IN ('correction', 'void', 'restore')),
    field_identity TEXT NOT NULL CHECK(length(trim(field_identity)) > 0),
    before_json TEXT NOT NULL CHECK(json_valid(before_json)),
    after_json TEXT NOT NULL CHECK(json_valid(after_json)),
    occurred_at_ms INTEGER NOT NULL CHECK(occurred_at_ms >= 0)
  ) STRICT`,
  `CREATE TRIGGER history_audit_events_immutable_update
   BEFORE UPDATE ON history_audit_events
   BEGIN
     SELECT RAISE(ABORT, 'history_audit_immutable');
   END`,
  `CREATE TRIGGER history_audit_events_immutable_delete
   BEFORE DELETE ON history_audit_events
   BEGIN
     SELECT RAISE(ABORT, 'history_audit_immutable');
   END`,
  `CREATE TABLE history_subject_revisions (
    subject_id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(subject_id)) > 0),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0)
  ) STRICT`,
  `CREATE TABLE history_projection_freshness (
    subject_id TEXT PRIMARY KEY NOT NULL
      REFERENCES history_subject_revisions(subject_id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED,
    applied_revision INTEGER NOT NULL CHECK(applied_revision >= 0),
    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0)
  ) STRICT`,
  `CREATE TABLE history_rebuild_effects (
    id TEXT PRIMARY KEY NOT NULL,
    subject_id TEXT NOT NULL
      REFERENCES history_subject_revisions(subject_id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED,
    expected_revision INTEGER NOT NULL CHECK(expected_revision >= 0),
    payload_version INTEGER NOT NULL CHECK(payload_version >= 1),
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
    status TEXT NOT NULL CHECK(
      status IN ('pending', 'processing', 'completed', 'superseded', 'permanent_failure')
    ),
    attempt_count INTEGER NOT NULL CHECK(attempt_count >= 0),
    next_attempt_at_ms INTEGER NOT NULL CHECK(next_attempt_at_ms >= 0),
    claimed_at_ms INTEGER CHECK(claimed_at_ms IS NULL OR claimed_at_ms >= 0),
    lease_expires_at_ms INTEGER CHECK(
      lease_expires_at_ms IS NULL OR lease_expires_at_ms >= 0
    ),
    last_error_code TEXT CHECK(
      last_error_code IS NULL
      OR (
        length(last_error_code) BETWEEN 3 AND 80
        AND last_error_code NOT GLOB '*[^A-Za-z0-9_:-]*'
      )
    ),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
    CHECK(
      (status = 'processing'
       AND claimed_at_ms IS NOT NULL
       AND lease_expires_at_ms IS NOT NULL)
      OR
      (status <> 'processing'
       AND claimed_at_ms IS NULL
       AND lease_expires_at_ms IS NULL)
    ),
    UNIQUE(subject_id, expected_revision)
  ) STRICT`,
  `CREATE INDEX history_overlays_by_date
   ON history_session_overlays(lifecycle, effective_local_date, effective_started_at_ms)`,
  `CREATE INDEX history_audit_events_by_session
   ON history_audit_events(session_id, occurred_at_ms, id)`,
  `CREATE INDEX history_rebuild_effects_eligible
   ON history_rebuild_effects(status, next_attempt_at_ms, created_at_ms)`,
] as const;

async function executeAll(
  transaction: SqliteTransactionExecutor,
  statements: readonly string[],
): Promise<void> {
  for (const statement of statements) {
    await transaction.execute(statement);
  }
}

async function backfillCreationOffsets(
  transaction: SqliteTransactionExecutor,
): Promise<void> {
  const sessions = await transaction.queryAll<{
    id: string;
    timezone: string;
    started_at_ms: number;
  }>(
    "SELECT id, timezone, started_at_ms FROM workout_sessions ORDER BY id",
  );
  for (const session of sessions) {
    await transaction.execute(
      "UPDATE workout_sessions SET creation_timezone_offset_minutes = ? WHERE id = ?",
      [
        creationTimezoneOffsetMinutes(
          session.timezone,
          session.started_at_ms,
        ),
        session.id,
      ],
    );
  }
}

export const historyIntegrityMigration: Migration = Object.freeze({
  version: 13,
  name: "history-integrity",
  kind: "additive",
  async up(transaction) {
    await executeAll(transaction, HISTORY_INTEGRITY_SCHEMA_STATEMENTS);
    await backfillCreationOffsets(transaction);
  },
  async verify(transaction) {
    const rows = await transaction.queryAll<{
      type: "index" | "table" | "trigger";
      name: string;
    }>(
      "SELECT type, name FROM sqlite_master WHERE name LIKE 'history_%' ORDER BY name",
    );
    const available = new Set(rows.map(({ type, name }) => type + ":" + name));
    for (const required of [
      "table:history_session_overlays",
      "table:history_audit_events",
      "table:history_subject_revisions",
      "table:history_projection_freshness",
      "table:history_rebuild_effects",
      "trigger:history_audit_events_immutable_update",
      "trigger:history_audit_events_immutable_delete",
      "index:history_overlays_by_date",
      "index:history_audit_events_by_session",
      "index:history_rebuild_effects_eligible",
    ]) {
      if (!available.has(required)) {
        throw new Error("history_integrity_schema_incomplete");
      }
    }
    const columns = await transaction.queryAll<{ name: string }>(
      "PRAGMA table_info(workout_sessions)",
    );
    if (!columns.some(({ name }) => name === "creation_timezone_offset_minutes")) {
      throw new Error("history_creation_offset_column_missing");
    }
    const [missingOffset] = await transaction.queryAll<{ id: string }>(
      "SELECT id FROM workout_sessions WHERE creation_timezone_offset_minutes IS NULL LIMIT 1",
    );
    if (missingOffset !== undefined) {
      throw new Error("history_creation_offset_backfill_incomplete");
    }
  },
});

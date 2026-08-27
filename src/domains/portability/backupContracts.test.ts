import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  BACKUP_LIMITS,
  BackupContractError,
  LOGICAL_BACKUP_TABLES,
  parseLogicalBackupSnapshot,
} from "./backupContracts";

function snapshot(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    version: 1,
    snapshotId: "backup_01J5AV2QAXM8QQYWD0S8Y4A001",
    createdAtMs: 1_786_853_900_000,
    schemaVersion: 15,
    manifest: {
      catalogReferenceCount: 1,
      rowCounts: { app_settings: 1, exercises: 1 },
      totalRows: 2,
    },
    tables: {
      app_settings: [
        {
          key: "library_section",
          value_version: 1,
          value_json: "{\"section\":\"plans\"}",
          revision: 2,
          updated_at_ms: 1_786_853_900_000,
        },
      ],
      exercises: [
        {
          id: "exercise_01J5AV2QAXM8QQYWD0S8Y4A002",
          origin: "custom",
          name: "Cable row",
        },
      ],
    },
    catalogReferences: [
      {
        kind: "exercise",
        sourceNamespace: "gym-tracker",
        upstreamId: "cable-row",
        sourceRevision: "2026-08-24",
      },
    ],
    ...overrides,
  };
}

describe("logical backup contract", () => {
  it("allows only user-owned source tables and excludes raw database derivatives", () => {
    expect(LOGICAL_BACKUP_TABLES).toContain("app_settings");
    expect(LOGICAL_BACKUP_TABLES).toContain("workout_sessions");
    expect(LOGICAL_BACKUP_TABLES).toContain("history_audit_events");
    expect(LOGICAL_BACKUP_TABLES).toContain("session_rest_states");
    expect(LOGICAL_BACKUP_TABLES).toContain("progression_recommendations");
    expect(LOGICAL_BACKUP_TABLES).toContain("owned_progression_recommendations");
    expect(LOGICAL_BACKUP_TABLES).toContain("exercise_metric_baselines");
    expect(LOGICAL_BACKUP_TABLES).toContain("exercise_library_entries");
    expect(LOGICAL_BACKUP_TABLES).toContain("exercise_aliases");
    expect(LOGICAL_BACKUP_TABLES).toContain("exercise_taxonomy");
    expect(LOGICAL_BACKUP_TABLES).toContain("taxonomy_terms");
    expect(LOGICAL_BACKUP_TABLES).toContain("exercise_search_terms");
    expect(LOGICAL_BACKUP_TABLES).not.toContain("history_projection_period_inputs");
    expect(LOGICAL_BACKUP_TABLES).not.toContain("pending_effects");
    expect(LOGICAL_BACKUP_TABLES).not.toContain("sqlite_master");
  });

  it("parses a bounded versioned user-owned snapshot", () => {
    expect(parseLogicalBackupSnapshot(snapshot())).toEqual(snapshot());
  });

  it("rejects inherited object property names rather than treating them as logical tables", () => {
    expect(() => parseLogicalBackupSnapshot(snapshot({
      tables: {
        toString: [{ undefined: "crafted-row" }],
      },
    }))).toThrow("backup_snapshot_invalid");
  });

  it.each([
    ["an unsupported snapshot version", snapshot({ version: 2 })],
    ["an unknown root field", snapshot({ rawDatabasePath: "/private/data.db" })],
    ["an unknown table", snapshot({
      tables: { sqlite_master: [] },
    })],
    ["a raw database-shaped value", snapshot({
      tables: { app_settings: [{ database: new Uint8Array([1, 2, 3]) }] },
    })],
    ["a fractional numeric payload value", snapshot({
      tables: {
        app_settings: [{
          key: "theme",
          value_version: 1,
          value_json: "{}",
          revision: 1.5,
          updated_at_ms: 1,
        }],
      },
    })],
    ["a duplicate row identity", snapshot({
      tables: {
        app_settings: [
          { key: "theme", value_version: 1, value_json: "{}", revision: 1, updated_at_ms: 1 },
          { key: "theme", value_version: 1, value_json: "{}", revision: 2, updated_at_ms: 2 },
        ],
      },
    })],
    ["a string beyond the bounded archive contract", snapshot({
      tables: {
        app_settings: [{
          key: "too_large",
          value_version: 1,
          value_json: "x".repeat(BACKUP_LIMITS.maxStringBytes + 1),
          revision: 1,
          updated_at_ms: 1,
        }],
      },
    })],
  ])("rejects %s without exposing payload details", (_label, input) => {
    let caught: unknown;
    try {
      parseLogicalBackupSnapshot(input);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BackupContractError);
    expect(caught).toEqual(expect.objectContaining({
      kind: expect.stringMatching(/validation|unsupported_version/),
      retryable: false,
    }));
    expect(JSON.stringify(caught)).not.toContain("private/data.db");
  });

  it("rejects rows beyond the per-table ceiling before accepting a snapshot", () => {
    const rows = Array.from(
      { length: BACKUP_LIMITS.maxRowsPerTable + 1 },
      (_, index) => ({
        key: `setting_${index}`,
        value_version: 1,
        value_json: "{}",
        revision: 0,
        updated_at_ms: index,
      }),
    );

    expect(() => parseLogicalBackupSnapshot(snapshot({
      tables: { app_settings: rows },
      manifest: {
        catalogReferenceCount: 1,
        rowCounts: { app_settings: rows.length },
        totalRows: rows.length,
      },
    }))).toThrow("backup_snapshot_limit_exceeded");
  });

  it("rejects nesting beyond the portable format ceiling", () => {
    let value: unknown = null;
    for (let index = 0; index <= BACKUP_LIMITS.maxNestingDepth; index += 1) {
      value = { value };
    }

    expect(() => parseLogicalBackupSnapshot(snapshot({
      tables: {
        app_settings: [{
          key: "nested",
          value_version: 1,
          value,
          revision: 0,
          updated_at_ms: 1,
        }],
      },
      manifest: {
        catalogReferenceCount: 1,
        rowCounts: { app_settings: 1 },
        totalRows: 1,
      },
    }))).toThrow("backup_snapshot_limit_exceeded");
  });

  it.each([
    ["a non-object root", null],
    ["a root with missing required fields", { version: 1 }],
    ["a non-string snapshot identifier", snapshot({ snapshotId: 42 })],
    ["a blank snapshot identifier", snapshot({ snapshotId: "   " })],
    ["a negative creation time", snapshot({ createdAtMs: -1 })],
    ["a fractional creation time", snapshot({ createdAtMs: 1.5 })],
    ["a fractional schema version", snapshot({ schemaVersion: 1.5 })],
    ["a zero schema version", snapshot({ schemaVersion: 0 })],
    ["a non-object table collection", snapshot({ tables: [] })],
    ["a manifest that does not count the logical rows", snapshot({
      manifest: {
        catalogReferenceCount: 1,
        rowCounts: { app_settings: 1, exercises: 1 },
        totalRows: 3,
      },
    })],
    ["a manifest with invalid fields", snapshot({
      manifest: {
        catalogReferenceCount: 1,
        rowCounts: [],
        totalRows: 2,
      },
    })],
    ["a manifest whose catalog count differs from its references", snapshot({
      manifest: {
        catalogReferenceCount: 0,
        rowCounts: { app_settings: 1, exercises: 1 },
        totalRows: 2,
      },
    })],
    ["a manifest whose per-table count differs from the source rows", snapshot({
      manifest: {
        catalogReferenceCount: 1,
        rowCounts: { app_settings: 2, exercises: 1 },
        totalRows: 3,
      },
    })],
    ["a manifest with an unlisted table", snapshot({
      manifest: {
        catalogReferenceCount: 1,
        rowCounts: { app_settings: 1, exercises: 1, sqlite_master: 0 },
        totalRows: 2,
      },
    })],
    ["a non-array row collection", snapshot({ tables: { app_settings: {} } })],
    ["a non-object row", snapshot({ tables: { app_settings: ["not-a-row"] } })],
    ["a row without its declared primary key", snapshot({ tables: { app_settings: [{ value_json: "{}" }] } })],
    ["a blank row primary key", snapshot({ tables: { app_settings: [{ key: " ", value_json: "{}" }] } })],
    ["a non-array catalog reference collection", snapshot({ catalogReferences: {} })],
    ["a malformed catalog reference", snapshot({ catalogReferences: [{ kind: "exercise" }] })],
    ["an unsupported catalog reference kind", snapshot({
      catalogReferences: [{
        kind: "catalog",
        sourceNamespace: "source",
        upstreamId: "id",
        sourceRevision: "revision",
      }],
    })],
    ["a blank catalog reference source", snapshot({
      catalogReferences: [{
        kind: "plan",
        sourceNamespace: " ",
        upstreamId: "id",
        sourceRevision: "revision",
      }],
    })],
    ["a duplicate catalog reference", snapshot({
      catalogReferences: [{
        kind: "exercise",
        sourceNamespace: "gym-tracker",
        upstreamId: "cable-row",
        sourceRevision: "2026-08-24",
      }, {
        kind: "exercise",
        sourceNamespace: "gym-tracker",
        upstreamId: "cable-row",
        sourceRevision: "2026-08-24",
      }],
      manifest: {
        catalogReferenceCount: 2,
        rowCounts: { app_settings: 1, exercises: 1 },
        totalRows: 2,
      },
    })],
  ])("rejects %s at the logical snapshot boundary", (_label, input) => {
    expect(() => parseLogicalBackupSnapshot(input)).toThrow("backup_snapshot_invalid");
  });

  it("accepts zero-valued numeric source fields without relaxing integer validation", () => {
    expect(parseLogicalBackupSnapshot(snapshot({
      createdAtMs: 0,
      tables: {
        app_settings: [{
          key: "theme",
          value_version: 0,
          value_json: "{}",
          revision: 0,
          updated_at_ms: 0,
        }],
      },
      manifest: {
        catalogReferenceCount: 1,
        rowCounts: { app_settings: 1 },
        totalRows: 1,
      },
    }))).toEqual(expect.objectContaining({ createdAtMs: 0 }));
  });

  it("accepts null, booleans, arrays, and ordinary text values in owned rows", () => {
    expect(parseLogicalBackupSnapshot(snapshot({
      tables: {
        app_settings: [{
          key: "portable_values",
          value_json: "ordinary text",
          nullable: null,
          enabled: true,
          ordered_values: [1, "two", false],
        }],
      },
      manifest: {
        catalogReferenceCount: 1,
        rowCounts: { app_settings: 1 },
        totalRows: 1,
      },
    }))).toEqual(expect.objectContaining({
      tables: expect.objectContaining({
        app_settings: [expect.objectContaining({ nullable: null, enabled: true })],
      }),
    }));
  });

  it("validates the full composite source identity for tables without a scalar key", () => {
    expect(() => parseLogicalBackupSnapshot(snapshot({
      tables: {
        taxonomy_terms: [{
          kind: "equipment",
          slug: "barbell",
          display_name: "Barbell",
        }, {
          kind: "equipment",
          slug: "barbell",
          display_name: "Duplicate",
        }],
      },
      manifest: {
        catalogReferenceCount: 1,
        rowCounts: { taxonomy_terms: 2 },
        totalRows: 2,
      },
    }))).toThrow("backup_snapshot_invalid");

    expect(parseLogicalBackupSnapshot(snapshot({
      tables: {
        exercise_metric_baselines: [{
          exercise_id: "exercise_01",
          exercise_metric_generation: 2,
          status: "awaiting_comparable_observation",
        }],
      },
      manifest: {
        catalogReferenceCount: 1,
        rowCounts: { exercise_metric_baselines: 1 },
        totalRows: 1,
      },
    }))).toEqual(expect.objectContaining({
      tables: expect.objectContaining({
        exercise_metric_baselines: [expect.objectContaining({
          exercise_metric_generation: 2,
        })],
      }),
    }));
  });

  it("does not reject a malformed JSON-looking text field that remains an opaque source value", () => {
    expect(parseLogicalBackupSnapshot(snapshot({
      tables: {
        app_settings: [{ key: "opaque", value_json: "{incomplete" }],
      },
      manifest: {
        catalogReferenceCount: 1,
        rowCounts: { app_settings: 1 },
        totalRows: 1,
      },
    }))).toEqual(expect.objectContaining({ snapshotId: snapshot().snapshotId }));
  });

  it("preserves JSON-looking text as opaque SQLite content rather than revalidating its scalar semantics", () => {
    expect(parseLogicalBackupSnapshot(snapshot({
      tables: {
        app_settings: [{
          key: "display_preferences",
          value_json: "{\"textScale\":1.25}",
        }],
      },
      manifest: {
        catalogReferenceCount: 1,
        rowCounts: { app_settings: 1 },
        totalRows: 1,
      },
    }))).toEqual(expect.objectContaining({ snapshotId: snapshot().snapshotId }));
  });

  it("rejects the aggregate row ceiling across otherwise valid tables", () => {
    const firstTableRows = Array.from(
      { length: BACKUP_LIMITS.maxRowsPerTable },
      (_, index) => ({ key: `setting_${index}`, value_json: "{}" }),
    );
    const secondTableRows = Array.from(
      { length: BACKUP_LIMITS.maxRowsPerTable },
      (_, index) => ({ id: `exercise_${index}`, name: "Cable row" }),
    );

    expect(() => parseLogicalBackupSnapshot(snapshot({
      tables: {
        app_settings: firstTableRows,
        exercises: secondTableRows,
        plans: Array.from(
          { length: BACKUP_LIMITS.maxRowsTotal - (BACKUP_LIMITS.maxRowsPerTable * 2) + 1 },
          (_, index) => ({ id: `plan_${index}`, name: "Plan" }),
        ),
      },
    }))).toThrow("backup_snapshot_limit_exceeded");
  });

  it("rejects the aggregate row ceiling when the final table crosses it", () => {
    const rows = Array.from(
      { length: BACKUP_LIMITS.maxRowsPerTable },
      (_, index) => ({ id: `exercise_${index}`, name: "Cable row" }),
    );
    const settings = Array.from(
      { length: BACKUP_LIMITS.maxRowsPerTable },
      (_, index) => ({ key: `setting_${index}`, value_json: "{}" }),
    );

    expect(() => parseLogicalBackupSnapshot(snapshot({
      tables: {
        app_settings: settings,
        exercises: rows,
        plans: Array.from({ length: BACKUP_LIMITS.maxRowsPerTable }, (_, index) => ({ id: `plan_${index}` })),
        workout_sessions: Array.from({ length: BACKUP_LIMITS.maxRowsPerTable }, (_, index) => ({ id: `session_${index}` })),
        session_exercises: Array.from({ length: BACKUP_LIMITS.maxRowsPerTable }, (_, index) => ({ id: `session_exercise_${index}` })),
      },
    }))).toThrow("backup_snapshot_limit_exceeded");
  });

  it("rejects a catalog reference collection beyond its explicit ceiling", () => {
    const catalogReferences = Array.from(
      { length: BACKUP_LIMITS.maxRowsPerTable + 1 },
      (_, index) => ({
        kind: "exercise" as const,
        sourceNamespace: "gym-tracker",
        upstreamId: `exercise_${index}`,
        sourceRevision: "1",
      }),
    );

    expect(() => parseLogicalBackupSnapshot(snapshot({ catalogReferences }))).toThrow(
      "backup_snapshot_limit_exceeded",
    );
  });
});

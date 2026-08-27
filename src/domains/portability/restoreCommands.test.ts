import { afterEach, describe, expect, it, jest } from "@jest/globals";

import {
  BACKUP_LIMITS,
  LOGICAL_BACKUP_TABLES,
  type LogicalBackupSnapshot,
} from "./backupContracts";
import * as backupFormat from "./backupFormat";
import {
  BackupFormatError,
  createBackupEnvelopeCodec,
  type BackupEnvelopeCodec,
  type BackupEnvelopeCryptoPort,
} from "./backupFormat";
import {
  createRestoreCommands,
  createRestorePreflightStore,
  RestoreCommandError,
  RestoreCandidateProbeError,
} from "./restoreCommands";
import type { PasswordKdfPort } from "../../platform/crypto/passwordKdf";
import { RestoreFilePortError } from "../../platform/files/expoBackupFilePort";

const text = new TextEncoder();

function snapshot(override: Partial<LogicalBackupSnapshot> = {}): LogicalBackupSnapshot {
  const emptyTables = Object.fromEntries(LOGICAL_BACKUP_TABLES.map((table) => [table, []])) as LogicalBackupSnapshot["tables"];
  const appSettings = [{ key: "theme", revision: 1, updated_at_ms: 100, value_json: "{\"mode\":\"dark\"}", value_version: 1 }];
  const tables: LogicalBackupSnapshot["tables"] = { ...emptyTables, app_settings: appSettings, ...(override.tables ?? {}) };
  const catalogReferences = override.catalogReferences ?? [{ kind: "exercise" as const, sourceNamespace: "gym-tracker.catalog", sourceRevision: "7", upstreamId: "row" }];
  const rowCounts = Object.fromEntries(LOGICAL_BACKUP_TABLES.map((table) => [table, tables[table]!.length]));
  return {
    version: 1,
    snapshotId: "backup_01J5AV2QAXM8QQYWD0S8Y4A001",
    createdAtMs: 1_786_853_900_000,
    schemaVersion: 16,
    manifest: { catalogReferenceCount: catalogReferences.length, rowCounts, totalRows: Object.values(rowCounts).reduce((total, count) => total + count, 0) },
    ...override,
    tables,
    catalogReferences,
  };
}

const kdf: PasswordKdfPort = {
  async derive(password) {
    return {
      algorithm: "argon2id",
      bytes: new Uint8Array(32).fill(password[0] ?? 0),
      durationMs: 1,
      provider: "Bouncy Castle",
      providerVersion: "1.85.2",
    };
  },
};

const candidateProbe = { validateCandidate: async () => undefined };

const schema = {
  async columnsFor(table: string) {
    if (table === "app_settings") {
      return [
        { name: "key", sqliteType: "TEXT" as const, notNull: true },
        { name: "value_version", sqliteType: "INTEGER" as const, notNull: true },
        { name: "value_json", sqliteType: "TEXT" as const, notNull: true },
        { name: "revision", sqliteType: "INTEGER" as const, notNull: true },
        { name: "updated_at_ms", sqliteType: "INTEGER" as const, notNull: true },
      ];
    }
    if (table === "exercise_owner_preferences") return [
      { name: "exercise_id", sqliteType: "TEXT" as const, notNull: true },
      { name: "favorite", sqliteType: "INTEGER" as const, notNull: true },
      { name: "hidden", sqliteType: "INTEGER" as const, notNull: true },
      { name: "archived", sqliteType: "INTEGER" as const, notNull: true },
      { name: "revision", sqliteType: "INTEGER" as const, notNull: true },
      { name: "updated_at_ms", sqliteType: "INTEGER" as const, notNull: true },
    ];
    if (table === "plans") return [
      { name: "id", sqliteType: "TEXT" as const, notNull: true },
      { name: "content_pack_id", sqliteType: "TEXT" as const, notNull: false },
      { name: "origin", sqliteType: "TEXT" as const, notNull: true },
    ];
    if (table === "owned_plan_mutation_requests") return [
      { name: "request_id", sqliteType: "TEXT" as const, notNull: true },
      { name: "request_sha256", sqliteType: "TEXT" as const, notNull: true },
      { name: "operation", sqliteType: "TEXT" as const, notNull: true },
      { name: "source_plan_id", sqliteType: "TEXT" as const, notNull: false },
      { name: "result_plan_id", sqliteType: "TEXT" as const, notNull: true },
      { name: "expected_revision", sqliteType: "INTEGER" as const, notNull: false },
      { name: "result_revision", sqliteType: "INTEGER" as const, notNull: true },
      { name: "result_json", sqliteType: "TEXT" as const, notNull: true },
      { name: "committed_at_ms", sqliteType: "INTEGER" as const, notNull: true },
    ];
    if (table === "plan_days") return [{ name: "id", sqliteType: "TEXT" as const, notNull: true }, { name: "plan_id", sqliteType: "TEXT" as const, notNull: true }];
    if (table === "plan_day_exercises") return [
      { name: "id", sqliteType: "TEXT" as const, notNull: true },
      { name: "plan_day_id", sqliteType: "TEXT" as const, notNull: true },
      { name: "exercise_id", sqliteType: "TEXT" as const, notNull: true },
      { name: "metric_profile", sqliteType: "TEXT" as const, notNull: true },
      { name: "metric_contract_version", sqliteType: "INTEGER" as const, notNull: true },
      { name: "exercise_metric_generation", sqliteType: "INTEGER" as const, notNull: true },
    ];
    return [{ name: "id", sqliteType: "TEXT" as const, notNull: true }];
  },
};

function tag(aad: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const result = new Uint8Array(16);
  for (const [index, value] of [...aad, ...ciphertext].entries()) {
    const position = index % result.byteLength;
    result[position] = ((result[position] ?? 0) + value + index) & 0xff;
  }
  return result;
}

function cryptoPort(): BackupEnvelopeCryptoPort {
  return {
    async deriveKey(input) { return { key: new Uint8Array(32).fill(input.password[0] ?? 0) }; },
    async encrypt(input) {
      const ciphertext = input.plaintext.map((value) => value ^ (input.key[0] ?? 0));
      return { ciphertext, tag: tag(input.aad, ciphertext) };
    },
    async decrypt(input) {
      const expected = tag(input.aad, input.ciphertext);
      if (!input.tag.every((value, index) => value === expected[index])) throw new Error("authentication failed");
      return input.ciphertext.map((value) => value ^ (input.key[0] ?? 0));
    },
  };
}

async function archiveFor(value = snapshot()): Promise<Uint8Array> {
  return createBackupEnvelopeCodec(cryptoPort()).seal({
    nonce: Uint8Array.from({ length: 12 }, (_value, index) => index + 2),
    password: text.encode("owner-password"),
    salt: Uint8Array.from({ length: 16 }, (_value, index) => index + 1),
    snapshot: value,
  });
}

function decodedSnapshotCodec(snapshotForOpen: () => LogicalBackupSnapshot): BackupEnvelopeCodec {
  return {
    async seal() { return new Uint8Array([1]); },
    async open() { return snapshotForOpen(); },
  };
}

function failingCodec(error: unknown): BackupEnvelopeCodec {
  return {
    async seal() { return new Uint8Array([1]); },
    async open() { throw error; },
  };
}

function restoreSchema(overrides: Readonly<Record<string, readonly { name: string; sqliteType: "INTEGER" | "TEXT"; notNull: boolean }[]>>) {
  return {
    async columnsFor(table: string) {
      return overrides[table] ?? schema.columnsFor(table);
    },
  };
}

describe("restore preflight", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function commandsForDecodedSnapshot(
    value: LogicalBackupSnapshot,
    overrides: Partial<Parameters<typeof createRestoreCommands>[0]> = {},
  ) {
    jest.spyOn(backupFormat, "createBackupEnvelopeCodec").mockReturnValue(decodedSnapshotCodec(() => value));
    return createRestoreCommands({
      crypto: cryptoPort(),
      files: { readSelectedArchiveAtMost: async () => Uint8Array.of(1) },
      kdf,
      schema,
      candidateProbe,
      store: createRestorePreflightStore({ tokenFactory: () => "decoded-token" }),
      ...overrides,
    });
  }

  async function expectDecodedSnapshotRejected(
    value: LogicalBackupSnapshot,
    overrides: Partial<Parameters<typeof createRestoreCommands>[0]> = {},
  ) {
    await expect(commandsForDecodedSnapshot(value, overrides).preflightSecureRestore({ password: "owner-password" }))
      .rejects.toEqual(new RestoreCommandError("restore_archive_invalid"));
  }

  it.each([15, 16])("accepts logical producer schema version %i", async (schemaVersion) => {
    const commands = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost: () => archiveFor(snapshot({ schemaVersion })) },
      kdf, schema, candidateProbe, store: createRestorePreflightStore({ tokenFactory: () => "schema-" + schemaVersion }),
    });
    await expect(commands.preflightSecureRestore({ password: "owner-password" })).resolves.toEqual(expect.objectContaining({ outcome: "ready" }));
  });

  it.each([14, 17])("rejects unsupported logical producer schema version %i", async (schemaVersion) => {
    const commands = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost: () => archiveFor(snapshot({ schemaVersion })) },
      kdf, schema, candidateProbe, store: createRestorePreflightStore({ tokenFactory: () => "unsupported" }),
    });
    await expect(commands.preflightSecureRestore({ password: "owner-password" })).rejects.toEqual(expect.objectContaining({ code: "restore_archive_unsupported_version" }));
  });

  it("returns a bounded preview only after authenticating, validating all 43 tables, and checking local references", async () => {
    const store = createRestorePreflightStore({ tokenFactory: () => "opaque-token" });
    const archive = await archiveFor();
    const readSelectedArchiveAtMost = jest.fn(async (limit: number) => {
      expect(limit).toBe(BACKUP_LIMITS.maxArchiveBytes + 1);
      return archive;
    });
    const availabilityFor = jest.fn(async () => "available" as const);
    const commands = createRestoreCommands({
      crypto: cryptoPort(),
      files: { readSelectedArchiveAtMost },
      kdf,
      schema,
      candidateProbe,
      referenceAvailability: { availabilityFor },
      store,
    });

    await expect(commands.preflightSecureRestore({ password: "owner-password" })).resolves.toEqual({
      outcome: "ready",
      token: "opaque-token",
      preview: {
        sourceFormatVersion: 1,
        createdAtMs: 1_786_853_900_000,
        replacementCounts: { app_settings: 1 },
        references: {
          internalSnapshotReferences: expect.any(Number),
          requiredLocalBundled: { available: 0, unavailable: 0 },
          catalogReferences: { available: 1, unavailable: 0 },
        },
      },
    });
    expect(readSelectedArchiveAtMost).toHaveBeenCalledTimes(1);
    expect(availabilityFor).toHaveBeenCalledTimes(1);
    expect(store.consume("opaque-token")?.snapshot.tables.app_settings).toEqual(snapshot().tables.app_settings);
  });

  it.each([
    ["wrong password", async () => archiveFor(), "wrong-password"],
    ["AAD tampering", async () => { const archive = await archiveFor(); archive[9] = (archive[9] ?? 0) ^ 1; return archive; }, "owner-password"],
    ["ciphertext tampering", async () => { const archive = await archiveFor(); archive[archive.byteLength - 17] = (archive[archive.byteLength - 17] ?? 0) ^ 1; return archive; }, "owner-password"],
    ["tag tampering", async () => { const archive = await archiveFor(); archive[archive.byteLength - 1] = (archive[archive.byteLength - 1] ?? 0) ^ 1; return archive; }, "owner-password"],
  ])("maps %s to one safe public failure", async (_label, makeArchive, password) => {
    const commands = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost: () => makeArchive() },
      kdf,
      schema,
      candidateProbe,
      store: createRestorePreflightStore({ tokenFactory: () => "unused" }),
    });
    await expect(commands.preflightSecureRestore({ password })).rejects.toEqual(new RestoreCommandError("restore_archive_unavailable"));
  });

  it.each([
    ["a bounded selected file", new RestoreFilePortError("limit_exceeded"), "restore_archive_limit_exceeded"],
    ["a native picker failure", new RestoreFilePortError("picker_failed"), "restore_archive_invalid"],
    ["a native read failure", new RestoreFilePortError("read_failed"), "restore_archive_invalid"],
  ] as Array<[string, RestoreFilePortError, "restore_archive_limit_exceeded" | "restore_archive_invalid"]>)("maps %s through the command boundary without leaking native details", async (_label, failure, code) => {
    const restorer = { restore: jest.fn(async () => ({ state: "rebuild_pending" as const })) };
    const commands = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost: async () => { throw failure; } },
      kdf, schema, candidateProbe, restorer, store: createRestorePreflightStore({ tokenFactory: () => "unissued" }),
    });
    await expect(commands.preflightSecureRestore({ password: "owner-password" })).rejects.toEqual(new RestoreCommandError(code));
    expect(restorer.restore).not.toHaveBeenCalled();
    await expect(commands.preflightSecureRestore({ password: "owner-password" })).rejects.not.toMatchObject({ message: expect.stringContaining("content://") });
  });

  it("rejects an incomplete, extra-column, duplicate, or invalidly-referenced snapshot before issuing a token", async () => {
    const validAppSetting = snapshot().tables.app_settings![0]!;
    const cases = [
      (() => {
        const value = snapshot();
        const tables = { ...value.tables } as Record<string, LogicalBackupSnapshot["tables"][string]>;
        delete tables.exercises;
        const rowCounts = { ...value.manifest.rowCounts } as Record<string, number>;
        delete rowCounts.exercises;
        return { ...value, tables, manifest: { ...value.manifest, rowCounts, totalRows: 1 } } as LogicalBackupSnapshot;
      })(),
      snapshot({ tables: { app_settings: [{ ...validAppSetting, untrusted_column: "no" }] } }),
      snapshot({ tables: { app_settings: [validAppSetting, validAppSetting] } }),
      snapshot({ tables: { session_exercises: [{ id: "session-exercise", session_id: "missing-session" }] } }),
    ];
    for (const value of cases) {
      const commands = createRestoreCommands({
        crypto: cryptoPort(), files: { readSelectedArchiveAtMost: () => archiveFor(value) },
        kdf,
        schema,
        candidateProbe,
        store: createRestorePreflightStore({ tokenFactory: () => "unused" }),
      });
      await expect(commands.preflightSecureRestore({ password: "owner-password" })).rejects.toBeInstanceOf(RestoreCommandError);
    }
  });

  it.each([
    ["an empty password", ""],
    ["a password above the UTF-8 limit", "a".repeat(1_025)],
  ])("rejects %s before opening the selected archive", async (_label, password) => {
    const readSelectedArchiveAtMost = jest.fn(async () => Uint8Array.of(1));
    const commands = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost }, kdf, schema, candidateProbe,
      store: createRestorePreflightStore({ tokenFactory: () => "unused" }),
    });

    await expect(commands.preflightSecureRestore({ password })).rejects.toEqual(new RestoreCommandError("restore_archive_invalid"));
    expect(readSelectedArchiveAtMost).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing manifest key", () => {
      const value = snapshot();
      const rowCounts = { ...value.manifest.rowCounts } as Record<string, number>;
      delete rowCounts.exercises;
      return { ...value, manifest: { ...value.manifest, rowCounts } } as LogicalBackupSnapshot;
    }],
    ["an extra manifest key", () => {
      const value = snapshot();
      return { ...value, manifest: { ...value.manifest, rowCounts: { ...value.manifest.rowCounts, untrusted: 0 } } } as LogicalBackupSnapshot;
    }],
    ["a mismatched table count", () => {
      const value = snapshot();
      return { ...value, manifest: {
        ...value.manifest,
        rowCounts: { ...value.manifest.rowCounts, app_settings: 0, exercises: 1 },
      } } as LogicalBackupSnapshot;
    }],
    ["a mismatched total row count", () => {
      const value = snapshot();
      return { ...value, manifest: { ...value.manifest, totalRows: value.manifest.totalRows + 1 } } as LogicalBackupSnapshot;
    }],
  ])("rejects %s from a decoded archive", async (_label, makeSnapshot) => {
    await expectDecodedSnapshotRejected(makeSnapshot());
  });

  it.each([
    ["an empty local schema", restoreSchema({ app_settings: [] }), snapshot()],
    ["duplicate local schema columns", restoreSchema({ app_settings: [
      { name: "key", sqliteType: "TEXT", notNull: true },
      { name: "key", sqliteType: "TEXT", notNull: true },
    ] }), snapshot()],
    ["a null required column", schema, snapshot({ tables: { app_settings: [{ ...snapshot().tables.app_settings![0]!, key: null }] } })],
    ["a type mismatch", schema, snapshot({ tables: { app_settings: [{ ...snapshot().tables.app_settings![0]!, revision: "1" }] } })],
    ["an unsafe integer", schema, snapshot({ tables: { app_settings: [{ ...snapshot().tables.app_settings![0]!, revision: Number.MAX_SAFE_INTEGER + 1 }] } })],
    ["an invalid primary key", schema, snapshot({ tables: { app_settings: [{ ...snapshot().tables.app_settings![0]!, key: " " }] } })],
    ["a duplicate primary key", schema, snapshot({ tables: { app_settings: [snapshot().tables.app_settings![0]!, snapshot().tables.app_settings![0]!] } })],
    ["an unsafe numeric primary key", restoreSchema({ app_settings: [
      { name: "key", sqliteType: "INTEGER", notNull: true },
      { name: "value_version", sqliteType: "INTEGER", notNull: true },
      { name: "value_json", sqliteType: "TEXT", notNull: true },
      { name: "revision", sqliteType: "INTEGER", notNull: true },
      { name: "updated_at_ms", sqliteType: "INTEGER", notNull: true },
    ] }), snapshot({ tables: { app_settings: [{ ...snapshot().tables.app_settings![0]!, key: Number.MAX_SAFE_INTEGER + 1 }] } })],
  ])("rejects %s in decoded rows", async (_label, decodedSchema, value) => {
    await expectDecodedSnapshotRejected(value, { schema: decodedSchema });
  });

  it("accepts nullable columns but rejects non-object rows and unsafe reference values", async () => {
    const nullableSchema = restoreSchema({
      app_settings: [
        { name: "key", sqliteType: "TEXT", notNull: true },
        { name: "note", sqliteType: "TEXT", notNull: false },
      ],
    });
    await expect(commandsForDecodedSnapshot(snapshot({ tables: { app_settings: [{ key: "theme", note: null }] } }), { schema: nullableSchema })
      .preflightSecureRestore({ password: "owner-password" })).resolves.toEqual(expect.objectContaining({ outcome: "ready" }));

    await expectDecodedSnapshotRejected(snapshot({ tables: { app_settings: [null as never] } }));
    await expectDecodedSnapshotRejected(snapshot({ tables: { app_settings: [[] as never] } }));
    await expectDecodedSnapshotRejected(snapshot({ tables: { app_settings: ["row" as never] } }));
    await expectDecodedSnapshotRejected(snapshot({ tables: { session_exercises: [{ id: "child", session_id: Number.MAX_SAFE_INTEGER + 1 }] } }));
    await expectDecodedSnapshotRejected(snapshot({ tables: { session_exercises: [{ id: "child", session_id: undefined as never }] } }), {
      schema: restoreSchema({ session_exercises: [
        { name: "id", sqliteType: "TEXT", notNull: true },
        { name: "session_id", sqliteType: "TEXT", notNull: false },
      ] }),
    });
  });

  it("accepts a safe numeric primary key but rejects a partially-null composite reference", async () => {
    const numericKeySchema = restoreSchema({ app_settings: [
      { name: "key", sqliteType: "INTEGER", notNull: true },
      { name: "value_version", sqliteType: "INTEGER", notNull: true },
      { name: "value_json", sqliteType: "TEXT", notNull: true },
      { name: "revision", sqliteType: "INTEGER", notNull: true },
      { name: "updated_at_ms", sqliteType: "INTEGER", notNull: true },
    ] });
    await expect(commandsForDecodedSnapshot(snapshot({ tables: {
      app_settings: [{ ...snapshot().tables.app_settings![0]!, key: 1 }],
    } }), { schema: numericKeySchema }).preflightSecureRestore({ password: "owner-password" }))
      .resolves.toEqual(expect.objectContaining({ outcome: "ready" }));

    const partialReferenceSchema = restoreSchema({ plan_day_exercises: [
      { name: "id", sqliteType: "TEXT", notNull: true },
      { name: "plan_day_id", sqliteType: "TEXT", notNull: true },
      { name: "exercise_id", sqliteType: "TEXT", notNull: false },
      { name: "metric_profile", sqliteType: "TEXT", notNull: false },
      { name: "metric_contract_version", sqliteType: "INTEGER", notNull: false },
      { name: "exercise_metric_generation", sqliteType: "INTEGER", notNull: false },
    ] });
    await expectDecodedSnapshotRejected(snapshot({ tables: {
      plans: [{ id: "plan", content_pack_id: null, origin: "custom" }],
      plan_days: [{ id: "day", plan_id: "plan" }],
      plan_day_exercises: [{
        id: "occurrence", plan_day_id: "day", exercise_id: "exercise",
        metric_profile: null, metric_contract_version: 1, exercise_metric_generation: 1,
      }],
    } }), { schema: partialReferenceSchema });
  });

  it("rejects invalid domain enum, JSON, and active-uniqueness facts after row validation", async () => {
    await expectDecodedSnapshotRejected(snapshot({ tables: {
      plans: [{ id: "plan", content_pack_id: null, origin: "bundled" }],
    } }));
    await expectDecodedSnapshotRejected(snapshot({ tables: {
      app_settings: [{ ...snapshot().tables.app_settings![0]!, value_json: "{" }],
    } }));

    const activePlanSchema = restoreSchema({
      plans: [
        { name: "id", sqliteType: "TEXT", notNull: true },
        { name: "content_pack_id", sqliteType: "TEXT", notNull: false },
        { name: "origin", sqliteType: "TEXT", notNull: true },
        { name: "is_active", sqliteType: "INTEGER", notNull: true },
      ],
    });
    await expectDecodedSnapshotRejected(snapshot({ tables: {
      plans: [
        { id: "first", content_pack_id: null, origin: "custom", is_active: 1 },
        { id: "second", content_pack_id: null, origin: "copied", is_active: 1 },
      ],
    } }), { schema: activePlanSchema });

    const activeSessionSchema = restoreSchema({
      workout_sessions: [
        { name: "id", sqliteType: "TEXT", notNull: true },
        { name: "status", sqliteType: "TEXT", notNull: true },
      ],
    });
    await expectDecodedSnapshotRejected(snapshot({ tables: {
      workout_sessions: [
        { id: "first", status: "in_progress" },
        { id: "second", status: "in_progress" },
      ],
    } }), { schema: activeSessionSchema });
  });

  it("rejects unresolved bundled references when the retained lookup is missing or says unavailable", async () => {
    const value = snapshot({ tables: {
      plans: [{ id: "plan", content_pack_id: null, origin: "custom" }],
      plan_days: [{ id: "day", plan_id: "plan" }],
      plan_day_exercises: [{
        id: "occurrence", plan_day_id: "day", exercise_id: "bundled",
        metric_profile: "load_reps", metric_contract_version: 1, exercise_metric_generation: 1,
      }],
    } });
    await expectDecodedSnapshotRejected(value);
    await expectDecodedSnapshotRejected(value, {
      retainedReferences: { hasRetainedIdentity: async () => false },
    });
  });

  it.each([
    ["an empty selected archive", async () => new Uint8Array()],
    ["an invalid selected archive type", async () => undefined as unknown as Uint8Array],
  ])("rejects %s without opening it", async (_label, readSelectedArchiveAtMost) => {
    const commands = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost }, kdf, schema, candidateProbe,
      store: createRestorePreflightStore({ tokenFactory: () => "unused" }),
    });
    await expect(commands.preflightSecureRestore({ password: "owner-password" }))
      .rejects.toEqual(new RestoreCommandError("restore_archive_invalid"));
  });

  const codecFailureCases: ReadonlyArray<readonly [Error, ConstructorParameters<typeof RestoreCommandError>[0]]> = [
    [new BackupFormatError("backup_archive_unsupported_version"), "restore_archive_unsupported_version"],
    [new BackupFormatError("backup_archive_limit_exceeded"), "restore_archive_limit_exceeded"],
    [new BackupFormatError("backup_archive_invalid"), "restore_archive_unavailable"],
    [new Error("unexpected decoder failure"), "restore_archive_unavailable"],
  ];
  it.each(codecFailureCases)("maps codec failure %s to its public restore error", async (failure, code) => {
    jest.spyOn(backupFormat, "createBackupEnvelopeCodec").mockReturnValue(failingCodec(failure));
    const commands = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost: async () => Uint8Array.of(1) },
      kdf, schema, candidateProbe, store: createRestorePreflightStore({ tokenFactory: () => "unused" }),
    });
    await expect(commands.preflightSecureRestore({ password: "owner-password" }))
      .rejects.toEqual(new RestoreCommandError(code));
  });

  it("invalidates an earlier token for cancellation, oversize input, and every failed new selection", async () => {
    let next = 0;
    const store = createRestorePreflightStore({ tokenFactory: () => "token-" + (++next) });
    const commands = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost: () => archiveFor() },
      kdf, store,
      schema,
      candidateProbe,
    });
    const ready = await commands.preflightSecureRestore({ password: "owner-password" });
    if (ready.outcome !== "ready") throw new Error("expected ready");
    const cancelled = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost: async () => null },
      kdf, store,
      schema,
      candidateProbe,
    });
    await expect(cancelled.preflightSecureRestore({ password: "owner-password" })).resolves.toEqual({ outcome: "cancelled" });
    expect(store.consume(ready.token)).toBeNull();
    await expect(commands.preflightSecureRestore({ password: "owner-password" })).resolves.toEqual(expect.objectContaining({ outcome: "ready" }));
    const oversized = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost: async () => new Uint8Array(BACKUP_LIMITS.maxArchiveBytes + 1) },
      kdf, store,
      schema,
      candidateProbe,
    });
    await expect(oversized.preflightSecureRestore({ password: "owner-password" })).rejects.toEqual(new RestoreCommandError("restore_archive_limit_exceeded"));
    expect(store.consume("token-2")).toBeNull();
  });

  it("consumes the opaque Task 2 handoff atomically and never exposes passwords, paths, or payload", async () => {
    const store = createRestorePreflightStore({ tokenFactory: () => "single-use" });
    const commands = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost: () => archiveFor() },
      kdf, schema, candidateProbe, store,
    });
    const result = await commands.preflightSecureRestore({ password: "owner-password" });
    if (result.outcome !== "ready") throw new Error("expected ready");
    const consumed = store.consume(result.token);
    expect(consumed).toEqual(expect.objectContaining({ digest: expect.any(String) }));
    expect(store.consume(result.token)).toBeNull();
    expect(JSON.stringify(result)).not.toContain("owner-password");
    expect(JSON.stringify(result)).not.toContain("value_json");
  });

  it("requires exact case-sensitive REPLACE before consuming a ready token", async () => {
    const store = createRestorePreflightStore({ tokenFactory: () => "commit-token" });
    const restorer = { restore: jest.fn(async () => ({ state: "rebuild_pending" as const })) };
    const commands = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost: () => archiveFor() },
      kdf, schema, candidateProbe, restorer, store,
    });
    const ready = await commands.preflightSecureRestore({ password: "owner-password" });
    if (ready.outcome !== "ready") throw new Error("expected ready");

    await expect(commands.commitSecureRestore({
      token: ready.token, confirmation: "replace",
    })).rejects.toEqual(expect.objectContaining({ code: "restore_confirmation_invalid" }));
    expect(restorer.restore).not.toHaveBeenCalled();

    await expect(commands.commitSecureRestore({
      token: ready.token, confirmation: "REPLACE",
    })).resolves.toEqual({ state: "rebuild_pending" });
    expect(restorer.restore).toHaveBeenCalledTimes(1);
  });

  it("consumes a token before the writer attempt so a failed commit cannot replay", async () => {
    const store = createRestorePreflightStore({ tokenFactory: () => "failure-token" });
    const restorer = { restore: jest.fn(async () => { throw new Error("write failed"); }) };
    const commands = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost: () => archiveFor() },
      kdf, schema, candidateProbe, restorer, store,
    });
    const ready = await commands.preflightSecureRestore({ password: "owner-password" });
    if (ready.outcome !== "ready") throw new Error("expected ready");

    await expect(commands.commitSecureRestore({
      token: ready.token, confirmation: "REPLACE",
    })).rejects.toEqual(expect.objectContaining({ code: "restore_commit_failed" }));
    await expect(commands.commitSecureRestore({
      token: ready.token, confirmation: "REPLACE",
    })).rejects.toEqual(expect.objectContaining({ code: "restore_preflight_token_invalid" }));
    expect(restorer.restore).toHaveBeenCalledTimes(1);
  });

  it("invalidates an issued preflight token when its UI owner abandons it", async () => {
    const store = createRestorePreflightStore({ tokenFactory: () => "abandoned-token" });
    const restorer = { restore: jest.fn(async () => ({ state: "rebuild_pending" as const })) };
    const commands = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost: () => archiveFor() },
      kdf, schema, candidateProbe, restorer, store,
    });
    const ready = await commands.preflightSecureRestore({ password: "owner-password" });
    if (ready.outcome !== "ready") throw new Error("expected ready");

    commands.invalidateSecureRestorePreflight(ready.token);

    await expect(commands.commitSecureRestore({
      token: ready.token, confirmation: "REPLACE",
    })).rejects.toEqual(expect.objectContaining({ code: "restore_preflight_token_invalid" }));
    expect(restorer.restore).not.toHaveBeenCalled();
  });

  it("rejects empty and active-token collisions without ambiguously rebinding a snapshot", () => {
    const empty = createRestorePreflightStore({ tokenFactory: () => "" });
    expect(() => empty.issue({ snapshot: snapshot(), preview: {} as never, digest: "x" })).toThrow("restore_preflight_token_invalid");
    const duplicate = createRestorePreflightStore({ tokenFactory: () => "same-token" });
    duplicate.issue({ snapshot: snapshot(), preview: {} as never, digest: "one" });
    expect(() => duplicate.issue({ snapshot: snapshot(), preview: {} as never, digest: "two" })).toThrow("restore_preflight_token_invalid");
  });

  it("requires a local retained identity for a bundled exercise reference and records it as required availability", async () => {
    const value = snapshot({ tables: {
      exercise_owner_preferences: [{
        exercise_id: "bundled-exercise",
        favorite: 1,
        hidden: 0,
        archived: 0,
        revision: 1,
        updated_at_ms: 100,
      }],
    } });
    const retainedReferences = { hasRetainedIdentity: jest.fn(async () => true) };
    const commands = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost: () => archiveFor(value) },
      kdf, schema, candidateProbe, retainedReferences, store: createRestorePreflightStore({ tokenFactory: () => "retained" }),
    });
    await expect(commands.preflightSecureRestore({ password: "owner-password" })).resolves.toEqual(expect.objectContaining({
      preview: expect.objectContaining({ references: expect.objectContaining({ requiredLocalBundled: { available: 1, unavailable: 0 } }) }),
    }));
    expect(retainedReferences.hasRetainedIdentity).toHaveBeenCalledWith({
      table: "exercise_library_entries",
      columns: ["exercise_id"],
      values: ["bundled-exercise"],
    });
  });

  it("reports both present and absent catalog identities in the preview without treating either as an import blocker", async () => {
    const references = [
      { kind: "exercise" as const, sourceNamespace: "catalog", upstreamId: "present", sourceRevision: "1" },
      { kind: "plan" as const, sourceNamespace: "starter", upstreamId: "missing", sourceRevision: "2" },
    ];
    const value = snapshot({
      catalogReferences: references,
      manifest: { ...snapshot().manifest, catalogReferenceCount: references.length },
    });
    const availabilityFor = jest.fn(async (reference: typeof references[number]) =>
      reference.upstreamId === "present" ? "available" as const : "unavailable" as const,
    );
    const commands = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost: () => archiveFor(value) },
      kdf, schema, candidateProbe, referenceAvailability: { availabilityFor },
      store: createRestorePreflightStore({ tokenFactory: () => "catalog-references" }),
    });

    await expect(commands.preflightSecureRestore({ password: "owner-password" })).resolves.toEqual(expect.objectContaining({
      preview: expect.objectContaining({
        references: expect.objectContaining({
          catalogReferences: { available: 1, unavailable: 1 },
        }),
      }),
    }));
    expect(availabilityFor).toHaveBeenCalledTimes(2);
  });

  it("accepts a copied-plan mutation whose source plan is retained bundled authority", async () => {
    const source = snapshot();
    const tables = { ...source.tables } as Record<string, LogicalBackupSnapshot["tables"][string]>;
    const copiedPlan = source.tables.plans![0] as Record<string, unknown>;
    tables.plans = [{ ...copiedPlan, id: "copied-plan", content_pack_id: null, origin: "copied" }];
    const mutation = source.tables.owned_plan_mutation_requests![0] as Record<string, unknown>;
    tables.owned_plan_mutation_requests = [{
      ...mutation,
      request_id: "duplicate", request_sha256: "a".repeat(64), operation: "duplicate",
      source_plan_id: "bundled-plan", result_plan_id: "copied-plan", expected_revision: 1,
      result_revision: 1, result_json: "{}", committed_at_ms: 1,
    }];
    const rowCounts = Object.fromEntries(LOGICAL_BACKUP_TABLES.map((table) => [table, tables[table]!.length]));
    const value = snapshot({ tables });
    const manifest = { catalogReferenceCount: 1, rowCounts, totalRows: Object.values(rowCounts).reduce((sum, count) => sum + count, 0) };
    const valid = { ...value, manifest } as LogicalBackupSnapshot;
    const commands = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost: () => archiveFor(valid) },
      kdf, schema, candidateProbe,
      retainedReferences: { hasRetainedIdentity: async ({ table, values }) =>
        table === "plans" && values[0] === "bundled-plan" },
      store: createRestorePreflightStore({ tokenFactory: () => "retained-source-plan" }),
    });
    await expect(commands.preflightSecureRestore({ password: "owner-password" }))
      .resolves.toEqual(expect.objectContaining({ outcome: "ready" }));
  });

  it("rejects an unavailable retained identity and invokes the candidate invariant probe before issuing a token", async () => {
    const value = snapshot({ tables: {
      plan_day_exercises: [{ id: "occurrence", plan_day_id: "day", exercise_id: "missing-bundled", metric_profile: "load_reps", metric_contract_version: 1, exercise_metric_generation: 1 }],
      plan_days: [{ id: "day", plan_id: "plan" }],
      plans: [{ id: "plan", origin: "custom" }],
    } });
    const validateCandidate = jest.fn(async () => undefined);
    const commands = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost: () => archiveFor(value) },
      kdf, schema,
      candidateProbe: { validateCandidate },
      retainedReferences: { hasRetainedIdentity: async () => false },
      store: createRestorePreflightStore({ tokenFactory: () => "must-not-issue" }),
    });
    await expect(commands.preflightSecureRestore({ password: "owner-password" })).rejects.toEqual(expect.objectContaining({ code: "restore_archive_invalid" }));
    expect(validateCandidate).not.toHaveBeenCalled();
  });

  it("rejects a candidate probe invariant failure before issuing a token", async () => {
    const validateCandidate = jest.fn(async () => { throw new RestoreCandidateProbeError(); });
    const commands = createRestoreCommands({
      crypto: cryptoPort(), files: { readSelectedArchiveAtMost: () => archiveFor() },
      kdf, schema, candidateProbe: { validateCandidate },
      store: createRestorePreflightStore({ tokenFactory: () => "must-not-issue" }),
    });
    await expect(commands.preflightSecureRestore({ password: "owner-password" })).rejects.toEqual(expect.objectContaining({ code: "restore_archive_invalid" }));
    expect(validateCandidate).toHaveBeenCalledTimes(1);
  });
});

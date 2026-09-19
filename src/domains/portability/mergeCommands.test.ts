import {
  createHash,
} from "node:crypto";
import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  createBackupEnvelopeCodec,
  type BackupEnvelopeCryptoPort,
} from "./backupFormat";
import {
  logicalBackupTablesForVersion,
  type LogicalBackupSnapshot,
} from "./backupContracts";
import {
  createMergeCommands,
  createMergePreflightStore,
  MergeCommandError,
} from "./mergeCommands";
import {
  RestoreFilePortError,
} from "../../platform/files/expoBackupFilePort";

const text = new TextEncoder();

function snapshot(input: Readonly<{
  snapshotId: string;
  ownerNamespace?: string;
  version?: 1 | 2;
  portableId?: string;
  modifiedAtMs?: number;
}>): LogicalBackupSnapshot {
  const version = input.version ?? 2;
  const tables = Object.fromEntries(
    logicalBackupTablesForVersion(version).map((table) => [table, []]),
  ) as Record<string, unknown[]>;
  tables.workout_sessions = [{
    id: "archive-session",
    plan_id: null,
    plan_day_id: null,
    active_session_exercise_id: null,
    active_set_id: null,
    portable_id: input.portableId ?? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    merge_modified_at_ms: input.modifiedAtMs ?? 20,
  }];
  if (version === 2) {
    tables.portable_owner_identity = [{
      id: 1,
      owner_namespace: input.ownerNamespace ?? "11111111111111111111111111111111",
    }];
  }
  const rowCounts = Object.fromEntries(
    Object.entries(tables).map(([table, rows]) => [table, rows.length]),
  );
  return {
    version,
    snapshotId: input.snapshotId,
    createdAtMs: 1,
    schemaVersion: version === 1 ? 21 : 22,
    manifest: {
      catalogReferenceCount: 0,
      rowCounts,
      totalRows: Object.values(rowCounts).reduce((total, count) => total + count, 0),
    },
    tables,
    catalogReferences: [],
  } as LogicalBackupSnapshot;
}

function cryptoPort(): BackupEnvelopeCryptoPort {
  return {
    async deriveKey() { return { key: new Uint8Array(32).fill(7) }; },
    async encrypt(input) {
      return {
        ciphertext: input.plaintext.map((value) => value ^ 0xaa),
        tag: new Uint8Array(16).fill(input.aad.byteLength & 0xff),
      };
    },
    async decrypt(input) {
      if (!input.tag.every((value) => value === (input.aad.byteLength & 0xff))) {
        throw new Error("authentication failed");
      }
      return input.ciphertext.map((value) => value ^ 0xaa);
    },
  };
}

async function archiveFor(value: LogicalBackupSnapshot): Promise<Uint8Array> {
  return createBackupEnvelopeCodec(cryptoPort()).seal({
    snapshot: value,
    password: text.encode("owner-password"),
    salt: new Uint8Array(16).fill(1),
    nonce: new Uint8Array(12).fill(2),
  });
}

function schemaFor(snapshotValue: LogicalBackupSnapshot) {
  return {
    async columnsFor(table: string) {
      const row = snapshotValue.tables[table]?.[0] ?? { id: "unused" };
      return Object.entries(row).map(([name, value]) => ({
        name,
        sqliteType: typeof value === "number" ? "INTEGER" as const : "TEXT" as const,
        notNull: value !== null,
      }));
    },
  };
}

function sha256(value: string): Promise<string> {
  return Promise.resolve(createHash("sha256").update(value).digest("hex"));
}

function localFacts(input: Readonly<{
  ownerNamespace?: string;
  session?: Readonly<{ portableId: string; modifiedAtMs: number; marker: string }>;
}> = {}) {
  return {
    read: jest.fn(async () => ({
      ownerNamespace: input.ownerNamespace ?? "11111111111111111111111111111111",
      schemaVersion: 22,
      tables: {
        workout_sessions: input.session === undefined ? [] : [{
          id: "local-session",
          portable_id: input.session.portableId,
          merge_modified_at_ms: input.session.modifiedAtMs,
          marker: input.session.marker,
        }],
        session_exercises: [],
        session_sets: [],
      },
    })),
  };
}

describe("secure merge preflight", () => {
  it("authenticates a v1 archive before rejecting it as restore-clean only", async () => {
    const archive = await archiveFor(snapshot({ snapshotId: "legacy", version: 1 }));
    const local = localFacts();
    const commands = createMergeCommands({
      crypto: cryptoPort(),
      files: { readSelectedArchiveAtMost: async () => archive.slice() },
      kdf: { derive: async () => ({ algorithm: "argon2id", bytes: new Uint8Array(32), durationMs: 1, provider: "Bouncy Castle", providerVersion: "1.85.2" }) },
      schema: schemaFor(snapshot({ snapshotId: "legacy", version: 1 })),
      candidateProbe: { validateCandidate: async () => undefined },
      local,
      sha256,
      store: createMergePreflightStore({ tokenFactory: () => "unused" }),
    });

    await expect(commands.preflightSecureMerge({ password: "owner-password" }))
      .rejects.toEqual(new MergeCommandError("merge_archive_requires_v2"));
    expect(local.read).not.toHaveBeenCalled();
  });

  it("returns cancellation without decrypting or reading local SQLite", async () => {
    const local = localFacts();
    const commands = createMergeCommands({
      crypto: cryptoPort(),
      files: { readSelectedArchiveAtMost: async () => null },
      kdf: { derive: async () => { throw new Error("must not derive"); } },
      schema: schemaFor(snapshot({ snapshotId: "unused" })),
      candidateProbe: { validateCandidate: async () => undefined },
      local,
      sha256,
      store: createMergePreflightStore({ tokenFactory: () => "unused" }),
    });

    await expect(commands.preflightSecureMerge({ password: "owner-password" }))
      .resolves.toEqual({ outcome: "cancelled" });
    expect(local.read).not.toHaveBeenCalled();
  });

  it("returns a bounded read-only preview when a newer archive session wins", async () => {
    const archiveSnapshot = snapshot({ snapshotId: "archive-newer", modifiedAtMs: 30 });
    const archive = await archiveFor(archiveSnapshot);
    const local = localFacts({
      session: { portableId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", modifiedAtMs: 20, marker: "local" },
    });
    const store = createMergePreflightStore({ tokenFactory: () => "merge-token" });
    const commands = createMergeCommands({
      crypto: cryptoPort(),
      files: { readSelectedArchiveAtMost: async () => archive },
      kdf: { derive: async () => ({ algorithm: "argon2id", bytes: new Uint8Array(32), durationMs: 1, provider: "Bouncy Castle", providerVersion: "1.85.2" }) },
      schema: schemaFor(archiveSnapshot),
      candidateProbe: { validateCandidate: async () => undefined },
      local,
      sha256,
      store,
    });

    const result = await commands.preflightSecureMerge({ password: "owner-password" });
    expect(result).toEqual({
        outcome: "ready",
        token: "merge-token",
        preview: {
          mode: "merge",
          sourceFormatVersion: 2,
          inserted: 0,
          duplicates: 0,
          archiveWon: 1,
          localWon: 0,
          conflicts: 0,
        },
      });
    expect(JSON.stringify(result)).not.toContain("archive-session");
    expect(local.read).toHaveBeenCalledTimes(1);
  });

  it("uses the canonical aggregate digest for deterministic equal-timestamp resolution", async () => {
    const archiveSnapshot = snapshot({ snapshotId: "archive-tie", modifiedAtMs: 20 });
    const archive = await archiveFor(archiveSnapshot);
    const local = localFacts({
      session: { portableId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", modifiedAtMs: 20, marker: "local" },
    });
    const commands = createMergeCommands({
      crypto: cryptoPort(),
      files: { readSelectedArchiveAtMost: async () => archive },
      kdf: { derive: async () => ({ algorithm: "argon2id", bytes: new Uint8Array(32), durationMs: 1, provider: "Bouncy Castle", providerVersion: "1.85.2" }) },
      schema: schemaFor(archiveSnapshot),
      candidateProbe: { validateCandidate: async () => undefined },
      local,
      sha256: async (value) => value.includes("archive-session") ? "f".repeat(64) : "0".repeat(64),
      store: createMergePreflightStore({ tokenFactory: () => "tie-token" }),
    });

    await expect(commands.preflightSecureMerge({ password: "owner-password" }))
      .resolves.toEqual(expect.objectContaining({
        preview: expect.objectContaining({ archiveWon: 1, localWon: 0 }),
      }));
  });

  it("rejects an owner-namespace mismatch without exposing the archive or local rows", async () => {
    const archiveSnapshot = snapshot({ snapshotId: "other-owner", ownerNamespace: "22222222222222222222222222222222" });
    const archive = await archiveFor(archiveSnapshot);
    const commands = createMergeCommands({
      crypto: cryptoPort(),
      files: { readSelectedArchiveAtMost: async () => archive },
      kdf: { derive: async () => ({ algorithm: "argon2id", bytes: new Uint8Array(32), durationMs: 1, provider: "Bouncy Castle", providerVersion: "1.85.2" }) },
      schema: schemaFor(archiveSnapshot),
      candidateProbe: { validateCandidate: async () => undefined },
      local: localFacts(),
      sha256,
      store: createMergePreflightStore({ tokenFactory: () => "unused" }),
    });

    await expect(commands.preflightSecureMerge({ password: "owner-password" }))
      .rejects.toEqual(new MergeCommandError("merge_owner_namespace_conflict"));
  });

  it("binds the one-time token to both archive bytes and a deterministic local fingerprint", async () => {
    const archiveSnapshot = snapshot({ snapshotId: "fingerprint" });
    const archive = await archiveFor(archiveSnapshot);
    const local = localFacts();
    const store = createMergePreflightStore({ tokenFactory: () => "single-use" });
    const commands = createMergeCommands({
      crypto: cryptoPort(),
      files: { readSelectedArchiveAtMost: async () => archive },
      kdf: { derive: async () => ({ algorithm: "argon2id", bytes: new Uint8Array(32), durationMs: 1, provider: "Bouncy Castle", providerVersion: "1.85.2" }) },
      schema: schemaFor(archiveSnapshot),
      candidateProbe: { validateCandidate: async () => undefined },
      local,
      sha256,
      store,
    });

    const result = await commands.preflightSecureMerge({ password: "owner-password" });
    expect(result).toEqual(expect.objectContaining({ outcome: "ready", token: "single-use" }));
    const stored = store.consume("single-use");
    expect(stored).toEqual(expect.objectContaining({
      archiveDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      localFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
    }));
    expect(store.consume("single-use")).toBeNull();
  });

  it("maps an authenticated malformed candidate to a safe merge error without reading local facts", async () => {
    const archiveSnapshot = snapshot({ snapshotId: "bad-candidate" });
    const archive = await archiveFor(archiveSnapshot);
    const local = localFacts();
    const commands = createMergeCommands({
      crypto: cryptoPort(),
      files: { readSelectedArchiveAtMost: async () => archive },
      kdf: { derive: async () => ({ algorithm: "argon2id", bytes: new Uint8Array(32), durationMs: 1, provider: "Bouncy Castle", providerVersion: "1.85.2" }) },
      schema: schemaFor(archiveSnapshot),
      candidateProbe: { validateCandidate: async () => { throw new Error("invalid candidate"); } },
      local,
      sha256,
      store: createMergePreflightStore({ tokenFactory: () => "unused" }),
    });

    await expect(commands.preflightSecureMerge({ password: "owner-password" }))
      .rejects.toEqual(new MergeCommandError("merge_archive_unavailable"));
    expect(local.read).not.toHaveBeenCalled();
  });

  it.each([
    ["empty password", async () => new Uint8Array([1]), "", "merge_input_invalid"],
    ["empty archive", async () => new Uint8Array(), "owner-password", "merge_archive_invalid"],
    ["oversize picker result", async () => new Uint8Array((32 * 1024 * 1024) + 1), "owner-password", "merge_archive_limit_exceeded"],
  ] as const)("maps %s without local reads", async (...parameters) => {
    const [_label, readArchive, password, code] = parameters;
    const local = localFacts();
    const commands = createMergeCommands({
      crypto: cryptoPort(),
      files: { readSelectedArchiveAtMost: readArchive },
      kdf: { derive: async () => ({ algorithm: "argon2id", bytes: new Uint8Array(32), durationMs: 1, provider: "Bouncy Castle", providerVersion: "1.85.2" }) },
      schema: schemaFor(snapshot({ snapshotId: "error" })),
      candidateProbe: { validateCandidate: async () => undefined },
      local,
      sha256,
      store: createMergePreflightStore({ tokenFactory: () => "unused" }),
    });
    await expect(commands.preflightSecureMerge({ password }))
      .rejects.toEqual(new MergeCommandError(code));
    expect(local.read).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid namespace", { read: async () => ({ ownerNamespace: "bad", schemaVersion: 22, tables: {} }) }],
    ["pre-identity schema", { read: async () => ({
      ownerNamespace: "11111111111111111111111111111111",
      schemaVersion: 21,
      tables: {},
    }) }],
    ["duplicate portable identity", { read: async () => ({
      ownerNamespace: "11111111111111111111111111111111",
      schemaVersion: 22,
      tables: { workout_sessions: [
        { portable_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", merge_modified_at_ms: 1 },
        { portable_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", merge_modified_at_ms: 2 },
      ] },
    }) }],
  ] as const)("rejects local %s without a writer", async (...parameters) => {
    const [_label, local] = parameters;
    const archiveSnapshot = snapshot({ snapshotId: "bad-local" });
    const archive = await archiveFor(archiveSnapshot);
    const commands = createMergeCommands({
      crypto: cryptoPort(),
      files: { readSelectedArchiveAtMost: async () => archive },
      kdf: { derive: async () => ({ algorithm: "argon2id", bytes: new Uint8Array(32), durationMs: 1, provider: "Bouncy Castle", providerVersion: "1.85.2" }) },
      schema: schemaFor(archiveSnapshot),
      candidateProbe: { validateCandidate: async () => undefined },
      local,
      sha256,
      store: createMergePreflightStore({ tokenFactory: () => "unused" }),
    });
    await expect(commands.preflightSecureMerge({ password: "owner-password" }))
      .rejects.toEqual(new MergeCommandError("merge_local_state_invalid"));
  });

  it("maps picker and authentication failures to bounded merge errors", async () => {
    const local = localFacts();
    const archiveSnapshot = snapshot({ snapshotId: "auth" });
    const archive = await archiveFor(archiveSnapshot);
    const cases = [
      { read: async () => { throw new RestoreFilePortError("limit_exceeded"); }, code: "merge_archive_limit_exceeded" },
      { read: async () => archive.map((value, index) => index === archive.byteLength - 1 ? value ^ 1 : value), code: "merge_archive_unavailable" },
    ] as const;
    for (const item of cases) {
      const commands = createMergeCommands({
        crypto: cryptoPort(),
        files: { readSelectedArchiveAtMost: item.read },
        kdf: { derive: async () => ({ algorithm: "argon2id", bytes: new Uint8Array(32), durationMs: 1, provider: "Bouncy Castle", providerVersion: "1.85.2" }) },
        schema: schemaFor(archiveSnapshot),
        candidateProbe: { validateCandidate: async () => undefined },
        local,
        sha256,
        store: createMergePreflightStore({ tokenFactory: () => "unused" }),
      });
      await expect(commands.preflightSecureMerge({ password: "owner-password" }))
        .rejects.toEqual(new MergeCommandError(item.code));
    }
  });

  it("rejects an archive with more than one session after authentication", async () => {
    const archiveSnapshot = snapshot({ snapshotId: "two-sessions" });
    const twoSessions = {
      ...archiveSnapshot,
      tables: {
        ...archiveSnapshot.tables,
        workout_sessions: [
          ...archiveSnapshot.tables.workout_sessions!,
          {
            id: "second-session",
            plan_id: null,
            plan_day_id: null,
            active_session_exercise_id: null,
            active_set_id: null,
            portable_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            merge_modified_at_ms: 21,
          },
        ],
      },
      manifest: {
        ...archiveSnapshot.manifest,
        rowCounts: { ...archiveSnapshot.manifest.rowCounts, workout_sessions: 2 },
        totalRows: archiveSnapshot.manifest.totalRows + 1,
      },
    } as LogicalBackupSnapshot;
    const archive = await archiveFor(twoSessions);
    const commands = createMergeCommands({
      crypto: cryptoPort(),
      files: { readSelectedArchiveAtMost: async () => archive },
      kdf: { derive: async () => ({ algorithm: "argon2id", bytes: new Uint8Array(32), durationMs: 1, provider: "Bouncy Castle", providerVersion: "1.85.2" }) },
      schema: schemaFor(twoSessions),
      candidateProbe: { validateCandidate: async () => undefined },
      local: localFacts(),
      sha256,
      store: createMergePreflightStore({ tokenFactory: () => "unused" }),
    });
    await expect(commands.preflightSecureMerge({ password: "owner-password" }))
      .rejects.toEqual(new MergeCommandError("merge_archive_invalid"));
  });

  it("maps invalid preflight store and invalid digest output to safe merge errors", async () => {
    const archiveSnapshot = snapshot({ snapshotId: "store-and-digest" });
    const archive = await archiveFor(archiveSnapshot);
    const dependencies = {
      crypto: cryptoPort(),
      files: { readSelectedArchiveAtMost: async () => archive.slice() },
      kdf: { derive: async () => ({ algorithm: "argon2id" as const, bytes: new Uint8Array(32), durationMs: 1, provider: "Bouncy Castle" as const, providerVersion: "1.85.2" as const }) },
      schema: schemaFor(archiveSnapshot),
      candidateProbe: { validateCandidate: async () => undefined },
      local: localFacts(),
    };
    await expect(createMergeCommands({
      ...dependencies,
      sha256: async () => "not-a-digest",
      store: createMergePreflightStore({ tokenFactory: () => "unused" }),
    }).preflightSecureMerge({ password: "owner-password" }))
      .rejects.toEqual(new MergeCommandError("merge_local_state_invalid"));
    await expect(createMergeCommands({
      ...dependencies,
      files: { readSelectedArchiveAtMost: async () => archive.slice() },
      sha256,
      store: createMergePreflightStore({ tokenFactory: () => " " }),
    }).preflightSecureMerge({ password: "owner-password" }))
      .rejects.toEqual(new MergeCommandError("merge_preflight_token_invalid"));
  });

  it("invalidates an active merge token only when its matching owner requests it", async () => {
    const archiveSnapshot = snapshot({ snapshotId: "invalidate" });
    const archive = await archiveFor(archiveSnapshot);
    const store = createMergePreflightStore({ tokenFactory: () => "active" });
    const commands = createMergeCommands({
      crypto: cryptoPort(),
      files: { readSelectedArchiveAtMost: async () => archive },
      kdf: { derive: async () => ({ algorithm: "argon2id", bytes: new Uint8Array(32), durationMs: 1, provider: "Bouncy Castle", providerVersion: "1.85.2" }) },
      schema: schemaFor(archiveSnapshot),
      candidateProbe: { validateCandidate: async () => undefined },
      local: localFacts(),
      sha256,
      store,
    });
    await commands.preflightSecureMerge({ password: "owner-password" });
    commands.invalidateSecureMergePreflight("other");
    expect(store.consume("active")).toEqual(expect.objectContaining({ operation: expect.any(Object) }));
  });
});

import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  LOGICAL_BACKUP_FORMAT_VERSION,
  LOGICAL_BACKUP_TABLES,
  parseLogicalBackupSnapshot,
  type LogicalBackupSnapshot,
} from "./backupContracts";
import {
  BackupCommandError,
  createBackupCommands,
} from "./backupCommands";
import type {
  AesGcmArchivePort,
} from "../../platform/crypto/aesGcmArchivePort";
import type {
  PasswordKdfPort,
} from "../../platform/crypto/passwordKdf";
import type {
  BackupArchiveFilePort,
} from "../../platform/files/expoBackupFilePort";

function snapshot(): LogicalBackupSnapshot {
  const tables = Object.fromEntries(
    LOGICAL_BACKUP_TABLES.map((table) => [table, []]),
  );
  return parseLogicalBackupSnapshot({
    version: LOGICAL_BACKUP_FORMAT_VERSION,
    snapshotId: "snapshot",
    createdAtMs: 1,
    schemaVersion: 15,
    manifest: {
      catalogReferenceCount: 0,
      rowCounts: Object.fromEntries(LOGICAL_BACKUP_TABLES.map((table) => [table, 0])),
      totalRows: 0,
    },
    tables,
    catalogReferences: [],
  });
}

type Fixture = Readonly<{
  commands: ReturnType<typeof createBackupCommands>;
  archiveBuffers: Uint8Array[];
  entropy: Uint8Array[];
  sharedArchives: Array<Readonly<{ archiveId: string }>>;
  discardedArchives: Array<Readonly<{ archiveId: string }>>;
  setWriteArchive(writeArchive: BackupArchiveFilePort["writeArchive"]): void;
}>;

function fixture(overrides: Readonly<{
  encrypt?: AesGcmArchivePort["encrypt"];
  writeArchive?: BackupArchiveFilePort["writeArchive"];
  shareArchive?: BackupArchiveFilePort["shareArchive"];
  deleteArchive?: BackupArchiveFilePort["deleteArchive"];
}> = {}): Fixture {
  const archiveBuffers: Uint8Array[] = [];
  const entropy: Uint8Array[] = [];
  const sharedArchives: Array<Readonly<{ archiveId: string }>> = [];
  const discardedArchives: Array<Readonly<{ archiveId: string }>> = [];
  const derive: PasswordKdfPort["derive"] = async () => ({
    bytes: new Uint8Array(32).fill(7),
    durationMs: 1,
    algorithm: "argon2id",
    provider: "Bouncy Castle",
    providerVersion: "1.85.2",
  });
  const kdf: PasswordKdfPort = {
    derive,
  };
  const defaultEncrypt: AesGcmArchivePort["encrypt"] = async ({ plaintext }) => ({
    ciphertext: plaintext.slice(),
    tag: new Uint8Array(16).fill(9),
  });
  const crypto: AesGcmArchivePort = {
    encrypt: overrides.encrypt ?? defaultEncrypt,
    decrypt: async () => new Uint8Array(),
  };
  let writeArchive: BackupArchiveFilePort["writeArchive"] = overrides.writeArchive
    ?? (async ({ archiveId, archive }) => {
      archiveBuffers.push(archive);
      return { archiveId };
    });
  const shareArchive: BackupArchiveFilePort["shareArchive"] = overrides.shareArchive
    ?? (async (archive) => {
      sharedArchives.push(archive);
    });
  const deleteArchive: BackupArchiveFilePort["deleteArchive"] = overrides.deleteArchive
    ?? (async (archive) => {
      discardedArchives.push(archive);
    });
  const files: BackupArchiveFilePort = {
    async writeArchive(input) {
      return writeArchive(input);
    },
    shareArchive,
    deleteArchive,
  };
  const commands = createBackupCommands({
    collector: { collect: async () => snapshot() },
    crypto,
    files,
    kdf,
    nowMs: () => 2,
    randomBytes(length) {
      const bytes = new Uint8Array(length).fill(length);
      entropy.push(bytes);
      return bytes;
    },
    snapshotId: () => "backup-id",
  });
  return {
    commands,
    archiveBuffers,
    entropy,
    sharedArchives,
    discardedArchives,
    setWriteArchive(handler) {
      writeArchive = handler;
    },
  };
}

describe("secure backup commands", () => {
  it("creates an encrypted archive, wipes owned buffers, and waits for explicit sharing", async () => {
    const subject = fixture();

    const archive = await subject.commands.createSecureBackup({
      password: "correct horse battery staple",
    });

    expect(archive).toEqual({ archiveId: "snapshot" });
    expect(subject.sharedArchives).toEqual([]);
    expect(subject.archiveBuffers).toHaveLength(1);
    expect([...subject.archiveBuffers[0]!.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    expect(subject.entropy.every((bytes) => bytes.every((value) => value === 0))).toBe(true);

    await subject.commands.shareSecureBackup(archive);
    expect(subject.sharedArchives).toEqual([archive]);
    expect(subject.discardedArchives).toEqual([archive]);
  });

  it("discards an unshared completed archive through its opaque handle", async () => {
    const subject = fixture();
    const archive = await subject.commands.createSecureBackup({
      password: "correct horse battery staple",
    });

    await subject.commands.discardSecureBackup(archive);

    expect(subject.sharedArchives).toEqual([]);
    expect(subject.discardedArchives).toEqual([archive]);
  });

  it("maps an unshared archive cleanup failure to the bounded backup error", async () => {
    const subject = fixture({
      deleteArchive: async () => {
        throw new Error("private cache path");
      },
    });
    const archive = await subject.commands.createSecureBackup({
      password: "correct horse battery staple",
    });

    await expect(subject.commands.discardSecureBackup(archive)).rejects.toEqual(
      expect.objectContaining({
        code: "backup_export_failed",
        correlationCode: "GT-BACKUP04",
      }),
    );
    expect(subject.sharedArchives).toEqual([]);
  });

  it("does not create or share a file when encryption fails and exposes only a safe error", async () => {
    const subject = fixture({
      encrypt: async () => {
        throw new Error("native crypto details");
      },
    });

    await expect(subject.commands.createSecureBackup({
      password: "correct horse battery staple",
    })).rejects.toEqual(expect.objectContaining({
      code: "backup_export_failed",
      correlationCode: "GT-BACKUP04",
    }));

    expect(subject.archiveBuffers).toEqual([]);
    expect(subject.sharedArchives).toEqual([]);
  });

  it("deletes a completed cache archive after share failure or cancellation", async () => {
    const shareFailure = fixture({
      shareArchive: async () => {
        throw new Error("share cancelled");
      },
    });
    const archive = await shareFailure.commands.createSecureBackup({
      password: "correct horse battery staple",
    });

    await expect(shareFailure.commands.shareSecureBackup(archive)).rejects.toBeInstanceOf(
      BackupCommandError,
    );
    expect(shareFailure.discardedArchives).toEqual([archive]);

    const cancellation = fixture();
    const controller = new AbortController();
    cancellation.setWriteArchive(async ({ archiveId, archive }: {
      archiveId: string;
      archive: Uint8Array;
    }) => {
      cancellation.archiveBuffers.push(archive);
      controller.abort();
      return { archiveId };
    });

    await expect(cancellation.commands.createSecureBackup({
      password: "correct horse battery staple",
      signal: controller.signal,
    })).rejects.toEqual(expect.objectContaining({
      code: "backup_export_cancelled",
    }));
    expect(cancellation.discardedArchives).toEqual([{ archiveId: "snapshot" }]);
  });

  it("rejects invalid input and entropy, and preserves safe cancellation errors", async () => {
    const invalid = fixture();
    await expect(invalid.commands.createSecureBackup({ password: "" })).rejects
      .toEqual(expect.objectContaining({ code: "backup_export_input_invalid" }));
    await expect(invalid.commands.createSecureBackup({ password: "x".repeat(1_025) })).rejects
      .toEqual(expect.objectContaining({ code: "backup_export_input_invalid" }));

    const controller = new AbortController();
    controller.abort();
    await expect(invalid.commands.createSecureBackup({
      password: "password",
      signal: controller.signal,
    })).rejects.toEqual(expect.objectContaining({ code: "backup_export_cancelled" }));

    const invalidEntropy = createBackupCommands({
      collector: { collect: async () => snapshot() },
      crypto: { encrypt: async () => ({ ciphertext: new Uint8Array(), tag: new Uint8Array(16) }), decrypt: async () => new Uint8Array() },
      files: { writeArchive: async ({ archiveId }) => ({ archiveId }), shareArchive: async () => undefined, deleteArchive: async () => undefined },
      kdf: { derive: async () => ({ bytes: new Uint8Array(32), durationMs: 1, algorithm: "argon2id", provider: "Bouncy Castle", providerVersion: "1.85.2" }) },
      nowMs: () => 1,
      randomBytes: () => new Uint8Array(1),
      snapshotId: () => "snapshot",
    });
    await expect(invalidEntropy.createSecureBackup({ password: "password" })).rejects
      .toEqual(expect.objectContaining({ code: "backup_export_failed" }));
  });

  it("reports cleanup and typed share errors without retaining an archive", async () => {
    const archive = await fixture().commands.createSecureBackup({ password: "password" });

    const typedShareFailure = createBackupCommands({
      collector: { collect: async () => snapshot() },
      crypto: { encrypt: async ({ plaintext }) => ({ ciphertext: plaintext.slice(), tag: new Uint8Array(16) }), decrypt: async () => new Uint8Array() },
      files: {
        writeArchive: async ({ archiveId }) => ({ archiveId }),
        shareArchive: async () => { throw new BackupCommandError("backup_sharing_failed"); },
        deleteArchive: async () => undefined,
      },
      kdf: { derive: async () => ({ bytes: new Uint8Array(32), durationMs: 1, algorithm: "argon2id", provider: "Bouncy Castle", providerVersion: "1.85.2" }) },
      nowMs: () => 1,
      randomBytes: (length) => new Uint8Array(length),
      snapshotId: () => "snapshot",
    });
    await expect(typedShareFailure.shareSecureBackup(archive)).rejects.toEqual(
      expect.objectContaining({ code: "backup_sharing_failed" }),
    );

    const createCleanupFailure = fixture({
      deleteArchive: async () => {
        throw new Error("delete failed");
      },
    });
    const controller = new AbortController();
    createCleanupFailure.setWriteArchive(async ({ archiveId }) => {
      controller.abort();
      return { archiveId };
    });
    await expect(createCleanupFailure.commands.createSecureBackup({
      password: "password",
      signal: controller.signal,
    })).rejects.toEqual(expect.objectContaining({
      code: "backup_export_failed",
    }));

    const shareCleanupFailure = fixture({
      deleteArchive: async () => {
        throw new Error("delete failed");
      },
    });
    const shareArchive = await shareCleanupFailure.commands.createSecureBackup({
      password: "password",
    });
    await expect(shareCleanupFailure.commands.shareSecureBackup(shareArchive)).rejects
      .toEqual(expect.objectContaining({ code: "backup_export_failed" }));
  });
});

import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  createBackupEnvelopeCodec,
  type BackupEnvelopeCryptoPort,
  BackupFormatError,
} from "./backupFormat";
import {
  BACKUP_LIMITS,
  type LogicalBackupSnapshot,
} from "./backupContracts";

const text = new TextEncoder();
const decoder = new TextDecoder();

const snapshot: LogicalBackupSnapshot = {
  version: 1,
  snapshotId: "backup_01J5AV2QAXM8QQYWD0S8Y4A001",
  createdAtMs: 1_786_853_900_000,
  schemaVersion: 15,
  manifest: {
    catalogReferenceCount: 0,
    rowCounts: { app_settings: 1 },
    totalRows: 1,
  },
  tables: {
    app_settings: [{
      key: "theme",
      value_version: 1,
      value_json: "{\"mode\":\"dark\"}",
      revision: 1,
      updated_at_ms: 1_786_853_900_000,
    }],
  },
  catalogReferences: [],
};

function cryptoPort(): BackupEnvelopeCryptoPort {
  return {
    async deriveKey(input) {
      return {
        key: Uint8Array.from(
          { length: 32 },
          (_value, index) => (input.password.byteLength + (input.salt[0] ?? 0) + index) & 0xff,
        ),
      };
    },
    async encrypt(input) {
      const ciphertext = input.plaintext.map((byte) => byte ^ 0xaa);
      return { ciphertext, tag: authenticationTag(input.aad, ciphertext) };
    },
    async decrypt(input) {
      const expectedTag = authenticationTag(input.aad, input.ciphertext);
      if (!input.tag.every((byte, index) => byte === expectedTag[index])) {
        throw new Error("authentication failed");
      }
      return input.ciphertext.map((byte) => byte ^ 0xaa);
    },
  };
}

const password = text.encode("owner-password");
const salt = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
const nonce = Uint8Array.from({ length: 12 }, (_, index) => index + 2);

function authenticationTag(aad: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const tag = new Uint8Array(16);
  const bytes = new Uint8Array(aad.byteLength + ciphertext.byteLength);
  bytes.set(aad);
  bytes.set(ciphertext, aad.byteLength);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    const tagIndex = index % tag.byteLength;
    tag[tagIndex] = ((tag[tagIndex] ?? 0) + (bytes[index] ?? 0) + index) & 0xff;
  }
  return tag;
}

function archiveWithHeader(archive: Uint8Array, header: unknown): Uint8Array {
  const originalHeaderLength = new DataView(archive.buffer, archive.byteOffset, archive.byteLength).getUint32(5);
  const headerBytes = text.encode(JSON.stringify(header));
  const body = archive.slice(9 + originalHeaderLength);
  const replacement = new Uint8Array(9 + headerBytes.byteLength + body.byteLength);
  replacement.set(archive.slice(0, 5));
  new DataView(replacement.buffer).setUint32(5, headerBytes.byteLength);
  replacement.set(headerBytes, 9);
  replacement.set(body, 9 + headerBytes.byteLength);
  return replacement;
}

function headerFrom(archive: Uint8Array): Record<string, unknown> {
  const headerLength = new DataView(archive.buffer, archive.byteOffset, archive.byteLength).getUint32(5);
  return JSON.parse(decoder.decode(archive.slice(9, 9 + headerLength))) as Record<string, unknown>;
}

function archiveWithPayload(archive: Uint8Array, payload: Uint8Array): Uint8Array {
  const headerLength = new DataView(archive.buffer, archive.byteOffset, archive.byteLength).getUint32(5);
  const prefix = archive.slice(0, 9 + headerLength);
  const tag = archive.slice(archive.byteLength - 16);
  const replacement = new Uint8Array(prefix.byteLength + payload.byteLength + tag.byteLength);
  replacement.set(prefix);
  replacement.set(payload, prefix.byteLength);
  replacement.set(tag, prefix.byteLength + payload.byteLength);
  return replacement;
}

describe("GTBK v1 backup envelope", () => {
  it("emits deterministic canonical header bytes that are authenticated as AAD", async () => {
    const codec = createBackupEnvelopeCodec(cryptoPort());

    const first = await codec.seal({ snapshot, password, salt, nonce });
    const second = await codec.seal({ snapshot, password, salt, nonce });

    expect(first).toEqual(second);
    expect(decoder.decode(first.slice(0, 4))).toBe("GTBK");
    await expect(codec.open({ archive: first, password })).resolves.toEqual(snapshot);
  });

  it("does not require a Node Buffer global to encode or parse archive metadata", async () => {
    const runtime = globalThis as Record<string, unknown>;
    const originalBuffer = runtime.Buffer;
    runtime.Buffer = undefined;
    try {
      const codec = createBackupEnvelopeCodec(cryptoPort());
      const archive = await codec.seal({ snapshot, password, salt, nonce });

      await expect(codec.open({ archive, password })).resolves.toEqual(snapshot);
    } finally {
      runtime.Buffer = originalBuffer;
    }
  });

  it.each([
    ["the magic", (archive: Uint8Array) => { archive[0] = (archive[0] ?? 0) ^ 1; }],
    ["the format version", (archive: Uint8Array) => { archive[4] = 2; }],
    ["one canonical header byte", (archive: Uint8Array) => { archive[9] = (archive[9] ?? 0) ^ 1; }],
    ["one ciphertext byte", (archive: Uint8Array) => { const index = archive.length - 17; archive[index] = (archive[index] ?? 0) ^ 1; }],
    ["the authentication tag", (archive: Uint8Array) => { const index = archive.length - 1; archive[index] = (archive[index] ?? 0) ^ 1; }],
  ])("rejects a mutation to %s before returning a snapshot", async (_label, mutate) => {
    const codec = createBackupEnvelopeCodec(cryptoPort());
    const archive = await codec.seal({ snapshot, password, salt, nonce });
    mutate(archive);

    await expect(codec.open({ archive, password })).rejects.toEqual(
      expect.objectContaining({
        code: expect.stringMatching(/backup_(archive|authentication)_/),
      }),
    );
  });

  it("rejects noncanonical or unknown header fields before KDF work", async () => {
    const derived: number[] = [];
    const port = cryptoPort();
    const codec = createBackupEnvelopeCodec({
      ...port,
      async deriveKey(input) {
        derived.push(input.password.byteLength);
        return port.deriveKey(input);
      },
    });
    const archive = await codec.seal({ snapshot, password, salt, nonce });
    const headerLength = new DataView(archive.buffer, archive.byteOffset, archive.byteLength).getUint32(5);
    const headerStart = 9;
    const header = JSON.parse(decoder.decode(archive.slice(headerStart, headerStart + headerLength)));
    header.extra = "not allowed";
    const altered = archiveWithHeader(archive, header);
    derived.length = 0;

    await expect(codec.open({ archive: altered, password })).rejects.toEqual(
      expect.objectContaining({ code: "backup_archive_invalid" }),
    );
    expect(derived).toEqual([]);
  });

  it("wipes caller-owned temporary password/key/plaintext copies on every path", async () => {
    const observed: Uint8Array[] = [];
    const port = cryptoPort();
    const codec = createBackupEnvelopeCodec({
      ...port,
      async deriveKey(input) {
        observed.push(input.password, input.salt);
        return { key: new Uint8Array(32).fill(3) };
      },
      async encrypt(input) {
        observed.push(input.key, input.plaintext, input.aad);
        throw new Error("storage failure");
      },
    });

    await expect(codec.seal({ snapshot, password, salt, nonce })).rejects.toBeInstanceOf(
      BackupFormatError,
    );
    expect(observed.every((value) => value.every((byte) => byte === 0))).toBe(true);
    expect(password.some((byte) => byte !== 0)).toBe(true);
  });

  it.each([
    ["a too-short archive", Uint8Array.from([0x47, 0x54, 0x42, 0x4b])],
    ["an impossible header length", (() => {
      const archive = new Uint8Array(25);
      archive.set([0x47, 0x54, 0x42, 0x4b, 1]);
      new DataView(archive.buffer).setUint32(5, 17);
      return archive;
    })()],
    ["invalid UTF-8 header bytes", (() => {
      const archive = new Uint8Array(26);
      archive.set([0x47, 0x54, 0x42, 0x4b, 1]);
      new DataView(archive.buffer).setUint32(5, 1);
      archive[9] = 0xff;
      return archive;
    })()],
  ])("rejects %s before key derivation", async (_label, archive) => {
    const deriveKey = jest.fn(cryptoPort().deriveKey);
    const codec = createBackupEnvelopeCodec({ ...cryptoPort(), deriveKey });

    await expect(codec.open({ archive, password })).rejects.toEqual(
      expect.objectContaining({ code: "backup_archive_invalid" }),
    );
    expect(deriveKey).not.toHaveBeenCalled();
  });

  it.each([
    ["an archive beyond the maximum byte limit", () => {
      const archive = new Uint8Array((32 * 1024 * 1024) + 1);
      archive.set([0x47, 0x54, 0x42, 0x4b, 1]);
      return archive;
    }, "backup_archive_limit_exceeded"],
    ["a header beyond the maximum byte limit", () => {
      const archive = new Uint8Array(9 + (16 * 1024) + 1 + 16);
      archive.set([0x47, 0x54, 0x42, 0x4b, 1]);
      new DataView(archive.buffer).setUint32(5, (16 * 1024) + 1);
      return archive;
    }, "backup_archive_invalid"],
  ])("rejects %s without decrypting it", async (_label, makeArchive, code) => {
    const decrypt = jest.fn(cryptoPort().decrypt);
    const codec = createBackupEnvelopeCodec({ ...cryptoPort(), decrypt });

    await expect(codec.open({ archive: makeArchive(), password })).rejects.toEqual(
      expect.objectContaining({ code }),
    );
    expect(decrypt).not.toHaveBeenCalled();
  });

  it.each([
    ["a wrong compression setting", (header: Record<string, unknown>) => { header.compression = "gzip"; }],
    ["a mismatched cipher descriptor", (header: Record<string, unknown>) => {
      header.cipher = { algorithm: "aes-128-gcm", tagBytes: 16 };
    }],
    ["a wrong KDF parameter", (header: Record<string, unknown>) => {
      header.kdf = { ...(header.kdf as Record<string, unknown>), iterations: 1 };
    }],
    ["malformed base64 salt padding", (header: Record<string, unknown>) => {
      header.kdf = { ...(header.kdf as Record<string, unknown>), salt: "AA=A" };
    }],
    ["a short nonce", (header: Record<string, unknown>) => { header.nonce = "AA=="; }],
    ["a negative payload size", (header: Record<string, unknown>) => { header.payloadBytes = -1; }],
    ["an unsupported header version", (header: Record<string, unknown>) => { header.version = 2; }],
  ])("rejects %s before key derivation", async (_label, mutateHeader) => {
    const archive = await createBackupEnvelopeCodec(cryptoPort()).seal({ snapshot, password, salt, nonce });
    const header = headerFrom(archive);
    mutateHeader(header);
    const deriveKey = jest.fn(cryptoPort().deriveKey);
    const codec = createBackupEnvelopeCodec({ ...cryptoPort(), deriveKey });

    await expect(codec.open({ archive: archiveWithHeader(archive, header), password })).rejects.toEqual(
      expect.objectContaining({
        code: header.version === 2
          ? "backup_archive_unsupported_version"
          : "backup_archive_invalid",
      }),
    );
    expect(deriveKey).not.toHaveBeenCalled();
  });

  it("rejects a snapshot identifier that does not match authenticated header metadata", async () => {
    const port = cryptoPort();
    const archive = await createBackupEnvelopeCodec(port).seal({ snapshot, password, salt, nonce });
    const header = headerFrom(archive);
    header.snapshotId = "backup_other";
    const altered = archiveWithHeader(archive, header);
    const headerLength = new DataView(altered.buffer, altered.byteOffset, altered.byteLength).getUint32(5);
    const prefix = altered.slice(0, 9 + headerLength);
    const ciphertextStart = 9 + headerLength;
    const ciphertextEnd = altered.byteLength - 16;
    const ciphertext = altered.slice(ciphertextStart, ciphertextEnd);
    const tag = authenticationTag(prefix, ciphertext);
    altered.set(tag, ciphertextEnd);

    await expect(createBackupEnvelopeCodec(port).open({ archive: altered, password })).rejects.toEqual(
      expect.objectContaining({ code: "backup_archive_invalid" }),
    );
  });

  it.each([
    ["a malformed decrypted payload", text.encode("not-json"), "backup_archive_invalid"],
    ["a declared payload length mismatch", text.encode(JSON.stringify({ ...snapshot, snapshotId: snapshot.snapshotId })), "backup_archive_limit_exceeded"],
  ])("rejects %s after authentication and before returning state", async (_label, plaintext, code) => {
    const port = cryptoPort();
    const sourceArchive = await createBackupEnvelopeCodec(port).seal({ snapshot, password, salt, nonce });
    const header = headerFrom(sourceArchive);
    header.payloadBytes = plaintext.byteLength;
    const prefixArchive = archiveWithHeader(sourceArchive, header);
    const headerLength = new DataView(prefixArchive.buffer, prefixArchive.byteOffset, prefixArchive.byteLength).getUint32(5);
    const aad = prefixArchive.slice(0, 9 + headerLength);
    const ciphertext = plaintext.map((byte) => byte ^ 0xaa);
    const tag = authenticationTag(aad, ciphertext);
    const archive = archiveWithPayload(prefixArchive, ciphertext);
    archive.set(tag, archive.byteLength - 16);
    if (code === "backup_archive_limit_exceeded") {
      const mismatched = headerFrom(archive);
      mismatched.payloadBytes = plaintext.byteLength + 1;
      const mismatchArchive = archiveWithHeader(archive, mismatched);
      const mismatchHeaderLength = new DataView(mismatchArchive.buffer, mismatchArchive.byteOffset, mismatchArchive.byteLength).getUint32(5);
      const mismatchAad = mismatchArchive.slice(0, 9 + mismatchHeaderLength);
      const mismatchCiphertext = mismatchArchive.slice(mismatchHeaderLength + 9, mismatchArchive.byteLength - 16);
      mismatchArchive.set(authenticationTag(mismatchAad, mismatchCiphertext), mismatchArchive.byteLength - 16);
      await expect(createBackupEnvelopeCodec(port).open({ archive: mismatchArchive, password })).rejects.toEqual(
        expect.objectContaining({ code }),
      );
      return;
    }
    await expect(createBackupEnvelopeCodec(port).open({ archive, password })).rejects.toEqual(
      expect.objectContaining({ code }),
    );
  });

  it("maps invalid crypto results and wipes owned open-path buffers", async () => {
    const observed: Uint8Array[] = [];
    const port = cryptoPort();
    const archive = await createBackupEnvelopeCodec(port).seal({ snapshot, password, salt, nonce });
    const codec = createBackupEnvelopeCodec({
      ...port,
      async deriveKey(input) {
        observed.push(input.password, input.salt);
        return { key: new Uint8Array(31) };
      },
    });

    await expect(codec.open({ archive, password })).rejects.toEqual(
      expect.objectContaining({ code: "backup_authentication_failed" }),
    );
    expect(observed.every((value) => value.every((byte) => byte === 0))).toBe(true);
    expect(password.some((byte) => byte !== 0)).toBe(true);
  });

  it.each([
    ["invalid salt length", { salt: salt.slice(1), nonce }, "backup_archive_invalid"],
    ["invalid nonce length", { salt, nonce: nonce.slice(1) }, "backup_archive_invalid"],
  ])("rejects seal input with %s before deriving a key", async (_label, input, code) => {
    const deriveKey = jest.fn(cryptoPort().deriveKey);
    const codec = createBackupEnvelopeCodec({ ...cryptoPort(), deriveKey });

    await expect(codec.seal({ snapshot, password, ...input })).rejects.toEqual(
      expect.objectContaining({ code }),
    );
    expect(deriveKey).not.toHaveBeenCalled();
  });

  it("maps an invalid derived key during sealing to a safe authentication error", async () => {
    const codec = createBackupEnvelopeCodec({
      ...cryptoPort(),
      async deriveKey() {
        return { key: new Uint8Array(31) };
      },
    });

    await expect(codec.seal({ snapshot, password, salt, nonce })).rejects.toEqual(
      expect.objectContaining({ code: "backup_authentication_failed" }),
    );
  });

  it.each([
    ["a non-byte ciphertext", { ciphertext: [1, 2, 3], tag: new Uint8Array(16) }],
    ["a short tag", { ciphertext: Uint8Array.from([1, 2, 3]), tag: new Uint8Array(15) }],
  ])("maps invalid encryption output with %s to a safe authentication error", async (_label, sealed) => {
    const codec = createBackupEnvelopeCodec({
      ...cryptoPort(),
      async encrypt() {
        return sealed as Awaited<ReturnType<BackupEnvelopeCryptoPort["encrypt"]>>;
      },
    });

    await expect(codec.seal({ snapshot, password, salt, nonce })).rejects.toEqual(
      expect.objectContaining({ code: "backup_authentication_failed" }),
    );
  });

  it("maps unexpected encryption failures to a safe authentication error", async () => {
    const codec = createBackupEnvelopeCodec({
      ...cryptoPort(),
      async encrypt() {
        throw new Error("native implementation detail");
      },
    });

    await expect(codec.seal({ snapshot, password, salt, nonce })).rejects.toEqual(
      expect.objectContaining({ code: "backup_authentication_failed" }),
    );
  });

  it("maps non-byte decrypted output to a safe authentication error", async () => {
    const port = cryptoPort();
    const archive = await createBackupEnvelopeCodec(port).seal({ snapshot, password, salt, nonce });
    const codec = createBackupEnvelopeCodec({
      ...port,
      async decrypt() {
        return [1, 2, 3] as unknown as Uint8Array;
      },
    });

    await expect(codec.open({ archive, password })).rejects.toEqual(
      expect.objectContaining({ code: "backup_authentication_failed" }),
    );
  });

  it.each([
    ["an empty base64 value", ""],
    ["a base64 value with invalid characters", "AA!A"],
    ["a base64 value with invalid trailing padding", "A==="],
    ["a noncanonical base64 value", "AB=="],
  ])("rejects %s before KDF work", async (_label, encoded) => {
    const source = await createBackupEnvelopeCodec(cryptoPort()).seal({ snapshot, password, salt, nonce });
    const header = headerFrom(source);
    header.kdf = { ...(header.kdf as Record<string, unknown>), salt: encoded };
    const deriveKey = jest.fn(cryptoPort().deriveKey);
    const codec = createBackupEnvelopeCodec({ ...cryptoPort(), deriveKey });

    await expect(codec.open({ archive: archiveWithHeader(source, header), password })).rejects.toEqual(
      expect.objectContaining({ code: "backup_archive_invalid" }),
    );
    expect(deriveKey).not.toHaveBeenCalled();
  });

  it.each([
    ["an array header", []],
    ["a non-object header", 1],
    ["a custom-prototype header", Object.create({ inherited: true })],
  ])("rejects %s before KDF work", async (_label, header) => {
    const source = await createBackupEnvelopeCodec(cryptoPort()).seal({ snapshot, password, salt, nonce });
    const deriveKey = jest.fn(cryptoPort().deriveKey);
    const codec = createBackupEnvelopeCodec({ ...cryptoPort(), deriveKey });

    await expect(codec.open({ archive: archiveWithHeader(source, header), password })).rejects.toEqual(
      expect.objectContaining({ code: "backup_archive_invalid" }),
    );
    expect(deriveKey).not.toHaveBeenCalled();
  });

  it("rejects an over-limit declared payload before deriving a key", async () => {
    const source = await createBackupEnvelopeCodec(cryptoPort()).seal({ snapshot, password, salt, nonce });
    const header = headerFrom(source);
    header.payloadBytes = (24 * 1024 * 1024) + 1;
    const deriveKey = jest.fn(cryptoPort().deriveKey);
    const codec = createBackupEnvelopeCodec({ ...cryptoPort(), deriveKey });

    await expect(codec.open({ archive: archiveWithHeader(source, header), password })).rejects.toEqual(
      expect.objectContaining({ code: "backup_archive_limit_exceeded" }),
    );
    expect(deriveKey).not.toHaveBeenCalled();
  });

  it("wipes buffers when canonical header validation fails after decoding", async () => {
    const observed: Uint8Array[] = [];
    const port = cryptoPort();
    const source = await createBackupEnvelopeCodec(port).seal({ snapshot, password, salt, nonce });
    const header = headerFrom(source);
    const noncanonical = {
      version: header.version,
      snapshotId: header.snapshotId,
      payloadBytes: header.payloadBytes,
      nonce: header.nonce,
      kdf: header.kdf,
      compression: header.compression,
      cipher: header.cipher,
    };
    const archive = archiveWithHeader(source, noncanonical);
    const codec = createBackupEnvelopeCodec({
      ...port,
      async deriveKey(input) {
        observed.push(input.password, input.salt);
        return port.deriveKey(input);
      },
    });

    await expect(codec.open({ archive, password })).rejects.toEqual(
      expect.objectContaining({ code: "backup_archive_invalid" }),
    );
    expect(observed).toEqual([]);
  });


  it("rejects a canonical header that exceeds the envelope header limit", async () => {
    const oversizedHeaderSnapshot = {
      ...snapshot,
      snapshotId: "backup_".concat("x".repeat((16 * 1024) + 1)),
    };
    const codec = createBackupEnvelopeCodec(cryptoPort());

    await expect(codec.seal({
      snapshot: oversizedHeaderSnapshot,
      password,
      salt,
      nonce,
    })).rejects.toEqual(expect.objectContaining({
      code: "backup_archive_limit_exceeded",
    }));
  });

  it("rejects a validated logical snapshot whose canonical JSON exceeds the plaintext limit", async () => {
    const maxLengthValue = "x".repeat(BACKUP_LIMITS.maxStringBytes);
    const rows = Array.from(
      { length: BACKUP_LIMITS.maxPlaintextBytes / BACKUP_LIMITS.maxStringBytes },
      (_, index) => ({ key: `setting_${index}`, value_json: maxLengthValue }),
    );
    const oversizedPayloadSnapshot: LogicalBackupSnapshot = {
      ...snapshot,
      tables: { app_settings: rows },
      manifest: {
        catalogReferenceCount: 0,
        rowCounts: { app_settings: rows.length },
        totalRows: rows.length,
      },
    };
    const codec = createBackupEnvelopeCodec(cryptoPort());

    await expect(codec.seal({
      snapshot: oversizedPayloadSnapshot,
      password,
      salt,
      nonce,
    })).rejects.toEqual(expect.objectContaining({
      code: "backup_archive_limit_exceeded",
    }));
  });
});

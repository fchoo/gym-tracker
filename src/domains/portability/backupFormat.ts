import {
  ARGON2ID_ITERATIONS,
  ARGON2ID_MEMORY_KIB,
  ARGON2ID_OUTPUT_LENGTH,
  ARGON2ID_PARALLELISM,
  ARGON2ID_SALT_LENGTH,
  ARGON2ID_DESCRIPTOR_VERSION,
} from "../../platform/crypto/passwordKdf";
import {
  AES_GCM_ARCHIVE_NONCE_BYTES,
  AES_GCM_ARCHIVE_TAG_BYTES,
} from "../../platform/crypto/aesGcmArchivePort";

import {
  BACKUP_LIMITS,
  parseLogicalBackupSnapshot,
  type LogicalBackupSnapshot,
} from "./backupContracts";

const MAGIC = Uint8Array.from([0x47, 0x54, 0x42, 0x4b]);
const FORMAT_VERSION = 1 as const;
const PREFIX_BYTES = 9;
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();

export type BackupEnvelopeCryptoPort = Readonly<{
  deriveKey(input: Readonly<{
    password: Uint8Array;
    salt: Uint8Array;
  }>): Promise<Readonly<{ key: Uint8Array }>>;
  encrypt(input: Readonly<{
    key: Uint8Array;
    nonce: Uint8Array;
    aad: Uint8Array;
    plaintext: Uint8Array;
  }>): Promise<Readonly<{ ciphertext: Uint8Array; tag: Uint8Array }>>;
  decrypt(input: Readonly<{
    key: Uint8Array;
    nonce: Uint8Array;
    aad: Uint8Array;
    ciphertext: Uint8Array;
    tag: Uint8Array;
  }>): Promise<Uint8Array>;
}>;

export type BackupEnvelopeCodec = Readonly<{
  seal(input: Readonly<{
    snapshot: LogicalBackupSnapshot;
    password: Uint8Array;
    salt: Uint8Array;
    nonce: Uint8Array;
  }>): Promise<Uint8Array>;
  open(input: Readonly<{
    archive: Uint8Array;
    password: Uint8Array;
  }>): Promise<LogicalBackupSnapshot>;
}>;

export class BackupFormatError extends Error {
  readonly kind:
    | "validation"
    | "unsupported_version"
    | "crypto";
  readonly retryable = false;
  readonly correlationCode = "GT-BACKUP03" as const;

  constructor(readonly code:
    | "backup_archive_invalid"
    | "backup_archive_limit_exceeded"
    | "backup_archive_unsupported_version"
    | "backup_authentication_failed",
  ) {
    super(code);
    this.name = "BackupFormatError";
    this.kind = code === "backup_archive_unsupported_version"
      ? "unsupported_version"
      : code === "backup_authentication_failed"
        ? "crypto"
        : "validation";
  }
}

type BackupHeader = Readonly<{
  cipher: Readonly<{ algorithm: "aes-256-gcm"; tagBytes: 16 }>;
  compression: "none";
  kdf: Readonly<{
    algorithm: "argon2id";
    iterations: typeof ARGON2ID_ITERATIONS;
    memoryKiB: typeof ARGON2ID_MEMORY_KIB;
    outputBytes: typeof ARGON2ID_OUTPUT_LENGTH;
    parallelism: typeof ARGON2ID_PARALLELISM;
    salt: string;
    version: typeof ARGON2ID_DESCRIPTOR_VERSION;
  }> ;
  nonce: string;
  payloadBytes: number;
  snapshotId: string;
  version: typeof FORMAT_VERSION;
}>;

function wipe(...buffers: Array<Uint8Array | undefined>): void {
  for (const buffer of buffers) {
    buffer?.fill(0);
  }
}

function base64(bytes: Uint8Array): string {
  const encoded: string[] = [];
  for (let index = 0; index < bytes.byteLength; index += 3) {
    const padded = new Uint8Array(3);
    padded.set(bytes.subarray(index, index + 3));
    const group = [
      BASE64_ALPHABET[padded[0]! >>> 2],
      BASE64_ALPHABET[((padded[0]! & 0b11) << 4) | (padded[1]! >>> 4)],
      BASE64_ALPHABET[((padded[1]! & 0b1111) << 2) | (padded[2]! >>> 6)],
      BASE64_ALPHABET[padded[2]! & 0b111111],
    ].join("");
    const available = Math.min(3, bytes.byteLength - index);
    const length = available + 1;
    encoded.push(group.slice(0, length).padEnd(4, "="));
  }
  return encoded.join("");
}

function fromBase64(value: string): Uint8Array {
  if (value.length === 0
    || value.length % 4 !== 0
    || /[^A-Za-z0-9+/=]/u.test(value)
    || (value.includes("=") && value.indexOf("=") < value.length - 2)
    || (value.endsWith("=") && value.indexOf("=") < value.length - 2)) {
    throw new BackupFormatError("backup_archive_invalid");
  }
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const first = BASE64_ALPHABET.indexOf(value[index]!);
    const second = BASE64_ALPHABET.indexOf(value[index + 1]!);
    const thirdCharacter = value[index + 2]!;
    const fourthCharacter = value[index + 3]!;
    const third = thirdCharacter === "=" ? 0 : BASE64_ALPHABET.indexOf(thirdCharacter);
    const fourth = fourthCharacter === "=" ? 0 : BASE64_ALPHABET.indexOf(fourthCharacter);
    if (first < 0 || second < 0 || third < 0 || fourth < 0
      || (thirdCharacter === "=" && fourthCharacter !== "=")
      || ((thirdCharacter === "=" || fourthCharacter === "=") && index + 4 !== value.length)) {
      throw new BackupFormatError("backup_archive_invalid");
    }
    bytes.push((first << 2) | (second >>> 4));
    if (thirdCharacter !== "=") {
      bytes.push(((second & 0b1111) << 4) | (third >>> 2));
    }
    if (fourthCharacter !== "=") {
      bytes.push(((third & 0b11) << 6) | fourth);
    }
  }
  const decoded = Uint8Array.from(bytes);
  if (base64(decoded) !== value) {
    wipe(decoded);
    throw new BackupFormatError("backup_archive_invalid");
  }
  return decoded;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => (
    `${JSON.stringify(key)}:${stableJson(object[key])}`
  )).join(",")}}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return !prototype || prototype === Object.prototype;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function invalid(): never {
  throw new BackupFormatError("backup_archive_invalid");
}

function assertBoundedPayloadBytes(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    invalid();
  }
  if (value > BACKUP_LIMITS.maxPlaintextBytes) {
    throw new BackupFormatError("backup_archive_limit_exceeded");
  }
}

function assertHeader(value: unknown): asserts value is BackupHeader {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "cipher",
    "compression",
    "kdf",
    "nonce",
    "payloadBytes",
    "snapshotId",
    "version",
  ])) {
    invalid();
  }
  if (value.version !== FORMAT_VERSION) {
    throw new BackupFormatError("backup_archive_unsupported_version");
  }
  if (value.compression !== "none" || typeof value.snapshotId !== "string" || value.snapshotId.trim().length === 0) {
    invalid();
  }
  assertBoundedPayloadBytes(value.payloadBytes);
  if (!isPlainObject(value.cipher) || !hasExactKeys(value.cipher, ["algorithm", "tagBytes"])
    || value.cipher.algorithm !== "aes-256-gcm" || value.cipher.tagBytes !== AES_GCM_ARCHIVE_TAG_BYTES) {
    invalid();
  }
  if (!isPlainObject(value.kdf) || !hasExactKeys(value.kdf, [
    "algorithm", "iterations", "memoryKiB", "outputBytes", "parallelism", "salt", "version",
  ])
    || value.kdf.algorithm !== "argon2id"
    || value.kdf.version !== ARGON2ID_DESCRIPTOR_VERSION
    || value.kdf.memoryKiB !== ARGON2ID_MEMORY_KIB
    || value.kdf.iterations !== ARGON2ID_ITERATIONS
    || value.kdf.parallelism !== ARGON2ID_PARALLELISM
    || value.kdf.outputBytes !== ARGON2ID_OUTPUT_LENGTH
    || typeof value.kdf.salt !== "string"
    || typeof value.nonce !== "string") {
    invalid();
  }
  const salt = fromBase64(value.kdf.salt);
  const nonce = fromBase64(value.nonce);
  try {
    if (salt.byteLength !== ARGON2ID_SALT_LENGTH || nonce.byteLength !== AES_GCM_ARCHIVE_NONCE_BYTES) {
      invalid();
    }
  } finally {
    wipe(salt, nonce);
  }
}

function encodePrefix(headerBytes: Uint8Array): Uint8Array {
  if (headerBytes.byteLength > BACKUP_LIMITS.maxHeaderBytes) {
    throw new BackupFormatError("backup_archive_limit_exceeded");
  }
  const prefix = new Uint8Array(PREFIX_BYTES + headerBytes.byteLength);
  prefix.set(MAGIC);
  prefix[4] = FORMAT_VERSION;
  new DataView(prefix.buffer).setUint32(5, headerBytes.byteLength);
  prefix.set(headerBytes, PREFIX_BYTES);
  return prefix;
}

function parsePrefix(archive: Uint8Array): Readonly<{
  aad: Uint8Array;
  header: BackupHeader;
  ciphertext: Uint8Array;
  tag: Uint8Array;
}> {
  if (archive.byteLength > BACKUP_LIMITS.maxArchiveBytes) {
    throw new BackupFormatError("backup_archive_limit_exceeded");
  }
  if (archive.byteLength < PREFIX_BYTES + AES_GCM_ARCHIVE_TAG_BYTES
    || !MAGIC.every((byte, index) => archive[index] === byte)) {
    invalid();
  }
  if (archive[4] !== FORMAT_VERSION) {
    throw new BackupFormatError("backup_archive_unsupported_version");
  }
  const headerLength = new DataView(archive.buffer, archive.byteOffset, archive.byteLength).getUint32(5);
  if (headerLength > BACKUP_LIMITS.maxHeaderBytes
    || PREFIX_BYTES + headerLength + AES_GCM_ARCHIVE_TAG_BYTES > archive.byteLength) {
    invalid();
  }
  const aad = archive.slice(0, PREFIX_BYTES + headerLength);
  const headerBytes = aad.slice(PREFIX_BYTES);
  let headerText: string;
  let parsedHeader: unknown;
  try {
    headerText = decoder.decode(headerBytes);
    parsedHeader = JSON.parse(headerText);
  } catch {
    wipe(headerBytes, aad);
    invalid();
  }
  try {
    assertHeader(parsedHeader);
    if (stableJson(parsedHeader) !== headerText) {
      invalid();
    }
  } catch (error) {
    wipe(headerBytes, aad);
    throw error;
  }
  wipe(headerBytes);
  const ciphertextEnd = archive.byteLength - AES_GCM_ARCHIVE_TAG_BYTES;
  return {
    aad,
    header: parsedHeader,
    ciphertext: archive.slice(PREFIX_BYTES + headerLength, ciphertextEnd),
    tag: archive.slice(ciphertextEnd),
  };
}

function canonicalPayload(snapshot: LogicalBackupSnapshot): Uint8Array {
  const textValue = stableJson(snapshot);
  const bytes = encoder.encode(textValue);
  if (bytes.byteLength > BACKUP_LIMITS.maxPlaintextBytes) {
    wipe(bytes);
    throw new BackupFormatError("backup_archive_limit_exceeded");
  }
  return bytes;
}

function headerFor(input: Readonly<{
  snapshot: LogicalBackupSnapshot;
  salt: Uint8Array;
  nonce: Uint8Array;
  payloadBytes: number;
}>): BackupHeader {
  return {
    cipher: { algorithm: "aes-256-gcm", tagBytes: AES_GCM_ARCHIVE_TAG_BYTES },
    compression: "none",
    kdf: {
      algorithm: "argon2id",
      iterations: ARGON2ID_ITERATIONS,
      memoryKiB: ARGON2ID_MEMORY_KIB,
      outputBytes: ARGON2ID_OUTPUT_LENGTH,
      parallelism: ARGON2ID_PARALLELISM,
      salt: base64(input.salt),
      version: ARGON2ID_DESCRIPTOR_VERSION,
    },
    nonce: base64(input.nonce),
    payloadBytes: input.payloadBytes,
    snapshotId: input.snapshot.snapshotId,
    version: FORMAT_VERSION,
  };
}

function parsePayload(plaintext: Uint8Array, expectedBytes: number): LogicalBackupSnapshot {
  if (plaintext.byteLength !== expectedBytes || plaintext.byteLength > BACKUP_LIMITS.maxPlaintextBytes) {
    throw new BackupFormatError("backup_archive_limit_exceeded");
  }
  try {
    return parseLogicalBackupSnapshot(JSON.parse(decoder.decode(plaintext)));
  } catch {
    throw new BackupFormatError("backup_archive_invalid");
  }
}

export function createBackupEnvelopeCodec(
  crypto: BackupEnvelopeCryptoPort,
): BackupEnvelopeCodec {
  return Object.freeze({
    async seal(input) {
      const password = input.password.slice();
      const salt = input.salt.slice();
      const nonce = input.nonce.slice();
      let plaintext: Uint8Array | undefined;
      let key: Uint8Array | undefined;
      let aad: Uint8Array | undefined;
      let ciphertext: Uint8Array | undefined;
      let tag: Uint8Array | undefined;
      try {
        if (salt.byteLength !== ARGON2ID_SALT_LENGTH || nonce.byteLength !== AES_GCM_ARCHIVE_NONCE_BYTES) {
          invalid();
        }
        parseLogicalBackupSnapshot(input.snapshot);
        plaintext = canonicalPayload(input.snapshot);
        const header = headerFor({
          snapshot: input.snapshot,
          salt,
          nonce,
          payloadBytes: plaintext.byteLength,
        });
        aad = encodePrefix(encoder.encode(stableJson(header)));
        const derived = await crypto.deriveKey({ password, salt });
        key = derived.key;
        if (!(key instanceof Uint8Array) || key.byteLength !== ARGON2ID_OUTPUT_LENGTH) {
          throw new BackupFormatError("backup_authentication_failed");
        }
        const sealed = await crypto.encrypt({ key, nonce, aad, plaintext });
        ciphertext = sealed.ciphertext;
        tag = sealed.tag;
        if (!(ciphertext instanceof Uint8Array) || !(tag instanceof Uint8Array) || tag.byteLength !== AES_GCM_ARCHIVE_TAG_BYTES) {
          throw new BackupFormatError("backup_authentication_failed");
        }
        const archive = new Uint8Array(aad.byteLength + ciphertext.byteLength + tag.byteLength);
        archive.set(aad);
        archive.set(ciphertext, aad.byteLength);
        archive.set(tag, aad.byteLength + ciphertext.byteLength);
        return archive;
      } catch (error) {
        if (error instanceof BackupFormatError) {
          throw error;
        }
        throw new BackupFormatError("backup_authentication_failed");
      } finally {
        wipe(password, salt, nonce, plaintext, key, aad, ciphertext, tag);
      }
    },

    async open(input) {
      const password = input.password.slice();
      let aad: Uint8Array | undefined;
      let salt: Uint8Array | undefined;
      let nonce: Uint8Array | undefined;
      let ciphertext: Uint8Array | undefined;
      let tag: Uint8Array | undefined;
      let key: Uint8Array | undefined;
      let plaintext: Uint8Array | undefined;
      try {
        const parsed = parsePrefix(input.archive);
        aad = parsed.aad;
        ciphertext = parsed.ciphertext;
        tag = parsed.tag;
        salt = fromBase64(parsed.header.kdf.salt);
        nonce = fromBase64(parsed.header.nonce);
        const derived = await crypto.deriveKey({ password, salt });
        key = derived.key;
        if (!(key instanceof Uint8Array) || key.byteLength !== ARGON2ID_OUTPUT_LENGTH) {
          throw new BackupFormatError("backup_authentication_failed");
        }
        plaintext = await crypto.decrypt({ key, nonce, aad, ciphertext, tag });
        if (!(plaintext instanceof Uint8Array)) {
          throw new BackupFormatError("backup_authentication_failed");
        }
        const snapshot = parsePayload(plaintext, parsed.header.payloadBytes);
        if (snapshot.snapshotId !== parsed.header.snapshotId) {
          throw new BackupFormatError("backup_archive_invalid");
        }
        return snapshot;
      } catch (error) {
        if (error instanceof BackupFormatError) {
          throw error;
        }
        throw new BackupFormatError("backup_authentication_failed");
      } finally {
        wipe(password, aad, salt, nonce, ciphertext, tag, key, plaintext);
      }
    },
  });
}

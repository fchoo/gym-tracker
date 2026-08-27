export const AES_GCM_ARCHIVE_KEY_BYTES = 32 as const;
export const AES_GCM_ARCHIVE_NONCE_BYTES = 12 as const;
export const AES_GCM_ARCHIVE_TAG_BYTES = 16 as const;

export type AesGcmArchiveDriver = Readonly<{
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

export type AesGcmArchivePort = Readonly<{
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

export class ArchiveCryptoError extends Error {
  readonly kind = "crypto" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-BACKUP02" as const;

  constructor(readonly code:
    | "aes_gcm_input_invalid"
    | "aes_gcm_encryption_failed"
    | "aes_gcm_authentication_failed",
  ) {
    super(code);
    this.name = "ArchiveCryptoError";
  }
}

function isByteArray(value: unknown, length?: number): value is Uint8Array {
  return value instanceof Uint8Array
    && (length === undefined || value.byteLength === length);
}

function validEncryptInput(input: Readonly<{
  key: Uint8Array;
  nonce: Uint8Array;
  aad: Uint8Array;
  plaintext: Uint8Array;
}>): boolean {
  return isByteArray(input.key, AES_GCM_ARCHIVE_KEY_BYTES)
    && isByteArray(input.nonce, AES_GCM_ARCHIVE_NONCE_BYTES)
    && isByteArray(input.aad)
    && isByteArray(input.plaintext);
}

function validDecryptInput(input: Readonly<{
  key: Uint8Array;
  nonce: Uint8Array;
  aad: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
}>): boolean {
  return isByteArray(input.key, AES_GCM_ARCHIVE_KEY_BYTES)
    && isByteArray(input.nonce, AES_GCM_ARCHIVE_NONCE_BYTES)
    && isByteArray(input.aad)
    && isByteArray(input.ciphertext)
    && isByteArray(input.tag, AES_GCM_ARCHIVE_TAG_BYTES);
}

function wipe(...buffers: Array<Uint8Array | undefined>): void {
  for (const buffer of buffers) {
    buffer?.fill(0);
  }
}

/**
 * Owns copies of inputs around the native boundary so callers retain control
 * of their own buffers and every temporary copy is wiped on every path.
 */
export function createAesGcmArchivePort(
  driver: AesGcmArchiveDriver,
): AesGcmArchivePort {
  return Object.freeze({
    async encrypt(input) {
      if (!validEncryptInput(input)) {
        throw new ArchiveCryptoError("aes_gcm_input_invalid");
      }
      const key = input.key.slice();
      const nonce = input.nonce.slice();
      const aad = input.aad.slice();
      const plaintext = input.plaintext.slice();
      let nativeCiphertext: Uint8Array | undefined;
      let nativeTag: Uint8Array | undefined;
      try {
        const result = await driver.encrypt({ key, nonce, aad, plaintext });
        nativeCiphertext = result.ciphertext;
        nativeTag = result.tag;
        if (!isByteArray(nativeCiphertext) || !isByteArray(nativeTag, AES_GCM_ARCHIVE_TAG_BYTES)) {
          throw new ArchiveCryptoError("aes_gcm_encryption_failed");
        }
        return {
          ciphertext: nativeCiphertext.slice(),
          tag: nativeTag.slice(),
        };
      } catch (error) {
        if (error instanceof ArchiveCryptoError) {
          throw error;
        }
        throw new ArchiveCryptoError("aes_gcm_encryption_failed");
      } finally {
        wipe(key, nonce, aad, plaintext, nativeCiphertext, nativeTag);
      }
    },

    async decrypt(input) {
      if (!validDecryptInput(input)) {
        throw new ArchiveCryptoError("aes_gcm_input_invalid");
      }
      const key = input.key.slice();
      const nonce = input.nonce.slice();
      const aad = input.aad.slice();
      const ciphertext = input.ciphertext.slice();
      const tag = input.tag.slice();
      let plaintext: Uint8Array | undefined;
      try {
        plaintext = await driver.decrypt({ key, nonce, aad, ciphertext, tag });
        if (!isByteArray(plaintext)) {
          throw new ArchiveCryptoError("aes_gcm_authentication_failed");
        }
        return plaintext.slice();
      } catch (error) {
        if (error instanceof ArchiveCryptoError) {
          throw error;
        }
        throw new ArchiveCryptoError("aes_gcm_authentication_failed");
      } finally {
        wipe(key, nonce, aad, ciphertext, tag, plaintext);
      }
    },
  });
}

/** Native Expo implementation, loaded only when a production runtime uses it. */
export function createExpoAesGcmArchiveDriver(): AesGcmArchiveDriver {
  const {
    AESEncryptionKey,
    AESSealedData,
    aesDecryptAsync,
    aesEncryptAsync,
  } = require("expo-crypto") as typeof import("expo-crypto");

  return Object.freeze({
    async encrypt(input) {
      const key = await AESEncryptionKey.import(input.key);
      const sealed = await aesEncryptAsync(input.plaintext, key, {
        nonce: { bytes: input.nonce },
        tagLength: AES_GCM_ARCHIVE_TAG_BYTES,
        additionalData: input.aad,
      });
      const [ciphertext, tag] = await Promise.all([
        sealed.ciphertext({ encoding: "bytes" }),
        sealed.tag("bytes"),
      ]);
      if (!(ciphertext instanceof Uint8Array) || !(tag instanceof Uint8Array)) {
        throw new Error("expo_aes_output_invalid");
      }
      return { ciphertext, tag };
    },

    async decrypt(input) {
      const key = await AESEncryptionKey.import(input.key);
      const sealed = AESSealedData.fromParts(
        input.nonce,
        input.ciphertext,
        input.tag,
      );
      const plaintext = await aesDecryptAsync(sealed, key, {
        additionalData: input.aad,
      });
      if (!(plaintext instanceof Uint8Array)) {
        throw new Error("expo_aes_plaintext_invalid");
      }
      return plaintext;
    },
  });
}

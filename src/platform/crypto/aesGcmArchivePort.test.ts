import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const mockImportAesKey = jest.fn(async (_key: Uint8Array): Promise<unknown> => undefined);
const mockEncryptAsync = jest.fn(async (
  _plaintext: Uint8Array,
  _key: unknown,
  _options: unknown,
): Promise<unknown> => undefined);
const mockDecryptAsync = jest.fn(async (
  _sealed: unknown,
  _key: unknown,
  _options: unknown,
): Promise<unknown> => undefined);
const mockSealedDataFromParts = jest.fn((
  _nonce: Uint8Array,
  _ciphertext: Uint8Array,
  _tag: Uint8Array,
): unknown => undefined);

jest.mock("expo-crypto", () => ({
  AESEncryptionKey: { import: mockImportAesKey },
  AESSealedData: { fromParts: mockSealedDataFromParts },
  aesDecryptAsync: mockDecryptAsync,
  aesEncryptAsync: mockEncryptAsync,
}));

import {
  ArchiveCryptoError,
  createAesGcmArchivePort,
  createExpoAesGcmArchiveDriver,
  type AesGcmArchiveDriver,
} from "./aesGcmArchivePort";

const key = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const nonce = Uint8Array.from({ length: 12 }, (_, index) => index + 2);
const aad = Uint8Array.from([9, 8, 7]);
const plaintext = Uint8Array.from([1, 2, 3, 4]);

function driver(overrides: Partial<AesGcmArchiveDriver> = {}): AesGcmArchiveDriver {
  return {
    async encrypt(input) {
      return {
        ciphertext: input.plaintext.map((byte) => byte ^ 0xff),
        tag: new Uint8Array(16).fill(7),
      };
    },
    async decrypt(input) {
      if (input.tag.some((byte) => byte !== 7)) {
        throw new Error("authentication failed with owner-secret");
      }
      return input.ciphertext.map((byte) => byte ^ 0xff);
    },
    ...overrides,
  };
}

describe("AES-GCM archive port", () => {
  it("uses AES-256-GCM inputs with caller-supplied nonce and authenticated header bytes", async () => {
    const captured: Array<Record<string, Uint8Array>> = [];
    const port = createAesGcmArchivePort(driver({
      async encrypt(input) {
        captured.push({
          key: input.key.slice(),
          nonce: input.nonce.slice(),
          aad: input.aad.slice(),
          plaintext: input.plaintext.slice(),
        });
        return { ciphertext: Uint8Array.from([4, 3, 2, 1]), tag: new Uint8Array(16).fill(7) };
      },
    }));

    const sealed = await port.encrypt({ key, nonce, aad, plaintext });

    expect(captured).toEqual([{ key, nonce, aad, plaintext }]);
    expect(sealed).toEqual({
      ciphertext: Uint8Array.from([4, 3, 2, 1]),
      tag: new Uint8Array(16).fill(7),
    });
  });

  it("round-trips only through matching ciphertext, tag, nonce, and AAD", async () => {
    const port = createAesGcmArchivePort(driver());
    const sealed = await port.encrypt({ key, nonce, aad, plaintext });

    await expect(port.decrypt({
      key,
      nonce,
      aad,
      ciphertext: sealed.ciphertext,
      tag: sealed.tag,
    })).resolves.toEqual(plaintext);
  });

  it.each([
    ["short key", { key: key.slice(1) }],
    ["short nonce", { nonce: nonce.slice(1) }],
    ["non-byte additional data", { aad: [1, 2, 3] }],
    ["non-byte plaintext", { plaintext: [1, 2, 3] }],
  ])("rejects %s before invoking the driver", async (_label, override) => {
    const encrypt = jest.fn(driver().encrypt);
    const port = createAesGcmArchivePort(driver({ encrypt }));

    await expect(port.encrypt({
      key,
      nonce,
      aad,
      plaintext,
      ...override,
    } as Parameters<typeof port.encrypt>[0])).rejects.toEqual(expect.objectContaining({
      code: "aes_gcm_input_invalid",
      kind: "crypto",
    }));
    expect(encrypt).not.toHaveBeenCalled();
  });

  it.each([
    ["short key", { key: key.slice(1) }],
    ["short nonce", { nonce: nonce.slice(1) }],
    ["non-byte additional data", { aad: [1, 2, 3] }],
    ["non-byte ciphertext", { ciphertext: [1, 2, 3] }],
    ["short authentication tag", { tag: new Uint8Array(15) }],
  ])("rejects decrypt input with %s before invoking the driver", async (_label, override) => {
    const decrypt = jest.fn(driver().decrypt);
    const port = createAesGcmArchivePort(driver({ decrypt }));

    await expect(port.decrypt({
      key,
      nonce,
      aad,
      ciphertext: Uint8Array.from([1, 2, 3]),
      tag: new Uint8Array(16).fill(7),
      ...override,
    } as Parameters<typeof port.decrypt>[0])).rejects.toEqual(expect.objectContaining({
      code: "aes_gcm_input_invalid",
      kind: "crypto",
    }));
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("maps native authentication errors to a safe typed error without raw error text", async () => {
    const port = createAesGcmArchivePort(driver());
    let caught: unknown;
    try {
      await port.decrypt({
        key,
        nonce,
        aad,
        ciphertext: Uint8Array.from([1, 2, 3]),
        tag: new Uint8Array(16).fill(1),
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ArchiveCryptoError);
    expect(caught).toEqual(expect.objectContaining({
      code: "aes_gcm_authentication_failed",
      kind: "crypto",
      retryable: false,
    }));
    expect(JSON.stringify(caught)).not.toContain("owner-secret");
  });

  it("wipes owned copies after native work succeeds or fails", async () => {
    const observed: Uint8Array[] = [];
    const port = createAesGcmArchivePort(driver({
      async encrypt(input) {
        observed.push(input.key, input.nonce, input.aad, input.plaintext);
        throw new Error("native error");
      },
    }));

    await expect(port.encrypt({ key, nonce, aad, plaintext })).rejects.toEqual(
      expect.objectContaining({ code: "aes_gcm_encryption_failed" }),
    );
    expect(observed.every((value) => value.every((byte) => byte === 0))).toBe(true);
    expect(key.some((byte) => byte !== 0)).toBe(true);
  });

  it.each([
    ["a non-byte ciphertext", { ciphertext: [1, 2, 3], tag: new Uint8Array(16).fill(7) }],
    ["a short authentication tag", { ciphertext: Uint8Array.from([1, 2, 3]), tag: new Uint8Array(15) }],
  ])("rejects native encryption output with %s and wipes it", async (_label, result) => {
    const observed: Uint8Array[] = [];
    const port = createAesGcmArchivePort(driver({
      async encrypt() {
        const ciphertext = result.ciphertext instanceof Uint8Array
          ? result.ciphertext
          : Uint8Array.from(result.ciphertext);
        const tag = result.tag;
        if (result.ciphertext instanceof Uint8Array) {
          observed.push(ciphertext);
        }
        observed.push(tag);
        return result as Awaited<ReturnType<AesGcmArchiveDriver["encrypt"]>>;
      },
    }));

    await expect(port.encrypt({ key, nonce, aad, plaintext })).rejects.toEqual(
      expect.objectContaining({ code: "aes_gcm_encryption_failed" }),
    );
    expect(observed.every((value) => value.every((byte) => byte === 0))).toBe(true);
  });

  it("rejects non-byte native plaintext and preserves typed driver failures", async () => {
    const port = createAesGcmArchivePort(driver({
      async decrypt() {
        return [1, 2, 3] as unknown as Uint8Array;
      },
    }));
    const typedFailure = createAesGcmArchivePort(driver({
      async encrypt() {
        throw new ArchiveCryptoError("aes_gcm_encryption_failed");
      },
    }));

    await expect(port.decrypt({
      key,
      nonce,
      aad,
      ciphertext: Uint8Array.from([1, 2, 3]),
      tag: new Uint8Array(16).fill(7),
    })).rejects.toEqual(expect.objectContaining({ code: "aes_gcm_authentication_failed" }));
    await expect(typedFailure.encrypt({ key, nonce, aad, plaintext })).rejects.toEqual(
      expect.objectContaining({ code: "aes_gcm_encryption_failed" }),
    );
  });

  it("adapts Expo AES-GCM with explicit nonce, tag, and authenticated data", async () => {
    const importedKey = { nativeKey: true };
    const encryptedCiphertext = Uint8Array.from([4, 5, 6]);
    const encryptedTag = new Uint8Array(16).fill(5);
    const sealed = {
      ciphertext: jest.fn(async () => encryptedCiphertext),
      tag: jest.fn(async () => encryptedTag),
    };
    mockImportAesKey.mockResolvedValue(importedKey);
    mockEncryptAsync.mockResolvedValue(sealed);
    mockSealedDataFromParts.mockReturnValue({ sealed: true });
    mockDecryptAsync.mockResolvedValue(plaintext);
    const expoDriver = createExpoAesGcmArchiveDriver();

    await expect(expoDriver.encrypt({ key, nonce, aad, plaintext })).resolves.toEqual({
      ciphertext: encryptedCiphertext,
      tag: encryptedTag,
    });
    await expect(expoDriver.decrypt({
      key,
      nonce,
      aad,
      ciphertext: encryptedCiphertext,
      tag: encryptedTag,
    })).resolves.toEqual(plaintext);

    expect(mockEncryptAsync).toHaveBeenCalledWith(plaintext, importedKey, {
      nonce: { bytes: nonce },
      tagLength: 16,
      additionalData: aad,
    });
    expect(mockSealedDataFromParts).toHaveBeenCalledWith(nonce, encryptedCiphertext, encryptedTag);
    expect(mockDecryptAsync).toHaveBeenCalledWith({ sealed: true }, importedKey, {
      additionalData: aad,
    });
  });

  it("rejects invalid Expo driver output before handing it to the archive port", async () => {
    mockImportAesKey.mockResolvedValue({ nativeKey: true });
    mockEncryptAsync.mockResolvedValue({
      ciphertext: async () => [1, 2, 3],
      tag: async () => new Uint8Array(16),
    });
    const expoDriver = createExpoAesGcmArchiveDriver();

    await expect(expoDriver.encrypt({ key, nonce, aad, plaintext })).rejects.toThrow(
      "expo_aes_output_invalid",
    );

    mockSealedDataFromParts.mockReturnValue({ sealed: true });
    mockDecryptAsync.mockResolvedValue([1, 2, 3]);
    await expect(expoDriver.decrypt({
      key,
      nonce,
      aad,
      ciphertext: Uint8Array.from([1, 2, 3]),
      tag: new Uint8Array(16),
    })).rejects.toThrow("expo_aes_plaintext_invalid");
  });
});

import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

jest.mock("../../../modules/argon2-kdf/src", () => ({
  ARGON2_KDF_CONTRACT_VERSION: 1,
  deriveArgon2id: jest.fn(),
}));

import {
  deriveArgon2id,
} from "../../../modules/argon2-kdf/src";
import {
  ARGON2ID_DESCRIPTOR_VERSION,
  ARGON2ID_ITERATIONS,
  ARGON2ID_MEMORY_KIB,
  ARGON2ID_OUTPUT_LENGTH,
  ARGON2ID_PARALLELISM,
  ARGON2ID_SALT_LENGTH,
  PasswordKdfError,
  createPasswordKdfCalibrationPort,
  createPasswordKdfPort,
  type PasswordKdfDescriptor,
} from "./passwordKdf";

const mockDeriveArgon2id = jest.mocked(deriveArgon2id);
const password = Uint8Array.from([1, 2, 3, 4]);
const salt = Uint8Array.from({ length: ARGON2ID_SALT_LENGTH }, (_, index) => (
  index + 1
));

function descriptor(
  overrides: Partial<PasswordKdfDescriptor> = {},
): PasswordKdfDescriptor {
  return {
    version: ARGON2ID_DESCRIPTOR_VERSION,
    algorithm: "argon2id",
    memoryKiB: ARGON2ID_MEMORY_KIB,
    iterations: ARGON2ID_ITERATIONS,
    parallelism: ARGON2ID_PARALLELISM,
    salt,
    outputLength: ARGON2ID_OUTPUT_LENGTH,
    ...overrides,
  };
}

type PasswordKdfErrorCode = PasswordKdfError["code"];
const invalidDescriptorCases: Array<
  [string, PasswordKdfDescriptor, PasswordKdfErrorCode]
> = [
  ["version", descriptor({ version: 2 as 1 }), "argon2_invalid_version"],
  [
    "algorithm",
    descriptor({ algorithm: "argon2i" as "argon2id" }),
    "argon2_invalid_algorithm",
  ],
  [
    "salt length",
    descriptor({ salt: Uint8Array.from({ length: 15 }) }),
    "argon2_invalid_salt",
  ],
  [
    "memory",
    descriptor({ memoryKiB: ARGON2ID_MEMORY_KIB + 1 }),
    "argon2_parameters_out_of_bounds",
  ],
  [
    "iterations",
    descriptor({ iterations: ARGON2ID_ITERATIONS + 1 }),
    "argon2_parameters_out_of_bounds",
  ],
  [
    "parallelism",
    descriptor({ parallelism: ARGON2ID_PARALLELISM + 1 }),
    "argon2_parameters_out_of_bounds",
  ],
  [
    "output length",
    descriptor({ outputLength: 31 as 32 }),
    "argon2_parameters_out_of_bounds",
  ],
];

describe("PasswordKdfPort", () => {
  let capturedRequest: Readonly<Record<string, unknown>> | undefined;

  beforeEach(() => {
    mockDeriveArgon2id.mockReset();
    capturedRequest = undefined;
  });

  it("derives the OWASP-floor vector through the narrow bridge", async () => {
    const expected = Uint8Array.from(
      Buffer.from(
        "551d2b516a3d92963b2cd1e8fdc1725129e15824dfb6c8d9bb8a599ffcabfc1c",
        "hex",
      ),
    );
    mockDeriveArgon2id.mockImplementation(async (request) => {
      capturedRequest = {
        ...request,
        password: request.password.slice(),
        salt: request.salt.slice(),
      };
      return {
        version: 1,
        algorithm: "argon2id",
        provider: "Bouncy Castle",
        providerVersion: "1.85.2",
        durationMs: 312,
        output: expected.slice().buffer as ArrayBuffer,
      };
    });

    const result = await createPasswordKdfPort().derive(password, descriptor());

    expect(capturedRequest).toEqual({
      version: 1,
      password: password,
      salt,
      memoryKiB: ARGON2ID_MEMORY_KIB,
      iterations: ARGON2ID_ITERATIONS,
      parallelism: ARGON2ID_PARALLELISM,
      outputLength: ARGON2ID_OUTPUT_LENGTH,
    });
    expect(result).toEqual({
      bytes: expected,
      durationMs: 312,
      algorithm: "argon2id",
      provider: "Bouncy Castle",
      providerVersion: "1.85.2",
    });
  });

  it("allows only the reviewed floor-or-higher calibration matrix", async () => {
    const expected = new Uint8Array(ARGON2ID_OUTPUT_LENGTH);
    mockDeriveArgon2id.mockResolvedValue({
      version: 1,
      algorithm: "argon2id",
      provider: "Bouncy Castle",
      providerVersion: "1.85.2",
      durationMs: 410,
      output: expected.buffer as ArrayBuffer,
    });

    await expect(
      createPasswordKdfCalibrationPort().derive(password, descriptor({
        memoryKiB: 65_536,
        iterations: 4,
      })),
    ).resolves.toEqual(expect.objectContaining({
      durationMs: 410,
    }));
    expect(mockDeriveArgon2id).toHaveBeenCalledWith(expect.objectContaining({
      memoryKiB: 65_536,
      iterations: 4,
      parallelism: 1,
    }));
  });

  it.each([
    ["memory below floor", { memoryKiB: ARGON2ID_MEMORY_KIB - 1 }],
    ["unreviewed memory", { memoryKiB: 20_000 }],
    ["iterations below floor", { iterations: ARGON2ID_ITERATIONS - 1 }],
    ["iterations above ceiling", { iterations: 5 }],
    ["parallelism drift", { parallelism: 2 }],
  ])("rejects calibration %s", async (_label, override) => {
    await expect(
      createPasswordKdfCalibrationPort().derive(
        password,
        descriptor(override),
      ),
    ).rejects.toEqual(expect.objectContaining({
      code: "argon2_parameters_out_of_bounds",
    }));
    expect(mockDeriveArgon2id).not.toHaveBeenCalled();
  });

  it.each(invalidDescriptorCases)(
    "rejects an invalid %s before invoking native code",
    async (
    _label,
    invalidDescriptor,
    code,
  ) => {
    await expect(
      createPasswordKdfPort().derive(password, invalidDescriptor),
    ).rejects.toEqual(expect.objectContaining({
      kind: "crypto",
      code,
      retryable: false,
    } satisfies Partial<PasswordKdfError>));
    expect(mockDeriveArgon2id).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed native output without exposing bytes in errors", async () => {
    mockDeriveArgon2id.mockResolvedValue({
      version: 1,
      algorithm: "argon2id" as const,
      provider: "Bouncy Castle" as const,
      providerVersion: "1.85.2" as const,
      durationMs: 312,
      output: Uint8Array.from([222, 173, 190, 239]).buffer as ArrayBuffer,
    });

    let caught: unknown;
    try {
      await createPasswordKdfPort().derive(password, descriptor());
    } catch (error) {
      caught = error;
    }

    expect(caught).toEqual(expect.objectContaining({
      kind: "crypto",
      code: "argon2_native_result_invalid",
      retryable: false,
    }));
    expect(JSON.stringify(caught)).not.toContain("222");
    expect(JSON.stringify(caught)).not.toContain("173");
    expect(JSON.stringify(caught)).not.toContain("190");
    expect(JSON.stringify(caught)).not.toContain("239");
  });

  it.each([
    ["version", { version: 2 }],
    ["algorithm", { algorithm: "argon2i" }],
    ["provider", { provider: "Unknown" }],
    ["provider version", { providerVersion: "1.85.1" }],
    ["fractional duration", { durationMs: 1.5 }],
    ["negative duration", { durationMs: -1 }],
    ["non-binary output", { output: [1, 2, 3] }],
    [
      "wrong output length",
      { output: Uint8Array.from([1, 2, 3]).buffer as ArrayBuffer },
    ],
  ])("rejects invalid native %s metadata", async (_label, override) => {
    mockDeriveArgon2id.mockResolvedValue({
      version: 1,
      algorithm: "argon2id",
      provider: "Bouncy Castle",
      providerVersion: "1.85.2",
      durationMs: 312,
      output: new ArrayBuffer(ARGON2ID_OUTPUT_LENGTH),
      ...override,
    } as never);

    await expect(
      createPasswordKdfPort().derive(password, descriptor()),
    ).rejects.toEqual(expect.objectContaining({
      code: "argon2_native_result_invalid",
    }));
  });

  it.each([
    ["empty", new Uint8Array()],
    ["oversized", new Uint8Array(1_025)],
  ])("rejects an %s password before native work", async (_label, invalid) => {
    await expect(
      createPasswordKdfPort().derive(invalid, descriptor()),
    ).rejects.toEqual(expect.objectContaining({
      code: "argon2_invalid_password",
    }));
    expect(mockDeriveArgon2id).not.toHaveBeenCalled();
  });

  it.each([
    [
      "allowed native code",
      { code: "ERR_ARGON2_INVALID_SALT" },
      "argon2_invalid_salt",
    ],
    ["unknown native code", { code: "secret-raw-value" }, "argon2_derivation_failed"],
    ["primitive failure", "native crashed", "argon2_derivation_failed"],
  ])("maps %s to a safe typed error", async (_label, failure, expectedCode) => {
    mockDeriveArgon2id.mockRejectedValue(failure);

    await expect(
      createPasswordKdfPort().derive(password, descriptor()),
    ).rejects.toEqual(expect.objectContaining({
      code: expectedCode,
      kind: "crypto",
    }));
  });

  it.each([
    ["safe Expo code", { code: "ERR_FUNCTION_CALL" }, "ERR_FUNCTION_CALL"],
    ["long code", { code: `ERR_${"A".repeat(80)}` }, undefined],
    ["lowercase detail", { code: "secret-native-detail" }, undefined],
    ["non-string code", { code: 123 }, undefined],
  ])("preserves %s only as safe bridge metadata", async (
    _label,
    failure,
    expectedNativeCode,
  ) => {
    mockDeriveArgon2id.mockRejectedValue(failure);

    let caught: unknown;
    try {
      await createPasswordKdfPort().derive(password, descriptor());
    } catch (error) {
      caught = error;
    }

    expect(caught).toEqual(expect.objectContaining({
      code: "argon2_derivation_failed",
      nativeCode: expectedNativeCode,
    }));
    expect(JSON.stringify(caught)).not.toContain("secret-native-detail");
  });
});

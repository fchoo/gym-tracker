import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

jest.mock("../../platform/crypto/passwordKdf", () => ({
  ARGON2ID_ITERATIONS: 2,
  ARGON2ID_MEMORY_KIB: 19_456,
  ARGON2ID_OUTPUT_LENGTH: 32,
  ARGON2ID_PARALLELISM: 1,
  ARGON2ID_SALT_LENGTH: 16,
  PasswordKdfError: class PasswordKdfError extends Error {
    readonly kind = "crypto" as const;
    readonly retryable = false;
    readonly code: string;

    constructor(mockErrorCode: string) {
      super(mockErrorCode);
      this.code = mockErrorCode;
    }
  },
  createPasswordKdfCalibrationPort: jest.fn(),
  createPasswordKdfPort: jest.fn(),
}));

import {
  PasswordKdfError,
  createPasswordKdfCalibrationPort,
  createPasswordKdfPort,
} from "../../platform/crypto/passwordKdf";
import { performArgon2Feasibility } from "./argon2Feasibility.contract";

const mockCreatePasswordKdfPort = jest.mocked(createPasswordKdfPort);
const mockCreatePasswordKdfCalibrationPort = jest.mocked(
  createPasswordKdfCalibrationPort,
);

describe("Argon2 feasibility contract", () => {
  it("collects the requested physical calibration sample count", async () => {
    let durationMs = 300;
    mockCreatePasswordKdfPort.mockReturnValue({
      async derive() {
        return {
          bytes: Uint8Array.from(
            Buffer.from(
              "551d2b516a3d92963b2cd1e8fdc1725129e15824dfb6c8d9bb8a599ffcabfc1c",
              "hex",
            ),
          ),
          durationMs: 300,
          algorithm: "argon2id",
          provider: "Bouncy Castle",
          providerVersion: "1.85.2",
        };
      },
    });
    mockCreatePasswordKdfCalibrationPort.mockReturnValue({
      async derive() {
        return {
          bytes: Uint8Array.from(
            Buffer.from(
              "551d2b516a3d92963b2cd1e8fdc1725129e15824dfb6c8d9bb8a599ffcabfc1c",
              "hex",
            ),
          ),
          durationMs: durationMs += 1,
          algorithm: "argon2id",
          provider: "Bouncy Castle",
          providerVersion: "1.85.2",
        };
      },
    });

    await expect(performArgon2Feasibility({
      samples: 10,
      memoryKiB: 19_456,
      iterations: 2,
    })).resolves.toEqual(expect.objectContaining({
      status: "passed",
      samplesMs: [301, 302, 303, 304, 305, 306, 307, 308, 309, 310],
      parameters: {
        memoryKiB: 19_456,
        iterations: 2,
        parallelism: 1,
      },
    }));
  });

  it("preserves an allowlisted KDF error code without logging error details", async () => {
    mockCreatePasswordKdfPort.mockReturnValue({
      async derive() {
        throw new PasswordKdfError("argon2_invalid_password" as never);
      },
    });

    await expect(performArgon2Feasibility()).resolves.toEqual(
      expect.objectContaining({
        status: "failed",
        errorCode: "argon2_invalid_password",
      }),
    );
  });

  it("redacts unknown failures to the generic feasibility code", async () => {
    mockCreatePasswordKdfPort.mockReturnValue({
      async derive() {
        throw {
          code: "secret-native-detail",
          password: [1, 2, 3],
        };
      },
    });

    const result = await performArgon2Feasibility();

    expect(result.errorCode).toBe("argon2_feasibility_failed");
    expect(JSON.stringify(result)).not.toContain("secret-native-detail");
    expect(JSON.stringify(result)).not.toContain("password");
  });

  it("preserves only a safe Expo bridge code", async () => {
    mockCreatePasswordKdfPort.mockReturnValue({
      async derive() {
        throw new PasswordKdfError("argon2_derivation_failed" as never);
      },
    });
    const error = new PasswordKdfError("argon2_derivation_failed" as never);
    Object.defineProperty(error, "nativeCode", {
      value: "ERR_FUNCTION_CALL",
    });
    mockCreatePasswordKdfPort.mockReturnValue({
      async derive() {
        throw error;
      },
    });

    await expect(performArgon2Feasibility()).resolves.toEqual(
      expect.objectContaining({
        errorCode: "argon2_derivation_failed",
        nativeCode: "ERR_FUNCTION_CALL",
      }),
    );
  });
});

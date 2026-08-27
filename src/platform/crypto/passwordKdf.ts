import type {
  NativeArgon2Result,
} from "../../../modules/argon2-kdf/src";

function nativeDeriveArgon2id(
  request: Parameters<typeof import("../../../modules/argon2-kdf/src").deriveArgon2id>[0],
): ReturnType<typeof import("../../../modules/argon2-kdf/src").deriveArgon2id> {
  const {
    deriveArgon2id,
  } = require("../../../modules/argon2-kdf/src") as typeof import("../../../modules/argon2-kdf/src");
  return deriveArgon2id(request);
}

export const ARGON2ID_DESCRIPTOR_VERSION = 1 as const;
export const ARGON2ID_OUTPUT_LENGTH = 32 as const;
export const ARGON2ID_SALT_LENGTH = 16 as const;
export const ARGON2ID_MEMORY_KIB = 19_456 as const;
export const ARGON2ID_ITERATIONS = 2 as const;
export const ARGON2ID_PARALLELISM = 1 as const;
export const ARGON2ID_CALIBRATION_PARAMETERS = Object.freeze([
  Object.freeze({ memoryKiB: 19_456, iterations: 2, parallelism: 1 }),
  Object.freeze({ memoryKiB: 32_768, iterations: 2, parallelism: 1 }),
  Object.freeze({ memoryKiB: 65_536, iterations: 2, parallelism: 1 }),
  Object.freeze({ memoryKiB: 65_536, iterations: 3, parallelism: 1 }),
  Object.freeze({ memoryKiB: 65_536, iterations: 4, parallelism: 1 }),
] as const);

export type PasswordKdfDescriptor = Readonly<{
  version: typeof ARGON2ID_DESCRIPTOR_VERSION;
  algorithm: "argon2id";
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  salt: Uint8Array;
  outputLength: typeof ARGON2ID_OUTPUT_LENGTH;
}>;

export type PasswordKdfResult = Readonly<{
  bytes: Uint8Array;
  durationMs: number;
  algorithm: "argon2id";
  provider: "Bouncy Castle";
  providerVersion: "1.85.2";
}>;

export interface PasswordKdfPort {
  derive(
    password: Uint8Array,
    descriptor: PasswordKdfDescriptor,
  ): Promise<PasswordKdfResult>;
}

export class PasswordKdfError extends Error {
  readonly kind = "crypto" as const;
  readonly retryable = false;

  constructor(
    readonly code:
      | "argon2_invalid_algorithm"
      | "argon2_invalid_password"
      | "argon2_invalid_salt"
      | "argon2_invalid_version"
      | "argon2_native_generation_failed"
      | "argon2_native_input_failed"
      | "argon2_native_output_failed"
      | "argon2_native_parameters_failed"
      | "argon2_derivation_failed"
      | "argon2_native_result_invalid"
      | "argon2_parameters_out_of_bounds",
    readonly nativeCode?: string,
  ) {
    super(code);
    this.name = "PasswordKdfError";
  }
}

function validateDescriptor(
  descriptor: PasswordKdfDescriptor,
  calibration: boolean,
): void {
  if (descriptor.version !== ARGON2ID_DESCRIPTOR_VERSION) {
    throw new PasswordKdfError("argon2_invalid_version");
  }
  if (descriptor.algorithm !== "argon2id") {
    throw new PasswordKdfError("argon2_invalid_algorithm");
  }
  if (descriptor.salt.byteLength !== ARGON2ID_SALT_LENGTH) {
    throw new PasswordKdfError("argon2_invalid_salt");
  }
  const parametersAllowed = calibration
    ? ARGON2ID_CALIBRATION_PARAMETERS.some((parameters) => (
        descriptor.memoryKiB === parameters.memoryKiB
        && descriptor.iterations === parameters.iterations
        && descriptor.parallelism === parameters.parallelism
      ))
    : descriptor.memoryKiB === ARGON2ID_MEMORY_KIB
      && descriptor.iterations === ARGON2ID_ITERATIONS
      && descriptor.parallelism === ARGON2ID_PARALLELISM;
  if (!parametersAllowed || descriptor.outputLength !== ARGON2ID_OUTPUT_LENGTH) {
    throw new PasswordKdfError("argon2_parameters_out_of_bounds");
  }
}

function validateNativeResult(result: NativeArgon2Result): void {
  if (
    result.version !== ARGON2ID_DESCRIPTOR_VERSION
    || result.algorithm !== "argon2id"
    || result.provider !== "Bouncy Castle"
    || result.providerVersion !== "1.85.2"
    || !Number.isSafeInteger(result.durationMs)
    || result.durationMs < 0
    || !(result.output instanceof ArrayBuffer)
    || result.output.byteLength !== ARGON2ID_OUTPUT_LENGTH
  ) {
    throw new PasswordKdfError("argon2_native_result_invalid");
  }
}

function mapNativeError(error: unknown): PasswordKdfError {
  const rawCode = typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
    ? error.code
    : "";
  const code = rawCode.replace(/^ERR_/u, "").toLowerCase();
  const allowedCodes: ReadonlySet<PasswordKdfError["code"]> = new Set([
    "argon2_derivation_failed",
    "argon2_invalid_password",
    "argon2_invalid_salt",
    "argon2_invalid_version",
    "argon2_native_generation_failed",
    "argon2_native_input_failed",
    "argon2_native_output_failed",
    "argon2_native_parameters_failed",
    "argon2_parameters_out_of_bounds",
  ]);
  if (allowedCodes.has(code as PasswordKdfError["code"])) {
    return new PasswordKdfError(code as PasswordKdfError["code"]);
  }
  const nativeCode = /^ERR_[A-Z0-9_]{1,60}$/u.test(rawCode)
    ? rawCode
    : undefined;
  return new PasswordKdfError("argon2_derivation_failed", nativeCode);
}

function createPort(calibration: boolean): PasswordKdfPort {
  return Object.freeze({
    async derive(
      password: Uint8Array,
      descriptor: PasswordKdfDescriptor,
    ): Promise<PasswordKdfResult> {
      validateDescriptor(descriptor, calibration);
      if (password.byteLength < 1 || password.byteLength > 1_024) {
        throw new PasswordKdfError("argon2_invalid_password");
      }

      const ownedPassword = password.slice();
      const ownedSalt = descriptor.salt.slice();
      let nativeResult: NativeArgon2Result | undefined;
      let nativeOutput: Uint8Array | undefined;
      try {
        nativeResult = await nativeDeriveArgon2id({
          version: ARGON2ID_DESCRIPTOR_VERSION,
          password: ownedPassword,
          salt: ownedSalt,
          memoryKiB: descriptor.memoryKiB,
          iterations: descriptor.iterations,
          parallelism: descriptor.parallelism,
          outputLength: ARGON2ID_OUTPUT_LENGTH,
        });
        validateNativeResult(nativeResult);
        nativeOutput = new Uint8Array(nativeResult.output);
        return {
          bytes: nativeOutput.slice(),
          durationMs: nativeResult.durationMs,
          algorithm: nativeResult.algorithm,
          provider: nativeResult.provider,
          providerVersion: nativeResult.providerVersion,
        };
      } catch (error) {
        if (error instanceof PasswordKdfError) {
          throw error;
        }
        throw mapNativeError(error);
      } finally {
        ownedPassword.fill(0);
        ownedSalt.fill(0);
        nativeOutput?.fill(0);
      }
    },
  });
}

export function createPasswordKdfPort(): PasswordKdfPort {
  return createPort(false);
}

export function createPasswordKdfCalibrationPort(): PasswordKdfPort {
  return createPort(true);
}

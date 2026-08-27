import {
  ARGON2ID_ITERATIONS,
  ARGON2ID_MEMORY_KIB,
  ARGON2ID_OUTPUT_LENGTH,
  ARGON2ID_PARALLELISM,
  ARGON2ID_SALT_LENGTH,
  PasswordKdfError,
  createPasswordKdfCalibrationPort,
  createPasswordKdfPort,
} from "../../platform/crypto/passwordKdf";

const EXPECTED_KAT =
  "551d2b516a3d92963b2cd1e8fdc1725129e15824dfb6c8d9bb8a599ffcabfc1c";

export const ARGON2_FEASIBILITY_RESULT_MARKER =
  "GYM_TRACKER_ARGON2_FEASIBILITY_RESULT:" as const;

export type Argon2FeasibilityResult = Readonly<{
  schemaVersion: 1;
  status: "passed" | "failed";
  katId: "owasp-floor-bc-1.85.2-v1";
  katPassed: boolean;
  responsive: boolean;
  samplesMs: readonly number[];
  provider: "Bouncy Castle";
  providerVersion: "1.85.2";
  parameters: Readonly<{
    memoryKiB: number;
    iterations: number;
    parallelism: number;
  }>;
  errorCode?: string;
  nativeCode?: string;
}>;

export type Argon2FeasibilityOptions = Readonly<{
  samples?: number;
  memoryKiB?: number;
  iterations?: number;
}>;

function hex(bytes: Uint8Array): string {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function performArgon2Feasibility(
  options: Argon2FeasibilityOptions = {},
): Promise<Argon2FeasibilityResult> {
  const sampleCount = options.samples ?? 3;
  const memoryKiB = options.memoryKiB ?? ARGON2ID_MEMORY_KIB;
  const iterations = options.iterations ?? ARGON2ID_ITERATIONS;
  const calibration = sampleCount !== 3
    || memoryKiB !== ARGON2ID_MEMORY_KIB
    || iterations !== ARGON2ID_ITERATIONS;
  const timingPort = calibration
    ? createPasswordKdfCalibrationPort()
    : createPasswordKdfPort();
  const password = new Uint8Array(32).fill(1);
  const salt = new Uint8Array(ARGON2ID_SALT_LENGTH).fill(2);
  const samplesMs: number[] = [];
  let interactionProbeFired = false;
  const interactionProbe = new Promise<void>((resolve) => {
    setTimeout(() => {
      interactionProbeFired = true;
      resolve();
    }, 0);
  });

  try {
    const katResult = await createPasswordKdfPort().derive(password, {
      version: 1,
      algorithm: "argon2id",
      memoryKiB: ARGON2ID_MEMORY_KIB,
      iterations: ARGON2ID_ITERATIONS,
      parallelism: ARGON2ID_PARALLELISM,
      salt,
      outputLength: ARGON2ID_OUTPUT_LENGTH,
    });
    const katPassed = hex(katResult.bytes) === EXPECTED_KAT;
    katResult.bytes.fill(0);
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const result = await timingPort.derive(password, {
        version: 1,
        algorithm: "argon2id",
        memoryKiB,
        iterations,
        parallelism: ARGON2ID_PARALLELISM,
        salt,
        outputLength: ARGON2ID_OUTPUT_LENGTH,
      });
      samplesMs.push(result.durationMs);
      result.bytes.fill(0);
    }
    await interactionProbe;

    return {
      schemaVersion: 1,
      status: katPassed && interactionProbeFired ? "passed" : "failed",
      katId: "owasp-floor-bc-1.85.2-v1",
      katPassed,
      responsive: interactionProbeFired,
      samplesMs,
      provider: "Bouncy Castle",
      providerVersion: "1.85.2",
      parameters: {
        memoryKiB,
        iterations,
        parallelism: ARGON2ID_PARALLELISM,
      },
    };
  } catch (error) {
    await interactionProbe;
    return {
      schemaVersion: 1,
      status: "failed",
      katId: "owasp-floor-bc-1.85.2-v1",
      katPassed: false,
      responsive: interactionProbeFired,
      samplesMs,
      provider: "Bouncy Castle",
      providerVersion: "1.85.2",
      parameters: {
        memoryKiB,
        iterations,
        parallelism: ARGON2ID_PARALLELISM,
      },
      ...(error instanceof PasswordKdfError
        ? {
            errorCode: error.code,
            ...(error.nativeCode === undefined
              ? {}
              : { nativeCode: error.nativeCode }),
          }
        : { errorCode: "argon2_feasibility_failed" }),
    };
  } finally {
    password.fill(0);
    salt.fill(0);
  }
}

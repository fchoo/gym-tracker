import { requireNativeModule } from "expo-modules-core";

export const ARGON2_KDF_CONTRACT_VERSION = 1 as const;

export type NativeArgon2Request = Readonly<{
  version: typeof ARGON2_KDF_CONTRACT_VERSION;
  password: Uint8Array;
  salt: Uint8Array;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  outputLength: number;
}>;

export type NativeArgon2Result = Readonly<{
  version: typeof ARGON2_KDF_CONTRACT_VERSION;
  algorithm: "argon2id";
  provider: "Bouncy Castle";
  providerVersion: "1.85.2";
  durationMs: number;
  output: ArrayBuffer;
}>;

type Argon2KdfNativeModule = Readonly<{
  derive(
    version: NativeArgon2Request["version"],
    password: NativeArgon2Request["password"],
    salt: NativeArgon2Request["salt"],
    memoryKiB: NativeArgon2Request["memoryKiB"],
    iterations: NativeArgon2Request["iterations"],
    parallelism: NativeArgon2Request["parallelism"],
    outputLength: NativeArgon2Request["outputLength"],
  ): Promise<NativeArgon2Result>;
}>;

const nativeModule = requireNativeModule<Argon2KdfNativeModule>("Argon2Kdf");

export function deriveArgon2id(
  request: NativeArgon2Request,
): Promise<NativeArgon2Result> {
  return nativeModule.derive(
    request.version,
    request.password,
    request.salt,
    request.memoryKiB,
    request.iterations,
    request.parallelism,
    request.outputLength,
  );
}

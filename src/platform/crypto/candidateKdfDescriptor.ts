export const CANDIDATE_KDF_DESCRIPTOR_VERSION = 2 as const;

export type CandidateKdfFailureCode =
  | "argon2_autolink_failed"
  | "argon2_derivation_failed"
  | "argon2_feasibility_failed"
  | "argon2_invalid_algorithm"
  | "argon2_invalid_password"
  | "argon2_invalid_salt"
  | "argon2_invalid_version"
  | "argon2_kat_failed"
  | "argon2_native_generation_failed"
  | "argon2_native_input_failed"
  | "argon2_native_output_failed"
  | "argon2_native_parameters_failed"
  | "argon2_native_result_invalid"
  | "argon2_packaging_failed"
  | "argon2_parameters_out_of_bounds"
  | "argon2_physical_timing_out_of_range"
  | "argon2_responsiveness_failed";

export type CandidateKdfTiming = Readonly<{
  sampleCount: number;
  samplesMs: readonly number[];
  minMs: number | null;
  medianMs: number | null;
  maxMs: number | null;
}>;

export type CandidateKdfParameters = Readonly<{
  memoryKiB: number;
  iterations: number;
  parallelism: 1;
}>;

export type CandidateKdfPhysicalDevice = Readonly<{
  serialHash: string;
  api: number;
  abi: string;
  model: string;
  androidRelease: string;
  freeMemoryBytes: number;
}>;

export type CandidateKdfDescriptor = Readonly<{
  schemaVersion: typeof CANDIDATE_KDF_DESCRIPTOR_VERSION;
  status: "passed" | "blocked";
  failureCode: CandidateKdfFailureCode | null;
  baseHead: string;
  sourceTreeSha256: string;
  apk: Readonly<{
    path: string;
    sha256: string;
    sizeBytes: number;
  }>;
  package: string;
  algorithm: "argon2id";
  provider: Readonly<{
    name: "Bouncy Castle";
    version: "1.85.2";
    mavenCoordinate: "org.bouncycastle:bcprov-jdk18on:1.85.2";
  }>;
  parameterBounds: Readonly<{
    memoryKiB: Readonly<{ min: number; max: number }>;
    iterations: Readonly<{ min: number; max: number }>;
    parallelism: Readonly<{ min: number; max: number }>;
    saltBytes: Readonly<{ min: number; max: number }>;
    outputBytes: Readonly<{ min: number; max: number }>;
  }>;
  kat: Readonly<{
    id: "owasp-floor-bc-1.85.2-v1";
    passed: boolean;
  }>;
  feasibilityTiming: CandidateKdfTiming;
  device: Readonly<{
    kind: "emulator";
    serial: string;
    api: number;
    abi: string;
    model: string;
    androidRelease: string;
  }>;
  cng: Readonly<{
    cleanPrebuilds: 2;
    autolinked: boolean;
  }>;
  pageSize: Readonly<{
    alignmentKiB: 16;
    zipalignVerified: boolean;
    packagedLibrariesInspected: boolean;
  }>;
  physicalDeviceCalibration: Readonly<{
    status: "deferred-to-01-10" | "passed" | "blocked";
    requiredSamples: 10;
    targetMinMs: 250;
    targetMaxMs: 750;
    parameters: CandidateKdfParameters | null;
    timing: CandidateKdfTiming | null;
    device: CandidateKdfPhysicalDevice | null;
  }>;
  generatedAt: string;
}>;

export class CandidateKdfDescriptorError extends Error {
  readonly code = "candidate_kdf_descriptor_invalid";

  constructor() {
    super("candidate_kdf_descriptor_invalid");
    this.name = "CandidateKdfDescriptorError";
  }
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: JsonObject,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === expectedKeys.length
    && expectedKeys
      .slice()
      .sort()
      .every((key, index) => actualKeys[index] === key);
}

function isDigest(value: unknown, length: number): value is string {
  return typeof value === "string"
    && new RegExp(`^[0-9a-f]{${length}}$`, "u").test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isExactRange(
  value: unknown,
  expected: number,
): value is Readonly<{ min: number; max: number }> {
  return isObject(value)
    && hasExactKeys(value, ["max", "min"])
    && value.min === expected
    && value.max === expected;
}

function isFiniteTimingSamples(value: unknown): value is readonly number[] {
  return Array.isArray(value)
    && value.length <= 10
    && value.every((sample) => (
      Number.isSafeInteger(sample) && sample >= 0 && sample <= 60_000
    ));
}

function isFailureCode(value: unknown): value is CandidateKdfFailureCode {
  return typeof value === "string" && new Set<CandidateKdfFailureCode>([
    "argon2_autolink_failed",
    "argon2_derivation_failed",
    "argon2_feasibility_failed",
    "argon2_invalid_algorithm",
    "argon2_invalid_password",
    "argon2_invalid_salt",
    "argon2_invalid_version",
    "argon2_kat_failed",
    "argon2_native_generation_failed",
    "argon2_native_input_failed",
    "argon2_native_output_failed",
    "argon2_native_parameters_failed",
    "argon2_native_result_invalid",
    "argon2_packaging_failed",
    "argon2_parameters_out_of_bounds",
    "argon2_physical_timing_out_of_range",
    "argon2_responsiveness_failed",
  ]).has(value as CandidateKdfFailureCode);
}

function isTiming(
  value: unknown,
  requiredSamples?: number,
  allowIncomplete = false,
): value is CandidateKdfTiming {
  if (
    !isObject(value)
    || !hasExactKeys(value, [
      "maxMs",
      "medianMs",
      "minMs",
      "sampleCount",
      "samplesMs",
    ])
    || !isFiniteTimingSamples(value.samplesMs)
    || value.sampleCount !== value.samplesMs.length
    || (
      allowIncomplete
        ? value.samplesMs.length > requiredSamples!
        : requiredSamples === undefined
          ? value.samplesMs.length < 3
          : value.samplesMs.length !== requiredSamples
    )
  ) {
    return false;
  }
  if (value.samplesMs.length === 0) {
    return value.minMs === null
      && value.medianMs === null
      && value.maxMs === null;
  }
  const sorted = [...value.samplesMs].sort((left, right) => left - right);
  return value.minMs === sorted[0]
    && value.maxMs === sorted.at(-1)
    && value.medianMs === sorted[Math.floor(sorted.length / 2)];
}

function isCalibrationParameters(
  value: unknown,
): value is CandidateKdfParameters {
  if (
    !isObject(value)
    || !hasExactKeys(value, ["iterations", "memoryKiB", "parallelism"])
    || value.parallelism !== 1
  ) {
    return false;
  }
  return new Set([
    "19456:2",
    "32768:2",
    "65536:2",
    "65536:3",
    "65536:4",
  ]).has(`${String(value.memoryKiB)}:${String(value.iterations)}`);
}

function isPhysicalDevice(
  value: unknown,
): value is CandidateKdfPhysicalDevice {
  return isObject(value)
    && hasExactKeys(value, [
      "abi",
      "androidRelease",
      "api",
      "freeMemoryBytes",
      "model",
      "serialHash",
    ])
    && isDigest(value.serialHash, 64)
    && isPositiveInteger(value.api)
    && value.api >= 24
    && typeof value.abi === "string"
    && typeof value.model === "string"
    && typeof value.androidRelease === "string"
    && isPositiveInteger(value.freeMemoryBytes);
}

function isPhysicalTimingWithinTarget(value: JsonObject): boolean {
  if (
    value.status !== "passed"
    || value.targetMinMs !== 250
    || value.targetMaxMs !== 750
    || !isTiming(value.timing, 10)
  ) {
    return value.status !== "passed";
  }
  return value.timing.medianMs !== null
    && value.timing.medianMs >= value.targetMinMs
    && value.timing.medianMs <= value.targetMaxMs;
}

function isCandidateKdfDescriptor(
  value: unknown,
): value is CandidateKdfDescriptor {
  if (!isObject(value) || !hasExactKeys(value, [
    "algorithm",
    "apk",
    "baseHead",
    "cng",
    "device",
    "feasibilityTiming",
    "failureCode",
    "generatedAt",
    "kat",
    "package",
    "pageSize",
    "parameterBounds",
    "physicalDeviceCalibration",
    "provider",
    "schemaVersion",
    "sourceTreeSha256",
    "status",
  ])) {
    return false;
  }
  if (
    value.schemaVersion !== CANDIDATE_KDF_DESCRIPTOR_VERSION
    || (value.status !== "passed" && value.status !== "blocked")
    || (
      value.status === "passed"
        ? value.failureCode !== null
        : !isFailureCode(value.failureCode)
    )
    || !isDigest(value.baseHead, 40)
    || !isDigest(value.sourceTreeSha256, 64)
    || value.algorithm !== "argon2id"
    || typeof value.package !== "string"
    || value.package.length < 3
    || value.package.length > 160
    || !isIsoTimestamp(value.generatedAt)
  ) {
    return false;
  }

  const apk = value.apk;
  const provider = value.provider;
  const bounds = value.parameterBounds;
  const kat = value.kat;
  const timing = value.feasibilityTiming;
  const device = value.device;
  const cng = value.cng;
  const pageSize = value.pageSize;
  const physical = value.physicalDeviceCalibration;
  if (
    !isObject(apk)
    || !hasExactKeys(apk, ["path", "sha256", "sizeBytes"])
    || typeof apk.path !== "string"
    || apk.path.length < 1
    || apk.path.length > 512
    || !isDigest(apk.sha256, 64)
    || !isPositiveInteger(apk.sizeBytes)
    || !isObject(provider)
    || !hasExactKeys(provider, ["mavenCoordinate", "name", "version"])
    || provider.name !== "Bouncy Castle"
    || provider.version !== "1.85.2"
    || provider.mavenCoordinate
      !== "org.bouncycastle:bcprov-jdk18on:1.85.2"
    || !isObject(bounds)
    || !hasExactKeys(bounds, [
      "iterations",
      "memoryKiB",
      "outputBytes",
      "parallelism",
      "saltBytes",
    ])
    || !isExactRange(bounds.memoryKiB, 19_456)
    || !isExactRange(bounds.iterations, 2)
    || !isExactRange(bounds.parallelism, 1)
    || !isExactRange(bounds.saltBytes, 16)
    || !isExactRange(bounds.outputBytes, 32)
    || !isObject(kat)
    || !hasExactKeys(kat, ["id", "passed"])
    || kat.id !== "owasp-floor-bc-1.85.2-v1"
    || typeof kat.passed !== "boolean"
    || (value.status === "passed" && kat.passed !== true)
    || (
      value.status === "passed"
        ? !isTiming(timing)
        : !isTiming(timing, 10, true)
    )
    || !isObject(device)
    || !hasExactKeys(device, [
      "abi",
      "androidRelease",
      "api",
      "kind",
      "model",
      "serial",
    ])
    || device.kind !== "emulator"
    || typeof device.serial !== "string"
    || !isPositiveInteger(device.api)
    || device.api < 24
    || typeof device.abi !== "string"
    || typeof device.model !== "string"
    || typeof device.androidRelease !== "string"
    || !isObject(cng)
    || !hasExactKeys(cng, ["autolinked", "cleanPrebuilds"])
    || cng.cleanPrebuilds !== 2
    || typeof cng.autolinked !== "boolean"
    || (value.status === "passed" && cng.autolinked !== true)
    || !isObject(pageSize)
    || !hasExactKeys(pageSize, [
      "alignmentKiB",
      "packagedLibrariesInspected",
      "zipalignVerified",
    ])
    || pageSize.alignmentKiB !== 16
    || pageSize.zipalignVerified !== true
    || typeof pageSize.packagedLibrariesInspected !== "boolean"
    || (
      value.status === "passed"
      && pageSize.packagedLibrariesInspected !== true
    )
    || !isObject(physical)
    || !hasExactKeys(physical, [
      "device",
      "parameters",
      "requiredSamples",
      "status",
      "targetMaxMs",
      "targetMinMs",
      "timing",
    ])
    || ![
      "blocked",
      "deferred-to-01-10",
      "passed",
    ].includes(String(physical.status))
    || physical.requiredSamples !== 10
    || physical.targetMinMs !== 250
    || physical.targetMaxMs !== 750
    || (
      physical.status === "deferred-to-01-10"
        ? physical.parameters !== null
          || physical.timing !== null
          || physical.device !== null
        : physical.status === "passed"
          ? !isCalibrationParameters(physical.parameters)
            || !isTiming(physical.timing, 10)
            || !isPhysicalDevice(physical.device)
          : !isCalibrationParameters(physical.parameters)
            || !isTiming(physical.timing, 10, true)
            || !isPhysicalDevice(physical.device)
    )
    || !isPhysicalTimingWithinTarget(physical)
    || (
      physical.status === "passed"
      && value.status !== "passed"
    )
    || (
      physical.status === "blocked"
      && value.status !== "blocked"
    )
  ) {
    return false;
  }
  return true;
}

export function parseCandidateKdfDescriptor(
  value: unknown,
): CandidateKdfDescriptor {
  if (!isCandidateKdfDescriptor(value)) {
    throw new CandidateKdfDescriptorError();
  }
  return value;
}

export function assertCandidateKdfDescriptorMatchesBuild(
  descriptor: CandidateKdfDescriptor,
  buildManifest: unknown,
): void {
  if (!isObject(buildManifest)) {
    throw new CandidateKdfDescriptorError();
  }
  const apk = buildManifest.apk;
  const device = buildManifest.device;
  if (
    buildManifest.schema_version !== 1
    || (
      buildManifest.suite !== "argon2"
      && buildManifest.suite !== "phase1"
    )
    || buildManifest.profile !== "development-test"
    || buildManifest.build_variant !== "release"
    || !isObject(buildManifest.js_bundle)
    || buildManifest.js_bundle.embedded !== true
    || buildManifest.base_head !== descriptor.baseHead
    || buildManifest.source_tree_sha256 !== descriptor.sourceTreeSha256
    || buildManifest.package !== descriptor.package
    || !isObject(apk)
    || apk.path !== descriptor.apk.path
    || apk.sha256 !== descriptor.apk.sha256
    || apk.size_bytes !== descriptor.apk.sizeBytes
    || apk.page_alignment_kib !== descriptor.pageSize.alignmentKiB
    || apk.page_alignment_verified !== descriptor.pageSize.zipalignVerified
    || !isObject(device)
    || device.api !== descriptor.device.api
    || device.abi !== descriptor.device.abi
    || device.model !== descriptor.device.model
    || device.android_release !== descriptor.device.androidRelease
    || device.serial !== descriptor.device.serial
  ) {
    throw new CandidateKdfDescriptorError();
  }
}

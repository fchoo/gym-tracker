import { requireNativeModule } from "expo-modules-core";

export type GarminRuntimeInfo = Readonly<{
  schemaVersion: 1;
  pythonVersion: "3.13";
  clientVersion: "0.3.17";
  clientCommit: "218e72ca5459e014435fc2d94fd18bd601fa0c14";
  abi: "arm64-v8a";
  capabilities: readonly ["runtimeInfo"];
  benchmark: Readonly<{
    processId: number;
    installedApkSizeBytes: number;
    garminModuleSizeBytes: number;
    memoryRssBytes?: number;
    pythonStartupKind: "cold" | "warm";
    pythonStartupDurationMs: number;
    observedAtMonotonicMs: number;
  }>;
}>;

export type GarminConnectNativeModule = Readonly<{
  runtimeInfo(): Promise<unknown>;
  benchmarkDeterministicJson?(input: Readonly<{ payloadJson: string }>): Promise<unknown>;
  /** DEVTEST-only, nonce/embedded-config bound. Mandatory for readiness, optional for old native builds. */
  diagnoseTransportReadiness?(nonce: string): Promise<unknown>;
  connectionState(): Promise<unknown>;
  login(input: Readonly<{ email: string; password: string }>): Promise<unknown>;
  resumeMfa(input: Readonly<{ challengeHandle: string; code: string }>): Promise<unknown>;
  restoreSession(): Promise<unknown>;
  forceRefreshForTest(): Promise<unknown>;
  sessionRecordState(): Promise<unknown>;
  consumeV12EvidenceArm(input: Readonly<{
    nonce: string;
    phase: "preflight" | "execute";
  }>): Promise<unknown>;
  runV12StoredSessionLifecycle(): Promise<unknown>;
  completeV12EvidenceArm(): Promise<unknown>;
  logout(): Promise<unknown>;
  getActivities(input: Readonly<{ start: number; limit: number; activityType: "running" }>): Promise<unknown>;
  getActivity(input: Readonly<{ externalActivityId: string }>): Promise<unknown>;
  getActivitySplits(input: Readonly<{ externalActivityId: string }>): Promise<unknown>;
  getActivityDetails(input: Readonly<{
    externalActivityId: string;
    maxchart: 2000;
    maxpoly: 4000;
  }>): Promise<unknown>;
  runAdversarialSuite(input: Readonly<{
    confirmation: string;
    deviceIdentitySha256: string;
  }>): Promise<unknown>;
}>;

export function getGarminConnectNativeModule(): GarminConnectNativeModule {
  return requireNativeModule<GarminConnectNativeModule>("GarminConnect");
}

function isRuntimeInfo(value: unknown): value is GarminRuntimeInfo {
  if (value === null || typeof value !== "object") return false;
  const info = value as Record<string, unknown>;
  const benchmark = info.benchmark;
  if (benchmark === null || typeof benchmark !== "object" || Array.isArray(benchmark)) {
    return false;
  }
  const facts = benchmark as Record<string, unknown>;
  const benchmarkKeys = Object.keys(facts);
  const allowedBenchmarkKeys = new Set([
    "processId",
    "installedApkSizeBytes",
    "garminModuleSizeBytes",
    "memoryRssBytes",
    "pythonStartupKind",
    "pythonStartupDurationMs",
    "observedAtMonotonicMs",
  ]);
  const memoryRssBytes = facts.memoryRssBytes;
  const benchmarkValid = benchmarkKeys.length >= 6
    && benchmarkKeys.length <= allowedBenchmarkKeys.size
    && benchmarkKeys.every((key) => allowedBenchmarkKeys.has(key))
    && Number.isSafeInteger(facts.processId)
    && (facts.processId as number) > 0
    && Number.isSafeInteger(facts.installedApkSizeBytes)
    && (facts.installedApkSizeBytes as number) > 0
    && Number.isSafeInteger(facts.garminModuleSizeBytes)
    && (facts.garminModuleSizeBytes as number) > 0
    && (
      memoryRssBytes === undefined
      || (Number.isSafeInteger(memoryRssBytes) && (memoryRssBytes as number) > 0)
    )
    && (facts.pythonStartupKind === "cold" || facts.pythonStartupKind === "warm")
    && Number.isFinite(facts.pythonStartupDurationMs)
    && (facts.pythonStartupDurationMs as number) >= 0
    && Number.isFinite(facts.observedAtMonotonicMs)
    && (facts.observedAtMonotonicMs as number) >= 0;
  return info.schemaVersion === 1
    && info.pythonVersion === "3.13"
    && info.clientVersion === "0.3.17"
    && info.clientCommit === "218e72ca5459e014435fc2d94fd18bd601fa0c14"
    && info.abi === "arm64-v8a"
    && Array.isArray(info.capabilities)
    && info.capabilities.length === 1
    && info.capabilities[0] === "runtimeInfo"
    && benchmarkValid;
}

export async function readGarminRuntimeInfo(
  nativeModule: GarminConnectNativeModule = getGarminConnectNativeModule(),
): Promise<GarminRuntimeInfo> {
  const info = await nativeModule.runtimeInfo();
  if (!isRuntimeInfo(info)) throw new Error("garmin_runtime_schema_invalid");
  return info;
}

export type GarminDeterministicJsonBenchmark = Readonly<{
  schemaVersion: 1;
  transport: "chaquopy-python-garminconnect-0.3.17";
  payloadSha256: string;
  normalizedJson: string;
  outputSha256: string;
}>;

export async function benchmarkGarminDeterministicJson(
  payloadJson: string,
  nativeModule: GarminConnectNativeModule = getGarminConnectNativeModule(),
): Promise<GarminDeterministicJsonBenchmark> {
  if (payloadJson.length === 0 || payloadJson.length > 1_000_000) throw new Error("garmin_benchmark_payload_invalid");
  if (nativeModule.benchmarkDeterministicJson === undefined) throw new Error("garmin_benchmark_native_missing");
  const value = await nativeModule.benchmarkDeterministicJson({ payloadJson });
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("garmin_benchmark_schema_invalid");
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== 5 || result.schemaVersion !== 1 || result.transport !== "chaquopy-python-garminconnect-0.3.17"
    || typeof result.payloadSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(result.payloadSha256)
    || typeof result.normalizedJson !== "string" || result.normalizedJson.length === 0
    || typeof result.outputSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(result.outputSha256)) throw new Error("garmin_benchmark_schema_invalid");
  return Object.freeze(result as GarminDeterministicJsonBenchmark);
}

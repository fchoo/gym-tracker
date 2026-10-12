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
  connectionState(): Promise<unknown>;
  login(input: Readonly<{ email: string; password: string }>): Promise<unknown>;
  resumeMfa(input: Readonly<{ challengeHandle: string; code: string }>): Promise<unknown>;
  restoreSession(): Promise<unknown>;
  forceRefreshForTest(): Promise<unknown>;
  sessionRecordState(): Promise<unknown>;
  logout(): Promise<unknown>;
  getActivities(input: Readonly<{ start: number; limit: number; activityType: "running" }>): Promise<unknown>;
  getActivity(input: Readonly<{ externalActivityId: string }>): Promise<unknown>;
  getActivitySplits(input: Readonly<{ externalActivityId: string }>): Promise<unknown>;
  getActivityDetails(input: Readonly<{
    externalActivityId: string;
    maxchart: 2000;
    maxpoly: 4000;
  }>): Promise<unknown>;
  runAdversarialSuite(input: Readonly<{ confirmation: string }>): Promise<unknown>;
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

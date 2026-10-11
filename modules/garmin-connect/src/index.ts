import { requireNativeModule } from "expo-modules-core";

export type GarminRuntimeInfo = Readonly<{
  schemaVersion: 1;
  pythonVersion: "3.13";
  clientVersion: "0.3.17";
  clientCommit: "218e72ca5459e014435fc2d94fd18bd601fa0c14";
  abi: "arm64-v8a";
  capabilities: readonly ["runtimeInfo"];
}>;

type GarminConnectNativeModule = Readonly<{
  runtimeInfo(): Promise<unknown>;
}>;

function isRuntimeInfo(value: unknown): value is GarminRuntimeInfo {
  if (value === null || typeof value !== "object") return false;
  const info = value as Record<string, unknown>;
  return info.schemaVersion === 1
    && info.pythonVersion === "3.13"
    && info.clientVersion === "0.3.17"
    && info.clientCommit === "218e72ca5459e014435fc2d94fd18bd601fa0c14"
    && info.abi === "arm64-v8a"
    && Array.isArray(info.capabilities)
    && info.capabilities.length === 1
    && info.capabilities[0] === "runtimeInfo";
}

export async function readGarminRuntimeInfo(
  nativeModule: GarminConnectNativeModule = requireNativeModule<GarminConnectNativeModule>("GarminConnect"),
): Promise<GarminRuntimeInfo> {
  const info = await nativeModule.runtimeInfo();
  if (!isRuntimeInfo(info)) throw new Error("garmin_runtime_schema_invalid");
  return info;
}

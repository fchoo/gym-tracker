import { requireNativeModule } from "expo-modules-core";

export type NetworkClass = "wifi" | "cellular_or_metered" | "unavailable" | "unknown";

type NetworkClassifierNativeModule = Readonly<{
  current(): Promise<unknown>;
}>;

const NETWORK_CLASSES = new Set<NetworkClass>([
  "wifi",
  "cellular_or_metered",
  "unavailable",
  "unknown",
]);

export function normalizeNetworkClass(value: unknown): NetworkClass {
  return typeof value === "string" && NETWORK_CLASSES.has(value as NetworkClass)
    ? value as NetworkClass
    : "unknown";
}

export async function currentNetworkClass(
  bridge?: NetworkClassifierNativeModule,
): Promise<NetworkClass> {
  try {
    const native = bridge ?? requireNativeModule<NetworkClassifierNativeModule>("NetworkClassifier");
    return normalizeNetworkClass(await native.current());
  } catch {
    return "unknown";
  }
}

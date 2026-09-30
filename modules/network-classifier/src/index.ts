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

function requireNetworkClassifierModule(): NetworkClassifierNativeModule {
  const { requireNativeModule } = require("expo-modules-core") as typeof import("expo-modules-core");
  return requireNativeModule<NetworkClassifierNativeModule>("NetworkClassifier");
}

export function normalizeNetworkClass(value: unknown): NetworkClass {
  return typeof value === "string" && NETWORK_CLASSES.has(value as NetworkClass)
    ? value as NetworkClass
    : "unknown";
}

export async function currentNetworkClass(
  bridge?: NetworkClassifierNativeModule,
): Promise<NetworkClass> {
  try {
    const native = bridge ?? requireNetworkClassifierModule();
    return normalizeNetworkClass(await native.current());
  } catch {
    return "unknown";
  }
}

import { benchmarkGarminDeterministicJson, readGarminRuntimeInfo, type GarminConnectNativeModule } from "../../modules/garmin-connect/src";

export function garminBridgeDiagnosticEnabled(identity: Readonly<{ packageName: unknown; profile: unknown; enabled: unknown; suite: unknown }>, nonce: unknown): nonce is string {
  return identity.packageName === "com.fchoo.gymtracker.devtest" && identity.profile === "development-test"
    && identity.enabled === true && identity.suite === "v1.2-acceptance"
    && typeof nonce === "string" && /^[a-f0-9]{32}$/u.test(nonce);
}

/** Fixed, credential-free probe only. Never restores a session, logs payloads or contacts Garmin. */
export async function runGarminBridgeDiagnostic(native: GarminConnectNativeModule) {
  let stage: "runtime" | "connection" | "json" = "runtime";
  try {
    await readGarminRuntimeInfo(native);
    stage = "connection";
    const value = await native.connectionState();
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("rejected");
    const envelope = value as Record<string, unknown>;
    const data = envelope.data as Record<string, unknown> | undefined;
    if (envelope.status !== "ok" || data?.kind !== "disconnected") throw new Error("rejected");
    stage = "json";
    const json = await benchmarkGarminDeterministicJson('{"probe":1}', native);
    if (json.normalizedJson !== '{"probe":1}') throw new Error("rejected");
    return Object.freeze({ status: "passed" as const, stage: "complete" as const, code: "native_bridge_ready" as const });
  } catch {
    return Object.freeze({ status: "failed" as const, stage, code: "native_bridge_rejected" as const });
  }
}

import type { GarminConnectNativeModule } from "../../modules/garmin-connect/src";

export function garminBridgeDiagnosticEnabled(identity: Readonly<{ packageName: unknown; profile: unknown; enabled: unknown; suite: unknown }>, nonce: unknown): nonce is string {
  return identity.packageName === "com.fchoo.gymtracker.devtest" && identity.profile === "development-test"
    && identity.enabled === true && identity.suite === "v1.2-acceptance"
    && typeof nonce === "string" && /^[a-f0-9]{32}$/u.test(nonce);
}

const transportStages = new Set(["client_import", "cffi_backend", "curl_import", "curl_session", "requests_import", "ua_import", "certifi_import", "ssl_context", "client_factory", "session_close"]);
const exceptionCodes = new Set(["ImportError", "ModuleNotFoundError", "OSError", "RuntimeError", "TypeError", "ValueError", "AttributeError", "Exception"]);

/** Inert readiness only: no HTTP, credentials, session restore, auth or handshake claim. */
export async function runGarminBridgeDiagnostic(native: GarminConnectNativeModule, nonce: string) {
  try {
    if (typeof nonce !== "string" || !/^[a-f0-9]{32}$/u.test(nonce) || typeof native.diagnoseTransportReadiness !== "function") throw new Error("rejected");
    const readiness = await native.diagnoseTransportReadiness(nonce);
    if (readiness === null || typeof readiness !== "object" || Array.isArray(readiness)) throw new Error("rejected");
    const result = readiness as Record<string, unknown>;
    if (Object.keys(result).sort().join(",") !== "code,stage,status") throw new Error("rejected");
    const { status, stage: transportStage, code } = result;
    if (status === "passed" && transportStage === "complete" && code === "actual_transport_ready") {
      return Object.freeze({ status: "passed" as const, stage: "complete", code: "actual_transport_ready" });
    }
    if (status === "failed" && typeof transportStage === "string" && typeof code === "string"
      && ((transportStages.has(transportStage) && exceptionCodes.has(code))
        || (transportStage === "native" && code === "native_bridge_rejected"))) {
      return Object.freeze({ status: "failed" as const, stage: transportStage, code });
    }
    throw new Error("rejected");
  } catch {
    return Object.freeze({ status: "failed" as const, stage: "transport", code: "native_bridge_rejected" as const });
  }
}

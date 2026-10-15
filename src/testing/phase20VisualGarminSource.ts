import type {
  GarminActivitySourcePort,
  GarminSourceEnvelope,
} from "../domains/activities/garminActivitySourcePort";
import { canonicalJson } from "../domains/activities/importContracts";
import type { Phase20VisualRequest } from "./phase20VisualRequest";
import { phase20VisualState } from "./phase20VisualStateRegistry";

const ACCOUNT = "phase20-visual-account";

async function sha256(value: string): Promise<string> {
  const { CryptoDigestAlgorithm, digestStringAsync } = require("expo-crypto") as typeof import("expo-crypto");
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
}

async function envelope(externalActivityId: string): Promise<GarminSourceEnvelope> {
  const treadmill = externalActivityId.includes("treadmill");
  const normalized = Object.freeze({
    version: 1 as const,
    started_at_ms: treadmill
      ? Date.parse("2026-10-10T10:34:00.000Z")
      : Date.parse("2026-10-03T23:12:00.000Z"),
    source_local_date_time: treadmill ? "2026-10-10T18:34:00" : "2026-10-04T07:12:00",
    source_time_zone: "Asia/Singapore",
    source_utc_offset_minutes: 480,
    sport: "running" as const,
    subtype: treadmill ? "treadmill" : "outdoor",
    distance_meters: treadmill ? 2_400 : 3_200,
    elapsed_ms: treadmill ? 691_000 : 1_122_000,
    timer_ms: treadmill ? 686_000 : 1_101_000,
    moving_ms: treadmill ? 683_000 : 1_101_000,
    average_heart_rate_bpm: treadmill ? 154 : 148,
    laps: [{ ordinal: 0, distance_meters: 1_000, elapsed_ms: treadmill ? 288_000 : 358_000, average_heart_rate_bpm: treadmill ? 152 : 146 }],
    ...(treadmill ? {} : { route: [{ latitude_e6: 1_290_000, longitude_e6: 103_850_000, elapsed_ms: 0 }, { latitude_e6: 1_291_000, longitude_e6: 103_851_000, elapsed_ms: 1_122_000 }] }),
  });
  return Object.freeze({
    version: 1,
    source_kind: "garmin_connect_account",
    account_namespace: ACCOUNT,
    external_activity_id: externalActivityId,
    normalization_version: 1,
    normalized_json_sha256: await sha256(canonicalJson({ normalization_version: 1, normalized })),
    raw_component_sha256: Object.freeze({ activity: await sha256(`${externalActivityId}:activity`), splits: await sha256(`${externalActivityId}:splits`), details: await sha256(`${externalActivityId}:details`) }),
    sample_fidelity: "source_laps",
    fidelity_by_channel: Object.freeze({ summary: "source_summary", laps: "source_laps", ...(treadmill ? {} : { route: "sampled" as const }), exact_effort_basis: "source_laps" }),
    normalized,
  });
}

export function createPhase20VisualGarminSource(
  request: Phase20VisualRequest,
): GarminActivitySourcePort {
  const ordinal = Number(request.state.slice(3));
  if (!Number.isSafeInteger(ordinal) || ordinal < 92 || ordinal > 107) {
    throw new Error("phase20_visual_garmin_state_invalid");
  }
  const scenario = phase20VisualState(request.state)?.name;
  if (scenario === undefined) throw new Error("phase20_visual_garmin_state_invalid");
  const initialConnection = ["garmin-disconnected", "garmin-consent", "garmin-file-import", "garmin-revoked"].includes(scenario)
      ? { kind: "disconnected" as const }
      : { kind: "connected" as const, account_namespace: ACCOUNT, generation: 1 };
  return Object.freeze({
    connectionState: async () => initialConnection,
    restoreSession: async () => initialConnection,
    login: async () => ({ kind: "connected" as const, account_namespace: ACCOUNT, generation: 1 }),
    resumeMfa: async () => ({ kind: "connected" as const, account_namespace: ACCOUNT, generation: 1 }),
    logout: async () => undefined,
    listRunningSummaries: async () => {
      if (scenario === "garmin-syncing") return new Promise<never>(() => undefined);
      if (scenario === "garmin-error") throw new Error("garmin_rate_limited");
      return Object.freeze({ items: Object.freeze([
        { account_namespace: ACCOUNT, external_activity_id: "phase20-outdoor-001" },
        { account_namespace: ACCOUNT, external_activity_id: "phase20-treadmill-001" },
      ]) });
    },
    readActivity: envelope,
  });
}

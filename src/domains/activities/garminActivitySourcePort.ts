import type { CanonicalGarminPayload } from "./importContracts";

export type GarminConnectionState =
  | Readonly<{ kind: "disconnected" }>
  | Readonly<{ kind: "connected"; account_namespace: string; generation: number }>
  | Readonly<{ kind: "mfa_required"; challenge_handle: string; generation: number }>;

export type GarminActivityDiscovery = Readonly<{
  account_namespace: string;
  external_activity_id: string;
}>;

/** The sole Phase 18-to-Phase 13 activity boundary.  It deliberately has no credential or URL fields. */
export type GarminActivitySourcePort = Readonly<{
  connectionState(): Promise<GarminConnectionState>;
  restoreSession(): Promise<GarminConnectionState>;
  login(input: Readonly<{ email: string; password: string }>): Promise<GarminConnectionState>;
  resumeMfa(input: Readonly<{ challenge_handle: string; code: string }>): Promise<GarminConnectionState>;
  logout(): Promise<void>;
  listRunningSummaries(input: Readonly<{ cursor?: string; limit: number }>): Promise<Readonly<{ items: readonly GarminActivityDiscovery[]; next_cursor?: string }>>;
  readActivity(external_activity_id: string): Promise<GarminSourceEnvelope>;
}>;

export type GarminSourceEnvelope = Readonly<{
  version: 1;
  source_kind: "garmin_connect_account";
  account_namespace: string;
  external_activity_id: string;
  normalization_version: number;
  normalized_json_sha256: string;
  raw_component_sha256: Readonly<{ activity: string; splits: string; details: string }>;
  sample_fidelity: "source_summary" | "source_laps" | "sampled";
  fidelity_by_channel?: Readonly<{
    summary: "source_summary";
    laps?: "source_laps";
    route?: "sampled";
    heart_rate_samples?: "sampled";
    exact_effort_basis: "source_summary" | "source_laps" | "sampled";
  }>;
  normalized: CanonicalGarminPayload;
}>;

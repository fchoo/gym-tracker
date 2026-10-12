import { getGarminConnectNativeModule } from "../../modules/garmin-connect/src";

export const PHASE18_GARMIN_ADVERSARIAL_CONFIRMATION =
  "VERIFY-PHASE18-GARMIN-ADVERSARIAL";
export const PHASE18_GARMIN_ADVERSARIAL_RESULT_MARKER =
  "GYM_TRACKER_PHASE18_GARMIN_ADVERSARIAL_RESULT:";

const NONCE = /^[a-f0-9]{32}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const SAFE_TEXT = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const FORBIDDEN_KEY = /(?:^|_)(?:account_namespace|authorization|ciphertext|cookie|credentials?|device_serial|email|external_activity_id|filename|heart_rate|latitude|longitude|mfa_code|password|raw_json|route|secret|serial|sql_param|token|url)(?:$|_)/iu;
const FORBIDDEN_VALUE = /(?:https?:\/\/|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\bauthorization\b|\bbearer\b|\bciphertext\b|\bcredentials?\b|\bmfa(?:[_ -]?code)?\b|\bpassword\b|\btoken\b)/iu;

export const PHASE18_GARMIN_ADVERSARIAL_CASE_IDS = Object.freeze([
  "PH18-ADV-RESTORE",
  "PH18-ADV-REFRESH",
  "PH18-ADV-READ",
  "PH18-ADV-LOGOUT",
  "PH18-ADV-RESTART",
  "PH18-ADV-LATE-GENERATION",
  "PH18-ADV-403",
  "PH18-ADV-429",
  "PH18-ADV-OFFLINE",
  "PH18-ADV-TIMEOUT",
  "PH18-ADV-5XX",
  "PH18-ADV-MALFORMED",
  "PH18-ADV-OVERSIZED",
  "PH18-ADV-MISSING-COMPONENT",
  "PH18-ADV-PARTIAL-PAGE",
  "PH18-ADV-ROTATION",
] as const);

export type Phase18GarminAdversarialCaseId =
  typeof PHASE18_GARMIN_ADVERSARIAL_CASE_IDS[number];

export type Phase18GarminAdversarialNativeCase = Readonly<{
  id: Phase18GarminAdversarialCaseId;
  status: "passed" | "TECHNICAL_REVIEW_REQUIRED";
  provenance: "native-exact-artifact" | "unexpected";
  stage: string;
  code: string;
  duration_ms: number;
  call_count: number;
  automatic_retry_count: number;
  retry_after_ms: number;
  connection_state: string;
  sync_state: string;
  session_digest: string;
  generation_before: number;
  generation_after: number;
}>;

export type Phase18GarminDatabaseEvidence = Readonly<{
  source_write_count: number;
  history_digest_before: string;
  history_digest_after: string;
  source_digest_before: string;
  source_digest_after: string;
  match_digest_before: string;
  match_digest_after: string;
}>;

export type Phase18GarminAdversarialCase =
  & Phase18GarminAdversarialNativeCase
  & Phase18GarminDatabaseEvidence;

export type Phase18GarminSourceComponents = Readonly<{
  activity: unknown;
  splits: unknown;
  details: unknown;
}>;

export type Phase18GarminAdversarialBuildIdentity = Readonly<{
  currentHead: string;
  currentSourceTreeSha256: string;
  currentPythonLockSha256: string;
}>;

export type Phase18GarminAdversarialRuntimeIdentity = Readonly<{
  retainedApkSha256: string;
  retainedSignatureSha256: string;
  deviceIdentitySha256: string;
}>;

export type Phase18GarminAdversarialCurrentIdentity =
  & Phase18GarminAdversarialBuildIdentity
  & Phase18GarminAdversarialRuntimeIdentity;

export type Phase18GarminAdversarialNativeObservation = Readonly<{
  status: "passed" | "TECHNICAL_REVIEW_REQUIRED";
  cases: readonly Phase18GarminAdversarialNativeCase[];
  sourceComponents: Phase18GarminSourceComponents;
  currentIdentity: Phase18GarminAdversarialCurrentIdentity;
}>;

const NATIVE_CASE_KEYS = Object.freeze([
  "automatic_retry_count",
  "call_count",
  "code",
  "connection_state",
  "duration_ms",
  "generation_after",
  "generation_before",
  "id",
  "provenance",
  "retry_after_ms",
  "session_digest",
  "stage",
  "status",
  "sync_state",
] as const);
const EXPECTED_CODES = Object.freeze([
  "completed", "completed", "completed", "completed", "sign_in_required", "stale_generation",
  "data_access_denied", "rate_limited", "offline", "timeout", "temporary_failure",
  "malformed_response", "malformed_response", "malformed_response", "temporary_failure", "stale_generation",
]);
const EXPECTED_CALLS = Object.freeze([1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 5, 3]);
const EXPECTED_CONNECTIONS = Object.freeze([
  "connected", "connected", "connected", "disconnected", "sign-in-required", "disconnected",
  ...Array.from({ length: 10 }, () => "connected"),
]);
const EXPECTED_SYNC_STATES = Object.freeze([
  "idle", "success", "success", "idle", "idle", "failure-stale-generation",
  "failure-data-access-denied", "failure-rate-limited", "failure-offline", "failure-timeout",
  "failure-temporary-failure", "failure-malformed-response", "failure-malformed-response",
  "failure-malformed-response", "partial-temporary-failure", "failure-stale-generation",
]);

export function phase18GarminAdversarialEnabled(input: Readonly<{
  buildProfile?: unknown;
  nativeContractsEnabled?: unknown;
  suite?: unknown;
  confirmation?: unknown;
  nonce?: unknown;
  deviceIdentitySha256?: unknown;
}>): boolean {
  return input.buildProfile === "development-test"
    && input.nativeContractsEnabled === true
    && input.suite === "phase18-garmin-adversarial"
    && input.confirmation === PHASE18_GARMIN_ADVERSARIAL_CONFIRMATION
    && typeof input.nonce === "string" && NONCE.test(input.nonce)
    && typeof input.deviceIdentitySha256 === "string" && HASH.test(input.deviceIdentitySha256);
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function integer(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum;
}

function privacySafe(value: unknown): boolean {
  if (typeof value === "string") return !FORBIDDEN_VALUE.test(value);
  if (Array.isArray(value)) return value.every(privacySafe);
  if (record(value)) {
    return Object.entries(value).every(([key, child]) =>
      !FORBIDDEN_KEY.test(key) && privacySafe(child));
  }
  return true;
}

function validNativeCase(value: unknown, index: number): value is Phase18GarminAdversarialNativeCase {
  if (!record(value) || !exactKeys(value, NATIVE_CASE_KEYS)) return false;
  const passed = value.status === "passed";
  const id = PHASE18_GARMIN_ADVERSARIAL_CASE_IDS[index];
  const structural = value.id === id
    && (passed || value.status === "TECHNICAL_REVIEW_REQUIRED")
    && (passed ? value.provenance === "native-exact-artifact" : value.provenance === "unexpected")
    && value.stage === id?.toLowerCase().replaceAll("ph18-adv-", "").replaceAll("-", "_")
    && typeof value.code === "string" && SAFE_TEXT.test(value.code)
    && typeof value.connection_state === "string" && SAFE_TEXT.test(value.connection_state)
    && typeof value.sync_state === "string" && SAFE_TEXT.test(value.sync_state)
    && integer(value.duration_ms, 24 * 60 * 60 * 1_000)
    && integer(value.call_count, 100)
    && integer(value.automatic_retry_count, 10)
    && integer(value.retry_after_ms, 900_000)
    && integer(value.generation_before)
    && integer(value.generation_after)
    && typeof value.session_digest === "string" && HASH.test(value.session_digest);
  if (!structural || !passed) return structural;
  return value.code === EXPECTED_CODES[index]
    && value.connection_state === EXPECTED_CONNECTIONS[index]
    && value.sync_state === EXPECTED_SYNC_STATES[index]
    && value.call_count === EXPECTED_CALLS[index]
    && value.automatic_retry_count === 0
    && value.retry_after_ms === (index === 7 ? 900_000 : 0);
}

function validRelationships(cases: readonly Phase18GarminAdversarialNativeCase[]): boolean {
  return cases[0]?.session_digest !== cases[1]?.session_digest
    && cases[1]?.session_digest === cases[2]?.session_digest
    && cases[3]?.session_digest === cases[4]?.session_digest
    && cases[4]?.session_digest === cases[5]?.session_digest
    && cases[2]?.session_digest !== cases[3]?.session_digest
    && cases.slice(7).every((entry) => entry.session_digest === cases[6]?.session_digest)
    && cases[3]!.generation_after > cases[3]!.generation_before
    && cases[5]!.generation_after > cases[5]!.generation_before
    && cases.every((entry, index) => index === 3 || index === 5
      || entry.generation_after === entry.generation_before);
}

function validBuildIdentity(value: unknown): value is Phase18GarminAdversarialBuildIdentity {
  return record(value)
    && exactKeys(value, ["currentHead", "currentPythonLockSha256", "currentSourceTreeSha256"])
    && typeof value.currentHead === "string" && HEAD.test(value.currentHead)
    && typeof value.currentSourceTreeSha256 === "string" && HASH.test(value.currentSourceTreeSha256)
    && typeof value.currentPythonLockSha256 === "string" && HASH.test(value.currentPythonLockSha256);
}

function validRuntimeIdentity(value: unknown): value is Phase18GarminAdversarialRuntimeIdentity {
  return record(value)
    && exactKeys(value, ["deviceIdentitySha256", "retainedApkSha256", "retainedSignatureSha256"])
    && Object.values(value).every((entry) => typeof entry === "string" && HASH.test(entry));
}

function validSourceComponents(value: unknown): value is Phase18GarminSourceComponents {
  return record(value)
    && exactKeys(value, ["activity", "details", "splits"])
    && record(value.activity)
    && record(value.splits)
    && record(value.details);
}

export async function collectPhase18GarminAdversarialNativeObservations(
  nativeModule = getGarminConnectNativeModule(),
  buildIdentity?: Phase18GarminAdversarialBuildIdentity,
  deviceIdentitySha256?: string,
): Promise<Phase18GarminAdversarialNativeObservation> {
  if (typeof deviceIdentitySha256 !== "string" || !HASH.test(deviceIdentitySha256)) {
    throw new Error("phase18_garmin_adversarial_device_identity_invalid");
  }
  const raw = await nativeModule.runAdversarialSuite({
    confirmation: PHASE18_GARMIN_ADVERSARIAL_CONFIRMATION,
    deviceIdentitySha256,
  });
  if (!record(raw)) throw new Error("phase18_garmin_native_report_invalid");
  if (!exactKeys(raw, ["cases", "runtime_identity", "schema_version", "source_components", "status", "suite"])
    || raw.schema_version !== 1
    || raw.suite !== "phase18-garmin-adversarial"
    || (raw.status !== "passed" && raw.status !== "TECHNICAL_REVIEW_REQUIRED")
    || !validBuildIdentity(buildIdentity)
    || !validRuntimeIdentity(raw.runtime_identity)
    || raw.runtime_identity.deviceIdentitySha256 !== deviceIdentitySha256
    || !validSourceComponents(raw.source_components)
    || !privacySafe(raw.source_components)
    || !Array.isArray(raw.cases)
    || raw.cases.length !== PHASE18_GARMIN_ADVERSARIAL_CASE_IDS.length
    || raw.cases.some((entry, index) => !validNativeCase(entry, index))) {
    throw new Error("phase18_garmin_native_report_invalid");
  }
  const cases = raw.cases as Phase18GarminAdversarialNativeCase[];
  const status = cases.every((entry) => entry.status === "passed")
    ? "passed"
    : "TECHNICAL_REVIEW_REQUIRED";
  const currentIdentity = { ...buildIdentity, ...raw.runtime_identity };
  if (raw.status !== status
    || (status === "passed" && !validRelationships(cases))
    || !privacySafe({ cases, current_identity: currentIdentity })) {
    throw new Error("phase18_garmin_native_report_invalid");
  }
  return Object.freeze({
    status,
    cases: Object.freeze(cases),
    sourceComponents: Object.freeze(raw.source_components),
    currentIdentity: Object.freeze(currentIdentity),
  });
}

export function assertPhase18GarminAdversarialRunNonce(value: unknown): asserts value is string {
  if (typeof value !== "string" || !NONCE.test(value)) {
    throw new Error("phase18_garmin_adversarial_nonce_invalid");
  }
}

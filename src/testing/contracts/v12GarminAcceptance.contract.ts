export type V12GarminNativeExecution = "NOT_RUN" | "REVIEW_REQUIRED" | "FAIL";

export type V12GarminAcceptanceCase = Readonly<{
  id: `NV-GAR-${string}`;
  concern: string;
  disposition: "observe-only";
}>;

const REQUIRED_BRIDGE_METHODS = Object.freeze([
  "login",
  "mfa",
  "activities",
  "activity",
  "splits",
  "details",
] as const);

const PRIVATE_FIELD = /(?:account|credential|password|token|secret|payload|route|coordinate|subject|serial|bodyweight)/iu;
const SHA256 = /^[a-f0-9]{64}$/u;

export const V12_GARMIN_ACCEPTANCE_CASES = Object.freeze([
  { id: "NV-GAR-01-PACKAGING", concern: "ARM64 bundled Python/Chaquopy packaging", disposition: "observe-only" },
  { id: "NV-GAR-02-BRIDGE-ALLOWLIST", concern: "narrow native bridge", disposition: "observe-only" },
  { id: "NV-GAR-03-CANONICAL-JSON", concern: "canonical fixture fidelity", disposition: "observe-only" },
  { id: "NV-GAR-04-SYNC-READ", concern: "bounded summary/splits/detail reads", disposition: "observe-only" },
  { id: "NV-GAR-05-DEDUPE-REVISION", concern: "idempotent revision and replay identity", disposition: "observe-only" },
  { id: "NV-GAR-06-MATCH-SELECTION", concern: "one explicit opportunity selection", disposition: "observe-only" },
  { id: "NV-GAR-07-ACCOUNT-LIFECYCLE", concern: "login, MFA, restart, and logout", disposition: "observe-only" },
  { id: "NV-GAR-08-RECOVERY", concern: "403/429 and bounded retry classification", disposition: "observe-only" },
  { id: "NV-GAR-09-PORTABILITY", concern: "encrypted session and portable source facts", disposition: "observe-only" },
  { id: "NV-GAR-10-PROGRESS-CALENDAR", concern: "Calendar and Progress visibility", disposition: "observe-only" },
  { id: "NV-GAR-11-PROCESS-BOUNDARY", concern: "no alternate process transport", disposition: "observe-only" },
  { id: "NV-GAR-12-PRIVACY", concern: "bounded shared evidence", disposition: "observe-only" },
] as const satisfies readonly V12GarminAcceptanceCase[]);

type GarminObservation = Readonly<Record<string, unknown>>;

export type V12GarminAcceptanceObservations = Readonly<{
  packagingAuth: GarminObservation;
  syncRead: GarminObservation;
  dedupe: GarminObservation;
  matching: GarminObservation;
}>;

function assertRecord(value: unknown, code: string): asserts value is GarminObservation {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
}

function assertNoPrivateFields(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoPrivateFields);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (PRIVATE_FIELD.test(key)) throw new Error("garmin_private_field");
      assertNoPrivateFields(nested);
    }
  }
}

function assertExecution(value: unknown): asserts value is V12GarminNativeExecution {
  if (value !== "NOT_RUN" && value !== "REVIEW_REQUIRED" && value !== "FAIL") {
    throw new Error("garmin_execution_invalid");
  }
}

function assertDigest(value: unknown, code: string): void {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(code);
}

function assertPackaging(value: GarminObservation): void {
  if (value.source !== "bundled-chaquopy") throw new Error("garmin_transport_invalid");
  if (!Array.isArray(value.bridgeMethods) || value.bridgeMethods.length !== REQUIRED_BRIDGE_METHODS.length
    || value.bridgeMethods.some((method, index) => method !== REQUIRED_BRIDGE_METHODS[index])) {
    throw new Error("garmin_bridge_allowlist_invalid");
  }
  assertExecution(value.nativeExecution);
}

function assertSync(value: GarminObservation): void {
  assertDigest(value.fixtureManifestSha256, "garmin_fixture_digest_invalid");
  if (!Number.isInteger(value.expectedSummaries) || (value.expectedSummaries as number) <= 0) {
    throw new Error("garmin_expected_summary_invalid");
  }
  assertExecution(value.nativeExecution);
}

function assertDedupe(value: GarminObservation): void {
  assertDigest(value.receiptDigest, "garmin_receipt_digest_invalid");
  assertDigest(value.provenanceDigest, "garmin_provenance_digest_invalid");
  if (!Number.isInteger(value.replayIdentityCount) || (value.replayIdentityCount as number) <= 0) {
    throw new Error("garmin_replay_identity_invalid");
  }
  assertExecution(value.nativeExecution);
}

function assertMatching(value: GarminObservation): void {
  assertDigest(value.matchDigest, "garmin_match_digest_invalid");
  if (value.selectedOpportunityCount !== 1) throw new Error("garmin_selected_opportunity_invalid");
  assertExecution(value.nativeExecution);
}

/** Validates only evidence shape; it cannot produce a final native verdict. */
export function runV12GarminAcceptanceContract(input: V12GarminAcceptanceObservations): Readonly<{
  status: V12GarminNativeExecution;
  caseCount: number;
}> {
  assertRecord(input, "garmin_observation_invalid");
  assertNoPrivateFields(input);
  assertRecord(input.packagingAuth, "garmin_packaging_observation_invalid");
  assertRecord(input.syncRead, "garmin_sync_observation_invalid");
  assertRecord(input.dedupe, "garmin_dedupe_observation_invalid");
  assertRecord(input.matching, "garmin_matching_observation_invalid");
  assertPackaging(input.packagingAuth);
  assertSync(input.syncRead);
  assertDedupe(input.dedupe);
  assertMatching(input.matching);
  const executions = [input.packagingAuth, input.syncRead, input.dedupe, input.matching]
    .map(({ nativeExecution }) => nativeExecution as V12GarminNativeExecution);
  return Object.freeze({
    status: executions.includes("FAIL") ? "FAIL" : executions.includes("REVIEW_REQUIRED") ? "REVIEW_REQUIRED" : "NOT_RUN",
    caseCount: V12_GARMIN_ACCEPTANCE_CASES.length,
  });
}

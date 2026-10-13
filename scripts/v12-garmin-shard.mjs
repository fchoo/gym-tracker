const SHA256 = /^[a-f0-9]{64}$/u;
const PRIVATE_FIELD = /(?:account|credential|password|token|secret|payload|route|coordinate|subject|serial|bodyweight)/iu;
const METHODS = Object.freeze(["login", "mfa", "activities", "activity", "splits", "details"]);

function record(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value;
}

function noPrivateFields(value) {
  if (Array.isArray(value)) return value.forEach(noPrivateFields);
  if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, nested]) => {
      if (PRIVATE_FIELD.test(key)) throw new Error("garmin_private_field");
      noPrivateFields(nested);
    });
  }
}

function execution(value) {
  if (!["NOT_RUN", "REVIEW_REQUIRED", "FAIL"].includes(value)) throw new Error("garmin_execution_invalid");
}

function digest(value, code) {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(code);
}

export function validateV12GarminShard(input) {
  const value = record(input, "garmin_observation_invalid");
  if (Object.hasOwn(value, "finalVerdict")) throw new Error("garmin_final_verdict_forbidden");
  noPrivateFields(value);
  const packagingAuth = record(value.packagingAuth, "garmin_packaging_observation_invalid");
  const syncRead = record(value.syncRead, "garmin_sync_observation_invalid");
  const dedupe = record(value.dedupe, "garmin_dedupe_observation_invalid");
  const matching = record(value.matching, "garmin_matching_observation_invalid");
  if (packagingAuth.source !== "bundled-chaquopy") throw new Error("garmin_transport_invalid");
  if (!Array.isArray(packagingAuth.bridgeMethods) || packagingAuth.bridgeMethods.length !== METHODS.length
    || packagingAuth.bridgeMethods.some((method, index) => method !== METHODS[index])) throw new Error("garmin_bridge_allowlist_invalid");
  execution(packagingAuth.nativeExecution);
  digest(syncRead.fixtureManifestSha256, "garmin_fixture_digest_invalid");
  if (!Number.isInteger(syncRead.expectedSummaries) || syncRead.expectedSummaries <= 0) throw new Error("garmin_expected_summary_invalid");
  execution(syncRead.nativeExecution);
  digest(dedupe.receiptDigest, "garmin_receipt_digest_invalid");
  digest(dedupe.provenanceDigest, "garmin_provenance_digest_invalid");
  if (!Number.isInteger(dedupe.replayIdentityCount) || dedupe.replayIdentityCount <= 0) throw new Error("garmin_replay_identity_invalid");
  execution(dedupe.nativeExecution);
  digest(matching.matchDigest, "garmin_match_digest_invalid");
  if (matching.selectedOpportunityCount !== 1) throw new Error("garmin_selected_opportunity_invalid");
  execution(matching.nativeExecution);
  const states = [packagingAuth.nativeExecution, syncRead.nativeExecution, dedupe.nativeExecution, matching.nativeExecution];
  return Object.freeze({ status: states.includes("FAIL") ? "FAIL" : states.includes("REVIEW_REQUIRED") ? "REVIEW_REQUIRED" : "NOT_RUN", caseCount: 12 });
}

/** The source-freeze producer preserves observations and never assigns PASS. */
export function executeV12GarminShard(observations) {
  validateV12GarminShard(observations);
  return Object.freeze({ producer: "v12-garmin-shard/v1", status: "NOT_RUN", observations });
}

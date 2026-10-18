import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/u;
const RESULTS = new Set(["PASS", "FAIL", "NOT_RUN", "REVIEW_REQUIRED"]);
const sha256 = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail = (code) => { throw new Error(`v12_shell_evidence_${code}`); };
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

const shell = (id, actionIds, postconditionIds) => Object.freeze({
  id, action_ids: Object.freeze(actionIds), postcondition_ids: Object.freeze(postconditionIds),
});

/** Generated executable projection of PHASE14_SHELL_EVIDENCE_CASES. The
 * resolver tests compare every ID/action/postcondition back to that source. */
export const V12_SHELL_REQUIREMENT_REGISTRY = Object.freeze({
  "SHL-01": shell("shell.four-roots", ["root-dpad-workout-to-calendar", "root-enter-calendar", "root-space-library"], ["one-bottom-navigation", "root-switches-in-place", "required-actions-reachable"]),
  "SHL-02": shell("shell.root-state", ["back-from-library"], ["root-state-restored", "focus-restored"]),
  "SHL-03": shell("shell.appearance", ["appearance-dpad-system-to-light"], ["explicit-selection-observed", "rendered-theme-matches", "all-roots-recolor"]),
  "SHL-04": shell("shell.tokens", [], ["token-source-bound", "minimum-targets", "focus-ring-3dp"]),
  "SHL-05": shell("shell.sheets", ["sheet-dpad-heading-to-system", "sheet-escape", "sheet-back", "sheet-scrim"], ["dismissal-observed", "trigger-focus-restored"]),
  "SHL-06": shell("shell.toasts", ["toast-background-enter"], ["toast-below-top-bar", "background-activation-observed", "status-semantic"]),
  "SHL-07": shell("shell.launch", ["cold-launch-to-workout"], ["real-launch-transition", "no-fabricated-content", "root-ready"]),
  "SHL-08": shell("shell.rest-alerts", ["back-from-rest-alerts-sheet"], ["device-cue-settings-reachable", "focus-restored"]),
  "SHL-09": shell("shell.settings-deep-links", ["back-from-data-recovery"], ["no-write-navigation", "origin-restored"]),
  "SHL-10": shell("shell.removed-sessions", ["back-from-removed-sessions"], ["read-only-navigation", "no-source-write"]),
  "SHL-11": shell("shell.data-recovery", ["ime-clearance-restore-field"], ["ime-cleared", "cancel-does-not-write"]),
  "SHL-12": shell("shell.automatic-backup", ["back-from-automatic-backup"], ["no-cloud-write", "origin-restored"]),
  "SHL-13": shell("shell.manual-backup", ["back-from-manual-backup"], ["cancel-does-not-write", "origin-restored"]),
});

/** Explicit native observation membership for every Phase 14 requirement.
 * These identities are stable even if the producer changes observation order. */
export const V12_SHELL_REQUIREMENT_MEMBERS = Object.freeze({
  "SHL-01": Object.freeze(["workout:normal", "calendar:normal", "library:normal", "progress:normal"]),
  "SHL-02": Object.freeze(["workout:normal", "calendar:normal", "library:normal", "progress:normal"]),
  "SHL-03": Object.freeze(["workout:normal", "workout:reduced", "calendar:normal", "calendar:reduced", "library:normal", "library:reduced", "progress:normal", "progress:reduced"]),
  "SHL-04": Object.freeze(["workout:normal", "calendar:normal", "library:normal", "progress:normal"]),
  "SHL-05": Object.freeze(["workout:normal", "calendar:normal", "library:normal", "progress:normal"]),
  "SHL-06": Object.freeze(["workout:normal", "calendar:normal", "library:normal", "progress:normal"]),
  "SHL-07": Object.freeze(["workout:normal", "workout:reduced"]),
  "SHL-08": Object.freeze(["workout:normal"]),
  "SHL-09": Object.freeze(["workout:normal", "library:normal"]),
  "SHL-10": Object.freeze(["workout:normal"]),
  "SHL-11": Object.freeze(["workout:normal"]),
  "SHL-12": Object.freeze(["workout:normal"]),
  "SHL-13": Object.freeze(["workout:normal"]),
});

function identityFromManifest(manifest) {
  return Object.freeze({
    run_id: manifest.run_id,
    source_tree_sha256: manifest.source.tree_sha256,
    apk_sha256: manifest.build.apk.sha256,
    installed_apk_sha256: manifest.device.installed_apk_sha256,
    device_identity_sha256: manifest.device.identity_sha256,
  });
}

export function createV12ShellRequirementEvidence(observations, manifest) {
  const indexed = new Map(observations.map((observation) => [`${observation.root}:${observation.motion_mode}`, observation]));
  const identity = identityFromManifest(manifest);
  return Object.freeze(Object.entries(V12_SHELL_REQUIREMENT_REGISTRY).map(([requirement, contract]) => {
    const memberIds = V12_SHELL_REQUIREMENT_MEMBERS[requirement];
    if (!Array.isArray(memberIds) || memberIds.length === 0) fail("registry_invalid");
    const members = memberIds.map((id) => {
      const observation = indexed.get(id);
      if (observation === undefined) fail("member_missing");
      const result = observation.native_execution === "EXECUTED" && observation.restored_settings === true ? "PASS" : "FAIL";
      return Object.freeze({ id, result, receipt_sha256: sha256({
        requirement_id: requirement,
        case_id: contract.id,
        native_receipts: observation.native_receipts,
        source_receipts: observation.source_receipts,
      }) });
    });
    const unsigned = {
      schema_version: 1,
      producer: "v12-shell-requirement-receipt/v1",
      ...identity,
      requirement_id: requirement,
      case_id: contract.id,
      action_ids: contract.action_ids,
      postcondition_ids: contract.postcondition_ids,
      members,
      result: members.every(({ result }) => result === "PASS") ? "PASS" : "FAIL",
    };
    return Object.freeze({ ...unsigned, receipt_sha256: sha256(unsigned) });
  }));
}

export function validateV12ShellRequirementEvidence(receipts, manifest) {
  if (!Array.isArray(receipts) || receipts.length !== Object.keys(V12_SHELL_REQUIREMENT_REGISTRY).length) fail("count_invalid");
  const identity = identityFromManifest(manifest);
  const indexed = new Map();
  for (const receipt of receipts) {
    if (!exact(receipt, ["schema_version", "producer", ...Object.keys(identity), "requirement_id", "case_id", "action_ids", "postcondition_ids", "members", "result", "receipt_sha256"])) fail("schema_invalid");
    const contract = V12_SHELL_REQUIREMENT_REGISTRY[receipt.requirement_id];
    if (contract === undefined || indexed.has(receipt.requirement_id)) fail("identity_invalid");
    if (receipt.schema_version !== 1 || receipt.producer !== "v12-shell-requirement-receipt/v1"
      || receipt.case_id !== contract.id || JSON.stringify(receipt.action_ids) !== JSON.stringify(contract.action_ids)
      || JSON.stringify(receipt.postcondition_ids) !== JSON.stringify(contract.postcondition_ids)
      || Object.entries(identity).some(([key, value]) => receipt[key] !== value)
      || !RESULTS.has(receipt.result) || !Array.isArray(receipt.members) || receipt.members.length === 0
      || JSON.stringify(receipt.members.map(({ id }) => id)) !== JSON.stringify(V12_SHELL_REQUIREMENT_MEMBERS[receipt.requirement_id])
      || receipt.members.some((member) => !exact(member, ["id", "result", "receipt_sha256"])
        || !RESULTS.has(member.result) || !HASH.test(member.receipt_sha256 ?? ""))
      || new Set(receipt.members.map(({ id }) => id)).size !== receipt.members.length) fail("identity_invalid");
    const { receipt_sha256: digest, ...unsigned } = receipt;
    if (!HASH.test(digest ?? "") || digest !== sha256(unsigned)
      || receipt.result !== (receipt.members.every(({ result }) => result === "PASS") ? "PASS" : "FAIL")) fail("receipt_invalid");
    indexed.set(receipt.requirement_id, receipt);
  }
  for (const requirement of Object.keys(V12_SHELL_REQUIREMENT_REGISTRY)) if (!indexed.has(requirement)) fail("member_missing");
  return true;
}

import { createHash } from "node:crypto";

import { PHASE14_SHELL_EVIDENCE_CASES } from "../src/testing/contracts/phase14Shell.contract.ts";

const HASH = /^[a-f0-9]{64}$/u;
const RESULTS = new Set(["PASS", "FAIL", "NOT_RUN", "REVIEW_REQUIRED"]);
const sha256 = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail = (code) => { throw new Error(`v12_shell_evidence_${code}`); };
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const shell = (id, actionIds, postconditionIds) => Object.freeze({
  id, action_ids: Object.freeze(actionIds), postcondition_ids: Object.freeze(postconditionIds),
});

/** Executable projection of the source-owned Phase 14 registry. */
export const V12_SHELL_REQUIREMENT_REGISTRY = Object.freeze(Object.fromEntries(
  PHASE14_SHELL_EVIDENCE_CASES.map((entry) => [entry.requirement, shell(
    entry.id,
    entry.actions.map(({ id }) => id),
    [...entry.postconditions],
  )]),
));

const PHASE14_MANIFEST_PATH = "shell/phase14-build.json";
const PHASE14_EVIDENCE_PATH = "shell/phase14-evidence.json";

function identityFromManifests(phase14Manifest, evidence, manifest) {
  const identity = Object.freeze({
    run_id: manifest?.run_id,
    source_tree_sha256: manifest?.source?.tree_sha256,
    apk_sha256: manifest?.build?.apk?.sha256,
    installed_apk_sha256: manifest?.device?.installed_apk_sha256,
    device_identity_sha256: manifest?.device?.identity_sha256,
    configuration_id: manifest?.configuration?.id,
    phase14_manifest_sha256: sha256(phase14Manifest),
    phase14_evidence_sha256: sha256(evidence),
  });
  if (typeof identity.run_id !== "string" || !HASH.test(identity.source_tree_sha256 ?? "")
    || !HASH.test(identity.apk_sha256 ?? "") || identity.installed_apk_sha256 !== identity.apk_sha256
    || !HASH.test(identity.device_identity_sha256 ?? "") || typeof identity.configuration_id !== "string"
    || phase14Manifest?.schema_version !== 1 || phase14Manifest.suite !== "phase14"
    || phase14Manifest.profile !== "development-test" || phase14Manifest.package !== manifest?.build?.package
    || phase14Manifest.base_head !== manifest?.source?.head || phase14Manifest.source_tree_sha256 !== identity.source_tree_sha256
    || phase14Manifest.apk?.sha256 !== identity.apk_sha256 || phase14Manifest.installed_apk?.sha256 !== identity.installed_apk_sha256
    || phase14Manifest.installed_apk?.matches_retained_apk !== true || phase14Manifest.device?.identity_sha256 !== identity.device_identity_sha256
    || evidence?.schema_version !== 4 || !["phase14-native-observation/v4", "phase14-native-evidence-finalized/v1"].includes(evidence.producer)
    || evidence.suite !== "phase14" || evidence.base_head !== phase14Manifest.base_head
    || evidence.source_tree_sha256 !== identity.source_tree_sha256 || evidence.package !== phase14Manifest.package
    || evidence.profile !== phase14Manifest.profile || evidence.device_identity_sha256 !== identity.device_identity_sha256
    || evidence.apk?.sha256 !== identity.apk_sha256 || evidence.apk?.installed_sha256 !== identity.installed_apk_sha256
    || evidence.apk?.matches_retained_apk !== true) fail("phase14_identity_invalid");
  return identity;
}

function retainedSource(identity) {
  return Object.freeze({
    manifest: Object.freeze({ artifact_class: "phase14-build-manifest", path: PHASE14_MANIFEST_PATH, sha256: identity.phase14_manifest_sha256 }),
    evidence: Object.freeze({ artifact_class: "phase14-native-evidence", path: PHASE14_EVIDENCE_PATH, sha256: identity.phase14_evidence_sha256 }),
  });
}

function actionReceipt(identity, requirement, contract, cell, observation) {
  if (cell?.case_id !== contract.id || typeof cell.id !== "string" || typeof cell.configuration_id !== "string"
    || cell.native_verdict !== "PASS" || observation?.action_id === undefined || observation.verdict !== "PASS"
    || observation.pre?.predicate?.verdict !== "PASS" || observation.post?.predicate?.verdict !== "PASS") fail("action_invalid");
  const unsigned = {
    schema_version: 1,
    producer: "v12-shell-phase14-action-receipt/v1",
    domain: "phase14-shell-action",
    ...identity,
    requirement_id: requirement,
    case_id: contract.id,
    action_id: observation.action_id,
    cell_id: cell.id,
    phase14_configuration_id: cell.configuration_id,
    pre_sha256: sha256(observation.pre),
    action_sha256: sha256(observation),
    post_sha256: sha256(observation.post),
    result: "PASS",
  };
  return Object.freeze({ ...unsigned, receipt_sha256: sha256(unsigned) });
}

function cellReceipt(identity, requirement, contract, cell) {
  if (cell?.case_id !== contract.id || typeof cell.id !== "string" || typeof cell.configuration_id !== "string"
    || cell.native_verdict !== "PASS" || !Array.isArray(cell.checkpoints)
    || cell.checkpoints.some((checkpoint) => checkpoint?.verdict !== "PASS")) fail("cell_invalid");
  const unsigned = {
    schema_version: 1,
    producer: "v12-shell-phase14-cell-receipt/v1",
    domain: "phase14-shell-cell",
    ...identity,
    requirement_id: requirement,
    case_id: contract.id,
    cell_id: cell.id,
    phase14_configuration_id: cell.configuration_id,
    native_verdict: cell.native_verdict,
    checkpoints_sha256: sha256(cell.checkpoints),
    runtime_state_sha256: sha256(cell.runtime_state),
    result: "PASS",
  };
  return Object.freeze({ ...unsigned, receipt_sha256: sha256(unsigned) });
}

function postconditionReceipt(identity, requirement, contract, postconditionId, cells, members) {
  const unsigned = {
    schema_version: 1,
    producer: "v12-shell-phase14-postcondition-receipt/v1",
    domain: "phase14-shell-postcondition",
    ...identity,
    requirement_id: requirement,
    case_id: contract.id,
    postcondition_id: postconditionId,
    evaluated_cell_ids: Object.freeze(cells.map(({ id }) => id)),
    evaluated_cell_receipts_sha256: sha256(members.map(({ receipt_sha256: receipt }) => receipt)),
    evaluation: "all-retained-native-cells-pass",
    result: "PASS",
  };
  return Object.freeze({ ...unsigned, receipt_sha256: sha256(unsigned) });
}

export function createV12ShellRequirementEvidence(evidence, phase14Manifest, manifest) {
  const identity = identityFromManifests(phase14Manifest, evidence, manifest);
  if (!Array.isArray(evidence.evidence) || evidence.evidence.length !== PHASE14_SHELL_EVIDENCE_CASES.length
    || !Array.isArray(evidence.matrix_cells)) fail("phase14_coverage_invalid");
  const rows = new Map();
  for (const row of evidence.evidence) {
    if (typeof row?.requirement !== "string" || rows.has(row.requirement)) fail("phase14_coverage_invalid");
    rows.set(row.requirement, row);
  }
  return Object.freeze(PHASE14_SHELL_EVIDENCE_CASES.map((sourceContract) => {
    const requirement = sourceContract.requirement;
    const contract = V12_SHELL_REQUIREMENT_REGISTRY[requirement];
    const row = rows.get(requirement);
    if (contract === undefined || row?.id !== contract.id || row.verdict !== "PASS" || row.native_verdict !== "PASS"
      || row.component_verdict !== "PASS" || !Array.isArray(row.matrix_cells) || row.matrix_cells.length === 0) fail("phase14_row_invalid");
    const cells = row.matrix_cells;
    const cellIds = cells.map(({ id }) => id);
    if (new Set(cellIds).size !== cellIds.length || !same(cells, evidence.matrix_cells.filter(({ case_id: caseId }) => caseId === contract.id))) fail("phase14_row_invalid");
    const members = Object.freeze(cells.map((cell) => cellReceipt(identity, requirement, contract, cell)));
    const actionReceipts = contract.action_ids.map((actionId) => {
      const matches = cells.flatMap((cell) => (cell.actions ?? []).filter(({ action_id: observedId }) => observedId === actionId).map((observation) => ({ cell, observation })));
      if (matches.length !== 1) fail(matches.length === 0 ? "action_missing" : "action_duplicate");
      return actionReceipt(identity, requirement, contract, matches[0].cell, matches[0].observation);
    });
    const postconditionReceipts = contract.postcondition_ids.map((id) => postconditionReceipt(identity, requirement, contract, id, cells, members));
    const unsigned = {
      schema_version: 2,
      producer: "v12-shell-requirement-receipt/v2",
      ...identity,
      requirement_id: requirement,
      case_id: contract.id,
      action_ids: contract.action_ids,
      postcondition_ids: contract.postcondition_ids,
      retained_source: retainedSource(identity),
      action_receipts: Object.freeze(actionReceipts),
      postcondition_receipts: Object.freeze(postconditionReceipts),
      members,
      result: "PASS",
    };
    return Object.freeze({ ...unsigned, receipt_sha256: sha256(unsigned) });
  }));
}

function validateNestedReceipt(entry, expected, kind) {
  const receiptKey = kind === "action" ? "action_id" : kind === "postcondition" ? "postcondition_id" : "cell_id";
  const producer = kind === "action" ? "v12-shell-phase14-action-receipt/v1"
    : kind === "postcondition" ? "v12-shell-phase14-postcondition-receipt/v1" : "v12-shell-phase14-cell-receipt/v1";
  const domain = kind === "action" ? "phase14-shell-action" : kind === "postcondition" ? "phase14-shell-postcondition" : "phase14-shell-cell";
  if (!entry || entry.schema_version !== 1 || entry.producer !== producer || entry.domain !== domain
    || entry.requirement_id !== expected.requirement_id || entry.case_id !== expected.case_id
    || entry[receiptKey] !== expected.id || entry.result !== "PASS" || !HASH.test(entry.receipt_sha256 ?? "")) fail(`${kind}_receipt_invalid`);
  for (const [key, value] of Object.entries(expected.identity)) if (entry[key] !== value) fail(`${kind}_receipt_invalid`);
  const { receipt_sha256: digest, ...unsigned } = entry;
  if (digest !== sha256(unsigned)) fail(`${kind}_receipt_invalid`);
}

export function validateV12ShellRequirementEvidence(receipts, manifest) {
  if (!Array.isArray(receipts) || receipts.length !== Object.keys(V12_SHELL_REQUIREMENT_REGISTRY).length) fail("count_invalid");
  const indexed = new Map();
  for (const receipt of receipts) {
    const contract = V12_SHELL_REQUIREMENT_REGISTRY[receipt?.requirement_id];
    if (contract === undefined || indexed.has(receipt.requirement_id)) fail("identity_invalid");
    const identity = {
      run_id: manifest?.run_id,
      source_tree_sha256: manifest?.source?.tree_sha256,
      apk_sha256: manifest?.build?.apk?.sha256,
      installed_apk_sha256: manifest?.device?.installed_apk_sha256,
      device_identity_sha256: manifest?.device?.identity_sha256,
      configuration_id: manifest?.configuration?.id,
      phase14_manifest_sha256: receipt.phase14_manifest_sha256,
      phase14_evidence_sha256: receipt.phase14_evidence_sha256,
    };
    if (!exact(receipt, ["schema_version", "producer", ...Object.keys(identity), "requirement_id", "case_id", "action_ids", "postcondition_ids", "retained_source", "action_receipts", "postcondition_receipts", "members", "result", "receipt_sha256"])
      || receipt.schema_version !== 2 || receipt.producer !== "v12-shell-requirement-receipt/v2"
      || receipt.case_id !== contract.id || !same(receipt.action_ids, contract.action_ids) || !same(receipt.postcondition_ids, contract.postcondition_ids)
      || Object.entries(identity).some(([key, value]) => receipt[key] !== value) || !HASH.test(receipt.phase14_manifest_sha256 ?? "")
      || !HASH.test(receipt.phase14_evidence_sha256 ?? "") || receipt.result !== "PASS"
      || !exact(receipt.retained_source, ["manifest", "evidence"])
      || !exact(receipt.retained_source.manifest, ["artifact_class", "path", "sha256"])
      || !exact(receipt.retained_source.evidence, ["artifact_class", "path", "sha256"])
      || receipt.retained_source.manifest.artifact_class !== "phase14-build-manifest" || receipt.retained_source.manifest.path !== PHASE14_MANIFEST_PATH
      || receipt.retained_source.manifest.sha256 !== receipt.phase14_manifest_sha256
      || receipt.retained_source.evidence.artifact_class !== "phase14-native-evidence" || receipt.retained_source.evidence.path !== PHASE14_EVIDENCE_PATH
      || receipt.retained_source.evidence.sha256 !== receipt.phase14_evidence_sha256
      || !Array.isArray(receipt.action_receipts) || !Array.isArray(receipt.postcondition_receipts) || !Array.isArray(receipt.members)
      || !same(receipt.action_receipts.map(({ action_id: id }) => id), contract.action_ids)
      || !same(receipt.postcondition_receipts.map(({ postcondition_id: id }) => id), contract.postcondition_ids)
      || receipt.members.length === 0 || new Set(receipt.members.map(({ cell_id: id }) => id)).size !== receipt.members.length) fail("schema_invalid");
    for (const action of receipt.action_receipts) validateNestedReceipt(action, { requirement_id: receipt.requirement_id, case_id: receipt.case_id, id: action.action_id, identity }, "action");
    for (const postcondition of receipt.postcondition_receipts) validateNestedReceipt(postcondition, { requirement_id: receipt.requirement_id, case_id: receipt.case_id, id: postcondition.postcondition_id, identity }, "postcondition");
    for (const member of receipt.members) validateNestedReceipt(member, { requirement_id: receipt.requirement_id, case_id: receipt.case_id, id: member.cell_id, identity }, "cell");
    const memberIds = new Set(receipt.members.map(({ cell_id: id }) => id));
    if (receipt.action_receipts.some(({ cell_id: id }) => !memberIds.has(id))
      || receipt.postcondition_receipts.some((entry) => !same(entry.evaluated_cell_ids, receipt.members.map(({ cell_id: id }) => id))
        || entry.evaluated_cell_receipts_sha256 !== sha256(receipt.members.map(({ receipt_sha256: value }) => value)))) fail("membership_invalid");
    const { receipt_sha256: digest, ...unsigned } = receipt;
    if (!HASH.test(digest ?? "") || digest !== sha256(unsigned)) fail("receipt_invalid");
    indexed.set(receipt.requirement_id, receipt);
  }
  for (const requirement of Object.keys(V12_SHELL_REQUIREMENT_REGISTRY)) if (!indexed.has(requirement)) fail("member_missing");
  return true;
}

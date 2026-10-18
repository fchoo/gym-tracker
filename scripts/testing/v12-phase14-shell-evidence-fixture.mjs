import { PHASE14_SHELL_EVIDENCE_CASES } from "../../src/testing/contracts/phase14Shell.contract.ts";

export function phase14ShellEvidenceFixture(manifest) {
  const phase14Manifest = {
    schema_version: 1,
    suite: "phase14",
    profile: "development-test",
    build_variant: "release",
    package: manifest.build.package,
    js_bundle: { embedded: true },
    base_head: manifest.source.head,
    source_tree_sha256: manifest.source.tree_sha256,
    apk: {
      path: "artifacts/native/phase14/gym-tracker-phase14-devtest.apk",
      sha256: manifest.build.apk.sha256,
      size_bytes: manifest.build.apk.size_bytes ?? 1,
      page_alignment_kib: 16,
      page_alignment_verified: true,
    },
    installed_apk: { sha256: manifest.device.installed_apk_sha256, matches_retained_apk: true },
    device: { identity_sha256: manifest.device.identity_sha256 },
  };
  const matrixCells = PHASE14_SHELL_EVIDENCE_CASES.map((contract, order) => ({
    id: `retained-${String(order).padStart(2, "0")}-${contract.id}`,
    case_id: contract.id,
    configuration_id: manifest.configuration.id,
    actions: contract.actions.map((action, actionOrder) => ({
      schema_version: 3,
      order: actionOrder,
      action_id: action.id,
      input: action.input,
      transport: action.transport,
      command: action.command,
      pre: { predicate: { verdict: "PASS", failures: [] }, semantic_tree_sha256: `${order}`.padStart(64, "a") },
      post: { predicate: { verdict: "PASS", failures: [] }, semantic_tree_sha256: `${actionOrder}`.padStart(64, "b") },
      verdict: "PASS",
    })),
    checkpoints: contract.checkpoints.map((id) => ({ id, verdict: "PASS" })),
    runtime_state: { verdict: "PASS", policy: contract.runtimeStatePolicy },
    native_verdict: "PASS",
  }));
  const evidence = {
    schema_version: 4,
    producer: "phase14-native-observation/v4",
    suite: "phase14",
    verdict: "PASS",
    build_manifest: "artifacts/native/phase14/build.json",
    base_head: phase14Manifest.base_head,
    source_tree_sha256: phase14Manifest.source_tree_sha256,
    package: phase14Manifest.package,
    profile: phase14Manifest.profile,
    device_identity_sha256: phase14Manifest.device.identity_sha256,
    apk: { ...phase14Manifest.apk, installed_sha256: phase14Manifest.apk.sha256, matches_retained_apk: true },
    evidence: PHASE14_SHELL_EVIDENCE_CASES.map((contract) => ({
      id: contract.id,
      requirement: contract.requirement,
      path: contract.evidencePath,
      component_verdict: "PASS",
      native_verdict: "PASS",
      visual_verdict: "N_A_REVIEWED",
      verdict: "PASS",
      matrix_cells: matrixCells.filter(({ case_id: caseId }) => caseId === contract.id),
    })),
    matrix_cells: matrixCells,
  };
  return { phase14Manifest, evidence };
}

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseV12EvidenceCliArgs,
  executeV12EvidenceCli,
  deriveV12Ledger,
  validateV12FinalProductionIdentity,
} from "./verify-v12-native-evidence.mjs";

import { loadV12ContractInputs } from "./v12-evidence-contract.mjs";
import { createHash } from "node:crypto";

const RUN_ID = "phase20-20261014T031137Z-5917481c1fd1";
const h = (letter) => letter.repeat(64);
function v12LiveManifest(runId = RUN_ID) {
  return {
    schema_version: 1, run_id: runId, mode: "live", created_at: "2026-10-14T03:11:37Z",
    source: { head: "5917481c1fd1" + "a".repeat(28), tree_sha256: h("b"), dirty: false, package_json_sha256: h("c"), package_lock_sha256: h("d") },
    planning: { matrix_sha256: h("e"), requirements_sha256: h("f"), source_manifest_sha256: h("1"), owner_brief_sha256: h("2"), ui_spec_sha256: h("3"), deviations_sha256: h("4") },
    prototype: { revision: 18, approval_sha256: h("5"), html_sha256: h("6") }, fixtures: { registry_sha256: h("7") },
    build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "0.1.0", version_code: 1, apk: { path: "artifacts/native/v1.2-acceptance/app.apk", sha256: h("8"), size_bytes: 1, page_alignment_verified: true, signature_sha256: h("9"), certificate_sha256: h("a") } },
    device: { identity_sha256: h("b"), abi: "arm64-v8a", installed_apk_sha256: h("8"), settings_sha256: h("c"), restoration_sha256: h("d") }, configuration: { id: "AP-L-C390-P-F100" },
  };
}

test("the Phase 20 verifier accepts only the explicit unified shard, preseal, and final grammars", () => {
  assert.deepEqual(
    parseV12EvidenceCliArgs(["--run", RUN_ID, "--mode", "shards-only", "--ids", "sqlite,calendar"]),
    { run_id: RUN_ID, mode: "shards-only", ids: ["sqlite", "calendar"], no_final_write: false },
  );
  assert.deepEqual(
    parseV12EvidenceCliArgs(["--run", RUN_ID, "--mode", "preseal", "--no-final-write"]),
    { run_id: RUN_ID, mode: "preseal", ids: null, no_final_write: true },
  );
  assert.deepEqual(
    parseV12EvidenceCliArgs(["--run", RUN_ID, "--mode", "final"]),
    { run_id: RUN_ID, mode: "final", ids: null, no_final_write: false },
  );
  for (const args of [
    ["--mode", "preseal", "--run", RUN_ID],
    ["--run", RUN_ID, "--mode", "preseal"],
    ["--run", RUN_ID, "--mode", "final", "--no-final-write"],
    ["--run", RUN_ID, "--mode", "shards-only"],
    ["--run", RUN_ID, "--mode", "shards-only", "--ids", "sqlite", "--no-final-write"],
  ]) assert.throws(() => parseV12EvidenceCliArgs(args), /v12_preflight_cli_invalid/u);
});

test("unified preflight execution is explicitly source-only and never falls through to the legacy Calendar CLI", () => {
  assert.throws(
    () => executeV12EvidenceCli(["--run", RUN_ID, "--mode", "preseal", "--no-final-write"], { root: process.cwd() }),
    /v12_preflight_/u,
  );
});

// Deliberately uses the former PASS-by-hash shape. This must never regain a
// compatibility path through deriveV12Ledger, even outside the CLI.
test("172 untyped PASS assertions cannot masquerade as validated source results", () => {
  const hash = value => createHash("sha256").update(value).digest("hex");
  const manifest = {
    schema_version: 1, run_id: RUN_ID, mode: "live", created_at: "2026-10-14T03:11:37Z",
    source: { head: "5917481c1fd1" + "a".repeat(28), tree_sha256: h("b"), dirty: false, package_json_sha256: h("c"), package_lock_sha256: h("d") },
    planning: { matrix_sha256: h("e"), requirements_sha256: h("f"), source_manifest_sha256: h("1"), owner_brief_sha256: h("2"), ui_spec_sha256: h("3"), deviations_sha256: h("4") },
    prototype: { revision: 18, approval_sha256: h("5"), html_sha256: h("6") }, fixtures: { registry_sha256: h("7") },
    build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "0.1.0", version_code: 1, apk: { path: "artifacts/native/v1.2-acceptance/fake.apk", sha256: h("8"), size_bytes: 1, page_alignment_verified: true, signature_sha256: h("9"), certificate_sha256: h("a") } },
    device: { identity_sha256: h("b"), abi: "arm64-v8a", installed_apk_sha256: h("8"), settings_sha256: h("c"), restoration_sha256: h("d") }, configuration: { id: "AP-L-C390-P-F100" },
  };
  const inputs = loadV12ContractInputs();
  const evidence = inputs.matrix.rows.map(row => ({ row_id: row.requirement_id, artifact: `artifacts/native/v1.2/${RUN_ID}/proof/${row.requirement_id}.json`, sha256: hash(row.requirement_id), result: "PASS", configuration_id: manifest.configuration.id }));
  assert.equal(evidence.length, 172);
  assert.throws(() => deriveV12Ledger({ inputs, manifest, evidence, readArtifact: () => Buffer.from("unvalidated") }), /v12_final_evidence_schema_invalid/u);
});

test("final identity re-reads retained APK bytes, signature, source and device", (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "v12-final-identity-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const apkPath = "artifacts/native/v1.2-acceptance/app.apk";
  const apk = Buffer.from("PK\u0003\u0004controlled-apk");
  mkdirSync(path.join(root, path.dirname(apkPath)), { recursive: true });
  writeFileSync(path.join(root, apkPath), apk);
  const manifest = {
    ...v12LiveManifest(RUN_ID),
    build: {
      ...v12LiveManifest(RUN_ID).build,
      apk: {
        ...v12LiveManifest(RUN_ID).build.apk,
        path: apkPath,
        sha256: createHash("sha256").update(apk).digest("hex"),
        size_bytes: apk.length,
      },
    },
  };
  manifest.device.installed_apk_sha256 = manifest.build.apk.sha256;
  const dependencies = {
    root,
    currentHead: () => manifest.source.head,
    currentSourceTreeSha256: () => manifest.source.tree_sha256,
    verifyApkSignature: () => ({ signature_sha256: manifest.build.apk.signature_sha256, certificate_sha256: manifest.build.apk.certificate_sha256 }),
    readDeviceIdentity: () => ({ identity_sha256: manifest.device.identity_sha256, installed_apk_sha256: manifest.device.installed_apk_sha256, abi: "arm64-v8a" }),
  };
  assert.equal(validateV12FinalProductionIdentity(manifest, dependencies), true);
  writeFileSync(path.join(root, apkPath), Buffer.from("PK\u0003\u0004different-apk"));
  assert.throws(() => validateV12FinalProductionIdentity(manifest, dependencies), /v12_preflight_final_identity_invalid/u);
  writeFileSync(path.join(root, apkPath), apk);
  assert.throws(() => validateV12FinalProductionIdentity(manifest, {
    ...dependencies,
    verifyApkSignature: () => ({ signature_sha256: h("0"), certificate_sha256: manifest.build.apk.certificate_sha256 }),
  }), /v12_preflight_final_identity_invalid/u);
  assert.throws(() => validateV12FinalProductionIdentity(manifest, {
    ...dependencies,
    currentSourceTreeSha256: () => h("0"),
  }), /v12_preflight_final_identity_invalid/u);
  assert.throws(() => validateV12FinalProductionIdentity(manifest, {
    ...dependencies,
    readDeviceIdentity: () => ({ identity_sha256: h("0"), installed_apk_sha256: manifest.device.installed_apk_sha256, abi: "arm64-v8a" }),
  }), /v12_preflight_final_identity_invalid/u);
});

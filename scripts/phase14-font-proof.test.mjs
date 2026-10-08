import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parsePhase14FontProofArgs,
  validatePhase14FontProofArtifacts,
  validatePhase14FontProofManifest,
} from "./run-phase14-font-proof.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const sourceTreeSha256 = "a".repeat(64);
const apkBytes = Buffer.from("phase14-font-proof-apk");
const apkSha256 = hash(apkBytes);
const proofSource = "export const PHASE14_FONT_PROOF = Object.freeze({});\n";

function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "phase14-font-proof-"));
  const apk = path.join(directory, "phase14.apk");
  const report = path.join(directory, "font-axis-proof.json");
  writeFileSync(apk, apkBytes);
  writeFileSync(path.join(directory, "phase14FontProof.ts"), proofSource);
  const manifest = {
    schema_version: 1,
    suite: "phase14-font-proof",
    profile: "development-test",
    package: "com.fchoo.gymtracker.devtest",
    base_head: "b".repeat(40),
    source_tree_sha256: sourceTreeSha256,
    apk: { path: apk, sha256: apkSha256 },
  };
  const evidence = {
    schema_version: 1,
    suite: "phase14-font-proof",
    status: "passed",
    source_tree_sha256: sourceTreeSha256,
    apk_sha256: apkSha256,
    package: "com.fchoo.gymtracker.devtest",
    profile: "development-test",
    proof_source_sha256: hash(proofSource),
    cases: [
      { id: "light-390-scale-1", status: "passed", screenshot_overlay_sha256: "c".repeat(64) },
      { id: "light-390-scale-2", status: "passed", screenshot_overlay_sha256: "d".repeat(64) },
    ],
  };
  writeFileSync(report, `${JSON.stringify(evidence)}\n`);
  return { apk, directory, evidence, manifest, report };
}

test("font proof rejects stale source, APK, package/profile and skipped cases", () => {
  const value = fixture();
  try {
    assert.equal(validatePhase14FontProofManifest(value.manifest), true);
    assert.doesNotThrow(() => validatePhase14FontProofArtifacts({
      manifest: value.manifest,
      report: value.evidence,
      currentHead: value.manifest.base_head,
      currentSourceTreeSha256: sourceTreeSha256,
      apkBytes: readFileSync(value.apk),
      proofSourceBytes: readFileSync(path.join(value.directory, "phase14FontProof.ts")),
    }));
    assert.throws(() => validatePhase14FontProofArtifacts({
      manifest: value.manifest,
      report: value.evidence,
      currentHead: "e".repeat(40),
      currentSourceTreeSha256: sourceTreeSha256,
      apkBytes: readFileSync(value.apk),
      proofSourceBytes: readFileSync(path.join(value.directory, "phase14FontProof.ts")),
    }), /phase14_font_manifest_stale/u);
    assert.throws(() => validatePhase14FontProofArtifacts({
      manifest: value.manifest,
      report: { ...value.evidence, cases: [{ ...value.evidence.cases[0], status: "skipped" }, value.evidence.cases[1] ] },
      currentHead: value.manifest.base_head,
      currentSourceTreeSha256: sourceTreeSha256,
      apkBytes: readFileSync(value.apk),
      proofSourceBytes: readFileSync(path.join(value.directory, "phase14FontProof.ts")),
    }), /phase14_font_case_invalid/u);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("font proof CLI only accepts an explicit manifest and existing-report mode", () => {
  assert.deepEqual(parsePhase14FontProofArgs([
    "--manifest", "artifacts/native/phase14-font-proof/build.json", "--verify-existing",
  ]), {
    manifest: "artifacts/native/phase14-font-proof/build.json",
    verifyExisting: true,
  });
  assert.throws(() => parsePhase14FontProofArgs([]), /phase14_font_manifest_argument_invalid/u);
  assert.throws(() => parsePhase14FontProofArgs([
    "--manifest", "other.json", "--verify-existing",
  ]), /phase14_font_manifest_argument_invalid/u);
});

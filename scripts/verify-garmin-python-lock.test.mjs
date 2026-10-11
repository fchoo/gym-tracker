import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  validateGarminPythonLock,
  verifyGarminPythonArtifacts,
} from "./verify-garmin-python-lock.mjs";

const lockPath = path.join(
  process.cwd(),
  "modules/garmin-connect/python/garmin-python-lock.json",
);

function currentLock() {
  return JSON.parse(readFileSync(lockPath, "utf8"));
}

test("accepts only the reviewed Python 3.13 ARM64 Garmin dependency graph", () => {
  assert.deepEqual(validateGarminPythonLock(currentLock()), {
    valid: true,
    packageCount: 14,
  });
});

test("rejects a changed client commit, wheel hash, or unreviewed package", () => {
  const lock = currentLock();
  const changedCommit = structuredClone(lock);
  changedCommit.packages[0].source.commit = "0000000000000000000000000000000000000000";
  assert.throws(() => validateGarminPythonLock(changedCommit), /client_commit/u);

  const changedHash = structuredClone(lock);
  changedHash.packages[1].artifact.sha256 = "0".repeat(64);
  assert.throws(() => validateGarminPythonLock(changedHash), /curl_cffi_hash/u);

  const unreviewed = structuredClone(lock);
  unreviewed.packages.push({ name: "unknown", version: "1", source: {}, artifact: {}, license: "MIT" });
  assert.throws(() => validateGarminPythonLock(unreviewed), /package_set/u);
});

test("requires the exact complete local artifact set before packaging", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "garmin-python-lock-"));
  try {
    const lock = currentLock();
    for (const entry of lock.packages) {
      writeFileSync(path.join(directory, entry.artifact.filename), "fixture");
    }
    const expectedDigest = (artifactPath) => lock.packages.find(
      (entry) => entry.artifact.filename === path.basename(artifactPath),
    ).artifact.sha256;
    assert.deepEqual(verifyGarminPythonArtifacts(lock, directory, expectedDigest), {
      valid: true,
      packageCount: 14,
    });

    rmSync(path.join(directory, lock.packages[0].artifact.filename));
    assert.throws(() => verifyGarminPythonArtifacts(lock, directory, expectedDigest), /artifact_set/u);
    writeFileSync(path.join(directory, lock.packages[0].artifact.filename), "wrong");
    assert.throws(() => verifyGarminPythonArtifacts(
      lock,
      directory,
      (artifactPath) => path.basename(artifactPath) === lock.packages[0].artifact.filename
        ? "0".repeat(64)
        : expectedDigest(artifactPath),
    ), /artifact_hash/u);
    writeFileSync(path.join(directory, "unreviewed.whl"), "extra");
    assert.throws(() => verifyGarminPythonArtifacts(lock, directory, expectedDigest), /artifact_set/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

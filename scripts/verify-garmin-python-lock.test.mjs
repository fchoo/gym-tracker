import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { validateGarminPythonLock } from "./verify-garmin-python-lock.mjs";

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

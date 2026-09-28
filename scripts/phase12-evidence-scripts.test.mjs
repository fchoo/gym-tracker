import assert from "node:assert/strict";
import test from "node:test";
import { PHASE12_MAESTRO_STAGES, validatePhase12Manifest } from "./run-phase12-maestro.mjs";
const manifest = { schema_version: 1, suite: "phase12", profile: "development-test", package: "com.fchoo.gymtracker.devtest", js_bundle: { embedded: true }, apk: { path: "fixture.apk", sha256: "a".repeat(64) }, base_head: "b".repeat(40), source_tree_sha256: "c".repeat(64) };
test("Phase 12 runner owns each fake-port evidence stage", () => assert.deepEqual(PHASE12_MAESTRO_STAGES, ["routes", "disconnected", "no-cloud", "restore-empty", "merge-adoption", "previous", "update-required", "policy", "stale-warning", "takeover", "disconnect-delete", "csv-manual"]));
test("Phase 12 runner rejects stale or non-devtest manifests", () => {
  assert.equal(validatePhase12Manifest(manifest, "b".repeat(40), "c".repeat(64)), true);
  assert.throws(() => validatePhase12Manifest({ ...manifest, profile: "production" }, "b".repeat(40), "c".repeat(64)));
  assert.throws(() => validatePhase12Manifest(manifest, "d".repeat(40), "c".repeat(64)));
});

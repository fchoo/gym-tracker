import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { publishV12AtomicShard } from "../v12-atomic-shard-publication.mjs";
import { assertV12ExactArtifactFileSet, executeV12EvidenceCli, parseV12EvidenceCliArgs, validateV12FinalNativeIdentity, validateV12FinalProductionIdentity } from "../verify-v12-native-evidence.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const hash = character => character.repeat(64);
const run = "phase20-20261017T000000Z-aaaaaaaaaaaa";

function manifest() {
  return {
    schema_version: 1, run_id: run, mode: "live", evidence_origin: "native", created_at: "2026-10-17T00:00:00Z",
    source: { head: "a".repeat(40), tree_sha256: hash("b"), dirty: false, package_json_sha256: hash("c"), package_lock_sha256: hash("d") },
    planning: { matrix_sha256: hash("e"), requirements_sha256: hash("f"), source_manifest_sha256: hash("1"), owner_brief_sha256: hash("2"), ui_spec_sha256: hash("3"), deviations_sha256: hash("4") },
    prototype: { revision: 18, approval_sha256: hash("5"), html_sha256: hash("6") }, fixtures: { registry_sha256: hash("7") },
    build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "1.2.0", version_code: 1, apk: { path: "artifacts/native/v1.2-acceptance/app.apk", sha256: hash("8"), size_bytes: 8, page_alignment_verified: true, signature_sha256: hash("9"), certificate_sha256: hash("a") } },
    device: { identity_sha256: hash("b"), abi: "arm64-v8a", installed_apk_sha256: hash("8"), settings_sha256: hash("c"), restoration_sha256: hash("d") }, configuration: { id: "AP-L-C390-P-F100" },
  };
}

test("artifact membership and command grammar reject missing, duplicate, or malformed inputs", () => {
  for (const [actual, expected] of [[null, []], [[], null], [["one", "one"], ["one"]], [["one"], ["one", "one"]], [["two"], ["one"]]]) {
    assert.throws(() => assertV12ExactArtifactFileSet(actual, expected), /v12_preflight_artifact_set_invalid/u);
  }
  for (const args of [null, [], ["--run", null, "--mode", "final"], ["--run", run, "--mode", "shards-only", "--ids", ""], ["--run", run, "--mode", "shards-only", "--ids", "sqlite,sqlite"]]) {
    assert.throws(() => parseV12EvidenceCliArgs(args), /v12_preflight_(?:cli|run_id)_invalid/u);
  }
  assert.throws(() => validateV12FinalNativeIdentity(null, {}), /v12_final_test_origin_forbidden/u);
  const nullPrototype = Object.assign(Object.create(null), manifest());
  assert.throws(() => validateV12FinalNativeIdentity(nullPrototype, {}), /v12_final_native_identity_invalid/u);
});

test("the unified CLI rejects absent, malformed, linked, or mismatched retained build manifests", t => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "closeout-build-boundary-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, "artifacts/native/v1.2", run);
  mkdirSync(directory, { recursive: true });
  const build = path.join(directory, "build.json");
  const args = ["--run", run, "--mode", "shards-only", "--ids", "sqlite"];
  assert.throws(() => executeV12EvidenceCli(args, { root }), /v12_preflight_artifact_missing/u);
  mkdirSync(build);
  assert.throws(() => executeV12EvidenceCli(args, { root }), /v12_preflight_artifact_invalid/u);
  rmSync(build, { recursive: true });
  writeFileSync(build, "not JSON");
  assert.throws(() => executeV12EvidenceCli(args, { root }), /v12_preflight_build_invalid/u);
  const another = manifest();
  another.run_id = "phase20-20261017T000000Z-bbbbbbbbbbbb";
  another.source.head = "b".repeat(40);
  writeFileSync(build, JSON.stringify(another));
  assert.throws(() => executeV12EvidenceCli(args, { root }), /v12_preflight_build_invalid/u);
  rmSync(build);
  const target = path.join(root, "fixture-build.json");
  writeFileSync(target, JSON.stringify(manifest()));
  symlinkSync(target, build);
  assert.throws(() => executeV12EvidenceCli(args, { root }), /v12_preflight_symlink_forbidden/u);
});

test("production identity rejects malformed APK bytes, failed readers, and every measured mismatch", t => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "closeout-identity-boundary-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const build = manifest();
  const file = path.join(root, build.build.apk.path);
  mkdirSync(path.dirname(file), { recursive: true });
  const apk = Buffer.from("504b0304aabbccdd", "hex");
  build.build.apk.sha256 = sha(apk);
  build.device.installed_apk_sha256 = sha(apk);
  const signature = { signature_sha256: build.build.apk.signature_sha256, certificate_sha256: build.build.apk.certificate_sha256 };
  const device = { lease_state: "clear", restoration_sha256: build.device.restoration_sha256, identity_sha256: build.device.identity_sha256, installed_apk_sha256: build.device.installed_apk_sha256, abi: build.device.abi };
  const base = { root, currentHead: () => build.source.head, currentSourceTreeSha256: () => build.source.tree_sha256, verifyApkSignature: () => signature, readDeviceIdentity: () => device };
  for (const bytes of [Buffer.from("PK"), Buffer.from("not-an-apk")]) {
    writeFileSync(file, bytes);
    assert.throws(() => validateV12FinalProductionIdentity(build, base), /v12_preflight_final_identity_invalid/u);
  }
  writeFileSync(file, apk);
  assert.equal(validateV12FinalProductionIdentity(build, base), true);
  for (const change of [
    { verifyApkSignature: () => { throw "non-error"; } },
    { verifyApkSignature: () => { throw Error("v12_preflight_fixture_reader_failed"); } },
    { readDeviceIdentity: () => null },
    { readDeviceIdentity: () => ({ ...device, lease_state: "active" }) },
    { readDeviceIdentity: () => ({ ...device, restoration_sha256: "changed" }) },
    { readDeviceIdentity: () => ({ ...device, identity_sha256: "changed" }) },
    { readDeviceIdentity: () => ({ ...device, installed_apk_sha256: "changed" }) },
    { readDeviceIdentity: () => ({ ...device, abi: "changed" }) },
    { verifyApkSignature: () => null },
    { verifyApkSignature: () => ({ ...signature, certificate_sha256: "changed" }) },
    { currentHead: () => "changed" },
    { currentSourceTreeSha256: () => "changed" },
  ]) assert.throws(() => validateV12FinalProductionIdentity(build, { ...base, ...change }), /^Error: v12_preflight_/u);
});

test("direct invalid CLI invocation exits unsuccessfully without claiming verification", () => {
  const script = fileURLToPath(new URL("../verify-v12-native-evidence.mjs", import.meta.url));
  for (const args of [["--run", run, "--mode", "unsupported"], ["--invalid"]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /(?:cli|argument)_invalid/u);
  }
});

test("hash-valid shard publications still require the artifact's actual typed schema", async t => {
  const scenarios = [
    ["SQLite null JSON", "sqlite", "sqlite/migration.json", null, /v12_preflight_json_schema_invalid/u],
    ["SQLite missing producer", "sqlite", "sqlite/migration.json", {}, /v12_preflight_json_schema_invalid/u],
    ["SQLite wrong run", "sqlite", "sqlite/migration.json", { producer: "bounded-fixture", run_id: "other" }, /v12_preflight_json_schema_invalid/u],
    ["Recovery XML without testcases", "recovery", "maestro/recovery.xml", "<testsuite></testsuite>", /v12_preflight_xml_schema_invalid/u],
    ["Performance without observation", "performance", "performance.json", { producer: "bounded-fixture", run_id: run }, /v12_preflight_performance_schema_invalid/u],
    ["Performance without launch samples", "performance", "performance.json", { producer: "bounded-fixture", run_id: run, observation: {} }, /v12_preflight_performance_schema_invalid/u],
  ];
  for (const [name, shard, artifact, value, expected] of scenarios) await t.test(name, () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "closeout-schema-boundary-")));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const runRoot = path.join(root, "artifacts/native/v1.2", run);
    mkdirSync(runRoot, { recursive: true });
    writeFileSync(path.join(runRoot, "build.json"), JSON.stringify(manifest()));
    const defaults = shard === "sqlite"
      ? ["sqlite/migration.json", "sqlite/portability.json", "sqlite/history.json"]
      : shard === "recovery" ? ["recovery/lifecycle.json", "maestro/recovery.xml"] : ["performance.json"];
    publishV12AtomicShard({ root, runId: run, shard, produce: ({ write }) => {
      for (const member of defaults) write(member, member === artifact ? value : { producer: "bounded-fixture", run_id: run });
    } });
    assert.throws(() => executeV12EvidenceCli(["--run", run, "--mode", "shards-only", "--ids", shard], { root }), expected);
  });
});

test("dynamic visual publications reject malformed indexes and cross-run member paths", async t => {
  const scenarios = [
    ["missing records", { schema_version: 2, producer: "v12-visual-capture-index/v2", run_id: run }, [], /v12_preflight_artifact_set_invalid_visual/u],
    ["invalid records", { schema_version: 2, producer: "v12-visual-capture-index/v2", run_id: run, records: null }, [], /v12_preflight_artifact_set_invalid_visual/u],
    ["missing PNG descriptor", { schema_version: 2, producer: "v12-visual-capture-index/v2", run_id: run, records: [{}] }, [], /v12_preflight_artifact_set_invalid_visual/u],
    ["foreign PNG prefix", { schema_version: 2, producer: "v12-visual-capture-index/v2", run_id: run, records: [{ native_png: { path: "artifacts/native/v1.2/other/screenshots/one.png" } }] }, [], /v12_preflight_artifact_set_invalid_visual/u],
    ["unsafe PNG suffix", { schema_version: 2, producer: "v12-visual-capture-index/v2", run_id: run, records: [{ native_png: { path: `artifacts/native/v1.2/${run}/screenshots/../one.png` } }] }, [], /v12_preflight_artifact_set_invalid_visual/u],
    ["short visual index", { schema_version: 2, producer: "v12-visual-capture-index/v2", run_id: run, capture_count: 0, windows: [], records: [] }, [], /v12_preflight_visual_index_invalid/u],
  ];
  for (const [name, index, members, expected] of scenarios) await t.test(name, () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "closeout-visual-index-")));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const runRoot = path.join(root, "artifacts/native/v1.2", run);
    mkdirSync(runRoot, { recursive: true });
    writeFileSync(path.join(runRoot, "build.json"), JSON.stringify(manifest()));
    publishV12AtomicShard({ root, runId: run, shard: "visual", produce: ({ write }) => {
      write("screenshots/index.json", index);
      for (const [member, bytes] of members) write(member, bytes);
    } });
    publishV12AtomicShard({ root, runId: run, shard: "comparison", produce: ({ write }) => {
      write("comparison/index.json", { schema_version: 3, producer: "v12-visual-comparison-index/v3", run_id: run, results: [] });
    } });
    assert.throws(() => executeV12EvidenceCli(["--run", run, "--mode", "shards-only", "--ids", "visual"], { root }), expected);
  });
});

test("Calendar publication members require the typed member registry", async t => {
  for (const registry of [{ producer: "bounded-fixture", run_id: run }, { producer: "bounded-fixture", run_id: run, members: null }]) await t.test(String(registry.members), () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "closeout-calendar-registry-")));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const runRoot = path.join(root, "artifacts/native/v1.2", run);
    mkdirSync(runRoot, { recursive: true });
    writeFileSync(path.join(runRoot, "build.json"), JSON.stringify(manifest()));
    publishV12AtomicShard({ root, runId: run, shard: "calendar", produce: ({ write }) => {
      write("calendar-transitions.json", { producer: "bounded-fixture", run_id: run });
      write("calendar-requirements.json", { producer: "bounded-fixture", run_id: run });
      write("maestro/calendar.xml", "<testsuite><testcase name='fixture'/></testsuite>");
      write("maestro/calendar-requirements.xml", "<testsuite><testcase name='fixture'/></testsuite>");
      write("calendar/artifact-registry.json", registry);
    } });
    assert.throws(() => executeV12EvidenceCli(["--run", run, "--mode", "shards-only", "--ids", "calendar"], { root }), /v12_preflight_artifact_set_invalid_calendar/u);
  });
});

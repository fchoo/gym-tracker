import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createCloseoutReadinessInputs, createCloseoutRetainedNodeFixture } from "./closeout-retained-node-fixture.mjs";
import { resolveV12NativeExecutionTools } from "../v12-native-execution-origin.mjs";
import { invokeV12NativeAdapterEnvelope } from "../v12-native-adapter.mjs";
import { publishV12AtomicShard, validateV12ExecutionOrigin, verifyV12AtomicShard } from "../v12-atomic-shard-publication.mjs";
import { createV12RunManifest } from "../create-v12-run-manifest.mjs";
import { executeV12SqliteShardCli, validateV12SqliteShard } from "../v12-sqlite-shard.mjs";
import { loadV12ContractInputs } from "../v12-evidence-contract.mjs";
import { resolveV12SourceRows } from "../v12-blocker-row-resolver.mjs";
import { buildV12ReadinessHandoff, validateV12ReadinessHandoff } from "../create-v12-readiness-handoff.mjs";
import { decodeV12ComparisonPng, runV12VisualComparisonCli, validateV12ComparisonShard, verifyV12ComparisonRecord } from "../compare-v12-visual.mjs";
import { runV12VisualCaptureCli } from "../capture-v12-visual.mjs";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
function fixture(t) {
  const root = process.env.CLOSEOUT_RETAINED_NODE_WITNESS_DIRECTORY
    ?? path.resolve("artifacts/native/personal-closeout-20261027/retained-node-corrected-proof/nine-witnesses");
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(path.join(root, "fixture-"));
  const value = createCloseoutRetainedNodeFixture({ artifactDirectory: directory });
  t.after(value.cleanup);
  return value;
}

test("the current public adapter commits a controlled lease/settings cycle with stable source witnesses", t => {
  const value = fixture(t);
  const acquired = value.invokeCurrent("acquire-lease");
  const lease = acquired.result;
  assert.match(lease.lease_id, /^[a-f0-9]{48}$/u);
  assert.equal(acquired.execution_origin.default_launcher, true);
  const snapshot = value.invokeCurrent("snapshot-settings", { lease }).result;
  assert.ok(snapshot !== null && typeof snapshot === "object");
  assert.equal(value.invokeCurrent("restore-settings", { settings: snapshot, lease }).result, true);
  assert.equal(value.invokeCurrent("release-lease", { lease }).result, true);
  const witness = JSON.parse(readFileSync(path.join(value.artifactDirectory, "witness.json"), "utf8"));
  assert.equal(witness.invocations.length, 4);
  assert.ok(witness.invocations.every(entry => entry.source_stable && entry.source_equal_at_generation));
  for (const subject of witness.generation.copied) {
    assert.equal(sha256(readFileSync(subject.snapshot)), subject.sha256);
  }
});

test("production SDK and Java resolution uses the explicit filesystem roots without executing a device tool", t => {
  const value = fixture(t);
  const sdk = path.join(value.artifactDirectory, "sdk");
  const files = ["platform-tools/adb", "build-tools/36.0.0/apksigner", "bin/java"];
  for (const relative of files) {
    const file = path.join(sdk, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  }
  const tools = value.observeInputs("explicit-sdk-and-java", files.map(relative => path.join(sdk, relative)), () =>
    resolveV12NativeExecutionTools({ requiredTools: ["adb", "apksigner", "java"], env: { ANDROID_HOME: sdk, JAVA_HOME: sdk } }));
  assert.equal(tools.adb, realpathSync(path.join(sdk, files[0])));
  assert.equal(tools.apksigner, realpathSync(path.join(sdk, files[1])));
  assert.equal(tools.java, realpathSync(path.join(sdk, files[2])));
  assert.throws(() => resolveV12NativeExecutionTools({ requiredTools: ["java"], env: { JAVA_HOME: "relative-home" } }), /java_missing/u);
});

test("production Maestro resolution checks both supported home locations and rejects their absence", t => {
  const value = fixture(t);
  const home = path.join(value.artifactDirectory, "tool-home");
  const first = path.join(home, ".local/bin/maestro");
  const second = path.join(home, ".maestro/bin/maestro");
  mkdirSync(path.dirname(first), { recursive: true });
  mkdirSync(path.dirname(second), { recursive: true });
  writeFileSync(second, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  t.mock.method(os, "homedir", () => home);
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  assert.equal(value.observeInputs("maestro-fallback", [first, second], () =>
    resolveV12NativeExecutionTools({ requiredTools: ["maestro"], env: {} })).maestro, realpathSync(second));
  writeFileSync(first, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  assert.equal(value.observeInputs("maestro-preferred", [first, second], () =>
    resolveV12NativeExecutionTools({ requiredTools: ["maestro"], env: {} })).maestro, realpathSync(first));
  unlinkSync(first);
  unlinkSync(second);
  assert.throws(() => value.observeInputs("maestro-missing", [first, second], () =>
    resolveV12NativeExecutionTools({ requiredTools: ["maestro"], env: {} })), /maestro_missing/u);
});

test("the current public adapter rejects malformed build identities before controlled execution", t => {
  const value = fixture(t);
  const original = readFileSync(value.manifestPath);
  const mutations = [
    () => "{",
    build => { build.run_id = "wrong-run"; return JSON.stringify(build); },
    build => { build.source.tree_sha256 = "bad"; return JSON.stringify(build); },
    build => { build.build.profile = "production"; return JSON.stringify(build); },
    build => { build.build.package = "wrong.package"; return JSON.stringify(build); },
    build => { delete build.device; return JSON.stringify(build); },
  ];
  try {
    for (const mutate of mutations) {
      writeFileSync(value.manifestPath, mutate(JSON.parse(original.toString("utf8"))));
      assert.throws(() => value.invokeCurrent("acquire-lease"), /v12_native_adapter_build_identity_invalid/u);
    }
  } finally {
    writeFileSync(value.manifestPath, original);
  }
});

test("copied public invocations retain their real child process and unchanged executed subject bytes", t => {
  const value = fixture(t);
  const acquired = value.invoke("acquire-lease");
  assert.equal(acquired.status, 0, acquired.stderr);
  const lease = JSON.parse(acquired.stdout);
  assert.equal(value.invoke("release-lease", { lease }).status, 0);
  const witness = JSON.parse(readFileSync(path.join(value.artifactDirectory, "witness.json"), "utf8"));
  assert.equal(witness.invocations.length, 2);
  for (const entry of witness.invocations) {
    assert.ok(Number.isSafeInteger(entry.child_pid) && entry.child_pid > 0);
    assert.equal(entry.source_stable, true);
    for (const subject of entry.before.copied) {
      assert.equal(sha256(readFileSync(subject.snapshot)), subject.sha256);
      assert.equal(entry.after.copied.find(after => after.subject === subject.subject).sha256, subject.sha256);
    }
  }
});

test("atomic publication provenance rejects inconsistent identities instead of blessing a declared origin", () => {
  const original = {
    schema_version: 1, action: "visual-capture", kind: "production-default-launcher",
    toolchain_origin: "production-attested/v1", default_launcher: true, test_only: false,
    adapter_source_sha256: "a".repeat(64), launcher_source_sha256: "b".repeat(64),
    domain_source_sha256: "c".repeat(64), request_attestation_sha256: "d".repeat(64),
  };
  assert.deepEqual(validateV12ExecutionOrigin(original), original);
  for (const invalid of [null, [], "origin", {}, { ...original, extra: true }]) {
    assert.throws(() => validateV12ExecutionOrigin(invalid), /execution_origin_invalid/u);
  }
  for (const change of [
    { schema_version: 2 }, { action: 1 }, { action: "_unknown" }, { kind: "unknown" },
    { toolchain_origin: "unknown" }, { kind: "test-fixture" },
    { default_launcher: "true" }, { test_only: "false" },
    { default_launcher: false }, { test_only: true },
    { adapter_source_sha256: "bad" }, { launcher_source_sha256: null },
    { domain_source_sha256: "bad" }, { request_attestation_sha256: "bad" },
  ]) {
    assert.throws(() => validateV12ExecutionOrigin({ ...original, ...change }), /execution_origin_invalid/u);
  }
});

test("adapter request guards reject invalid actions, payloads and mixed test markers before dispatch", t => {
  const value = fixture(t);
  for (const action of [null, 1, "unknown-action"]) {
    assert.throws(() => invokeV12NativeAdapterEnvelope(action, {}, { root: value.root, environment: {} }), /action_invalid/u);
  }
  for (const payload of [null, [], false]) {
    assert.throws(() => invokeV12NativeAdapterEnvelope("acquire-lease", payload, { root: value.root, environment: {} }), /request_invalid/u);
  }
  for (const environment of [
    { NODE_ENV: "test" },
    { V12_NATIVE_ADAPTER_TEST_MODE: "wrong" },
    { V12_NATIVE_ADAPTER_TEST_PROCESS: "1" },
  ]) {
    assert.throws(() => invokeV12NativeAdapterEnvelope("acquire-lease", {}, { root: value.root, environment }), /test_mode_inconsistent/u);
  }
  assert.throws(() => invokeV12NativeAdapterEnvelope("acquire-lease", {}, { root: value.root, environment: {} }), /run_identity_missing/u);
});

const sqliteCaseIds = ["fresh-migration", "schema27-upgrade", "supported-legacy-upgrade", "failure-reopen", "backup", "restore", "merge", "noop-replay", "rebuild", "immutable-history"];
const digest = "a".repeat(64);
function nativeContract(sourceId) {
  return {
    schemaVersion: 1, contractVersion: 1, status: "passed", total: 10, passed: 10, failed: 0, skipped: 0,
    cases: sqliteCaseIds.map(id => ({ id, status: "passed", code: "v12_acceptance_case_passed", counts: { sourceCases: 1 },
      sourceFacts: [{ registry: "sqlite-kernel", cases: [{ id: sourceId, status: "passed" }] }] })),
  };
}
function sqliteManifest() {
  return createV12RunManifest({ input: {
    requested_run_id: "phase20-20261014T031137Z-5917481c1fd1", created_at: "2026-10-14T03:11:37Z",
    source: { tree_sha256: digest, head: "5917481c1fd1" + "b".repeat(28), dirty: false, package_json_sha256: digest, package_lock_sha256: digest },
    fixtures: { registry_sha256: digest },
    build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "1.2.0", version_code: 1,
      apk: { path: "artifacts/native/v1.2-acceptance/app.apk", sha256: digest, size_bytes: 1, page_alignment_verified: true, signature_sha256: digest, certificate_sha256: digest } },
    device: { identity_sha256: digest, abi: "arm64-v8a", installed_apk_sha256: digest, settings_sha256: digest, restoration_sha256: digest },
    planning: { matrix_sha256: digest, requirements_sha256: digest, source_manifest_sha256: digest, owner_brief_sha256: digest, ui_spec_sha256: digest, deviations_sha256: digest },
    prototype: { revision: 18, approval_sha256: digest, html_sha256: digest }, configuration: { id: "AP-L-C390-P-F100" },
  } });
}

test("SQLite publication maps the validated contract snapshot instead of rereading a changed source getter", async () => {
  const manifest = sqliteManifest();
  const original = nativeContract("original-source-case");
  const later = nativeContract("unvalidated-source-case");
  let reads = 0;
  Object.defineProperty(original, "cases", { enumerable: true, get: () => ++reads === 1 ? nativeContract("original-source-case").cases : later.cases });
  const writes = [];
  const result = await executeV12SqliteShardCli(["--run", manifest.run_id, "--execute"], {
    root: "/synthetic-root", sourceDigest: digest, readBuild: () => manifest, outputExists: () => false,
    executeNative: async () => ({ status: "passed", contract: original }),
    writeObservation: async (name, value) => writes.push({ name, value }),
    writeFailureReceipt: async () => assert.fail("a validated source snapshot must not become a failed publication"),
  });
  assert.equal(result.ok, true);
  assert.equal(reads, 1);
  assert.equal(writes.length, 3);
  for (const { value } of writes) {
    assert.ok(value.case_facts.every(entry => entry.source_facts.every(source => source.cases.every(sourceCase => sourceCase.id === "original-source-case"))));
  }
});

test("SQLite source-count validation rejects an empty registry case list before publication", () => {
  const input = {
    schema_version: 1, producer: "v12-sqlite-shard",
    identity: { source_digest: digest, fixture_digest: digest, apk_digest: digest, installed_apk_digest: digest, device_digest: digest },
    cases: sqliteCaseIds.map((id, order) => ({ id, status: "passed", order,
      source_facts: [{ registry: "sqlite-kernel", cases: [{ id: "source-case", status: "passed" }] }],
      digests: { pre: digest, post: digest, reopen: digest, rebuild: digest } })),
  };
  input.cases[0].source_facts[0].cases = [];
  assert.throws(() => validateV12SqliteShard(input), /v12_sqlite_case_invalid/u);
});

test("the complete source-row resolver binds the retained synthetic dataset to its real artifact bytes", () => {
  const root = process.env.V12_PHASE20_COVERAGE_FIXTURE;
  assert.ok(typeof root === "string" && path.isAbsolute(root), "this full source-row test requires the retained synthetic dataset");
  const run = "phase20-20261014T000000Z-8591d9af8144";
  const base = path.join(root, "artifacts/native/v1.2", run);
  const manifest = JSON.parse(readFileSync(path.join(base, "build.json"), "utf8"));
  assert.equal(manifest.evidence_origin, "test");
  const inputs = loadV12ContractInputs({ root });
  const rows = resolveV12SourceRows({ inputs, manifest, root, allowTestCalendarFixture: true,
    attended: JSON.parse(readFileSync(path.join(base, "attended-observations.json"), "utf8")) });
  assert.equal(rows.length, 172);
  assert.deepEqual(rows.map(row => row.row_id), inputs.matrix.rows.map(row => row.requirement_id));
  assert.ok(rows.every(row => row.bindings.length > 0 && row.bindings.every(binding => /^[a-f0-9]{64}$/u.test(binding.sha256))));
});

test("readiness rejects malformed final rows and gate bindings before publishing a handoff", () => {
  const original = createCloseoutReadinessInputs();
  assert.doesNotThrow(() => validateV12ReadinessHandoff(buildV12ReadinessHandoff(original)));
  for (const mutate of [
    input => { input.final_evidence.schema_version = 2; },
    input => { input.final_evidence.evidence_origin = "test"; },
    input => { input.final_evidence.release_authorized = true; },
    input => { input.final_evidence.run_id = "bad"; },
    input => { input.final_evidence.identity.run_id = "other"; },
    input => { input.final_evidence.rows = {}; },
    input => { input.final_evidence.rows[0].requirement_id = ""; },
    input => { input.final_evidence.rows[0].inventory_id = 1; },
    input => { input.final_evidence.rows[0].owning_phase = 1.5; },
    input => { input.final_evidence.rows[0].coverage_class = null; },
    input => { input.final_evidence.rows[0].observations = {}; },
    input => { input.final_evidence.rows[0].verdict = "UNKNOWN"; },
    input => { input.final_evidence.rows[0].owning_phase = 99; },
    input => { input.final_evidence.rows[0].owning_phase = 14; },
    input => { input.final_evidence.gates = {}; },
    input => { input.final_evidence.gates[0].id = 1; },
    input => { input.final_evidence.gates[0].verdict = "UNKNOWN"; },
    input => { input.final_evidence.gates[0].evidence_sha256 = "bad"; },
    input => { input.final_evidence.evidence_hashes = {}; },
    input => { input.final_evidence.evidence_hashes[0] = "bad"; },
    input => { input.final_evidence.source_results = {}; },
    input => { input.final_evidence.source_results[0].row_id = "wrong"; },
    input => { input.final_evidence.source_results[0].evidence_sha256 = "bad"; },
    input => { input.final_evidence.exceptions = {}; },
  ]) {
    const input = structuredClone(original);
    mutate(input);
    assert.throws(() => buildV12ReadinessHandoff(input), /v12_readiness_invalid/u);
  }
});

test("readiness validates identity, rollback and presentation counters as independent immutable facts", () => {
  const original = createCloseoutReadinessInputs();
  for (const mutate of [
    input => { input.final_evidence.identity.device_sha256 = "bad"; },
    input => { input.final_evidence.identity.installed_apk_sha256 = "c".repeat(64); },
    input => { input.final_evidence.verdict_counts.PASS = 171; },
    input => { input.final_evidence.verdict_counts.FAIL = -1; },
    input => { input.final_evidence.accepted_exception_count = 1; },
    input => { input.final_evidence.readiness = "CONDITIONALLY_READY"; },
    input => { input.rollback.last_valid_schema_version = 0; },
    input => { input.rollback.current_schema_version = 0; },
    input => { input.rollback.compatible_archive_format_version = 0; },
    input => { input.rollback.compatible_archive_sha256 = "bad"; },
    input => { input.rollback.recovery_boundary = "silent-downgrade"; },
    input => { input.generated_at = "not-a-timestamp"; },
  ]) {
    const input = structuredClone(original);
    mutate(input);
    assert.throws(() => buildV12ReadinessHandoff(input), /v12_readiness_invalid/u);
  }
});

test("atomic publication rejects malformed build identities without publishing a success manifest", t => {
  const root = process.env.CLOSEOUT_RETAINED_NODE_WITNESS_DIRECTORY;
  assert.ok(root && path.isAbsolute(root));
  const original = sqliteManifest();
  for (const mutate of [
    build => { build.build.apk.sha256 = "b".repeat(64); },
    build => { build.evidence_origin = "unknown"; },
    build => { build.configuration.id = ""; },
    build => { build.configuration.id = 3; },
    build => { build.source.tree_sha256 = "bad"; },
    build => { build.fixtures.registry_sha256 = null; },
  ]) {
    const directory = mkdtempSync(path.join(root, "atomic-build-"));
    const run = path.join(directory, "artifacts/native/v1.2", original.run_id);
    mkdirSync(run, { recursive: true });
    const build = structuredClone(original);
    mutate(build);
    writeFileSync(path.join(run, "build.json"), JSON.stringify(build));
    assert.throws(() => publishV12AtomicShard({ root: directory, runId: original.run_id, shard: "visual",
      produce: ({ write }) => write("proof.json", { bounded: true }) }), /build_identity_invalid/u);
  }
});

test("atomic publication rechecks persisted manifest shape and member identity on every verifier call", () => {
  const root = process.env.CLOSEOUT_RETAINED_NODE_WITNESS_DIRECTORY;
  assert.ok(root && path.isAbsolute(root));
  const directory = mkdtempSync(path.join(root, "atomic-manifest-"));
  const manifest = sqliteManifest();
  const run = path.join(directory, "artifacts/native/v1.2", manifest.run_id);
  mkdirSync(run, { recursive: true });
  writeFileSync(path.join(run, "build.json"), JSON.stringify(manifest));
  const result = publishV12AtomicShard({ root: directory, runId: manifest.run_id, shard: "visual",
    produce: ({ write }) => write("proof.json", { bounded: true }) });
  const published = path.join(directory, result.manifest_path);
  const original = readFileSync(published);
  assert.equal(verifyV12AtomicShard({ root: directory, runId: manifest.run_id, shard: "visual" }), true);
  for (const mutate of [
    value => { value.schema_version = 2; }, value => { value.producer = "unknown"; },
    value => { value.run_id = "other"; }, value => { value.shard = "other"; },
    value => { value.completed = false; }, value => { value.members = {}; },
    value => { value.members = []; }, value => { value.members[0] = null; },
    value => { value.members[0].artifact = "manifest.json"; },
    value => { value.members.push(structuredClone(value.members[0])); },
    value => { value.members[0].sha256 = "bad"; },
    value => { value.members[0].size_bytes = 0; },
    value => { value.members[0].size_bytes = 0.5; },
  ]) {
    const value = JSON.parse(original.toString("utf8"));
    mutate(value);
    writeFileSync(published, JSON.stringify(value));
    assert.throws(() => verifyV12AtomicShard({ root: directory, runId: manifest.run_id, shard: "visual" }), /v12_atomic_publish_/u);
  }
  writeFileSync(published, original);
  assert.equal(verifyV12AtomicShard({ root: directory, runId: manifest.run_id, shard: "visual", allowOtherShardResidue: true }), true);
});

test("comparison proof rejects malformed envelopes, source receipts and descriptor bytes", () => {
  const root = process.env.V12_PHASE20_COVERAGE_FIXTURE;
  assert.ok(root && path.isAbsolute(root));
  const runId = "phase20-20261014T000000Z-8591d9af8144";
  const base = path.join(root, "artifacts/native/v1.2", runId);
  const capture = JSON.parse(readFileSync(path.join(base, "screenshots/index.json"), "utf8")).records[0];
  const original = JSON.parse(readFileSync(path.join(base, "comparison/index.json"), "utf8")).results[0];
  assert.equal(verifyV12ComparisonRecord({ runId, root, result: original, captureRecord: capture }), true);
  for (const mutate of [
    value => { value.schema_version = 2; }, value => { value.id = "bad"; },
    value => { value.configuration_id = 1; }, value => { value.configuration_id = "AP-L-C999-P-F100"; },
    value => { value.comparison_mode = "unknown"; }, value => { value.classification = "unknown"; },
    value => { value.counts_as_pass = false; }, value => { value.reference_binding = {}; },
    value => { value.capture_record_path = "bad"; }, value => { value.artifacts.native.sha256 = "bad"; },
    value => { value.observation.sha256 = "a".repeat(64); }, value => { value.observation.size_bytes = 1; },
    value => { value.capture_state_receipt.schema_version = 2; },
    value => { value.capture_state_receipt.nonce = "bad"; },
    value => { value.capture_state_receipt.run_id = "wrong"; },
    value => { value.capture_state_receipt.state_id = "BW-999"; },
    value => { value.capture_state_receipt.configuration_id = "bad"; },
    value => { value.capture_state_receipt.fixture_id = "bad"; },
    value => { value.capture_state_receipt.readiness_status = "bad"; },
    value => { value.capture_state_receipt.png_sha256 = "bad"; },
    value => { value.capture_state_receipt.observation_sha256 = "bad"; },
    value => { value.capture_state_receipt.source_receipt.schema_version = 1; },
    value => { value.capture_state_receipt.source_receipt.nonce = "bad"; },
    value => { value.capture_state_receipt.source_receipt.state_id = "bad"; },
    value => { value.capture_state_receipt.source_receipt.fixture_variant = "bad"; },
    value => { value.capture_state_receipt.source_receipt.assertions = []; },
    value => { value.capture_state_receipt.source_receipt.production_instance_id = "bad"; },
    value => { value.capture_state_receipt.source_receipt.mount_id = "bad"; },
    value => { value.capture_state_receipt.source_receipt.scroll_offsets = {}; },
    value => { value.capture_state_receipt.source_receipt.scroll_offsets = []; },
    value => { value.capture_state_receipt.source_receipt.scroll_offsets[0].x = -1; },
    value => { value.capture_state_receipt.source_receipt.scroll_offsets[0].y = Number.NaN; },
    value => { value.capture_state_receipt.source_receipt.scroll_offsets[0].native_id = ""; },
    value => { value.capture_state_receipt.source_receipt.scroll_offsets.push(structuredClone(value.capture_state_receipt.source_receipt.scroll_offsets[0])); },
    value => { value.capture_state_receipt.source_receipt.timer = { state: "bad", revision: 0, remaining_ms: null, ends_at_ms: null }; },
    value => { value.capture_state_receipt.source_receipt.digest = "bad"; },
    value => { value.state_receipt = {}; }, value => { value.metrics = {}; },
  ]) {
    const value = structuredClone(original);
    mutate(value);
    assert.throws(() => verifyV12ComparisonRecord({ runId, root, result: value, captureRecord: capture }), /v12_visual_compare_/u);
  }
  for (const results of [null, [], [original, original]]) {
    assert.throws(() => validateV12ComparisonShard({ run_id: runId, results }, { runId, root }), /v12_visual_compare_/u);
  }
  assert.throws(() => decodeV12ComparisonPng(Buffer.from("not PNG")), /v12_visual_compare_png_invalid/u);
});

test("visual CLIs reject malformed command grammars without starting a native capture or comparison", () => {
  for (const args of [[], ["--run"], ["--run", "bad", "--verify"], ["--run", "phase20-20261014T000000Z-aaaaaaaaaaaa", "--unknown"]]) {
    const errors = [];
    const io = { stdout: { write: () => assert.fail("invalid commands must not emit successful evidence") }, stderr: { write: value => errors.push(value) } };
    assert.equal(runV12VisualCaptureCli(args, io), 1);
    assert.equal(runV12VisualComparisonCli(args, io), 1);
    assert.equal(errors.length, 2);
  }
});

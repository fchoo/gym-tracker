/**
 * Phase 20 subprocess contract test.
 *
 * It invokes production entrypoints only.  The fake adapter, adb and Maestro
 * programs are separate processes; no production helper is imported by this
 * test.  The expected publisher interface is documented by completion()
 * below: one completed, non-staging manifest per shard at
 * publication/<shard>.json, listing immutable members and their SHA-256s.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import nodeTest from "node:test";

import { PNG } from "pngjs";
import { deriveV12PixelComparison } from "./compare-v12-visual.mjs";
import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";
import { digestV12CanonicalRestorationSnapshot } from "./v12-device-settings-contract.mjs";

const project = process.cwd();
let run = "phase20-20261014T000000Z-aaaaaaaaaaaa";
const sha = (letter) => letter.repeat(64);
const digest = (value) => createHash("sha256").update(value).digest("hex");
function refreshFunctionalMappingAuthenticators(value) {
  for (const observation of value.observations) {
    const receipt = observation.execution_receipt;
    receipt.phases[1].report_sha256 = observation.report_sha256;
    const unsigned = { ...receipt }; delete unsigned.receipt_sha256;
    receipt.receipt_sha256 = digest(JSON.stringify(unsigned));
  }
  value.execution_origin.request_attestation_sha256 = digest(JSON.stringify({
    schema_version: 2,
    action: value.shard,
    run_id: value.run_id,
    source_tree_sha256: value.identity.source_tree_sha256,
    apk_sha256: value.identity.apk_sha256,
    device_identity_sha256: value.identity.device_identity_sha256,
    flow_sha256: value.flow_sha256,
    source_sha256: value.source_sha256,
    git_attestation_sha256: value.git_attestation_sha256,
    tool_attestation_sha256: digest(JSON.stringify(value.tool_attestation)),
    measurement_sha256: digest(JSON.stringify(value.observations.map(({ device_measurement: measurement }) => measurement))),
    execution_receipt_sha256: digest(JSON.stringify(value.observations.map(({ execution_receipt: receipt }) => receipt.receipt_sha256))),
  }));
  return value;
}
const FAKE_DEVICE_FACTS = Object.freeze({ serial: "fake-device-20", abi: "arm64-v8a", apiLevel: "36", model: "Samsung N4" });
const FAKE_DEVICE_SETTINGS = Object.freeze({ font_scale: "1", ui_night_mode: "1", animator_duration_scale: "1" });
const FAKE_APK_BYTES = Buffer.from("apk");
const progress = (message) => { if (process.env.V12_BLACKBOX_PROGRESS === "1") process.stderr.write(`[v12-blackbox] ${message}\n`); };
const TEST_TIMEOUT_MS = 30 * 60_000;
const SUBPROCESS_TIMEOUT_MS = 10 * 60_000;
const FIXTURE_COMMAND_TIMEOUT_MS = 10_000;
const INLINE_HELPER_TIMEOUT_MS = 240_000;
const test = (name, optionsOrFunction, maybeFunction) => typeof optionsOrFunction === "function"
  ? nodeTest(name, { timeout: TEST_TIMEOUT_MS }, optionsOrFunction)
  : nodeTest(name, { timeout: TEST_TIMEOUT_MS, ...optionsOrFunction }, maybeFunction);

function fixtureRoot({ performanceOverBudget = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "v12-phase20-blackbox-"));
  // Production CLIs use cwd as their source/run root. These are source inputs,
  // not production modules, and the entrypoints themselves remain absolute.
  for (const member of ["scripts", "src/testing/contracts", "src/testing/phase20VisualStateRegistry.json", "src/testing/phase20CalendarFixture.ts", "maestro/v1.2", ".planning/design", ".planning/phases/20-native-acceptance", ".planning/REQUIREMENTS.md"]) {
    const source = path.join(project, member);
    if (existsSync(source)) cpSync(source, path.join(root, member), { recursive: true });
  }
  if (performanceOverBudget) {
    const adapter = path.join(root, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs");
    const source = readFileSync(adapter, "utf8");
    const original = 'if (action === "performance") return performanceEvidence(performanceIdentity, qualityNonce);';
    const replacement = 'if (action === "performance") { const value = performanceEvidence(performanceIdentity, qualityNonce); value.samples.warm_launch_to_interactive_ms = Array(20).fill(1001); value.samples.native_receipts.timings.warm_launch_to_interactive_ms.spans = value.samples.warm_launch_to_interactive_ms.map((duration, index) => ({ start_ms: index * 2000, end_ms: index * 2000 + duration })); return value; }';
    assert.ok(source.includes(original));
    writeFileSync(adapter, source.replace(original, replacement));
  }
  writeFileSync(path.join(root, "package.json"), readFileSync(path.join(project, "package.json")));
  writeFileSync(path.join(root, "package-lock.json"), readFileSync(path.join(project, "package-lock.json")));
  const git = (args, options = {}) => execFileSync("git", args, {
    cwd: root,
    timeout: FIXTURE_COMMAND_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
  git(["init", "--quiet"]);
  git(["config", "user.email", "phase20-test@example.invalid"]);
  git(["config", "user.name", "Phase 20 test"]);
  git(["add", "."]);
  git(["commit", "--quiet", "-m", "fixture"]);
  const head = git(["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  run = `phase20-20261014T000000Z-${head.slice(0, 12)}`;
  const tree = spawnSync(process.execPath, [path.join(project, "scripts/source-tree-digest.mjs")], {
    cwd: root,
    encoding: "utf8",
    timeout: FIXTURE_COMMAND_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(tree.status, 0, tree.stderr);
  mkdirSync(path.join(root, "artifacts/native/v1.2", run), { recursive: true });
  const build = buildManifest(head, tree.stdout.trim());
  writeFileSync(path.join(root, "artifacts/native/v1.2", run, "build.json"), `${JSON.stringify(build)}\n`);
  mkdirSync(path.join(root, "artifacts/native/v1.2-acceptance"), { recursive: true });
  writeFileSync(path.join(root, build.build.apk.path), FAKE_APK_BYTES);
  symlinkSync(path.join(project, "node_modules"), path.join(root, "node_modules"), "dir");
  return root;
}

function buildManifest(head, sourceTreeSha256) {
  return {
    schema_version: 1, run_id: run, mode: "live", evidence_origin: "test", created_at: "2026-10-14T00:00:00Z",
    source: { head, tree_sha256: sourceTreeSha256, dirty: false, package_json_sha256: sha("c"), package_lock_sha256: sha("d") },
    planning: { matrix_sha256: sha("e"), requirements_sha256: sha("f"), source_manifest_sha256: sha("1"), owner_brief_sha256: sha("2"), ui_spec_sha256: sha("3"), deviations_sha256: sha("4") },
    prototype: { revision: 18, approval_sha256: sha("5"), html_sha256: sha("6") }, fixtures: { registry_sha256: sha("7") },
    build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "0.1.0", version_code: 1, apk: { path: "artifacts/native/v1.2-acceptance/fake.apk", sha256: digest(FAKE_APK_BYTES), size_bytes: FAKE_APK_BYTES.length, page_alignment_verified: true, signature_sha256: sha("9"), certificate_sha256: sha("a") } },
    device: { identity_sha256: phase18DeviceIdentitySha256(FAKE_DEVICE_FACTS), abi: FAKE_DEVICE_FACTS.abi, installed_apk_sha256: digest(FAKE_APK_BYTES), settings_sha256: digestV12CanonicalRestorationSnapshot(FAKE_DEVICE_SETTINGS), restoration_sha256: sha("d") }, configuration: { id: "AP-L-C390-P-F100" },
  };
}

function invoke(root, script, args, extra = {}) {
  const bins = path.join(root, "artifacts", "fake-bin"); mkdirSync(bins, { recursive: true });
  for (const command of ["adb", "maestro", "unzip"]) writeFileSync(path.join(bins, command), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(project, "scripts/testing/v12-phase20-blackbox/fake-device-tool.mjs"))} --tool ${command} \"$@\"\n`, { mode: 0o755 });
  return spawnSync(process.execPath, [path.join(project, script), ...args], {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: SUBPROCESS_TIMEOUT_MS,
    env: { ...process.env, ...extra, PATH: `${bins}:${process.env.PATH}`, NODE_ENV: "test", V12_NATIVE_ADAPTER_TEST_MODE: "phase20-native-adapter-subprocess", V12_NATIVE_ADAPTER_TEST_PROCESS: "1", V12_NATIVE_ADAPTER_COMMAND: path.join(root, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs"), V12_NATIVE_ADAPTER_BATCH: "1", V12_DEVICE_SERIAL: "fake-device-20", V12_EXECUTION_ORIGIN: "test-controlled/v1", V12_ADB_PATH: path.join(bins, "adb"), V12_MAESTRO_PATH: path.join(bins, "maestro"), V12_UNZIP_PATH: path.join(bins, "unzip") },
  });
}

function invokeWithoutTestEnvironment(root, script, args) {
  const environment = { ...process.env, NODE_ENV: "production" };
  for (const key of ["V12_PHASE20_BLACKBOX", "V12_NATIVE_ADAPTER_TEST_MODE", "V12_NATIVE_ADAPTER_TEST_PROCESS", "V12_NATIVE_ADAPTER_COMMAND", "V12_NATIVE_ADAPTER_BATCH", "NODE_TEST_CONTEXT"]) delete environment[key];
  return spawnSync(process.execPath, [path.join(project, script), ...args], {
    cwd: root,
    encoding: "utf8",
    env: environment,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60_000,
  });
}

function pass(root, script, args, extra) {
  progress(`${script} ${args.join(" ")}`);
  const result = invoke(root, script, args, extra);
  assert.equal(result.status, 0, `${script} ${args.join(" ")}\n${result.stderr}\n${result.stdout?.slice(0, 1000)}`);
  return result;
}

function completion(root, shard) {
  // Interface assumption for WR-01's publisher integration: publication is
  // the completed-manifest directory, staging is never observable as success.
  const file = path.join(root, "artifacts/native/v1.2", run, "publication", `${shard}.json`);
  assert.equal(lstatSync(file).isSymbolicLink(), false, `${shard} manifest must not be a symlink`);
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(manifest.run_id, run); assert.equal(manifest.shard, shard); assert.equal(manifest.completed, true);
  assert.equal(manifest.identity.evidence_origin, "test");
  assert.ok(Array.isArray(manifest.members) && manifest.members.length > 0);
  if (["sqlite", "recovery", "garmin", "calendar", "multi-plan", "workout", "library-running", "visual", "comparison", "accessibility", "performance"].includes(shard)) {
    const expectedAction = {
      sqlite: "sqlite",
      recovery: "recovery",
      garmin: "garmin",
      calendar: "calendar",
      "multi-plan": "multi-plan",
      workout: "workout",
      "library-running": "library-running",
      visual: "visual-capture-batch",
      comparison: "visual-compare",
      accessibility: "accessibility",
      performance: "performance",
    }[shard];
    assert.equal(manifest.execution_origin?.kind, "test-fixture");
    assert.equal(manifest.execution_origin?.toolchain_origin, "test-controlled/v1");
    assert.equal(manifest.execution_origin?.action, expectedAction);
    assert.equal(manifest.execution_origin?.default_launcher, false);
    assert.equal(manifest.execution_origin?.test_only, true);
    assert.match(manifest.execution_origin?.domain_source_sha256 ?? "", /^[a-f0-9]{64}$/u);
    if (["multi-plan", "workout", "library-running"].includes(shard)) {
      assert.notEqual(manifest.execution_origin.domain_source_sha256, manifest.execution_origin.launcher_source_sha256);
    } else assert.equal(manifest.execution_origin.domain_source_sha256, manifest.execution_origin.launcher_source_sha256);
    if (shard === "garmin") assert.equal(manifest.domain_execution_origin, "production-attested/v1");
  }
  assert.equal(existsSync(path.join(root, "artifacts/native/v1.2", run, ".staging")), false, `${shard} left staging behind`);
  return manifest;
}

function attendedIdentity(root) {
  const manifest = JSON.parse(readFileSync(path.join(root, "artifacts/native/v1.2", run, "build.json"), "utf8"));
  return {
    run_id: run, source_tree_sha256: manifest.source.tree_sha256, apk_sha256: manifest.build.apk.sha256,
    apk_signature_sha256: manifest.build.apk.signature_sha256, installed_apk_sha256: manifest.device.installed_apk_sha256,
    config_sha256: createHash("sha256").update(manifest.configuration.id).digest("hex"),
    device: { device_sha256: manifest.device.identity_sha256, model: "SM-S916B" },
  };
}

function attendedObservations(root) {
  return {
    schema_version: 2,
    suite: "v12-samsung-attended-observations",
    identity: attendedIdentity(root),
    settings_restored: true,
    rows: Array.from({ length: 7 }, (_, index) => {
      const image = new PNG({ width: 1, height: 1 }); image.data.set([index + 1, 0, 0, 255]);
      const bytes = PNG.sync.write(image); const id = `S20-0${index + 1}`;
      const relative = `artifacts/native/v1.2/${run}/attended/${id}.png`;
      const absolute = path.join(root, relative); mkdirSync(path.dirname(absolute), { recursive: true }); writeFileSync(absolute, bytes);
      const png = { path: relative, sha256: createHash("sha256").update(bytes).digest("hex"), size_bytes: bytes.length, width: 1, height: 1 };
      return { id, status: "passed", png, attestation: { schema_version: 1, kind: "trusted-synthetic-state-content-review", fixture_id: "v12-synthetic-fixtures-r18", synthetic_state: true, content_reviewed: true, png_sha256: png.sha256 } };
    }),
  };
}

function rewriteFixturePublication(root, shard, touched = null) {
  const base = path.join(root, "artifacts/native/v1.2", run);
  if (shard === "calendar") {
    const transitionsPath = path.join(base, "calendar-transitions.json");
    const transitions = JSON.parse(readFileSync(transitionsPath, "utf8"));
    const requirements = JSON.parse(readFileSync(path.join(base, "calendar-requirements.json"), "utf8"));
    const registry = JSON.parse(readFileSync(path.join(base, "calendar/artifact-registry.json"), "utf8"));
    const nativeRequirements = { flow_sha256: requirements.flow_sha256, fixture_id: requirements.fixture_id, records: requirements.records, junit_cases: requirements.junit_cases };
    const artifacts = registry.members.map((member) => member.stage_id === undefined
      ? { requirement_id: member.requirement_id, probe_id: member.probe_id, kind: member.kind, relative_path: member.path, sha256: member.sha256, size_bytes: member.size_bytes }
      : { stage_id: member.stage_id, kind: member.kind, relative_path: member.path, sha256: member.sha256, size_bytes: member.size_bytes });
    transitions.native_receipt.evidence_set_sha256 = createHash("sha256").update(JSON.stringify({ stages: transitions.stages, requirements: nativeRequirements, artifacts })).digest("hex");
    writeFileSync(transitionsPath, JSON.stringify(transitions));
  }
  const file = path.join(base, "publication", `${shard}.json`);
  const publication = JSON.parse(readFileSync(file, "utf8"));
  for (const member of publication.members) {
    if (touched !== null && !touched.has(member.artifact)) continue;
    const bytes = readFileSync(path.join(base, member.artifact));
    member.sha256 = createHash("sha256").update(bytes).digest("hex"); member.size_bytes = bytes.length;
  }
  writeFileSync(file, JSON.stringify(publication));
}
function recoveryIdentity(build, cases, report) {
  const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
  const retryFacts = selector => cases.flatMap(({ cuts }) => cuts.map(({ snapshots }) => snapshots.after_retry[selector]));
  return {
    source_digest: build.source.tree_sha256,
    receipt_digest: digest(report),
    scenario_digest: digest(cases.map(({ id, order, steps }) => ({ id, order, steps }))),
    cut_digest: digest(cases.flatMap(({ cuts }) => cuts.map(({ receipt_sha256 }) => receipt_sha256))),
    pointer_digest: digest(retryFacts('pointer_facts')),
    effect_digest: digest(retryFacts('effect_facts')),
    rest_digest: digest(retryFacts('rest_facts')),
    history_digest: digest(retryFacts('history_facts')),
    timing_digest: digest(retryFacts('timing_facts')),
    restore_digest: digest(retryFacts('restore_facts')),
    merge_receipt_digest: digest(retryFacts('merge_receipt_facts')),
    cue_digest: digest(retryFacts('cue_count')),
  };
}

function executeGarminThroughCli(root) {
  const program = `
    import { readFileSync } from 'node:fs';
    import { executeV12GarminShardCli, V12_GARMIN_SHARD_CASE_IDS } from ${JSON.stringify(path.join(project, "scripts/v12-garmin-shard.mjs"))};
    import { publishV12AtomicShard } from ${JSON.stringify(path.join(project, "scripts/v12-atomic-shard-publication.mjs"))};
    const root = process.argv[1]; const runId = process.argv[2]; const build = JSON.parse(readFileSync(root + '/artifacts/native/v1.2/' + runId + '/build.json', 'utf8')); const writes = [];
    const origin = { schema_version: 1, action: 'garmin', kind: 'test-fixture', toolchain_origin: 'test-controlled/v1', default_launcher: false, test_only: true, adapter_source_sha256: '1'.repeat(64), launcher_source_sha256: '2'.repeat(64), domain_source_sha256: '2'.repeat(64), request_attestation_sha256: '4'.repeat(64) };
    const result = { producer: 'v12-production-garmin-host/v1', execution_origin: 'production-attested/v1', cases: V12_GARMIN_SHARD_CASE_IDS.map((id, order) => ({ id, order, status: 'PASS', code: id + '-observed', count: id === 'match-one' ? 1 : 0, receipt_sha256: String(order).padStart(64, 'a').slice(-64) })) };
    const value = await executeV12GarminShardCli(['--run', runId, '--execute'], { root, readBuild: () => build, sourceDigest: build.source.tree_sha256, currentHead: build.source.head, isAncestor: () => true, acquireLease: () => ({ opaque: true }), releaseLease: () => true, snapshotSettings: () => ({ bounded: true }), restoreSettings: () => true, executeNative: () => result, writeImmutable: (file, content) => writes.push([file, content]), outputExists: () => false });
    publishV12AtomicShard({ root, runId, shard: 'garmin', executionOrigin: origin, domainExecutionOrigin: value.execution_origin, produce: ({write}) => writes.forEach(([file, content]) => write(file.replace('artifacts/native/v1.2/' + runId + '/', ''), content)) });
    process.stdout.write(JSON.stringify(value));
  `;
  const execute = spawnSync(process.execPath, ["--input-type=module", "--eval", program, root, run], {
    cwd: root, encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(execute.status, 0, execute.stderr);
  assert.equal(JSON.parse(execute.stdout).mode, "execute");
  pass(root, "scripts/v12-garmin-shard.mjs", ["--run", run, "--verify"]);
  return completion(root, "garmin");
}

test("Phase 20 fake-device Recovery path proves offline rollback and one retry", () => {
  const root = fixtureRoot();
  try {
    pass(root, "scripts/v12-recovery-shard.mjs", ["--run", run, "--execute"]);
    pass(root, "scripts/v12-recovery-shard.mjs", ["--run", run, "--verify"]);
    const lifecycle = JSON.parse(readFileSync(path.join(
      root,
      "artifacts/native/v1.2",
      run,
      "recovery/lifecycle.json",
    ), "utf8"));
    const offline = lifecycle.cases.flatMap(({ cuts }) => cuts)
      .filter(({ cut_id }) => cut_id === "offline");
    assert.equal(offline.length, 14);
    assert.ok(offline.every(({ snapshots }) => (
      JSON.stringify(snapshots.after_reopen) === JSON.stringify(snapshots.before)
        && snapshots.after_retry.receipt_count === snapshots.before.receipt_count + 1
        && snapshots.after_retry.command_receipt_facts.length === 1
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("over-budget performance executes through the CLI and publishes one immutable FAIL observation", () => {
  const root = fixtureRoot({ performanceOverBudget: true });
  try {
    pass(root, "scripts/v12-performance-shard.mjs", ["--run", run, "--execute"]);
    const base = path.join(root, "artifacts/native/v1.2", run);
    const publicationPath = path.join(base, "publication/performance.json");
    const firstPublication = readFileSync(publicationPath);
    const output = JSON.parse(readFileSync(path.join(base, "performance.json"), "utf8"));
    assert.equal(output.observation.observation_state, "FAIL");
    assert.equal(output.observation.summary.classification, "FAIL");
    assert.equal(output.observation.summary.gates.warm_launch_to_interactive.result, "FAIL");
    completion(root, "performance");
    pass(root, "scripts/v12-performance-shard.mjs", ["--run", run, "--verify"]);
    const duplicate = invoke(root, "scripts/v12-performance-shard.mjs", ["--run", run, "--execute"]);
    assert.equal(duplicate.status, 0, duplicate.stderr);
    assert.deepEqual(JSON.parse(duplicate.stdout), { run_id: run, command: "--execute", ok: true });
    assert.deepEqual(readFileSync(publicationPath), firstPublication);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Phase 20 fake-device pipeline exercises every CLI but cannot publish preseal or final native evidence", async (t) => {
  const root = fixtureRoot();
  t.after(() => {
    const coverageFixture = process.env.V12_PHASE20_COVERAGE_FIXTURE;
    if (coverageFixture !== undefined) {
      rmSync(coverageFixture, { recursive: true, force: true });
      cpSync(root, coverageFixture, {
        recursive: true,
        filter: (source) => path.basename(source) !== "node_modules",
      });
    }
    rmSync(root, { recursive: true, force: true });
  });
  const mainRun = run;
  const blockedRoot = fixtureRoot();
  try {
    const blocked = invoke(blockedRoot, "scripts/v12-garmin-shard.mjs", ["--run", run, "--execute"]);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /garmin_execution_origin_invalid/u);
    assert.equal(existsSync(path.join(blockedRoot, "artifacts/native/v1.2", run, "publication/garmin.json")), false);
    assert.equal(existsSync(path.join(blockedRoot, "artifacts/native/v1.2", run, "garmin/packaging-auth.json")), false);
    assert.ok(existsSync(path.join(blockedRoot, "artifacts/native/v1.2", run, "failures/garmin.json")));
  } finally { rmSync(blockedRoot, { recursive: true, force: true }); run = mainRun; }
  const authRoot = fixtureRoot();
  try {
    const authRun = run;
    const auth = invoke(authRoot, "scripts/v12-garmin-shard.mjs", ["--run", authRun, "--execute"], { V12_FAKE_GARMIN_AUTH_REQUIRED: "1" });
    assert.notEqual(auth.status, 0); assert.match(auth.stderr, /auth_required/u);
    const failure = JSON.parse(readFileSync(path.join(authRoot, "artifacts/native/v1.2", authRun, "failures/garmin.json"), "utf8"));
    assert.equal(failure.failure_code, "auth_required");
    assert.equal(existsSync(path.join(authRoot, "artifacts/native/v1.2", authRun, "publication/garmin.json")), false);
  } finally { rmSync(authRoot, { recursive: true, force: true }); run = mainRun; }
  // Every retained artifact below is emitted by the production execute and
  // verify handlers; the test never writes a Garmin shard fixture directly.
  for (const script of ["scripts/v12-sqlite-shard.mjs", "scripts/v12-recovery-shard.mjs"]) for (const mode of ["--execute", "--verify"]) pass(root, script, ["--run", run, mode]);
  executeGarminThroughCli(root);
  const rejectedCalendar = invoke(root, "scripts/v12-calendar-shard.mjs", ["--run", run, "--execute"]);
  assert.notEqual(rejectedCalendar.status, 0);
  assert.match(rejectedCalendar.stderr, /calendar_native_origin_invalid/u);
  rmSync(path.join(root, "artifacts/native/v1.2", run, "failures/calendar.json"));
  pass(root, "scripts/v12-calendar-shard.mjs", ["--run", run, "--execute", "--test-fixture"]);
  for (const shard of ["multi-plan", "workout", "library-running"]) pass(root, "scripts/run-v12-maestro.mjs", ["--run", run, "--shard", shard]);
  const published = shard => existsSync(path.join(root, "artifacts/native/v1.2", run, "publication", `${shard}.json`));
  for (const [script, execute, shard] of [["scripts/capture-v12-visual.mjs", "--all", "visual"], ["scripts/compare-v12-visual.mjs", "--all", "comparison"], ["scripts/v12-accessibility-shard.mjs", "--execute", "accessibility"], ["scripts/v12-performance-shard.mjs", "--execute", "performance"]]) {
    if (!published(shard)) pass(root, script, ["--run", run, execute]);
    completion(root, shard); pass(root, script, ["--run", run, "--verify"]);
  }
  for (const shard of ["sqlite", "recovery", "garmin", "calendar", "multi-plan", "workout", "library-running", "visual", "comparison", "accessibility", "performance"]) completion(root, shard);
  pass(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "shards-only", "--ids", "multi-plan,workout,library-running"]);
  const resolved = JSON.parse(pass(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "test-resolve"]).stdout);
  assert.equal(resolved.sealable, false);
  assert.equal(resolved.row_evidence.length, 172);
  assert.equal(new Set(resolved.row_evidence.map(row => row.row_id)).size, 172);
  assert.ok(resolved.row_evidence.every(row => row.selector.type && row.selector.resolution.result === row.result));
  assert.equal(resolved.row_evidence.find(row => row.row_id === "VER-07").result, "PASS");
  writeFileSync(path.join(root, "test-resolution.json"), JSON.stringify(resolved));
  const checklist = path.join(root, "checklist.json"); const observations = path.join(root, "observations.json"); const record = path.join(root, "artifacts/native/v1.2", run, "attended-observations.json");
  writeFileSync(path.join(root, "identity.json"), JSON.stringify(attendedIdentity(root)));
  pass(root, "scripts/generate-v12-attended-checklist.mjs", ["prepare", "--identity", "identity.json", "--output", "checklist.json"]);
  writeFileSync(observations, JSON.stringify(attendedObservations(root)));
  pass(root, "scripts/generate-v12-attended-checklist.mjs", ["record", "--checklist", path.relative(root, checklist), "--observations", path.relative(root, observations), "--output", path.relative(root, record)]);
  pass(root, "scripts/generate-v12-attended-checklist.mjs", ["verify", "--checklist", path.relative(root, checklist), "--observations", path.relative(root, observations)]);
  const blockedPreseal = invoke(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "preseal", "--no-final-write"]);
  assert.notEqual(blockedPreseal.status, 0); assert.match(blockedPreseal.stderr, /test_origin_forbidden/u);
  const persistedFake = invokeWithoutTestEnvironment(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "preseal", "--no-final-write"]);
  assert.notEqual(persistedFake.status, 0); assert.match(persistedFake.stderr, /test_origin_forbidden/u);
  const blockedFinal = invoke(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "final"]);
  assert.notEqual(blockedFinal.status, 0); assert.match(blockedFinal.stderr, /test_origin_forbidden/u);
  for (const output of ["preseal-validation.json", "ui-state-matrix.json", "final-evidence.json", "parity-report.md", "readiness-handoff.md", "publication/preseal.json", "publication/final.json"]) {
    assert.equal(existsSync(path.join(root, "artifacts/native/v1.2", run, output)), false, output);
  }
  await t.test("typed ledger retains SQLite PASS and rejects source-result tampering", () => {
    // The CLI round-trip above remains the integration oracle. This separate
    // subprocess exercises the public derivation API with the same real fixture.
    const code = `
      import assert from 'node:assert/strict';
      import { readFileSync } from 'node:fs';
      import path from 'node:path';
      import { deriveV12Ledger, sealV12FinalEvidence } from ${JSON.stringify(path.join(project, 'scripts/verify-v12-native-evidence.mjs'))};
      import { loadV12ContractInputs } from ${JSON.stringify(path.join(project, 'scripts/v12-evidence-contract.mjs'))};
      import { resolveV12SourceRows } from ${JSON.stringify(path.join(project, 'scripts/v12-blocker-row-resolver.mjs'))};
      const root = process.argv[1], run = process.argv[2], base = path.join(root, 'artifacts/native/v1.2', run);
      const read = file => JSON.parse(readFileSync(path.join(base, file), 'utf8'));
      const manifest = read('build.json'), evidence = JSON.parse(readFileSync(path.join(root,'test-resolution.json'),'utf8')).row_evidence;
      const args = { inputs: loadV12ContractInputs({root}), manifest, evidence, root, readArtifact: file => readFileSync(path.join(root, file)), attended: read('attended-observations.json') };
      const ledger = deriveV12Ledger({ ...args, allowTestCalendarFixture: true });
      assert.equal(ledger.evidence_origin, 'test');
      assert.equal(ledger.readiness, 'NOT_READY');
      let writes = 0;
      assert.throws(() => sealV12FinalEvidence({mode:'final', run_id:run, ledger, writeImmutableJson:()=>{writes += 1;}}), /test_origin_forbidden/);
      assert.equal(writes, 0);
      assert.equal(ledger.rows.find(row => row.requirement_id === 'VER-07').verdict, 'PASS');
      for (const mutate of [row => {row.result = 'FAIL';}, row => {row.selector.id = 'unknown';}, row => {row.bindings[0].sha256 = '0'.repeat(64);}]) {
        const changed = structuredClone(evidence); mutate(changed[0]);
        assert.throws(() => deriveV12Ledger({...args, evidence: changed, allowTestCalendarFixture: true}), /source_resolution_mismatch/);
      }
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code, root, run], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: INLINE_HELPER_TIMEOUT_MS,
    });
    assert.equal(result.status, 0, result.stderr);
  });
  await assertSourceMutations(t, root);
});

test("Phase 20 subprocesses fail closed without leaking device identity or publishing partial staging", (t) => {
  const root = fixtureRoot(); t.after(() => rmSync(root, { recursive: true, force: true }));
  const failed = invoke(root, "scripts/v12-calendar-shard.mjs", ["--run", run, "--execute"], { V12_FAKE_DEVICE_FAIL: "calendar" });
  assert.notEqual(failed.status, 0); assert.doesNotMatch(String(failed.stdout) + String(failed.stderr), new RegExp("fake-device-20|serial|/Users/", "iu"));
  const failure = path.join(root, "artifacts/native/v1.2", run, "failures", "calendar.json"); assert.ok(existsSync(failure));
  assert.equal(existsSync(path.join(root, "artifacts/native/v1.2", run, ".staging")), false);
  for (const mutation of ["stale-source", "stale-apk", "stale-device", "private-serial"]) {
    const result = invoke(root, "scripts/v12-garmin-shard.mjs", ["--run", run, "--execute"], { V12_FAKE_DEVICE_MUTATION: mutation });
    assert.notEqual(result.status, 0, mutation); assert.doesNotMatch(String(result.stdout) + String(result.stderr), /fake-device-20|secret|token/iu);
  }
  const escape = path.join(root, "escape"); writeFileSync(escape, "outside");
  symlinkSync(escape, path.join(root, "artifacts/native/v1.2", run, "screenshots"));
  const traversal = invoke(root, "scripts/capture-v12-visual.mjs", ["--run", run, "--all"]);
  assert.notEqual(traversal.status, 0); assert.match(String(traversal.stdout) + String(traversal.stderr), /symlink|path|unsafe|invalid|failed/iu);
  const preseal = invoke(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "preseal", "--no-final-write"]);
  assert.notEqual(preseal.status, 0, "partial staging/failure runs cannot preseal");
});


async function assertSourceMutations(t, root) {
  const base = path.join(root, "artifacts/native/v1.2", run);
  const cleanOutputs = () => {
    for (const name of ["preseal-validation.json", "publication/preseal.json", "ui-state-matrix.json", "final-evidence.json", "parity-report.md", "readiness-handoff.md", "publication/final.json"]) rmSync(path.join(base, name), { force: true });
    rmSync(path.join(root, ".planning/phases/20-native-acceptance/20-READINESS-HANDOFF.md"), { force: true });
  };
  async function mutation(name, rowId, expected, shards, mutate, { invalid = false, attended = false } = {}) {
    await t.test(name, () => {
      progress(`mutation ${name}`);
      cleanOutputs();
      const saved = new Map();
      const touched = new Set();
      const edit = (file, fn, text = false) => {
        const absolute = path.join(base, file); const original = readFileSync(absolute);
        if (!saved.has(absolute)) saved.set(absolute, original);
        const changed = fn(text === 'bytes' ? original : text ? original.toString('utf8') : JSON.parse(original));
        writeFileSync(absolute, text ? changed : JSON.stringify(changed));
        touched.add(file);
      };
      for (const shard of shards) saved.set(path.join(base, "publication", `${shard}.json`), readFileSync(path.join(base, "publication", `${shard}.json`)));
      try {
        mutate(edit);
        for (const shard of shards) rewriteFixturePublication(root, shard, touched);
        const preflight = invoke(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "test-resolve"]);
        if (invalid) {
          assert.notEqual(preflight.status, 0, name);
          assert.equal(existsSync(path.join(base, "preseal-validation.json")), false);
          return;
        }
        assert.equal(preflight.status, 0, preflight.stderr);
        const report = JSON.parse(preflight.stdout);
        const selected = report.row_evidence.find(row => row.row_id === rowId);
        assert.equal(selected.result, expected, name);
        assert.equal(selected.selector.resolution.result, selected.result);
        assert.equal(existsSync(path.join(base, "final-evidence.json")), false);
      } finally { cleanOutputs(); for (const [file, content] of saved) writeFileSync(file, content); }
    });
  }
  for (const [name, mutateReceipt] of [
    ["Calendar resolver rejects a missing probe receipt", (record) => { record.probe_receipts.pop(); }],
    ["Calendar resolver rejects a duplicate probe receipt", (record) => { record.probe_receipts[1] = structuredClone(record.probe_receipts[0]); }],
    ["Calendar resolver rejects a non-PASS probe receipt", (record) => { record.probe_receipts[0].status = "FAIL"; }],
  ]) {
    await mutation(name, "CAL-01", "FAIL", ["calendar"], edit => {
      edit("calendar-transitions.json", value => value);
      edit("calendar-requirements.json", value => { mutateReceipt(value.records[0]); return value; });
    }, { invalid: true });
  }
  for (const state of ["FAIL", "NOT_RUN", "REVIEW_REQUIRED"]) {
    await mutation(`Calendar stage retains ${state}`, "CAL-07", state, ["calendar"], edit => edit("calendar-transitions.json", value => { value.stages[0].status = state; value.junit_cases[0].status = state; return value; }));
    await mutation(`Garmin case retains ${state}`, "GAR-04", state, ["garmin"], edit => {
      edit("garmin/packaging-auth.json", value => { const entry = value.cases.find(candidate => candidate.id === "account-lifecycle"); entry.status = state; entry.code = state === "FAIL" ? "account-lifecycle-evidence-mismatch" : "account-lifecycle-observed"; const native = { ...entry }; delete native.binding_sha256; entry.binding_sha256 = digest(JSON.stringify({ run_id: run, identity: value.identity, case: native })); return value; });
      edit("maestro/garmin-progress.xml", xml => {
        const changed = xml.replace(
          /(<testcase classname="v12\.garmin" name="account-lifecycle">)[\s\S]*?(<\/testcase>)/u,
          `$1${state === "FAIL" ? '<failure message="fixture failure"/>' : '<skipped message="fixture blocked"/>'}$2`,
        );
        return state === "FAIL" ? changed.replace('failures="0"', 'failures="1"').replace('skipped="18"', 'skipped="17"') : changed;
      }, true);
    });
    await mutation(`accessibility observation rejects non-producer ${state}`, "VER-04", state, ["accessibility"], edit => edit("semantics/accessibility.json", value => { const observation = value.observations[0]; if (state === "FAIL") observation.targets[0].non_color_cue = false; if (state === "NOT_RUN") observation.native_execution = "NOT_RUN"; if (state === "REVIEW_REQUIRED") delete observation.restored_settings; return value; }), { invalid: true });
    await mutation(`performance warm launch derives ${state}`, "VER-11", state, ["performance"], edit => edit("performance.json", value => { const samples = state === "FAIL" ? Array(20).fill(1001) : state === "NOT_RUN" ? [] : [100]; value.observation.raw_samples.warm_launch_to_interactive_ms = samples; value.observation.raw_samples.native_receipts.timings.warm_launch_to_interactive_ms.spans = samples.map((duration, index) => ({ start_ms: index * 2000, end_ms: index * 2000 + duration })); value.observation.summary.warm_launch_to_interactive = { samples: samples.length, max_ms: samples.length ? Math.max(...samples) : 0 }; if (state === "FAIL") { value.observation.observation_state = "FAIL"; value.observation.summary.classification = "FAIL"; value.observation.summary.gates.warm_launch_to_interactive = { result: "FAIL", samples: 20, measured: 1001, limit: 1000, metric: "max" }; } return value; }), { invalid: state !== "FAIL" });
    await mutation(`Recovery cut retains ${state}`, "VER-08", state, ["recovery"], edit => {
      let report;
      edit("maestro/recovery.xml", xml => { report = xml.replace('</properties>', `</properties>${state === 'FAIL' ? '<error/>' : '<skipped/>'}`); return report; }, true);
      edit("recovery/lifecycle.json", value => {
        value.cases[0].status = state; value.cases[0].cuts[0].status = state;
        const build = JSON.parse(readFileSync(path.join(base, "build.json"), "utf8"));
        value.identity = recoveryIdentity(build, value.cases, report);
        return value;
      });
    });
  }
  await mutation('performance failure cannot change an exact PRO row', 'PRO-01', 'PASS', ['performance'], edit => edit('performance.json', value => {
    const samples = Array(20).fill(1001);
    value.observation.raw_samples.warm_launch_to_interactive_ms = samples;
    value.observation.raw_samples.native_receipts.timings.warm_launch_to_interactive_ms.spans = samples.map((duration, index) => ({ start_ms: index * 2000, end_ms: index * 2000 + duration }));
    value.observation.observation_state = 'FAIL';
    value.observation.summary.classification = 'FAIL';
    value.observation.summary.warm_launch_to_interactive = { samples: samples.length, max_ms: 1001 };
    value.observation.summary.gates.warm_launch_to_interactive = { result: 'FAIL', samples: 20, measured: 1001, limit: 1000, metric: 'max' };
    return value;
  }));
  for (const [shard, row] of [["multi-plan", "DOM-03"], ["workout", "WRK-01"], ["library-running", "LIB-01"]]) for (const state of ["FAIL", "REVIEW_REQUIRED"]) {
    await mutation(`${shard} concrete JUnit retains ${state}`, row, state, [shard], edit => {
      let reportHash;
      edit(`maestro/${shard}.xml`, xml => {
        const changed = xml.replace(/(<testcase[^>]+)\/>/u, `$1>${state === 'FAIL' ? '<failure/>' : '<skipped/>'}</testcase>`);
        const report = /<testsuite\b[^>]*>[\s\S]*?<\/testsuite>\s*/u.exec(changed)[0];
        reportHash = createHash('sha256').update(report).digest('hex'); return changed;
      }, true);
      edit(`mapping/${shard}.json`, value => { value.observations[0].report_sha256 = reportHash; return refreshFunctionalMappingAuthenticators(value); });
    });
  }
  for (const state of ['FAIL', 'NOT_RUN', 'REVIEW_REQUIRED']) {
    await mutation(`visual byte-derived classification retains ${state}`, 'VER-02', state, ['visual', 'comparison'], edit => {
      let comparison;
      const digest = bytes => createHash('sha256').update(bytes).digest('hex');
      edit('comparison/index.json', value => {
        comparison = value.results.find(entry => entry.comparison_mode === 'retained_png');
        const referenceBytes = readFileSync(path.join(root, comparison.artifacts.reference.path));
        const reference = PNG.sync.read(referenceBytes); const native = PNG.sync.read(referenceBytes);
        const changed = state === 'FAIL' ? Math.ceil(reference.width * reference.height * 0.03)
          : state === 'REVIEW_REQUIRED' ? Math.ceil(reference.width * reference.height * 0.01) : 0;
        for (let i = 0; i < changed; i++) native.data[i * 4] = native.data[i * 4] <= 242 ? native.data[i * 4] + 13 : native.data[i * 4] - 13;
        const derived = deriveV12PixelComparison(reference, native); const encodedNative = PNG.sync.write(native); const nativeHash = digest(encodedNative);
        edit(comparison.artifacts.native.path.replace(`artifacts/native/v1.2/${run}/`, ''), () => encodedNative, 'bytes');
        Object.assign(comparison.artifacts.native, { sha256: nativeHash, size_bytes: encodedNative.length, width: native.width, height: native.height });
        for (const [kind, bytes] of Object.entries(derived.bytes)) {
          edit(comparison.artifacts[kind].path.replace(`artifacts/native/v1.2/${run}/`, ''), () => bytes, 'bytes');
          Object.assign(comparison.artifacts[kind], { sha256: digest(bytes), size_bytes: bytes.length, width: native.width, height: native.height });
        }
        let observationBytes;
        edit(comparison.observation.path.replace(`artifacts/native/v1.2/${run}/`, ''), observation => { observation.capture_png_sha256 = nativeHash; if (state === 'NOT_RUN') observation.native_execution = 'NOT_RUN'; observationBytes = Buffer.from(JSON.stringify(observation)); return observation; });
        Object.assign(comparison.observation, { sha256: digest(observationBytes), size_bytes: observationBytes.length });
        comparison.classification = state; comparison.counts_as_pass = false;
        comparison.metrics = derived.metrics;
        comparison.state_receipt.png_sha256 = comparison.artifacts.native.sha256;
        comparison.state_receipt.observation_sha256 = comparison.observation.sha256;
        comparison.capture_state_receipt.png_sha256 = comparison.artifacts.native.sha256;
        for (const window of value.windows) window.result_sha256 = digest(JSON.stringify(value.results.slice(window.offset, window.offset + window.count).map(({ state_receipt }) => state_receipt)));
        return value;
      });
      edit('screenshots/index.json', value => { const capture = value.records.find(entry => entry.state_id === comparison.id && entry.configuration_id === comparison.configuration_id); capture.native_png = comparison.artifacts.native; capture.settings.state_receipt.png_sha256 = comparison.artifacts.native.sha256; for (const window of value.windows) window.result_sha256 = digest(JSON.stringify(value.records.slice(window.offset, window.offset + window.count).map(({ settings }) => settings.state_receipt))); return value; });
    });
  }
  await mutation('visual failure is supplemental and cannot change SHL-01', 'SHL-01', 'PASS', ['visual', 'comparison'], edit => {
    let comparison;
    const digest = bytes => createHash('sha256').update(bytes).digest('hex');
    edit('comparison/index.json', value => {
      comparison = value.results.find(entry => entry.comparison_mode === 'retained_png');
      const referenceBytes = readFileSync(path.join(root, comparison.artifacts.reference.path));
      const native = PNG.sync.read(referenceBytes);
      for (let i = 0; i < Math.ceil(native.width * native.height * 0.03); i++) native.data[i * 4] = native.data[i * 4] <= 242 ? native.data[i * 4] + 13 : native.data[i * 4] - 13;
      const reference = PNG.sync.read(referenceBytes); const derived = deriveV12PixelComparison(reference, native);
      const encodedNative = PNG.sync.write(native); const nativeHash = digest(encodedNative);
      edit(comparison.artifacts.native.path.replace(`artifacts/native/v1.2/${run}/`, ''), () => encodedNative, 'bytes');
      Object.assign(comparison.artifacts.native, { sha256: nativeHash, size_bytes: encodedNative.length, width: native.width, height: native.height });
      for (const [kind, bytes] of Object.entries(derived.bytes)) {
        edit(comparison.artifacts[kind].path.replace(`artifacts/native/v1.2/${run}/`, ''), () => bytes, 'bytes');
        Object.assign(comparison.artifacts[kind], { sha256: digest(bytes), size_bytes: bytes.length, width: native.width, height: native.height });
      }
      let observationBytes;
      edit(comparison.observation.path.replace(`artifacts/native/v1.2/${run}/`, ''), observation => { observation.capture_png_sha256 = nativeHash; observationBytes = Buffer.from(JSON.stringify(observation)); return observation; });
      Object.assign(comparison.observation, { sha256: digest(observationBytes), size_bytes: observationBytes.length });
      comparison.classification = 'FAIL'; comparison.counts_as_pass = false; comparison.metrics = derived.metrics;
      comparison.state_receipt.png_sha256 = nativeHash; comparison.state_receipt.observation_sha256 = comparison.observation.sha256;
      comparison.capture_state_receipt.png_sha256 = nativeHash;
      for (const window of value.windows) window.result_sha256 = digest(JSON.stringify(value.results.slice(window.offset, window.offset + window.count).map(({ state_receipt }) => state_receipt)));
      return value;
    });
    edit('screenshots/index.json', value => { const capture = value.records.find(entry => entry.state_id === comparison.id && entry.configuration_id === comparison.configuration_id); capture.native_png = comparison.artifacts.native; capture.settings.state_receipt.png_sha256 = comparison.artifacts.native.sha256; for (const window of value.windows) window.result_sha256 = digest(JSON.stringify(value.records.slice(window.offset, window.offset + window.count).map(({ settings }) => settings.state_receipt))); return value; });
  });
  await mutation('attended failed row blocks VER-12 and its relevant gate', 'VER-12', 'FAIL', [], edit => edit('attended-observations.json', value => { value.rows[0].status = 'failed'; value.status = 'failed'; return value; }), { attended: true });
  await mutation('SQLite counts cannot substitute for concrete cases', 'VER-07', 'REVIEW_REQUIRED', ['sqlite'], edit => edit('sqlite/migration.json', value => { value.cases = 3; return value; }), { invalid: true });
  for (const kind of ['missing', 'duplicate', 'unknown', 'configuration', 'hash']) {
    await mutation(`preseal rejects ${kind} selector binding`, 'WRK-01', 'FAIL', ['workout'], edit => edit('mapping/workout.json', value => {
      if (kind === 'missing') value.case_ids.pop();
      if (kind === 'duplicate') value.case_ids[1] = value.case_ids[0];
      if (kind === 'unknown') value.case_ids[0] = 'workout.unknown';
      if (kind === 'configuration') value.identity.configuration_id = 'AP-D-C390-P-F100';
      if (kind === 'hash') value.observations[0].report_sha256 = '0'.repeat(64);
      return value;
    }), { invalid: true });
  }
}

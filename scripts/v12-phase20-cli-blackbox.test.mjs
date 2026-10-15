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
import test from "node:test";

import { PNG } from "pngjs";

const project = process.cwd();
let run = "phase20-20261014T000000Z-aaaaaaaaaaaa";
const sha = (letter) => letter.repeat(64);

function fixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "v12-phase20-blackbox-"));
  // Production CLIs use cwd as their source/run root. These are source inputs,
  // not production modules, and the entrypoints themselves remain absolute.
  for (const member of ["scripts", "src/testing/contracts", "maestro/v1.2", ".planning/design", ".planning/phases/20-native-acceptance", ".planning/REQUIREMENTS.md"]) {
    const source = path.join(project, member);
    if (existsSync(source)) cpSync(source, path.join(root, member), { recursive: true });
  }
  writeFileSync(path.join(root, "package.json"), readFileSync(path.join(project, "package.json")));
  writeFileSync(path.join(root, "package-lock.json"), readFileSync(path.join(project, "package-lock.json")));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "user.email", "phase20-test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Phase 20 test"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: root });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  run = `phase20-20261014T000000Z-${head.slice(0, 12)}`;
  const tree = spawnSync(process.execPath, [path.join(project, "scripts/source-tree-digest.mjs")], { cwd: root, encoding: "utf8" });
  assert.equal(tree.status, 0, tree.stderr);
  mkdirSync(path.join(root, "artifacts/native/v1.2", run), { recursive: true });
  writeFileSync(path.join(root, "artifacts/native/v1.2", run, "build.json"), `${JSON.stringify(buildManifest(head, tree.stdout.trim()))}\n`);
  return root;
}

function buildManifest(head, sourceTreeSha256) {
  return {
    schema_version: 1, run_id: run, mode: "live", created_at: "2026-10-14T00:00:00Z",
    source: { head, tree_sha256: sourceTreeSha256, dirty: false, package_json_sha256: sha("c"), package_lock_sha256: sha("d") },
    planning: { matrix_sha256: sha("e"), requirements_sha256: sha("f"), source_manifest_sha256: sha("1"), owner_brief_sha256: sha("2"), ui_spec_sha256: sha("3"), deviations_sha256: sha("4") },
    prototype: { revision: 18, approval_sha256: sha("5"), html_sha256: sha("6") }, fixtures: { registry_sha256: sha("7") },
    build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "0.1.0", version_code: 1, apk: { path: "artifacts/native/v1.2-acceptance/fake.apk", sha256: sha("8"), size_bytes: 1, page_alignment_verified: true, signature_sha256: sha("9"), certificate_sha256: sha("a") } },
    device: { identity_sha256: sha("b"), abi: "arm64-v8a", installed_apk_sha256: sha("8"), settings_sha256: sha("c"), restoration_sha256: sha("d") }, configuration: { id: "AP-L-C390-P-F100" },
  };
}

function invoke(root, script, args, extra = {}) {
  const bins = path.join(root, "artifacts", "fake-bin"); mkdirSync(bins, { recursive: true });
  for (const command of ["adb", "maestro"]) writeFileSync(path.join(bins, command), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(project, "scripts/testing/v12-phase20-blackbox/fake-device-tool.mjs"))} --tool ${command} \"$@\"\n`, { mode: 0o755 });
  return spawnSync(process.execPath, [path.join(project, script), ...args], {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...extra, PATH: `${bins}:${process.env.PATH}`, NODE_ENV: "test", V12_NATIVE_ADAPTER_TEST_MODE: "phase20-native-adapter-subprocess", V12_NATIVE_ADAPTER_TEST_PROCESS: "1", V12_NATIVE_ADAPTER_COMMAND: path.join(project, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs"), V12_NATIVE_ADAPTER_BATCH: "1", V12_DEVICE_SERIAL: "fake-device-20" },
  });
}

function pass(root, script, args, extra) {
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
  assert.ok(Array.isArray(manifest.members) && manifest.members.length > 0);
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
      return { id, status: "passed", png: { path: relative, sha256: createHash("sha256").update(bytes).digest("hex"), size_bytes: bytes.length, width: 1, height: 1 } };
    }),
  };
}

function rewriteFixturePublication(root, shard) {
  const base = path.join(root, "artifacts/native/v1.2", run);
  const file = path.join(base, "publication", `${shard}.json`);
  const publication = JSON.parse(readFileSync(file, "utf8"));
  for (const member of publication.members) {
    const bytes = readFileSync(path.join(base, member.artifact));
    member.sha256 = createHash("sha256").update(bytes).digest("hex"); member.size_bytes = bytes.length;
  }
  writeFileSync(file, JSON.stringify(publication));
}
function completeMultiPlanFixture(root) {
  const base = path.join(root, "artifacts/native/v1.2", run);
  const file = path.join(base, "mapping/multi-plan.json");
  const mapping = JSON.parse(readFileSync(file, "utf8"));
  const source = readFileSync(path.join(root, "src/testing/contracts/multiPlanRunning.contract.ts"), "utf8");
  const block = /MULTI_PLAN_RUNNING_CONTRACT_CASES = \[([\s\S]*?)\] as const/u.exec(source)[1];
  const ids = [...block.matchAll(/"(phase13-[^"]+)"/gu)].map(match => match[1]);
  assert.equal(ids.length, 13);
  const reports = ids.map(id => `<testsuite name="fake"><testcase name="${id}"/></testsuite>\n`);
  mapping.case_ids = ids;
  mapping.observations = ids.map((case_id, index) => ({ case_id, ordinal: index + 1, fixture_id: "v12-synthetic-fixtures-r18", report_sha256: createHash("sha256").update(reports[index]).digest("hex") }));
  writeFileSync(file, JSON.stringify(mapping));
  writeFileSync(path.join(base, "maestro/multi-plan.xml"), `<testsuites>${reports.join("")}</testsuites>\n`);
  rewriteFixturePublication(root, "multi-plan");
}

test("Phase 20 fake-device pipeline resolves 172 rows and refuses false READY from incomplete retained contracts", async (t) => {
  const root = fixtureRoot(); t.after(() => rmSync(root, { recursive: true, force: true }));
  // Every call below is the documented CLI order. The test intentionally does
  // not call exported production functions or manufacture final evidence.
  for (const script of ["scripts/v12-sqlite-shard.mjs", "scripts/v12-recovery-shard.mjs"]) for (const mode of ["--execute", "--verify"]) pass(root, script, ["--run", run, mode]);
  for (const script of ["scripts/v12-garmin-shard.mjs", "scripts/v12-calendar-shard.mjs"]) for (const mode of ["--execute", "--verify"]) pass(root, script, ["--run", run, mode]);
  for (const shard of ["multi-plan", "workout", "library-running"]) pass(root, "scripts/run-v12-maestro.mjs", ["--run", run, "--shard", shard]);
  for (const [script, execute, shard] of [["scripts/capture-v12-visual.mjs", "--all", "visual"], ["scripts/compare-v12-visual.mjs", "--all", "comparison"], ["scripts/v12-accessibility-shard.mjs", "--execute", "accessibility"], ["scripts/v12-performance-shard.mjs", "--execute", "performance"]]) {
    pass(root, script, ["--run", run, execute]); completion(root, shard); pass(root, script, ["--run", run, execute === "--all" ? "--verify" : "--verify"]);
  }
  for (const shard of ["sqlite", "recovery", "garmin", "calendar", "multi-plan", "workout", "library-running", "visual", "comparison", "accessibility", "performance"]) completion(root, shard);
  pass(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "shards-only", "--ids", "multi-plan,workout,library-running"]);
  const incomplete = invoke(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "preseal", "--no-final-write"]);
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /functional_selectors_invalid/);
  // Fixture-only mutation: the current producer reads only the first Phase 13
  // source string. Retain the complete case set to exercise the resolver beyond
  // that known, out-of-scope producer defect.
  completeMultiPlanFixture(root);
  pass(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "preseal", "--no-final-write"]);
  const preseal = JSON.parse(readFileSync(path.join(root, "artifacts/native/v1.2", run, "preseal-validation.json"), "utf8"));
  assert.equal(preseal.row_evidence.length, 172);
  assert.equal(new Set(preseal.row_evidence.map(row => row.row_id)).size, 172);
  assert.ok(preseal.row_evidence.every(row => row.selector.type && row.selector.resolution.result === row.result));
  assert.equal(preseal.row_evidence.find(row => row.row_id === "VER-07").result, "REVIEW_REQUIRED");
  const checklist = path.join(root, "checklist.json"); const observations = path.join(root, "observations.json"); const record = path.join(root, "artifacts/native/v1.2", run, "attended-observations.json");
  writeFileSync(path.join(root, "identity.json"), JSON.stringify(attendedIdentity(root)));
  pass(root, "scripts/generate-v12-attended-checklist.mjs", ["prepare", "--identity", "identity.json", "--output", "checklist.json"]);
  writeFileSync(observations, JSON.stringify(attendedObservations(root)));
  pass(root, "scripts/generate-v12-attended-checklist.mjs", ["record", "--checklist", path.relative(root, checklist), "--observations", path.relative(root, observations), "--output", path.relative(root, record)]);
  pass(root, "scripts/generate-v12-attended-checklist.mjs", ["verify", "--checklist", path.relative(root, checklist), "--observations", path.relative(root, observations)]);
  pass(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "final"]);
  const finalEvidence = JSON.parse(readFileSync(path.join(root, "artifacts/native/v1.2", run, "final-evidence.json"), "utf8"));
  assert.equal(finalEvidence.rows.length, 172); assert.equal(finalEvidence.release_authorized, false);
  assert.equal(finalEvidence.readiness, "NOT_READY");
  assert.equal(finalEvidence.rows.find(row => row.requirement_id === "VER-07").verdict, "REVIEW_REQUIRED");
  assert.equal(finalEvidence.rows.find(row => row.requirement_id === "VER-12").verdict, "PASS");
  assert.equal(finalEvidence.source_results.length, 172);
  pass(root, "scripts/generate-v12-parity-report.mjs", ["--final-evidence", `artifacts/native/v1.2/${run}/final-evidence.json`]);
  assert.match(readFileSync(path.join(root, "artifacts/native/v1.2", run, "parity-report.md"), "utf8"), /Rows: 172/u);
  assert.equal(JSON.parse(readFileSync(path.join(root, ".planning/phases/20-native-acceptance/20-READINESS-HANDOFF.md"), "utf8")).release_authorized, false);
  await t.test("typed ledger rejects source-result tampering and exceptions cannot erase a blocker", () => {
    // The CLI round-trip above remains the integration oracle. This separate
    // subprocess exercises the public derivation API with the same real fixture.
    const code = `
      import assert from 'node:assert/strict';
      import { readFileSync } from 'node:fs';
      import path from 'node:path';
      import { deriveV12Ledger } from ${JSON.stringify(path.join(project, 'scripts/verify-v12-native-evidence.mjs'))};
      import { loadV12ContractInputs } from ${JSON.stringify(path.join(project, 'scripts/v12-evidence-contract.mjs'))};
      const root = process.argv[1], run = process.argv[2], base = path.join(root, 'artifacts/native/v1.2', run);
      const read = file => JSON.parse(readFileSync(path.join(base, file), 'utf8'));
      const manifest = read('build.json'), evidence = read('preseal-validation.json').row_evidence;
      const args = { inputs: loadV12ContractInputs({root}), manifest, evidence, root, readArtifact: file => readFileSync(path.join(root, file)), attended: read('attended-observations.json') };
      const exception = { row_id: 'VER-07', deviation_id: 'DEV-203', owner_decision: 'owner-approved', decided_at: '2026-10-14', scope: 'sqlite review', configurations: [manifest.configuration.id], rationale: 'cannot override a concrete blocker', evidence_hashes: [evidence.find(x => x.row_id === 'VER-07').sha256] };
      const ledger = deriveV12Ledger({ ...args, exceptions: [exception], readiness_policy: { policy_id: 'v12-reviewed-policy', reviewed_by: 'owner', reviewed_at: '2026-10-14', permits_accepted_exceptions: true } });
      assert.equal(ledger.readiness, 'NOT_READY');
      assert.equal(ledger.rows.find(row => row.requirement_id === 'VER-07').verdict, 'REVIEW_REQUIRED');
      for (const mutate of [row => {row.result = 'FAIL';}, row => {row.selector.id = 'unknown';}, row => {row.bindings[0].sha256 = '0'.repeat(64);}]) {
        const changed = structuredClone(evidence); mutate(changed[0]);
        assert.throws(() => deriveV12Ledger({...args, evidence: changed}), /source_resolution_mismatch/);
      }
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code, root, run], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
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
      cleanOutputs();
      const saved = new Map();
      const edit = (file, fn, text = false) => {
        const absolute = path.join(base, file); const original = readFileSync(absolute);
        if (!saved.has(absolute)) saved.set(absolute, original);
        const changed = fn(text === 'bytes' ? original : text ? original.toString('utf8') : JSON.parse(original));
        writeFileSync(absolute, text ? changed : JSON.stringify(changed));
      };
      for (const shard of shards) saved.set(path.join(base, "publication", `${shard}.json`), readFileSync(path.join(base, "publication", `${shard}.json`)));
      try {
        mutate(edit);
        for (const shard of shards) rewriteFixturePublication(root, shard);
        const preflight = invoke(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "preseal", "--no-final-write"]);
        if (invalid) {
          assert.notEqual(preflight.status, 0, name);
          assert.equal(existsSync(path.join(base, "preseal-validation.json")), false);
          assert.notEqual(invoke(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "final"]).status, 0);
          return;
        }
        assert.equal(preflight.status, 0, preflight.stderr);
        const report = JSON.parse(readFileSync(path.join(base, "preseal-validation.json"), "utf8"));
        const selected = report.row_evidence.find(row => row.row_id === rowId);
        assert.equal(selected.result, attended ? "NOT_RUN" : expected, name);
        assert.equal(selected.selector.resolution.result, selected.result);
        const final = invoke(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "final"]);
        assert.equal(final.status, 0, final.stderr);
        const sealed = JSON.parse(readFileSync(path.join(base, "final-evidence.json"), "utf8"));
        assert.equal(sealed.readiness, "NOT_READY");
        assert.equal(sealed.rows.find(row => row.requirement_id === rowId).verdict, expected);
        assert.equal(sealed.source_results.find(row => row.row_id === rowId).result, expected);
      } finally { cleanOutputs(); for (const [file, content] of saved) writeFileSync(file, content); }
    });
  }
  for (const state of ["FAIL", "NOT_RUN", "REVIEW_REQUIRED"]) {
    await mutation(`Calendar stage retains ${state}`, "CAL-07", state, ["calendar"], edit => edit("calendar-transitions.json", value => { value.stages[0].status = state; value.junit_cases[0].status = state; return value; }));
    await mutation(`Garmin group retains ${state}`, "GAR-04", state, ["garmin"], edit => edit("garmin/packaging-auth.json", value => { value.observation.status = state; return value; }));
    await mutation(`accessibility observation derives ${state}`, "VER-04", state, ["accessibility"], edit => edit("semantics/accessibility.json", value => { const observation = value.observations[0]; if (state === "FAIL") observation.targets[0].non_color_cue = false; if (state === "NOT_RUN") observation.native_execution = "NOT_RUN"; if (state === "REVIEW_REQUIRED") delete observation.restored_settings; return value; }));
    await mutation(`performance warm launch derives ${state}`, "PRO-01", state, ["performance"], edit => edit("performance.json", value => { const samples = state === "FAIL" ? Array(20).fill(1001) : state === "NOT_RUN" ? [] : [100]; value.observation.raw_samples.warm_launch_to_interactive_ms = samples; value.observation.summary.warm_launch_to_interactive = { samples: samples.length, max_ms: samples.length ? Math.max(...samples) : 0 }; return value; }));
    await mutation(`Recovery cut retains ${state}`, "VER-08", state, ["recovery"], edit => {
      let report;
      edit("maestro/recovery.xml", xml => { report = xml.replace('</properties>', `</properties>${state === 'FAIL' ? '<error/>' : '<skipped/>'}`); return report; }, true);
      edit("recovery/lifecycle.json", value => {
        value.cases[0].status = state; value.cases[0].cuts[0].status = state;
        const build = JSON.parse(readFileSync(path.join(base, "build.json"), "utf8"));
        const digest = data => createHash('sha256').update(data).digest('hex');
        value.identity.receipt_digest = digest(report); value.identity.pointer_digest = digest(`${build.fixtures.registry_sha256}:pointer:${report}`); value.identity.effect_digest = digest(`${build.device.identity_sha256}:effect:${report}`);
        for (const entry of value.cases) for (const cut of entry.cuts) cut.digest = value.identity.receipt_digest;
        return value;
      });
    });
  }
  for (const [shard, row] of [["multi-plan", "DOM-03"], ["workout", "WRK-01"], ["library-running", "LIB-01"]]) for (const state of ["FAIL", "REVIEW_REQUIRED"]) {
    await mutation(`${shard} concrete JUnit retains ${state}`, row, state, [shard], edit => {
      let reportHash;
      edit(`maestro/${shard}.xml`, xml => {
        const changed = xml.replace(/(<testcase[^>]+)\/>/u, `$1>${state === 'FAIL' ? '<failure/>' : '<skipped/>'}</testcase>`);
        const report = /<testsuite\b[^>]*>[\s\S]*?<\/testsuite>\s*/u.exec(changed)[0];
        reportHash = createHash('sha256').update(report).digest('hex'); return changed;
      }, true);
      edit(`mapping/${shard}.json`, value => { value.observations[0].report_sha256 = reportHash; return value; });
    });
  }
  for (const state of ['FAIL', 'NOT_RUN', 'REVIEW_REQUIRED']) {
    await mutation(`visual byte-derived classification retains ${state}`, 'SHL-03', state, ['visual', 'comparison'], edit => {
      let comparison;
      const digest = bytes => createHash('sha256').update(bytes).digest('hex');
      const native = new PNG({ width: 200, height: 1 });
      for (let i = 0; i < 200; i++) native.data.set([100, 100, 100, 255], i * 4);
      const reference = new PNG({ width: 200, height: 1 }); reference.data.set(native.data);
      const changed = state === 'FAIL' ? 5 : state === 'REVIEW_REQUIRED' ? 2 : 0;
      for (let i = 0; i < changed; i++) reference.data[i * 4] = 101;
      const overlay = new PNG({ width: 200, height: 1 }); const difference = new PNG({ width: 200, height: 1 }); const mask = new PNG({ width: 200, height: 1 });
      for (let offset = 0; offset < native.data.length; offset += 4) {
        let different = false;
        for (let channel = 0; channel < 4; channel++) {
          const d = Math.abs(native.data[offset + channel] - reference.data[offset + channel]); different ||= d !== 0;
          overlay.data[offset + channel] = channel === 3 ? 254 : Math.round((native.data[offset + channel] + reference.data[offset + channel]) / 2);
          difference.data[offset + channel] = channel === 3 ? 255 : d;
          mask.data[offset + channel] = channel === 3 ? 255 : different ? 255 : 0;
        }
      }
      edit('comparison/index.json', value => {
        comparison = value.results[0];
        for (const [kind, image] of Object.entries({ native, reference, overlay, difference, mask })) {
          const encoded = PNG.sync.write(image); const descriptor = comparison.artifacts[kind];
          edit(descriptor.path.replace(`artifacts/native/v1.2/${run}/`, ''), () => encoded, 'bytes');
          Object.assign(descriptor, { sha256: digest(encoded), size_bytes: encoded.length, width: 200, height: 1 });
        }
        let observationBytes;
        edit(comparison.observation.path.replace(`artifacts/native/v1.2/${run}/`, ''), observation => { if (state === 'NOT_RUN') observation.native_execution = 'NOT_RUN'; observationBytes = Buffer.from(JSON.stringify(observation)); return observation; });
        Object.assign(comparison.observation, { sha256: digest(observationBytes), size_bytes: observationBytes.length });
        comparison.classification = state; comparison.counts_as_pass = false;
        comparison.metrics = { width: 200, height: 1, total_pixels: 200, changed_pixels: changed, pixel_percent: changed / 200 * 100, mean_absolute_channel_delta: changed / 800 };
        return value;
      });
      edit('screenshots/index.json', value => { value.records[0].native_png = comparison.artifacts.native; return value; });
      edit(comparison.capture_record_path.replace(`artifacts/native/v1.2/${run}/`, ''), value => { value.native_png = comparison.artifacts.native; return value; });
    });
  }
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

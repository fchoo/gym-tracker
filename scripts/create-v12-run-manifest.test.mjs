import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createV12RunManifest,
  createV12RunId,
  executeV12RunManifestCli,
  parseV12RunManifestCliArgs,
  validateV12RunManifest,
} from "./create-v12-run-manifest.mjs";
import { sourceTreeSha256AtHead } from "./source-tree-digest.mjs";

const HASH = "a".repeat(64);
const HEAD = "b".repeat(40);
const buildInput = (overrides = {}) => ({
  evidence_origin: "native",
  created_at: "2026-10-14T12:34:56Z",
  source: {
    head: HEAD,
    tree_sha256: HASH,
    dirty: false,
    package_json_sha256: "c".repeat(64),
    package_lock_sha256: "d".repeat(64),
  },
  planning: {
    matrix_sha256: "e".repeat(64),
    requirements_sha256: "f".repeat(64),
    source_manifest_sha256: "1".repeat(64),
    owner_brief_sha256: "2".repeat(64),
    ui_spec_sha256: "3".repeat(64),
    deviations_sha256: "4".repeat(64),
  },
  prototype: {
    revision: 18,
    approval_sha256: "5".repeat(64),
    html_sha256: "6".repeat(64),
  },
  fixtures: { registry_sha256: "7".repeat(64) },
  build: {
    profile: "development-test",
    package: "com.fchoo.gymtracker.devtest",
    version_name: "1.2.0",
    version_code: 120,
    apk: {
      path: "artifacts/native/v1.2-acceptance/gym-tracker-v12-devtest.apk",
      sha256: "8".repeat(64),
      size_bytes: 1048576,
      page_alignment_verified: true,
      signature_sha256: "9".repeat(64),
      certificate_sha256: "0".repeat(64),
    },
  },
  device: {
    identity_sha256: "a".repeat(64),
    abi: "arm64-v8a",
    installed_apk_sha256: "8".repeat(64),
    settings_sha256: "b".repeat(64),
    restoration_sha256: "c".repeat(64),
  },
  configuration: { id: "AP-L-C390-P-F100" },
  ...overrides,
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeFixtureFile(root, relativePath, contents) {
  const destination = path.join(root, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function createCliFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "v12-run-manifest-"));
  const requiredFiles = {
    "package.json": "{\"name\":\"fixture\"}\n",
    "package-lock.json": "{\"lockfileVersion\":3}\n",
    ".planning/REQUIREMENTS.md": "# Requirements\n",
    ".planning/v1.2-OWNER-BRIEF.md": "# Owner brief\n",
    ".planning/phases/20-native-acceptance/20-UI-SPEC.md": "# UI spec\n",
    ".planning/design/v1.2-prototype-parity-matrix.json": "{}\n",
    ".planning/design/v1.2-DEVIATIONS.md": "# Deviations\n",
    ".planning/design/v1.2-browser-evidence/serial-walk.json": "{}\n",
    ".planning/design/v1.2-browser-evidence/source-manifest.json": JSON.stringify({
      revision: 18,
      sources: [{ sha256: "1".repeat(64) }, { sha256: "2".repeat(64) }],
    }),
  };
  for (const [relativePath, contents] of Object.entries(requiredFiles)) {
    writeFixtureFile(root, relativePath, contents);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "V12 Fixture"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const apkBytes = "fixture-apk";
  const apkSha256 = sha256(apkBytes);
  mkdirSync(path.join(root, "artifacts/native/v1.2"), { recursive: true });
  writeFixtureFile(root, "artifacts/native/v1.2-acceptance/gym-tracker-v12-devtest.apk", apkBytes);
  writeFixtureFile(root, "artifacts/native/v1.2-acceptance/build.json", JSON.stringify({
    suite: "v1.2-acceptance",
    profile: "development-test",
    build_variant: "release",
    package: "com.fchoo.gymtracker.devtest",
    base_head: head,
    source_tree_sha256: sourceTreeSha256AtHead(head, root),
    apk: {
      path: "artifacts/native/v1.2-acceptance/gym-tracker-v12-devtest.apk",
      sha256: apkSha256,
      size_bytes: Buffer.byteLength(apkBytes),
      page_alignment_verified: true,
    },
    device: { abi: "arm64-v8a" },
    v12_evidence_identity: {
      retained_apk_sha256: apkSha256,
      installed_apk_sha256: apkSha256,
      signature_sha256: "3".repeat(64),
      certificate_sha256: "4".repeat(64),
      device_identity_sha256: "5".repeat(64),
      settings_sha256: "6".repeat(64),
      restoration_sha256: "7".repeat(64),
    },
  }));
  return { root, head };
}

test("creates a canonical identity-bound live run manifest with a UTC run ID", () => {
  const manifest = createV12RunManifest({ input: buildInput() });
  assert.equal(manifest.run_id, `phase20-20261014T123456Z-${HEAD.slice(0, 12)}`);
  assert.equal(manifest.mode, "live");
  assert.equal(manifest.evidence_origin, "native");
  assert.equal(manifest.build.apk.sha256, manifest.device.installed_apk_sha256);
  assert.equal(JSON.stringify(manifest), JSON.stringify(createV12RunManifest({ input: buildInput() })));
  assert.deepEqual(validateV12RunManifest(manifest), manifest);
  assert.ok(Object.isFrozen(manifest));
});

test("rejects run reuse, overwrite, rename-to-pass, and pre-existing outputs", () => {
  const runId = `phase20-20261014T123456Z-${HEAD.slice(0, 12)}`;
  assert.throws(() => createV12RunManifest({ input: buildInput(), existing_run_ids: [runId] }), /v12_run_manifest_run_reuse/u);
  assert.throws(() => createV12RunManifest({ input: buildInput(), output_exists: true }), /v12_run_manifest_output_exists/u);
  assert.throws(() => createV12RunManifest({ input: buildInput({ requested_run_id: `${runId}-pass` }) }), /v12_run_manifest_run_id_invalid/u);
});

test("allows only the explicit pre-build schema fixture to omit artifact and device evidence", () => {
  const fixture = buildInput({
    mode: "prebuild_schema_fixture",
    build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "1.2.0", version_code: 120 },
    device: undefined,
    configuration: undefined,
  });
  const manifest = createV12RunManifest({ input: fixture });
  assert.equal(manifest.mode, "prebuild_schema_fixture");
  assert.equal(manifest.build.apk, undefined);
  assert.equal(manifest.device, undefined);

  assert.throws(() => createV12RunManifest({ input: buildInput({ device: undefined }) }), /v12_run_manifest_live_identity_invalid/u);
});

test("fails closed on substituted, private, hostile, or incomplete identity values", () => {
  assert.throws(() => createV12RunManifest({ input: buildInput({
    build: { ...buildInput().build, apk: { ...buildInput().build.apk, path: "../private.apk" } },
  }) }), /v12_run_manifest_safe_path_invalid/u);
  assert.throws(() => createV12RunManifest({ input: buildInput({
    device: { ...buildInput().device, installed_apk_sha256: HASH },
  }) }), /v12_run_manifest_live_identity_invalid/u);
  assert.throws(() => validateV12RunManifest({ ...createV12RunManifest({ input: buildInput() }), unexpected: true }), /v12_run_manifest_exact_keys_invalid/u);
  assert.throws(() => createV12RunManifest({ input: buildInput({ source: { ...buildInput().source, dirty: true } }) }), /v12_run_manifest_source_invalid/u);
  assert.throws(() => createV12RunManifest({ input: buildInput({ created_at: "2026-10-14T12:34:56.789Z" }) }), /v12_run_manifest_timestamp_invalid/u);
  assert.throws(() => createV12RunManifest({ input: buildInput({ evidence_origin: "test" }) }), /v12_run_manifest_origin_invalid/u);
});

test("accepts only the explicit create and build-only verification CLI modes", () => {
  assert.deepEqual(parseV12RunManifestCliArgs(["--from-build", "--create"]), { mode: "create" });
  assert.deepEqual(parseV12RunManifestCliArgs(["--run", `phase20-20261014T123456Z-${HEAD.slice(0, 12)}`, "--verify-build-only"]), {
    mode: "verify", runId: `phase20-20261014T123456Z-${HEAD.slice(0, 12)}`,
  });
  assert.throws(() => parseV12RunManifestCliArgs(["--from-build"]), /v12_run_manifest_cli_invalid/u);
  assert.throws(() => parseV12RunManifestCliArgs(["--run", "bad", "--verify-build-only"]), /v12_run_manifest_cli_invalid/u);
});

test("canonicalizes non-zero millisecond CLI timestamps to an exact UTC run identity", () => {
  const fixture = createCliFixture();
  try {
    const manifest = executeV12RunManifestCli(["--from-build", "--create"], {
      root: fixture.root,
      now: () => new Date("2026-10-14T12:34:56.789Z"),
    });
    assert.equal(manifest.created_at, "2026-10-14T12:34:56Z");
    assert.equal(manifest.run_id, `phase20-20261014T123456Z-${fixture.head.slice(0, 12)}`);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});


const candidate=()=>structuredClone(createV12RunManifest({input:buildInput()}));

test('manifest validation captures an APK path getter once before every path and canonical check',()=>{
 const value=candidate(),path=value.build.apk.path;value.evidence_origin='test';let reads=0;
 Object.defineProperty(value.build.apk,'path',{enumerable:true,get:()=>++reads<=2?path:'../../foreign.apk'});
 const result=validateV12RunManifest(value);assert.equal(reads,1);assert.equal(result.build.apk.path,path);assert.equal(result.evidence_origin,'test');assert.ok(Object.isFrozen(result.build.apk));assert.notEqual(result,value);assert.notEqual(result.build,value.build);
});
test('manifest validation preserves existing root and nested class prototype rejection',()=>{
 class Foreign{constructor(fields){Object.assign(this,fields)}}
 const value=candidate();assert.throws(()=>validateV12RunManifest(new Foreign(value)),/^Error: v12_run_manifest_exact_keys_invalid$/u);
 for(const [key,error]of [['source','source_invalid'],['planning','planning_invalid'],['prototype','prototype_invalid'],['fixtures','fixtures_invalid'],['build','live_identity_invalid'],['device','live_identity_invalid'],['configuration','live_identity_invalid']]){
  const value=candidate();value[key]=new Foreign(value[key]);assert.throws(()=>validateV12RunManifest(value),e=>e.message==='v12_run_manifest_'+error);
 }
 const nested=candidate();nested.build.apk=new Foreign(nested.build.apk);assert.throws(()=>validateV12RunManifest(nested),/v12_run_manifest_live_identity_invalid/u);
 const getter=candidate();Object.defineProperty(getter.build,'apk',{enumerable:true,get:()=>new Foreign(candidate().build.apk)});assert.throws(()=>validateV12RunManifest(getter),/v12_run_manifest_live_identity_invalid/u);
});
test('null-prototype source data remains valid and arrays and Date sections keep their field errors',()=>{
 const value=candidate();value.source=Object.assign(Object.create(null),value.source);const result=validateV12RunManifest(value);assert.equal(Object.getPrototypeOf(result.source),null);assert.equal(result.source.head,value.source.head);
 for(const replacement of [[],new Date()]){const value=candidate();value.source=replacement;assert.throws(()=>validateV12RunManifest(value),/v12_run_manifest_source_invalid/u)}
});
test('throwing getters fail boundedly and cyclic or non-data fields keep their schema errors',()=>{
 const value=candidate();Object.defineProperty(value.build.apk,'path',{enumerable:true,get(){throw Error('fixture-getter')}});assert.throws(()=>validateV12RunManifest(value),/^Error: v12_run_manifest_canonical_invalid$/u);
 const cyclic=candidate();Object.defineProperty(cyclic.build.apk,'sha256',{enumerable:true,value:cyclic});assert.throws(()=>validateV12RunManifest(cyclic),/v12_run_manifest_live_identity_invalid/u);
 const pre=candidate();pre.source.package_json_sha256=()=>{};assert.throws(()=>validateV12RunManifest(pre),/v12_run_manifest_source_invalid/u);
});
test('top-level live mode and nested source getters are each captured once',()=>{
 const value=candidate();let modeReads=0,sourceReads=0;const source=value.source;
 Object.defineProperty(value,'mode',{enumerable:true,get:()=>++modeReads===1?'live':'prebuild_schema_fixture'});Object.defineProperty(value,'source',{enumerable:true,get:()=>{sourceReads++;return source}});
 const result=validateV12RunManifest(value);assert.equal(modeReads,1);assert.equal(sourceReads,1);assert.equal(result.mode,'live');source.head='c'.repeat(40);assert.notEqual(result.source.head,source.head);
});


test("manifest creation captures its APK path once before origin and schema normalization", () => {
  const input = buildInput(); const expected = input.build.apk.path; let reads = 0;
  Object.defineProperty(input.build.apk, "path", { enumerable: true, get: () => ++reads <= 2 ? expected : "../../foreign.apk" });
  const result = createV12RunManifest({ input });
  assert.equal(reads, 1); assert.equal(result.build.apk.path, expected); assert.ok(Object.isFrozen(result.build.apk));
  class Foreign { constructor(fields) { Object.assign(this, fields); } }
  const invalid = buildInput(); invalid.build.apk = new Foreign(invalid.build.apk);
  assert.throws(() => createV12RunManifest({ input: invalid }), /v12_run_manifest_live_identity_invalid/u);
  assert.throws(() => createV12RunManifest({ input: buildInput({ evidence_origin: "test" }) }), /v12_run_manifest_origin_invalid/u);
});

test("public run identity derivation requires a primitive hexadecimal head and preserves the UTC prefix", () => {
  assert.equal(createV12RunId("2026-10-14T12:34:56Z", HEAD), `phase20-20261014T123456Z-${HEAD.slice(0, 12)}`);
  for (const head of [undefined, null, [HEAD], new String(HEAD), 1, "bad"]) {
    assert.throws(() => createV12RunId("2026-10-14T12:34:56Z", head), /v12_run_manifest_source_invalid/u);
  }
  const input = buildInput(); input.source.head = [HEAD];
  assert.throws(() => createV12RunManifest({ input }), /v12_run_manifest_source_invalid/u);
});

test("manifest validation and public CLI selection reject array-coerced run identities", () => {
  const manifest = structuredClone(createV12RunManifest({ input: buildInput() }));
  manifest.run_id = [manifest.run_id];
  assert.throws(() => validateV12RunManifest(manifest), /v12_run_manifest_exact_keys_invalid/u);
  assert.throws(() => parseV12RunManifestCliArgs(["--run", manifest.run_id, "--verify-build-only"]), /v12_run_manifest_cli_invalid/u);
});

for (const [section, key] of [["build", "package"], ["build", "version_name"], ["configuration", "id"]]) {
  test(`manifest ${section}.${key} requires a primitive string rather than an array-coerced value`, () => {
    const input = buildInput(); input[section][key] = [input[section][key]];
    assert.throws(() => createV12RunManifest({ input }), /v12_run_manifest_live_identity_invalid/u);
  });
}

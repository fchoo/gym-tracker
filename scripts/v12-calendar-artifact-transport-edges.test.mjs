import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  canonicalV12CalendarArtifactDescriptor,
  createV12CalendarArtifactTransport,
  hasV12CalendarArtifactTransport,
  openV12CalendarArtifactTransport,
} from "./v12-calendar-artifact-transport.mjs";

// Isolated transport bytes only; these fixtures are never native acceptance evidence.
const RUN_ID = "phase20-20261015T010203Z-abcdef123456";
const HASH = "a".repeat(64);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const binding = () => ({ schema_version: 1, run_id: RUN_ID, execution_origin: "test-controlled/v1", request_sha256: HASH,
  flow_sha256: HASH, requirements_flow_sha256: HASH, fixture_source_sha256: HASH, sdk_binding_sha256: HASH,
  tool_facts: { adb_sha256: HASH, maestro_sha256: HASH, unzip_sha256: HASH } });
const unitInput = () => ({ kind: "stage", key: "stage-one", payload: { test_only: true, stage: "one" }, artifacts: [
  { stage_id: "stage-one", kind: "png", relative_path: "calendar/stages/00-stage-one.png", bytes: Buffer.from("test-only-png") },
  { stage_id: "stage-one", kind: "trace", relative_path: "calendar/stages/00-stage-one.trace.json", bytes: Buffer.from("test-only-trace") },
] });

function fixture(t, { populated = false, completed = false } = {}) {
  const root = fs.mkdtempSync(path.join(tmpdir(), "calendar-transport-edge-test-"));
  const run = path.join(root, "artifacts/native/v1.2", RUN_ID);
  fs.mkdirSync(run, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(run, ".calendar-transport");
  const transport = createV12CalendarArtifactTransport({ root, runId: RUN_ID, binding: binding() });
  const unit = populated ? transport.appendUnit(unitInput()) : undefined;
  const result = { test_only: true, artifacts: unit?.artifacts ?? [] };
  if (completed) transport.complete(result);
  return { root, run, directory, transport, unit, result,
    reopen: () => openV12CalendarArtifactTransport({ root, runId: RUN_ID }),
    receipt: path.join(directory, "units/000000/receipt.json"), artifact: path.join(directory, "units/000000/artifact-000.bin") };
}

function mutateJson(file, mutate) {
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  mutate(value);
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
}

function withBuiltinMock(t, name, implementation, operation) {
  const replacement = t.mock.method(fs, name, implementation);
  syncBuiltinESMExports();
  try { return operation(); }
  finally { replacement.mock.restore(); syncBuiltinESMExports(); }
}

test("empty transport publishes a canonical zero-unit result and cleanup preserves the run", (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.run, "keep.txt"), "test-only retained run input");
  assert.equal(hasV12CalendarArtifactTransport({ root: f.root, runId: RUN_ID }), true);
  assert.equal(f.transport.resumeUnit({ ordinal: 0, kind: "stage", key: "none" }), undefined);
  assert.equal(f.transport.loadCompleted(), null);
  assert.deepEqual(f.transport.complete(f.result), f.result);
  assert.deepEqual(f.reopen().loadCompleted(), f.result);
  const manifest = JSON.parse(fs.readFileSync(path.join(f.directory, "manifest.json")));
  assert.equal(manifest.unit_count, 0);
  assert.equal(manifest.final_chain_sha256, "0".repeat(64));
  f.transport.cleanup();
  assert.equal(hasV12CalendarArtifactTransport({ root: f.root, runId: RUN_ID }), false);
  assert.equal(fs.readFileSync(path.join(f.run, "keep.txt"), "utf8"), "test-only retained run input");
});

test("run and binding identity reject absent, malformed, mismatched and unsupported inputs", (t) => {
  const f = fixture(t);
  for (const operation of [() => createV12CalendarArtifactTransport(), () => openV12CalendarArtifactTransport(), () => hasV12CalendarArtifactTransport()]) assert.throws(operation, /calendar_transport_arguments_invalid/u);
  assert.throws(() => createV12CalendarArtifactTransport({ root: f.root, runId: "bad", binding: binding() }), /arguments_invalid/u);
  assert.throws(() => createV12CalendarArtifactTransport({ root: path.join(f.root, "missing"), runId: RUN_ID, binding: binding() }), /run_root_invalid/u);
  assert.throws(() => createV12CalendarArtifactTransport({ root: path.parse(f.root).root, runId: RUN_ID, binding: binding() }), /run_root_invalid/u);
  for (const changed of [null, [], { ...binding(), schema_version: 2 }, { ...binding(), run_id: "wrong" }, { ...binding(), execution_origin: "unknown" }, { ...binding(), sdk_binding_sha256: undefined }, { ...binding(), tool_facts: {} }, { ...binding(), tool_facts: { ...binding().tool_facts, adb_sha256: undefined } }]) {
    assert.throws(() => createV12CalendarArtifactTransport({ root: f.root, runId: RUN_ID, binding: changed }), /binding_invalid/u);
  }
  assert.throws(() => createV12CalendarArtifactTransport({ root: f.root, runId: RUN_ID, binding: { ...binding(), execution_origin: "production-attested/v1" } }), /binding_mismatch/u);
  fs.writeFileSync(path.join(f.directory, "binding.json"), "{invalid");
  assert.throws(() => createV12CalendarArtifactTransport({ root: f.root, runId: RUN_ID, binding: binding() }), /binding_invalid/u);
  assert.throws(f.reopen, /calendar_transport_missing/u);
});

test("opening incomplete or concurrently removed binding state fails closed", (t) => {
  const f = fixture(t);
  const original = fs.existsSync;
  withBuiltinMock(t, "existsSync", (file) => file === f.directory ? false : original(file), () => assert.throws(f.reopen, /calendar_transport_missing/u));
  const bindingFile = path.join(f.directory, "binding.json");
  withBuiltinMock(t, "existsSync", (file) => file === bindingFile ? false : original(file), () => assert.throws(f.reopen, /binding_missing/u));
});

test("run hierarchy, transport, units and artifact symlinks cannot redirect reopening", async (t) => {
  for (const relative of ["artifacts", "artifacts/native/v1.2/" + RUN_ID + "/.calendar-transport", "artifacts/native/v1.2/" + RUN_ID + "/.calendar-transport/units", "artifacts/native/v1.2/" + RUN_ID + "/.calendar-transport/units/000000/artifact-000.bin"]) {
    await t.test(relative, (st) => {
      const f = fixture(st, { populated: true });
      const link = path.join(f.root, relative);
      const target = path.join(f.root, "owned-link-target");
      fs.renameSync(link, target);
      fs.symlinkSync(target, link);
      assert.throws(f.reopen, /calendar_transport_symlink_forbidden/u);
    });
  }
});

test("path containment guard rejects inconsistent relative path backend results", (t) => {
  const f = fixture(t);
  const original = path.relative;
  for (const relative of ["", "../outside", path.join(path.parse(f.root).root, "outside")]) {
    const replacement = t.mock.method(path, "relative", (base, target) => base === f.run && target === f.directory ? relative : original(base, target));
    try { assert.throws(f.reopen, /calendar_transport_path_invalid/u); }
    finally { replacement.mock.restore(); }
  }
});

test("canonical artifact descriptors reject missing, ambiguous and invalid metadata", () => {
  const valid = { stage_id: "stage-one", kind: "png", relative_path: "calendar/stages/00-stage-one.png", sha256: HASH, size_bytes: 1 };
  assert.deepEqual(canonicalV12CalendarArtifactDescriptor({ ...valid, bytes_base64: "discarded test-only input" }), valid);
  for (const changed of [null, {}, { ...valid, stage_id: "" }, { ...valid, requirement_id: "CAL-01", probe_id: "probe" }, { ...valid, kind: "other" }, { ...valid, relative_path: 1 }, { ...valid, relative_path: "../escape.png" }, { ...valid, sha256: undefined }, { ...valid, size_bytes: 0 }, { ...valid, size_bytes: 1.1 }]) assert.throws(() => canonicalV12CalendarArtifactDescriptor(changed), /artifact_descriptor_invalid/u);
});

test("pending unit validation rejects invalid payloads and empty artifact bytes", async (t) => {
  for (const changed of [{ kind: "other" }, { key: null }, { key: "" }, { payload: null }, { payload: 1 }, { payload: [] }, { artifacts: null }, { artifacts: [] }, { artifacts: [{ ...unitInput().artifacts[0], bytes: "not a buffer" }, unitInput().artifacts[1]] }, { artifacts: [{ ...unitInput().artifacts[0], bytes: Buffer.alloc(0) }, unitInput().artifacts[1]] }]) {
    await t.test(JSON.stringify(changed, (_key, value) => Buffer.isBuffer(value) ? "test-only bytes" : value).slice(0, 80), (st) => {
      const f = fixture(st);
      assert.throws(() => f.transport.appendUnit({ ...unitInput(), ...changed }), /calendar_transport_(?:unit|artifact)_invalid/u);
      assert.equal(fs.readdirSync(path.join(f.directory, "units")).length, 0);
    });
  }
});

test("a stale writer cannot overwrite a committed unit and wrong replay keys are rejected", (t) => {
  const f = fixture(t);
  const stale = f.reopen();
  const unit = f.transport.appendUnit(unitInput());
  const original = fs.readFileSync(f.receipt);
  assert.throws(() => stale.appendUnit({ ...unitInput(), payload: { test_only: "losing writer" } }), /unit_exists/u);
  assert.deepEqual(fs.readFileSync(f.receipt), original);
  assert.deepEqual(f.reopen().resumeUnit({ ordinal: 0, kind: "stage", key: "stage-one" }), unit);
  for (const request of [{ ordinal: 0, kind: "requirement", key: "stage-one" }, { ordinal: 0, kind: "stage", key: "wrong" }]) assert.throws(() => f.transport.resumeUnit(request), /resume_mismatch/u);
  f.transport.complete({ artifacts: unit.artifacts });
  assert.throws(() => f.transport.appendUnit(unitInput()), /calendar_transport_completed/u);
  assert.throws(() => f.transport.complete({ artifacts: unit.artifacts, test_only: "different result" }), /result_mismatch/u);
});

test("reopening rejects foreign unit names, skipped ordinals and malformed receipts", async (t) => {
  for (const mode of ["foreign", "gap", "json"]) await t.test(mode, (st) => {
    const f = fixture(st, { populated: true });
    if (mode === "foreign") fs.writeFileSync(path.join(f.directory, "units/foreign"), "test-only");
    if (mode === "gap") fs.renameSync(path.join(f.directory, "units/000000"), path.join(f.directory, "units/000002"));
    if (mode === "json") fs.writeFileSync(f.receipt, "{invalid");
    assert.throws(f.reopen, new RegExp(mode === "gap" ? "unit_order_invalid" : "unit_invalid", "u"));
  });
});

test("reopening rejects every unit identity, payload-chain and artifact ownership mutation", async (t) => {
  const mutations = {
    schema: (r) => { r.schema_version = 2; }, producer: (r) => { r.producer = "foreign"; }, run: (r) => { r.run_id = "foreign"; },
    binding: (r) => { r.binding_sha256 = "0".repeat(64); }, ordinal: (r) => { r.ordinal = 4; }, kind: (r) => { r.kind = "foreign"; },
    key_type: (r) => { r.key = null; }, key_empty: (r) => { r.key = ""; }, predecessor: (r) => { r.previous_chain_sha256 = HASH; },
    artifacts_type: (r) => { r.artifacts = null; }, artifacts_count: (r) => { r.artifacts.pop(); }, payload: (r) => { r.payload.stage = "tampered"; },
    artifact_ordinal: (r) => { r.artifacts[0].transport_ordinal = 1; }, artifact_index: (r) => { r.artifacts[0].transport_artifact_ordinal = 1; },
    artifact_chain: (r) => { r.artifacts[0].transport_chain_sha256 = HASH; },
  };
  for (const [name, mutate] of Object.entries(mutations)) await t.test(name, (st) => {
    const f = fixture(st, { populated: true }); mutateJson(f.receipt, mutate);
    assert.throws(f.reopen, /calendar_transport_unit_invalid/u);
  });
});

test("reopening and active reads reject both artifact size and content tampering", async (t) => {
  for (const mode of ["size", "digest"]) await t.test(mode, (st) => {
    const f = fixture(st, { populated: true });
    fs.writeFileSync(f.artifact, mode === "size" ? "short" : Buffer.alloc(f.unit.artifacts[0].size_bytes, 0x78));
    assert.throws(f.reopen, /calendar_transport_artifact_invalid/u);
    assert.throws(() => f.transport.readArtifact(f.unit.artifacts[0]), /calendar_transport_artifact_invalid/u);
  });
});

test("artifact reads require exact committed descriptor ownership", (t) => {
  const f = fixture(t, { populated: true });
  const descriptor = f.unit.artifacts[0];
  assert.equal(sha(f.transport.readArtifact(descriptor)), descriptor.sha256);
  for (const changed of [null, { ...descriptor, transport_ordinal: 0.5 }, { ...descriptor, transport_ordinal: 99 }, { ...descriptor, transport_artifact_ordinal: 0.5 }, { ...descriptor, transport_artifact_ordinal: -1 }, { ...descriptor, transport_artifact_ordinal: 99 }, { ...descriptor, transport_chain_sha256: HASH }, { ...descriptor, sha256: HASH }]) assert.throws(() => f.transport.readArtifact(changed), /calendar_transport_artifact_invalid/u);
});

test("completion rejects noncompact, oversized and artifact-mismatched results", async (t) => {
  for (const mode of ["null", "artifacts", "base64", "oversize", "bad-json", "noncanonical", "different-result"]) await t.test(mode, (st) => {
    const f = fixture(st, { populated: true });
    let requested = f.result;
    if (mode === "null") requested = null;
    if (mode === "artifacts") requested = { artifacts: [] };
    if (mode === "base64") requested = { ...f.result, bytes_base64: "test-only" };
    if (mode === "oversize") requested = { ...f.result, test_only: "x".repeat(16 * 1024 * 1024) };
    if (["bad-json", "noncanonical", "different-result"].includes(mode)) fs.writeFileSync(path.join(f.directory, "result.json"), mode === "bad-json" ? "{invalid" : mode === "noncanonical" ? JSON.stringify(f.result, null, 2) : `${JSON.stringify({ ...f.result, test_only: "other" })}\n`);
    assert.throws(() => f.transport.complete(requested), new RegExp(mode === "different-result" ? "result_mismatch" : "result_invalid", "u"));
    assert.equal(fs.existsSync(path.join(f.directory, "manifest.json")), false);
  });
});

test("completed replay rejects missing or malformed manifest/result files", async (t) => {
  for (const mode of ["manifest-json", "result-json", "result-missing"]) await t.test(mode, (st) => {
    const f = fixture(st, { populated: true, completed: true });
    if (mode === "manifest-json") fs.writeFileSync(path.join(f.directory, "manifest.json"), "{invalid");
    if (mode === "result-json") fs.writeFileSync(path.join(f.directory, "result.json"), "{invalid");
    if (mode === "result-missing") fs.unlinkSync(path.join(f.directory, "result.json"));
    assert.throws(() => f.reopen().loadCompleted(), /manifest_invalid/u);
  });
});

test("completed replay revalidates every manifest identity and chain field", async (t) => {
  for (const [key, value] of [["extra", true], ["schema_version", 2], ["producer", "foreign"], ["run_id", "foreign"], ["binding_sha256", HASH], ["unit_count", 2], ["artifact_count", 3], ["final_chain_sha256", HASH], ["result_sha256", HASH]]) await t.test(key, (st) => {
    const f = fixture(st, { populated: true, completed: true });
    mutateJson(path.join(f.directory, "manifest.json"), (manifest) => { manifest[key] = value; });
    assert.throws(() => f.reopen().loadCompleted(), /manifest_invalid/u);
  });
});

test("a rehashed completed result still cannot replace committed artifacts or carry inline bytes", async (t) => {
  for (const mode of ["artifacts", "base64", "oversize"]) await t.test(mode, (st) => {
    const f = fixture(st, { populated: true, completed: true });
    const result = mode === "artifacts" ? { artifacts: [] } : mode === "base64" ? { ...f.result, bytes_base64: "test-only" } : { ...f.result, test_only: "x".repeat(16 * 1024 * 1024) };
    const bytes = Buffer.from(`${JSON.stringify(result)}\n`);
    fs.writeFileSync(path.join(f.directory, "result.json"), bytes);
    mutateJson(path.join(f.directory, "manifest.json"), (manifest) => { manifest.result_sha256 = sha(bytes); });
    assert.throws(() => f.reopen().loadCompleted(), /manifest_invalid/u);
  });
});

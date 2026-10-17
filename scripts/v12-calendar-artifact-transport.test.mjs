import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createV12CalendarArtifactTransport,
  openV12CalendarArtifactTransport,
} from "./v12-calendar-artifact-transport.mjs";

const RUN_ID = "phase20-20261015T010203Z-abcdef123456";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const binding = Object.freeze({
  schema_version: 1,
  run_id: RUN_ID,
  execution_origin: "test-controlled/v1",
  request_sha256: "1".repeat(64),
  flow_sha256: "2".repeat(64),
  requirements_flow_sha256: "3".repeat(64),
  fixture_source_sha256: "4".repeat(64),
  tool_facts: Object.freeze({ adb_sha256: "5".repeat(64), maestro_sha256: "6".repeat(64), unzip_sha256: "7".repeat(64) }),
});

test("Calendar artifact transport commits monotonic units and resumes a completed compact result", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-transport-"));
  mkdirSync(path.join(root, "artifacts/native/v1.2", RUN_ID), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const transport = createV12CalendarArtifactTransport({ root, runId: RUN_ID, binding });
  const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(128 * 1024, 0x5A)]);
  const trace = Buffer.from('{"stage":"one"}');

  const first = transport.appendUnit({
    kind: "stage",
    key: "stage-one",
    payload: { stage: { id: "stage-one" }, junit: { id: "stage-one", status: "PASS" } },
    artifacts: [
      { stage_id: "stage-one", kind: "png", relative_path: "calendar/stages/00-stage-one.png", bytes: png },
      { stage_id: "stage-one", kind: "trace", relative_path: "calendar/stages/00-stage-one.trace.json", bytes: trace },
    ],
  });
  const partiallyResumed = openV12CalendarArtifactTransport({ root, runId: RUN_ID });
  assert.deepEqual(partiallyResumed.resumeUnit({ ordinal: 0, kind: "stage", key: "stage-one" }), first);
  const wrongTools = structuredClone(binding);
  wrongTools.tool_facts.adb_sha256 = "8".repeat(64);
  assert.throws(() => createV12CalendarArtifactTransport({ root, runId: RUN_ID, binding: wrongTools }), /calendar_transport_binding_mismatch/u);
  const second = partiallyResumed.appendUnit({
    kind: "requirement",
    key: "CAL-01:probe-one",
    payload: { receipt: { probe_id: "probe-one" }, junit: { id: "CAL-01:probe-one", status: "PASS" } },
    artifacts: [
      { requirement_id: "CAL-01", probe_id: "probe-one", kind: "png", relative_path: "calendar/requirements/00-CAL-01-probe-one.png", bytes: png },
      { requirement_id: "CAL-01", probe_id: "probe-one", kind: "trace", relative_path: "calendar/requirements/00-CAL-01-probe-one.trace.xml", bytes: Buffer.from("<hierarchy/>") },
    ],
  });
  assert.equal(first.artifacts[0].transport_ordinal, 0);
  assert.equal(second.artifacts[0].transport_ordinal, 1);
  assert.notEqual(first.artifacts[0].transport_chain_sha256, second.artifacts[0].transport_chain_sha256);
  assert.deepEqual(partiallyResumed.readArtifact(first.artifacts[0]), png);

  const result = { stages: [first.payload.stage], requirements: [second.payload.receipt], artifacts: [...first.artifacts, ...second.artifacts] };
  partiallyResumed.complete(result);
  const reopened = openV12CalendarArtifactTransport({ root, runId: RUN_ID });
  assert.deepEqual(reopened.loadCompleted(), result);
  assert.ok(Buffer.byteLength(JSON.stringify(reopened.loadCompleted())) < 1024 * 1024);
  assert.equal(JSON.stringify(reopened.loadCompleted()).includes("bytes_base64"), false);

  const artifactPath = path.join(root, "artifacts/native/v1.2", RUN_ID, ".calendar-transport", "units", "000000", "artifact-000.bin");
  const original = readFileSync(artifactPath);
  writeFileSync(artifactPath, Buffer.from("tampered"));
  assert.throws(() => reopened.readArtifact(first.artifacts[0]), /calendar_transport_artifact_invalid/u);
  writeFileSync(artifactPath, original);
  assert.equal(sha(reopened.readArtifact(first.artifacts[0])), first.artifacts[0].sha256);
});

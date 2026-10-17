import assert from "node:assert/strict";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  executeV12VisualStreamingShard,
  inspectV12VisualJournal,
  iterateV12VisualJsonArray,
  readV12VisualJsonHeader,
} from "../v12-visual-streaming.mjs";
import { V12_BROWSER_WALK_STATE_IDS, V12_CONFIG_IDS } from "../v12-evidence-contract.mjs";

const project = fileURLToPath(new URL("../../", import.meta.url));
const worker = fileURLToPath(new URL("./v12-visual-streaming-worker.mjs", import.meta.url));
const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";

function executeSingleRecord(root) {
  return executeV12VisualStreamingShard({
    root,
    runId,
    shard: "visual",
    totalCount: 1,
    indexRelative: "screenshots/index.json",
    indexHeader: Object.freeze({
      schema_version: 2,
      producer: "v12-visual-capture-index/v2",
      run_id: runId,
      capture_count: 1,
    }),
    resultKey: "records",
    expectedWindow: () => Object.freeze([{ id: "record-1" }]),
    processWindow: ({ offset, ordinal }) => Object.freeze({
      records: Object.freeze([{ id: "record-1" }]),
      window: Object.freeze({ ordinal, offset, count: 1 }),
    }),
    validateBatch: () => true,
  });
}

function invoke(root, phase, crashAfter = 0) {
  return spawnSync(process.execPath, ["--expose-gc", worker, root, phase, String(crashAfter)], {
    cwd: project,
    encoding: "utf8",
    timeout: 300_000,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, NODE_ENV: "test", V12_PHASE20_BLACKBOX: "1", V12_NATIVE_ADAPTER_TEST_PROCESS: "1" },
  });
}

function readSummary(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

function streamedInventory(file, arrayKey, id) {
  const values = [];
  let count = 0;
  let first;
  let last;
  for (const { value, offset, size } of iterateV12VisualJsonArray({ file, arrayKey })) {
    const key = id(value);
    first ??= key;
    last = key;
    assert.equal(Number.isSafeInteger(offset) && offset >= 0, true);
    assert.equal(Number.isSafeInteger(size) && size > 0, true);
    if (count < 4 || count >= 6_844) values.push(key);
    count += 1;
  }
  return { count, first, last, edges: values };
}

function expectedIdentity(index) {
  const state = V12_BROWSER_WALK_STATE_IDS[Math.floor(index / V12_CONFIG_IDS.length)];
  const configuration = V12_CONFIG_IDS[index % V12_CONFIG_IDS.length];
  return `${state}/${configuration}`;
}

async function assertExactCalls(file) {
  const lines = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let ordinal = 0;
  for await (const line of lines) {
    const value = JSON.parse(line);
    assert.equal(value.count, 4);
    assert.equal(value.first, expectedIdentity(ordinal * 4));
    assert.equal(value.last, expectedIdentity(ordinal * 4 + 3));
    ordinal += 1;
  }
  assert.equal(ordinal, 1_712);
}

test("visual capture and comparison resume monotonic journals without replay and retain exact schemas", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-visual-stream-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const captureCrash = invoke(root, "capture", 17);
  assert.equal(captureCrash.status, 86, captureCrash.stderr || captureCrash.stdout);
  assert.deepEqual(inspectV12VisualJournal({ root, runId, shard: "visual" }), {
    batch_count: 17,
    item_count: 68,
    last_sha256: inspectV12VisualJournal({ root, runId, shard: "visual" }).last_sha256,
  });
  assert.match(inspectV12VisualJournal({ root, runId, shard: "visual" }).last_sha256, /^[a-f0-9]{64}$/u);

  const capture = readSummary(invoke(root, "capture"));
  assert.equal(capture.result.capture_count, 6_848);
  assert.equal(capture.result.batch_count, 1_712);
  assert.equal(capture.result.resumed, true);
  assert.equal(capture.verified, true);
  assert.equal(capture.adapter_calls, 1_712 - 17);
  assert.equal(capture.max_batch, 4);
  assert.ok(capture.rss.samples >= 13);
  assert.ok(capture.rss.max_growth_bytes < 192 * 1024 * 1024,
    `capture RSS grew ${Math.round(capture.rss.max_growth_bytes / 1024 / 1024)} MiB`);
  t.diagnostic(`capture max RSS growth: ${Math.round(capture.rss.max_growth_bytes / 1024 / 1024)} MiB`);

  const captureIndex = path.join(root, `artifacts/native/v1.2/${runId}/screenshots/index.json`);
  assert.deepEqual(readV12VisualJsonHeader({ file: captureIndex, firstArrayKey: "windows" }), {
    schema_version: 2,
    producer: "v12-visual-capture-index/v2",
    run_id: runId,
    source_hashes: capture.result.source_hashes,
    capture_count: 6_848,
    windows: [],
  });
  assert.deepEqual(streamedInventory(captureIndex, "records", (value) => `${value.state_id}/${value.configuration_id}`), {
    count: 6_848,
    first: "BW-001/AP-L-C360-P-F100",
    last: "BW-107/AP-SD-X840-L-F200",
    edges: [
      "BW-001/AP-L-C360-P-F100",
      "BW-001/AP-L-C360-P-F200",
      "BW-001/AP-L-C360-L-F100",
      "BW-001/AP-L-C360-L-F200",
      "BW-107/AP-SD-X840-P-F100",
      "BW-107/AP-SD-X840-P-F200",
      "BW-107/AP-SD-X840-L-F100",
      "BW-107/AP-SD-X840-L-F200",
    ],
  });

  const comparisonCrash = invoke(root, "comparison", 19);
  assert.equal(comparisonCrash.status, 86, comparisonCrash.stderr || comparisonCrash.stdout);
  const journal = inspectV12VisualJournal({ root, runId, shard: "comparison" });
  assert.equal(journal.batch_count, 19);
  assert.equal(journal.item_count, 76);
  assert.match(journal.last_sha256, /^[a-f0-9]{64}$/u);

  const comparison = readSummary(invoke(root, "comparison"));
  assert.equal(comparison.result.comparison_count, 6_848);
  assert.equal(comparison.result.batch_count, 1_712);
  assert.equal(comparison.result.resumed, true);
  assert.equal(comparison.adapter_calls, 1_712 - 19);
  assert.equal(comparison.max_batch, 4);
  assert.ok(comparison.rss.samples >= 13);
  assert.ok(comparison.rss.max_growth_bytes < 192 * 1024 * 1024,
    `comparison RSS grew ${Math.round(comparison.rss.max_growth_bytes / 1024 / 1024)} MiB`);
  t.diagnostic(`comparison max RSS growth: ${Math.round(comparison.rss.max_growth_bytes / 1024 / 1024)} MiB`);

  const comparisonIndex = path.join(root, `artifacts/native/v1.2/${runId}/comparison/index.json`);
  assert.deepEqual(readV12VisualJsonHeader({ file: comparisonIndex, firstArrayKey: "windows" }), {
    schema_version: 3,
    producer: "v12-visual-comparison-index/v3",
    run_id: runId,
    comparison_count: 6_848,
    windows: [],
  });
  assert.equal(streamedInventory(comparisonIndex, "results", (value) => `${value.id}/${value.configuration_id}`).count, 6_848);

  for (const shard of ["visual", "comparison"]) {
    const publication = path.join(root, `artifacts/native/v1.2/${runId}/publication/${shard}.json`);
    const manifest = readV12VisualJsonHeader({ file: publication, firstArrayKey: "members" });
    assert.equal(manifest.schema_version, 1);
    assert.equal(manifest.producer, "v12-atomic-shard-publication/v1");
    assert.equal(manifest.run_id, runId);
    assert.equal(manifest.shard, shard);
    assert.equal(manifest.completed, true);
    let memberCount = 0;
    for (const _member of iterateV12VisualJsonArray({ file: publication, arrayKey: "members" })) memberCount += 1;
    assert.ok(memberCount > 6_848);
  }
  assert.equal(existsSync(path.join(root, `artifacts/native/v1.2/${runId}/.staging`)), false);
  assert.equal(existsSync(path.join(root, `artifacts/native/v1.2/${runId}/.visual-stream`)), false);
  assert.equal(existsSync(path.join(root, `artifacts/native/v1.2/${runId}/.claims`)), false);

  await assertExactCalls(path.join(root, "capture-calls.ndjson"));
  await assertExactCalls(path.join(root, "comparison-calls.ndjson"));
});

test("visual streaming rejects malformed stale claim ownership", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-visual-claim-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const claims = path.join(root, `artifacts/native/v1.2/${runId}/.claims`);
  mkdirSync(claims, { recursive: true });
  writeFileSync(path.join(claims, "visual.json"), '{"pid":0}\n');

  assert.throws(() => executeSingleRecord(root), /v12_visual_stream_claim_conflict/u);
});

test("visual streaming rejects unknown residue beside an existing publication", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-visual-residue-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, `artifacts/native/v1.2/${runId}`), { recursive: true });
  executeSingleRecord(root);

  const stage = path.join(root, `artifacts/native/v1.2/${runId}/.staging/visual`);
  mkdirSync(stage, { recursive: true });
  writeFileSync(path.join(stage, "unknown.bin"), "unknown");

  assert.throws(() => executeSingleRecord(root), /v12_visual_stream_stage_member_invalid/u);
});

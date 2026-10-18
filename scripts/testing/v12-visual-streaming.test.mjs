import assert from "node:assert/strict";
import { copyFileSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

function executeSingleRecord(root, shard = "visual") {
  const comparison = shard === "comparison";
  return executeV12VisualStreamingShard({
    root,
    runId,
    shard,
    totalCount: 1,
    indexRelative: comparison ? "comparison/index.json" : "screenshots/index.json",
    indexHeader: Object.freeze({
      schema_version: 2,
      producer: "v12-visual-capture-index/v2",
      run_id: runId,
      capture_count: 1,
    }),
    resultKey: comparison ? "results" : "records",
    expectedWindow: () => Object.freeze([{ id: "record-1" }]),
    processWindow: ({ offset, ordinal }) => Object.freeze({
      records: Object.freeze([{ id: "record-1" }]),
      window: Object.freeze({ ordinal, offset, count: 1 }),
    }),
    validateBatch: () => true,
  });
}

function staleVisualClaim(root, shard, overrides = {}) {
  const claims = path.join(root, `artifacts/native/v1.2/${runId}/.claims`);
  mkdirSync(claims, { recursive: true });
  writeFileSync(path.join(claims, `${shard}.json`), `${JSON.stringify({
    schema_version: 2,
    run_id: runId,
    shard,
    pid: 99_999_999,
    process_birth_sha256: "a".repeat(64),
    nonce: "b".repeat(32),
    ...overrides,
  })}\n`);
}

function invoke(root, phase, crashAfter = 0) {
  const environment = { ...process.env, NODE_ENV: "test", V12_PHASE20_BLACKBOX: "1", V12_NATIVE_ADAPTER_TEST_PROCESS: "1" };
  environment.NODE_V8_COVERAGE = "";
  for (const key of ["PHASE20_CHILD_COVERAGE_DIRECTORY", "PHASE20_CHILD_COVERAGE_PROJECT_ROOT"]) {
    delete environment[key];
  }
  return spawnSync(process.execPath, ["--expose-gc", worker, root, phase, String(crashAfter)], {
    cwd: project,
    encoding: "utf8",
    timeout: 300_000,
    maxBuffer: 4 * 1024 * 1024,
    env: environment,
  });
}

function readSummary(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

test("visual RSS workers drop parent V8 instrumentation", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-visual-rss-isolation-"));
  const inheritedCoverage = mkdtempSync(path.join(tmpdir(), "v12-parent-v8-"));
  const previousCoverage = process.env.NODE_V8_COVERAGE;
  t.after(() => {
    if (previousCoverage === undefined) delete process.env.NODE_V8_COVERAGE;
    else process.env.NODE_V8_COVERAGE = previousCoverage;
    rmSync(root, { recursive: true, force: true });
    rmSync(inheritedCoverage, { recursive: true, force: true });
  });
  process.env.NODE_V8_COVERAGE = inheritedCoverage;
  assert.deepEqual(readSummary(invoke(root, "probe")), {
    coverage_instrumented: false,
  });
  assert.deepEqual(readdirSync(inheritedCoverage), []);
});

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
  assert.equal(capture.coverage_instrumented, false);
  assert.equal(capture.rss.controlled_baseline, true);
  assert.equal(capture.rss.warmup_samples, 1);
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
  assert.equal(comparison.coverage_instrumented, false);
  assert.equal(comparison.rss.controlled_baseline, true);
  assert.equal(comparison.rss.warmup_samples, 1);
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

test("a reused live PID cannot strand a visual claim", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-visual-pid-reuse-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, `artifacts/native/v1.2/${runId}`), { recursive: true });
  staleVisualClaim(root, "visual", { pid: process.pid, process_birth_sha256: "0".repeat(64) });
  assert.equal(executeSingleRecord(root).capture_count, 1);
  assert.equal(existsSync(path.join(root, `artifacts/native/v1.2/${runId}/.claims`)), false);
});

for (const shard of ["visual", "comparison"]) {
  test(`${shard} post-manifest recovery accepts an identical staged manifest and cleans residue`, (t) => {
    const root = mkdtempSync(path.join(tmpdir(), `v12-${shard}-post-manifest-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(path.join(root, `artifacts/native/v1.2/${runId}`), { recursive: true });
    executeSingleRecord(root, shard);
    const runRoot = path.join(root, `artifacts/native/v1.2/${runId}`);
    const stage = path.join(runRoot, `.staging/${shard}`); mkdirSync(stage, { recursive: true });
    copyFileSync(path.join(runRoot, `publication/${shard}.json`), path.join(stage, "manifest.json"));
    staleVisualClaim(root, shard);
    const recovered = executeSingleRecord(root, shard);
    assert.equal(recovered.resumed, true);
    assert.equal(existsSync(path.join(runRoot, ".staging")), false);
    assert.equal(existsSync(path.join(runRoot, ".claims")), false);
  });

  test(`${shard} post-manifest recovery rejects a mismatched staged manifest`, (t) => {
    const root = mkdtempSync(path.join(tmpdir(), `v12-${shard}-post-manifest-mismatch-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(path.join(root, `artifacts/native/v1.2/${runId}`), { recursive: true });
    executeSingleRecord(root, shard);
    const runRoot = path.join(root, `artifacts/native/v1.2/${runId}`);
    const stage = path.join(runRoot, `.staging/${shard}`); mkdirSync(stage, { recursive: true });
    const published = readFileSync(path.join(runRoot, `publication/${shard}.json`));
    writeFileSync(path.join(stage, "manifest.json"), Buffer.concat([published, Buffer.from(" ")]));
    staleVisualClaim(root, shard);
    assert.throws(() => executeSingleRecord(root, shard), /v12_visual_stream_(?:manifest|stage|output)_/u);
    assert.equal(existsSync(path.join(stage, "manifest.json")), true);
  });
}

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

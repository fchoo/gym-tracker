import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

import { executeLiveV12VisualCapture, verifyV12VisualCapture } from "../capture-v12-visual.mjs";
import { executeV12VisualComparison } from "../compare-v12-visual.mjs";
import { V12_BROWSER_WALK_STATE_IDS, V12_CONFIG_IDS } from "../v12-evidence-contract.mjs";

const project = fileURLToPath(new URL("../../", import.meta.url));
const [artifactRoot, phase, crashText] = process.argv.slice(2);
const crashAfter = Number(crashText);
const coverageInstrumented = typeof process.env.NODE_V8_COVERAGE === "string"
  && process.env.NODE_V8_COVERAGE.length > 0;
const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const states = JSON.parse(readFileSync(path.join(project, "src/testing/phase20VisualStateRegistry.json"), "utf8"));
const stateById = new Map(states.map((state) => [state.id, state]));
const stateOrdinal = new Map(V12_BROWSER_WALK_STATE_IDS.map((id, index) => [id, index]));
const configurationOrdinal = new Map(V12_CONFIG_IDS.map((id, index) => [id, index]));
if (phase === "probe") {
  process.stdout.write(`${JSON.stringify({ coverage_instrumented: coverageInstrumented })}\n`);
} else {
mkdirSync(path.join(artifactRoot, `artifacts/native/v1.2/${runId}`), { recursive: true });

const image = new PNG({ width: 128, height: 128 });
let random = 0x5EED1234;
for (let offset = 0; offset < image.data.length; offset += 4) {
  random = (Math.imul(random, 1_664_525) + 1_013_904_223) >>> 0;
  image.data[offset] = random & 255;
  image.data[offset + 1] = (random >>> 8) & 255;
  image.data[offset + 2] = (random >>> 16) & 255;
  image.data[offset + 3] = 255;
}
const realisticPng = PNG.sync.write(image, { colorType: 6 });
if (realisticPng.length < 48 * 1024) throw new Error(`png_fixture_too_small:${realisticPng.length}`);

function ordinalFor(item) {
  return stateOrdinal.get(item.state_id) * V12_CONFIG_IDS.length + configurationOrdinal.get(item.configuration_id) + 1;
}

function captureResult(item) {
  const ordinal = ordinalFor(item);
  const state = stateById.get(item.state_id);
  const png = Buffer.from(realisticPng);
  const observation = {
    native_execution: "EXECUTED",
    state_id: item.state_id,
    configuration_id: item.configuration_id,
    readiness: { status: state.readiness.status },
    native_focus: { resource_id: "focus-node", class_name: "android.view.View", bounds: "[0,0][48,48]" },
    diagnostic_summary: "m".repeat(8 * 1024),
  };
  const nonce = ordinal.toString(16).padStart(32, "0");
  const sourceMaterial = {
    state_id: item.state_id,
    fixture_variant: state.fixture_variant,
    assertions: state.readiness.source_receipt.assertions,
    production_instance_id: `phase20-production-instance-${ordinal}`,
    mount_id: `phase20-production-mount-${ordinal}`,
    scroll_offsets: [{ native_id: "adaptive-screen-scroll", x: 0, y: 12 }],
    timer: { state: "running", revision: 2, remaining_ms: null, ends_at_ms: 120_000 },
  };
  const sourceReceipt = { schema_version: 2, nonce, ...sourceMaterial, digest: hash(JSON.stringify(sourceMaterial)) };
  const receipt = {
    schema_version: 3,
    nonce,
    run_id: runId,
    state_id: item.state_id,
    configuration_id: item.configuration_id,
    fixture_id: "v12-synthetic-fixtures-r18",
    readiness_status: state.readiness.status,
    source_tree_sha256: "a".repeat(64),
    apk_sha256: "b".repeat(64),
    device_identity_sha256: "c".repeat(64),
    png_sha256: hash(png),
    observation_sha256: hash(JSON.stringify(observation)),
    source_receipt: sourceReceipt,
    ...(item.configuration_id.startsWith("AP-SD-") ? {
      system_transition: {
        from: "light",
        to: "dark",
        mounted_nonce: nonce,
        color_scheme: { before: "light", after: "dark" },
        before: { native_focus: observation.native_focus, scroll_offsets: sourceMaterial.scroll_offsets, timer: sourceMaterial.timer, production_instance_id: sourceMaterial.production_instance_id, mount_id: sourceMaterial.mount_id },
        after: { native_focus: observation.native_focus, scroll_offsets: sourceMaterial.scroll_offsets, timer: sourceMaterial.timer, production_instance_id: sourceMaterial.production_instance_id, mount_id: sourceMaterial.mount_id },
      },
    } : {}),
  };
  return {
    native_execution: "EXECUTED",
    fixture_id: "v12-synthetic-fixtures-r18",
    png,
    settings: { restored: true, privacy: "synthetic-only", observation, state_receipt: receipt },
  };
}

function monitor(label) {
  let baseline;
  let max;
  let samples = 0;
  let warmupSamples = 0;
  const settledRss = () => {
    global.gc?.();
    global.gc?.();
    return process.memoryUsage().rss;
  };
  return {
    committed({ ordinal }) {
      if (baseline === undefined) {
        baseline = settledRss();
        max = baseline;
        warmupSamples += 1;
      } else if (ordinal % 128 === 0 || ordinal === 1_711) {
        max = Math.max(max, settledRss());
        samples += 1;
      }
      if (crashAfter > 0 && ordinal + 1 === crashAfter) process.exit(86);
    },
    result() {
      if (baseline === undefined || max === undefined) throw new Error("rss_baseline_unavailable");
      const final = settledRss();
      max = Math.max(max, final);
      return { label, controlled_baseline: true, warmup_samples: warmupSamples, baseline_bytes: baseline,
        final_bytes: final, max_bytes: max, max_growth_bytes: Math.max(0, max - baseline), samples };
    },
  };
}

if (phase === "capture") {
  const rss = monitor("capture");
  let adapterCalls = 0;
  let maxBatch = 0;
  const result = executeLiveV12VisualCapture({
    runId,
    root: project,
    artifactRoot,
    capture: (item) => captureResult(item),
    captureAll: ({ captures }) => {
      adapterCalls += 1;
      maxBatch = Math.max(maxBatch, captures.length);
      appendFileSync(path.join(artifactRoot, "capture-calls.ndjson"), `${JSON.stringify({ count: captures.length,
        first: `${captures[0].state_id}/${captures[0].configuration_id}`, last: `${captures.at(-1).state_id}/${captures.at(-1).configuration_id}`,
        request_sha256: hash(JSON.stringify(captures.map(({ state_id, configuration_id }) => ({ state_id, configuration_id })))) })}\n`);
      return captures.map(captureResult);
    },
    onWindowCommitted: rss.committed,
  });
  const verified = verifyV12VisualCapture({ runId, root: project, artifactRoot });
  process.stdout.write(`${JSON.stringify({ result, verified, adapter_calls: adapterCalls, max_batch: maxBatch,
    coverage_instrumented: coverageInstrumented, rss: rss.result() })}\n`);
} else if (phase === "comparison") {
  const rss = monitor("comparison");
  let adapterCalls = 0;
  let maxBatch = 0;
  const result = executeV12VisualComparison({
    runId,
    root: project,
    artifactRoot,
    compare: ({ captures }) => {
      adapterCalls += 1;
      maxBatch = Math.max(maxBatch, captures.length);
      appendFileSync(path.join(artifactRoot, "comparison-calls.ndjson"), `${JSON.stringify({ count: captures.length,
        first: `${captures[0].state_id}/${captures[0].configuration_id}`, last: `${captures.at(-1).state_id}/${captures.at(-1).configuration_id}`,
        request_sha256: hash(JSON.stringify(captures.map(({ state_id, configuration_id }) => ({ state_id, configuration_id })))) })}\n`);
      return captures.map((item) => {
        const ordinal = ordinalFor(item);
        return { id: item.state_id, configuration_id: item.configuration_id, state_receipt: { schema_version: 3, nonce: (ordinal + 10_000).toString(16).padStart(32, "0") } };
      });
    },
    produceRecord: ({ input, captureRecord, write }) => {
      const native = readFileSync(path.join(artifactRoot, captureRecord.native_png.path));
      if (hash(native) !== captureRecord.native_png.sha256) throw new Error("native_hash_invalid");
      const base = `artifacts/native/v1.2/${runId}/comparison/${input.id}/${input.configuration_id}`;
      const observation = Buffer.from(`${JSON.stringify({ schema_version: 1, producer: "v12-visual-stream-rss-fixture/v1", run_id: runId, state_id: input.id, configuration_id: input.configuration_id, diagnostic_summary: "m".repeat(8 * 1024) })}\n`);
      const observationPath = `${base}/instrumented-observation.json`;
      write(observationPath, observation);
      return {
        schema_version: 3,
        id: input.id,
        configuration_id: input.configuration_id,
        comparison_mode: "approved_source",
        classification: "PASS",
        counts_as_pass: true,
        capture_record_path: `artifacts/native/v1.2/${runId}/screenshots/index.json`,
        capture_state_receipt: captureRecord.settings.state_receipt,
        state_receipt: input.state_receipt,
        observation: { path: observationPath, sha256: hash(observation), size_bytes: observation.length },
        artifacts: { native: captureRecord.native_png },
        metrics: { kind: "source_semantic", renderer_digest: "a".repeat(64), semantic_digest: "b".repeat(64), layout_digest: "c".repeat(64) },
      };
    },
    onWindowCommitted: rss.committed,
  });
  process.stdout.write(`${JSON.stringify({ result, adapter_calls: adapterCalls, max_batch: maxBatch,
    coverage_instrumented: coverageInstrumented, rss: rss.result() })}\n`);
} else {
  throw new Error(`unknown_phase:${phase}`);
}
}

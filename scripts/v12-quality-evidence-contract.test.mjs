import assert from "node:assert/strict";
import test from "node:test";
import { validateV12AccessibilityProducer, validateV12PerformanceProducer } from "./v12-quality-evidence-contract.mjs";
import { V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD } from "./benchmark-v12-interactions.mjs";
import { accessibilityEvidence, performanceEvidence, qualityIdentity } from "./testing/v12-quality-evidence-fixture.mjs";
import { verifyV12PerformanceObservation, writeV12PerformanceObservation } from "./v12-performance-shard.mjs";

const invalid = (code) => { throw new Error(`strict_${code}`); };

test("strict accessibility producer requires four roots by both motion modes with source and native receipts", () => {
  const identity = qualityIdentity();
  const observations = accessibilityEvidence(identity);
  assert.equal(validateV12AccessibilityProducer(observations, identity, invalid), true);
  assert.throws(() => validateV12AccessibilityProducer(observations.slice(0, 1), identity, invalid), /strict_accessibility_coverage_invalid/u);
  const duplicate = structuredClone(observations); duplicate[1].configuration = duplicate[0].configuration;
  assert.throws(() => validateV12AccessibilityProducer(duplicate, identity, invalid), /strict_accessibility_configuration_invalid/u);
  const oldShape = structuredClone(observations); delete oldShape[0].native_receipts;
  assert.throws(() => validateV12AccessibilityProducer(oldShape, identity, invalid), /strict_accessibility_schema_invalid/u);
});

test("strict accessibility producer rejects static input, modal, readiness, and fixture claims", () => {
  const identity = qualityIdentity();
  for (const mutate of [
    (value) => { value[0].interactions[1].event = "touch-tap"; },
    (value) => { value[0].interactions[0].callback_receipt_sha256 = value[0].interactions[1].callback_receipt_sha256; },
    (value) => { value[0].modal.escape.event = "key-back"; },
    (value) => { value[0].native_receipts.readiness_sha256 = value[2].native_receipts.readiness_sha256; },
    (value) => { value[0].fixture_id = "v12-synthetic-fixtures-r18"; },
  ]) {
    const observations = accessibilityEvidence(identity); mutate(observations);
    assert.throws(() => validateV12AccessibilityProducer(observations, identity, invalid), /strict_accessibility_/u);
  }
});

test("strict performance producer requires complete native actions, stable cold source, seeded workload, and a byte-bound Phase 20 Garmin baseline", () => {
  const identity = qualityIdentity();
  const performance = performanceEvidence(identity);
  assert.equal(validateV12PerformanceProducer(performance, identity, V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD, invalid), true);
  for (const mutate of [
    (value) => { delete value.samples.ordinary_js_task_ms; },
    (value) => { delete value.samples.root_switch_to_useful_ms.calendar; },
    (value) => { value.samples.native_receipts.cold_launch_cycles[0].process_id = value.samples.native_receipts.cold_launch_cycles[0].previous_process_id; },
    (value) => { value.samples.native_receipts.cold_launch_cycles[0].source_receipt_sha256 = "f".repeat(64); },
    (value) => { delete value.samples.native_receipts.cold_launch_cycles[0].route_callback_receipt_sha256; },
    (value) => { value.samples.native_receipts.cold_launch_cycles[1].process_id = value.samples.native_receipts.cold_launch_cycles[0].process_id; value.samples.native_receipts.cold_launch_cycles[1].process_start_ticks = value.samples.native_receipts.cold_launch_cycles[0].process_start_ticks; },
    (value) => { value.samples.calendar_frame_sequences[0].capture_phase = "post-ready-idle"; },
    (value) => { value.samples.calendar_frame_sequences[0].refresh_rate_hz = 60; value.samples.calendar_frame_sequences[0].refresh_rate_source = "constant"; },
    (value) => { value.samples.garmin_sync_normalization.baseline.artifact_sha256 = value.samples.garmin_sync_normalization.runtime_receipt_sha256; },
    (value) => { value.samples.garmin_sync_normalization.baseline.artifact_json = "{}"; },
    (value) => { value.samples.garmin_sync_normalization.baseline.source_tree_sha256 = "f".repeat(64); },
    (value) => { value.samples.garmin_sync_normalization.fixture_profile.activity_count = 1; },
    (value) => { value.samples.native_receipts.ordinary_js_receipt.work_units = 0; },
    (value) => { value.samples.native_receipts.workload_receipt.set_count = 14_999; },
    (value) => { value.samples.native_receipts.input_receipts.numeric_edit.pop(); },
    (value) => { value.samples.native_receipts.input_receipts.rest_control[0].callback_count = 0; },
    (value) => { value.samples.native_receipts.root_switch_receipts.calendar[0].target_id = "harness-root-calendar"; },
  ]) {
    const changed = performanceEvidence(identity); mutate(changed);
    assert.throws(() => validateV12PerformanceProducer(changed, identity, V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD, invalid), /strict_performance_/u);
  }
});

test("cold launches preserve one logical source digest while process and readiness tuples remain unique", () => {
  const identity = qualityIdentity();
  const performance = performanceEvidence(identity);
  const cycles = performance.samples.native_receipts.cold_launch_cycles;
  assert.equal(new Set(cycles.map(({ source_receipt_sha256 }) => source_receipt_sha256)).size, 1);
  assert.equal(new Set(cycles.map(({ process_id, process_start_ticks }) => `${process_id}:${process_start_ticks}`)).size, 20);
  assert.equal(new Set(cycles.map(({ readiness_sha256 }) => readiness_sha256)).size, 20);
  assert.equal(validateV12PerformanceProducer(performance, identity, V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD, invalid), true);
});

test("persisted performance writer and verifier apply the identical producer schema", () => {
  const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
  const identity = qualityIdentity(); const written = new Map();
  const output = writeV12PerformanceObservation({ runId, identity, collect: () => performanceEvidence(identity), write: (file, value) => written.set(file, value) });
  assert.equal(output.observation.raw_samples.native_receipts.cold_launch_cycles.length, 20);
  assert.deepEqual(verifyV12PerformanceObservation({ runId, identity, readJson: (file) => written.get(file) }), output.observation.summary);
  const stale = structuredClone(output); delete stale.observation.raw_samples.native_receipts.garmin_receipt;
  assert.throws(() => verifyV12PerformanceObservation({ runId, identity, readJson: () => stale }), /performance_native_receipts_invalid/u);
});

#!/usr/bin/env node
// JSON-stdin fake device protocol. It intentionally contains no device serial,
// credentials, host path, or production data.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { V12_BROWSER_WALK_STATE_IDS, V12_CONFIG_IDS } from "../../v12-evidence-contract.mjs";
import { V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD } from "../../benchmark-v12-interactions.mjs";
import { V12_RECOVERY_CUT_DEFINITIONS, V12_RECOVERY_SCENARIOS, V12_RECOVERY_UNCOMMITTED_CUT_IDS } from "../../v12-recovery-shard.mjs";
import { createV12CalendarNativeFixtureResult } from "../v12-calendar-observation-fixture.mjs";
const sha = (value) => createHash("sha256").update(Buffer.isBuffer(value) ? value : String(value)).digest("hex");
const read = await new Promise((resolve) => { let body = ""; process.stdin.on("data", (chunk) => { body += chunk; }); process.stdin.on("end", () => resolve(JSON.parse(body))); });
const action = process.argv[3]; const fail = process.env.V12_FAKE_DEVICE_FAIL; const mutation = process.env.V12_FAKE_DEVICE_MUTATION;
if (fail && action.includes(fail)) process.exit(1);
if (mutation && action === "garmin") process.exit(1);
const png = (key, reference = false) => { const image = new PNG({ width: 200, height: 1 }); const hash = Buffer.from(sha(key), "hex"); image.data.set([hash[0], hash[1], hash[2], 255, hash[3], hash[4], hash[5], 255]); if (reference) image.data[0] ^= 1; return PNG.sync.write(image).toString("base64"); };
const repeated = (count, value) => Array.from({ length: count }, () => value);
const build = JSON.parse(readFileSync(`artifacts/native/v1.2/${read.attestation.run_id}/build.json`, 'utf8'));
let visualStates;
const visualState = (id) => {
  visualStates ??= JSON.parse(readFileSync("src/testing/phase20VisualStateRegistry.json", "utf8"));
  return visualStates.find((entry) => entry.id === id);
};
const visualConfig = (id) => {
  const [, appearance, size, orientation, font] = id.split("-");
  const portrait = { C360: [360, 800], C390: [390, 844], M600: [600, 960], X840: [840, 1080] }[size];
  return { appearance: appearance.startsWith("S") ? "System" : appearance === "L" ? "Light" : "Dark", scheme: appearance.endsWith("D") ? "dark" : "light", size, orientation, fontScale: Number(font.slice(1)) / 100, width: orientation === "P" ? portrait[0] : portrait[1], height: orientation === "P" ? portrait[1] : portrait[0] };
};
const visualObservation = (id, configurationId, nonce, captureNonce) => {
  const state = visualState(id); const source = state.reference.kind === "retained_png" ? state.reference.source : state.reference;
  const sourceMaterial = { state_id: id, fixture_variant: state.fixture_variant, assertions: state.readiness.source_receipt.assertions,
    production_instance_id: `phase20-production-instance-${Number(id.slice(-3))}`, mount_id: `phase20-production-mount-${Number(id.slice(-3))}`,
    scroll_offsets: [{ native_id: `${state.readiness.screen_test_id}-scroll`, x: 0, y: 0 }], timer: null };
  const sourceReceipt = { schema_version: 2, nonce, ...sourceMaterial, digest: sha(JSON.stringify(sourceMaterial)) };
  return { native_execution: "EXECUTED", state_id: id, configuration_id: configurationId,
    readiness: { status: state.readiness.status, semantics: state.readiness.semantics.map(value => ({ value, matched: true })), test_ids: state.readiness.test_ids.map(value => ({ value, matched: true })), actions: state.readiness.actions.map(entry => ({ ...entry, matched: true, enabled: true, observed_order: entry.order })), order: state.readiness.order.map((value, observed_order) => ({ value, observed_order })), non_color: state.readiness.non_color.map(value => ({ value, matched: true })), focus: { target: state.readiness.focus.target, matched: true, focusable: true, focused: false }, source_receipt: sourceReceipt },
    targets: [{ width_dp: 48, height_dp: 48, overlap: false }],
    native_focus: { resource_id: state.readiness.focus.target, class_name: "android.view.View", bounds: "[0,0][48,48]" },
    measurement: { kind: "source_semantic", renderer_digest: source.renderer_digest, semantic_digest: source.semantic_digest, layout_digest: source.layout_digest },
    ...(captureNonce === undefined ? {} : { capture_png_sha256: sha(Buffer.from(visualPng(id, configurationId), "base64")), capture_nonce: captureNonce, observation_nonce: nonce }) };
};
const visualCapture = (id, configurationId, phase) => {
  const key = `${id}:${configurationId}`; const bytes = Buffer.from(visualPng(id, configurationId), "base64"); const nonce = sha(`${phase}:${key}`).slice(0, 32); const observation = visualObservation(id, configurationId, nonce);
  const sourceReceipt = observation.readiness.source_receipt; const configuration = visualConfig(configurationId);
  const preserved = { native_focus: observation.native_focus, scroll_offsets: sourceReceipt.scroll_offsets, timer: sourceReceipt.timer, production_instance_id: sourceReceipt.production_instance_id, mount_id: sourceReceipt.mount_id };
  const receipt = { schema_version: 3, nonce, run_id: read.attestation.run_id, state_id: id, configuration_id: configurationId, fixture_id: "v12-synthetic-fixtures-r18", readiness_status: observation.readiness.status, source_tree_sha256: read.attestation.source_tree_sha256, apk_sha256: read.attestation.apk_sha256, device_identity_sha256: read.attestation.device_identity_sha256, png_sha256: sha(bytes), observation_sha256: sha(JSON.stringify(observation)), source_receipt: sourceReceipt,
    ...(configuration.appearance === "System" && configuration.scheme === "dark" ? { system_transition: { from: "light", to: "dark", mounted_nonce: nonce, color_scheme: { before: "light", after: "dark" }, before: preserved, after: preserved } } : {}) };
  return { native_execution: "EXECUTED", fixture_id: "v12-synthetic-fixtures-r18", png_base64: bytes.toString("base64"), settings: { restored: true, privacy: "synthetic-only", observation, state_receipt: receipt } };
};
const stateFocus = (id) => visualState(id).readiness.focus.target;
const referenceBinding = (id, configurationId) => {
  const state = visualState(id); const config = visualConfig(configurationId);
  if (state.reference.kind === "retained_png" && config.size === "C390" && config.orientation === "P" && config.fontScale === 1) return { kind: "retained_png", ...(config.scheme === "dark" ? state.reference.dark : state.reference.light), source: state.reference.source };
  return { kind: "approved_source", ...(state.reference.kind === "retained_png" ? state.reference.source : state.reference) };
};
const visualPng = (id, configurationId) => {
  const binding = referenceBinding(id, configurationId);
  return binding.kind === "retained_png" ? readFileSync(binding.path).toString("base64") : png(`${id}:${configurationId}`);
};
const performanceIdentity = Object.freeze({ base_head: build.source.head, source_tree_sha256: build.source.tree_sha256, apk_sha256: build.build.apk.sha256, installed_apk_sha256: build.device.installed_apk_sha256, package: build.build.package, device_identity_sha256: build.device.identity_sha256, fixture_sha256: build.fixtures.registry_sha256 });
const sqliteCaseIds = [
  "fresh-migration", "schema27-upgrade", "supported-legacy-upgrade", "failure-reopen",
  "backup", "restore", "merge", "noop-replay", "rebuild", "immutable-history",
];
const garminCaseIds = [
  "packaging", "bridge-allowlist", "canonical-json", "sync-read", "account-lifecycle", "recovery",
  "dedupe-restart", "dedupe-restore", "dedupe-merge", "match-zero", "match-one", "match-many",
  "match-stale", "match-alternate", "match-cancel", "match-confirm", "match-reassign", "privacy",
];
function recoverySnapshot(scenario, step, committed, recovered = false) {
  const exercise = sha(`${scenario.id}:exercise`); const transition = committed ? sha(`${scenario.id}:${step.id}:transition`) : null;
  const pointer = [{ session_sha256: sha(`${scenario.id}:session`), status: committed && step.receipt_kind === 'workout-finish' ? 'partial' : 'in_progress', revision: committed ? 3 : 2,
    active_exercise_sha256: exercise, active_set_exercise_sha256: exercise, active_set_sha256: sha(`${scenario.id}:active:1`), active_set_ordinal: 1,
    committed_set_exercise_sha256: committed ? exercise : null, committed_set_sha256: committed ? sha(`${scenario.id}:committed:0`) : null,
    committed_set_ordinal: committed ? 0 : null, transition_sha256: transition }];
  const seededRest = ['foreground-reconciliation', 'queued-callback', 'restore', 'merge'].includes(scenario.id);
  const rest = seededRest || (scenario.id === 'between-set-rest-pointer' && committed) ? [{ session_sha256: pointer[0].session_sha256, status: recovered ? 'expired' : 'running', revision: recovered ? 2 : 1, started_at_ms: recovered ? null : 100, ends_at_ms: recovered ? null : 200, deadline_at_ms: recovered ? null : 200, paused_remaining_ms: null, expired_at_ms: recovered ? 300 : null,
    next_set_exercise_sha256: exercise, next_set_sha256: pointer[0].active_set_sha256, next_set_ordinal: 1, transition_sha256: transition }] : [];
  const timing = [{ session_sha256: pointer[0].session_sha256, set_sha256: sha(`${scenario.id}:timing-set`), state_version: 1, revision: 1, status: 'stopped', mode: 'per_rep', configuration: { version: 1, mode: 'per_rep', intervalMs: 1500, cueChannels: 'haptic' }, progress: { version: 1, completedRepetitions: 2, completedGroups: 0, currentGroupIndex: 0, currentGroupProgress: 2 }, started_at_ms: null, next_boundary_at_ms: null, remaining_ms: null, stopped_at_ms: 150 }];
  const history = [{ event_sha256: sha(`${scenario.id}:history`), session_sha256: pointer[0].session_sha256, effective_revision: 2, event_type: 'correction', field_identity: 'advanced_timing_resolved_json', before_sha256: sha('off'), after_sha256: sha('timing'), occurred_at_ms: 140 }];
  const effect = (seededRest || committed) ? [{ effect_sha256: sha(`${scenario.id}:effect`), type: 'reconcile_rest_notification', subject_sha256: pointer[0].session_sha256, expected_revision: 1, status: recovered ? 'completed' : 'pending', attempt_count: recovered ? 1 : 0, next_attempt_at_ms: 200, last_error_code: null }] : [];
  const restore = [{ state: step.receipt_kind === 'secure-restore' && committed ? 'rebuild_pending' : 'ready', updated_at_ms: committed ? 300 : 0 }];
  const receiptTable = step.receipt_kind === 'garmin-import' ? 'imported_activity_receipts'
    : step.receipt_kind === 'activity-match' ? 'running_activity_match_receipts'
      : step.receipt_kind === 'secure-merge' ? 'metric_profile_migration_events' : null;
  const mergeReceipts = receiptTable && committed ? [{ table: receiptTable, receipt_sha256: sha(`${step.id}:receipt`), request_sha256: sha(`${step.id}:request`), idempotency_sha256: sha(`${step.id}:idempotency`), committed_at_ms: 300, result: receiptTable === 'metric_profile_migration_events' ? 'metric-migrated' : 'committed' }] : [];
  const commandReceipts = committed ? [{ step_id: step.id, boundary_id: step.boundary_id, kind: step.receipt_kind, receipt_sha256: sha(`${step.id}:command`), request_sha256: sha(`${step.id}:request`), committed_at_ms: 300, result: 'committed' }] : [];
  const source = committed ? [{ state: 'committed' }] : []; const receipt = committed ? [{ state: 'committed' }] : [];
  const digest = (value) => sha(JSON.stringify(value));
  return { source_count: source.length, receipt_count: receipt.length, effect_count: effect.length, pointer_count: pointer.length, rest_count: rest.length, history_count: history.length, timing_count: timing.length, restore_count: restore.length, merge_receipt_count: mergeReceipts.length, cue_count: 0,
    source_sha256: digest(source), receipt_sha256: digest(receipt), effect_sha256: digest(effect), pointer_sha256: digest(pointer), rest_sha256: digest(rest), history_sha256: digest(history), timing_sha256: digest(timing), restore_sha256: digest(restore), merge_receipt_sha256: digest(mergeReceipts), cue_sha256: digest([]),
    command_receipt_facts: commandReceipts, effect_facts: effect, pointer_facts: pointer, rest_facts: rest, timing_facts: timing, history_facts: history, restore_facts: restore, merge_receipt_facts: mergeReceipts };
}
function recoveryReport() {
  const cases = V12_RECOVERY_SCENARIOS.map((scenario, order) => ({ id: scenario.id, steps: scenario.steps, order, status: 'PASS', cuts: scenario.steps.flatMap((step, stepOrder) => V12_RECOVERY_CUT_DEFINITIONS.map((definition, cutOrder) => {
    const uncommitted = V12_RECOVERY_UNCOMMITTED_CUT_IDS.includes(definition.id);
    const before = recoverySnapshot(scenario, step, false); const afterCut = uncommitted ? before : recoverySnapshot(scenario, step, true);
    const afterReopen = uncommitted ? before : afterCut; const afterRecovery = definition.id === 'recovery' ? recoverySnapshot(scenario, step, true, true) : afterReopen;
    const afterRetry = definition.id === 'recovery' ? afterRecovery : uncommitted ? recoverySnapshot(scenario, step, true) : afterReopen;
    const snapshots = { before, after_cut: afterCut, after_reopen: afterReopen, after_recovery: afterRecovery, after_retry: afterRetry };
    return { step_id: step.id, boundary_id: step.boundary_id, receipt_kind: step.receipt_kind, cut_id: definition.id, status: 'PASS', operation_id: step.operation_id,
      barrier: { barrier_id: definition.barrier_id, process_state: definition.process_state, acknowledgement: definition.acknowledgement, connectivity: definition.connectivity, first_attempt: definition.first_attempt, provenance: definition.provenance },
      first_attempt_code: definition.barrier_id, recovery_code: definition.id === 'recovery' ? scenario.id === 'foreground-reconciliation' ? 'foreground-reconciled' : 'domain-reconciled' : 'not-required', retry_code: uncommitted ? 'committed' : 'replayed',
      receipt_sha256: sha(`${scenario.id}:${step.id}:${definition.id}:${order}:${stepOrder}:${cutOrder}`), snapshots };
  })) }));
  const junitCases = cases.flatMap((entry) => entry.cuts.map((cut) => `<testcase classname="v12.recovery" name="${entry.id}:${cut.step_id}:${cut.cut_id}"><properties>`
    + `<property name="case_id" value="${entry.id}"/><property name="step_id" value="${cut.step_id}"/><property name="cut_id" value="${cut.cut_id}"/><property name="operation_id" value="${cut.operation_id}"/>`
    + `<property name="boundary_id" value="${cut.boundary_id}"/><property name="receipt_kind" value="${cut.receipt_kind}"/><property name="barrier_id" value="${cut.barrier.barrier_id}"/><property name="barrier_provenance" value="${cut.barrier.provenance}"/><property name="process_state" value="${cut.barrier.process_state}"/>`
    + `<property name="acknowledgement" value="${cut.barrier.acknowledgement}"/><property name="connectivity" value="${cut.barrier.connectivity}"/><property name="first_attempt" value="${cut.barrier.first_attempt}"/>`
    + `<property name="first_attempt_code" value="${cut.first_attempt_code}"/><property name="recovery_code" value="${cut.recovery_code}"/><property name="retry_code" value="${cut.retry_code}"/><property name="receipt_sha256" value="${cut.receipt_sha256}"/>`
    + Object.entries(cut.snapshots).map(([key, value]) => `<property name="${key}_sha256" value="${sha(JSON.stringify(value))}"/>`).join('')
    + `<property name="state" value="PASS"/></properties></testcase>`));
  return { schema_version: 2, producer: 'v12-production-recovery-host', cases, junit_xml: `<?xml version="1.0" encoding="UTF-8"?><testsuite name="v12-recovery" tests="112">${junitCases.join('')}</testsuite>\n` };
}
const response = (() => {
  if (action === "acquire-lease") return { id: "lease" }; if (action === "release-lease") return true;
  if (action === "snapshot-settings") return { id: "settings" }; if (action === "restore-settings") return true;
  if (action === "visual-capture") return visualCapture(read.payload.state_id, read.payload.configuration_id, "capture");
  if (action === "visual-capture-batch") return read.payload.captures.map(({ state_id, configuration_id }) => visualCapture(state_id, configuration_id, "capture"));
  if (action === "visual-compare") return read.payload.captures.map(({ state_id: id, configuration_id }) => {
    const key = `${id}:${configuration_id}`; const pngHash = sha(Buffer.from(visualPng(id, configuration_id), "base64"));
    const captureNonce = sha(`capture:${key}`).slice(0, 32); const observationNonce = sha(`compare:${key}`).slice(0, 32);
    const observation = visualObservation(id, configuration_id, observationNonce, captureNonce); const state = visualState(id); const sourceReceipt = observation.readiness.source_receipt; const config = visualConfig(configuration_id);
    const preserved = { native_focus: observation.native_focus, scroll_offsets: sourceReceipt.scroll_offsets, timer: sourceReceipt.timer, production_instance_id: sourceReceipt.production_instance_id, mount_id: sourceReceipt.mount_id };
    const stateReceipt = { schema_version: 3, nonce: observationNonce, run_id: read.attestation.run_id, state_id: id, configuration_id, fixture_id: "v12-synthetic-fixtures-r18", readiness_status: observation.readiness.status, source_tree_sha256: read.attestation.source_tree_sha256, apk_sha256: read.attestation.apk_sha256, device_identity_sha256: read.attestation.device_identity_sha256, png_sha256: pngHash, observation_sha256: sha(JSON.stringify(observation)), source_receipt: sourceReceipt,
      ...(config.appearance === "System" && config.scheme === "dark" ? { system_transition: { from: "light", to: "dark", mounted_nonce: observationNonce, color_scheme: { before: "light", after: "dark" }, before: preserved, after: preserved } } : {}) };
    const captureSourceReceipt = { ...sourceReceipt, nonce: captureNonce };
    const captureStateReceipt = { ...stateReceipt, nonce: captureNonce, observation_sha256: sha(JSON.stringify(visualObservation(id, configuration_id, captureNonce))), source_receipt: captureSourceReceipt };
    if (captureStateReceipt.system_transition) captureStateReceipt.system_transition = { ...captureStateReceipt.system_transition, mounted_nonce: captureNonce };
    return {
      id,
      configuration_id,
      identity: { fixture: "v12-synthetic-fixtures-r18", clock: "2026-10-14T00:00:00Z", locale: "en-SG", timezone: "Asia/Singapore", content_bounds: { width: 390, height: 844 } },
      reference_binding: referenceBinding(id, configuration_id), capture_state_receipt: captureStateReceipt, state_receipt: stateReceipt, observation,
    };
  });
  if (action === "accessibility") return [{
    configuration: { font_scale: 2, density: 3, content_bounds: { width: 390, height: 844 }, insets: { top: 24, bottom: 24 }, ime_bounds: { top: 500, bottom: 844 } },
    targets: [{ id: "primary", bounds_dp: { left: 0, top: 0, width: 48, height: 48 }, name: "Continue", role: "button", state: "enabled", non_color_cue: true, overlap: false }],
    interactions: ["touch", "software-keyboard", "hardware-keyboard", "dpad"].map((input) => ({ input, focus_before: "primary", action: "activate", focus_after: "primary", command_count: 1, image_hash: sha(`accessibility:${input}`) })),
    modal: { focus_ring_dp: 3, focus_offset_dp: 3, back: "closes-modal", escape: "closes-modal", restores_invoker: true },
    motion: { normal: { destination: "done", callbacks: 1, source_facts: "synthetic" }, reduced: { destination: "done", callbacks: 1, source_facts: "synthetic" } },
    fixture_id: "v12-synthetic-fixtures-r18",
    native_execution: "EXECUTED",
    restored_settings: true,
  }];
  if (action === "performance" && read.payload.request === "identity") return { identity: performanceIdentity };
  if (action === "performance") return {
    schema_version: 1,
    suite: "v1.2-performance",
    producer: "v12-release-performance-collector/v1",
    native_execution: "EXECUTED",
    sample_origin: "release-native-source-backed",
    workload: V12_PERFORMANCE_WORKLOAD,
    identity: performanceIdentity,
    budgets: V12_PERFORMANCE_BUDGETS,
    samples: {
      warm_launch_to_interactive_ms: repeated(20, 100), cold_launch_to_interactive_ms: repeated(20, 200),
      root_switch_to_useful_ms: { workout: repeated(100, 40), calendar: repeated(100, 40), library: repeated(100, 40), progress: repeated(100, 40) },
      committed_set_to_visible_dock_ms: repeated(100, 80), ordinary_js_task_ms: repeated(100, 10),
      input_response_ms: { numeric_edit: repeated(100, 10), rest_control: repeated(100, 10) },
      search_after_debounce_ms: repeated(100, 20), calendar_month_and_selection_ms: repeated(100, 50),
      progress_useful_content_ms: repeated(20, 80), progress_review_open_ms: repeated(100, 50), progress_targeted_rebuild_ms: repeated(20, 80),
      calendar_frame_sequences: Array.from({ length: 100 }, () => ({ frame_work_ms: [10, 12], missed_frames: 0, refresh_rate_hz: 60, profiler_overhead_ms: 0.2 })),
      phase12_dirty_trigger_ms: repeated(100, 1), phase12_writer_occupancy_ms: repeated(20, 20),
      phase12_merge_preflight_ms: repeated(10, 100), phase12_merge_peak_growth_bytes: repeated(10, 1024), phase12_merge_materialization_ms: repeated(5, 100),
      phase12_merge_fixture: { snapshot_bytes: 24 * 1024 * 1024, rows: 100000, writer_commits: 5, sqlite_max_variable_number: 4000 },
      garmin_sync_normalization: { state: "REVIEW_REQUIRED", limit_source: "phase18-exact-artifact-baseline", fixture_sha256: sha("garmin-fixture") },
    },
  };
  if (action === "sqlite") return {
    status: "passed",
    contract: {
      schemaVersion: 1,
      contractVersion: 1,
      status: "passed",
      total: sqliteCaseIds.length,
      passed: sqliteCaseIds.length,
      failed: 0,
      skipped: 0,
      cases: sqliteCaseIds.map((id) => ({ id, status: "passed", code: "v12_acceptance_case_passed", counts: { sourceCases: 1 } })),
    },
  };
  if (action === "recovery") return recoveryReport();
  if (action === "garmin") return {
    cases: garminCaseIds.map((id, order) => ({ id, order, status: "PASS", code: "native-passed", count: id === "match-one" ? 1 : 0 })),
  };
  if (action === "calendar") {
    return createV12CalendarNativeFixtureResult({ flowSha256: read.payload.flow_sha256,
      requirementsFlowSha256: sha(readFileSync("maestro/v1.2/calendar-requirements.yaml")),
      fixtureSourceSha256: sha(readFileSync("src/testing/phase20CalendarFixture.ts")), attestation: read.attestation,
      launcherSourceSha256: sha(readFileSync(fileURLToPath(import.meta.url))) });
  }
  // Other actions intentionally return only a shape; the black-box test is the
  // contract that forces producers to reject anything insufficient.
  return { mutation, result: "synthetic" };
})();
const attestation = { ...read.attestation };
if (process.env.V12_FAKE_DEVICE_FORGE_ATTESTATION === "apk") attestation.apk_sha256 = "0".repeat(64);
if (process.env.V12_FAKE_DEVICE_FORGE_ATTESTATION === "device") attestation.device_identity_sha256 = "0".repeat(64);
if (process.env.V12_FAKE_DEVICE_FORGE_ATTESTATION === "source") attestation.source_tree_sha256 = "0".repeat(64);
process.stdout.write(`${JSON.stringify({ schema_version: 1, action, ok: true, result: response, attestation })}\n`);

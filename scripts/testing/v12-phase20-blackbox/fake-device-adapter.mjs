#!/usr/bin/env node
// JSON-stdin fake device protocol. It intentionally contains no device serial,
// credentials, host path, or production data.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import { V12_BROWSER_WALK_STATE_IDS, V12_CONFIG_IDS } from "../../v12-evidence-contract.mjs";
import { V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD } from "../../benchmark-v12-interactions.mjs";
import { V12_RECOVERY_CUT_DEFINITIONS, V12_RECOVERY_SCENARIOS, V12_RECOVERY_UNCOMMITTED_CUT_IDS } from "../../v12-recovery-shard.mjs";
const sha = (value) => createHash("sha256").update(String(value)).digest("hex");
const read = await new Promise((resolve) => { let body = ""; process.stdin.on("data", (chunk) => { body += chunk; }); process.stdin.on("end", () => resolve(JSON.parse(body))); });
const action = process.argv[3]; const fail = process.env.V12_FAKE_DEVICE_FAIL; const mutation = process.env.V12_FAKE_DEVICE_MUTATION;
if (fail && action.includes(fail)) process.exit(1);
if (process.env.V12_FAKE_GARMIN_AUTH_REQUIRED === "1" && action === "garmin") {
  process.stderr.write("v12_production_native_launcher_auth_required\n");
  process.exit(1);
}
if (mutation && action === "garmin") process.exit(1);
const png = (key, reference = false) => { const image = new PNG({ width: 200, height: 1 }); const hash = Buffer.from(sha(key), "hex"); image.data.set([hash[0], hash[1], hash[2], 255, hash[3], hash[4], hash[5], 255]); if (reference) image.data[0] ^= 1; return PNG.sync.write(image).toString("base64"); };
const sample = (index, dx = 25) => ({ timestampMs: index + 1, widthDp: 100, dxDp: dx, dyDp: 0, intentOwner: "horizontal", translationDp: dx, title: "2026-10", selectedCivilDate: "2026-10-14", generation: index + 1, focusedWeek: "week", rowBounds: [0, 48], callbackCount: index + 1, focusIdentity: "calendar", motion: "normal" });
const repeated = (count, value) => Array.from({ length: count }, () => value);
const build = JSON.parse(readFileSync(`artifacts/native/v1.2/${read.attestation.run_id}/build.json`, 'utf8'));
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
  if (action === "visual-capture") return { native_execution: "EXECUTED", fixture_id: "v12-synthetic-fixtures-r18", png_base64: png(`${read.payload.state_id}:${read.payload.configuration_id}`), settings: { restored: true, privacy: "synthetic-only" } };
  if (action === "visual-capture-batch") return read.payload.captures.map(({ state_id, configuration_id }) => ({ native_execution: "EXECUTED", fixture_id: "v12-synthetic-fixtures-r18", png_base64: png(`${state_id}:${configuration_id}`), settings: { restored: true, privacy: "synthetic-only" } }));
  if (action === "visual-compare") return V12_BROWSER_WALK_STATE_IDS.flatMap((id) => V12_CONFIG_IDS.map((configuration_id) => {
    const key = `${id}:${configuration_id}`;
    return {
      id,
      configuration_id,
      identity: { fixture: "v12-synthetic-fixtures-r18", clock: "2026-10-14T00:00:00Z", locale: "en-SG", timezone: "Asia/Singapore", content_bounds: { width: 390, height: 844 } },
      approved_reference_png_base64: png(key, true),
      observation: { native_execution: "EXECUTED", state_id: id, configuration_id, content: true, actions: true, copy: true, state: true, route: true, focus: true, order: true, targets: [{ width_dp: 48, height_dp: 48, overlap: false }], non_color_state: true, commit_read_only: true, geometry_dp: 0, baseline_icon_dp: 0, token_exact: true, ciede2000: 0 },
    };
  }));
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
    const ids = ["drag-forward-10", "drag-forward-24_9", "drag-forward-25", "drag-forward-25_1", "drag-forward-release-below", "drag-forward-release-exact", "drag-forward-release-above", "drag-backward-10", "drag-backward-24_9", "drag-backward-25", "drag-backward-25_1", "drag-backward-release-below", "drag-backward-release-exact", "drag-backward-release-above", "drag-fast-subthreshold", "drag-retreat", "drag-cancel", "drag-vertical", "drag-diagonal", "second-input-interrupt", "week-expand-first-row", "week-expand-middle-row", "week-expand-last-row", "adjacent-week", "month-year-boundary", "leap-february", "four-row-month", "five-row-month", "six-row-month", "rapid-reverse-input", "rotation-during-transition", "background-during-transition", "reduced-motion", "dev-01-padding", "dev-02-light-title"];
    const stage = (id, order) => ({ id, order, status: "PASS", samples: [sample(order * 2, 25), sample(order * 2 + 1, 25)], receipt: { content_width_dp: 100, start_dp: [75, 45], end_dp: [50, 45], dx_dp: -25, dy_dp: 0, event_sequence: ["pointer-down", "pointer-move", "pointer-up"], cancelled: false, settled: true, callback_count: 1, semantic_transition: { pre: "month", during: "dragging", post: "month" }, screenshot_sha256: sha(`calendar-shot:${id}`), trace_sha256: sha(`calendar-trace:${id}`), expected_outcome: id } });
    const stages = ids.map(stage);
    return { flow_sha256: read.payload.flow_sha256, flow_revision: read.payload.flow_revision, stages, junit_cases: stages.map(({ id, order, status }) => ({ id, order, status })) };
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

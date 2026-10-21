import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createDomainRunner } from './testing/v12-production-domain/controlled-domain-runner.mjs';
import { V12_GARMIN_SHARD_CASE_IDS } from './v12-garmin-shard.mjs';

const fixture = (t) => { const r = createDomainRunner(); t.after(r.cleanup); return r; };
function success(result) { assert.equal(result.status, 0, result.stderr); const value = JSON.parse(result.stdout); assert.equal(value.node_env, 'production'); assert.equal(value.native_evidence, false); return value.result; }
function bounded(result, code) { assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); assert.match(result.stderr, new RegExp(`^v12_production_native_launcher_${code}$`, 'u')); assert.doesNotMatch(result.stderr, /bearer|\/Users\/|private-native|controlled-device/u); }

test('unowned actions return undefined without native work', (t) => { const r = fixture(t); assert.equal(success(r.invoke('visual-capture')), null); });
test('Garmin returns exactly 18 ordered privacy-safe native aggregates', (t) => {
  const r = fixture(t); const result = success(r.invoke('garmin'));
  assert.deepEqual(Object.keys(result), ['producer', 'cases', 'execution_origin']);
  assert.equal(result.producer, 'v12-production-garmin-host/v1');
  assert.equal(result.execution_origin, 'test-controlled/v1');
  assert.deepEqual(result.cases.map((c) => c.id), V12_GARMIN_SHARD_CASE_IDS);
  assert.ok(result.cases.every((entry) => entry.status === 'PASS' && /^[a-f0-9]{64}$/u.test(entry.receipt_sha256)));
  assert.ok(result.cases.every((entry) => Object.keys(entry).sort().join(',') === 'code,count,id,order,receipt_sha256,status'));
  assert.equal(existsSync(path.join(r.scratch, 'lock')), false);
});
test('Garmin accepts a restart with a different PID and a new process birth claim', (t) => {
  const r = fixture(t); r.updateState({ reuseProcessId: false, reuseProcessBirth: false });
  const result = success(r.invoke('garmin'));
  assert.ok(result.cases.every(({ status }) => status === 'PASS'));
  assert.equal(r.readState().processCounter, 1002);
  assert.equal(r.readState().processStartTicks, 5200);
});
test('Garmin accepts same-PID reuse only when the process birth claim changes', (t) => {
  const r = fixture(t); r.updateState({ reuseProcessId: true, reuseProcessBirth: false });
  const result = success(r.invoke('garmin'));
  assert.ok(result.cases.every(({ status }) => status === 'PASS'));
  assert.equal(r.readState().processCounter, 1001);
  assert.equal(r.readState().processStartTicks, 5200);
});
test('Garmin rejects the same PID with the same process birth claim', (t) => {
  const r = fixture(t); r.updateState({ reuseProcessId: true, reuseProcessBirth: true });
  bounded(r.invoke('garmin'), 'garmin_restart_invalid');
});
test('Garmin is reachable through the production adapter and checked-in default launcher subprocess', (t) => {
  const r = fixture(t); const result = success(r.invokeDefault('garmin'));
  assert.equal(result.producer, 'v12-production-garmin-host/v1');
  assert.equal(result.execution_origin, 'test-controlled/v1');
  assert.equal(result.cases.length, 18);
  assert.ok(result.cases.every(({ status }) => status === 'PASS'));
});
for (const [key, code] of [['authRequired', 'auth_required'], ['missingMarker', 'marker_timeout'], ['staleMarker', 'marker_timeout']]) test(`Garmin ${key} is bounded and never emits evidence`, (t) => {
  const r = fixture(t); r.updateState({ [key]: true }); const start = Date.now(); bounded(r.invoke('garmin'), code); assert.ok(Date.now() - start < 70_000); assert.equal(existsSync(path.join(r.scratch, 'lock')), false);
});
for (const mutation of ['private', 'extra', 'order', 'count']) test(`Garmin rejects ${mutation}`, (t) => {
  const r = fixture(t); const garmin = r.readState().garmin;
  if (mutation === 'private') garmin.receipts[0].code = 'bearer secret';
  if (mutation === 'extra') garmin.receipts[0].account_id = 'private';
  if (mutation === 'order') garmin.receipts.reverse();
  if (mutation === 'count') garmin.receipts[0].count = -1;
  r.updateState({ garmin }); bounded(r.invoke('garmin'), mutation === 'private' ? 'garmin_privacy_failed' : 'garmin_result_invalid');
});
for (const action of ['garmin', 'recovery']) test(`${action} validates attestation and device before actions`, (t) => {
  const r = fixture(t); bounded(r.invoke(action, {}, { build_profile: 'production' }), 'attestation_invalid');
  bounded(r.invoke(action, {}, { source_tree_sha256: '0'.repeat(64) }), 'identity_mismatch');
  r.updateState({ wrongApk: true }); bounded(r.invoke(action), 'apk_identity_mismatch');
  assert.equal(r.readState().domainCalls.length, 0);
});
test('Recovery derives all 14 command steps by 8 cuts from durable native readback facts', (t) => {
  const r = fixture(t); const report = success(r.invoke('recovery')); const xml = report.junit_xml;
  assert.equal((xml.match(/<testcase\b/gu) ?? []).length, 112);
  for (const key of [
    'case_id', 'step_id', 'cut_id', 'operation_id', 'boundary_id', 'receipt_kind', 'barrier_id', 'barrier_provenance',
    'process_state', 'acknowledgement', 'connectivity', 'first_attempt',
    'first_attempt_code', 'recovery_code', 'retry_code', 'receipt_sha256',
    'before_sha256', 'after_cut_sha256', 'after_reopen_sha256',
    'after_recovery_sha256', 'after_retry_sha256',
  ]) assert.equal((xml.match(new RegExp(`name="${key}"`, 'gu')) ?? []).length, 112);
  assert.doesNotMatch(xml, /name="app_status"|name="app_verdict"/u);
  assert.equal(r.readState().domainCalls.length, 224);
});
test('Recovery is reachable through the production adapter and checked-in default launcher subprocess', (t) => {
  const r = fixture(t); const xml = success(r.invokeDefault('recovery')).junit_xml;
  assert.equal((xml.match(/<testcase\b/gu) ?? []).length, 112);
  assert.equal(r.readState().domainCalls.length, 224);
});
test('Recovery returns eight causal scenarios, eight distinct barriers, and per-cut rich facts', (t) => {
  const r = fixture(t); const report = success(r.invokeDefault('recovery'));
  assert.equal(report.schema_version, 2);
  assert.equal(report.producer, 'v12-production-recovery-host');
  assert.equal(report.cases.length, 8);
  assert.deepEqual(report.cases.flatMap((entry) => entry.steps.map((step) => step.operation_id)), [
    'legacy-workout-start', 'legacy-workout-edit', 'foreground-rest-reconcile',
    'queued-set-commit', 'relaunch-workout-finish', 'secure-restore-commit',
    'restore-garmin-import', 'secure-merge-commit', 'merge-activity-match',
    'zero-cue-workout-start', 'zero-cue-workout-edit', 'zero-cue-workout-finish',
    'between-set-commit', 'between-set-rest-transition',
  ]);
  const cuts = report.cases.flatMap((entry) => entry.cuts);
  assert.equal(cuts.length, 112);
  assert.deepEqual([...new Set(report.cases[0].cuts.slice(0, 8).map((cut) => cut.barrier.barrier_id))], [
    'before-transaction', 'writer-transaction-open', 'commit-durable-ack-pending',
    'acknowledgement-observed', 'relaunch-runtime-open', 'first-attempt-failed',
    'offline-toggle-before-commit', 'recovery-replay-writer-open',
  ]);
  assert.equal(new Set(cuts.map((cut) => cut.barrier.provenance)).size, 8);
  assert.equal(new Set(cuts.map((cut) => cut.receipt_sha256)).size, 112);
  assert.ok(cuts.every((cut) => ['before', 'after_cut', 'after_reopen', 'after_recovery', 'after_retry']
    .every((name) => cut.snapshots[name]?.rest_facts && cut.snapshots[name]?.timing_facts
      && cut.snapshots[name]?.history_facts && cut.snapshots[name]?.restore_facts
      && cut.snapshots[name]?.merge_receipt_facts && cut.snapshots[name]?.command_receipt_facts)));
  assert.ok(cuts.every((cut) => cut.snapshots.after_retry.command_receipt_facts.length === 1
    && cut.snapshots.after_retry.command_receipt_facts[0].kind === cut.receipt_kind));
  assert.ok(cuts.filter((cut) => ['post-commit-before-ack', 'post-acknowledgement', 'relaunch'].includes(cut.cut_id))
    .every((cut) => JSON.stringify(cut.snapshots.after_retry) === JSON.stringify(cut.snapshots.after_reopen)));
  assert.ok(cuts.filter((cut) => cut.cut_id === 'offline').every((cut) => (
    JSON.stringify(cut.snapshots.after_reopen) === JSON.stringify(cut.snapshots.before)
      && cut.snapshots.after_retry.receipt_count === cut.snapshots.before.receipt_count + 1
      && cut.snapshots.after_retry.command_receipt_facts.length === 1
  )));
  const byId = Object.fromEntries(report.cases.map((entry) => [entry.id, entry]));
  assert.ok(byId['legacy-playback'].cuts.filter((cut) => cut.step_id === 'legacy-edit').every((cut) => cut.snapshots.after_retry.timing_count > 0
    && cut.snapshots.after_retry.history_count > 0 && cut.snapshots.after_retry.cue_count === 0));
  assert.equal(byId['foreground-reconciliation'].cuts.find((cut) => cut.cut_id === 'recovery').recovery_code, 'foreground-reconciled');
  assert.ok(byId['queued-callback'].cuts.every((cut) => cut.snapshots.after_retry.effect_count > 0));
  assert.ok(byId.restore.cuts.every((cut) => cut.snapshots.after_retry.restore_facts.length === 1));
  assert.ok(byId.restore.cuts.filter((cut) => cut.step_id === 'restore-import').every((cut) => cut.snapshots.after_retry.merge_receipt_facts.some((fact) => fact.table === 'imported_activity_receipts')));
  assert.ok(byId.merge.cuts.filter((cut) => cut.step_id === 'merge-commit').every((cut) => cut.snapshots.after_retry.merge_receipt_facts.some((fact) => fact.table === 'metric_profile_migration_events')));
  assert.ok(byId.merge.cuts.filter((cut) => cut.step_id === 'merge-match').every((cut) => cut.snapshots.after_retry.merge_receipt_facts.some((fact) => fact.table === 'running_activity_match_receipts')));
  assert.ok(byId['between-set-rest-pointer'].cuts.every((cut) => cut.snapshots.after_retry.pointer_facts.length > 0
    && cut.snapshots.after_retry.rest_facts.length > 0));
});
test('Recovery quarantines and deletes raw Maestro JUnit even when diagnostics contain secrets', (t) => {
  const r = fixture(t); r.updateState({ junitFailure: true });
  const report = success(r.invokeDefault('recovery'));
  assert.doesNotMatch(JSON.stringify(report), /private-native|bearer|\/Users\//u);
  const runRoot = path.join(r.root, 'artifacts/native/v1.2', r.build.run_id);
  const retained = readdirSync(runRoot, { recursive: true }).map(String);
  assert.ok(retained.every((name) => !name.includes('domain-') && !name.endsWith('.raw.xml')));
  for (const name of retained) {
    const file = path.join(runRoot, name);
    if (existsSync(file) && !readdirSync(path.dirname(file)).includes(path.basename(file))) continue;
    try { assert.doesNotMatch(readFileSync(file, 'utf8'), /private-native|bearer|\/Users\//u); } catch { /* directories and binary files */ }
  }
});
test('Recovery rejects missing cut and restores settings in finally', (t) => { const r = fixture(t); r.updateState({ missingCut: true, changeSettings: true }); bounded(r.invoke('recovery'), 'recovery_receipt_invalid'); assert.equal(r.readState().settings.font_scale, '1.15'); assert.equal(r.readState().settings.airplane_mode_on, '0'); assert.equal(existsSync(path.join(r.scratch, 'lock')), false); });
for (const key of ['junitFailure', 'junitSkip']) test(`Recovery preserves ${key} and restores settings`, (t) => { const r = fixture(t); r.updateState({ [key]: true, changeSettings: true }); const xml = success(r.invoke('recovery')).junit_xml; assert.equal((xml.match(key === 'junitFailure' ? /<failure\b/gu : /<skipped\b/gu) ?? []).length, 112); assert.doesNotMatch(xml, /private-native|bearer|\/Users\//u); assert.equal(r.readState().settings.font_scale, '1.15'); assert.equal(r.readState().settings.airplane_mode_on, '0'); });
test('Recovery keeps the device lease when connectivity restore fails', (t) => { const r = fixture(t); r.updateState({ failAirplaneRestore: true, missingCut: true }); bounded(r.invoke('recovery'), 'settings_restore_failed'); assert.equal(existsSync(path.join(r.scratch, 'lock')), true); });
for (const key of ['missingBundle', 'wrongSuite']) test(`standalone APK rejects ${key} before native actions`, (t) => { const r = fixture(t); r.updateState({ [key]: true }); bounded(r.invoke('garmin'), 'standalone_required'); assert.equal(r.readState().domainCalls.length, 0); });

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
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
  assert.deepEqual(Object.keys(result), ['cases']);
  assert.deepEqual(result.cases.map((c) => c.id), V12_GARMIN_SHARD_CASE_IDS);
  assert.deepEqual(result, r.readState().garmin);
  assert.equal(existsSync(path.join(r.scratch, 'lock')), false);
});
for (const [key, code] of [['authRequired', 'auth_required'], ['missingMarker', 'marker_timeout'], ['staleMarker', 'marker_timeout']]) test(`Garmin ${key} is bounded and never emits evidence`, (t) => {
  const r = fixture(t); r.updateState({ [key]: true }); const start = Date.now(); bounded(r.invoke('garmin'), code); assert.ok(Date.now() - start < 70_000); assert.equal(existsSync(path.join(r.scratch, 'lock')), false);
});
for (const mutation of ['private', 'extra', 'order', 'count']) test(`Garmin rejects ${mutation}`, (t) => {
  const r = fixture(t); const garmin = r.readState().garmin;
  if (mutation === 'private') garmin.cases[0].code = 'bearer secret';
  if (mutation === 'extra') garmin.cases[0].account_id = 'private';
  if (mutation === 'order') garmin.cases.reverse();
  if (mutation === 'count') garmin.cases[0].count = -1;
  r.updateState({ garmin }); bounded(r.invoke('garmin'), 'garmin_result_invalid');
});
for (const action of ['garmin', 'recovery']) test(`${action} validates attestation and device before actions`, (t) => {
  const r = fixture(t); bounded(r.invoke(action, {}, { build_profile: 'production' }), 'attestation_invalid');
  bounded(r.invoke(action, {}, { source_tree_sha256: '0'.repeat(64) }), 'identity_mismatch');
  r.updateState({ wrongApk: true }); bounded(r.invoke(action), 'apk_identity_mismatch');
  assert.equal(r.readState().domainCalls.length, 0);
});
test('Recovery executes exact 8 by 8 cuts and retains receipt properties', (t) => { const r = fixture(t); const xml = success(r.invoke('recovery')); assert.equal((xml.match(/<testcase\b/gu) ?? []).length, 64); for (const key of ['case_id', 'cut_id', 'receipt_sha256']) assert.equal((xml.match(new RegExp(`name="${key}"`, 'gu')) ?? []).length, 64); assert.equal(r.readState().domainCalls.length, 64); });
test('Recovery rejects missing cut and restores settings in finally', (t) => { const r = fixture(t); r.updateState({ missingCut: true, changeSettings: true }); bounded(r.invoke('recovery'), 'recovery_receipt_invalid'); assert.equal(r.readState().settings.font_scale, '1.15'); assert.equal(r.readState().settings.airplane_mode_on, '0'); assert.equal(existsSync(path.join(r.scratch, 'lock')), false); });
for (const key of ['junitFailure', 'junitSkip']) test(`Recovery preserves ${key} and restores settings`, (t) => { const r = fixture(t); r.updateState({ [key]: true, changeSettings: true }); const xml = success(r.invoke('recovery')); assert.equal((xml.match(key === 'junitFailure' ? /<failure\b/gu : /<skipped\b/gu) ?? []).length, 64); assert.doesNotMatch(xml, /private-native|bearer|\/Users\//u); assert.equal(r.readState().settings.font_scale, '1.15'); assert.equal(r.readState().settings.airplane_mode_on, '0'); });
test('Recovery keeps the device lease when connectivity restore fails', (t) => { const r = fixture(t); r.updateState({ failAirplaneRestore: true, missingCut: true }); bounded(r.invoke('recovery'), 'settings_restore_failed'); assert.equal(existsSync(path.join(r.scratch, 'lock')), true); });
for (const key of ['missingBundle', 'wrongSuite']) test(`standalone APK rejects ${key} before native actions`, (t) => { const r = fixture(t); r.updateState({ [key]: true }); bounded(r.invoke('garmin'), 'standalone_required'); assert.equal(r.readState().domainCalls.length, 0); });

import assert from 'node:assert/strict';
import test from 'node:test';
import { garminCases, junitOutcome, worse } from './v12-production-domain-receipts.mjs';

const garminIds = [
  'packaging', 'bridge-allowlist', 'canonical-json', 'sync-read', 'account-lifecycle', 'recovery',
  'dedupe-restart', 'dedupe-restore', 'dedupe-merge', 'match-zero', 'match-one', 'match-many',
  'match-stale', 'match-alternate', 'match-cancel', 'match-confirm', 'match-reassign', 'privacy',
];
const recovery = [
  ['PH18-ADV-RESTORE', 'completed'], ['PH18-ADV-REFRESH', 'completed'], ['PH18-ADV-READ', 'completed'], ['PH18-ADV-LOGOUT', 'completed'], ['PH18-ADV-RESTART', 'sign_in_required'], ['PH18-ADV-LATE-GENERATION', 'stale_generation'],
  ['PH18-ADV-EXPIRED', 'sign_in_required'], ['PH18-ADV-401', 'sign_in_required'], ['PH18-ADV-403', 'data_access_denied'], ['PH18-ADV-429', 'rate_limited'], ['PH18-ADV-OFFLINE', 'offline'], ['PH18-ADV-TIMEOUT', 'timeout'],
  ['PH18-ADV-5XX', 'temporary_failure'], ['PH18-ADV-MALFORMED', 'malformed_response'], ['PH18-ADV-TRUNCATED', 'malformed_response'], ['PH18-ADV-OVERSIZED', 'malformed_response'], ['PH18-ADV-UNSUPPORTED-JSON', 'malformed_response'],
  ['PH18-ADV-MISSING-COMPONENT', 'malformed_response'], ['PH18-ADV-PARTIAL-PAGE', 'temporary_failure'], ['PH18-ADV-ROTATION', 'stale_generation'],
];
function garminInput() {
  const counts = { 'bridge-allowlist': 2, 'account-lifecycle': 5, recovery: 20, 'match-zero': 0, 'match-one': 1, 'match-many': 2, 'match-alternate': 2, 'match-cancel': 0 };
  return {
    value: {
      receipts: garminIds.slice(0, -1).map((id, order) => ({ id, order, code: `${id}-observed`, count: counts[id] ?? 1, receipt_sha256: 'a'.repeat(64) })),
      host_observations: {
        bridge: { evidence_source: 'installed-chaquopy', operations: ['connectionState', 'login', 'resumeMfa', 'restoreSession', 'logout', 'getActivities', 'getActivity', 'getActivitySplits', 'getActivityDetails', 'forceRefreshForTest', 'runAdversarialSuite'], operation_rejection: 'operation_rejected', arguments_rejection: 'arguments_rejected' },
        lifecycle: { restore: 'connected', refresh: 'connected', cold_restore: 'connected', logout: 'disconnected', restored: 'connected', rotation: 'rotated', restart: 'same-account', storage: 'no-backup-encrypted', before_sha256: 'b'.repeat(64), refreshed_sha256: 'c'.repeat(64), restored_sha256: 'd'.repeat(64) },
        recovery: recovery.map(([id, code], order) => ({ id, code, call_count: [1, 1, 4, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 4, 1, 5, 3, 5, 3][order], automatic_retry_count: 0, retry_after_ms: id === 'PH18-ADV-429' ? 900_000 : 0 })),
        restart: { process_changed: true, session_consistent: true },
      },
    },
    privacy: { id: 'privacy', order: 17, code: 'privacy-observed', count: 6, receipt_sha256: 'e'.repeat(64) },
  };
}

test('Garmin host derives all 18 PASS statuses only from exact operation pairs', () => {
  const input = garminInput(); const result = garminCases(input.value, input.privacy);
  assert.equal(result.producer, 'v12-production-garmin-host/v1');
  assert.deepEqual(result.cases.map(({ id, status }) => [id, status]), garminIds.map(id => [id, 'PASS']));
});

test('Garmin host rejects a test-only evidence source and malformed receipt pair', () => {
  const testOnly = garminInput(); testOnly.value.host_observations.bridge.evidence_source = 'test-only';
  assert.throws(() => garminCases(testOnly.value, testOnly.privacy), /garmin_result_invalid/u);
  const malformed = garminInput(); malformed.value.receipts[0].code = 'generic-observed';
  assert.throws(() => garminCases(malformed.value, malformed.privacy), /garmin_result_invalid/u);
});

for (const [name, caseId, mutate] of [
  ['bridge operation', 'bridge-allowlist', input => { input.value.host_observations.bridge.operations.pop(); }],
  ['lifecycle code', 'account-lifecycle', input => { input.value.host_observations.lifecycle.rotation = 'unchanged'; }],
  ['restart comparison', 'account-lifecycle', input => { input.value.host_observations.restart.process_changed = false; }],
  ['recovery pair', 'recovery', input => { input.value.host_observations.recovery[7].code = 'temporary_failure'; }],
]) test(`Garmin host derives typed FAIL for mismatched ${name}`, () => {
  const input = garminInput(); mutate(input);
  const entry = garminCases(input.value, input.privacy).cases.find(({ id }) => id === caseId);
  assert.deepEqual({ status: entry.status, code: entry.code }, { status: 'FAIL', code: `${caseId}-evidence-mismatch` });
});

test('JUnit outcome is structural, preserves failure precedence, and requires exactly one case', () => {
  assert.equal(junitOutcome('<testsuite><testcase name="a"/></testsuite>', 0), 'PASS');
  assert.equal(junitOutcome('<testsuites><testsuite><testcase><skipped/></testcase></testsuite></testsuites>', 0), 'NOT_RUN');
  assert.equal(junitOutcome('<testsuite><testcase><skipped/><error/></testcase></testsuite>', 1), 'FAIL');
  assert.equal(worse('FAIL', 'PASS'), 'FAIL');
  assert.equal(worse('PASS', 'NOT_RUN'), 'NOT_RUN');
});
for (const xml of [
  '<testsuite><testcase/></bad>',
  '<testsuite/><testsuite/>',
  '<testsuite><failure/><testcase/></testsuite>',
  '<testsuite><testcase/><testcase/></testsuite>',
  '<testsuite><testcase name="a" name="b"/></testsuite>',
  '<!DOCTYPE testsuite SYSTEM "file:///private"><testsuite><testcase/></testsuite>',
  '<testsuite><!-- <testcase/> --></testsuite>',
  '<testsuite tests="1" failures="1"><testcase/></testsuite>',
]) test('malformed or substituted JUnit cannot pass', () => { assert.throws(() => junitOutcome(xml, 0), /junit_/u); });
test('nonzero exit without a failing case cannot pass', () => { assert.throws(() => junitOutcome('<testsuite><testcase/></testsuite>', 1), /junit_exit_mismatch/u); });
test('SDK cleanup notification requires a fully validated sole-case failure with the exact code', () => {
  let calls = 0;
  const options = { onSdkCleanupFailure: () => { calls += 1; } };
  const xml = '<testsuite tests="1" failures="1"><testcase><failure message="maestro_sdk_cleanup_failed"/></testcase></testsuite>';
  assert.equal(junitOutcome(xml, 1, options), 'FAIL');
  assert.equal(calls, 1);
  assert.equal(junitOutcome('<testsuite><testcase><error message="maestro_sdk_cleanup_failed"/></testcase></testsuite>', 1, options), 'FAIL');
  assert.equal(calls, 2);
  for (const message of ['maestro_sdk_execution_failed', 'prefix_maestro_sdk_cleanup_failed', 'maestro_sdk_cleanup_failed_suffix']) {
    assert.equal(junitOutcome(`<testsuite><testcase><failure message="${message}"/></testcase></testsuite>`, 1, options), 'FAIL');
  }
  assert.equal(calls, 2);
  assert.throws(() => junitOutcome(xml.replace('tests="1"', 'tests="2"'), 1, options), /junit_summary_mismatch/u);
  assert.throws(() => junitOutcome(xml, 2, options), /junit_exit_mismatch/u);
  assert.equal(calls, 2);
  assert.equal(junitOutcome(xml, 1), 'FAIL');
});
test('SDK terminal notifications return only fixed known codes after complete JUnit validation', () => {
  const codes = [];
  const options = { onSdkTerminalFailure: (code) => { codes.push(code); } };
  for (const code of ['maestro_ui_flow_failed', 'maestro_sdk_execution_failed', 'maestro_sdk_cleanup_failed']) {
    assert.equal(junitOutcome(`<testsuite><testcase><failure message="${code}"/></testcase></testsuite>`, 1, options), 'FAIL');
  }
  assert.deepEqual(codes, ['maestro_ui_flow_failed', 'maestro_sdk_execution_failed', 'maestro_sdk_cleanup_failed']);
  assert.equal(junitOutcome('<testsuite><testcase><error message="private unknown message"/></testcase></testsuite>', 1, options), 'FAIL');
  assert.throws(() => junitOutcome('<testsuite tests="2"><testcase><failure message="maestro_sdk_execution_failed"/></testcase></testsuite>', 1, options), /junit_summary_mismatch/u);
  assert.equal(codes.length, 3);
  assert.equal(junitOutcome('<testsuite><testcase><failure message="maestro_ui_flow_failed"/></testcase></testsuite>', 1), 'FAIL');
  assert.equal(junitOutcome('<testsuites><testsuite tests="1" failures="1"><testcase><failure>maestro_sdk_execution_failed</failure></testcase></testsuite></testsuites>', 1, options), 'FAIL');
  assert.equal(junitOutcome('<testsuite><testcase><error><![CDATA[maestro_ui_flow_failed]]></error></testcase></testsuite>', 1, options), 'FAIL');
  assert.deepEqual(codes.slice(-2), ['maestro_sdk_execution_failed', 'maestro_ui_flow_failed']);
  let cleanup = 0;
  assert.equal(junitOutcome('<testsuite><testcase><failure>maestro_sdk_cleanup_failed</failure></testcase></testsuite>', 1, { onSdkCleanupFailure: () => { cleanup += 1; } }), 'FAIL');
  assert.equal(cleanup, 1);
  assert.equal(junitOutcome('<testsuite><testcase><failure message="other">maestro_sdk_cleanup_failed</failure></testcase></testsuite>', 1, { onSdkCleanupFailure: () => { cleanup += 1; } }), 'FAIL');
  assert.equal(cleanup, 1);
});

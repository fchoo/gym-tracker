import { createHash } from 'node:crypto';
import { V12_GARMIN_SHARD_CASE_IDS } from './v12-garmin-shard.mjs';

export const fail = (code) => { throw new Error(`v12_production_native_launcher_${code}`); };
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
export const HASH = /^[a-f0-9]{64}$/u;
const STATES = ['PASS', 'FAIL', 'NOT_RUN', 'REVIEW_REQUIRED'];
const GARMIN_COUNTS = Object.freeze({
  packaging: 1, 'bridge-allowlist': 2, 'canonical-json': 1, 'sync-read': 1,
  'account-lifecycle': 5, recovery: 20, 'dedupe-restart': 1, 'dedupe-restore': 1,
  'dedupe-merge': 1, 'match-zero': 0, 'match-one': 1, 'match-many': 2,
  'match-stale': 1, 'match-alternate': 2, 'match-cancel': 0, 'match-confirm': 1,
  'match-reassign': 1, privacy: 6,
});
const GARMIN_BRIDGE_OPERATIONS = Object.freeze([
  'connectionState', 'login', 'resumeMfa', 'restoreSession', 'logout', 'getActivities',
  'getActivity', 'getActivitySplits', 'getActivityDetails', 'forceRefreshForTest', 'runAdversarialSuite',
]);
const GARMIN_LIFECYCLE = Object.freeze({
  restore: 'connected', refresh: 'connected', cold_restore: 'connected', logout: 'disconnected',
  restored: 'connected', rotation: 'rotated', restart: 'same-account', storage: 'no-backup-encrypted',
});
const GARMIN_RECOVERY = Object.freeze([
  ['PH18-ADV-RESTORE', 'completed'], ['PH18-ADV-REFRESH', 'completed'], ['PH18-ADV-READ', 'completed'],
  ['PH18-ADV-LOGOUT', 'completed'], ['PH18-ADV-RESTART', 'sign_in_required'], ['PH18-ADV-LATE-GENERATION', 'stale_generation'],
  ['PH18-ADV-EXPIRED', 'sign_in_required'], ['PH18-ADV-401', 'sign_in_required'], ['PH18-ADV-403', 'data_access_denied'],
  ['PH18-ADV-429', 'rate_limited'], ['PH18-ADV-OFFLINE', 'offline'], ['PH18-ADV-TIMEOUT', 'timeout'],
  ['PH18-ADV-5XX', 'temporary_failure'], ['PH18-ADV-MALFORMED', 'malformed_response'], ['PH18-ADV-TRUNCATED', 'malformed_response'],
  ['PH18-ADV-OVERSIZED', 'malformed_response'], ['PH18-ADV-UNSUPPORTED-JSON', 'malformed_response'],
  ['PH18-ADV-MISSING-COMPONENT', 'malformed_response'], ['PH18-ADV-PARTIAL-PAGE', 'temporary_failure'], ['PH18-ADV-ROTATION', 'stale_generation'],
]);
const GARMIN_RECOVERY_CALLS = Object.freeze([1, 1, 4, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 4, 1, 5, 3, 5, 3]);

/** Derive native outcomes only after host-owned privacy and cleanup checks. */
export function garminCases(value, privacyReceipt) {
  if (!exact(value, ['receipts', 'host_observations']) || !Array.isArray(value.receipts) || value.receipts.length !== 17
    || !exact(privacyReceipt, ['id', 'order', 'code', 'count', 'receipt_sha256'])) fail('garmin_result_invalid');
  const observations = value.host_observations;
  if (!exact(observations, ['bridge', 'lifecycle', 'recovery', 'restart'])
    || !exact(observations.bridge, ['evidence_source', 'operations', 'operation_rejection', 'arguments_rejection'])
    || !exact(observations.lifecycle, [...Object.keys(GARMIN_LIFECYCLE), 'before_sha256', 'refreshed_sha256', 'restored_sha256'])
    || ![observations.lifecycle.before_sha256, observations.lifecycle.refreshed_sha256, observations.lifecycle.restored_sha256].every(value => HASH.test(value ?? ''))
    || !exact(observations.restart, ['process_changed', 'session_consistent'])
    || !Array.isArray(observations.recovery) || observations.recovery.length !== GARMIN_RECOVERY.length) fail('garmin_result_invalid');
  if (observations.bridge.evidence_source !== 'installed-chaquopy') fail('garmin_result_invalid');
  const bridgePassed = JSON.stringify(observations.bridge.operations) === JSON.stringify(GARMIN_BRIDGE_OPERATIONS)
    && observations.bridge.operation_rejection === 'operation_rejected'
    && observations.bridge.arguments_rejection === 'arguments_rejected';
  const lifecyclePassed = Object.entries(GARMIN_LIFECYCLE).every(([key, expected]) => observations.lifecycle[key] === expected)
    && observations.lifecycle.before_sha256 !== observations.lifecycle.refreshed_sha256;
  const restartPassed = observations.restart.process_changed === true && observations.restart.session_consistent === true;
  let recoveryPassed = true;
  observations.recovery.forEach((entry, order) => {
    const [id, code] = GARMIN_RECOVERY[order];
    if (!exact(entry, ['id', 'code', 'call_count', 'automatic_retry_count', 'retry_after_ms'])
      || entry.id !== id || typeof entry.code !== 'string' || !/^[a-z][a-z0-9_]{2,63}$/u.test(entry.code)
      || !Number.isSafeInteger(entry.call_count) || entry.call_count < 1 || !Number.isSafeInteger(entry.automatic_retry_count)
      || entry.automatic_retry_count < 0 || !Number.isSafeInteger(entry.retry_after_ms) || entry.retry_after_ms < 0 || entry.retry_after_ms > 900_000) fail('garmin_result_invalid');
    if (entry.code !== code || entry.call_count !== GARMIN_RECOVERY_CALLS[order]
      || entry.automatic_retry_count !== 0 || entry.retry_after_ms !== (id === 'PH18-ADV-429' ? 900_000 : 0)) recoveryPassed = false;
  });
  const receipts = [...value.receipts, privacyReceipt];
  const cases = receipts.map((entry, order) => {
    const id = V12_GARMIN_SHARD_CASE_IDS[order];
    const expectedCode = `${id}-observed`;
    if (!exact(entry, ['id', 'order', 'code', 'count', 'receipt_sha256']) || entry.id !== id
      || entry.order !== order || entry.code !== expectedCode || entry.count !== GARMIN_COUNTS[id]
      || !HASH.test(entry.receipt_sha256 ?? '')) fail('garmin_result_invalid');
    const status = entry.id === 'bridge-allowlist' && !bridgePassed
      || entry.id === 'account-lifecycle' && !(lifecyclePassed && restartPassed)
      || entry.id === 'recovery' && !recoveryPassed ? 'FAIL' : 'PASS';
    return Object.freeze({ ...entry, status, code: status === 'PASS' ? entry.code : `${entry.id}-evidence-mismatch` });
  });
  return Object.freeze({ producer: 'v12-production-garmin-host/v1', cases: Object.freeze(cases) });
}

// Parse a bounded XML subset, not a regex search for a passing testcase. DTDs,
// entities, duplicate attributes, malformed nesting and multiple roots fail closed.
// Failure text is parsed only to locate outcomes; it is never returned.
export function junitOutcome(xml, exitCode, { onSdkCleanupFailure, onSdkTerminalFailure } = {}) {
  if (typeof xml !== 'string' || xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/iu.test(xml)) fail('junit_invalid');
  const document = { name: '#document', children: [] }; const stack = [document];
  const tokens = /<\?xml\s[^?]*\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>|[^<]+/gu;
  let consumed = 0;
  for (const match of xml.matchAll(tokens)) {
    if (match.index !== consumed) fail('junit_invalid');
    const token = match[0]; consumed += token.length;
    if (token.startsWith('<?xml') || token.startsWith('<!--') || token.startsWith('<![CDATA[')) continue;
    if (!token.startsWith('<')) { if (stack.length === 1 && token.trim()) fail('junit_invalid'); continue; }
    if (token.startsWith('</')) {
      const name = /^<\/([A-Za-z][\w.-]*)\s*>$/u.exec(token)?.[1];
      if (stack.length === 1 || stack.pop().name !== name) fail('junit_invalid');
      continue;
    }
    const tag = /^<([A-Za-z][\w.-]*)([\s\S]*?)(\/?)>$/u.exec(token);
    if (!tag) fail('junit_invalid');
    let attributes = tag[2]; const names = new Set(); const values = {};
    while (attributes.trim()) {
      const attr = /^\s+([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/u.exec(attributes);
      if (!attr || names.has(attr[1])) fail('junit_invalid');
      names.add(attr[1]); values[attr[1]] = attr[2] ?? attr[3]; attributes = attributes.slice(attr[0].length);
    }
    const node = { name: tag[1], children: [], attributes: values };
    stack.at(-1).children.push(node);
    if (!tag[3]) stack.push(node);
    if (stack.length > 24) fail('junit_invalid');
  }
  if (consumed !== xml.length || stack.length !== 1 || document.children.length !== 1
    || !['testsuite', 'testsuites'].includes(document.children[0].name)) fail('junit_invalid');
  const cases = [];
  function visit(node, parent) {
    if (node.name === 'testcase') { if (parent !== 'testsuite') fail('junit_invalid'); cases.push(node); }
    if (['failure', 'error', 'skipped'].includes(node.name) && parent !== 'testcase') fail('junit_invalid');
    for (const child of node.children) visit(child, node.name);
  }
  visit(document.children[0], '#document');
  if (cases.length !== 1) fail('junit_case_count_invalid');
  const kinds = cases[0].children.map((node) => node.name);
  const status = kinds.includes('failure') || kinds.includes('error') ? 'FAIL' : kinds.includes('skipped') ? 'NOT_RUN' : 'PASS';
  function summary(node) {
    if (node.name === 'testsuite' || node.name === 'testsuites') {
      for (const [key, expected] of Object.entries({ tests: 1, failures: kinds.includes('failure') ? 1 : 0, errors: kinds.includes('error') ? 1 : 0, skipped: kinds.includes('skipped') ? 1 : 0 })) {
        if (node.attributes[key] !== undefined && node.attributes[key] !== String(expected)) fail('junit_summary_mismatch');
      }
    }
    node.children.forEach(summary);
  }
  summary(document.children[0]);
  if (![0, 1].includes(exitCode) || (exitCode !== 0 && status !== 'FAIL')) fail('junit_exit_mismatch');
  if (cases[0].children.some((node) => ['failure', 'error'].includes(node.name)
    && node.attributes.message === 'maestro_sdk_cleanup_failed')) onSdkCleanupFailure?.();
  for (const node of cases[0].children) {
    if (['failure', 'error'].includes(node.name) && [
      'maestro_ui_flow_failed', 'maestro_sdk_execution_failed', 'maestro_sdk_cleanup_failed',
    ].includes(node.attributes.message)) onSdkTerminalFailure?.(node.attributes.message);
  }
  return status;
}

export function worse(left, right) {
  const priority = ['PASS', 'REVIEW_REQUIRED', 'NOT_RUN', 'FAIL'];
  return priority[Math.max(priority.indexOf(left), priority.indexOf(right))];
}

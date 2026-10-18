import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/u;
const RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;

export const V12_SQLITE_FAILURE_CODES = Object.freeze([
  'marker_timeout',
  'route_error',
  'malformed_result',
  'native_runner_failed',
  'translation_failed',
]);

function fail(code) { throw new Error(`v12_sqlite_producer_${code}`); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value, keys) {
  return object(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
}
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function identity(value) {
  if (!exactKeys(value, ['source_digest', 'fixture_digest', 'apk_digest', 'installed_apk_digest', 'device_digest'])
    || !Object.values(value).every((item) => typeof item === 'string' && SHA256.test(item))
    || value.apk_digest !== value.installed_apk_digest) fail('identity_invalid');
  return Object.freeze({ ...value });
}

function privacySafe(value, path = 'receipt') {
  if (typeof value === 'string') {
    if (/bearer\s+|@|(?:^|[/\\])(?:private|users?|home)(?:[/\\]|$)/iu.test(value)) fail(`privacy_invalid:${path}`);
    return;
  }
  if (Array.isArray(value)) return value.forEach((item, index) => privacySafe(item, `${path}[${index}]`));
  if (!object(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (/(?:serial|payload|route|logcat|adb|sql|row|record|verdict|seal|secret|token|email|path)/iu.test(key)) fail(`privacy_invalid:${path}.${key}`);
    privacySafe(item, `${path}.${key}`);
  }
}

function validSourceFacts(value, expectedCount) {
  if (!Array.isArray(value) || value.length === 0) return false;
  const seenRegistries = new Set();
  let count = 0;
  for (const entry of value) {
    if (!exactKeys(entry, ['registry', 'cases'])
      || typeof entry.registry !== 'string' || !/^[a-z][a-z0-9-]{2,63}$/u.test(entry.registry)
      || seenRegistries.has(entry.registry) || !Array.isArray(entry.cases) || entry.cases.length === 0) return false;
    seenRegistries.add(entry.registry);
    const seenCases = new Set();
    for (const sourceCase of entry.cases) {
      if (!exactKeys(sourceCase, ['id', 'status']) || typeof sourceCase.id !== 'string'
        || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u.test(sourceCase.id)
        || sourceCase.status !== 'passed' || seenCases.has(sourceCase.id)) return false;
      seenCases.add(sourceCase.id);
      count += 1;
    }
  }
  return count === expectedCount;
}

export function assertV12AcceptanceNativeContractResult(input, expectedCaseIds) {
  const cases = Array.isArray(input?.cases) ? input.cases : [];
  const validCases = Array.isArray(expectedCaseIds)
    && cases.length === expectedCaseIds.length
    && cases.every((entry, index) => exactKeys(entry, ['id', 'status', 'code', 'counts', 'sourceFacts'])
      && entry.id === expectedCaseIds[index]
      && entry.status === 'passed'
      && entry.code === 'v12_acceptance_case_passed'
      && exactKeys(entry.counts, ['sourceCases'])
      && Number.isSafeInteger(entry.counts.sourceCases)
      && entry.counts.sourceCases > 0
      && validSourceFacts(entry.sourceFacts, entry.counts.sourceCases));
  if (!exactKeys(input, ['schemaVersion', 'contractVersion', 'status', 'total', 'passed', 'failed', 'skipped', 'cases'])
    || input.schemaVersion !== 1
    || input.contractVersion !== 1
    || input.status !== 'passed'
    || input.total !== expectedCaseIds.length
    || input.passed !== expectedCaseIds.length
    || input.failed !== 0
    || input.skipped !== 0
    || !validCases) fail('v12_result_invalid');
  privacySafe(input);
  return Object.freeze(structuredClone(input));
}

export function classifyV12SqliteNativeFailure(value) {
  const code = value instanceof Error ? value.message : '';
  if (/marker_timeout|not logged within/u.test(code)) return 'marker_timeout';
  if (/route_error|route failed/u.test(code)) return 'route_error';
  if (/malformed_result|contract_result_invalid|v12_result_invalid/u.test(code)) return 'malformed_result';
  return 'native_runner_failed';
}

export function createV12SqliteFailureReceipt({ runId, identity: value, stage, code } = {}) {
  if (!RUN_ID.test(runId ?? '')) fail('run_id_invalid');
  if (!['native_runner', 'translation'].includes(stage)) fail('failure_stage_invalid');
  if (!V12_SQLITE_FAILURE_CODES.includes(code)) fail('failure_code_invalid');
  const safeIdentity = identity(value);
  const basis = Object.freeze({
    schema_version: 1,
    producer: 'v12-sqlite-shard',
    run_id: runId,
    identity: safeIdentity,
    failure_stage: stage,
    failure_code: code,
  });
  const receipt = Object.freeze({ ...basis, failure_digest: digest(basis) });
  privacySafe(receipt);
  return receipt;
}

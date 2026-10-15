import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  executeV12SqliteShard,
  executeV12SqliteShardCli,
  parseV12SqliteShardCliArgs,
  validateV12SqliteShard,
} from './v12-sqlite-shard.mjs';
import { createV12RunManifest } from './create-v12-run-manifest.mjs';
import {
  assertV12AcceptanceNativeContractResult,
  classifyV12SqliteNativeFailure,
  createV12SqliteFailureReceipt,
  V12_SQLITE_FAILURE_CODES,
} from './v12-sqlite-producer-contract.mjs';

const digest = 'a'.repeat(64);
const caseIds = [
  'fresh-migration', 'schema27-upgrade', 'supported-legacy-upgrade', 'failure-reopen',
  'backup', 'restore', 'merge', 'noop-replay', 'rebuild', 'immutable-history',
];
const valid = () => ({
  schema_version: 1,
  producer: 'v12-sqlite-shard',
  identity: { source_digest: digest, fixture_digest: digest, apk_digest: digest, installed_apk_digest: digest, device_digest: digest },
  cases: caseIds.map((id, index) => ({ id, status: 'passed', order: index, digests: { pre: digest, post: digest, reopen: digest, rebuild: digest } })),
});

const nativeV12Result = () => ({
  schemaVersion: 1,
  contractVersion: 1,
  status: 'passed',
  total: 10,
  passed: 10,
  failed: 0,
  skipped: 0,
  cases: caseIds.map((id) => ({
    id,
    status: 'passed',
    code: 'v12_acceptance_case_passed',
    counts: { sourceCases: 1 },
  })),
});

test('validates the complete ordered privacy-safe SQLite observation set', () => {
  const result = validateV12SqliteShard(valid());
  assert.equal(result.ok, true);
  assert.equal(result.observations.migration.cases, 4);
  assert.equal(result.observations.portability.cases, 4);
  assert.equal(result.observations.history.cases, 2);
});

test('rejects duplicate, skipped, stale, out-of-order, raw, and impossible downgrade observations', () => {
  for (const mutate of [
    (input) => { input.cases[1].id = input.cases[0].id; },
    (input) => { input.cases[1].status = 'skipped'; },
    (input) => { input.cases.reverse(); },
    (input) => { input.identity.installed_apk_digest = 'b'.repeat(64); },
    (input) => { input.cases[0].raw_rows = [{ secret: 'nope' }]; },
    (input) => { input.cases[1].claimed_schema = 26; },
  ]) {
    const input = valid();
    mutate(input);
    assert.throws(() => validateV12SqliteShard(input), /v12_sqlite_/u);
  }
});

test('writes observations only and never a verdict', async () => {
  const writes = [];
  await executeV12SqliteShard(valid(), async (path, value) => writes.push({ path, value }));
  assert.deepEqual(writes.map(({ path }) => path), ['migration.json', 'portability.json', 'history.json']);
  assert.equal(JSON.stringify(writes).includes('verdict'), false);
});

test('requires an explicit immutable run command instead of silently succeeding as a no-op', () => {
  assert.deepEqual(
    parseV12SqliteShardCliArgs(['--run', 'phase20-20261014T031137Z-5917481c1fd1', '--execute', '--device', 'emulator-5554']),
    { runId: 'phase20-20261014T031137Z-5917481c1fd1', mode: 'execute', device: 'emulator-5554' },
  );
  assert.throws(() => parseV12SqliteShardCliArgs(['--run', 'phase20-20261014T031137Z-5917481c1fd1']), /v12_sqlite_cli_invalid/u);
});

test('forwards an ephemeral device lease to the native runner without retaining it in observations or CLI output', async () => {
  const runId = 'phase20-20261014T031137Z-5917481c1fd1';
  const serial = 'emulator-5554';
  const invocation = [];
  const manifest = createV12RunManifest({ input: {
    requested_run_id: runId, created_at: '2026-10-14T03:11:37Z',
    source: { tree_sha256: digest, head: '5917481c1fd1' + 'b'.repeat(28), dirty: false, package_json_sha256: digest, package_lock_sha256: digest },
    fixtures: { registry_sha256: digest },
    build: { profile: 'development-test', package: 'com.fchoo.gymtracker.devtest', version_name: '1.2.0', version_code: 1, apk: { path: 'artifacts/native/v1.2-acceptance/app.apk', sha256: digest, size_bytes: 1, page_alignment_verified: true, signature_sha256: digest, certificate_sha256: digest } },
    device: { identity_sha256: digest, abi: 'arm64-v8a', installed_apk_sha256: digest, settings_sha256: digest, restoration_sha256: digest },
    planning: { matrix_sha256: digest, requirements_sha256: digest, source_manifest_sha256: digest, owner_brief_sha256: digest, ui_spec_sha256: digest, deviations_sha256: digest },
    prototype: { revision: 18, approval_sha256: digest, html_sha256: digest },
    configuration: { id: 'AP-L-C390-P-F100' },
    created_at: '2026-10-14T03:11:37Z',
  } });
  const native = { status: 'passed', contract: nativeV12Result() };
  const writes = [];
  const result = await executeV12SqliteShardCli(['--run', runId, '--execute', '--device', serial], {
    root: '/synthetic-root', sourceDigest: digest, readBuild: () => manifest, outputExists: () => false,
    executeNative: async (device) => { invocation.push(device); return native; },
    writeObservation: async (file, value) => writes.push({ file, value }),
  });
  assert.deepEqual(invocation, [serial]);
  assert.doesNotMatch(JSON.stringify({ result, writes }), new RegExp(serial, 'u'));
});

test('accepts only the exact V12 native envelope and rejects legacy cross-suite substitution', () => {
  assert.doesNotThrow(() => assertV12AcceptanceNativeContractResult(nativeV12Result(), caseIds));
  const legacy = {
    ...nativeV12Result(),
    startedAt: '2026-10-14T00:00:00.000Z',
    finishedAt: '2026-10-14T00:00:01.000Z',
    cases: caseIds.map((id) => ({ id, status: 'passed', durationMs: 1 })),
  };
  assert.throws(() => assertV12AcceptanceNativeContractResult(legacy, caseIds), /v12_sqlite_producer_v12_result_invalid/u);
  const malformed = nativeV12Result();
  malformed.cases[2].counts = { sourceCases: 1, raw_rows: 1 };
  assert.throws(() => assertV12AcceptanceNativeContractResult(malformed, caseIds), /v12_sqlite_producer_v12_result_invalid/u);
  const verdictInjected = nativeV12Result();
  verdictInjected.verdict = 'PASS';
  assert.throws(() => assertV12AcceptanceNativeContractResult(verdictInjected, caseIds), /v12_sqlite_producer_v12_result_invalid/u);
});

test('creates an exact privacy-safe bounded failure receipt without verdict authority', () => {
  const receipt = createV12SqliteFailureReceipt({
    runId: 'phase20-20261014T031137Z-5917481c1fd1',
    identity: valid().identity,
    stage: 'native_runner',
    code: 'marker_timeout',
  });
  assert.deepEqual(Object.keys(receipt).sort(), [
    'failure_code', 'failure_digest', 'failure_stage', 'identity', 'producer', 'run_id', 'schema_version',
  ]);
  assert.equal(V12_SQLITE_FAILURE_CODES.includes(receipt.failure_code), true);
  assert.doesNotMatch(JSON.stringify(receipt), /emulator-|serial|payload|raw_rows|private/i);
  assert.throws(() => createV12SqliteFailureReceipt({
    runId: 'phase20-20261014T031137Z-5917481c1fd1', identity: valid().identity,
    stage: 'native_runner', code: 'verdict_passed',
  }), /v12_sqlite_producer_failure_code_invalid/u);
});

test('classifies every bounded native failure and rejects unsafe receipt input', () => {
  const receiptInput = {
    runId: 'phase20-20261014T031137Z-5917481c1fd1', identity: valid().identity,
    stage: 'translation', code: 'translation_failed',
  };
  assert.equal(classifyV12SqliteNativeFailure(new Error('native contract route failed')), 'route_error');
  assert.equal(classifyV12SqliteNativeFailure(new Error('Native contract result was not logged within 300000 ms.')), 'marker_timeout');
  assert.equal(classifyV12SqliteNativeFailure(new Error('contract_result_invalid')), 'malformed_result');
  assert.equal(classifyV12SqliteNativeFailure('not an error'), 'native_runner_failed');
  assert.doesNotThrow(() => createV12SqliteFailureReceipt(receiptInput));
  for (const mutate of [
    (value) => { value.runId = 'unsafe'; },
    (value) => { value.stage = 'unknown'; },
    (value) => { value.identity.device_digest = 'not-a-hash'; },
    (value) => { value.identity = { ...valid().identity, serial: 'emulator-5554' }; },
  ]) {
    const input = structuredClone(receiptInput);
    mutate(input);
    assert.throws(() => createV12SqliteFailureReceipt(input), /v12_sqlite_producer_/u);
  }
});

test('gives the V12 three-registry execution a finite source-derived polling budget and emits progress markers', () => {
  const runner = readFileSync('scripts/run-native-sqlite-contracts.mjs', 'utf8');
  const route = readFileSync('app/__native-contracts.tsx', 'utf8');

  assert.match(runner, /V12_ACCEPTANCE_TIMEOUT_MS =/u);
  assert.match(runner, /suite === 'v1\.2-acceptance'/u);
  assert.match(runner, /V12_ACCEPTANCE_TIMEOUT_MS/u);
  assert.match(route, /emitAggregateProgress\(runId, `v1\.2-acceptance:\$\{stage\}`\)/u);
  assert.match(
    readFileSync('src/testing/contracts/v12Acceptance.contract.ts', 'utf8'),
    /onProgress\?\.\("migrations"\)[\s\S]*onProgress\?\.\("portable-merge"\)[\s\S]*onProgress\?\.\("multi-plan-running"\)/u,
  );
  assert.equal(
    classifyV12SqliteNativeFailure(new Error('Native contract result was not logged within 300000 ms.')),
    'marker_timeout',
  );
});

test('retains exactly one immutable failure receipt for native timeout, route error, malformed output, and translation failure', async () => {
  const runId = 'phase20-20261014T031137Z-5917481c1fd1';
  const manifest = createV12RunManifest({ input: {
    requested_run_id: runId, created_at: '2026-10-14T03:11:37Z',
    source: { tree_sha256: digest, head: '5917481c1fd1' + 'b'.repeat(28), dirty: false, package_json_sha256: digest, package_lock_sha256: digest },
    fixtures: { registry_sha256: digest },
    build: { profile: 'development-test', package: 'com.fchoo.gymtracker.devtest', version_name: '1.2.0', version_code: 1, apk: { path: 'artifacts/native/v1.2-acceptance/app.apk', sha256: digest, size_bytes: 1, page_alignment_verified: true, signature_sha256: digest, certificate_sha256: digest } },
    device: { identity_sha256: digest, abi: 'arm64-v8a', installed_apk_sha256: digest, settings_sha256: digest, restoration_sha256: digest },
    planning: { matrix_sha256: digest, requirements_sha256: digest, source_manifest_sha256: digest, owner_brief_sha256: digest, ui_spec_sha256: digest, deviations_sha256: digest },
    prototype: { revision: 18, approval_sha256: digest, html_sha256: digest }, configuration: { id: 'AP-L-C390-P-F100' }, created_at: '2026-10-14T03:11:37Z',
  } });
  for (const scenario of [
    ['marker_timeout', async () => { throw new Error('v12_sqlite_native_marker_timeout'); }],
    ['route_error', async () => { throw new Error('v12_sqlite_native_route_error'); }],
    ['malformed_result', async () => ({ status: 'passed', contract: { nope: true } })],
    ['translation_failed', async () => ({ status: 'passed', contract: nativeV12Result() })],
  ]) {
    const writes = [];
    const executeNative = scenario[1];
    const writeFailureReceipt = async (value) => writes.push(value);
    const dependencies = {
      root: '/synthetic-root', sourceDigest: digest, readBuild: () => manifest, outputExists: () => false,
      executeNative,
      writeFailureReceipt,
      writeObservation: scenario[0] === 'translation_failed'
        ? async () => { throw new Error('write failed'); }
        : async () => { throw new Error('must_not_write_observation'); },
    };
    await assert.rejects(
      executeV12SqliteShardCli(['--run', runId, '--execute'], dependencies),
      new RegExp(`v12_sqlite_${scenario[0]}`, 'u'),
    );
    assert.equal(writes.length, 1, scenario[0]);
    assert.equal(writes[0].failure_code, scenario[0]);
    assert.doesNotMatch(JSON.stringify(writes[0]), /payload|serial|raw_rows|verdict|private/i);
  }
});

test('refuses a second execute attempt when a failure receipt already consumes the immutable run', async () => {
  await assert.rejects(
    executeV12SqliteShardCli(['--run', 'phase20-20261014T031137Z-5917481c1fd1', '--execute'], {
      outputExists: (file) => file.endsWith('failure.json'),
      readBuild: () => { throw new Error('must_not_read'); },
    }),
    /v12_sqlite_output_exists/u,
  );
});

test('fails closed if an immutable failure receipt cannot be written', async () => {
  const runId = 'phase20-20261014T031137Z-5917481c1fd1';
  const manifest = createV12RunManifest({ input: {
    requested_run_id: runId, created_at: '2026-10-14T03:11:37Z',
    source: { tree_sha256: digest, head: '5917481c1fd1' + 'b'.repeat(28), dirty: false, package_json_sha256: digest, package_lock_sha256: digest }, fixtures: { registry_sha256: digest },
    build: { profile: 'development-test', package: 'com.fchoo.gymtracker.devtest', version_name: '1.2.0', version_code: 1, apk: { path: 'artifacts/native/v1.2-acceptance/app.apk', sha256: digest, size_bytes: 1, page_alignment_verified: true, signature_sha256: digest, certificate_sha256: digest } },
    device: { identity_sha256: digest, abi: 'arm64-v8a', installed_apk_sha256: digest, settings_sha256: digest, restoration_sha256: digest },
    planning: { matrix_sha256: digest, requirements_sha256: digest, source_manifest_sha256: digest, owner_brief_sha256: digest, ui_spec_sha256: digest, deviations_sha256: digest }, prototype: { revision: 18, approval_sha256: digest, html_sha256: digest }, configuration: { id: 'AP-L-C390-P-F100' }, created_at: '2026-10-14T03:11:37Z',
  } });
  await assert.rejects(
    executeV12SqliteShardCli(['--run', runId, '--execute'], {
      root: '/synthetic-root', sourceDigest: digest, readBuild: () => manifest, outputExists: () => false,
      executeNative: async () => { throw new Error('v12_sqlite_native_marker_timeout'); },
      writeFailureReceipt: async () => { throw new Error('immutable write failed'); },
    }),
    /v12_sqlite_failure_receipt_write_failed/u,
  );
});

test('uses filesystem write-once producers for a valid V12 result, verifier reads, and runner failure receipt', async () => {
  const runId = 'phase20-20261014T031137Z-5917481c1fd1';
  const root = mkdtempSync(path.join(tmpdir(), 'v12-sqlite-shard-'));
  const manifest = createV12RunManifest({ input: {
    requested_run_id: runId, created_at: '2026-10-14T03:11:37Z',
    source: { tree_sha256: digest, head: '5917481c1fd1' + 'b'.repeat(28), dirty: false, package_json_sha256: digest, package_lock_sha256: digest },
    fixtures: { registry_sha256: digest },
    build: { profile: 'development-test', package: 'com.fchoo.gymtracker.devtest', version_name: '1.2.0', version_code: 1, apk: { path: 'artifacts/native/v1.2-acceptance/app.apk', sha256: digest, size_bytes: 1, page_alignment_verified: true, signature_sha256: digest, certificate_sha256: digest } },
    device: { identity_sha256: digest, abi: 'arm64-v8a', installed_apk_sha256: digest, settings_sha256: digest, restoration_sha256: digest },
    planning: { matrix_sha256: digest, requirements_sha256: digest, source_manifest_sha256: digest, owner_brief_sha256: digest, ui_spec_sha256: digest, deviations_sha256: digest },
    prototype: { revision: 18, approval_sha256: digest, html_sha256: digest }, configuration: { id: 'AP-L-C390-P-F100' }, created_at: '2026-10-14T03:11:37Z',
  } });
  try {
    const runDirectory = path.join(root, 'artifacts/native/v1.2', runId);
    const activeDirectory = path.join(root, 'artifacts/native/v1.2-acceptance');
    mkdirSync(runDirectory, { recursive: true });
    mkdirSync(activeDirectory, { recursive: true });
    writeFileSync(path.join(runDirectory, 'build.json'), JSON.stringify(manifest));
    writeFileSync(path.join(activeDirectory, 'v1.2-acceptance.json'), JSON.stringify({ status: 'passed', contract: nativeV12Result() }));
    const executed = await executeV12SqliteShardCli(['--run', runId, '--execute'], {
      root, sourceDigest: digest, executeNative: async () => ({ status: 'passed', contract: nativeV12Result() }),
    });
    assert.equal(executed.ok, true);
    const verified = await executeV12SqliteShardCli(['--run', runId, '--verify'], { root, sourceDigest: digest });
    assert.equal(verified.mode, 'verify');
    await assert.rejects(() => executeV12SqliteShard(null), /v12_sqlite_writer_invalid/u);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }

  const failureRoot = mkdtempSync(path.join(tmpdir(), 'v12-sqlite-failure-'));
  try {
    const runDirectory = path.join(failureRoot, 'artifacts/native/v1.2', runId);
    mkdirSync(runDirectory, { recursive: true });
    writeFileSync(path.join(runDirectory, 'build.json'), JSON.stringify(manifest));
    await assert.rejects(
      executeV12SqliteShardCli(['--run', runId, '--execute'], {
        root: failureRoot, sourceDigest: digest,
        executeNative: async () => { throw new Error('v12_native_adapter_command_failed:marker_timeout'); },
      }),
      /v12_sqlite_marker_timeout/u,
    );
  } finally {
    rmSync(failureRoot, { force: true, recursive: true });
  }
});

test('refuses duplicate output and producer verdict authority before native execution', async () => {
  await assert.rejects(
    executeV12SqliteShardCli(['--run', 'phase20-20261014T031137Z-5917481c1fd1', '--execute'], {
      readBuild: () => ({ run_id: 'phase20-20261014T031137Z-5917481c1fd1' }),
      outputExists: () => true,
      executeNative: async () => { throw new Error('must_not_execute'); },
    }),
    /v12_sqlite_output_exists/u,
  );
});

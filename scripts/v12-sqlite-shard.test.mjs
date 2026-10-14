import assert from 'node:assert/strict';
import test from 'node:test';

import {
  executeV12SqliteShard,
  executeV12SqliteShardCli,
  parseV12SqliteShardCliArgs,
  validateV12SqliteShard,
} from './v12-sqlite-shard.mjs';

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
    parseV12SqliteShardCliArgs(['--run', 'phase20-20261014T031137Z-5917481c1fd1', '--execute']),
    { runId: 'phase20-20261014T031137Z-5917481c1fd1', mode: 'execute' },
  );
  assert.throws(() => parseV12SqliteShardCliArgs(['--run', 'phase20-20261014T031137Z-5917481c1fd1']), /v12_sqlite_cli_invalid/u);
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

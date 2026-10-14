import assert from 'node:assert/strict';
import test from 'node:test';

import {
  executeV12RecoveryShardCli,
  parseV12RecoveryShardCliArgs,
  validateV12RecoveryShard,
} from './v12-recovery-shard.mjs';

const digest = 'a'.repeat(64);
const ids = ['legacy-playback', 'foreground-reconciliation', 'queued-callback', 'relaunch', 'restore', 'merge', 'zero-cue', 'between-set-rest-pointer'];
const cuts = ['pre-transaction', 'in-transaction', 'post-commit-before-ack', 'post-acknowledgement', 'relaunch', 'retry', 'offline', 'recovery'];
const valid = () => ({ schema_version: 1, producer: 'v12-recovery-shard', identity: { source_digest: digest, receipt_digest: digest, pointer_digest: digest, effect_digest: digest }, cases: ids.map((id, order) => ({ id, order, status: 'passed', cuts: cuts.map((cut) => ({ cut, digest })) })) });

test('accepts only complete ordered lifecycle observations without a verdict', () => {
  const value = validateV12RecoveryShard(valid());
  assert.equal(value.ok, true);
  assert.equal(value.observation.cases, 8);
});

test('rejects stale callbacks, duplicate effects, missing cuts, cross-session ownership and private facts', () => {
  for (const mutate of [
    (input) => { input.cases[0].cuts.pop(); },
    (input) => { input.cases[1].id = input.cases[0].id; },
    (input) => { input.cases[2].cuts[0].digest = 'b'.repeat(64); },
    (input) => { input.cases[3].owner_id = 'private'; },
  ]) { const input = valid(); mutate(input); assert.throws(() => validateV12RecoveryShard(input), /v12_recovery_/u); }
});

test('requires an explicit immutable run command instead of silently succeeding as a no-op', () => {
  assert.deepEqual(
    parseV12RecoveryShardCliArgs(['--run', 'phase20-20261014T031137Z-5917481c1fd1', '--verify']),
    { runId: 'phase20-20261014T031137Z-5917481c1fd1', mode: 'verify' },
  );
  assert.throws(() => parseV12RecoveryShardCliArgs(['--execute']), /v12_recovery_cli_invalid/u);
});

test('refuses duplicate recovery evidence before the native flow can execute', async () => {
  await assert.rejects(
    executeV12RecoveryShardCli(['--run', 'phase20-20261014T031137Z-5917481c1fd1', '--execute'], {
      readBuild: () => ({ run_id: 'phase20-20261014T031137Z-5917481c1fd1' }),
      outputExists: () => true,
      executeNative: async () => { throw new Error('must_not_execute'); },
    }),
    /v12_recovery_output_exists/u,
  );
});

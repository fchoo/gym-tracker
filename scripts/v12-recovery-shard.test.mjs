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
const operationFor = (id) => id === 'restore' ? 'secure-restore' : id === 'merge' ? 'secure-merge' : id === 'zero-cue' ? 'garmin-import' : id === 'relaunch' ? 'garmin-match' : 'workout-complete-set';
const cutObservation = (id, cut, index) => ({
  cut,
  operation: operationFor(id),
  status: 'PASS',
  commit_state: ['pre-transaction', 'in-transaction'].includes(cut) ? 'uncommitted-before-retry' : 'committed-before-retry',
  retry_code: ['pre-transaction', 'in-transaction'].includes(cut) ? 'committed' : 'already-completed',
  after_reopen_receipt_count: ['pre-transaction', 'in-transaction'].includes(cut) ? 0 : 1,
  after_retry_receipt_count: 1,
  receipt_digest: index.toString(16).padStart(64, '0'),
  source_digest: 'b'.repeat(64), effect_digest: 'c'.repeat(64), pointer_digest: 'd'.repeat(64),
  rest_digest: 'e'.repeat(64), history_digest: 'f'.repeat(64), timing_digest: '9'.repeat(64),
});
const valid = () => ({
  schema_version: 1,
  producer: 'v12-recovery-shard',
  identity: {
    source_digest: digest, receipt_digest: digest, pointer_digest: digest,
    effect_digest: digest, rest_digest: digest, history_digest: digest,
    timing_digest: digest,
  },
  cases: ids.map((id, order) => ({
    id, order, status: 'PASS',
    cuts: cuts.map((cut, cutOrder) => cutObservation(id, cut, order * cuts.length + cutOrder + 1)),
  })),
});

test('accepts only complete ordered lifecycle observations without a verdict', () => {
  const value = validateV12RecoveryShard(valid());
  assert.equal(value.ok, true);
  assert.equal(value.observation.cases, 8);
});

test('rejects stale callbacks, duplicate effects, missing cuts, cross-session ownership and private facts', () => {
  for (const mutate of [
    (input) => { input.cases[0].cuts.pop(); },
    (input) => { input.cases[1].id = input.cases[0].id; },
    (input) => { input.cases[2].cuts[0].receipt_digest = input.cases[0].cuts[0].receipt_digest; },
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

test('preserves blocking recovery outcomes instead of rewriting them to passes', () => {
  const input = valid();
  input.cases[0].status = 'FAIL'; input.cases[0].cuts[0].status = 'FAIL';
  assert.equal(validateV12RecoveryShard(input).ok, true);
});

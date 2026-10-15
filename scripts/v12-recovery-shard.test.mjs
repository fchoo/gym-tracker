import assert from 'node:assert/strict';
import test from 'node:test';

import {
  executeV12RecoveryShardCli,
  parseV12RecoveryShardCliArgs,
  validateV12RecoveryShard,
  V12_RECOVERY_CUT_DEFINITIONS,
  V12_RECOVERY_SCENARIOS,
} from './v12-recovery-shard.mjs';

const digest = 'a'.repeat(64);
const snapshot = (committed) => {
  const effect_facts = [{ effect_sha256: digest, type: 'reconcile_rest_notification', subject_sha256: digest, expected_revision: 1, status: 'pending', attempt_count: 0, next_attempt_at_ms: 1, last_error_code: null }];
  const pointer_facts = [{ session_sha256: digest, status: 'in_progress', revision: 2, active_exercise_sha256: digest, active_set_sha256: digest, committed_set_sha256: committed ? digest : null }];
  const rest_facts = [{ session_sha256: digest, status: 'running', revision: 1, started_at_ms: 1, ends_at_ms: 2, deadline_at_ms: 2, paused_remaining_ms: null, expired_at_ms: null, next_set_sha256: digest }];
  const timing_facts = [{ session_sha256: digest, set_sha256: digest, state_version: 1, revision: 1, status: 'stopped', mode: 'per_rep', configuration: { version: 1, mode: 'per_rep', intervalMs: 1500, cueChannels: 'haptic' }, progress: { version: 1, completedRepetitions: 2 }, started_at_ms: null, next_boundary_at_ms: null, remaining_ms: null, stopped_at_ms: 2 }];
  const history_facts = [{ event_sha256: digest, session_sha256: digest, effective_revision: 1, event_type: 'correction', field_identity: 'advanced_timing_resolved_json', before_sha256: digest, after_sha256: digest, occurred_at_ms: 2 }];
  const restore_facts = [{ state: 'rebuild_pending', updated_at_ms: 2 }];
  const merge_receipt_facts = [{ table: 'workout_receipts', receipt_sha256: digest, request_sha256: digest, idempotency_sha256: digest, committed_at_ms: 2, result: 'committed' }];
  return ({
  source_count: committed ? 1 : 0, receipt_count: committed ? 1 : 0,
  effect_count: 1, pointer_count: 1, rest_count: 1, history_count: 1,
  timing_count: 1, restore_count: 1, merge_receipt_count: 1, cue_count: 0,
  source_sha256: committed ? 'b'.repeat(64) : 'a'.repeat(64),
  receipt_sha256: committed ? 'c'.repeat(64) : 'a'.repeat(64),
  effect_sha256: digest, pointer_sha256: digest, rest_sha256: digest,
  history_sha256: digest, timing_sha256: digest, restore_sha256: digest,
  merge_receipt_sha256: digest, cue_sha256: digest,
  effect_facts, pointer_facts, rest_facts, timing_facts,
  history_facts, restore_facts, merge_receipt_facts,
  });
};
const cutObservation = (scenario, definition, index) => {
  const uncommitted = ['pre-transaction', 'in-transaction', 'retry'].includes(definition.id);
  const before = snapshot(false); const afterCut = uncommitted ? before : snapshot(true);
  const afterReopen = uncommitted ? before : afterCut;
  return ({
  cut_id: definition.id,
  status: 'PASS',
  operation_id: scenario.operation_id,
  boundary_ids: scenario.boundary_ids,
  barrier: {
    barrier_id: definition.barrier_id, process_state: definition.process_state,
    acknowledgement: definition.acknowledgement, connectivity: definition.connectivity,
    first_attempt: definition.first_attempt,
  },
  first_attempt_code: definition.barrier_id,
  recovery_code: definition.id === 'recovery'
    ? scenario.id === 'foreground-reconciliation' ? 'foreground-reconciled' : 'domain-reconciled'
    : 'not-required',
  retry_code: uncommitted ? 'committed' : 'replayed',
  receipt_sha256: index.toString(16).padStart(64, '0'),
  snapshots: { before, after_cut: afterCut, after_reopen: afterReopen,
    after_recovery: afterReopen, after_retry: snapshot(true) },
  });
};
const valid = () => ({
  schema_version: 2,
  producer: 'v12-recovery-shard',
  identity: {
    source_digest: digest, receipt_digest: digest, scenario_digest: digest,
    cut_digest: digest, pointer_digest: digest, effect_digest: digest,
    rest_digest: digest, history_digest: digest, timing_digest: digest,
    restore_digest: digest, merge_receipt_digest: digest, cue_digest: digest,
  },
  cases: V12_RECOVERY_SCENARIOS.map((scenario, order) => ({
    ...scenario, order, status: 'PASS',
    cuts: V12_RECOVERY_CUT_DEFINITIONS.map((cut, cutOrder) => cutObservation(scenario, cut, order * V12_RECOVERY_CUT_DEFINITIONS.length + cutOrder + 1)),
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
    (input) => { input.cases[2].cuts[0].receipt_sha256 = input.cases[0].cuts[0].receipt_sha256; },
    (input) => { input.cases[3].owner_id = 'private'; },
  ]) { const input = valid(); mutate(input); assert.throws(() => validateV12RecoveryShard(input), /v12_recovery_/u); }
});

test('rejects incomplete rest, timing, history, restore, merge receipt, and barrier facts', () => {
  for (const mutate of [
    (input) => { delete input.cases[0].cuts[0].snapshots.after_retry.rest_facts[0].deadline_at_ms; },
    (input) => { delete input.cases[0].cuts[0].snapshots.after_retry.timing_facts[0].progress; },
    (input) => { input.cases[0].cuts[0].snapshots.after_retry.history_facts[0].field_identity = ''; },
    (input) => { input.cases[4].cuts[0].snapshots.after_retry.restore_facts = []; },
    (input) => { input.cases[5].cuts[0].snapshots.after_retry.merge_receipt_facts[0].portable_id = 'source-row-alias'; },
    (input) => { input.cases[7].cuts[0].barrier.barrier_id = 'shared-after-commit'; },
  ]) {
    const input = valid(); mutate(input);
    assert.throws(() => validateV12RecoveryShard(input), /v12_recovery_/u);
  }
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

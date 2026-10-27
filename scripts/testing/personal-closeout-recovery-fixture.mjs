// Synthetic tests only; never native evidence.
import { V12_RECOVERY_CUT_DEFINITIONS, V12_RECOVERY_SCENARIOS, V12_RECOVERY_UNCOMMITTED_CUT_IDS } from '../v12-recovery-shard.mjs';
const digest = 'a'.repeat(64);
const snapshot = (committed, step) => {
  const effect_facts = [{ effect_sha256: digest, type: 'reconcile_rest_notification', subject_sha256: digest, expected_revision: 1, status: 'pending', attempt_count: 0, next_attempt_at_ms: 1, last_error_code: null }];
  const pointer_facts = [{ session_sha256: digest, status: 'in_progress', revision: 2, active_exercise_sha256: digest, active_set_exercise_sha256: digest, active_set_sha256: digest, active_set_ordinal: 1, committed_set_exercise_sha256: committed ? digest : null, committed_set_sha256: committed ? digest : null, committed_set_ordinal: committed ? 0 : null, transition_sha256: committed ? digest : null }];
  const rest_facts = [{ session_sha256: digest, status: 'running', revision: 1, started_at_ms: 1, ends_at_ms: 2, deadline_at_ms: 2, paused_remaining_ms: null, expired_at_ms: null, next_set_exercise_sha256: digest, next_set_sha256: digest, next_set_ordinal: 1, transition_sha256: committed ? digest : null }];
  const timing_facts = [{ session_sha256: digest, set_sha256: digest, state_version: 1, revision: 1, status: 'stopped', mode: 'per_rep', configuration: { version: 1, mode: 'per_rep', intervalMs: 1500, cueChannels: 'haptic' }, progress: { version: 1, completedRepetitions: 2 }, started_at_ms: null, next_boundary_at_ms: null, remaining_ms: null, stopped_at_ms: 2 }];
  const history_facts = [{ event_sha256: digest, session_sha256: digest, effective_revision: 1, event_type: 'correction', field_identity: 'advanced_timing_resolved_json', before_sha256: digest, after_sha256: digest, occurred_at_ms: 2 }];
  const restore_facts = [{ state: step.receipt_kind === 'secure-restore' && committed ? 'rebuild_pending' : 'ready', updated_at_ms: 2 }];
  const table = step.receipt_kind === 'garmin-import' ? 'imported_activity_receipts' : step.receipt_kind === 'activity-match' ? 'running_activity_match_receipts' : 'metric_profile_migration_events';
  const merge_receipt_facts = [{ table, receipt_sha256: digest, request_sha256: digest, idempotency_sha256: digest, committed_at_ms: 2, result: table === 'metric_profile_migration_events' ? 'metric-migrated' : 'committed' }];
  const command_receipt_facts = committed ? [{ step_id: step.id, boundary_id: step.boundary_id, kind: step.receipt_kind, receipt_sha256: digest, request_sha256: digest, committed_at_ms: 2, result: 'committed' }] : [];
  return ({
  source_count: committed ? 1 : 0, receipt_count: command_receipt_facts.length,
  effect_count: 1, pointer_count: 1, rest_count: 1, history_count: 1,
  timing_count: 1, restore_count: 1, merge_receipt_count: 1, cue_count: 0,
  source_sha256: committed ? 'b'.repeat(64) : 'a'.repeat(64),
  receipt_sha256: committed ? 'c'.repeat(64) : 'a'.repeat(64),
  effect_sha256: digest, pointer_sha256: digest, rest_sha256: digest,
  history_sha256: digest, timing_sha256: digest, restore_sha256: digest,
  merge_receipt_sha256: digest, cue_sha256: digest,
  command_receipt_facts, effect_facts, pointer_facts, rest_facts, timing_facts,
  history_facts, restore_facts, merge_receipt_facts,
  });
};
const cutObservation = (scenario, step, definition, index) => {
  const uncommitted = V12_RECOVERY_UNCOMMITTED_CUT_IDS.includes(definition.id);
  const before = snapshot(false, step); const afterCut = uncommitted ? before : snapshot(true, step);
  const afterReopen = uncommitted ? before : afterCut;
  return ({
  step_id: step.id,
  boundary_id: step.boundary_id,
  receipt_kind: step.receipt_kind,
  cut_id: definition.id,
  status: 'PASS',
  operation_id: step.operation_id,
  barrier: {
    barrier_id: definition.barrier_id, process_state: definition.process_state,
    acknowledgement: definition.acknowledgement, connectivity: definition.connectivity,
    first_attempt: definition.first_attempt, provenance: definition.provenance,
  },
  first_attempt_code: definition.barrier_id,
  recovery_code: definition.id === 'recovery'
    ? scenario.id === 'foreground-reconciliation' ? 'foreground-reconciled' : 'domain-reconciled'
    : 'not-required',
  retry_code: uncommitted ? 'committed' : 'replayed',
  receipt_sha256: index.toString(16).padStart(64, '0'),
  snapshots: { before, after_cut: afterCut, after_reopen: afterReopen,
    after_recovery: afterReopen, after_retry: uncommitted ? snapshot(true, step) : afterReopen },
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
    cuts: scenario.steps.flatMap((step, stepOrder) => V12_RECOVERY_CUT_DEFINITIONS.map((cut, cutOrder) => cutObservation(scenario, step, cut, (order * 32) + stepOrder * V12_RECOVERY_CUT_DEFINITIONS.length + cutOrder + 1))),
  })),
});


export const personalCloseoutRecoveryFixture = valid;

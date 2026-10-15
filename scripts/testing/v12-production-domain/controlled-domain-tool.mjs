// Deliberately independent subprocess stand-ins for ADB and Maestro.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const [tool, ...args] = process.argv.slice(2);
const file = path.join(process.env.V12_CONTROLLED_STATE, 'state.json');
const state = JSON.parse(readFileSync(file, 'utf8'));
const save = () => writeFileSync(file, JSON.stringify(state));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const out = (value) => process.stdout.write(value);
const shell = args[2] === 'shell' ? [...args[3].matchAll(/'([^']*)'/gu)].map((m) => m[1]) : [];
const scenarios = {
  'legacy-playback': { operation_id: 'tim01-legacy-playback', boundary_ids: ['start', 'edit'] },
  'foreground-reconciliation': { operation_id: 'tim01-foreground-reconciliation', boundary_ids: ['rest'] },
  'queued-callback': { operation_id: 'tim01-queued-callback', boundary_ids: ['commit'] },
  relaunch: { operation_id: 'workout-relaunch-replay', boundary_ids: ['finish'] },
  restore: { operation_id: 'secure-restore', boundary_ids: ['restore', 'import'] },
  merge: { operation_id: 'secure-merge', boundary_ids: ['merge', 'match'] },
  'zero-cue': { operation_id: 'tim01-zero-cue', boundary_ids: ['start', 'edit', 'finish'] },
  'between-set-rest-pointer': { operation_id: 'workout-rest-set-pointer', boundary_ids: ['commit', 'rest'] },
};
const cuts = {
  'pre-transaction': { barrier_id: 'before-transaction', process_state: 'route-open', acknowledgement: 'not-reached', connectivity: 'online', first_attempt: 'not-started', first_attempt_code: 'not-started' },
  'in-transaction': { barrier_id: 'writer-transaction-open', process_state: 'writer-open', acknowledgement: 'not-reached', connectivity: 'online', first_attempt: 'transaction-open', first_attempt_code: 'transaction-open' },
  'post-commit-before-ack': { barrier_id: 'commit-durable-ack-pending', process_state: 'writer-open', acknowledgement: 'lost', connectivity: 'online', first_attempt: 'committed-ack-lost', first_attempt_code: 'acknowledgement-lost' },
  'post-acknowledgement': { barrier_id: 'acknowledgement-observed', process_state: 'route-open', acknowledgement: 'observed', connectivity: 'online', first_attempt: 'acknowledged', first_attempt_code: 'acknowledged' },
  relaunch: { barrier_id: 'replay-process-open', process_state: 'replay-open', acknowledgement: 'observed', connectivity: 'online', first_attempt: 'acknowledged', first_attempt_code: 'replay-process-open' },
  retry: { barrier_id: 'first-attempt-failed', process_state: 'route-open', acknowledgement: 'not-reached', connectivity: 'online', first_attempt: 'failed', first_attempt_code: 'first-attempt-failed' },
  offline: { barrier_id: 'post-boundary-offline', process_state: 'route-open', acknowledgement: 'observed', connectivity: 'switch-offline', first_attempt: 'acknowledged', first_attempt_code: 'offline-switch-pending' },
  recovery: { barrier_id: 'domain-reconciliation-pending', process_state: 'recovery-open', acknowledgement: 'observed', connectivity: 'online', first_attempt: 'acknowledged', first_attempt_code: 'domain-reconciliation-pending' },
};
function recoverySnapshot(committed, phase) {
  const caseId = state.caseId; const timed = true;
  const hasRest = ['foreground-reconciliation', 'queued-callback'].includes(caseId)
    || (caseId === 'between-set-rest-pointer' && committed);
  const hasEffect = ['foreground-reconciliation', 'queued-callback'].includes(caseId)
    || (['between-set-rest-pointer', 'legacy-playback', 'relaunch', 'zero-cue'].includes(caseId) && committed);
  const pointer = [{ session_sha256: hash(`${caseId}:session`), status: ['relaunch', 'zero-cue'].includes(caseId) && committed ? 'partial' : 'in_progress', revision: committed ? 3 : 2, active_exercise_sha256: hash(`${caseId}:exercise`), active_set_sha256: hash(`${caseId}:active-set`), committed_set_sha256: committed ? hash(`${caseId}:committed-set`) : null }];
  const rest = hasRest ? [{ session_sha256: pointer[0].session_sha256, status: caseId === 'foreground-reconciliation' && phase === 'recovered' ? 'expired' : 'running', revision: phase === 'recovered' ? 2 : 1, started_at_ms: phase === 'recovered' ? null : 100, ends_at_ms: phase === 'recovered' ? null : 200, deadline_at_ms: phase === 'recovered' ? null : 200, paused_remaining_ms: null, expired_at_ms: phase === 'recovered' ? 300 : null, next_set_sha256: hash(`${caseId}:next-set`) }] : [];
  const timing = timed ? [{ session_sha256: pointer[0].session_sha256, set_sha256: hash(`${caseId}:timed-set`), state_version: 1, revision: 1, status: 'stopped', mode: 'per_rep', configuration: { version: 1, mode: 'per_rep', intervalMs: 1500, cueChannels: 'haptic' }, progress: { version: 1, completedRepetitions: 2, completedGroups: 0, currentGroupIndex: 0, currentGroupProgress: 2 }, started_at_ms: null, next_boundary_at_ms: null, remaining_ms: null, stopped_at_ms: 150 }] : [];
  const history = timed ? [{ event_sha256: hash(`${caseId}:history`), session_sha256: pointer[0].session_sha256, effective_revision: 2, event_type: 'correction', field_identity: 'advanced_timing_resolved_json', before_sha256: hash('off'), after_sha256: hash('per-rep'), occurred_at_ms: 140 }] : [];
  const effects = hasEffect ? [{ effect_sha256: hash(`${caseId}:effect`), type: 'reconcile_rest_notification', subject_sha256: pointer[0].session_sha256, expected_revision: 1, status: phase === 'recovered' ? 'completed' : 'pending', attempt_count: phase === 'recovered' ? 1 : 0, next_attempt_at_ms: 200, last_error_code: null }] : [];
  const restore = [{ state: caseId === 'restore' && committed ? 'rebuild_pending' : 'ready', updated_at_ms: committed ? 300 : 0 }];
  const mergeReceipts = caseId === 'merge' && committed ? [{ table: 'workout_receipts', receipt_sha256: hash(`${caseId}:receipt`), request_sha256: hash(`${caseId}:request`), idempotency_sha256: hash(`${caseId}:idempotency`), committed_at_ms: 300, result: 'committed' }] : [];
  const source = committed ? [{ state: 'committed' }] : [];
  const receipt = committed ? [{ state: 'committed' }] : [];
  const groups = { source, receipt, effect: effects, pointer, rest, history, timing, restore, merge_receipt: mergeReceipts, cue: [] };
  return {
    source_count: source.length, receipt_count: receipt.length, effect_count: effects.length,
    pointer_count: pointer.length, rest_count: rest.length, history_count: history.length,
    timing_count: timing.length, restore_count: restore.length, merge_receipt_count: mergeReceipts.length, cue_count: 0,
    source_sha256: hash(JSON.stringify(source)), receipt_sha256: hash(JSON.stringify(receipt)), effect_sha256: hash(JSON.stringify(effects)),
    pointer_sha256: hash(JSON.stringify(pointer)), rest_sha256: hash(JSON.stringify(rest)), history_sha256: hash(JSON.stringify(history)),
    timing_sha256: hash(JSON.stringify(timing)), restore_sha256: hash(JSON.stringify(restore)), merge_receipt_sha256: hash(JSON.stringify(mergeReceipts)), cue_sha256: hash('[]'),
    effect_facts: effects, pointer_facts: pointer, rest_facts: rest, timing_facts: timing,
    history_facts: history, restore_facts: restore, merge_receipt_facts: mergeReceipts,
  };
}
if (tool === 'unzip') {
  if (args[0] === '-Z1') out(state.missingBundle ? 'assets/app.config\n' : 'assets/app.config\nassets/index.android.bundle\n');
  else out(JSON.stringify({ android: { package: 'com.fchoo.gymtracker.devtest' }, scheme: 'gymtracker-devtest', extra: { buildProfile: 'development-test', nativeContractsEnabled: true, nativeContractSuite: state.wrongSuite ? 'phase16-calendar' : 'v1.2-acceptance' } }));
  process.exit();
}
if (tool === 'maestro') {
  if (args[0] === '--version') { out('2.8.0'); process.exit(); }
  const values = Object.fromEntries(args.filter((_, i) => args[i - 1] === '-e').map((v) => { const i = v.indexOf('='); return [v.slice(0, i), v.slice(i + 1)]; }));
  state.domainCalls.push(values);
  state.nonce = values.V12_DOMAIN_NONCE;
  state.stage = values.PHASE16_CALENDAR_STAGE;
  state.caseId = values.V12_RECOVERY_CASE;
  state.cut = values.V12_RECOVERY_STAGE;
  state.recoveryPhase = values.V12_RECOVERY_PHASE;
  if (state.changeSettings) state.settings.font_scale = '2';
  save();
  if (!state.missingJunit) {
    const status = state.junitFailure ? '<failure message="private-native /Users/private bearer credential"/>' : state.junitSkip ? '<skipped/>' : '';
    writeFileSync(args[args.indexOf('--output') + 1], `<testsuite tests="1"><testcase name="controlled">${status}</testcase></testsuite>`);
  }
  process.exit(state.junitFailure ? 1 : 0);
}
if (shell[0] === 'cmd' && shell[1] === 'connectivity') {
  if (shell[3]) {
    if (state.failAirplaneRestore && shell[3] === 'disable' && state.domainCalls.length > 0) process.exit(1);
    state.airplane = shell[3] === 'enable'; state.settings.airplane_mode_on = state.airplane ? '1' : '0'; save();
  }
  out(`Airplane mode is ${state.airplane ? 'enabled' : 'disabled'}`); process.exit();
}
if (shell[0] === 'am' && shell[1] === 'start') {
  const link = new URL(shell[shell.indexOf('-d') + 1]);
  state.nonce = link.searchParams.get('nonce');
  save(); out('Status: ok'); process.exit();
}
if (tool === 'adb' && args[2] === 'exec-out') { out(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1EAAAAASUVORK5CYII=', 'base64')); process.exit(); }
if (tool === 'adb' && args[2] === 'logcat') {
  if (state.missingMarker) process.exit();
  const nonce = state.staleMarker ? 'stale' : state.nonce;
  let value;
  if (state.stage) value = { kind: 'calendar', flow_sha256: state.wrongFlow ? '0'.repeat(64) : state.flow, flow_revision: 'calendar-flow-r35', stage: state.calendar.find((entry) => entry.id === state.stage) };
  else if (state.cut) {
    const uncommitted = ['pre-transaction', 'in-transaction', 'retry'].includes(state.cut);
    const scenario = scenarios[state.caseId]; const barrier = cuts[state.cut];
    const before = recoverySnapshot(false, 'baseline');
    const afterCut = uncommitted ? before : recoverySnapshot(true, 'committed');
    if (state.recoveryPhase === 'arm') value = {
      schema_version: 2, sequence: 1, kind: 'ARMED', case_id: state.caseId,
      cut_id: state.missingCut ? 'unknown' : state.cut, ...scenario, ...barrier,
      before, after_cut: afterCut,
    };
    else {
      const afterReopen = uncommitted ? before : afterCut;
      const afterRecovery = state.cut === 'recovery' ? recoverySnapshot(true, 'recovered') : afterReopen;
      const retryCode = uncommitted ? 'committed' : 'replayed';
      value = {
        schema_version: 2, kind: 'recovery', case_id: state.caseId,
        cut_id: state.missingCut ? 'unknown' : state.cut, ...scenario,
        after_reopen: afterReopen,
        recovery_code: state.cut === 'recovery'
          ? state.caseId === 'foreground-reconciliation' ? 'foreground-reconciled'
            : state.caseId === 'queued-callback' ? 'queued-callback-reconciled' : 'domain-reconciled'
          : 'not-required',
        after_recovery: afterRecovery, retry_code: retryCode,
        after_retry: state.cut === 'recovery' ? afterRecovery : recoverySnapshot(true, 'committed'),
      };
    }
  }
  else value = state.authRequired ? { kind: 'error', code: 'auth_required' } : { kind: 'garmin', ...state.garmin };
  if (state.noReceipt && value.stage) delete value.stage.receipt;
  if (value.stage?.receipt) { delete value.stage.receipt.screenshot_sha256; delete value.stage.receipt.trace_sha256; }
  const prefix = value?.kind === 'ARMED' ? 'GYM_TRACKER_V12_DOMAIN_PROGRESS:' : 'GYM_TRACKER_V12_DOMAIN_RESULT:';
  out(`${prefix}${JSON.stringify({ schema_version: value?.schema_version ?? 1, nonce, ...value })}\n`);
  process.exit();
}
const fallback = new URL('../v12-production-launcher/controlled-device-tool.mjs', import.meta.url);
process.argv = [process.execPath, fallback.pathname, ...args];
await import(fallback);

// Deliberately independent subprocess stand-ins for ADB and Maestro.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { V12_RECOVERY_CUT_DEFINITIONS, V12_RECOVERY_SCENARIOS, V12_RECOVERY_UNCOMMITTED_CUT_IDS } from '../../v12-recovery-shard.mjs';

const [tool, ...args] = process.argv.slice(2);
const file = path.join(process.env.V12_CONTROLLED_STATE, 'state.json');
const state = JSON.parse(readFileSync(file, 'utf8'));
const save = () => writeFileSync(file, JSON.stringify(state));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const out = (value) => process.stdout.write(value);
const shell = args[2] === 'shell' ? [...args[3].matchAll(/'([^']*)'/gu)].map((m) => m[1]) : [];
const scenarios = Object.fromEntries(V12_RECOVERY_SCENARIOS.map((scenario) => [scenario.id, scenario]));
const cuts = Object.fromEntries(V12_RECOVERY_CUT_DEFINITIONS.map(({ id, ...cut }) => [id, { ...cut, first_attempt_code: cut.barrier_id }]));
function recoverySnapshot(committed, phase) {
  const caseId = state.caseId; const step = scenarios[caseId].steps.find(({ id }) => id === state.stepId); const timed = true;
  const hasRest = ['foreground-reconciliation', 'queued-callback', 'restore', 'merge'].includes(caseId)
    || (caseId === 'between-set-rest-pointer' && committed);
  const hasEffect = ['foreground-reconciliation', 'queued-callback'].includes(caseId)
    || (['between-set-rest-pointer', 'legacy-playback', 'relaunch', 'zero-cue'].includes(caseId) && committed);
  const exercise = hash(`${caseId}:exercise`); const transition = committed ? hash(`${caseId}:${step.id}:transition`) : null;
  const pointer = [{ session_sha256: hash(`${caseId}:session`), status: step.receipt_kind === 'workout-finish' && committed ? 'partial' : 'in_progress', revision: committed ? 3 : 2, active_exercise_sha256: exercise, active_set_exercise_sha256: exercise, active_set_sha256: hash(`${caseId}:active-set`), active_set_ordinal: 1, committed_set_exercise_sha256: committed ? exercise : null, committed_set_sha256: committed ? hash(`${caseId}:committed-set`) : null, committed_set_ordinal: committed ? 0 : null, transition_sha256: transition }];
  const rest = hasRest ? [{ session_sha256: pointer[0].session_sha256, status: caseId === 'foreground-reconciliation' && phase === 'recovered' ? 'expired' : 'running', revision: phase === 'recovered' ? 2 : 1, started_at_ms: phase === 'recovered' ? null : 100, ends_at_ms: phase === 'recovered' ? null : 200, deadline_at_ms: phase === 'recovered' ? null : 200, paused_remaining_ms: null, expired_at_ms: phase === 'recovered' ? 300 : null, next_set_exercise_sha256: exercise, next_set_sha256: pointer[0].active_set_sha256, next_set_ordinal: 1, transition_sha256: transition }] : [];
  const timing = timed ? [{ session_sha256: pointer[0].session_sha256, set_sha256: hash(`${caseId}:timed-set`), state_version: 1, revision: 1, status: 'stopped', mode: 'per_rep', configuration: { version: 1, mode: 'per_rep', intervalMs: 1500, cueChannels: 'haptic' }, progress: { version: 1, completedRepetitions: 2, completedGroups: 0, currentGroupIndex: 0, currentGroupProgress: 2 }, started_at_ms: null, next_boundary_at_ms: null, remaining_ms: null, stopped_at_ms: 150 }] : [];
  const history = timed ? [{ event_sha256: hash(`${caseId}:history`), session_sha256: pointer[0].session_sha256, effective_revision: 2, event_type: 'correction', field_identity: 'advanced_timing_resolved_json', before_sha256: hash('off'), after_sha256: hash('per-rep'), occurred_at_ms: 140 }] : [];
  const effects = hasEffect ? [{ effect_sha256: hash(`${caseId}:effect`), type: 'reconcile_rest_notification', subject_sha256: pointer[0].session_sha256, expected_revision: 1, status: phase === 'recovered' ? 'completed' : 'pending', attempt_count: phase === 'recovered' ? 1 : 0, next_attempt_at_ms: 200, last_error_code: null }] : [];
  const restore = [{ state: step.receipt_kind === 'secure-restore' && committed ? 'rebuild_pending' : 'ready', updated_at_ms: committed ? 300 : 0 }];
  const table = step.receipt_kind === 'garmin-import' ? 'imported_activity_receipts' : step.receipt_kind === 'activity-match' ? 'running_activity_match_receipts' : step.receipt_kind === 'secure-merge' ? 'metric_profile_migration_events' : null;
  const mergeReceipts = table && committed ? [{ table, receipt_sha256: hash(`${step.id}:receipt`), request_sha256: hash(`${step.id}:request`), idempotency_sha256: hash(`${step.id}:idempotency`), committed_at_ms: 300, result: table === 'metric_profile_migration_events' ? 'metric-migrated' : 'committed' }] : [];
  const commandReceipts = committed ? [{ step_id: step.id, boundary_id: step.boundary_id, kind: step.receipt_kind, receipt_sha256: hash(`${step.id}:command`), request_sha256: hash(`${step.id}:request`), committed_at_ms: 300, result: 'committed' }] : [];
  const source = committed ? [{ state: 'committed' }] : [];
  const receipt = commandReceipts;
  const groups = { source, receipt, effect: effects, pointer, rest, history, timing, restore, merge_receipt: mergeReceipts, cue: [] };
  return {
    source_count: source.length, receipt_count: receipt.length, effect_count: effects.length,
    pointer_count: pointer.length, rest_count: rest.length, history_count: history.length,
    timing_count: timing.length, restore_count: restore.length, merge_receipt_count: mergeReceipts.length, cue_count: 0,
    source_sha256: hash(JSON.stringify(source)), receipt_sha256: hash(JSON.stringify(receipt)), effect_sha256: hash(JSON.stringify(effects)),
    pointer_sha256: hash(JSON.stringify(pointer)), rest_sha256: hash(JSON.stringify(rest)), history_sha256: hash(JSON.stringify(history)),
    timing_sha256: hash(JSON.stringify(timing)), restore_sha256: hash(JSON.stringify(restore)), merge_receipt_sha256: hash(JSON.stringify(mergeReceipts)), cue_sha256: hash('[]'),
    command_receipt_facts: commandReceipts, effect_facts: effects, pointer_facts: pointer, rest_facts: rest, timing_facts: timing,
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
  state.stepId = values.V12_RECOVERY_STEP;
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
if (shell[0] === 'date' && shell[1] === '+%s') { out('2000000'); process.exit(); }
if (shell[0] === 'run-as') {
  const script = shell.at(-1) ?? '';
  if (shell[2] === 'sh' && shell[3] === '-c' && script.includes('base64 -d')) {
    if (state.arm) process.exit(1);
    state.arm = true; save(); process.exit();
  }
  if (shell[2] === 'sh' && shell[3] === '-c') {
    if (state.arm || state.databasesPresent || (script.includes('garmin-di-session.bin') && state.authRequired)) process.exit(1);
    process.exit();
  }
  if (shell[2] === 'rm') { state.arm = false; save(); process.exit(); }
}
if (shell[0] === 'am' && shell[1] === 'start') {
  const link = new URL(shell[shell.indexOf('-d') + 1]);
  state.nonce = link.searchParams.get('nonce');
  state.garminPhase = link.searchParams.get('mode');
  state.arm = false;
  state.processCounter += 1; state.currentPid = state.processCounter;
  save(); out('Status: ok'); process.exit();
}
if (shell[0] === 'am' && shell[1] === 'force-stop') { state.currentPid = null; save(); process.exit(); }
if (shell[0] === 'pidof') { if (state.currentPid) out(String(state.currentPid)); process.exit(state.currentPid ? 0 : 1); }
if (tool === 'adb' && args[2] === 'exec-out') { out(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1EAAAAASUVORK5CYII=', 'base64')); process.exit(); }
if (tool === 'adb' && args[2] === 'logcat') {
  if (state.missingMarker) process.exit();
  const nonce = state.staleMarker ? 'stale' : state.nonce;
  let value;
  if (state.stage) value = { kind: 'calendar', flow_sha256: state.wrongFlow ? '0'.repeat(64) : state.flow, flow_revision: 'calendar-flow-r35', stage: state.calendar.find((entry) => entry.id === state.stage) };
  else if (state.cut) {
    const uncommitted = V12_RECOVERY_UNCOMMITTED_CUT_IDS.includes(state.cut);
    const scenario = scenarios[state.caseId]; const step = scenario.steps.find(({ id }) => id === state.stepId); const barrier = cuts[state.cut];
    const before = recoverySnapshot(false, 'baseline');
    const afterCut = uncommitted ? before : recoverySnapshot(true, 'committed');
    if (state.recoveryPhase === 'arm') value = {
      schema_version: 2, sequence: 1, kind: 'ARMED', case_id: state.caseId,
      step_id: step.id, cut_id: state.missingCut ? 'unknown' : state.cut,
      operation_id: step.operation_id, boundary_id: step.boundary_id, receipt_kind: step.receipt_kind, ...barrier,
      before, after_cut: afterCut,
    };
    else {
      const afterReopen = uncommitted ? before : afterCut;
      const afterRecovery = state.cut === 'recovery' ? recoverySnapshot(true, 'recovered') : afterReopen;
      const retryCode = uncommitted ? 'committed' : 'replayed';
      value = {
        schema_version: 2, kind: 'recovery', case_id: state.caseId,
        step_id: step.id, cut_id: state.missingCut ? 'unknown' : state.cut,
        operation_id: step.operation_id, boundary_id: step.boundary_id, receipt_kind: step.receipt_kind,
        after_reopen: afterReopen,
        recovery_code: state.cut === 'recovery'
          ? state.caseId === 'foreground-reconciliation' ? 'foreground-reconciled'
            : state.caseId === 'queued-callback' ? 'queued-callback-reconciled' : 'domain-reconciled'
          : 'not-required',
        after_recovery: afterRecovery, retry_code: retryCode,
        after_retry: state.cut === 'recovery' ? afterRecovery : uncommitted ? recoverySnapshot(true, 'committed') : afterReopen,
      };
    }
  }
  else if (state.authRequired) value = { kind: 'error', code: 'auth_required' };
  else if (state.garminPhase === 'preflight') value = { schema_version: 2, kind: 'garmin-preflight', session_sha256: hash('controlled-session') };
  else value = { schema_version: 2, kind: 'garmin', ...state.garmin, cleanup: { arm: 'cleared', databases_deleted: 3 } };
  if (state.noReceipt && value.stage) delete value.stage.receipt;
  if (value.stage?.receipt) { delete value.stage.receipt.screenshot_sha256; delete value.stage.receipt.trace_sha256; }
  const payload = { schema_version: value?.schema_version ?? 1, nonce, ...value };
  if (value?.kind === 'garmin') {
    const serialized = JSON.stringify(payload); const chunks = Array.from({ length: Math.ceil(serialized.length / 1500) }, (_, index) => serialized.slice(index * 1500, (index + 1) * 1500));
    chunks.forEach((data, index) => out(`GYM_TRACKER_V12_DOMAIN_RESULT_CHUNK:${JSON.stringify({ schema_version: 2, nonce, kind: 'chunk', sequence: index + 1, total: chunks.length, data })}\n`));
    out(`GYM_TRACKER_V12_DOMAIN_RESULT:${JSON.stringify({ schema_version: 2, nonce, kind: 'chunked', total: chunks.length, sha256: hash(serialized) })}\n`);
  } else {
    const prefix = value?.kind === 'ARMED' ? 'GYM_TRACKER_V12_DOMAIN_PROGRESS:' : 'GYM_TRACKER_V12_DOMAIN_RESULT:';
    out(`${prefix}${JSON.stringify(payload)}\n`);
  }
  process.exit();
}
const fallback = new URL('../v12-production-launcher/controlled-device-tool.mjs', import.meta.url);
process.argv = [process.execPath, fallback.pathname, ...args];
await import(fallback);

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
    const uncommitted = ['pre-transaction', 'in-transaction'].includes(state.cut);
    const operation = state.caseId === 'restore' ? 'secure-restore'
      : state.caseId === 'merge' ? 'secure-merge'
        : state.caseId === 'zero-cue' ? 'garmin-import'
          : state.caseId === 'relaunch' ? 'garmin-match' : 'workout-complete-set';
    const retryCode = operation === 'workout-complete-set' ? (uncommitted ? 'committed' : 'already-completed')
      : operation === 'garmin-import' ? (uncommitted ? 'imported' : 'unchanged')
        : operation === 'garmin-match' ? (uncommitted ? 'matched' : 'replayed')
          : operation === 'secure-merge' ? (uncommitted ? 'rebuild-pending' : 'ready') : 'rebuild-pending';
    const snapshot = (committed, phase) => ({
      source_count: committed ? 1 : 0, receipt_count: committed ? 1 : 0,
      effect_count: committed && operation === 'workout-complete-set' ? 1 : 0,
      pointer_count: committed && ['workout-complete-set', 'secure-restore', 'secure-merge'].includes(operation) ? 1 : 0,
      rest_count: committed && operation === 'workout-complete-set' ? 1 : 0,
      history_count: 0, timing_count: 0,
      source_sha256: hash(`${state.caseId}:${state.cut}:${phase}:source:${committed}`),
      receipt_sha256: hash(`${state.caseId}:${state.cut}:${phase}:receipt:${committed}`),
      effect_sha256: hash(`${state.caseId}:${state.cut}:${phase}:effect:${committed}`),
      pointer_sha256: hash(`${state.caseId}:${state.cut}:${phase}:pointer:${committed}`),
      rest_sha256: hash(`${state.caseId}:${state.cut}:${phase}:rest:${committed}`),
      history_sha256: hash('[]'),
      timing_sha256: hash('[]'),
    });
    const afterRetry = snapshot(true, uncommitted ? 'retry' : 'committed');
    value = {
      kind: 'recovery', case_id: state.caseId,
      cut_id: state.missingCut ? 'unknown' : state.cut,
      operation_id: operation,
      after_reopen: uncommitted ? snapshot(false, 'reopen') : afterRetry,
      retry_code: retryCode,
      after_retry: afterRetry,
    };
  }
  else value = state.authRequired ? { kind: 'error', code: 'auth_required' } : { kind: 'garmin', ...state.garmin };
  if (state.noReceipt && value.stage) delete value.stage.receipt;
  if (value.stage?.receipt) { delete value.stage.receipt.screenshot_sha256; delete value.stage.receipt.trace_sha256; }
  out(`GYM_TRACKER_V12_DOMAIN_RESULT:${JSON.stringify({ schema_version: 1, nonce, ...value })}\n`);
  process.exit();
}
const fallback = new URL('../v12-production-launcher/controlled-device-tool.mjs', import.meta.url);
process.argv = [process.execPath, fallback.pathname, ...args];
await import(fallback);

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createProductionNativeRuntime } from './v12-production-native-runtime.mjs';
import { V12_CALENDAR_SHARD_STAGE_IDS } from './v12-calendar-shard.mjs';
import { V12_RECOVERY_CASE_IDS, V12_RECOVERY_CUT_DEFINITIONS, V12_RECOVERY_CUT_IDS, V12_RECOVERY_SCENARIOS as RECOVERY_SCENARIO_DEFINITIONS, V12_RECOVERY_UNCOMMITTED_CUT_IDS } from './v12-recovery-shard.mjs';
import { calendarStage, exact, fail, garminCases, hash, HASH, junitOutcome, worse } from './v12-production-domain-receipts.mjs';
import { resolveV12NativeExecutionTools } from './v12-native-execution-origin.mjs';

const PACKAGE = 'com.fchoo.gymtracker.devtest';
const RESULT = 'GYM_TRACKER_V12_DOMAIN_RESULT:';
const RESULT_CHUNK = 'GYM_TRACKER_V12_DOMAIN_RESULT_CHUNK:';
const PROGRESS = 'GYM_TRACKER_V12_DOMAIN_PROGRESS:';
const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const SETTINGS = { font_scale: 'system', accelerometer_rotation: 'system', user_rotation: 'system', window_animation_scale: 'global', transition_animation_scale: 'global', animator_duration_scale: 'global', airplane_mode_on: 'global' };
const ATTESTATION = ['schema_version', 'action', 'launcher_source_sha256', 'run_id', 'build_profile', 'suite', 'source_tree_sha256', 'apk_sha256', 'installed_apk_sha256', 'apk_signature_sha256', 'device_identity_sha256', 'package'];
const RECOVERY_SNAPSHOT_KEYS = [
  'source_count', 'receipt_count', 'effect_count', 'pointer_count', 'rest_count',
  'history_count', 'timing_count', 'restore_count', 'merge_receipt_count', 'cue_count',
  'source_sha256', 'receipt_sha256', 'effect_sha256', 'pointer_sha256', 'rest_sha256',
  'history_sha256', 'timing_sha256', 'restore_sha256', 'merge_receipt_sha256',
  'cue_sha256', 'effect_facts', 'pointer_facts', 'rest_facts', 'timing_facts',
  'history_facts', 'restore_facts', 'merge_receipt_facts', 'command_receipt_facts',
];
const RECOVERY_UNCOMMITTED_CUTS = new Set(V12_RECOVERY_UNCOMMITTED_CUT_IDS);
const RECOVERY_COMMITTED_CUTS = new Set(['post-commit-before-ack', 'post-acknowledgement', 'relaunch']);
const RECOVERY_SCENARIOS = Object.freeze(Object.fromEntries(RECOVERY_SCENARIO_DEFINITIONS.map((scenario) => [scenario.id, scenario])));
const RECOVERY_CUTS = Object.freeze(Object.fromEntries(V12_RECOVERY_CUT_DEFINITIONS.map((cut) => [cut.id, cut])));

function validate(action, payload, a, root) {
  if (!exact(a, ATTESTATION) || a.schema_version !== 1 || a.action !== action || a.build_profile !== 'development-test'
    || a.suite !== 'v1.2-acceptance' || a.package !== PACKAGE || !/^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(a.run_id ?? '')
    || !ATTESTATION.filter((key) => key.endsWith('sha256')).every((key) => HASH.test(a[key] ?? ''))
    || a.launcher_source_sha256 !== hash(readFileSync(path.join(root, 'scripts/v12-production-native-adapter-launcher.mjs')))) fail('attestation_invalid');
  const allowed = ['run_id', 'lease', 'settings', ...(action === 'calendar' ? ['flow_sha256', 'flow_revision'] : [])];
  if (!payload || Array.isArray(payload) || payload.run_id !== a.run_id || Object.keys(payload).some((key) => !allowed.includes(key))) fail('request_invalid');
  if (process.env.NODE_ENV === 'test' || process.env.V12_NATIVE_ADAPTER_TEST_MODE !== undefined || process.env.V12_NATIVE_ADAPTER_TEST_PROCESS !== undefined || process.env.V12_NATIVE_ADAPTER_COMMAND !== undefined) fail('test_environment_forbidden');
}

function session(root, a, action, executionTools) {
  const serial = process.env.V12_DEVICE_SERIAL;
  let nonce = randomBytes(16).toString('hex');
  // Recovery owns 224 bounded arm/recover flows. Garmin has a real cold restart,
  // encrypted-session lifecycle, sync, portability and matching pass. Both leave
  // explicit cleanup headroom inside the adapter's outer deadline.
  const deadline = Date.now() + (action === 'recovery' ? 40 : action === 'garmin' ? 12 : 3) * 60_000;
  const command = (exe, args, { timeout = 20_000, binary = false, acceptFailure = false, cleanup = false } = {}) => {
    if (!cleanup && Date.now() >= deadline) fail('domain_timeout');
    const result = spawnSync(exe, args, { cwd: root, encoding: binary ? undefined : 'utf8', timeout: cleanup ? timeout : Math.min(timeout, Math.max(1, deadline - Date.now())), maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.error || result.signal || (!acceptFailure && result.status !== 0)) fail('native_prerequisite_failed');
    return result;
  };
  const adb = (...args) => command(executionTools.adb, ['-s', serial, ...args]).stdout.trim();
  const shell = (...args) => adb('shell', args.map(quote).join(' '));
  const cleanupShell = (...args) => command(executionTools.adb, ['-s', serial, 'shell', args.map(quote).join(' ')], { cleanup: true }).stdout.trim();
  let directory;
  const retained = () => {
    if (!directory) {
      const parts = ['artifacts', 'native', 'v1.2', a.run_id]; let parent = root;
      for (const part of parts) {
        parent = path.join(parent, part);
        mkdirSync(parent, { recursive: true, mode: 0o700 });
        if (lstatSync(parent).isSymbolicLink() || !lstatSync(parent).isDirectory()) fail('artifact_path_invalid');
      }
      directory = mkdtempSync(path.join(parent, 'domain-')); chmodSync(directory, 0o700);
    }
    return directory;
  };
  async function marker(kind, predicate = () => true) {
    const start = Date.now(); let progressed = start; let sequence = 0;
    const chunks = new Map();
    while (Date.now() < deadline && Date.now() - start < (action === 'garmin' ? 11 : 3) * 60_000) {
      const logs = adb('logcat', '-d', '-v', 'raw', 'ReactNativeJS:I', '*:S');
      const found = [];
      for (const line of logs.split(/\r?\n/u)) {
        for (const prefix of [RESULT, RESULT_CHUNK, PROGRESS]) {
          const index = line.indexOf(prefix); if (index < 0) continue;
          let value; try { value = JSON.parse(line.slice(index + prefix.length)); } catch { continue; }
          if (value?.nonce !== nonce) continue;
          if (![1, 2].includes(value.schema_version)) fail('marker_invalid');
          if (prefix === RESULT_CHUNK) {
            if (!exact(value, ['schema_version', 'nonce', 'kind', 'sequence', 'total', 'data'])
              || value.schema_version !== 2 || value.kind !== 'chunk' || !Number.isSafeInteger(value.sequence)
              || !Number.isSafeInteger(value.total) || value.sequence < 1 || value.total < 1 || value.total > 16
              || value.sequence > value.total || typeof value.data !== 'string' || value.data.length > 1_500
              || (chunks.has(value.sequence) && chunks.get(value.sequence) !== value.data)) fail('marker_invalid');
            if (!chunks.has(value.sequence)) { chunks.set(value.sequence, value.data); progressed = Date.now(); }
          } else if (prefix === PROGRESS) {
            if (value.kind === 'ARMED') {
              if (value.schema_version !== 2 || !Number.isSafeInteger(value.sequence) || value.sequence !== 1) fail('marker_invalid');
              if (kind === 'ARMED' && predicate(value)) found.push(value);
            } else if (!exact(value, ['schema_version', 'nonce', 'sequence']) || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || value.sequence > 256) fail('marker_invalid');
            if (value.sequence > sequence) { sequence = value.sequence; progressed = Date.now(); }
          } else {
            if (value.kind === 'chunked') {
              if (!exact(value, ['schema_version', 'nonce', 'kind', 'total', 'sha256']) || value.schema_version !== 2
                || !Number.isSafeInteger(value.total) || value.total < 1 || value.total > 16 || chunks.size !== value.total
                || !HASH.test(value.sha256 ?? '')) fail('marker_invalid');
              const serialized = Array.from({ length: value.total }, (_, index) => chunks.get(index + 1)).join('');
              if (hash(serialized) !== value.sha256) fail('marker_invalid');
              try { value = JSON.parse(serialized); } catch { fail('marker_invalid'); }
              if (value?.nonce !== nonce || value.schema_version !== 2) fail('marker_invalid');
            }
            if (value.kind === 'error') {
            if (!exact(value, ['schema_version', 'nonce', 'kind', 'code'])) fail('marker_invalid');
            if (!/^(?:auth_required|arm_required|result_too_large|[a-z0-9]+(?:_[a-z0-9]+)*_failed)$/u.test(value.code ?? '')) fail('marker_invalid');
            fail(value.code);
            } else if (value.kind === kind && predicate(value)) found.push(value);
          }
        }
      }
      // Re-reading logcat must not count the same progress as new work.
      if (found.length > 1) fail('marker_duplicate');
      if (found.length === 1) return found[0];
      if (Date.now() - progressed >= (action === 'garmin' ? 45_000 : 30_000)) fail('marker_timeout');
      await delay(250);
    }
    fail('marker_timeout');
  }
  function maestro(flow, variables, index) {
    nonce = randomBytes(16).toString('hex');
    const report = path.join(retained(), `${index}.xml`);
    const result = command(executionTools.maestro, ['test', '--device', serial, ...Object.entries({ V12_DOMAIN_NONCE: nonce, ...variables }).flatMap(([key, value]) => ['-e', `${key}=${value}`]), '--format', 'junit', '--output', report, path.join(root, flow)], { timeout: 180_000, acceptFailure: true });
    let xml; try { xml = readFileSync(report, 'utf8'); chmodSync(report, 0o600); } catch { fail('junit_missing'); }
    return junitOutcome(xml, result.status);
  }
  function recoveryMaestro(flow, variables) {
    const quarantine = mkdtempSync(path.join(tmpdir(), 'v12-recovery-junit-'));
    chmodSync(quarantine, 0o700);
    const report = path.join(quarantine, 'raw.xml');
    try {
      const result = command(executionTools.maestro, ['test', '--device', serial,
        ...Object.entries({ V12_DOMAIN_NONCE: nonce, ...variables }).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
        '--format', 'junit', '--output', report, path.join(root, flow)], { timeout: 180_000, acceptFailure: true });
      let xml; try { xml = readFileSync(report, 'utf8'); } catch { fail('junit_missing'); }
      return junitOutcome(xml, result.status);
    } finally {
      rmSync(quarantine, { recursive: true, force: true });
    }
  }
  function version() { if (command(executionTools.maestro, ['--version']).stdout.trim() !== '2.8.0') fail('maestro_version_invalid'); }
  function standalone() {
    // withLease has already checked this manifest path and the retained APK hash.
    const manifest = JSON.parse(readFileSync(path.join(root, 'artifacts/native/v1.2', a.run_id, 'build.json'), 'utf8'));
    const apk = path.join(root, manifest.build.apk.path);
    const entries = command(executionTools.unzip, ['-Z1', apk]).stdout.split(/\r?\n/u);
    if (['assets/index.android.bundle', 'assets/app.config'].some((name) => entries.filter((entry) => entry === name).length !== 1)) fail('standalone_required');
    let config; try { config = JSON.parse(command(executionTools.unzip, ['-p', apk, 'assets/app.config']).stdout); } catch { fail('standalone_required'); }
    if (config?.android?.package !== PACKAGE || config?.scheme !== 'gymtracker-devtest'
      || config?.extra?.buildProfile !== 'development-test' || config?.extra?.nativeContractsEnabled !== true
      || config?.extra?.nativeContractSuite !== 'v1.2-acceptance') fail('standalone_required');
  }
  function garminArm(phase, lease) {
    if (!['preflight', 'execute'].includes(phase) || !exact(lease, ['lease_id', 'native_execution'])
      || !/^[a-f0-9]{48}$/u.test(lease.lease_id ?? '') || lease.native_execution !== 'EXECUTED') fail('garmin_arm_invalid');
    const runIdSha256 = hash(a.run_id); const leaseIdSha256 = hash(lease.lease_id);
    const deviceSeconds = Number(shell('date', '+%s'));
    if (!Number.isSafeInteger(deviceSeconds) || deviceSeconds <= 0) fail('garmin_arm_invalid');
    const properties = [
      'schema_version=1', 'route_id=v12-production-garmin', `phase=${phase}`, `nonce=${nonce}`,
      `run_id_sha256=${runIdSha256}`, `device_identity_sha256=${a.device_identity_sha256}`,
      `lease_id_sha256=${leaseIdSha256}`, `expires_at_ms=${deviceSeconds * 1_000 + 8 * 60_000}`,
    ].join('\n') + '\n';
    const encoded = Buffer.from(properties).toString('base64');
    shell('run-as', PACKAGE, 'sh', '-c', `umask 077; d=no_backup/v12-evidence; f=$d/garmin-arm.properties; t=$d/.garmin-arm.tmp; mkdir -p "$d"; test ! -e "$f"; printf %s ${encoded} | base64 -d > "$t"; chmod 600 "$t"; mv "$t" "$f"`);
    return Object.freeze({ runIdSha256, leaseIdSha256, deviceIdentitySha256: a.device_identity_sha256 });
  }
  function launchGarmin(phase, arm) {
    shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d',
      `gymtracker-devtest://__v12-production-garmin?nonce=${nonce}&confirmation=VERIFY-V12-DOMAIN&mode=${phase}`,
      '--es', 'v12RunIdSha256', arm.runIdSha256,
      '--es', 'v12DeviceIdentitySha256', arm.deviceIdentitySha256,
      '--es', 'v12LeaseIdSha256', arm.leaseIdSha256, PACKAGE);
  }
  function garminCleanup(runNonce, requireSession) {
    const commandText = `test ! -e no_backup/v12-evidence/garmin-arm.properties && { test ! -d databases || test -z "$(find databases -maxdepth 1 -type f -name 'v12-production-garmin-${runNonce}*' -print -quit)"; }${requireSession ? ' && test -f no_backup/garmin-session/garmin-di-session.bin' : ''}`;
    try { cleanupShell('run-as', PACKAGE, 'sh', '-c', commandText); }
    catch {
      try { cleanupShell('run-as', PACKAGE, 'rm', '-f', 'no_backup/v12-evidence/garmin-arm.properties', 'no_backup/v12-evidence/.garmin-arm.tmp'); } catch { /* bounded failure below */ }
      fail('garmin_cleanup_failed');
    }
  }
  function garminPrivacy(processIds) {
    if (!Array.isArray(processIds) || processIds.length !== 2 || new Set(processIds).size !== 2
      || processIds.some(value => !Number.isSafeInteger(value) || value <= 0)) fail('garmin_privacy_failed');
    const retained = processIds.flatMap(processId => adb('logcat', '-d', '--pid', String(processId), '-v', 'raw', 'ReactNativeJS:I', '*:S').split(/\r?\n/u));
    const bytes = Buffer.byteLength(retained.join('\n'));
    if (bytes > 1024 * 1024 || retained.length > 2_048
      || /(?:authorization|bearer|credential|password|secret|@|\/Users\/|\/home\/|heart.?rate|latitude|longitude|filename)/iu.test(retained.join('\n'))) fail('garmin_privacy_failed');
    return Object.freeze({ lines: retained.length, bytes, digest: hash(retained.join('\n')) });
  }
  function settings() {
    return Object.fromEntries(Object.entries(SETTINGS).map(([key, ns]) => {
      const value = shell('settings', 'get', ns, key);
      if (!/^(?:null|\d+(?:\.\d+)?)$/u.test(value)) fail('settings_invalid');
      return [key, value];
    }));
  }
  async function restoreAround(operation) {
    const prior = settings();
    const airplane = shell('cmd', 'connectivity', 'airplane-mode');
    if (!/^Airplane mode is (?:enabled|disabled)$/u.test(airplane)) fail('settings_invalid');
    try { return await operation(); }
    finally {
      let failed = false;
      // Restore the actual connectivity service, not only its settings database.
      try { cleanupShell('cmd', 'connectivity', 'airplane-mode', airplane.endsWith(' enabled') ? 'enable' : 'disable'); } catch { failed = true; }
      for (const [key, ns] of Object.entries(SETTINGS)) {
        try { cleanupShell('settings', prior[key] === 'null' ? 'delete' : 'put', ns, key, ...(prior[key] === 'null' ? [] : [prior[key]])); } catch { failed = true; }
      }
      for (const [key, ns] of Object.entries(SETTINGS)) {
        try { if (cleanupShell('settings', 'get', ns, key) !== prior[key]) failed = true; } catch { failed = true; }
      }
      try { if (cleanupShell('cmd', 'connectivity', 'airplane-mode') !== airplane) failed = true; } catch { failed = true; }
      if (failed) fail('settings_restore_failed');
    }
  }
  return { get nonce() { return nonce; }, renewNonce: () => { nonce = randomBytes(16).toString('hex'); return nonce; },
    shell, marker, maestro, recoveryMaestro, version, standalone, restoreAround, retained,
    garminArm, launchGarmin, garminCleanup, garminPrivacy,
    executionOrigin: executionTools.execution_origin,
    stop: () => cleanupShell('am', 'force-stop', PACKAGE),
    screenshot: () => command(executionTools.adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { binary: true }).stdout };
}

async function garmin(io, payload) {
  const nonces = [];
  io.shell('am', 'force-stop', PACKAGE);
  try {
    nonces.push(io.nonce);
    io.launchGarmin('preflight', io.garminArm('preflight', payload.lease));
    const preflight = await io.marker('garmin-preflight');
    if (!exact(preflight, ['schema_version', 'nonce', 'kind', 'session_sha256'])
      || preflight.schema_version !== 2 || !HASH.test(preflight.session_sha256 ?? '')) fail('garmin_preflight_invalid');
    const firstPid = Number(io.shell('pidof', PACKAGE));
    if (!Number.isSafeInteger(firstPid) || firstPid <= 0) fail('garmin_restart_invalid');
    io.stop(); io.garminCleanup(io.nonce, true);
    io.renewNonce(); nonces.push(io.nonce);
    io.launchGarmin('execute', io.garminArm('execute', payload.lease));
    const value = await io.marker('garmin');
    if (!exact(value, ['schema_version', 'nonce', 'kind', 'receipts', 'host_observations', 'cleanup']) || value.schema_version !== 2
      || !exact(value.cleanup, ['arm', 'databases_deleted']) || value.cleanup.arm !== 'cleared'
      || value.cleanup.databases_deleted !== 3) fail('garmin_result_invalid');
    const secondPid = Number(io.shell('pidof', PACKAGE));
    if (!Number.isSafeInteger(secondPid) || secondPid <= 0 || firstPid === secondPid) fail('garmin_restart_invalid');
    io.stop(); io.garminCleanup(io.nonce, true);
    const privacy = io.garminPrivacy([firstPid, secondPid]);
    const privacyReceipt = Object.freeze({ id: 'privacy', order: 17, code: 'privacy-observed', count: 6,
      receipt_sha256: hash(JSON.stringify({ ...privacy, preflight: preflight.session_sha256, firstPidChanged: firstPid !== secondPid })) });
    return Object.freeze({ ...garminCases({ receipts: value.receipts, host_observations: { ...value.host_observations,
      restart: { process_changed: firstPid !== secondPid, session_consistent: value.host_observations?.lifecycle?.before_sha256 === preflight.session_sha256 } } }, privacyReceipt),
    execution_origin: io.executionOrigin });
  } finally {
    try { io.stop(); } finally { for (const runNonce of nonces) io.garminCleanup(runNonce, false); }
  }
}

async function calendar(io, root, payload) {
  const flow = 'maestro/v1.2/calendar.yaml';
  // This deliberately matches v12-calendar-shard's JSON-encoded Buffer digest.
  const flowSha = hash(JSON.stringify(readFileSync(path.join(root, flow))));
  if (payload.flow_sha256 !== flowSha || payload.flow_revision !== 'calendar-flow-r35') fail('calendar_flow_invalid');
  io.version(); const stages = []; const junit = [];
  for (const [order, id] of V12_CALENDAR_SHARD_STAGE_IDS.entries()) {
    const status = io.maestro(flow, { PHASE16_CALENDAR_STAGE: id, PHASE16_CALENDAR_FIXTURE_ID: 'synthetic-calendar-v1', V12_DOMAIN_FLOW_SHA256: flowSha, V12_DOMAIN_FLOW_REVISION: payload.flow_revision }, order);
    const value = await io.marker('calendar', (entry) => entry.stage?.id === id);
    if (!exact(value, ['schema_version', 'nonce', 'kind', 'flow_sha256', 'flow_revision', 'stage']) || value.flow_sha256 !== flowSha || value.flow_revision !== payload.flow_revision) fail('calendar_flow_invalid');
    const receipt = value.stage?.receipt;
    if (!exact(receipt, ['content_width_dp', 'start_dp', 'end_dp', 'dx_dp', 'dy_dp', 'event_sequence', 'cancelled', 'settled', 'callback_count', 'semantic_transition', 'expected_outcome'])) fail('calendar_receipt_invalid');
    const png = io.screenshot();
    if (png.length < 33 || !png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      || png.toString('ascii', 12, 16) !== 'IHDR' || png.readUInt32BE(16) < 1 || png.readUInt32BE(20) < 1) fail('calendar_screenshot_invalid');
    const stage = calendarStage({ ...value.stage, receipt: { ...receipt, screenshot_sha256: hash(png), trace_sha256: hash(JSON.stringify(value.stage.samples)) } }, id, order);
    writeFileSync(path.join(io.retained(), `${order}.png`), png, { flag: 'wx', mode: 0o600 });
    writeFileSync(path.join(io.retained(), `${order}.trace.json`), JSON.stringify(stage.samples), { flag: 'wx', mode: 0o600 });
    stage.status = worse(status, stage.status);
    stages.push(stage); junit.push({ id, order, status: stage.status });
  }
  if (!stages.some((s) => s.samples.some((v) => v.intentOwner === 'horizontal' && Math.abs(Math.abs(v.dxDp) / v.widthDp - 0.25) < 0.0001))) fail('calendar_boundary_missing');
  return { flow_sha256: flowSha, flow_revision: payload.flow_revision, stages, junit_cases: junit };
}

function recoverySnapshot(value) {
  if (!exact(value, RECOVERY_SNAPSHOT_KEYS)) fail('recovery_receipt_invalid');
  for (const key of RECOVERY_SNAPSHOT_KEYS.filter((key) => key.endsWith('_count'))) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) fail('recovery_receipt_invalid');
  }
  for (const key of RECOVERY_SNAPSHOT_KEYS.filter((key) => key.endsWith('_sha256'))) {
    if (!HASH.test(value[key] ?? '')) fail('recovery_receipt_invalid');
  }
  for (const [key, count] of [
    ['command_receipt_facts', 'receipt_count'],
    ['effect_facts', 'effect_count'], ['pointer_facts', 'pointer_count'],
    ['rest_facts', 'rest_count'], ['timing_facts', 'timing_count'],
    ['history_facts', 'history_count'], ['restore_facts', 'restore_count'],
    ['merge_receipt_facts', 'merge_receipt_count'],
  ]) if (!Array.isArray(value[key]) || value[key].length !== value[count]) fail('recovery_receipt_invalid');
  for (const fact of value.command_receipt_facts) {
    if (!exact(fact, ['step_id', 'boundary_id', 'kind', 'receipt_sha256', 'request_sha256', 'committed_at_ms', 'result'])
      || ![fact.receipt_sha256, fact.request_sha256].every((entry) => HASH.test(entry ?? ''))) fail('recovery_receipt_invalid');
  }
  for (const fact of value.pointer_facts) {
    if (!exact(fact, ['session_sha256', 'status', 'revision', 'active_exercise_sha256', 'active_set_exercise_sha256', 'active_set_sha256', 'active_set_ordinal', 'committed_set_exercise_sha256', 'committed_set_sha256', 'committed_set_ordinal', 'transition_sha256'])
      || !HASH.test(fact.session_sha256)
      || ['active_exercise_sha256', 'active_set_exercise_sha256', 'active_set_sha256', 'committed_set_exercise_sha256', 'committed_set_sha256', 'transition_sha256'].some((key) => fact[key] !== null && !HASH.test(fact[key]))) fail('recovery_receipt_invalid');
  }
  for (const fact of value.rest_facts) {
    if (!exact(fact, ['session_sha256', 'status', 'revision', 'started_at_ms', 'ends_at_ms', 'deadline_at_ms', 'paused_remaining_ms', 'expired_at_ms', 'next_set_exercise_sha256', 'next_set_sha256', 'next_set_ordinal', 'transition_sha256'])
      || !HASH.test(fact.session_sha256) || ['next_set_exercise_sha256', 'next_set_sha256', 'transition_sha256'].some((key) => fact[key] !== null && !HASH.test(fact[key]))
      || fact.deadline_at_ms !== fact.ends_at_ms) fail('recovery_receipt_invalid');
  }
  for (const fact of value.timing_facts) {
    if (!exact(fact, ['session_sha256', 'set_sha256', 'state_version', 'revision', 'status', 'mode', 'configuration', 'progress', 'started_at_ms', 'next_boundary_at_ms', 'remaining_ms', 'stopped_at_ms'])
      || !HASH.test(fact.session_sha256) || (fact.set_sha256 !== null && !HASH.test(fact.set_sha256))
      || !exact(fact.configuration, Object.keys(fact.configuration)) || !exact(fact.progress, Object.keys(fact.progress))) fail('recovery_receipt_invalid');
  }
  for (const fact of value.history_facts) {
    if (!exact(fact, ['event_sha256', 'session_sha256', 'effective_revision', 'event_type', 'field_identity', 'before_sha256', 'after_sha256', 'occurred_at_ms'])
      || ![fact.event_sha256, fact.session_sha256, fact.before_sha256, fact.after_sha256].every((entry) => HASH.test(entry ?? ''))
      || !/^[a-z0-9_]{3,80}$/u.test(fact.field_identity ?? '')) fail('recovery_receipt_invalid');
  }
  for (const fact of value.restore_facts) if (!exact(fact, ['state', 'updated_at_ms']) || !['ready', 'rebuild_pending'].includes(fact.state)) fail('recovery_receipt_invalid');
  for (const fact of value.merge_receipt_facts) {
    if (!exact(fact, ['table', 'receipt_sha256', 'request_sha256', 'idempotency_sha256', 'committed_at_ms', 'result'])
      || ![fact.receipt_sha256, fact.request_sha256, fact.idempotency_sha256].every((entry) => HASH.test(entry ?? ''))) fail('recovery_receipt_invalid');
  }
  return value;
}

function deriveArmedObservation(value, nonce, caseId, stepId, cutId) {
  const scenario = RECOVERY_SCENARIOS[caseId]; const cut = RECOVERY_CUTS[cutId];
  const step = scenario?.steps.find(({ id }) => id === stepId);
  if (!scenario || !step || !cut || !exact(value, ['schema_version', 'nonce', 'sequence', 'kind', 'case_id', 'step_id', 'cut_id', 'operation_id', 'boundary_id', 'receipt_kind', 'barrier_id', 'process_state', 'acknowledgement', 'connectivity', 'first_attempt', 'provenance', 'first_attempt_code', 'before', 'after_cut'])
    || value.schema_version !== 2 || value.nonce !== nonce || value.sequence !== 1 || value.kind !== 'ARMED'
    || value.case_id !== caseId || value.step_id !== stepId || value.cut_id !== cutId || value.operation_id !== step.operation_id
    || value.boundary_id !== step.boundary_id || value.receipt_kind !== step.receipt_kind || value.provenance !== cut.provenance
    || ['barrier_id', 'process_state', 'acknowledgement', 'connectivity', 'first_attempt'].some((key) => value[key] !== cut[key])
    || !/^[a-z0-9-]{3,60}$/u.test(value.first_attempt_code ?? '')) fail('recovery_receipt_invalid');
  return Object.freeze({ ...value, before: recoverySnapshot(value.before), after_cut: recoverySnapshot(value.after_cut) });
}

function deriveRecoveryObservation(value, nonce, caseId, stepId, cutId, armed) {
  const scenario = RECOVERY_SCENARIOS[caseId]; const step = scenario?.steps.find(({ id }) => id === stepId);
  if (!scenario || !step || !exact(value, ['schema_version', 'nonce', 'kind', 'case_id', 'step_id', 'cut_id', 'operation_id', 'boundary_id', 'receipt_kind', 'after_reopen', 'recovery_code', 'after_recovery', 'retry_code', 'after_retry'])
    || value.schema_version !== 2 || value.nonce !== nonce || value.kind !== 'recovery'
    || value.case_id !== caseId || value.step_id !== stepId || value.cut_id !== cutId || value.operation_id !== step.operation_id
    || value.boundary_id !== step.boundary_id || value.receipt_kind !== step.receipt_kind
    || ![value.recovery_code, value.retry_code].every((code) => /^[a-z0-9-]{3,60}$/u.test(code ?? ''))) fail('recovery_receipt_invalid');
  const afterReopen = recoverySnapshot(value.after_reopen);
  const afterRecovery = recoverySnapshot(value.after_recovery);
  const afterRetry = recoverySnapshot(value.after_retry);
  const committed = !RECOVERY_UNCOMMITTED_CUTS.has(cutId);
  if (JSON.stringify(afterReopen) !== JSON.stringify(committed ? armed.after_cut : armed.before)) fail('recovery_receipt_invalid');
  if (cutId !== 'recovery' && JSON.stringify(afterRecovery) !== JSON.stringify(afterReopen)) fail('recovery_receipt_invalid');
  if (cutId === 'recovery' && value.recovery_code === 'not-required') fail('recovery_receipt_invalid');
  if (cutId === 'recovery' && JSON.stringify(afterRetry) !== JSON.stringify(afterRecovery)) fail('recovery_receipt_invalid');
  if (RECOVERY_COMMITTED_CUTS.has(cutId) && JSON.stringify(afterRetry) !== JSON.stringify(afterReopen)) fail('recovery_receipt_invalid');
  if (RECOVERY_UNCOMMITTED_CUTS.has(cutId) && afterRetry.receipt_count !== armed.before.receipt_count + 1) fail('recovery_receipt_invalid');
  if (cutId === 'recovery' && (afterRetry.receipt_count !== afterReopen.receipt_count
    || afterRetry.receipt_sha256 !== afterReopen.receipt_sha256
    || JSON.stringify(afterRetry.command_receipt_facts) !== JSON.stringify(afterReopen.command_receipt_facts))) fail('recovery_receipt_invalid');
  const commandReceipts = afterRetry.command_receipt_facts.filter((fact) => fact.step_id === step.id
    && fact.boundary_id === step.boundary_id && fact.kind === step.receipt_kind);
  if (commandReceipts.length !== 1) fail('recovery_receipt_invalid');
  if (afterRetry.cue_count !== 0 || afterRetry.restore_facts.length !== 1) fail('recovery_receipt_invalid');
  if (['legacy-edit', 'zero-cue-edit', 'zero-cue-finish'].includes(stepId)
    && (afterRetry.timing_count < 1 || afterRetry.history_count < 1)) fail('recovery_receipt_invalid');
  if (caseId === 'queued-callback' && afterRetry.effect_count < 1) fail('recovery_receipt_invalid');
  if (caseId === 'foreground-reconciliation' && afterRetry.rest_count < 1) fail('recovery_receipt_invalid');
  if (step.receipt_kind === 'garmin-import' && !afterRetry.merge_receipt_facts.some((fact) => fact.table === 'imported_activity_receipts')) fail('recovery_receipt_invalid');
  if (step.receipt_kind === 'activity-match' && !afterRetry.merge_receipt_facts.some((fact) => fact.table === 'running_activity_match_receipts')) fail('recovery_receipt_invalid');
  if (step.receipt_kind === 'secure-restore' && !afterRetry.restore_facts.some((fact) => fact.state === 'rebuild_pending')) fail('recovery_receipt_invalid');
  if (step.receipt_kind === 'secure-merge' && !afterRetry.merge_receipt_facts.some((fact) => fact.table === 'metric_profile_migration_events' && fact.result === 'metric-migrated')) fail('recovery_receipt_invalid');
  if (['restore', 'merge'].includes(caseId) && (afterRetry.pointer_facts.length < 1 || afterRetry.rest_facts.length < 1
    || afterRetry.timing_facts.length < 1 || afterRetry.history_facts.length < 1)) fail('recovery_receipt_invalid');
  if (caseId === 'between-set-rest-pointer') {
    const pointer = afterRetry.pointer_facts.find((fact) => HASH.test(fact.committed_set_sha256 ?? ''));
    const rest = pointer && afterRetry.rest_facts.find((fact) => fact.session_sha256 === pointer.session_sha256);
    if (!pointer || !rest || pointer.active_exercise_sha256 !== pointer.active_set_exercise_sha256
      || pointer.active_exercise_sha256 !== pointer.committed_set_exercise_sha256 || pointer.active_exercise_sha256 !== rest.next_set_exercise_sha256
      || pointer.active_set_sha256 !== rest.next_set_sha256 || pointer.transition_sha256 !== rest.transition_sha256
      || pointer.committed_set_ordinal + 1 !== pointer.active_set_ordinal || pointer.active_set_ordinal !== rest.next_set_ordinal) fail('recovery_receipt_invalid');
  }
  const receiptSha256 = hash(JSON.stringify({ armed, value }));
  return Object.freeze({
    step_id: stepId, boundary_id: value.boundary_id, receipt_kind: value.receipt_kind,
    cut_id: cutId, status: 'PASS', operation_id: value.operation_id,
    barrier: Object.freeze({ barrier_id: armed.barrier_id,
      process_state: armed.process_state, acknowledgement: armed.acknowledgement,
      connectivity: armed.connectivity, first_attempt: armed.first_attempt, provenance: armed.provenance }),
    first_attempt_code: armed.first_attempt_code, recovery_code: value.recovery_code,
    retry_code: value.retry_code, receipt_sha256: receiptSha256,
    snapshots: Object.freeze({ before: armed.before, after_cut: armed.after_cut,
      after_reopen: afterReopen, after_recovery: afterRecovery, after_retry: afterRetry }),
  });
}

async function recovery(io) {
  io.version(); const cases = []; const entries = []; const receipts = new Set();
  for (const [order, id] of V12_RECOVERY_CASE_IDS.entries()) {
    const cuts = [];
    const scenario = RECOVERY_SCENARIOS[id];
    for (const step of scenario.steps) {
      for (const cut of V12_RECOVERY_CUT_IDS) {
        io.renewNonce();
        io.shell('cmd', 'connectivity', 'airplane-mode', 'disable');
        const variables = { V12_RECOVERY_CASE: id, V12_RECOVERY_STEP: step.id, V12_RECOVERY_STAGE: cut };
        const armStatus = io.recoveryMaestro('maestro/v1.2/recovery.yaml', { ...variables, V12_RECOVERY_PHASE: 'arm' });
        const armed = deriveArmedObservation(await io.marker('ARMED'), io.nonce, id, step.id, cut);
        if (cut === 'offline') io.shell('cmd', 'connectivity', 'airplane-mode', 'enable');
        io.stop();
        let recoverStatus; let value;
        try {
          recoverStatus = io.recoveryMaestro('maestro/v1.2/recovery.yaml', { ...variables, V12_RECOVERY_PHASE: 'recover' });
          value = await io.marker('recovery');
        } finally { io.stop(); }
        const observed = deriveRecoveryObservation(value, io.nonce, id, step.id, cut, armed);
        const state = worse(worse(armStatus, recoverStatus), 'PASS');
        const rich = Object.freeze({ ...observed, status: state }); cuts.push(rich);
        if (receipts.has(rich.receipt_sha256)) fail('recovery_receipt_invalid'); receipts.add(rich.receipt_sha256);
        const snapshots = Object.fromEntries(Object.entries(rich.snapshots).map(([key, snapshot]) => [key, hash(JSON.stringify(snapshot))]));
        entries.push(`<testcase classname="v12.recovery" name="${id}:${step.id}:${cut}"><properties>`
          + `<property name="case_id" value="${id}"/><property name="step_id" value="${step.id}"/><property name="cut_id" value="${cut}"/>`
          + `<property name="operation_id" value="${rich.operation_id}"/><property name="boundary_id" value="${rich.boundary_id}"/><property name="receipt_kind" value="${rich.receipt_kind}"/>`
          + `<property name="barrier_id" value="${rich.barrier.barrier_id}"/><property name="barrier_provenance" value="${rich.barrier.provenance}"/><property name="process_state" value="${rich.barrier.process_state}"/>`
          + `<property name="acknowledgement" value="${rich.barrier.acknowledgement}"/><property name="connectivity" value="${rich.barrier.connectivity}"/>`
          + `<property name="first_attempt" value="${rich.barrier.first_attempt}"/><property name="first_attempt_code" value="${rich.first_attempt_code}"/>`
          + `<property name="recovery_code" value="${rich.recovery_code}"/><property name="retry_code" value="${rich.retry_code}"/>`
          + `<property name="receipt_sha256" value="${rich.receipt_sha256}"/>`
          + Object.entries(snapshots).map(([key, digest]) => `<property name="${key}_sha256" value="${digest}"/>`).join('')
          + `<property name="state" value="${state}"/></properties>`
          + `${state === 'FAIL' ? '<failure message="observed failure"/>' : state === 'PASS' ? '' : '<skipped message="observation incomplete"/>'}</testcase>`);
      }
    }
    const status = cuts.some((cut) => cut.status === 'FAIL') ? 'FAIL' : cuts.some((cut) => cut.status === 'NOT_RUN') ? 'NOT_RUN' : cuts.some((cut) => cut.status === 'REVIEW_REQUIRED') ? 'REVIEW_REQUIRED' : 'PASS';
    cases.push(Object.freeze({ id, order, steps: scenario.steps, status, cuts: Object.freeze(cuts) }));
  }
  if (receipts.size !== entries.length || entries.length !== 112) fail('recovery_receipt_invalid');
  const junit = `<?xml version="1.0" encoding="UTF-8"?><testsuite name="v12-recovery" tests="112">${entries.join('')}</testsuite>\n`;
  return Object.freeze({ schema_version: 2, producer: 'v12-production-recovery-host', cases: Object.freeze(cases), junit_xml: junit });
}

/** Launcher integration: await executeProductionDomainAction(action, payload, attestation).
 * Unknown actions return undefined. No injected runtime, command, result, or test
 * mode is accepted. Throws bounded launcher errors; never publishes a verdict.
 */
export async function executeProductionDomainAction(action, payload, attestation) {
  if (!['garmin', 'calendar', 'recovery'].includes(action)) return undefined;
  try {
    const root = process.cwd(); validate(action, payload, attestation, root);
    const executionTools = resolveV12NativeExecutionTools({ domain: true });
    const runtime = createProductionNativeRuntime(attestation, { root, executionTools });
    const owned = payload.lease === undefined;
    const lease = owned ? runtime.acquireLease() : payload.lease;
    let settings; let restoreFailed = false;
    try {
      if (owned) settings = runtime.snapshotSettings(lease);
      const leasedPayload = { ...payload, lease };
      return await runtime.withLease(leasedPayload, async () => {
        const io = session(root, attestation, action, executionTools);
        io.standalone();
        try {
          return await io.restoreAround(() => action === 'garmin' ? garmin(io, leasedPayload) : action === 'calendar' ? calendar(io, root, payload) : recovery(io));
        } catch (error) {
          restoreFailed = error?.message === 'v12_production_native_launcher_settings_restore_failed';
          throw error;
        }
      });
    } finally {
      // Keep the lease and its persisted snapshot if connectivity restoration
      // failed, even when the settings database happened to match the snapshot.
      if (owned && !restoreFailed) {
        if (settings) runtime.restoreSettings(settings, lease);
        runtime.releaseLease(lease);
      }
    }
  } catch (error) {
    if (error instanceof Error && /^v12_production_native_launcher_[a-z_]+$/u.test(error.message)) throw error;
    fail('domain_failed');
  }
}

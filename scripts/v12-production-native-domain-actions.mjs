import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createProductionNativeRuntime } from './v12-production-native-runtime.mjs';
import { V12_RECOVERY_CASE_IDS, V12_RECOVERY_CUT_IDS } from './v12-recovery-shard.mjs';
import { exact, fail, garminCases, hash, HASH, junitOutcome, worse } from './v12-production-domain-receipts.mjs';
import { executeProductionCalendarAction } from './v12-production-native-calendar-action.mjs';

const PACKAGE = 'com.fchoo.gymtracker.devtest';
const RESULT = 'GYM_TRACKER_V12_DOMAIN_RESULT:';
const PROGRESS = 'GYM_TRACKER_V12_DOMAIN_PROGRESS:';
const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const SETTINGS = { font_scale: 'system', accelerometer_rotation: 'system', user_rotation: 'system', window_animation_scale: 'global', transition_animation_scale: 'global', animator_duration_scale: 'global', airplane_mode_on: 'global' };
const ATTESTATION = ['schema_version', 'action', 'launcher_source_sha256', 'run_id', 'build_profile', 'suite', 'source_tree_sha256', 'apk_sha256', 'installed_apk_sha256', 'apk_signature_sha256', 'device_identity_sha256', 'package'];

function validate(action, payload, a, root) {
  if (!exact(a, ATTESTATION) || a.schema_version !== 1 || a.action !== action || a.build_profile !== 'development-test'
    || a.suite !== 'v1.2-acceptance' || a.package !== PACKAGE || !/^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(a.run_id ?? '')
    || !ATTESTATION.filter((key) => key.endsWith('sha256')).every((key) => HASH.test(a[key] ?? ''))
    || a.launcher_source_sha256 !== hash(readFileSync(path.join(root, 'scripts/v12-production-native-adapter-launcher.mjs')))) fail('attestation_invalid');
  const allowed = ['run_id', 'lease', 'settings', ...(action === 'calendar' ? ['flow_sha256', 'flow_revision'] : [])];
  if (!payload || Array.isArray(payload) || payload.run_id !== a.run_id || Object.keys(payload).some((key) => !allowed.includes(key))) fail('request_invalid');
  if (process.env.NODE_ENV === 'test' || process.env.V12_NATIVE_ADAPTER_TEST_MODE !== undefined || process.env.V12_NATIVE_ADAPTER_TEST_PROCESS !== undefined || process.env.V12_NATIVE_ADAPTER_COMMAND !== undefined) fail('test_environment_forbidden');
}

function session(root, a) {
  const serial = process.env.V12_DEVICE_SERIAL;
  let nonce = randomBytes(16).toString('hex');
  // The current launcher grants domain actions five minutes. Leave two minutes
  // for cleanup; do not silently outlive its hard process timeout.
  const deadline = Date.now() + 3 * 60_000;
  const command = (exe, args, { timeout = 20_000, binary = false, acceptFailure = false, cleanup = false } = {}) => {
    if (!cleanup && Date.now() >= deadline) fail('domain_timeout');
    const result = spawnSync(exe, args, { cwd: root, encoding: binary ? undefined : 'utf8', timeout: cleanup ? timeout : Math.min(timeout, Math.max(1, deadline - Date.now())), maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.error || result.signal || (!acceptFailure && result.status !== 0)) fail('native_prerequisite_failed');
    return result;
  };
  const adb = (...args) => command('adb', ['-s', serial, ...args]).stdout.trim();
  const shell = (...args) => adb('shell', args.map(quote).join(' '));
  const cleanupShell = (...args) => command('adb', ['-s', serial, 'shell', args.map(quote).join(' ')], { cleanup: true }).stdout.trim();
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
    while (Date.now() - start < 180_000) {
      const logs = adb('logcat', '-d', '-v', 'raw', 'ReactNativeJS:I', '*:S');
      const found = [];
      for (const line of logs.split(/\r?\n/u)) {
        for (const prefix of [RESULT, PROGRESS]) {
          const index = line.indexOf(prefix); if (index < 0) continue;
          let value; try { value = JSON.parse(line.slice(index + prefix.length)); } catch { continue; }
          if (value?.nonce !== nonce) continue;
          if (value.schema_version !== 1) fail('marker_invalid');
          if (prefix === PROGRESS) {
            if (!exact(value, ['schema_version', 'nonce', 'sequence']) || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || value.sequence > 256) fail('marker_invalid');
            if (value.sequence > sequence) { sequence = value.sequence; progressed = Date.now(); }
          } else if (value.kind === 'error') {
            if (!exact(value, ['schema_version', 'nonce', 'kind', 'code'])) fail('marker_invalid');
            fail(value.code === 'auth_required' ? 'auth_required' : 'domain_native_failed');
          } else if (value.kind === kind && predicate(value)) found.push(value);
        }
      }
      // Re-reading logcat must not count the same progress as new work.
      if (found.length > 1) fail('marker_duplicate');
      if (found.length === 1) return found[0];
      if (Date.now() - progressed >= 30_000) fail('marker_timeout');
      await delay(250);
    }
    fail('marker_timeout');
  }
  function maestro(flow, variables, index) {
    nonce = randomBytes(16).toString('hex');
    const report = path.join(retained(), `${index}.xml`);
    const result = command('maestro', ['test', '--device', serial, ...Object.entries({ V12_DOMAIN_NONCE: nonce, ...variables }).flatMap(([key, value]) => ['-e', `${key}=${value}`]), '--format', 'junit', '--output', report, path.join(root, flow)], { timeout: 180_000, acceptFailure: true });
    let xml; try { xml = readFileSync(report, 'utf8'); chmodSync(report, 0o600); } catch { fail('junit_missing'); }
    return junitOutcome(xml, result.status);
  }
  function version() { if (command('maestro', ['--version']).stdout.trim() !== '2.8.0') fail('maestro_version_invalid'); }
  function standalone() {
    // withLease has already checked this manifest path and the retained APK hash.
    const manifest = JSON.parse(readFileSync(path.join(root, 'artifacts/native/v1.2', a.run_id, 'build.json'), 'utf8'));
    const apk = path.join(root, manifest.build.apk.path);
    const entries = command('unzip', ['-Z1', apk]).stdout.split(/\r?\n/u);
    if (['assets/index.android.bundle', 'assets/app.config'].some((name) => entries.filter((entry) => entry === name).length !== 1)) fail('standalone_required');
    let config; try { config = JSON.parse(command('unzip', ['-p', apk, 'assets/app.config']).stdout); } catch { fail('standalone_required'); }
    if (config?.android?.package !== PACKAGE || config?.scheme !== 'gymtracker-devtest'
      || config?.extra?.buildProfile !== 'development-test' || config?.extra?.nativeContractsEnabled !== true
      || config?.extra?.nativeContractSuite !== 'v1.2-acceptance') fail('standalone_required');
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
  return { get nonce() { return nonce; }, shell, marker, maestro, version, standalone, restoreAround, retained,
    stop: () => cleanupShell('am', 'force-stop', PACKAGE),
    screenshot: () => command('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { binary: true }).stdout };
}

async function garmin(io) {
  io.shell('am', 'force-stop', PACKAGE);
  io.shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `gymtracker-devtest://__v12-production-garmin?nonce=${io.nonce}&confirmation=VERIFY-V12-DOMAIN`, PACKAGE);
  try {
    const value = await io.marker('garmin');
    if (!exact(value, ['schema_version', 'nonce', 'kind', 'cases'])) fail('garmin_result_invalid');
    return garminCases({ cases: value.cases });
  } finally { io.stop(); }
}

async function recovery(io) {
  io.version(); const entries = [];
  for (const id of V12_RECOVERY_CASE_IDS) {
    for (const cut of V12_RECOVERY_CUT_IDS) {
      io.shell('cmd', 'connectivity', 'airplane-mode', cut === 'offline' ? 'enable' : 'disable');
      const status = io.maestro('maestro/v1.2/recovery.yaml', { V12_RECOVERY_CASE: id, V12_RECOVERY_STAGE: cut }, entries.length);
      const value = await io.marker('recovery');
      if (!exact(value, ['schema_version', 'nonce', 'kind', 'case_id', 'cut_id', 'receipt_sha256', 'status'])
        || value.case_id !== id || value.cut_id !== cut || !HASH.test(value.receipt_sha256 ?? '') || !['PASS', 'FAIL', 'NOT_RUN', 'REVIEW_REQUIRED'].includes(value.status)) fail('recovery_receipt_invalid');
      const state = worse(status, value.status);
      entries.push(`<testcase classname="v12.recovery" name="${id}:${cut}"><properties><property name="case_id" value="${id}"/><property name="cut_id" value="${cut}"/><property name="receipt_sha256" value="${value.receipt_sha256}"/><property name="state" value="${state}"/></properties>${state === 'FAIL' ? '<failure message="observed failure"/>' : state === 'PASS' ? '' : '<skipped message="observation incomplete"/>'}</testcase>`);
    }
  }
  // Native receipts annotate retained Maestro outcomes. Private diagnostic text
  // stays in mode-0600 local reports and is never copied to the launcher protocol.
  const xml = `<?xml version="1.0" encoding="UTF-8"?><testsuite name="v12-recovery" tests="64">${entries.join('')}</testsuite>\n`;
  writeFileSync(path.join(io.retained(), 'recovery.xml'), xml, { flag: 'wx', mode: 0o600 });
  return xml;
}

/** Launcher integration: await executeProductionDomainAction(action, payload, attestation).
 * Unknown actions return undefined. No injected runtime, command, result, or test
 * mode is accepted. Throws bounded launcher errors; never publishes a verdict.
 */
export async function executeProductionDomainAction(action, payload, attestation) {
  if (!['garmin', 'calendar', 'recovery'].includes(action)) return undefined;
  if (action === 'calendar') return executeProductionCalendarAction(payload, attestation);
  try {
    const root = process.cwd(); validate(action, payload, attestation, root);
    const runtime = createProductionNativeRuntime(attestation, { root });
    const owned = payload.lease === undefined;
    const lease = owned ? runtime.acquireLease() : payload.lease;
    let settings; let restoreFailed = false;
    try {
      if (owned) settings = runtime.snapshotSettings(lease);
      return await runtime.withLease({ ...payload, lease }, async () => {
        const io = session(root, attestation);
        io.standalone();
        try {
          return await io.restoreAround(() => action === 'garmin' ? garmin(io) : recovery(io));
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

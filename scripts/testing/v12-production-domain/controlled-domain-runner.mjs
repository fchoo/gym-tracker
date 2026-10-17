// Controlled command transport, not native acceptance evidence. The child runs
// the production module under NODE_ENV=production with no adapter override.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createControlledRunner } from '../v12-production-launcher/controlled-runner.mjs';
import { sourceTreeSha256 } from '../../source-tree-digest.mjs';
import { V12_CALENDAR_SHARD_STAGE_IDS } from '../../v12-calendar-shard.mjs';
import { V12_GARMIN_SHARD_CASE_IDS } from '../../v12-garmin-shard.mjs';

const project = fileURLToPath(new URL('../../../', import.meta.url));
export const hash = (value) => createHash('sha256').update(value).digest('hex');
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const controlledActionTimeoutMs = (action) => action === 'recovery' ? 5 * 60_000 : 100_000;

export function createDomainRunner() {
  const runner = createControlledRunner();
  mkdirSync(path.join(runner.root, 'maestro/v1.2'), { recursive: true });
  for (const name of ['calendar', 'recovery']) cpSync(path.join(project, 'maestro/v1.2', `${name}.yaml`), path.join(runner.root, 'maestro/v1.2', `${name}.yaml`));
  const digest = sourceTreeSha256(runner.root);
  runner.build.source.tree_sha256 = digest;
  writeFileSync(runner.manifestPath, JSON.stringify(runner.build));
  const bin = path.join(runner.scratch, 'bin');
  const tool = path.join(runner.root, 'scripts/testing/v12-production-domain/controlled-domain-tool.mjs');
  for (const name of ['adb', 'maestro', 'unzip']) writeFileSync(path.join(bin, name), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(tool)} ${name} "$@"\n`, { mode: 0o755 });
  const flow = hash(JSON.stringify(readFileSync(path.join(runner.root, 'maestro/v1.2/calendar.yaml'))));
  const sample = (timestampMs) => ({ timestampMs, widthDp: 400, dxDp: 100, dyDp: 0, intentOwner: 'horizontal', translationDp: 100, title: 'October 2026', selectedCivilDate: '2026-10-15', generation: 1, focusedWeek: '2026-10-12', rowBounds: [100, 150], callbackCount: 1, focusIdentity: 'calendar', motion: 'normal' });
  runner.updateState({
    domainCalls: [],
    garmin: {
      receipts: V12_GARMIN_SHARD_CASE_IDS.slice(0, -1).map((id, order) => ({
        id, order, code: `${id}-observed`,
        count: { 'bridge-allowlist': 2, 'account-lifecycle': 5, recovery: 20, 'match-zero': 0, 'match-many': 2, 'match-alternate': 2, 'match-cancel': 0 }[id] ?? 1,
        receipt_sha256: hash(`garmin:${id}`),
      })),
      host_observations: {
        bridge: { evidence_source: 'installed-chaquopy', operations: ['connectionState', 'login', 'resumeMfa', 'restoreSession', 'logout', 'getActivities', 'getActivity', 'getActivitySplits', 'getActivityDetails', 'forceRefreshForTest', 'runAdversarialSuite'], operation_rejection: 'operation_rejected', arguments_rejection: 'arguments_rejected' },
        lifecycle: { restore: 'connected', refresh: 'connected', cold_restore: 'connected', logout: 'disconnected', restored: 'connected', rotation: 'rotated', restart: 'same-account', storage: 'no-backup-encrypted', before_sha256: hash('controlled-session'), refreshed_sha256: hash('controlled-refreshed'), restored_sha256: hash('controlled-restored') },
        recovery: [
          ['PH18-ADV-RESTORE', 'completed'], ['PH18-ADV-REFRESH', 'completed'], ['PH18-ADV-READ', 'completed'], ['PH18-ADV-LOGOUT', 'completed'], ['PH18-ADV-RESTART', 'sign_in_required'], ['PH18-ADV-LATE-GENERATION', 'stale_generation'],
          ['PH18-ADV-EXPIRED', 'sign_in_required'], ['PH18-ADV-401', 'sign_in_required'], ['PH18-ADV-403', 'data_access_denied'], ['PH18-ADV-429', 'rate_limited'], ['PH18-ADV-OFFLINE', 'offline'], ['PH18-ADV-TIMEOUT', 'timeout'],
          ['PH18-ADV-5XX', 'temporary_failure'], ['PH18-ADV-MALFORMED', 'malformed_response'], ['PH18-ADV-TRUNCATED', 'malformed_response'], ['PH18-ADV-OVERSIZED', 'malformed_response'], ['PH18-ADV-UNSUPPORTED-JSON', 'malformed_response'],
          ['PH18-ADV-MISSING-COMPONENT', 'malformed_response'], ['PH18-ADV-PARTIAL-PAGE', 'temporary_failure'], ['PH18-ADV-ROTATION', 'stale_generation'],
        ].map(([id, code], order) => ({ id, code, call_count: [1, 1, 4, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 4, 1, 5, 3, 5, 3][order], automatic_retry_count: 0, retry_after_ms: id === 'PH18-ADV-429' ? 900_000 : 0 })),
      },
    },
    processCounter: 1000,
    calendar: V12_CALENDAR_SHARD_STAGE_IDS.map((id, order) => ({ id, order, status: 'PASS', samples: [sample(1), sample(2)], receipt: { content_width_dp: 400, start_dp: [0, 10], end_dp: [100, 10], dx_dp: 100, dy_dp: 0, event_sequence: ['pointer-down', 'pointer-move', 'pointer-up'], cancelled: false, settled: true, callback_count: 1, semantic_transition: { pre: 'month', during: 'drag', post: 'month' }, screenshot_sha256: hash('controlled-png'), trace_sha256: hash(JSON.stringify([sample(1), sample(2)])), expected_outcome: id } })),
    flow,
  });
  const testToolEnvironment = {
    V12_EXECUTION_ORIGIN: 'test-controlled/v1',
    V12_ADB_PATH: path.join(bin, 'adb'),
    V12_MAESTRO_PATH: path.join(bin, 'maestro'),
    V12_UNZIP_PATH: path.join(bin, 'unzip'),
  };
  function invoke(action, payload = {}, changes = {}, environment = {}) {
    const build = runner.build;
    const attestation = { schema_version: 1, action, launcher_source_sha256: hash(readFileSync(path.join(runner.root, 'scripts/v12-production-native-adapter-launcher.mjs'))), run_id: build.run_id, build_profile: 'development-test', suite: 'v1.2-acceptance', source_tree_sha256: digest, apk_sha256: build.build.apk.sha256, installed_apk_sha256: build.device.installed_apk_sha256, apk_signature_sha256: build.build.apk.signature_sha256, device_identity_sha256: build.device.identity_sha256, package: build.build.package, ...changes };
    const input = { action, payload: { run_id: build.run_id, ...(action === 'calendar' ? { flow_sha256: flow, flow_revision: 'calendar-flow-r35' } : {}), ...payload }, attestation };
    const program = `import fs from 'node:fs'; import {executeProductionDomainAction} from './scripts/v12-production-native-domain-actions.mjs'; const r=JSON.parse(fs.readFileSync(0,'utf8')); try {const result=await executeProductionDomainAction(r.action,r.payload,r.attestation);process.stdout.write(JSON.stringify({result:result??null,node_env:process.env.NODE_ENV,native_evidence:false}));} catch(e) {process.stderr.write(e.message);process.exitCode=1;}`;
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, V12_DEVICE_SERIAL: 'controlled-device-20', V12_CONTROLLED_STATE: runner.scratch, NODE_ENV: 'production', ...testToolEnvironment, ...environment };
    for (const name of ['V12_NATIVE_ADAPTER_COMMAND', 'V12_NATIVE_ADAPTER_TEST_MODE', 'V12_NATIVE_ADAPTER_TEST_PROCESS', 'NODE_TEST_CONTEXT']) delete env[name];
    return spawnSync(process.execPath, ['--input-type=module', '--eval', program], { cwd: runner.root, env, input: JSON.stringify(input), encoding: 'utf8', timeout: controlledActionTimeoutMs(action), maxBuffer: 4 * 1024 * 1024 });
  }
  function invokeDefault(action, payload = {}, environment = {}) {
    const input = { action, payload: { run_id: runner.build.run_id, ...payload } };
    const program = `import fs from 'node:fs'; import {invokeV12NativeAdapter} from './scripts/v12-native-adapter.mjs'; const r=JSON.parse(fs.readFileSync(0,'utf8')); try {const result=invokeV12NativeAdapter(r.action,r.payload);process.stdout.write(JSON.stringify({result,node_env:process.env.NODE_ENV,native_evidence:false}));} catch(e) {process.stderr.write(e.message);process.exitCode=1;}`;
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, V12_DEVICE_SERIAL: 'controlled-device-20', V12_CONTROLLED_STATE: runner.scratch, NODE_ENV: 'production', ...testToolEnvironment, ...environment };
    for (const name of ['V12_NATIVE_ADAPTER_COMMAND', 'V12_NATIVE_ADAPTER_TEST_MODE', 'V12_NATIVE_ADAPTER_TEST_PROCESS', 'NODE_TEST_CONTEXT']) delete env[name];
    return spawnSync(process.execPath, ['--input-type=module', '--eval', program], { cwd: runner.root, env, input: JSON.stringify(input), encoding: 'utf8', timeout: controlledActionTimeoutMs(action), maxBuffer: 4 * 1024 * 1024 });
  }
  return { ...runner, invoke, invokeDefault, flow };
}

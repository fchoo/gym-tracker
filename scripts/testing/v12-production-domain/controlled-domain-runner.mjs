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
    garmin: { cases: V12_GARMIN_SHARD_CASE_IDS.map((id, order) => ({ id, order, status: 'PASS', code: 'observed', count: 1 })) },
    calendar: V12_CALENDAR_SHARD_STAGE_IDS.map((id, order) => ({ id, order, status: 'PASS', samples: [sample(1), sample(2)], receipt: { content_width_dp: 400, start_dp: [0, 10], end_dp: [100, 10], dx_dp: 100, dy_dp: 0, event_sequence: ['pointer-down', 'pointer-move', 'pointer-up'], cancelled: false, settled: true, callback_count: 1, semantic_transition: { pre: 'month', during: 'drag', post: 'month' }, screenshot_sha256: hash('controlled-png'), trace_sha256: hash(JSON.stringify([sample(1), sample(2)])), expected_outcome: id } })),
    flow,
  });
  function invoke(action, payload = {}, changes = {}, environment = {}) {
    const build = runner.build;
    const attestation = { schema_version: 1, action, launcher_source_sha256: hash(readFileSync(path.join(runner.root, 'scripts/v12-production-native-adapter-launcher.mjs'))), run_id: build.run_id, build_profile: 'development-test', suite: 'v1.2-acceptance', source_tree_sha256: digest, apk_sha256: build.build.apk.sha256, installed_apk_sha256: build.device.installed_apk_sha256, apk_signature_sha256: build.build.apk.signature_sha256, device_identity_sha256: build.device.identity_sha256, package: build.build.package, ...changes };
    const input = { action, payload: { run_id: build.run_id, ...(action === 'calendar' ? { flow_sha256: flow, flow_revision: 'calendar-flow-r35' } : {}), ...payload }, attestation };
    const program = `import fs from 'node:fs'; import {executeProductionDomainAction} from './scripts/v12-production-native-domain-actions.mjs'; const r=JSON.parse(fs.readFileSync(0,'utf8')); try {const result=await executeProductionDomainAction(r.action,r.payload,r.attestation);process.stdout.write(JSON.stringify({result:result??null,node_env:process.env.NODE_ENV,native_evidence:false}));} catch(e) {process.stderr.write(e.message);process.exitCode=1;}`;
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, V12_DEVICE_SERIAL: 'controlled-device-20', V12_CONTROLLED_STATE: runner.scratch, NODE_ENV: 'production', ...environment };
    for (const name of ['V12_NATIVE_ADAPTER_COMMAND', 'V12_NATIVE_ADAPTER_TEST_MODE', 'V12_NATIVE_ADAPTER_TEST_PROCESS', 'NODE_TEST_CONTEXT']) delete env[name];
    return spawnSync(process.execPath, ['--input-type=module', '--eval', program], { cwd: runner.root, env, input: JSON.stringify(input), encoding: 'utf8', timeout: 100_000, maxBuffer: 4 * 1024 * 1024 });
  }
  function invokeDefault(action, payload = {}, environment = {}) {
    const input = { action, payload: { run_id: runner.build.run_id, ...payload } };
    const program = `import fs from 'node:fs'; import {invokeV12NativeAdapter} from './scripts/v12-native-adapter.mjs'; const r=JSON.parse(fs.readFileSync(0,'utf8')); try {const result=invokeV12NativeAdapter(r.action,r.payload);process.stdout.write(JSON.stringify({result,node_env:process.env.NODE_ENV,native_evidence:false}));} catch(e) {process.stderr.write(e.message);process.exitCode=1;}`;
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, V12_DEVICE_SERIAL: 'controlled-device-20', V12_CONTROLLED_STATE: runner.scratch, NODE_ENV: 'production', ...environment };
    for (const name of ['V12_NATIVE_ADAPTER_COMMAND', 'V12_NATIVE_ADAPTER_TEST_MODE', 'V12_NATIVE_ADAPTER_TEST_PROCESS', 'NODE_TEST_CONTEXT']) delete env[name];
    return spawnSync(process.execPath, ['--input-type=module', '--eval', program], { cwd: runner.root, env, input: JSON.stringify(input), encoding: 'utf8', timeout: 100_000, maxBuffer: 4 * 1024 * 1024 });
  }
  return { ...runner, invoke, invokeDefault, flow };
}

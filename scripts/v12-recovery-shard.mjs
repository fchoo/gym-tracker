import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { validateV12RunManifest } from './create-v12-run-manifest.mjs';
import { sourceTreeSha256 } from './source-tree-digest.mjs';
import { createV12NativeAdapter } from './v12-native-adapter.mjs';
import { publishV12AtomicShard, recordV12AtomicFailure } from './v12-atomic-shard-publication.mjs';

const SHA256 = /^[a-f0-9]{64}$/u;
const RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
export const V12_RECOVERY_CASE_IDS = Object.freeze(['legacy-playback', 'foreground-reconciliation', 'queued-callback', 'relaunch', 'restore', 'merge', 'zero-cue', 'between-set-rest-pointer']);
export const V12_RECOVERY_CUT_IDS = Object.freeze(['pre-transaction', 'in-transaction', 'post-commit-before-ack', 'post-acknowledgement', 'relaunch', 'retry', 'offline', 'recovery']);
const RECOVERY_STATES = new Set(['PASS', 'FAIL', 'NOT_RUN', 'REVIEW_REQUIRED']);
function fail(code) { throw new Error(`v12_recovery_${code}`); }
function obj(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value, keys) { return obj(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|'); }
function safe(value, path = 'recovery') { if (typeof value === 'string' && /bearer\s+|@|\.(?:fit|gpx|tcx)(?:\s|$)/iu.test(value)) fail(`private_value:${path}`); if (!obj(value) && !Array.isArray(value)) return; for (const [key, item] of Object.entries(value)) { if (/(?:^|_)(?:row|payload|record|owner|user|account|token|secret)(?:_|$)/iu.test(key)) fail(`private_key:${path}.${key}`); safe(item, `${path}.${key}`); } }
export function validateV12RecoveryShard(input) {
  safe(input);
  if (!exact(input, ['schema_version', 'producer', 'identity', 'cases']) || input.schema_version !== 1 || input.producer !== 'v12-recovery-shard' || !exact(input.identity, ['source_digest', 'receipt_digest', 'pointer_digest', 'effect_digest']) || !Object.values(input.identity).every((value) => typeof value === 'string' && SHA256.test(value)) || !Array.isArray(input.cases) || input.cases.length !== V12_RECOVERY_CASE_IDS.length) fail('shape_invalid');
  input.cases.forEach((entry, order) => { if (!exact(entry, ['id', 'order', 'status', 'cuts']) || entry.id !== V12_RECOVERY_CASE_IDS[order] || entry.order !== order || !RECOVERY_STATES.has(entry.status) || !Array.isArray(entry.cuts) || entry.cuts.length !== V12_RECOVERY_CUT_IDS.length) fail('case_invalid'); entry.cuts.forEach((cut, index) => { if (!exact(cut, ['cut', 'status', 'digest']) || cut.cut !== V12_RECOVERY_CUT_IDS[index] || !RECOVERY_STATES.has(cut.status) || typeof cut.digest !== 'string' || !SHA256.test(cut.digest) || cut.digest !== input.identity.receipt_digest) fail('cut_invalid'); }); });
  return Object.freeze({ ok: true, observation: Object.freeze({ schema_version: 1, producer: input.producer, cases: input.cases.length, source_digest: input.identity.source_digest, receipt_digest: input.identity.receipt_digest, pointer_digest: input.identity.pointer_digest, effect_digest: input.identity.effect_digest }) });
}
export async function executeV12RecoveryShard(input, writeObservation) { if (typeof writeObservation !== 'function') fail('writer_invalid'); const { observation } = validateV12RecoveryShard(input); await writeObservation('recovery.json', observation); return observation; }

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function safeRunPath(runId, suffix) { if (!RUN_ID.test(runId)) fail('cli_invalid'); return `artifacts/native/v1.2/${runId}/${suffix}`; }
function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function inputFromReport(manifest, report) {
  if (typeof report !== 'string' || report.length < 32 || /(?:bearer\s+|@|\.(?:fit|gpx|tcx)(?:\s|$))/iu.test(report)) fail('native_report_invalid');
  const entries = [];
  for (const match of report.matchAll(/<testcase\b[^>]*>([\s\S]*?)<\/testcase>/gu)) {
    const body = match[1];
    const property = (name) => new RegExp(`<property\\s+name=["']${name}["']\\s+value=["']([^"']+)["']`, 'u').exec(body)?.[1];
    const caseId = property('case_id'); const cut = property('cut_id'); const receipt = property('receipt_sha256');
    if (!caseId || !cut || !receipt || !SHA256.test(receipt)) fail('junit_property_invalid');
    entries.push({ caseId, cut, receipt, status: /<failure\b|<error\b/u.test(body) ? 'FAIL' : /<skipped\b/u.test(body) ? 'NOT_RUN' : property('state') === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'PASS' });
  }
  if (entries.length !== 64) fail('junit_case_count_invalid');
  const identity = {
    source_digest: manifest.source.tree_sha256,
    receipt_digest: sha256(report),
    pointer_digest: sha256(`${manifest.fixtures.registry_sha256}:pointer:${report}`),
    effect_digest: sha256(`${manifest.device.identity_sha256}:effect:${report}`),
  };
  return { schema_version: 1, producer: 'v12-recovery-shard', identity,
    cases: V12_RECOVERY_CASE_IDS.map((id, order) => {
      const group = entries.filter((entry) => entry.caseId === id);
      if (group.length !== 8 || group.some((entry, index) => entry.cut !== V12_RECOVERY_CUT_IDS[index])) fail('junit_order_invalid');
      const status = group.some((entry) => entry.status === 'FAIL') ? 'FAIL' : group.some((entry) => entry.status === 'NOT_RUN') ? 'NOT_RUN' : group.some((entry) => entry.status === 'REVIEW_REQUIRED') ? 'REVIEW_REQUIRED' : 'PASS';
      return { id, order, status, cuts: group.map(({ cut, status: cutStatus }) => ({ cut, status: cutStatus, digest: identity.receipt_digest })) };
    }) };
}
export function parseV12RecoveryShardCliArgs(args) {
  if (!Array.isArray(args) || args.length !== 3 || args[0] !== '--run' || !RUN_ID.test(args[1] ?? '') || !['--execute', '--verify'].includes(args[2])) fail('cli_invalid');
  return Object.freeze({ runId: args[1], mode: args[2].slice(2) });
}
export async function executeV12RecoveryShardCli(args = process.argv.slice(2), dependencies = {}) {
  const { runId, mode } = parseV12RecoveryShardCliArgs(args);
  const root = dependencies.root ?? process.cwd();
  const lifecycle = path.join(root, safeRunPath(runId, 'recovery/lifecycle.json'));
  const report = path.join(root, safeRunPath(runId, 'maestro/recovery.xml'));
  const outputExists = dependencies.outputExists ?? ((file) => existsSync(file));
  if (mode === 'execute' && (outputExists(lifecycle) || outputExists(report))) fail('output_exists');
  const readBuild = dependencies.readBuild ?? (() => readJson(path.join(root, safeRunPath(runId, 'build.json'))));
  const manifest = readBuild();
  try { validateV12RunManifest(manifest); } catch { fail('build_invalid'); }
  if (manifest.run_id !== runId || manifest.source.tree_sha256 !== (dependencies.sourceDigest ?? sourceTreeSha256(root))) fail('identity_mismatch');
  if (mode === 'verify') {
    if (!outputExists(lifecycle) || !outputExists(report)) fail('output_missing');
    const value = readJson(lifecycle);
    const validated = validateV12RecoveryShard({ schema_version: 1, producer: 'v12-recovery-shard', identity: value.identity, cases: value.cases });
    if (!validated.ok || Object.hasOwn(value, 'verdict') || value.run_id !== runId) fail('verify_invalid');
    return Object.freeze({ ok: true, mode, run_id: runId });
  }
  const executeNative = dependencies.executeNative ?? (async () => (
    createV12NativeAdapter({ root }).executeRecovery({ run_id: runId })
  ));
  const nativeReport = await executeNative();
  const input = inputFromReport(manifest, nativeReport);
  const writeLifecycle = dependencies.writeLifecycle ?? (async (value) => {
    mkdirSync(path.dirname(lifecycle), { recursive: true });
    writeFileSync(lifecycle, `${JSON.stringify(value)}\n`, { flag: 'wx' });
  });
  const writeReport = dependencies.writeReport ?? (async (value) => {
    mkdirSync(path.dirname(report), { recursive: true });
    writeFileSync(report, value, { flag: 'wx' });
  });
  const observation = await executeV12RecoveryShard(input, async (_name, value) => {
    await writeLifecycle({ schema_version: 1, producer: 'v12-recovery-shard', run_id: runId, identity: input.identity, cases: input.cases, observation: value });
  });
  await writeReport(nativeReport);
  return Object.freeze({ ok: true, mode, run_id: runId, observation });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2); const runId = args[1]; const writes = []; const adapter = createV12NativeAdapter();
  executeV12RecoveryShardCli(args, {
    executeNative: async () => adapter.executeRecovery({ run_id: runId }),
    writeLifecycle: async (value) => writes.push(['recovery/lifecycle.json', value]),
    writeReport: async (value) => writes.push(['maestro/recovery.xml', value]),
  }).then((result) => {
    if (args[2] === '--execute') publishV12AtomicShard({ runId, shard: 'recovery', executionOrigin: adapter.executionOrigin, produce: ({ write }) => writes.forEach(([file, value]) => write(file, value)) });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    if (RUN_ID.test(runId ?? '')) { try { recordV12AtomicFailure({ runId, shard: 'recovery', error }); } catch { /* first receipt wins */ } }
    console.error(error instanceof Error ? error.message : 'v12_recovery_cli_failed'); process.exitCode = 1;
  });
}

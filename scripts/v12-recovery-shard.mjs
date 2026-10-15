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
const UNCOMMITTED_CUTS = new Set(['pre-transaction', 'in-transaction']);
const IDENTITY_KEYS = ['source_digest', 'receipt_digest', 'pointer_digest', 'effect_digest', 'rest_digest', 'history_digest', 'timing_digest'];
const CUT_KEYS = ['cut', 'operation', 'status', 'commit_state', 'retry_code', 'after_reopen_receipt_count', 'after_retry_receipt_count', 'receipt_digest', 'source_digest', 'effect_digest', 'pointer_digest', 'rest_digest', 'history_digest', 'timing_digest'];
function fail(code) { throw new Error(`v12_recovery_${code}`); }
function obj(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value, keys) { return obj(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|'); }
function safe(value, path = 'recovery') { if (typeof value === 'string' && /bearer\s+|@|\.(?:fit|gpx|tcx)(?:\s|$)/iu.test(value)) fail(`private_value:${path}`); if (!obj(value) && !Array.isArray(value)) return; for (const [key, item] of Object.entries(value)) { if (/(?:^|_)(?:row|payload|record|owner|user|account|token|secret)(?:_|$)/iu.test(key)) fail(`private_key:${path}.${key}`); safe(item, `${path}.${key}`); } }
export function validateV12RecoveryShard(input) {
  safe(input);
  if (!exact(input, ['schema_version', 'producer', 'identity', 'cases']) || input.schema_version !== 1 || input.producer !== 'v12-recovery-shard' || !exact(input.identity, IDENTITY_KEYS) || !Object.values(input.identity).every((value) => typeof value === 'string' && SHA256.test(value)) || !Array.isArray(input.cases) || input.cases.length !== V12_RECOVERY_CASE_IDS.length) fail('shape_invalid');
  const receipts = new Set();
  input.cases.forEach((entry, order) => {
    if (!exact(entry, ['id', 'order', 'status', 'cuts']) || entry.id !== V12_RECOVERY_CASE_IDS[order] || entry.order !== order || !RECOVERY_STATES.has(entry.status) || !Array.isArray(entry.cuts) || entry.cuts.length !== V12_RECOVERY_CUT_IDS.length) fail('case_invalid');
    entry.cuts.forEach((cut, index) => {
      const expectedCommit = UNCOMMITTED_CUTS.has(cut.cut) ? 'uncommitted-before-retry' : 'committed-before-retry';
      const expectedFirstCount = UNCOMMITTED_CUTS.has(cut.cut) ? 0 : 1;
      if (!exact(cut, CUT_KEYS) || cut.cut !== V12_RECOVERY_CUT_IDS[index] || !/^[a-z0-9-]{3,60}$/u.test(cut.operation ?? '') || !RECOVERY_STATES.has(cut.status)
        || cut.commit_state !== expectedCommit || !/^[a-z0-9-]{3,60}$/u.test(cut.retry_code ?? '')
        || cut.after_reopen_receipt_count !== expectedFirstCount || cut.after_retry_receipt_count !== 1
        || !['receipt_digest', 'source_digest', 'effect_digest', 'pointer_digest', 'rest_digest', 'history_digest', 'timing_digest'].every((key) => SHA256.test(cut[key] ?? ''))
        || receipts.has(cut.receipt_digest)) fail('cut_invalid');
      receipts.add(cut.receipt_digest);
    });
  });
  if (receipts.size !== V12_RECOVERY_CASE_IDS.length * V12_RECOVERY_CUT_IDS.length) fail('cut_invalid');
  return Object.freeze({ ok: true, observation: Object.freeze({ schema_version: 1, producer: input.producer, cases: input.cases.length, ...input.identity }) });
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
    const operation = property('operation_id'); const commitState = property('commit_state'); const retryCode = property('retry_code');
    const source = property('source_sha256'); const effect = property('effect_sha256'); const pointer = property('pointer_sha256'); const rest = property('rest_sha256'); const history = property('history_sha256'); const timing = property('timing_sha256');
    const afterReopen = property('after_reopen_receipt_count'); const afterRetry = property('after_retry_receipt_count');
    if (!caseId || !cut || !operation || !commitState || !retryCode || ![receipt, source, effect, pointer, rest, history, timing].every((value) => SHA256.test(value ?? '')) || !/^[01]$/u.test(afterReopen ?? '') || afterRetry !== '1') fail('junit_property_invalid');
    entries.push({ caseId, cut, operation, commitState, retryCode, receipt, source, effect, pointer, rest, history, timing, afterReopen: Number(afterReopen), afterRetry: Number(afterRetry), status: /<failure\b|<error\b/u.test(body) ? 'FAIL' : /<skipped\b/u.test(body) ? 'NOT_RUN' : property('state') === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'PASS' });
  }
  if (entries.length !== 64) fail('junit_case_count_invalid');
  const identity = {
    source_digest: manifest.source.tree_sha256,
    receipt_digest: sha256(report),
    pointer_digest: sha256(entries.map(({ pointer }) => pointer).join(':')),
    effect_digest: sha256(entries.map(({ effect }) => effect).join(':')),
    rest_digest: sha256(entries.map(({ rest }) => rest).join(':')),
    history_digest: sha256(entries.map(({ history }) => history).join(':')),
    timing_digest: sha256(entries.map(({ timing }) => timing).join(':')),
  };
  return { schema_version: 1, producer: 'v12-recovery-shard', identity,
    cases: V12_RECOVERY_CASE_IDS.map((id, order) => {
      const group = entries.filter((entry) => entry.caseId === id);
      if (group.length !== 8 || group.some((entry, index) => entry.cut !== V12_RECOVERY_CUT_IDS[index])) fail('junit_order_invalid');
      const status = group.some((entry) => entry.status === 'FAIL') ? 'FAIL' : group.some((entry) => entry.status === 'NOT_RUN') ? 'NOT_RUN' : group.some((entry) => entry.status === 'REVIEW_REQUIRED') ? 'REVIEW_REQUIRED' : 'PASS';
      return { id, order, status, cuts: group.map((entry) => ({
        cut: entry.cut, operation: entry.operation, status: entry.status,
        commit_state: entry.commitState, retry_code: entry.retryCode,
        after_reopen_receipt_count: entry.afterReopen,
        after_retry_receipt_count: entry.afterRetry,
        receipt_digest: entry.receipt, source_digest: entry.source,
        effect_digest: entry.effect, pointer_digest: entry.pointer,
        rest_digest: entry.rest, history_digest: entry.history,
        timing_digest: entry.timing,
      })) };
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
  const args = process.argv.slice(2); const runId = args[1]; const writes = [];
  executeV12RecoveryShardCli(args, {
    writeLifecycle: async (value) => writes.push(['recovery/lifecycle.json', value]),
    writeReport: async (value) => writes.push(['maestro/recovery.xml', value]),
  }).then((result) => {
    if (args[2] === '--execute') publishV12AtomicShard({ runId, shard: 'recovery', produce: ({ write }) => writes.forEach(([file, value]) => write(file, value)) });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    if (RUN_ID.test(runId ?? '')) { try { recordV12AtomicFailure({ runId, shard: 'recovery', error }); } catch { /* first receipt wins */ } }
    console.error(error instanceof Error ? error.message : 'v12_recovery_cli_failed'); process.exitCode = 1;
  });
}

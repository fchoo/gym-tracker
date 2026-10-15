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
export const V12_RECOVERY_SCENARIOS = Object.freeze([
  Object.freeze({ id: 'legacy-playback', operation_id: 'tim01-legacy-playback', boundary_ids: Object.freeze(['start', 'edit']) }),
  Object.freeze({ id: 'foreground-reconciliation', operation_id: 'tim01-foreground-reconciliation', boundary_ids: Object.freeze(['rest']) }),
  Object.freeze({ id: 'queued-callback', operation_id: 'tim01-queued-callback', boundary_ids: Object.freeze(['commit']) }),
  Object.freeze({ id: 'relaunch', operation_id: 'workout-relaunch-replay', boundary_ids: Object.freeze(['finish']) }),
  Object.freeze({ id: 'restore', operation_id: 'secure-restore', boundary_ids: Object.freeze(['restore', 'import']) }),
  Object.freeze({ id: 'merge', operation_id: 'secure-merge', boundary_ids: Object.freeze(['merge', 'match']) }),
  Object.freeze({ id: 'zero-cue', operation_id: 'tim01-zero-cue', boundary_ids: Object.freeze(['start', 'edit', 'finish']) }),
  Object.freeze({ id: 'between-set-rest-pointer', operation_id: 'workout-rest-set-pointer', boundary_ids: Object.freeze(['commit', 'rest']) }),
]);
export const V12_RECOVERY_CUT_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'pre-transaction', barrier_id: 'before-transaction', process_state: 'route-open', acknowledgement: 'not-reached', connectivity: 'online', first_attempt: 'not-started' }),
  Object.freeze({ id: 'in-transaction', barrier_id: 'writer-transaction-open', process_state: 'writer-open', acknowledgement: 'not-reached', connectivity: 'online', first_attempt: 'transaction-open' }),
  Object.freeze({ id: 'post-commit-before-ack', barrier_id: 'commit-durable-ack-pending', process_state: 'writer-open', acknowledgement: 'lost', connectivity: 'online', first_attempt: 'committed-ack-lost' }),
  Object.freeze({ id: 'post-acknowledgement', barrier_id: 'acknowledgement-observed', process_state: 'route-open', acknowledgement: 'observed', connectivity: 'online', first_attempt: 'acknowledged' }),
  Object.freeze({ id: 'relaunch', barrier_id: 'replay-process-open', process_state: 'replay-open', acknowledgement: 'observed', connectivity: 'online', first_attempt: 'acknowledged' }),
  Object.freeze({ id: 'retry', barrier_id: 'first-attempt-failed', process_state: 'route-open', acknowledgement: 'not-reached', connectivity: 'online', first_attempt: 'failed' }),
  Object.freeze({ id: 'offline', barrier_id: 'post-boundary-offline', process_state: 'route-open', acknowledgement: 'observed', connectivity: 'switch-offline', first_attempt: 'acknowledged' }),
  Object.freeze({ id: 'recovery', barrier_id: 'domain-reconciliation-pending', process_state: 'recovery-open', acknowledgement: 'observed', connectivity: 'online', first_attempt: 'acknowledged' }),
]);
export const V12_RECOVERY_CASE_IDS = Object.freeze(V12_RECOVERY_SCENARIOS.map(({ id }) => id));
export const V12_RECOVERY_CUT_IDS = Object.freeze(V12_RECOVERY_CUT_DEFINITIONS.map(({ id }) => id));
const RECOVERY_STATES = new Set(['PASS', 'FAIL', 'NOT_RUN', 'REVIEW_REQUIRED']);
const UNCOMMITTED_CUTS = new Set(['pre-transaction', 'in-transaction', 'retry']);
const IDENTITY_KEYS = ['source_digest', 'receipt_digest', 'scenario_digest', 'cut_digest', 'pointer_digest', 'effect_digest', 'rest_digest', 'history_digest', 'timing_digest', 'restore_digest', 'merge_receipt_digest', 'cue_digest'];
const SNAPSHOT_KEYS = ['source_count', 'receipt_count', 'effect_count', 'pointer_count', 'rest_count', 'history_count', 'timing_count', 'restore_count', 'merge_receipt_count', 'cue_count', 'source_sha256', 'receipt_sha256', 'effect_sha256', 'pointer_sha256', 'rest_sha256', 'history_sha256', 'timing_sha256', 'restore_sha256', 'merge_receipt_sha256', 'cue_sha256', 'effect_facts', 'pointer_facts', 'rest_facts', 'timing_facts', 'history_facts', 'restore_facts', 'merge_receipt_facts'];
const CUT_KEYS = ['cut_id', 'status', 'operation_id', 'boundary_ids', 'barrier', 'first_attempt_code', 'recovery_code', 'retry_code', 'receipt_sha256', 'snapshots'];
const SNAPSHOT_PHASES = ['before', 'after_cut', 'after_reopen', 'after_recovery', 'after_retry'];
function fail(code) { throw new Error(`v12_recovery_${code}`); }
function obj(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value, keys) { return obj(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|'); }
function safe(value, path = 'recovery') { if (typeof value === 'string' && /bearer\s+|@|\.(?:fit|gpx|tcx)(?:\s|$)/iu.test(value)) fail(`private_value:${path}`); if (!obj(value) && !Array.isArray(value)) return; for (const [key, item] of Object.entries(value)) { if (/(?:^|_)(?:row|payload|record|owner|user|account|token|secret)(?:_|$)/iu.test(key)) fail(`private_key:${path}.${key}`); safe(item, `${path}.${key}`); } }
const nullableTimestamp = value => value === null || (Number.isSafeInteger(value) && value >= 0);
const nullableHash = value => value === null || SHA256.test(value ?? '');
function validateSnapshotFacts(snapshot) {
  for (const fact of snapshot.effect_facts) if (!exact(fact, ['effect_sha256', 'type', 'subject_sha256', 'expected_revision', 'status', 'attempt_count', 'next_attempt_at_ms', 'last_error_code'])
    || !SHA256.test(fact.effect_sha256 ?? '') || !SHA256.test(fact.subject_sha256 ?? '')
    || !['reconcile_rest_notification', 'regenerate_load_reps_recommendation'].includes(fact.type)
    || !['pending', 'processing', 'completed', 'superseded', 'permanent_failure'].includes(fact.status)
    || ![fact.expected_revision, fact.attempt_count, fact.next_attempt_at_ms].every((value) => Number.isSafeInteger(value) && value >= 0)) fail('cut_invalid');
  for (const fact of snapshot.pointer_facts) if (!exact(fact, ['session_sha256', 'status', 'revision', 'active_exercise_sha256', 'active_set_sha256', 'committed_set_sha256'])
    || !SHA256.test(fact.session_sha256 ?? '') || !nullableHash(fact.active_exercise_sha256) || !nullableHash(fact.active_set_sha256) || !nullableHash(fact.committed_set_sha256)
    || !Number.isSafeInteger(fact.revision) || fact.revision < 0) fail('cut_invalid');
  for (const fact of snapshot.rest_facts) if (!exact(fact, ['session_sha256', 'status', 'revision', 'started_at_ms', 'ends_at_ms', 'deadline_at_ms', 'paused_remaining_ms', 'expired_at_ms', 'next_set_sha256'])
    || !SHA256.test(fact.session_sha256 ?? '') || !nullableHash(fact.next_set_sha256)
    || !['idle', 'running', 'paused', 'expired'].includes(fact.status) || !Number.isSafeInteger(fact.revision) || fact.revision < 0
    || ![fact.started_at_ms, fact.ends_at_ms, fact.deadline_at_ms, fact.paused_remaining_ms, fact.expired_at_ms].every(nullableTimestamp)
    || fact.deadline_at_ms !== fact.ends_at_ms) fail('cut_invalid');
  for (const fact of snapshot.timing_facts) if (!exact(fact, ['session_sha256', 'set_sha256', 'state_version', 'revision', 'status', 'mode', 'configuration', 'progress', 'started_at_ms', 'next_boundary_at_ms', 'remaining_ms', 'stopped_at_ms'])
    || !SHA256.test(fact.session_sha256 ?? '') || !nullableHash(fact.set_sha256)
    || !Number.isSafeInteger(fact.state_version) || !Number.isSafeInteger(fact.revision)
    || !['idle', 'running', 'paused', 'stopped', 'expired'].includes(fact.status)
    || ![null, 'per_rep', 'cluster'].includes(fact.mode) || !obj(fact.configuration) || !obj(fact.progress)
    || ![fact.started_at_ms, fact.next_boundary_at_ms, fact.remaining_ms, fact.stopped_at_ms].every(nullableTimestamp)) fail('cut_invalid');
  for (const fact of snapshot.history_facts) if (!exact(fact, ['event_sha256', 'session_sha256', 'effective_revision', 'event_type', 'field_identity', 'before_sha256', 'after_sha256', 'occurred_at_ms'])
    || ![fact.event_sha256, fact.session_sha256, fact.before_sha256, fact.after_sha256].every((value) => SHA256.test(value ?? ''))
    || !['correction', 'void', 'restore'].includes(fact.event_type) || !/^[a-z0-9_]{3,80}$/u.test(fact.field_identity ?? '')
    || !Number.isSafeInteger(fact.effective_revision) || fact.effective_revision < 1 || !nullableTimestamp(fact.occurred_at_ms)) fail('cut_invalid');
  for (const fact of snapshot.restore_facts) if (!exact(fact, ['state', 'updated_at_ms']) || !['ready', 'rebuild_pending'].includes(fact.state) || !nullableTimestamp(fact.updated_at_ms)) fail('cut_invalid');
  for (const fact of snapshot.merge_receipt_facts) if (!exact(fact, ['table', 'receipt_sha256', 'request_sha256', 'idempotency_sha256', 'committed_at_ms', 'result'])
    || !['workout_receipts', 'imported_activity_receipts', 'running_activity_match_receipts', 'metric_profile_migration_events'].includes(fact.table)
    || ![fact.receipt_sha256, fact.request_sha256, fact.idempotency_sha256].every((value) => SHA256.test(value ?? ''))
    || !nullableTimestamp(fact.committed_at_ms) || !/^[a-z0-9_-]{3,80}$/u.test(fact.result ?? '')) fail('cut_invalid');
}
export function validateV12RecoveryShard(input) {
  safe(input);
  if (!exact(input, ['schema_version', 'producer', 'identity', 'cases']) || input.schema_version !== 2 || input.producer !== 'v12-recovery-shard' || !exact(input.identity, IDENTITY_KEYS) || !Object.values(input.identity).every((value) => typeof value === 'string' && SHA256.test(value)) || !Array.isArray(input.cases) || input.cases.length !== V12_RECOVERY_CASE_IDS.length) fail('shape_invalid');
  const receipts = new Set();
  input.cases.forEach((entry, order) => {
    const scenario = V12_RECOVERY_SCENARIOS[order];
    if (!exact(entry, ['id', 'order', 'operation_id', 'boundary_ids', 'status', 'cuts']) || entry.id !== scenario.id || entry.order !== order || entry.operation_id !== scenario.operation_id || JSON.stringify(entry.boundary_ids) !== JSON.stringify(scenario.boundary_ids) || !RECOVERY_STATES.has(entry.status) || !Array.isArray(entry.cuts) || entry.cuts.length !== V12_RECOVERY_CUT_IDS.length) fail('case_invalid');
    entry.cuts.forEach((cut, index) => {
      const definition = V12_RECOVERY_CUT_DEFINITIONS[index];
      if (!exact(cut, CUT_KEYS) || cut.cut_id !== definition.id || cut.operation_id !== scenario.operation_id || JSON.stringify(cut.boundary_ids) !== JSON.stringify(scenario.boundary_ids) || !RECOVERY_STATES.has(cut.status)
        || !exact(cut.barrier, ['barrier_id', 'process_state', 'acknowledgement', 'connectivity', 'first_attempt'])
        || Object.keys(cut.barrier).some((key) => cut.barrier[key] !== definition[key])
        || ![cut.first_attempt_code, cut.recovery_code, cut.retry_code].every((code) => /^[a-z0-9-]{3,60}$/u.test(code ?? ''))
        || !SHA256.test(cut.receipt_sha256 ?? '') || receipts.has(cut.receipt_sha256)
        || !exact(cut.snapshots, SNAPSHOT_PHASES)) fail('cut_invalid');
      for (const phase of SNAPSHOT_PHASES) {
        const snapshot = cut.snapshots[phase];
        if (!exact(snapshot, SNAPSHOT_KEYS)
          || SNAPSHOT_KEYS.filter((key) => key.endsWith('_count')).some((key) => !Number.isSafeInteger(snapshot[key]) || snapshot[key] < 0)
          || SNAPSHOT_KEYS.filter((key) => key.endsWith('_sha256')).some((key) => !SHA256.test(snapshot[key] ?? ''))
          || [['effect_facts', 'effect_count'], ['pointer_facts', 'pointer_count'], ['rest_facts', 'rest_count'], ['timing_facts', 'timing_count'], ['history_facts', 'history_count'], ['restore_facts', 'restore_count'], ['merge_receipt_facts', 'merge_receipt_count']].some(([facts, count]) => !Array.isArray(snapshot[facts]) || snapshot[facts].length !== snapshot[count])) fail('cut_invalid');
        validateSnapshotFacts(snapshot);
      }
      const expectedReopen = UNCOMMITTED_CUTS.has(cut.cut_id) ? cut.snapshots.before : cut.snapshots.after_cut;
      if (JSON.stringify(cut.snapshots.after_reopen) !== JSON.stringify(expectedReopen)
        || (cut.cut_id !== 'recovery' && JSON.stringify(cut.snapshots.after_recovery) !== JSON.stringify(cut.snapshots.after_reopen))
        || cut.snapshots.after_retry.cue_count !== 0 || cut.snapshots.after_retry.restore_facts.length !== 1) fail('cut_invalid');
      receipts.add(cut.receipt_sha256);
    });
    const retried = entry.cuts.map(({ snapshots }) => snapshots.after_retry);
    if (retried.some((snapshot) => snapshot.cue_count !== 0 || snapshot.restore_facts.length !== 1)) fail('case_invalid');
    if (['legacy-playback', 'zero-cue'].includes(entry.id) && retried.some((snapshot) => snapshot.timing_facts.length < 1 || snapshot.history_facts.length < 1)) fail('case_invalid');
    if (entry.id === 'foreground-reconciliation' && (retried.some((snapshot) => snapshot.rest_facts.length < 1) || entry.cuts.find(({ cut_id }) => cut_id === 'recovery')?.recovery_code !== 'foreground-reconciled')) fail('case_invalid');
    if (entry.id === 'queued-callback' && entry.cuts.some(({ snapshots }) => snapshots.after_reopen.effect_facts.length < 1)) fail('case_invalid');
    if (entry.id === 'restore' && retried.some((snapshot) => !snapshot.restore_facts.some(({ state }) => state === 'rebuild_pending'))) fail('case_invalid');
    if (entry.id === 'merge' && retried.some((snapshot) => snapshot.merge_receipt_facts.length < 1)) fail('case_invalid');
    if (['restore', 'merge'].includes(entry.id) && retried.some((snapshot) => snapshot.pointer_facts.length < 1 || snapshot.rest_facts.length < 1 || snapshot.timing_facts.length < 1 || snapshot.history_facts.length < 1)) fail('case_invalid');
    if (entry.id === 'between-set-rest-pointer' && retried.some((snapshot) => snapshot.rest_facts.length < 1 || !snapshot.pointer_facts.some(({ committed_set_sha256 }) => SHA256.test(committed_set_sha256 ?? '')))) fail('case_invalid');
  });
  if (receipts.size !== V12_RECOVERY_CASE_IDS.length * V12_RECOVERY_CUT_IDS.length) fail('cut_invalid');
  return Object.freeze({ ok: true, observation: Object.freeze({ schema_version: 2, producer: input.producer, cases: input.cases.length, ...input.identity }) });
}
export async function executeV12RecoveryShard(input, writeObservation) { if (typeof writeObservation !== 'function') fail('writer_invalid'); const { observation } = validateV12RecoveryShard(input); await writeObservation('recovery.json', observation); return observation; }

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function safeRunPath(runId, suffix) { if (!RUN_ID.test(runId)) fail('cli_invalid'); return `artifacts/native/v1.2/${runId}/${suffix}`; }
function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function inputFromReport(manifest, report) {
  if (!exact(report, ['schema_version', 'producer', 'cases', 'junit_xml']) || report.schema_version !== 2 || report.producer !== 'v12-production-recovery-host'
    || typeof report.junit_xml !== 'string' || report.junit_xml.length < 32 || /(?:bearer\s+|@|\.(?:fit|gpx|tcx)(?:\s|$))/iu.test(report.junit_xml)) fail('native_report_invalid');
  const candidate = { schema_version: 2, producer: 'v12-recovery-shard', identity: Object.fromEntries(IDENTITY_KEYS.map((key) => [key, '0'.repeat(64)])), cases: report.cases };
  candidate.identity = {
    source_digest: manifest.source.tree_sha256,
    receipt_digest: sha256(report.junit_xml),
    scenario_digest: sha256(JSON.stringify(report.cases.map(({ id, order, operation_id, boundary_ids }) => ({ id, order, operation_id, boundary_ids })))),
    cut_digest: sha256(JSON.stringify(report.cases.flatMap(({ cuts }) => cuts.map(({ receipt_sha256 }) => receipt_sha256)))),
    pointer_digest: sha256(JSON.stringify(report.cases.flatMap(({ cuts }) => cuts.map(({ snapshots }) => snapshots.after_retry.pointer_facts)))),
    effect_digest: sha256(JSON.stringify(report.cases.flatMap(({ cuts }) => cuts.map(({ snapshots }) => snapshots.after_retry.effect_facts)))),
    rest_digest: sha256(JSON.stringify(report.cases.flatMap(({ cuts }) => cuts.map(({ snapshots }) => snapshots.after_retry.rest_facts)))),
    history_digest: sha256(JSON.stringify(report.cases.flatMap(({ cuts }) => cuts.map(({ snapshots }) => snapshots.after_retry.history_facts)))),
    timing_digest: sha256(JSON.stringify(report.cases.flatMap(({ cuts }) => cuts.map(({ snapshots }) => snapshots.after_retry.timing_facts)))),
    restore_digest: sha256(JSON.stringify(report.cases.flatMap(({ cuts }) => cuts.map(({ snapshots }) => snapshots.after_retry.restore_facts)))),
    merge_receipt_digest: sha256(JSON.stringify(report.cases.flatMap(({ cuts }) => cuts.map(({ snapshots }) => snapshots.after_retry.merge_receipt_facts)))),
    cue_digest: sha256(JSON.stringify(report.cases.flatMap(({ cuts }) => cuts.map(({ snapshots }) => snapshots.after_retry.cue_count)))),
  };
  validateV12RecoveryShard(candidate);
  const entries = [];
  for (const match of report.junit_xml.matchAll(/<testcase\b[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/testcase>/gu)) {
    const body = match[2];
    const property = (name) => new RegExp(`<property\\s+name=["']${name}["']\\s+value=["']([^"']+)["']`, 'u').exec(body)?.[1];
    const properties = Object.fromEntries(['case_id', 'cut_id', 'operation_id', 'boundary_digest', 'barrier_id', 'process_state', 'acknowledgement', 'connectivity', 'first_attempt', 'first_attempt_code', 'recovery_code', 'retry_code', 'receipt_sha256', 'before_sha256', 'after_cut_sha256', 'after_reopen_sha256', 'after_recovery_sha256', 'after_retry_sha256', 'state'].map((key) => [key, property(key)]));
    if (Object.values(properties).some((value) => value === undefined)) fail('junit_property_invalid');
    entries.push({ id: match[1], properties, status: /<failure\b|<error\b/u.test(body) ? 'FAIL' : /<skipped\b/u.test(body) ? properties.state === 'NOT_RUN' ? 'NOT_RUN' : 'REVIEW_REQUIRED' : properties.state });
  }
  if (entries.length !== 64) fail('junit_case_count_invalid');
  const cuts = report.cases.flatMap(({ cuts }) => cuts);
  entries.forEach((entry, index) => {
    const cut = cuts[index]; const expectedId = `${entry.properties.case_id}:${entry.properties.cut_id}`;
    if (entry.id !== expectedId || entry.status !== cut.status || entry.properties.operation_id !== cut.operation_id
      || entry.properties.receipt_sha256 !== cut.receipt_sha256 || entry.properties.boundary_digest !== sha256(JSON.stringify(cut.boundary_ids))
      || ['barrier_id', 'process_state', 'acknowledgement', 'connectivity', 'first_attempt'].some((key) => entry.properties[key] !== cut.barrier[key])
      || ['first_attempt_code', 'recovery_code', 'retry_code'].some((key) => entry.properties[key] !== cut[key])
      || SNAPSHOT_PHASES.some((phase) => entry.properties[`${phase}_sha256`] !== sha256(JSON.stringify(cut.snapshots[phase])))) fail('junit_order_invalid');
  });
  return candidate;
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
    const value = readJson(lifecycle); const junitXml = readFileSync(report, 'utf8');
    const reconstructed = inputFromReport(manifest, { schema_version: 2, producer: 'v12-production-recovery-host', cases: value.cases, junit_xml: junitXml });
    const validated = validateV12RecoveryShard(reconstructed);
    if (!validated.ok || JSON.stringify(reconstructed.identity) !== JSON.stringify(value.identity) || Object.hasOwn(value, 'verdict') || value.run_id !== runId) fail('verify_invalid');
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
    await writeLifecycle({ schema_version: 2, producer: 'v12-recovery-shard', run_id: runId, identity: input.identity, cases: input.cases, observation: value });
  });
  await writeReport(nativeReport.junit_xml);
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

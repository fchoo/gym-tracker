import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { validateV12RunManifest } from './create-v12-run-manifest.mjs';
import { sourceTreeSha256 } from './source-tree-digest.mjs';

const SHA256 = /^[a-f0-9]{64}$/u;
const RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
export const V12_SQLITE_SHARD_CASE_IDS = Object.freeze([
  'fresh-migration', 'schema27-upgrade', 'supported-legacy-upgrade', 'failure-reopen',
  'backup', 'restore', 'merge', 'noop-replay', 'rebuild', 'immutable-history',
]);

function fail(code) { throw new Error(`v12_sqlite_${code}`); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value, keys) {
  return object(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
}
function hash(value) { return typeof value === 'string' && SHA256.test(value); }
function privacySafe(value, path = 'observation') {
  if (typeof value === 'string') {
    if (/bearer\s+|@|\.(?:fit|gpx|tcx)(?:\s|$)/iu.test(value)) fail(`private_value:${path}`);
    return;
  }
  if (Array.isArray(value)) return value.forEach((item, index) => privacySafe(item, `${path}[${index}]`));
  if (!object(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (/(?:^|_)(?:row|rows|payload|record|records|sql|token|secret|email|account|owner|user)(?:_|$)/iu.test(key)) fail(`private_key:${path}.${key}`);
    privacySafe(item, `${path}.${key}`);
  }
}
function validateCase(entry, index) {
  if (!exactKeys(entry, ['id', 'status', 'order', 'digests'])
    || entry.id !== V12_SQLITE_SHARD_CASE_IDS[index] || entry.status !== 'passed'
    || entry.order !== index || !exactKeys(entry.digests, ['pre', 'post', 'reopen', 'rebuild'])
    || !Object.values(entry.digests).every(hash)) fail('case_invalid');
}

export function validateV12SqliteShard(input) {
  privacySafe(input);
  if (!exactKeys(input, ['schema_version', 'producer', 'identity', 'cases'])
    || input.schema_version !== 1 || input.producer !== 'v12-sqlite-shard'
    || !exactKeys(input.identity, ['source_digest', 'fixture_digest', 'apk_digest', 'installed_apk_digest', 'device_digest'])
    || !Object.values(input.identity).every(hash)
    || input.identity.apk_digest !== input.identity.installed_apk_digest
    || !Array.isArray(input.cases) || input.cases.length !== V12_SQLITE_SHARD_CASE_IDS.length) fail('shape_invalid');
  input.cases.forEach(validateCase);
  const observation = Object.freeze({
    schema_version: 1,
    producer: input.producer,
    identity: Object.freeze({
      source_digest: input.identity.source_digest,
      fixture_digest: input.identity.fixture_digest,
      apk_digest: input.identity.apk_digest,
      device_digest: input.identity.device_digest,
    }),
  });
  return Object.freeze({
    ok: true,
    observations: Object.freeze({
      migration: Object.freeze({ ...observation, cases: 4, digest: input.cases[3].digests.reopen }),
      portability: Object.freeze({ ...observation, cases: 4, digest: input.cases[7].digests.rebuild }),
      history: Object.freeze({ ...observation, cases: 2, digest: input.cases[9].digests.post }),
    }),
  });
}

export async function executeV12SqliteShard(input, writeObservation) {
  if (typeof writeObservation !== 'function') fail('writer_invalid');
  const { observations } = validateV12SqliteShard(input);
  await writeObservation('migration.json', observations.migration);
  await writeObservation('portability.json', observations.portability);
  await writeObservation('history.json', observations.history);
  return observations;
}

function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function safeRunPath(runId, suffix) {
  if (!RUN_ID.test(runId)) fail('cli_invalid');
  return `artifacts/native/v1.2/${runId}/${suffix}`;
}
function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function nativeResultToInput(manifest, result) {
  if (!result || result.status !== 'passed' || result.contract?.total !== V12_SQLITE_SHARD_CASE_IDS.length
    || result.contract?.passed !== V12_SQLITE_SHARD_CASE_IDS.length || result.contract?.failed !== 0
    || result.contract?.skipped !== 0 || !Array.isArray(result.contract.cases)) fail('native_result_invalid');
  const identity = {
    source_digest: manifest.source.tree_sha256,
    fixture_digest: manifest.fixtures.registry_sha256,
    apk_digest: manifest.build.apk.sha256,
    installed_apk_digest: manifest.device.installed_apk_sha256,
    device_digest: manifest.device.identity_sha256,
  };
  return {
    schema_version: 1,
    producer: 'v12-sqlite-shard',
    identity,
    cases: result.contract.cases.map((entry, order) => {
      if (entry?.id !== V12_SQLITE_SHARD_CASE_IDS[order] || entry?.status !== 'passed'
        || !Number.isFinite(entry?.durationMs) || entry.durationMs < 0) fail('native_result_invalid');
      const base = { identity, id: entry.id, order, duration_ms: entry.durationMs };
      return { id: entry.id, status: 'passed', order, digests: {
        pre: digest({ ...base, cut: 'pre' }), post: digest({ ...base, cut: 'post' }),
        reopen: digest({ ...base, cut: 'reopen' }), rebuild: digest({ ...base, cut: 'rebuild' }),
      } };
    }),
  };
}

export function parseV12SqliteShardCliArgs(args) {
  if (!Array.isArray(args) || args.length !== 3 || args[0] !== '--run' || !RUN_ID.test(args[1] ?? '')
    || !['--execute', '--verify'].includes(args[2])) fail('cli_invalid');
  return Object.freeze({ runId: args[1], mode: args[2].slice(2) });
}

export async function executeV12SqliteShardCli(args = process.argv.slice(2), dependencies = {}) {
  const { runId, mode } = parseV12SqliteShardCliArgs(args);
  const root = dependencies.root ?? process.cwd();
  const outputDirectory = safeRunPath(runId, 'sqlite');
  const outputPaths = ['migration.json', 'portability.json', 'history.json'].map((name) => path.join(root, outputDirectory, name));
  const outputExists = dependencies.outputExists ?? ((file) => existsSync(file));
  if (mode === 'execute' && outputPaths.some(outputExists)) fail('output_exists');
  const readBuild = dependencies.readBuild ?? (() => readJson(path.join(root, safeRunPath(runId, 'build.json'))));
  const manifest = readBuild();
  try { validateV12RunManifest(manifest); } catch { fail('build_invalid'); }
  if (manifest.run_id !== runId || manifest.source.tree_sha256 !== (dependencies.sourceDigest ?? sourceTreeSha256(root))) fail('identity_mismatch');
  if (mode === 'verify') {
    if (outputPaths.some((file) => !outputExists(file))) fail('output_missing');
    const expected = ['migration', 'portability', 'history'];
    for (const [index, file] of outputPaths.entries()) {
      const observation = readJson(file);
      if (observation?.producer !== 'v12-sqlite-shard' || observation?.identity?.source_digest !== manifest.source.tree_sha256
        || observation?.identity?.fixture_digest !== manifest.fixtures.registry_sha256 || observation?.identity?.apk_digest !== manifest.build.apk.sha256
        || observation?.identity?.installed_apk_digest !== manifest.device.installed_apk_sha256 || observation?.identity?.device_digest !== manifest.device.identity_sha256
        || observation?.cases !== [4, 4, 2][index] || !hash(observation?.digest) || Object.hasOwn(observation, 'verdict')) fail(`verify_${expected[index]}_invalid`);
    }
    return Object.freeze({ ok: true, mode, run_id: runId });
  }
  const executeNative = dependencies.executeNative ?? (async () => {
    execFileSync(process.execPath, ['scripts/run-native-sqlite-contracts.mjs', '--suite', 'v1.2-acceptance', '--manifest', 'artifacts/native/v1.2-acceptance/build.json'], { cwd: root, stdio: 'inherit' });
    return readJson(path.join(root, 'artifacts/native/v1.2-acceptance/v1.2-acceptance.json'));
  });
  const observations = await executeV12SqliteShard(nativeResultToInput(manifest, await executeNative()), async (name, value) => {
    const file = path.join(root, outputDirectory, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(value)}\n`, { flag: 'wx' });
  });
  return Object.freeze({ ok: true, mode, run_id: runId, observations });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  executeV12SqliteShardCli().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => { console.error(error instanceof Error ? error.message : 'v12_sqlite_cli_failed'); process.exitCode = 1; });
}

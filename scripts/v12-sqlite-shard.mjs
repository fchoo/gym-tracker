import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { validateV12RunManifest } from './create-v12-run-manifest.mjs';
import { sourceTreeSha256 } from './source-tree-digest.mjs';
import {
  assertV12AcceptanceNativeContractResult,
  classifyV12SqliteNativeFailure,
  createV12SqliteFailureReceipt,
} from './v12-sqlite-producer-contract.mjs';
import { createV12NativeAdapter } from './v12-native-adapter.mjs';
import { publishV12AtomicShard, recordV12AtomicFailure } from './v12-atomic-shard-publication.mjs';

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
  if (!exactKeys(entry, ['id', 'status', 'order', 'digests', 'source_facts'])
    || entry.id !== V12_SQLITE_SHARD_CASE_IDS[index] || entry.status !== 'passed'
    || entry.order !== index || !exactKeys(entry.digests, ['pre', 'post', 'reopen', 'rebuild'])
    || !Object.values(entry.digests).every(hash) || !Array.isArray(entry.source_facts)
    || entry.source_facts.length === 0) fail('case_invalid');
  let sourceCount = 0;
  const registries = new Set();
  for (const source of entry.source_facts) {
    if (!exactKeys(source, ['registry', 'cases']) || typeof source.registry !== 'string'
      || registries.has(source.registry) || !Array.isArray(source.cases) || source.cases.length === 0) fail('case_invalid');
    registries.add(source.registry);
    const ids = new Set();
    for (const sourceCase of source.cases) {
      if (!exactKeys(sourceCase, ['id', 'status']) || typeof sourceCase.id !== 'string'
        || sourceCase.status !== 'passed' || ids.has(sourceCase.id)) fail('case_invalid');
      ids.add(sourceCase.id); sourceCount += 1;
    }
  }
  if (sourceCount < 1) fail('case_invalid');
}

const GROUP_BOUNDS = Object.freeze({
  migration: Object.freeze([0, 4]),
  portability: Object.freeze([4, 8]),
  history: Object.freeze([8, 10]),
});

function caseFacts(cases, [start, end]) {
  return Object.freeze(cases.slice(start, end).map((entry) => Object.freeze({
    id: entry.id,
    order: entry.order,
    status: entry.status,
    source_facts: entry.source_facts,
    digest: digest(entry.digests),
  })));
}

function retainedObservation(observation, cases, group) {
  const facts = caseFacts(cases, GROUP_BOUNDS[group]);
  return Object.freeze({
    ...observation,
    cases: facts.length,
    case_facts: facts,
    all_passed: facts.every(({ status }) => status === 'passed'),
    digest: digest(facts),
  });
}

function validateRetainedObservation(value, group) {
  const bounds = GROUP_BOUNDS[group];
  const expectedIds = V12_SQLITE_SHARD_CASE_IDS.slice(...bounds);
  if (!exactKeys(value, ['schema_version', 'producer', 'identity', 'cases', 'case_facts', 'all_passed', 'digest'])
    || value.schema_version !== 1 || value.producer !== 'v12-sqlite-shard'
    || !exactKeys(value.identity, ['source_digest', 'fixture_digest', 'apk_digest', 'installed_apk_digest', 'device_digest'])
    || !Object.values(value.identity).every(hash) || value.identity.apk_digest !== value.identity.installed_apk_digest
    || value.cases !== expectedIds.length || !Array.isArray(value.case_facts)
    || value.case_facts.length !== expectedIds.length || value.all_passed !== true) fail('observation_invalid');
  value.case_facts.forEach((entry, index) => {
    if (!exactKeys(entry, ['id', 'order', 'status', 'source_facts', 'digest'])
      || entry.id !== expectedIds[index] || entry.order !== bounds[0] + index
      || entry.status !== 'passed' || !Array.isArray(entry.source_facts)
      || entry.source_facts.length === 0 || !hash(entry.digest)) fail('observation_invalid');
  });
  if (value.digest !== digest(value.case_facts)) fail('observation_invalid');
  return value;
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
      installed_apk_digest: input.identity.installed_apk_digest,
      device_digest: input.identity.device_digest,
    }),
  });
  return Object.freeze({
    ok: true,
    observations: Object.freeze({
      migration: retainedObservation(observation, input.cases, 'migration'),
      portability: retainedObservation(observation, input.cases, 'portability'),
      history: retainedObservation(observation, input.cases, 'history'),
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
  if (!result || result.status !== 'passed') fail('native_result_invalid');
  try { assertV12AcceptanceNativeContractResult(result.contract, V12_SQLITE_SHARD_CASE_IDS); }
  catch { fail('native_result_invalid'); }
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
      const base = { identity, id: entry.id, order, code: entry.code, counts: entry.counts, sourceFacts: entry.sourceFacts };
      return { id: entry.id, status: 'passed', order, source_facts: entry.sourceFacts, digests: {
        pre: digest({ ...base, cut: 'pre' }), post: digest({ ...base, cut: 'post' }),
        reopen: digest({ ...base, cut: 'reopen' }), rebuild: digest({ ...base, cut: 'rebuild' }),
      } };
    }),
  };
}

export function parseV12SqliteShardCliArgs(args) {
  if (!Array.isArray(args) || args[0] !== '--run' || !RUN_ID.test(args[1] ?? '')
    || !['--execute', '--verify'].includes(args[2])) fail('cli_invalid');
  let device;
  if (args.length === 5 && args[3] === '--device' && typeof args[4] === 'string' && /^[^\u0000\r\n]{1,512}$/u.test(args[4])) device = args[4];
  else if (args.length !== 3) fail('cli_invalid');
  return Object.freeze({ runId: args[1], mode: args[2].slice(2), ...(device === undefined ? {} : { device }) });
}

export async function executeV12SqliteShardCli(args = process.argv.slice(2), dependencies = {}) {
  const { runId, mode, device } = parseV12SqliteShardCliArgs(args);
  const root = dependencies.root ?? process.cwd();
  const outputDirectory = safeRunPath(runId, 'sqlite');
  const outputPaths = ['migration.json', 'portability.json', 'history.json'].map((name) => path.join(root, outputDirectory, name));
  const failurePath = path.join(root, outputDirectory, 'failure.json');
  const outputExists = dependencies.outputExists ?? ((file) => existsSync(file));
  if (mode === 'execute' && [...outputPaths, failurePath].some(outputExists)) fail('output_exists');
  const readBuild = dependencies.readBuild ?? (() => readJson(path.join(root, safeRunPath(runId, 'build.json'))));
  const manifest = readBuild();
  try { validateV12RunManifest(manifest); } catch { fail('build_invalid'); }
  if (manifest.run_id !== runId || manifest.source.tree_sha256 !== (dependencies.sourceDigest ?? sourceTreeSha256(root))) fail('identity_mismatch');
  if (mode === 'verify') {
    if (outputPaths.some((file) => !outputExists(file))) fail('output_missing');
    const expected = ['migration', 'portability', 'history'];
    for (const [index, file] of outputPaths.entries()) {
      const observation = readJson(file);
      try { validateRetainedObservation(observation, expected[index]); } catch { fail(`verify_${expected[index]}_invalid`); }
      if (observation.identity.source_digest !== manifest.source.tree_sha256
        || observation?.identity?.fixture_digest !== manifest.fixtures.registry_sha256 || observation?.identity?.apk_digest !== manifest.build.apk.sha256
        || observation?.identity?.installed_apk_digest !== manifest.device.installed_apk_sha256 || observation?.identity?.device_digest !== manifest.device.identity_sha256
        || Object.hasOwn(observation, 'verdict')) fail(`verify_${expected[index]}_invalid`);
    }
    return Object.freeze({ ok: true, mode, run_id: runId });
  }
  const executeNative = dependencies.executeNative ?? (async (requestedDevice) => (
    createV12NativeAdapter({ root, environment: requestedDevice === undefined
      ? process.env : { ...process.env, V12_DEVICE_SERIAL: requestedDevice } }).executeSqlite({ run_id: runId })
  ));
  const ephemeralDevice = device ?? dependencies.device ?? process.env.ANDROID_SERIAL;
  const writeObservation = dependencies.writeObservation ?? (async (name, value) => {
    const file = path.join(root, outputDirectory, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(value)}\n`, { flag: 'wx' });
  });
  const identity = {
    source_digest: manifest.source.tree_sha256,
    fixture_digest: manifest.fixtures.registry_sha256,
    apk_digest: manifest.build.apk.sha256,
    installed_apk_digest: manifest.device.installed_apk_sha256,
    device_digest: manifest.device.identity_sha256,
  };
  const writeFailureReceipt = dependencies.writeFailureReceipt ?? (async (value) => {
    mkdirSync(path.dirname(failurePath), { recursive: true });
    writeFileSync(failurePath, `${JSON.stringify(value)}\n`, { flag: 'wx' });
  });
  async function retainFailure(stage, code) {
    try {
      await writeFailureReceipt(createV12SqliteFailureReceipt({ runId, identity, stage, code }));
    } catch {
      fail('failure_receipt_write_failed');
    }
  }
  let nativeResult;
  try {
    nativeResult = await executeNative(ephemeralDevice);
  } catch (error) {
    const code = classifyV12SqliteNativeFailure(error);
    await retainFailure('native_runner', code);
    fail(code);
  }
  let input;
  try {
    input = nativeResultToInput(manifest, nativeResult);
  } catch {
    await retainFailure('native_runner', 'malformed_result');
    fail('malformed_result');
  }
  let observations;
  try {
    observations = await executeV12SqliteShard(input, writeObservation);
  } catch {
    await retainFailure('translation', 'translation_failed');
    fail('translation_failed');
  }
  return Object.freeze({ ok: true, mode, run_id: runId, observations });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2); const runId = args[1]; const requestedDevice = args[3] === '--device' ? args[4] : undefined;
  const writes = []; const adapter = createV12NativeAdapter({ environment: requestedDevice === undefined
    ? process.env : { ...process.env, V12_DEVICE_SERIAL: requestedDevice } });
  executeV12SqliteShardCli(args, {
    executeNative: async () => adapter.executeSqlite({ run_id: runId }),
    writeObservation: async (name, value) => writes.push([`sqlite/${name}`, value]),
    writeFailureReceipt: async () => {},
  }).then((result) => {
    if (args[2] === '--execute') publishV12AtomicShard({ runId, shard: 'sqlite', executionOrigin: () => adapter.executionOrigin('sqlite'), produce: ({ write }) => writes.forEach(([file, value]) => write(file, value)) });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    if (RUN_ID.test(runId ?? '')) { try { recordV12AtomicFailure({ runId, shard: 'sqlite', error }); } catch { /* first receipt wins */ } }
    console.error(error instanceof Error ? error.message : 'v12_sqlite_cli_failed'); process.exitCode = 1;
  });
}

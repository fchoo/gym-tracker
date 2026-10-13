const SHA256 = /^[a-f0-9]{64}$/u;
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

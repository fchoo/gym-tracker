const SHA256 = /^[a-f0-9]{64}$/u;
export const V12_RECOVERY_CASE_IDS = Object.freeze(['legacy-playback', 'foreground-reconciliation', 'queued-callback', 'relaunch', 'restore', 'merge', 'zero-cue', 'between-set-rest-pointer']);
export const V12_RECOVERY_CUT_IDS = Object.freeze(['pre-transaction', 'in-transaction', 'post-commit-before-ack', 'post-acknowledgement', 'relaunch', 'retry', 'offline', 'recovery']);
function fail(code) { throw new Error(`v12_recovery_${code}`); }
function obj(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value, keys) { return obj(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|'); }
function safe(value, path = 'recovery') { if (typeof value === 'string' && /bearer\s+|@|\.(?:fit|gpx|tcx)(?:\s|$)/iu.test(value)) fail(`private_value:${path}`); if (!obj(value) && !Array.isArray(value)) return; for (const [key, item] of Object.entries(value)) { if (/(?:^|_)(?:row|payload|record|owner|user|account|token|secret)(?:_|$)/iu.test(key)) fail(`private_key:${path}.${key}`); safe(item, `${path}.${key}`); } }
export function validateV12RecoveryShard(input) {
  safe(input);
  if (!exact(input, ['schema_version', 'producer', 'identity', 'cases']) || input.schema_version !== 1 || input.producer !== 'v12-recovery-shard' || !exact(input.identity, ['source_digest', 'receipt_digest', 'pointer_digest', 'effect_digest']) || !Object.values(input.identity).every((value) => typeof value === 'string' && SHA256.test(value)) || !Array.isArray(input.cases) || input.cases.length !== V12_RECOVERY_CASE_IDS.length) fail('shape_invalid');
  input.cases.forEach((entry, order) => { if (!exact(entry, ['id', 'order', 'status', 'cuts']) || entry.id !== V12_RECOVERY_CASE_IDS[order] || entry.order !== order || entry.status !== 'passed' || !Array.isArray(entry.cuts) || entry.cuts.length !== V12_RECOVERY_CUT_IDS.length) fail('case_invalid'); entry.cuts.forEach((cut, index) => { if (!exact(cut, ['cut', 'digest']) || cut.cut !== V12_RECOVERY_CUT_IDS[index] || typeof cut.digest !== 'string' || !SHA256.test(cut.digest) || cut.digest !== input.identity.receipt_digest) fail('cut_invalid'); }); });
  return Object.freeze({ ok: true, observation: Object.freeze({ schema_version: 1, producer: input.producer, cases: input.cases.length, source_digest: input.identity.source_digest, receipt_digest: input.identity.receipt_digest, pointer_digest: input.identity.pointer_digest, effect_digest: input.identity.effect_digest }) });
}
export async function executeV12RecoveryShard(input, writeObservation) { if (typeof writeObservation !== 'function') fail('writer_invalid'); const { observation } = validateV12RecoveryShard(input); await writeObservation('recovery.json', observation); return observation; }

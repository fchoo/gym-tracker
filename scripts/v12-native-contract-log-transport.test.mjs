import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NATIVE_CONTRACT_RESULT_MARKER as RESULT,
  NATIVE_CONTRACT_CASE_MARKER as CASE,
  NATIVE_CONTRACT_ERROR_MARKER as ERROR,
  NATIVE_CONTRACT_PROGRESS_MARKER as PROGRESS,
  parseNativeContractLogOutput,
  parseNativeContractLogFailure,
  parseNativeContractLogProgress,
} from './native-contract-log-transport.mjs';

const runId = 'v12-' + 'a'.repeat(32);
const line = (marker, value) => marker + JSON.stringify(value);
const progress = stage => line(PROGRESS, { runId, stage });

test('progress consumes the actual v1.2 namespace and newest genuine case transition', () => {
  const stages = ['v1.2-acceptance:sqlite-kernel', 'v1.2-acceptance:migrations',
    'v1.2-acceptance:portable-merge', 'v1.2-acceptance:multi-plan-running:phase13-map01-activation'];
  for (const stage of stages) assert.equal(parseNativeContractLogProgress(progress(stage), runId), stage);
  assert.equal(parseNativeContractLogProgress(stages.map(progress).join('\n'), runId), stages.at(-1));
  assert.equal(parseNativeContractLogProgress(progress(stages[0]) + '\n' + progress(stages[0]), runId), stages[0]);
});

test('progress remains run-bound and rejects malformed or unowned namespaces', () => {
  for (const value of [null, 3, { runId: 'other', stage: 'sqlite-kernel' },
    { runId, stage: 3 }, { runId, stage: '' }, { runId, stage: 'a'.repeat(81) },
    { runId, stage: 'v1.3-acceptance:migrations' }, { runId, stage: 'unowned.namespace' },
    { runId, stage: 'v1.2-acceptance:private@example.invalid' }]) {
    assert.equal(parseNativeContractLogProgress(line(PROGRESS, value), runId), undefined);
  }
  assert.equal(parseNativeContractLogProgress('plain\n' + PROGRESS + '{', runId), undefined);
  assert.equal(parseNativeContractLogProgress(progress('legacy_case:done'), runId), 'legacy_case:done');
});

test('failure parsing ignores malformed and foreign markers and keeps the newest bounded failure', () => {
  for (const value of [null, 3, { runId: 'other', errorCode: 'route_failed' },
    { runId, errorCode: 3 }, { runId, errorCode: 'x' },
    { runId, errorCode: 'private@example.invalid' }, { runId, errorCode: 'a'.repeat(81) }]) {
    assert.equal(parseNativeContractLogFailure(line(ERROR, value), runId), undefined);
  }
  assert.equal(parseNativeContractLogFailure('plain\n' + ERROR + '{', runId), undefined);
  assert.equal(parseNativeContractLogFailure([
    line(ERROR, { runId, errorCode: 'first_failed' }),
    line(ERROR, { runId, errorCode: 'last_failed' }),
  ].join('\n'), runId), 'last_failed');
});

test('legacy result parsing keeps supported raw forms without mistaking absent or broken JSON for a result', () => {
  assert.equal(parseNativeContractLogOutput('plain\n' + RESULT + '{', runId), undefined);
  for (const result of [null, 3, 'legacy_result', { schemaVersion: 1 }, { runId }, { summary: { total: 0 } }]) {
    assert.deepEqual(parseNativeContractLogOutput(line(RESULT, result), 'legacy-phase2'), result);
  }
  assert.equal(parseNativeContractLogOutput(line(RESULT, { runId: 'other', summary: { total: 0 } }), runId), undefined);
});

test('fresh v1.2 requests cannot consume unbound legacy output or malformed summaries', () => {
  for (const result of [null, 3, 'legacy_result', { schemaVersion: 1 }, { runId }, { summary: { total: 0 } }]) {
    assert.equal(parseNativeContractLogOutput(line(RESULT, result), runId), undefined);
  }
  for (const summary of [null, 3, [], {}, { total: -1 }, { total: 0.5 }, { total: 513 }]) {
    assert.equal(parseNativeContractLogOutput(line(RESULT, { runId, summary }), runId), undefined);
  }
  for (const value of [null, 3, {}]) {
    assert.equal(parseNativeContractLogOutput(line(CASE, { runId, case: value }) + '\n'
      + line(RESULT, { runId, summary: { total: 1 } }), runId), undefined);
  }
});

test('nonce-bound split results require complete unique cases and never combine foreign records', () => {
  const summary = { schemaVersion: 1, contractVersion: 1, status: 'passed', total: 2, passed: 2, failed: 0, skipped: 0 };
  const cases = [{ id: 'one', status: 'passed' }, { id: 'two', status: 'passed' }];
  const result = line(RESULT, { runId, summary });
  const records = cases.map(value => line(CASE, { runId, case: value }));
  assert.deepEqual(parseNativeContractLogOutput(records.join('\n') + '\n' + result, runId), { ...summary, cases });
  assert.equal(parseNativeContractLogOutput(records[0] + '\n' + result, runId), undefined);
  assert.equal(parseNativeContractLogOutput(line(CASE, { runId }) + '\n' + line(RESULT, { runId, summary: { total: 1 } }), runId), undefined);
  assert.equal(parseNativeContractLogOutput(records[0] + '\n' + records[0] + '\n' + result, runId), undefined);
  assert.equal(parseNativeContractLogOutput(line(CASE, { runId: 'other', case: cases[1] }) + '\n' + records[0] + '\n' + result, runId), undefined);
  assert.deepEqual(parseNativeContractLogOutput(line(RESULT, { runId, summary: { total: 0 } }), runId), { total: 0, cases: [] });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadV12ContractInputs } from './v12-evidence-contract.mjs';
import { createHash } from 'node:crypto';
import { parseV12SourceJUnit, resolveV12PerformanceGates, createV12RowSelectorTable, resolveV12SqliteReceipt, validateV12CalendarExecutionOrigin } from './v12-blocker-row-resolver.mjs';

const inputs = loadV12ContractInputs();

test('resolver has no environment-controlled shortcut around retained visual bytes', () => {
  const source = readFileSync('scripts/v12-blocker-row-resolver.mjs', 'utf8');
  assert.doesNotMatch(source, /V12_BLACKBOX_TRUSTED|trustBlackBoxVisual|NODE_ENV/u);
});
test('canonical matrix has exactly 172 typed selectors in source order', () => {
  const table = createV12RowSelectorTable({ inputs });
  assert.equal(table.length, 172);
  assert.deepEqual(table.map(x => x.row_id), inputs.matrix.rows.map(x => x.requirement_id));
  assert.equal(new Set(table.map(x => x.row_id)).size, 172);
  assert.ok(table.every(x => x.selector.type && x.selector.id && x.selector.contract));
  const dom = table.filter(x => x.row_id.startsWith('DOM'));
  assert.equal(dom.find(x => x.row_id === 'DOM-01').selector.id, 'phase13-map01-activation');
  assert.equal(table.find(x => x.row_id === 'WRK-36').selector.id, 'workout.completion-writeback');
  assert.equal(table.find(x => x.row_id === 'LIB-36').selector.id, 'library.running-conflict');
  const calendarRows = table.filter(x => x.row_id.startsWith('CAL-'));
  const matrixCalendarRows = inputs.matrix.rows.filter(x => x.requirement_id.startsWith('CAL-'));
  assert.deepEqual(calendarRows.map(x => x.selector.id), matrixCalendarRows.map(x => x.inventory_id));
  assert.equal(new Set(calendarRows.map(x => x.selector.id)).size, 23);
  assert.ok(calendarRows.every(x => x.selector.type === 'calendar-requirement'));
  assert.deepEqual(calendarRows.find(x => x.row_id === 'CAL-07').selector.stage_ids, [
    'drag-forward-10', 'drag-backward-10', 'drag-cancel', 'drag-vertical', 'drag-diagonal',
  ]);
  assert.ok(calendarRows.find(x => x.row_id === 'CAL-08').selector.stage_ids.includes('drag-retreat'));
  assert.deepEqual(calendarRows.find(x => x.row_id === 'CAL-13').selector.stage_ids, ['week-collapse-middle-row']);
  assert.deepEqual(calendarRows.find(x => x.row_id === 'CAL-16').selector.stage_ids, []);
  assert.deepEqual(calendarRows.find(x => x.row_id === 'CAL-17').selector.stage_ids, []);
  assert.deepEqual(calendarRows.find(x => x.row_id === 'CAL-18').selector.stage_ids, []);
  assert.deepEqual(calendarRows.find(x => x.row_id === 'CAL-19').selector.stage_ids, []);
  assert.deepEqual(calendarRows.find(x => x.row_id === 'CAL-22').selector.stage_ids, []);
  assert.deepEqual(calendarRows.find(x => x.row_id === 'CAL-23').selector.stage_ids, []);
  assert.throws(() => createV12RowSelectorTable({ inputs: { ...inputs, matrix: { ...inputs.matrix, rows: [...inputs.matrix.rows.slice(1), inputs.matrix.rows[1]] } } }), /row_resolver_.*matrix/);
});

for (const [body, expected] of [['', 'PASS'], ['<failure/>', 'FAIL'], ['<error/>', 'FAIL'], ['<skipped/>', 'REVIEW_REQUIRED']]) {
  test(`JUnit concrete result ${expected}: ${body || 'executed'}`, () => {
    const entries = parseV12SourceJUnit(`<testsuite><testcase name="case-1">${body}</testcase></testsuite>`, ['case-1']);
    assert.equal(entries[0].result, expected);
  });
}
test('JUnit NOT_RUN requires an explicit registry state and failure always wins', () => {
  const xml = '<testsuite><testcase name="case-1"><skipped/></testcase></testsuite>';
  assert.equal(parseV12SourceJUnit(xml, ['case-1'], { 'case-1': 'NOT_RUN' })[0].result, 'NOT_RUN');
  assert.equal(parseV12SourceJUnit(xml.replace('<skipped/>', '<error/><skipped/>'), ['case-1'], { 'case-1': 'NOT_RUN' })[0].result, 'FAIL');
});
test('JUnit rejects missing, unknown, duplicate and malformed selectors', () => {
  for (const xml of ['<testsuite/>', '<testsuite><testcase name="other"/></testsuite>', '<testsuite><testcase name="case-1"/><testcase name="case-1"/></testsuite>', '<testsuite><testcase name="case-1">', '<!DOCTYPE testsuite><testsuite><testcase name="case-1"/></testsuite>']) {
    assert.throws(() => parseV12SourceJUnit(xml, ['case-1']), /row_resolver_.*junit/);
  }
});
test('count-only SQLite receipts cannot certify ten concrete cases', () => {
  const receipt = { schema_version: 1, producer: 'v12-sqlite-shard', cases: 4, digest: 'a'.repeat(64) };
  const result = resolveV12SqliteReceipt(receipt, 'migration');
  assert.equal(result.result, 'REVIEW_REQUIRED');
  assert.match(result.reason, /case.*status/);
  assert.throws(() => resolveV12SqliteReceipt({ ...receipt, cases: 3 }, 'migration'), /row_resolver_sqlite/);
});
test('performance gates retain explicit unreviewed Garmin baseline', () => {
  const gates = resolveV12PerformanceGates({ summary: { gates: {
    garmin_sync_normalization: { result: 'REVIEW_REQUIRED', reason: 'Source budget requires the fresh exact-source Phase 20 baseline.' },
    warm_launch_to_interactive: { result: 'PASS', samples: 20, measured: 100, limit: 1000, metric: 'max' },
  } } });
  assert.equal(gates.garmin_sync_normalization.result, 'REVIEW_REQUIRED');
  assert.equal(gates.warm_launch_to_interactive.result, 'PASS');
});
for (const expected of ['PASS', 'FAIL', 'NOT_RUN', 'REVIEW_REQUIRED']) {
  test(`performance resolver reads published ${expected} classification`, () => {
    assert.equal(resolveV12PerformanceGates({ summary: { gates: {
      warm_launch_to_interactive: { result: expected },
    } } }).warm_launch_to_interactive.result, expected);
  });
}
test('multi-plan registry reads the complete source array, not just its first string', () => {
  const source = readFileSync('src/testing/contracts/multiPlanRunning.contract.ts', 'utf8');
  assert.match(source, /MULTI_PLAN_RUNNING_CONTRACT_CASES/);
  const table = createV12RowSelectorTable({ inputs });
  assert.ok(table.filter(x => x.row_id.startsWith('DOM')).some(x => x.selector.id === 'phase13-merge-rebuild'));
});

test('Calendar resolver accepts only source-bound default-launcher origin', () => {
  const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
  const origin = {
    schema_version: 1,
    action: 'calendar',
    kind: 'production-default-launcher',
    toolchain_origin: 'production-attested/v1',
    default_launcher: true,
    test_only: false,
    adapter_source_sha256: digest('scripts/v12-native-adapter.mjs'),
    launcher_source_sha256: digest('scripts/v12-production-native-adapter-launcher.mjs'),
    domain_source_sha256: digest('scripts/v12-production-native-calendar-action.mjs'),
    request_attestation_sha256: 'a'.repeat(64),
  };
  assert.equal(validateV12CalendarExecutionOrigin(origin), true);
  for (const mutate of [
    (value) => { value.kind = 'test-fixture'; value.default_launcher = false; value.test_only = true; },
    (value) => { value.adapter_source_sha256 = '0'.repeat(64); },
    (value) => { value.launcher_source_sha256 = '0'.repeat(64); },
    (value) => { value.domain_source_sha256 = '0'.repeat(64); },
    (value) => { value.action = 'release-lease'; },
  ]) {
    const changed = structuredClone(origin); mutate(changed);
    assert.throws(() => validateV12CalendarExecutionOrigin(changed), /row_resolver_calendar_origin_invalid/u);
  }
});

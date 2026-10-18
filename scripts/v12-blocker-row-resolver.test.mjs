import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadV12ContractInputs, V12_CONFIG_IDS } from './v12-evidence-contract.mjs';
import { createHash } from 'node:crypto';
import {
  createV12RowSelectorTable,
  createV12GarminAuthenticatedMember,
  parseV12SourceJUnit,
  resolveV12DomContract,
  resolveV12GarminRequirement,
  resolveV12PerformanceGates,
  resolveV12ProgressContract,
  resolveV12ShellRequirement,
  resolveV12SqliteReceipt,
  validateV12CalendarExecutionOrigin,
  V12_GARMIN_REQUIREMENT_REGISTRY,
  V12_PROGRESS_REQUIREMENT_REGISTRY,
} from './v12-blocker-row-resolver.mjs';
import { createV12ShellRequirementEvidence } from './v12-shell-requirement-evidence.mjs';
import { phase14ShellEvidenceFixture } from './testing/v12-phase14-shell-evidence-fixture.mjs';

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
  assert.equal(dom.every(x => x.selector.type === 'dom-contract' && x.selector.native_case_ids.length > 0), true);
  assert.deepEqual(dom.find(x => x.row_id === 'DOM-03').selector.native_case_ids, [
    'fresh-migration', 'schema27-upgrade', 'supported-legacy-upgrade', 'failure-reopen', 'restore', 'immutable-history',
  ]);
  assert.deepEqual(dom.find(x => x.row_id === 'DOM-15').selector.native_case_ids, [
    'backup', 'restore', 'merge', 'noop-replay', 'rebuild', 'immutable-history',
  ]);
  assert.equal(table.find(x => x.row_id === 'WRK-36').selector.id, 'workout.completion-writeback');
  assert.equal(table.find(x => x.row_id === 'LIB-36').selector.id, 'library.running-conflict');
  const shell = table.filter(x => x.row_id.startsWith('SHL-'));
  assert.deepEqual(shell.map(x => x.selector.id), [
    'shell.four-roots', 'shell.root-state', 'shell.appearance', 'shell.tokens',
    'shell.sheets', 'shell.toasts', 'shell.launch', 'shell.rest-alerts',
    'shell.settings-deep-links', 'shell.removed-sessions', 'shell.data-recovery',
    'shell.automatic-backup', 'shell.manual-backup',
  ]);
  assert.ok(shell.every(x => x.selector.type === 'shell-requirement'
    && Array.isArray(x.selector.action_ids)
    && Array.isArray(x.selector.postcondition_ids)
    && !Object.hasOwn(x.selector, 'ordinal_state')));
  const garmin = table.filter(x => x.row_id.startsWith('GAR-'));
  assert.deepEqual(garmin.map(x => x.selector.id), Object.keys(V12_GARMIN_REQUIREMENT_REGISTRY));
  assert.ok(garmin.every(x => x.selector.type === 'garmin-requirement'
    && x.selector.domain_case_ids.length > 0
    && x.selector.ui_action_ids.length > 0
    && x.selector.readback_case_ids.length > 0));
  const progress = table.filter(x => x.row_id.startsWith('PRO-'));
  assert.deepEqual(progress.map(x => x.selector.id), Object.values(V12_PROGRESS_REQUIREMENT_REGISTRY));
  assert.ok(progress.every(x => x.selector.type === 'progress-contract'
    && x.selector.shard === 'sqlite-source'));
  assert.equal(progress.some(x => x.selector.type === 'performance-budget'), false);
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

test('SHL resolver is requirement keyed and rejects missing, duplicate, or stale receipts independent of order', () => {
  const selector = createV12RowSelectorTable({ inputs }).find(x => x.row_id === 'SHL-01').selector;
  const identity = {
    run_id: 'phase20-20261017T000000Z-aaaaaaaaaaaa',
    source_tree_sha256: 'a'.repeat(64), apk_sha256: 'b'.repeat(64),
    installed_apk_sha256: 'b'.repeat(64), device_identity_sha256: 'c'.repeat(64),
    configuration_id: 'AP-L-C390-P-F100',
  };
  const manifest = {
    run_id: identity.run_id,
    source: { head: 'd'.repeat(40), tree_sha256: identity.source_tree_sha256 },
    build: { package: 'com.fchoo.gymtracker.devtest', apk: { sha256: identity.apk_sha256, size_bytes: 1 } },
    device: { installed_apk_sha256: identity.installed_apk_sha256, identity_sha256: identity.device_identity_sha256 },
    configuration: { id: identity.configuration_id },
  };
  const phase14 = phase14ShellEvidenceFixture(manifest);
  const receipts = createV12ShellRequirementEvidence(phase14.evidence, phase14.phase14Manifest, manifest);
  const receipt = receipts.find((entry) => entry.requirement_id === 'SHL-01');
  assert.equal(resolveV12ShellRequirement(selector, [receipt], identity).result, 'PASS');
  assert.equal(resolveV12ShellRequirement(selector, [structuredClone(receipt)].reverse(), identity).result, 'PASS');
  assert.throws(() => resolveV12ShellRequirement(selector, [], identity), /shell_receipt_missing/u);
  assert.throws(() => resolveV12ShellRequirement(selector, [receipt, receipt], identity), /shell_receipt_duplicate/u);
  const stale = structuredClone(receipt); stale.run_id = 'phase20-20261018T000000Z-bbbbbbbbbbbb';
  assert.throws(() => resolveV12ShellRequirement(selector, [stale], identity), /shell_receipt_identity_invalid/u);
  const wrongAction = structuredClone(receipt); wrongAction.action_receipts[0].action_id = 'generic-accessibility-pass';
  assert.throws(() => resolveV12ShellRequirement(selector, [wrongAction], identity), /shell_receipt_invalid/u);
  for (const requirement of ['SHL-01', 'SHL-13']) {
    const selected = createV12RowSelectorTable({ inputs }).find(x => x.row_id === requirement).selector;
    assert.throws(() => resolveV12ShellRequirement(selected, [], identity), /shell_receipt_missing/u,
      `${requirement} cannot close from generic accessibility PASS alone`);
  }
});

test('GAR resolver requires the explicit domain, UI action, and readback members regardless of artifact order', () => {
  const selector = createV12RowSelectorTable({ inputs }).find(x => x.row_id === 'GAR-14').selector;
  const runIdentity = {
    run_id: 'phase20-20261017T000000Z-aaaaaaaaaaaa', source_tree_sha256: 'a'.repeat(64),
    apk_sha256: 'b'.repeat(64), installed_apk_sha256: 'b'.repeat(64), device_identity_sha256: 'c'.repeat(64),
    configuration_id: 'AP-L-C390-P-F100',
  };
  const artifact = (id) => ['match-zero', 'match-one', 'match-many', 'match-stale', 'match-alternate', 'match-cancel', 'match-confirm', 'match-reassign'].includes(id)
    ? 'garmin/matching.json' : 'garmin/packaging-auth.json';
  const member = (kind, id, state = 'PASS') => {
    const paths = kind === 'ui' ? ['comparison/index.json', 'screenshots/index.json']
      : kind === 'readback' ? [artifact(id), 'maestro/garmin-progress.xml'] : [artifact(id)];
    const bindings = paths.map((relative, index) => ({
      artifact: `artifacts/native/v1.2/${runIdentity.run_id}/${relative}`,
      sha256: String(index + 1).repeat(64),
    }));
    const facts = kind === 'ui'
      ? { state_id: id, configuration_ids: V12_CONFIG_IDS, visual_results: [] }
      : { case_id: id, status: state, code: `${id}-observed`, count: 1,
        native_receipt_sha256: 'd'.repeat(64), binding_sha256: 'e'.repeat(64), artifact_path: artifact(id),
        artifact_sha256: bindings[0].sha256,
        ...(kind === 'readback' ? { junit: { testcase: id, result: state } } : { producer: 'v12-garmin-shard/v3', schema: 'matching/v1' }) };
    return createV12GarminAuthenticatedMember({ kind, id, result: state, runIdentity, bindings, facts });
  };
  const required = [
    ...selector.domain_case_ids.map(id => [`garmin-domain:${id}`, member('domain', id)]),
    ...selector.ui_action_ids.map(id => [`garmin-ui:${id}`, member('ui', id)]),
    ...selector.readback_case_ids.map(id => [`garmin-readback:${id}`, member('readback', id)]),
  ];
  const members = new Map(required.reverse());
  assert.equal(resolveV12GarminRequirement(selector, key => members.get(key), runIdentity).result, 'PASS');
  const failingId = selector.domain_case_ids[0];
  members.set(`garmin-domain:${failingId}`, member('domain', failingId, 'FAIL'));
  assert.equal(resolveV12GarminRequirement(selector, key => members.get(key), runIdentity).result, 'FAIL');
  members.set(`garmin-domain:${failingId}`, member('domain', failingId));
  members.delete(`garmin-readback:${selector.readback_case_ids[0]}`);
  assert.throws(() => resolveV12GarminRequirement(selector, key => members.get(key), runIdentity), /selector_unknown/u);
  members.set(`garmin-readback:${selector.readback_case_ids[0]}`, member('readback', selector.readback_case_ids[0]));

  const oneWrongDomain = member('domain', selector.domain_case_ids[0]);
  assert.throws(() => resolveV12GarminRequirement(selector, () => oneWrongDomain, runIdentity), /garmin_member_invalid/u,
    'one wrong garmin-domain member cannot satisfy every lookup');
  const crossKind = new Map(members);
  crossKind.set(`garmin-ui:${selector.ui_action_ids[0]}`, member('domain', selector.domain_case_ids[0]));
  assert.throws(() => resolveV12GarminRequirement(selector, key => crossKind.get(key), runIdentity), /garmin_member_invalid/u);
  const reused = new Map(members);
  const readbackKey = `garmin-readback:${selector.readback_case_ids[0]}`;
  const reusedReadback = structuredClone(reused.get(readbackKey));
  reusedReadback.receipt.receipt_sha256 = reused.get(`garmin-domain:${selector.domain_case_ids[0]}`).receipt.receipt_sha256;
  reused.set(readbackKey, reusedReadback);
  assert.throws(() => resolveV12GarminRequirement(selector, key => reused.get(key), runIdentity), /garmin_receipt_invalid|garmin_receipt_reused/u);
  for (const mutate of [
    (value) => { value.id = 'wrong-id'; },
    (value) => { value.type = 'garmin-authoritative-readback'; },
    (value) => { value.bindings[0].artifact = value.bindings[0].artifact.replace('matching.json', 'dedupe.json'); },
    (value) => { value.run_identity.run_id = 'phase20-20261018T000000Z-bbbbbbbbbbbb'; },
  ]) {
    const substituted = new Map(members);
    const key = `garmin-domain:${selector.domain_case_ids[0]}`;
    const value = structuredClone(substituted.get(key)); mutate(value); substituted.set(key, value);
    assert.throws(() => resolveV12GarminRequirement(selector, lookup => substituted.get(lookup), runIdentity), /garmin_/u);
  }
  assert.throws(() => resolveV12GarminRequirement({ ...selector, domain_case_ids: [selector.domain_case_ids[0], selector.domain_case_ids[0]] },
    key => members.get(key), runIdentity), /garmin_selector_invalid/u);
});

test('PRO registry is exact and independent from performance gate mutations', () => {
  assert.deepEqual(Object.keys(V12_PROGRESS_REQUIREMENT_REGISTRY), Array.from({ length: 18 }, (_, index) => `PRO-${String(index + 1).padStart(2, '0')}`));
  assert.equal(V12_PROGRESS_REQUIREMENT_REGISTRY['PRO-01'], 'progress-pro01-sport-range');
  assert.equal(V12_PROGRESS_REQUIREMENT_REGISTRY['PRO-18'], 'progress-pro18-bodyweight-editor');
  const table = createV12RowSelectorTable({ inputs });
  const pro = table.find(x => x.row_id === 'PRO-01');
  assert.equal(pro.selector.id, 'progress-pro01-sport-range');
  assert.notEqual(pro.selector.id, Object.keys(resolveV12PerformanceGates({ summary: { gates: { warm_launch_to_interactive: { result: 'FAIL' } } } }))[0]);
  const members = new Map([[`sqlite-source:progress-parity:${pro.selector.id}`, {
    registry: 'progress-parity', id: pro.selector.id, result: 'FAIL',
  }]]);
  assert.equal(resolveV12ProgressContract(pro.selector, key => members.get(key)).result, 'FAIL');
  members.set('sqlite-source:progress-parity:progress-pro02-all', {
    registry: 'progress-parity', id: 'progress-pro02-all', result: 'PASS',
  });
  assert.equal(resolveV12ProgressContract(pro.selector, key => members.get(key)).result, 'FAIL', 'unrelated progress evidence cannot close PRO-01');
  const pro02 = table.find(x => x.row_id === 'PRO-02');
  assert.equal(resolveV12ProgressContract(pro02.selector, key => members.get(key)).result, 'PASS', 'the matching progress failure affects only its exact PRO row');
});

test('DOM resolver combines the UI journey with every exact native SQLite case', () => {
  const selector = {
    type: 'dom-contract', shard: 'multi-plan', id: 'phase13-map01-activation',
    native_case_ids: ['schema27-upgrade', 'restore', 'merge'],
    source_case_ids: ['phase13-map01-activation'],
  };
  const members = new Map([
    ['multi-plan:phase13-map01-activation', { id: 'phase13-map01-activation', result: 'PASS' }],
    ['sqlite-source:multi-plan-running:phase13-map01-activation', { id: 'phase13-map01-activation', result: 'PASS' }],
    ['sqlite-case:schema27-upgrade', { id: 'schema27-upgrade', result: 'PASS' }],
    ['sqlite-case:restore', { id: 'restore', result: 'FAIL' }],
    ['sqlite-case:merge', { id: 'merge', result: 'PASS' }],
  ]);
  assert.equal(resolveV12DomContract(selector, (key) => members.get(key)).result, 'FAIL');
  members.delete('sqlite-case:restore');
  assert.throws(() => resolveV12DomContract(selector, (key) => members.get(key)), /row_resolver_selector_unknown/u);
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
test('SQLite resolver passes only exact bounded ordered all-passed case facts', () => {
  const caseFacts = [
    'fresh-migration', 'schema27-upgrade', 'supported-legacy-upgrade', 'failure-reopen',
  ].map((id, order) => ({ id, order, status: 'passed',
    source_facts: [{ registry: 'sqlite-kernel', cases: [{ id: 'connection-configuration', status: 'passed' }] }],
    digest: createHash('sha256').update(id).digest('hex') }));
  const receipt = {
    schema_version: 1,
    producer: 'v12-sqlite-shard',
    identity: {
      source_digest: 'a'.repeat(64), fixture_digest: 'b'.repeat(64),
      apk_digest: 'c'.repeat(64), installed_apk_digest: 'c'.repeat(64), device_digest: 'd'.repeat(64),
    },
    cases: caseFacts.length,
    case_facts: caseFacts,
    all_passed: true,
    digest: createHash('sha256').update(JSON.stringify(caseFacts)).digest('hex'),
  };
  assert.deepEqual(resolveV12SqliteReceipt(receipt, 'migration'), {
    result: 'PASS',
    case_ids: caseFacts.map(({ id }) => id),
    case_facts: caseFacts,
    digest: receipt.digest,
  });

  for (const mutate of [
    (value) => { value.cases = 3; },
    (value) => { value.case_facts.reverse(); },
    (value) => { value.case_facts[0].order = 1; },
    (value) => { value.case_facts[0].status = 'failed'; },
    (value) => { value.case_facts[0].source_facts[0].cases[0].status = 'failed'; },
    (value) => { value.case_facts[0].source_facts[0].cases.push(structuredClone(value.case_facts[0].source_facts[0].cases[0])); },
    (value) => { value.case_facts[0].source_facts.push(structuredClone(value.case_facts[0].source_facts[0])); },
    (value) => { value.case_facts[0].source_facts = []; },
    (value) => { value.case_facts[0].digest = '0'.repeat(64); },
    (value) => { value.all_passed = false; },
    (value) => { value.digest = '0'.repeat(64); },
  ]) {
    const changed = structuredClone(receipt);
    mutate(changed);
    assert.throws(() => resolveV12SqliteReceipt(changed, 'migration'), /row_resolver_sqlite/);
  }
  assert.throws(
    () => resolveV12SqliteReceipt({ schema_version: 1, producer: 'v12-sqlite-shard', cases: 4, digest: 'a'.repeat(64) }, 'migration'),
    /row_resolver_sqlite/,
  );
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

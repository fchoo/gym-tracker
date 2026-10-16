/** Phase 20 consumer-owned selectors. Producers supply observations, never row verdicts. */
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { V12_CONFIG_IDS, V12_BROWSER_WALK_STATE_IDS } from './v12-evidence-contract.mjs';
import { verifyV12ComparisonRecord } from './compare-v12-visual.mjs';
import { V12_MAESTRO_FLOW_CONTRACTS } from './run-v12-maestro.mjs';
import { V12_CALENDAR_SHARD_STAGE_IDS } from './v12-calendar-shard.mjs';
import { V12_GARMIN_SHARD_CASE_IDS } from './v12-garmin-shard.mjs';
import { V12_SQLITE_SHARD_CASE_IDS } from './v12-sqlite-shard.mjs';
import { V12_RECOVERY_CASE_IDS, V12_RECOVERY_CUT_IDS, V12_RECOVERY_UNCOMMITTED_CUT_IDS, validateV12RecoveryShard } from './v12-recovery-shard.mjs';
import { V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD, nearestRankP95 } from './benchmark-v12-interactions.mjs';
import { validateV12PerformanceShard } from './v12-performance-shard.mjs';

const HASH = /^[a-f0-9]{64}$/u;
const RESULTS = ['FAIL', 'REVIEW_REQUIRED', 'NOT_RUN', 'PASS'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonHash = value => sha(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = code => { throw new Error(`v12_row_resolver_${code}`); };
const ensure = (condition, code) => { if (!condition) fail(code); };
const result = value => {
  const normalized = ({ passed: 'PASS', failed: 'FAIL', pending_human: 'NOT_RUN' })[value] ?? value;
  ensure(RESULTS.includes(normalized), 'result_invalid');
  return normalized;
};
export const combineV12SourceResults = values => {
  ensure(values.length > 0, 'empty_result_set');
  values.forEach(result);
  return RESULTS.find(state => values.includes(state));
};
function exactIds(actual, expected, code) {
  ensure(Array.isArray(actual) && same(actual, expected) && new Set(actual).size === actual.length, code);
}

export function readV12FunctionalRegistry(shard, root = process.cwd()) {
  const contract = V12_MAESTRO_FLOW_CONTRACTS[shard];
  ensure(contract?.prefix, 'registry_invalid');
  const text = readFileSync(path.join(root, contract.sources[0]), 'utf8');
  // Phase 13 is a flat exported array; phases 15/17 are ordered [id, assertion] tuples.
  const block = shard === 'multi-plan' ? /export const MULTI_PLAN_RUNNING_CONTRACT_CASES = \[([\s\S]*?)\] as const/u.exec(text)?.[1] : text;
  ensure(typeof block === 'string', 'registry_invalid');
  const expression = shard === 'multi-plan' ? /["'](phase13-[^"']+)["']/gu : /\[\s*["']([^"']+)["']/gu;
  const ids = [...new Set([...block.matchAll(expression)].map(match => match[1]).filter(id => id.startsWith(contract.prefix)))];
  ensure(ids.length === ({ 'multi-plan': 13, workout: 42, 'library-running': 46 })[shard]
    && new Set(ids).size === ids.length, 'registry_drift');
  return ids;
}

const DOM_CASES = [1, 1, 0, 2, 2, 3, 2, 2, 2, 4, 7, 6, 11, 8, 10, 3, 5];
// Reuse is explicit: these rows share an executed transaction/fixture contract.
const DOM_SHARED = {
  1: 'MAP-01 activation and inactive-plan persistence share the activation transaction fixture.',
  2: 'Running structure, advisory goal fields and independent schedule/overlap rows share the two-slot running fixture.',
  3: 'Occurrence selection and offline commit acknowledgement share the completion/retry transaction fixture.',
};
const SHL_STATES = [2, 34, 1, 61, 9, 17, 8, 10, 84, 83, 86, 88, 90];
const CAL_STAGES = [24, 34, 26, 33, 22, 25, 0, 2, 6, 13, 17, 20, 21, 23, 32, 18, 19, 27, 28, 29, 31, 30, 16];
const GAR_CASES = [0, 1, 5, 4, 2, 3, 17, 6, 7, 8, 9, 11, 10, 15, 12, 14];
const PERFORMANCE_GATES = [...Object.keys(V12_PERFORMANCE_BUDGETS), 'phase12_merge_peak_growth'];
const VER_GATES = ['inventory', 'appearance', 'viewports', 'targets', 'input-focus', 'reduced-motion', 'sqlite', 'recovery', 'calendar', 'garmin', 'performance', 'attended', 'preseal'];

export function createV12RowSelectorTable({ inputs, root = process.cwd() }) {
  const phases = { DOM: [13, 17], SHL: [14, 13], WRK: [15, 36], CAL: [16, 23], LIB: [17, 36], GAR: [18, 16], PRO: [19, 18], VER: [20, 13] };
  const expected = Object.entries(phases).flatMap(([prefix, [, count]]) => Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`));
  exactIds(inputs?.matrix?.rows?.map(row => row.requirement_id), expected, 'matrix_invalid');
  const functional = Object.fromEntries(['multi-plan', 'workout', 'library-running'].map(shard => [shard, readV12FunctionalRegistry(shard, root)]));
  const table = inputs.matrix.rows.map(row => {
    const [prefix, suffix] = row.requirement_id.split('-'); const ordinal = Number(suffix) - 1;
    ensure(row.owning_phase === phases[prefix][0], 'matrix_phase_invalid');
    let type, id, shard, shared_contract;
    if (prefix === 'DOM') { type = 'functional-case'; shard = 'multi-plan'; id = functional[shard][DOM_CASES[ordinal]]; shared_contract = DOM_SHARED[DOM_CASES[ordinal]]; }
    if (prefix === 'WRK' || prefix === 'LIB') { type = 'functional-case'; shard = prefix === 'WRK' ? 'workout' : 'library-running'; id = functional[shard][ordinal]; }
    if (prefix === 'SHL') { type = 'comparison-state'; shard = 'visual'; id = `BW-${String(SHL_STATES[ordinal]).padStart(3, '0')}`; }
    if (prefix === 'CAL') { type = 'calendar-stage'; shard = 'calendar'; id = V12_CALENDAR_SHARD_STAGE_IDS[CAL_STAGES[ordinal]]; }
    if (prefix === 'GAR') { type = 'garmin-case'; shard = 'garmin'; id = V12_GARMIN_SHARD_CASE_IDS[GAR_CASES[ordinal]]; }
    if (prefix === 'PRO') { type = 'performance-budget'; shard = 'performance'; id = PERFORMANCE_GATES[ordinal]; }
    if (prefix === 'VER') { type = 'phase20-gate'; shard = 'verification'; id = VER_GATES[ordinal]; }
    ensure(type && id && typeof row.acceptance_contract === 'string', 'selector_unknown');
    return { row_id: row.requirement_id, owning_phase: row.owning_phase, ordinal: ordinal + 1,
      selector: { type, shard, id, contract: row.acceptance_contract, ...(shared_contract ? { shared_contract } : {}) } };
  });
  const seen = new Map();
  for (const entry of table) {
    const key = `${entry.selector.type}:${entry.selector.shard}:${entry.selector.id}`;
    if (seen.has(key)) ensure(entry.selector.shared_contract && entry.selector.shared_contract === seen.get(key), 'selector_duplicate');
    seen.set(key, entry.selector.shared_contract);
  }
  return table;
}

function xmlAttributes(text) {
  const attrs = {};
  const rest = text.replace(/([\w:.-]+)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')/gu, (_, key, a, b) => {
    ensure(!Object.hasOwn(attrs, key), 'junit_attribute_duplicate');
    attrs[key] = (a ?? b).replace(/&(amp|quot|apos|lt|gt);/gu, (_, entity) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' })[entity]);
    return '';
  });
  ensure(rest.trim() === '', 'junit_attribute_invalid');
  return attrs;
}

/** Bounded JUnit reader: reject malformed nesting, entities and unrecognized case sets. */
export function parseV12SourceJUnit(xml, expectedIds, states = {}) {
  ensure(typeof xml === 'string' && xml.length > 0 && !/<!DOCTYPE|<!ENTITY/iu.test(xml), 'junit_invalid');
  const stack = []; const entries = []; let current;
  const tokens = /<\?xml\b[^?]*\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<([^<>]+)>/gu;
  let end = 0;
  for (const match of xml.matchAll(tokens)) {
    ensure(!xml.slice(end, match.index).includes('<'), 'junit_invalid'); end = match.index + match[0].length;
    if (!match[1]) continue;
    const closing = match[1].startsWith('/'); const selfClosing = match[1].endsWith('/');
    const content = match[1].replace(/^\/|\/$/gu, '').trim(); const name = /^[\w:.-]+/u.exec(content)?.[0];
    ensure(name, 'junit_invalid');
    if (closing) { ensure(content === name && stack.pop() === name, 'junit_nesting_invalid'); if (name === 'testcase') { entries.push(current); current = undefined; } continue; }
    const attrs = xmlAttributes(content.slice(name.length));
    if (name === 'testcase') { ensure(!current && stack.includes('testsuite') && attrs.name, 'junit_case_invalid'); current = { id: attrs.name, properties: {}, failure: false, skipped: false }; }
    if (['failure', 'error', 'skipped'].includes(name)) ensure(current, 'junit_unassociated_result');
    if (current && ['failure', 'error'].includes(name)) current.failure = true;
    if (current && name === 'skipped') current.skipped = true;
    if (current && name === 'property') { ensure(attrs.name && !Object.hasOwn(current.properties, attrs.name), 'junit_property_invalid'); current.properties[attrs.name] = attrs.value; }
    if (!selfClosing) stack.push(name);
    else if (name === 'testcase') { entries.push(current); current = undefined; }
  }
  ensure(stack.length === 0 && !current && xml.slice(end).trim() === '', 'junit_nesting_invalid');
  exactIds(entries.map(entry => entry.id), expectedIds, 'junit_selectors_invalid');
  return entries.map(entry => ({ ...entry, result: entry.failure ? 'FAIL' : entry.skipped ? states[entry.id] === 'NOT_RUN' ? 'NOT_RUN' : 'REVIEW_REQUIRED' : states[entry.id] ? result(states[entry.id]) : 'PASS' }));
}

export function resolveV12SqliteReceipt(value, group) {
  const bounds = { migration: [0, 4], portability: [4, 8], history: [8, 10] }[group];
  ensure(bounds && value?.schema_version === 1 && value.producer === 'v12-sqlite-shard'
    && value.cases === bounds[1] - bounds[0] && HASH.test(value.digest ?? ''), 'sqlite_receipt_invalid');
  // The current producer intentionally discards its native case statuses. A
  // count and an opaque digest cannot be reverse-engineered into ten PASSes.
  return { result: 'REVIEW_REQUIRED', case_ids: V12_SQLITE_SHARD_CASE_IDS.slice(...bounds), reason: 'Retained receipt omits concrete case statuses.' };
}

function numericGate(values, minimum, maximum, metric = 'p95') {
  if (!Array.isArray(values) || values.length === 0) return { result: 'NOT_RUN' };
  if (values.some(value => !Number.isFinite(value) || value < 0)) return { result: 'FAIL' };
  const measured = metric === 'max' ? Math.max(...values) : nearestRankP95(values);
  return { result: measured > maximum ? 'FAIL' : values.length < minimum ? 'REVIEW_REQUIRED' : 'PASS', samples: values.length, measured, limit: maximum, metric };
}
export function resolveV12PerformanceGates(observation) {
  const raw = observation?.raw_samples ?? {}; const gates = {};
  for (const [id, budget] of Object.entries(V12_PERFORMANCE_BUDGETS)) {
    if (id === 'garmin_sync_normalization') {
      const value = raw[id];
      gates[id] = { result: value?.state === 'REVIEW_REQUIRED' && value.limit_source === budget.limit_source && HASH.test(value.fixture_sha256 ?? '') ? 'REVIEW_REQUIRED' : value === undefined ? 'NOT_RUN' : 'FAIL', reason: 'Source budget requires the reviewed Phase 18 baseline.' };
    } else if (id === 'root_switch_to_useful' || id === 'input_response') {
      const grouped = raw[`${id}_ms`];
      const keys = id === 'root_switch_to_useful' ? ['workout', 'calendar', 'library', 'progress'] : Object.keys(grouped ?? {});
      const members = keys.map(key => ({ id: key, ...numericGate(grouped?.[key], budget.minimum_samples_per_root ?? budget.minimum_samples_per_path, budget.maximum_p95_ms) }));
      gates[id] = { result: members.length ? combineV12SourceResults(members.map(x => x.result)) : 'NOT_RUN', members };
    } else if (id === 'calendar_frame_work') {
      const sequences = raw.calendar_frame_sequences;
      const valid = Array.isArray(sequences) && sequences.every(s => Array.isArray(s.frame_work_ms) && s.frame_work_ms.length && s.frame_work_ms.every(x => Number.isFinite(x) && x >= 0) && Number.isInteger(s.missed_frames) && s.missed_frames >= 0 && Number.isFinite(s.refresh_rate_hz) && s.refresh_rate_hz > 0 && Number.isFinite(s.profiler_overhead_ms) && s.profiler_overhead_ms >= 0);
      gates[id] = !sequences ? { result: 'NOT_RUN' } : !valid ? { result: 'FAIL' } : numericGate(sequences.map(s => Math.max(...s.frame_work_ms)), budget.minimum_sequences, budget.maximum_p95_ms);
    } else gates[id] = numericGate(raw[`${id}_ms`], budget.minimum_samples, budget.maximum_ms ?? budget.maximum_p95_ms, budget.maximum_ms === undefined ? 'p95' : 'max');
  }
  gates.phase12_merge_peak_growth = numericGate(raw.phase12_merge_peak_growth_bytes, V12_PERFORMANCE_BUDGETS.phase12_merge_preflight.minimum_samples, V12_PERFORMANCE_BUDGETS.phase12_merge_preflight.maximum_peak_growth_bytes);
  return gates;
}

/** Resolve the complete source graph once; every leaf is tied to actual bytes. */
export function resolveV12SourceRows({ inputs, manifest, root = process.cwd(), readArtifact, attended } = {}) {
  const table = createV12RowSelectorTable({ inputs, root });
  const prefix = `artifacts/native/v1.2/${manifest.run_id}/`;
  ensure(V12_CONFIG_IDS.includes(manifest.configuration?.id), 'configuration_invalid');
  const read = readArtifact ?? (relative => readFileSync(path.join(root, relative)));
  const cache = new Map(); const hashes = new Map(); const leaves = new Map();
  function bytes(relative) {
    ensure(typeof relative === 'string' && relative.startsWith(prefix) && !relative.includes('\\') && !relative.split('/').some(p => !p || p === '.' || p === '..'), 'artifact_path_invalid');
    if (!cache.has(relative)) { const value = read(relative); ensure(Buffer.isBuffer(value) && value.length > 0, 'artifact_bytes_invalid'); cache.set(relative, value); }
    return cache.get(relative);
  }
  // Thousands of visual selectors bind the same indexes. Hash each immutable
  // artifact snapshot once; never retain hashes across resolver invocations.
  function artifactHash(relative) {
    if (!hashes.has(relative)) hashes.set(relative, sha(bytes(relative)));
    return hashes.get(relative);
  }
  const full = relative => `${prefix}${relative}`;
  function json(relative) { try { return JSON.parse(bytes(full(relative))); } catch (error) { if (error.message.startsWith('v12_row_resolver_')) throw error; fail('artifact_json_invalid'); } }
  function bindIdentity(identity, kind = 'digest') {
    const expected = kind === 'digest'
      ? { source_digest: manifest.source.tree_sha256, fixture_digest: manifest.fixtures.registry_sha256, apk_digest: manifest.build.apk.sha256, installed_apk_digest: manifest.device.installed_apk_sha256, device_digest: manifest.device.identity_sha256 }
      : { source_tree_sha256: manifest.source.tree_sha256, apk_sha256: manifest.build.apk.sha256, installed_apk_sha256: manifest.device.installed_apk_sha256, device_identity_sha256: manifest.device.identity_sha256 };
    ensure(identity && Object.entries(expected).every(([key, value]) => identity[key] === value), 'identity_invalid');
    for (const [key, expected] of Object.entries({ settings_digest: manifest.device.settings_sha256, restoration_digest: manifest.device.restoration_sha256 })) if (Object.hasOwn(identity, key)) ensure(identity[key] === expected, 'configuration_invalid');
    if (Object.hasOwn(identity, 'configuration_id')) ensure(identity.configuration_id === manifest.configuration.id, 'configuration_invalid');
  }
  function leaf(key, type, id, state, artifacts, metadata = {}) {
    ensure(!leaves.has(key), 'selector_duplicate');
    const value = { type, id, result: result(state), ...metadata, bindings: [...new Set(artifacts)].map(relative => ({ artifact: full(relative), sha256: artifactHash(full(relative)) })) };
    leaves.set(key, value); return value;
  }
  const group = (keys, id) => ({ type: 'acceptance-gate', id, shared_contract: 'This verification gate requires every listed concrete source result; constituent results may also close their source-owned requirement rows.', result: combineV12SourceResults(keys.map(key => { ensure(leaves.has(key), 'selector_unknown'); return leaves.get(key).result; })), members: keys.map(key => leaves.get(key)) });
  ensure(same(json('build.json'), manifest), 'build_binding_invalid');
  for (const shard of ['multi-plan', 'workout', 'library-running']) {
    const mappingPath = `mapping/${shard}.json`; const xmlPath = `maestro/${shard}.xml`;
    const mapping = json(mappingPath); const contract = V12_MAESTRO_FLOW_CONTRACTS[shard]; const ids = readV12FunctionalRegistry(shard, root);
    ensure(mapping.run_id === manifest.run_id && mapping.shard === shard && ['v12-maestro-source-map/v1', 'v12-maestro-runner/v1'].includes(mapping.producer), 'functional_schema_invalid');
    bindIdentity(mapping.identity, 'sha');
    ensure(mapping.identity.configuration_id === manifest.configuration.id && mapping.identity.certificate_sha256 === manifest.build.apk.certificate_sha256 && mapping.identity.settings_sha256 === manifest.device.settings_sha256, 'configuration_invalid');
    exactIds(mapping.case_ids, ids, 'functional_selectors_invalid');
    exactIds(mapping.observations?.map(x => x.case_id), ids, 'functional_selectors_invalid');
    ensure(mapping.flow_sha256 === sha(readFileSync(path.join(root, contract.flow))) && same(Object.keys(mapping.source_sha256 ?? {}), contract.sources)
      && contract.sources.every(file => mapping.source_sha256[file] === sha(readFileSync(path.join(root, file)))), 'source_hash_invalid');
    const xml = bytes(full(xmlPath)).toString('utf8'); const tests = parseV12SourceJUnit(xml, ids);
    const reports = [...xml.matchAll(/(?:<\?xml[^?]*\?>)?<testsuite\b[^>]*>[\s\S]*?<\/testsuite>\s*/gu)].map(match => match[0]);
    ensure(reports.length === ids.length, 'functional_junit_reports_invalid');
    ids.forEach((id, index) => {
      const observation = mapping.observations[index];
      ensure(observation.ordinal === index + 1 && observation.fixture_id === 'v12-synthetic-fixtures-r18' && observation.report_sha256 === sha(reports[index]), 'functional_report_hash_invalid');
      leaf(`${shard}:${id}`, 'functional-case', id, tests[index].result, [mappingPath, xmlPath], { testcase: id, report_sha256: observation.report_sha256 });
    });
  }
  const calendar = json('calendar-transitions.json'); bindIdentity(calendar.identity);
  const calendarIds = V12_CALENDAR_SHARD_STAGE_IDS;
  ensure(calendar.run_id === manifest.run_id && calendar.producer === 'v12-calendar-shard/v3' && calendar.flow_revision === 'calendar-flow-r35'
    && calendar.identity.configuration_id === manifest.configuration.id
    && calendar.flow_sha256 === jsonHash(readFileSync(path.join(root, 'maestro/v1.2/calendar.yaml'))), 'calendar_schema_invalid');
  exactIds(calendar.stages?.map(x => x.id), calendarIds, 'calendar_selectors_invalid');
  exactIds(calendar.junit_cases?.map(x => x.id), calendarIds, 'calendar_selectors_invalid');
  const calendarTests = parseV12SourceJUnit(bytes(full('maestro/calendar.xml')).toString('utf8'), calendarIds, Object.fromEntries(calendar.stages.map(x => [x.id, result(x.status)])));
  calendar.stages.forEach((stage, index) => {
    ensure(stage.order === index && calendar.junit_cases[index].order === index && calendar.junit_cases[index].status === stage.status, 'calendar_order_invalid');
    const receipt = stage.receipt;
    exactIds(Object.keys(receipt ?? {}).sort(), ['content_width_dp', 'start_dp', 'end_dp', 'dx_dp', 'dy_dp', 'event_sequence', 'cancelled', 'settled', 'callback_count', 'semantic_transition', 'screenshot_sha256', 'trace_sha256', 'expected_outcome'].sort(), 'calendar_receipt_invalid');
    ensure(receipt?.expected_outcome === stage.id && HASH.test(receipt.trace_sha256 ?? '') && HASH.test(receipt.screenshot_sha256 ?? '') && Number.isFinite(receipt.content_width_dp) && receipt.content_width_dp > 0
      && Array.isArray(receipt.start_dp) && Array.isArray(receipt.end_dp) && receipt.start_dp.length === 2 && receipt.end_dp.length === 2 && receipt.start_dp.concat(receipt.end_dp).every(Number.isFinite)
      && Number.isFinite(receipt.dx_dp) && Number.isFinite(receipt.dy_dp) && Math.abs(receipt.end_dp[0] - receipt.start_dp[0] - receipt.dx_dp) <= 0.01 && Math.abs(receipt.end_dp[1] - receipt.start_dp[1] - receipt.dy_dp) <= 0.01
      && Array.isArray(receipt.event_sequence) && receipt.event_sequence.length >= 3 && receipt.event_sequence[0] === 'pointer-down' && receipt.event_sequence.at(-1) === 'pointer-up' && receipt.event_sequence.every(x => ['pointer-down', 'pointer-move', 'pointer-up', 'cancel'].includes(x))
      && typeof receipt.cancelled === 'boolean' && typeof receipt.settled === 'boolean' && !(receipt.cancelled && receipt.settled) && Number.isInteger(receipt.callback_count) && receipt.callback_count > 0
      && same(Object.keys(receipt.semantic_transition ?? {}).sort(), ['during', 'post', 'pre']) && Object.values(receipt.semantic_transition).every(x => typeof x === 'string' && x.length > 0), 'calendar_receipt_invalid');
    ensure(Array.isArray(stage.samples) && stage.samples.length >= 2 && stage.samples.every((sample, n) => Number.isFinite(sample.timestampMs) && (!n || sample.timestampMs > stage.samples[n - 1].timestampMs) && Number.isFinite(sample.dxDp) && Number.isFinite(sample.translationDp) && Math.abs(sample.dxDp - sample.translationDp) <= 2 && Number.isFinite(sample.widthDp) && sample.widthDp > 0 && Number.isInteger(sample.callbackCount) && sample.callbackCount > 0), 'calendar_samples_invalid');
    stage.samples.forEach((sample, index) => {
      exactIds(Object.keys(sample).sort(), ['timestampMs', 'widthDp', 'dxDp', 'dyDp', 'intentOwner', 'translationDp', 'title', 'selectedCivilDate', 'generation', 'focusedWeek', 'rowBounds', 'callbackCount', 'focusIdentity', 'motion'].sort(), 'calendar_sample_fields_invalid');
      ensure(Number.isFinite(sample.dyDp) && ['horizontal', 'vertical', 'diagonal'].includes(sample.intentOwner) && typeof sample.title === 'string'
        && /^\d{4}-\d{2}-\d{2}$/u.test(sample.selectedCivilDate) && Number.isInteger(sample.generation) && sample.generation >= 1 && (!index || sample.generation >= stage.samples[index - 1].generation)
        && typeof sample.focusedWeek === 'string' && Array.isArray(sample.rowBounds) && sample.rowBounds.length === 2 && sample.rowBounds.every(Number.isFinite) && sample.rowBounds[1] > sample.rowBounds[0]
        && typeof sample.focusIdentity === 'string' && ['normal', 'reduced'].includes(sample.motion) && (!index || sample.callbackCount >= stage.samples[index - 1].callbackCount), 'calendar_samples_invalid');
    });
    const state = combineV12SourceResults([result(stage.status), calendarTests[index].result, receipt.settled || stage.status !== 'PASS' ? 'PASS' : 'FAIL']);
    leaf(`calendar:${stage.id}`, 'calendar-stage', stage.id, state, ['calendar-transitions.json', 'maestro/calendar.xml'], { receipt_sha256: jsonHash(receipt), testcase: stage.id, stage_result: result(stage.status), junit_result: calendarTests[index].result });
  });
  const garminGroups = { 'packaging-auth': ['packaging', 'bridge-allowlist', 'account-lifecycle', 'recovery'], 'sync-read': ['canonical-json', 'sync-read', 'privacy'], dedupe: V12_GARMIN_SHARD_CASE_IDS.slice(6, 9), matching: V12_GARMIN_SHARD_CASE_IDS.slice(9, 17) };
  const garminValues = Object.fromEntries(Object.keys(garminGroups).map(name => [name, json(`garmin/${name}.json`)]));
  const garminStates = {};
  for (const [name, ids] of Object.entries(garminGroups)) {
    const value = garminValues[name]; bindIdentity(value.identity);
    ensure(value.producer === 'v12-garmin-shard/v2' && value.identity.configuration_id === manifest.configuration.id && (value.run_id === undefined || value.run_id === manifest.run_id), 'garmin_schema_invalid');
    exactIds(value.observation?.case_ids, ids, 'garmin_selectors_invalid');
    if (name === 'packaging-auth') ensure(value.observation.source === 'bundled-chaquopy' && same(value.observation.bridge_methods, ['login', 'mfa', 'activities', 'activity', 'splits', 'details']), 'garmin_packaging_invalid');
    if (name === 'sync-read') ensure(value.observation.fixture_manifest_sha256 === manifest.fixtures.registry_sha256, 'garmin_fixture_invalid');
    if (name === 'dedupe' || name === 'matching') ensure(HASH.test(value.observation.receipt_sha256 ?? ''), 'garmin_receipt_invalid');
    if (name === 'matching') ensure(Number.isSafeInteger(value.observation.selected_opportunity_count) && value.observation.selected_opportunity_count >= 0, 'garmin_count_invalid');
    ids.forEach(id => { garminStates[id] = result(value.observation.status); });
    if (name === 'matching' && value.observation.selected_opportunity_count !== 1) garminStates['match-one'] = 'FAIL';
  }
  const garminTests = parseV12SourceJUnit(bytes(full('maestro/garmin-progress.xml')).toString('utf8'), V12_GARMIN_SHARD_CASE_IDS, garminStates);
  for (const test of garminTests) {
    const name = Object.keys(garminGroups).find(key => garminGroups[key].includes(test.id));
    leaf(`garmin:${test.id}`, 'garmin-case', test.id, combineV12SourceResults([test.result, garminStates[test.id]]), [`garmin/${name}.json`, 'maestro/garmin-progress.xml'], { testcase: test.id, junit_result: test.result, group_result: garminStates[test.id], shared_contract: `The ${name} artifact reports one status for its exact case_ids; a blocking group status blocks every member.` });
  }
  for (const name of ['migration', 'portability', 'history']) {
    const value = json(`sqlite/${name}.json`); bindIdentity(value.identity);
    const observation = resolveV12SqliteReceipt(value, name);
    leaf(`sqlite:${name}`, 'sqlite-cases', name, observation.result, [`sqlite/${name}.json`], observation);
  }
  const recovery = json('recovery/lifecycle.json');
  const recoveryXml = bytes(full('maestro/recovery.xml')).toString('utf8');
  ensure(recovery.run_id === manifest.run_id && recovery.producer === 'v12-recovery-shard' && recovery.schema_version === 2, 'recovery_binding_invalid');
  try { validateV12RecoveryShard({ schema_version: 2, producer: recovery.producer, identity: recovery.identity, cases: recovery.cases }); } catch { fail('recovery_binding_invalid'); }
  const retryFacts = selector => recovery.cases.flatMap(({ cuts }) => cuts.map(({ snapshots }) => snapshots.after_retry[selector]));
  const expectedRecoveryIdentity = {
    source_digest: manifest.source.tree_sha256,
    receipt_digest: sha(recoveryXml),
    scenario_digest: jsonHash(recovery.cases.map(({ id, order, steps }) => ({ id, order, steps }))),
    cut_digest: jsonHash(recovery.cases.flatMap(({ cuts }) => cuts.map(({ receipt_sha256 }) => receipt_sha256))),
    pointer_digest: jsonHash(retryFacts('pointer_facts')),
    effect_digest: jsonHash(retryFacts('effect_facts')),
    rest_digest: jsonHash(retryFacts('rest_facts')),
    history_digest: jsonHash(retryFacts('history_facts')),
    timing_digest: jsonHash(retryFacts('timing_facts')),
    restore_digest: jsonHash(retryFacts('restore_facts')),
    merge_receipt_digest: jsonHash(retryFacts('merge_receipt_facts')),
    cue_digest: jsonHash(retryFacts('cue_count')),
  };
  ensure(same(recovery.identity, expectedRecoveryIdentity), 'recovery_binding_invalid');
  exactIds(recovery.cases?.map(x => x.id), V12_RECOVERY_CASE_IDS, 'recovery_selectors_invalid');
  const cutIds = recovery.cases.flatMap(({ id, steps }) => steps.flatMap(step => V12_RECOVERY_CUT_IDS.map(cut => `${id}:${step.id}:${cut}`)));
  const cutStates = {};
  recovery.cases.forEach((entry, order) => {
    ensure(entry.order === order, 'recovery_order_invalid');
    const expectedCuts = entry.steps.flatMap(step => V12_RECOVERY_CUT_IDS.map(cut => `${step.id}:${cut}`));
    exactIds(entry.cuts?.map(x => `${x.step_id}:${x.cut_id}`), expectedCuts, 'recovery_cut_invalid');
    entry.cuts.forEach(cut => {
      ensure(HASH.test(cut.receipt_sha256), 'recovery_cut_digest_invalid');
      if (V12_RECOVERY_UNCOMMITTED_CUT_IDS.includes(cut.cut_id)) {
        ensure(same(cut.snapshots.after_reopen, cut.snapshots.before)
          && cut.snapshots.after_retry.receipt_count === cut.snapshots.before.receipt_count + 1
          && cut.snapshots.after_retry.command_receipt_facts.length === 1,
        'recovery_uncommitted_cut_invalid');
      }
      if (entry.id === 'between-set-rest-pointer') {
        const pointer = cut.snapshots.after_retry.pointer_facts.find(fact => HASH.test(fact.committed_set_sha256 ?? ''));
        const rest = pointer && cut.snapshots.after_retry.rest_facts.find(fact => fact.session_sha256 === pointer.session_sha256);
        ensure(pointer && rest && pointer.active_exercise_sha256 === pointer.active_set_exercise_sha256
          && pointer.active_exercise_sha256 === pointer.committed_set_exercise_sha256
          && pointer.active_exercise_sha256 === rest.next_set_exercise_sha256
          && pointer.active_set_sha256 === rest.next_set_sha256 && pointer.transition_sha256 === rest.transition_sha256
          && pointer.committed_set_ordinal + 1 === pointer.active_set_ordinal
          && pointer.active_set_ordinal === rest.next_set_ordinal, 'recovery_pointer_transition_invalid');
      }
      cutStates[`${entry.id}:${cut.step_id}:${cut.cut_id}`] = result(cut.status);
    });
  });
  const recoveryTests = parseV12SourceJUnit(recoveryXml, cutIds, cutStates);
  recoveryTests.forEach(test => {
    const [caseId, stepId, cutId] = test.id.split(':'); const entry = recovery.cases.find(x => x.id === caseId); const cut = entry?.cuts.find(value => value.step_id === stepId && value.cut_id === cutId);
    ensure(cut && test.properties.case_id === caseId && test.properties.step_id === stepId && test.properties.cut_id === cutId && test.properties.operation_id === cut.operation_id
      && test.properties.boundary_id === cut.boundary_id && test.properties.receipt_kind === cut.receipt_kind
      && test.properties.receipt_sha256 === cut.receipt_sha256 && test.properties.barrier_provenance === cut.barrier.provenance
      && ['barrier_id', 'process_state', 'acknowledgement', 'connectivity', 'first_attempt'].every(key => test.properties[key] === cut.barrier[key])
      && ['first_attempt_code', 'recovery_code', 'retry_code'].every(key => test.properties[key] === cut[key])
      && ['before', 'after_cut', 'after_reopen', 'after_recovery', 'after_retry'].every(phase => test.properties[`${phase}_sha256`] === jsonHash(cut.snapshots[phase])), 'recovery_junit_properties_invalid');
    leaf(`recovery:${test.id}`, 'recovery-cut', test.id, combineV12SourceResults([test.result, cutStates[test.id], result(entry.status)]), ['recovery/lifecycle.json', 'maestro/recovery.xml'], { case_id: caseId, step_id: stepId, boundary_id: cut.boundary_id, cut_id: cutId, operation_id: cut.operation_id, barrier_id: cut.barrier.barrier_id, barrier_provenance: cut.barrier.provenance, junit_result: test.result, cut_result: cutStates[test.id], case_result: result(entry.status) });
  });
  resolveVisual();
  resolveAccessibility();
  resolvePerformance();
  const allKeys = [...leaves.keys()];
  const keys = domain => allKeys.filter(key => key.startsWith(`${domain}:`));
  const automated = allKeys;
  // Gate membership is fixed by the acceptance contract, not supplied by an artifact.
  const gates = {
    inventory: group([...keys('multi-plan'), ...keys('workout'), ...keys('library-running')], 'inventory'),
    appearance: group(keys('visual'), 'appearance'), viewports: group(keys('visual'), 'viewports'),
    targets: group(['accessibility:targets'], 'targets'), 'input-focus': group(['accessibility:input-focus'], 'input-focus'),
    'reduced-motion': group(['accessibility:motion', 'calendar:reduced-motion'], 'reduced-motion'),
    sqlite: group(keys('sqlite'), 'sqlite'), recovery: group(keys('recovery'), 'recovery'), calendar: group(keys('calendar'), 'calendar'),
    garmin: group(keys('garmin'), 'garmin'), performance: group(keys('performance'), 'performance'),
    attended: attendedGate(), preseal: group(automated, 'preseal'),
  };
  // The Samsung observations are part of these acceptance gates as well as VER-12.
  const attendedScopes = { appearance: ['S20-05'], targets: ['S20-01', 'S20-02'], 'input-focus': ['S20-04'], calendar: ['S20-03'], recovery: ['S20-06', 'S20-07'], preseal: ['S20-01', 'S20-02', 'S20-03', 'S20-04', 'S20-05', 'S20-06', 'S20-07'] };
  for (const [id, scopes] of Object.entries(attendedScopes)) {
    const members = gates.attended.members.filter(member => scopes.includes(member.id));
    gates[id] = { ...gates[id], result: combineV12SourceResults([gates[id].result, ...members.map(member => member.result)]), members: [...gates[id].members, ...members] };
  }
  return table.map(entry => {
    const selector = entry.selector;
    const resolved = selector.type === 'phase20-gate' ? gates[selector.id]
      : selector.type === 'comparison-state' ? group(V12_CONFIG_IDS.map(config => `visual:${selector.id}:${config}`), selector.id)
        : leaves.get(`${selector.shard}:${selector.id}`);
    ensure(resolved, 'selector_missing');
    const bindings = new Map();
    function collect(value) { for (const binding of value.bindings ?? []) bindings.set(binding.artifact, binding); value.members?.forEach(collect); }
    collect(resolved); bindings.set(full('build.json'), { artifact: full('build.json'), sha256: artifactHash(full('build.json')) });
    const orderedBindings = [...bindings.values()].sort((a, b) => a.artifact.localeCompare(b.artifact));
    const primary = resolved.bindings?.[0] ?? orderedBindings.find(binding => !binding.artifact.endsWith('/build.json')) ?? orderedBindings[0];
    return { row_id: entry.row_id, artifact: primary.artifact, sha256: primary.sha256, configuration_id: manifest.configuration.id,
      result: resolved.result, selector: { ...selector, owning_phase: entry.owning_phase, ordinal: entry.ordinal, configuration_sha256: sha(manifest.configuration.id), resolution: resolved }, bindings: orderedBindings };
  });

  function descriptor(value) {
    ensure(value && HASH.test(value.sha256 ?? ''), 'descriptor_invalid');
    const content = bytes(value.path); ensure(artifactHash(value.path) === value.sha256 && (value.size_bytes === undefined || value.size_bytes === content.length), 'artifact_hash_invalid'); return content;
  }
  function resolveVisual() {
    const index = json('comparison/index.json'); const captures = json('screenshots/index.json');
    ensure(index.run_id === manifest.run_id && index.producer === 'v12-visual-comparison-index/v3' && index.schema_version === 3
      && captures.run_id === manifest.run_id && captures.producer === 'v12-visual-capture-index/v2' && captures.schema_version === 2
      && same(captures.source_hashes, { browser_walk: inputs.source_hashes.browser_walk, source_manifest: inputs.source_hashes.source_manifest }), 'visual_schema_invalid');
    const expected = V12_BROWSER_WALK_STATE_IDS.flatMap(id => V12_CONFIG_IDS.map(config => `${id}:${config}`));
    exactIds(index.results?.map(x => `${x.id}:${x.configuration_id}`), expected, 'visual_selectors_invalid');
    exactIds(captures.records?.map(x => `${x.state_id}:${x.configuration_id}`), expected, 'visual_capture_selectors_invalid');
    index.results.forEach((comparison, index) => {
      const capture = captures.records[index];
      ensure(capture.schema_version === 3 && capture.producer === 'v12-visual-capture/v3' && capture.run_id === manifest.run_id && capture.native_execution === 'EXECUTED' && capture.settings?.restored === true && capture.settings.privacy === 'synthetic-only' && capture.fixture_id === 'v12-synthetic-fixtures-r18'
        && capture.native_png.path === full(`screenshots/${comparison.id}/${comparison.configuration_id}/native.png`)
        && same(comparison.artifacts?.native, capture.native_png) && comparison.capture_record_path === full('screenshots/index.json'), 'visual_capture_invalid');
      const captureReceipt = capture.settings.state_receipt; const observedReceipt = comparison.state_receipt;
      for (const receipt of [captureReceipt, comparison.capture_state_receipt, observedReceipt]) ensure(receipt?.schema_version === 3
        && receipt.run_id === manifest.run_id && receipt.state_id === comparison.id && receipt.configuration_id === comparison.configuration_id
        && receipt.source_tree_sha256 === manifest.source.tree_sha256 && receipt.apk_sha256 === manifest.build.apk.sha256
        && receipt.device_identity_sha256 === manifest.device.identity_sha256 && /^[a-f0-9]{32}$/u.test(receipt.nonce ?? ''), 'visual_state_receipt_invalid');
      ensure(same(captureReceipt, comparison.capture_state_receipt) && observedReceipt.nonce !== captureReceipt.nonce, 'visual_state_receipt_invalid');
      const observation = comparison.comparison_mode === 'approved_source'
        ? comparison.observation?.inline
        : JSON.parse(descriptor(comparison.observation));
      ensure(observation?.state_id === comparison.id && observation.configuration_id === comparison.configuration_id
        && observation.capture_nonce === captureReceipt.nonce && observation.observation_nonce === observedReceipt.nonce, 'visual_configuration_invalid');
      try { verifyV12ComparisonRecord({ runId: manifest.run_id, root, result: comparison, trustPublishedNative: true }); } catch { fail('visual_comparison_invalid'); }
      const state = comparison.classification;
      ensure(RESULTS.includes(state) && comparison.counts_as_pass === (state === 'PASS'), 'visual_classification_invalid');
      // Both indexes bind the recursively validated PNG/observation descriptors.
      const artifacts = ['comparison/index.json', 'screenshots/index.json'];
      leaf(`visual:${comparison.id}:${comparison.configuration_id}`, 'comparison', `${comparison.id}:${comparison.configuration_id}`, state, artifacts, {
        state_id: comparison.id,
        configuration_id: comparison.configuration_id,
        classification: state,
        capture_state_receipt_sha256: jsonHash(captureReceipt),
        state_receipt_sha256: jsonHash(observedReceipt),
        source_receipt_sha256: jsonHash(observedReceipt.source_receipt),
      });
    });
  }
  function resolveAccessibility() {
    const semantics = json('semantics/accessibility.json'); const geometry = json('geometry/hit-targets.json');
    ensure(semantics.run_id === manifest.run_id && semantics.producer === 'v12-accessibility-native-observation/v1' && geometry.run_id === manifest.run_id && geometry.producer === 'v12-accessibility-geometry/v1' && Array.isArray(semantics.observations) && semantics.observations.length > 0, 'accessibility_schema_invalid');
    const configKeys = new Set(); const gates = { targets: [], 'input-focus': [], motion: [] };
    const targetGeometry = [];
    semantics.observations.forEach((observation, ordinal) => {
      const configKey = jsonHash(observation.configuration); ensure(!configKeys.has(configKey), 'accessibility_configuration_duplicate'); configKeys.add(configKey);
      const configuration = observation.configuration;
      ensure(configuration?.font_scale === 2 && Number.isFinite(configuration.density) && configuration.density > 0
        && Number.isFinite(configuration.content_bounds?.width) && configuration.content_bounds.width > 0 && Number.isFinite(configuration.content_bounds?.height) && configuration.content_bounds.height > 0
        && [configuration.insets?.top, configuration.insets?.bottom, configuration.ime_bounds?.top, configuration.ime_bounds?.bottom].every(Number.isFinite)
        && observation.fixture_id === 'v12-synthetic-fixtures-r18', 'accessibility_configuration_invalid');
      const base = observation.native_execution !== 'EXECUTED' ? 'NOT_RUN' : observation.restored_settings === undefined ? 'REVIEW_REQUIRED' : observation.restored_settings !== true ? 'FAIL' : 'PASS';
      const targets = observation.targets;
      ensure(Array.isArray(targets) && targets.length > 0 && targets.every(t => typeof t.id === 'string' && t.id.length > 0) && new Set(targets.map(t => t.id)).size === targets.length, 'accessibility_selector_invalid');
      targets.forEach(target => targetGeometry.push({ configuration: observation.configuration, id: target.id, bounds_dp: target.bounds_dp, overlap: target.overlap }));
      const targetPass = targets.every(t => typeof t.name === 'string' && t.name.length && typeof t.role === 'string' && t.role.length && typeof t.state === 'string' && t.non_color_cue === true && Number.isFinite(t.bounds_dp?.width) && t.bounds_dp.width >= 48 && Number.isFinite(t.bounds_dp?.height) && t.bounds_dp.height >= 48 && (t.overlap === false || t.bounds_dp.overlap === false));
      const interactions = observation.interactions;
      exactIds(interactions?.map(x => x.input), ['touch', 'software-keyboard', 'hardware-keyboard', 'dpad'], 'accessibility_input_selectors_invalid');
      const modal = observation.modal;
      const inputPass = interactions.every(x => typeof x.focus_before === 'string' && typeof x.focus_after === 'string' && x.action === 'activate' && x.command_count === 1 && HASH.test(x.image_hash ?? '')) && modal?.focus_ring_dp === 3 && modal.focus_offset_dp === 3 && modal.back === 'closes-modal' && modal.escape === 'closes-modal' && modal.restores_invoker === true;
      const motion = observation.motion; const motionPass = motion?.normal && motion?.reduced && ['destination', 'callbacks', 'source_facts'].every(key => motion.normal[key] !== undefined && motion.normal[key] === motion.reduced[key]);
      for (const [gate, passed] of Object.entries({ targets: targetPass, 'input-focus': inputPass, motion: motionPass })) gates[gate].push({ ordinal, configuration_sha256: configKey, result: base === 'PASS' ? passed ? 'PASS' : 'FAIL' : base });
    });
    ensure(same(geometry.targets, targetGeometry), 'accessibility_geometry_binding_invalid');
    for (const [id, observations] of Object.entries(gates)) leaf(`accessibility:${id}`, 'accessibility-gate', id, combineV12SourceResults(observations.map(o => o.result)), ['semantics/accessibility.json', 'geometry/hit-targets.json'], { observations });
  }
  function resolvePerformance() {
    const value = json('performance.json'); const observation = value.observation;
    ensure(value.run_id === manifest.run_id && value.producer === 'v12-release-performance-writer/v1' && value.build_variant === 'release' && value.sample_origin === 'release-native-source-backed'
      && observation?.producer === 'v12-performance-observation-shard/v1' && observation.observation_state === 'REVIEW_REQUIRED' && same(observation.budgets, V12_PERFORMANCE_BUDGETS) && same(observation.workload, V12_PERFORMANCE_WORKLOAD), 'performance_schema_invalid');
    bindIdentity(observation.identity, 'sha');
    ensure(observation.identity.base_head === manifest.source.head && observation.identity.package === manifest.build.package && observation.identity.fixture_sha256 === manifest.fixtures.registry_sha256, 'performance_identity_invalid');
    const gates = resolveV12PerformanceGates(observation);
    const fixture = observation.raw_samples.phase12_merge_fixture;
    ensure(fixture?.snapshot_bytes === V12_PERFORMANCE_BUDGETS.phase12_merge_preflight.required_snapshot_bytes && fixture.rows === V12_PERFORMANCE_BUDGETS.phase12_merge_preflight.required_rows && fixture.writer_commits === 5 && fixture.sqlite_max_variable_number >= 4000, 'performance_fixture_invalid');
    // Recompute summary when the producer validator can represent this sample set.
    // Its budget rejection is a FAIL result, not a reason to lose the row.
    try { ensure(same(validateV12PerformanceShard(observation, observation.identity), observation.summary), 'performance_summary_invalid'); }
    catch (error) { if (error.message.startsWith('v12_row_resolver_') || !Object.values(gates).some(gate => ['FAIL', 'NOT_RUN', 'REVIEW_REQUIRED'].includes(gate.result) && gate.reason === undefined)) throw error; }
    for (const [id, gate] of Object.entries(gates)) leaf(`performance:${id}`, 'performance-budget', id, gate.result, ['performance.json'], { measurement: gate });
  }
  function attendedGate() {
    const ids = Array.from({ length: 7 }, (_, i) => `S20-0${i + 1}`);
    if (attended === undefined) return { type: 'attended-gate', id: 'attended', result: 'NOT_RUN', members: ids.map(id => ({ type: 'attended-observation', id, result: 'NOT_RUN', bindings: [{ artifact: full('build.json'), sha256: artifactHash(full('build.json')) }] })) };
    ensure(same(json('attended-observations.json'), attended), 'attended_hash_invalid');
    exactIds(attended.rows?.map(row => row.id), ids, 'attended_selectors_invalid');
    ensure(attended.identity?.run_id === manifest.run_id && attended.identity.source_tree_sha256 === manifest.source.tree_sha256 && attended.identity.apk_sha256 === manifest.build.apk.sha256 && attended.identity.installed_apk_sha256 === manifest.device.installed_apk_sha256 && attended.identity.config_sha256 === sha(manifest.configuration.id) && attended.identity.device?.device_sha256 === manifest.device.identity_sha256, 'attended_identity_invalid');
    const members = attended.rows.map(row => { descriptor(row.png); return { type: 'attended-observation', id: row.id, result: result(row.status), bindings: [{ artifact: full('attended-observations.json'), sha256: artifactHash(full('attended-observations.json')) }, { artifact: row.png.path, sha256: row.png.sha256 }] }; });
    const state = combineV12SourceResults(members.map(member => member.result));
    ensure(result(attended.status) === state, 'attended_status_invalid');
    return { type: 'attended-gate', id: 'attended', result: state, members };
  }
}

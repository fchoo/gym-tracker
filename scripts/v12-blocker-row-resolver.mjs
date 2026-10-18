/** Phase 20 consumer-owned selectors. Producers supply observations, never row verdicts. */
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { V12_CONFIG_IDS, V12_BROWSER_WALK_STATE_IDS } from './v12-evidence-contract.mjs';
import { verifyV12ComparisonRecord } from './compare-v12-visual.mjs';
import { V12_MAESTRO_FLOW_CONTRACTS, validateV12DirectMaestroMapping } from './run-v12-maestro.mjs';
import { V12_CALENDAR_SHARD_STAGE_IDS } from './v12-calendar-shard.mjs';
import { V12_CALENDAR_FLOW_REVISION, validateV12CalendarStageResult } from './v12-calendar-observation-contract.mjs';
import { V12_GARMIN_SHARD_CASE_IDS } from './v12-garmin-shard.mjs';
import { V12_SQLITE_SHARD_CASE_IDS } from './v12-sqlite-shard.mjs';
import { V12_RECOVERY_CASE_IDS, V12_RECOVERY_CUT_IDS, V12_RECOVERY_UNCOMMITTED_CUT_IDS, validateV12RecoveryShard } from './v12-recovery-shard.mjs';
import { V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD } from './benchmark-v12-interactions.mjs';
import { validateV12PerformanceShard } from './v12-performance-shard.mjs';
import {
  deriveV12CalendarRequirementSelectors,
  validateV12CalendarProbeReceipt,
  V12_CALENDAR_REQUIREMENT_DEFINITIONS,
  V12_CALENDAR_REQUIREMENT_PROBE_COUNT,
} from './v12-calendar-requirement-map.mjs';
import { validateV12AccessibilityProducer, validateV12PerformanceProducer } from './v12-quality-evidence-contract.mjs';
import { deriveV12MaestroCaseIds } from './v12-maestro-source-registry.mjs';

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
  try { return deriveV12MaestroCaseIds(shard, root); }
  catch { fail('registry_drift'); }
}

const DOM_CASES = [1, 1, 0, 2, 2, 3, 2, 2, 2, 4, 7, 6, 11, 8, 10, 3, 5];
const DOM_NATIVE_CASES = Object.freeze([
  ['schema27-upgrade', 'restore', 'merge'],
  ['fresh-migration', 'schema27-upgrade', 'restore', 'merge'],
  ['fresh-migration', 'schema27-upgrade', 'supported-legacy-upgrade', 'failure-reopen', 'restore', 'immutable-history'],
  ['schema27-upgrade', 'restore', 'merge', 'noop-replay'],
  ['schema27-upgrade', 'restore', 'merge', 'noop-replay', 'immutable-history'],
  ['failure-reopen', 'restore', 'noop-replay', 'immutable-history'],
  ['fresh-migration', 'schema27-upgrade', 'restore', 'merge', 'immutable-history'],
  ['fresh-migration', 'restore', 'merge', 'immutable-history'],
  ['fresh-migration', 'restore', 'merge', 'immutable-history'],
  ['backup', 'restore', 'merge', 'noop-replay', 'immutable-history'],
  ['backup', 'restore', 'merge', 'noop-replay', 'immutable-history'],
  ['backup', 'restore', 'merge', 'noop-replay', 'immutable-history'],
  ['restore', 'merge', 'noop-replay', 'rebuild', 'immutable-history'],
  ['backup', 'restore', 'merge', 'noop-replay', 'rebuild', 'immutable-history'],
  ['backup', 'restore', 'merge', 'noop-replay', 'rebuild', 'immutable-history'],
  ['failure-reopen', 'noop-replay', 'immutable-history'],
  ['supported-legacy-upgrade', 'failure-reopen', 'backup', 'restore', 'merge', 'noop-replay', 'rebuild', 'immutable-history'],
]);
// Reuse is explicit: these rows share an executed transaction/fixture contract.
const DOM_SHARED = {
  1: 'MAP-01 activation and inactive-plan persistence share the activation transaction fixture.',
  2: 'Running structure, advisory goal fields and independent schedule/overlap rows share the two-slot running fixture.',
  3: 'Occurrence selection and offline commit acknowledgement share the completion/retry transaction fixture.',
};
const SHL_STATES = [2, 34, 1, 61, 9, 17, 8, 10, 84, 83, 86, 88, 90];
const GAR_CASES = [0, 1, 5, 4, 2, 3, 17, 6, 7, 8, 9, 11, 10, 15, 12, 14];
const PERFORMANCE_GATES = [...Object.keys(V12_PERFORMANCE_BUDGETS), 'phase12_merge_peak_growth'];
const VER_GATES = ['inventory', 'appearance', 'viewports', 'targets', 'input-focus', 'reduced-motion', 'sqlite', 'recovery', 'calendar', 'garmin', 'performance', 'attended', 'preseal'];

export function validateV12CalendarExecutionOrigin(value, root = process.cwd(), allowTestFixture = false) {
  const keys = ['schema_version', 'action', 'kind', 'toolchain_origin', 'default_launcher', 'test_only', 'adapter_source_sha256', 'launcher_source_sha256', 'domain_source_sha256', 'request_attestation_sha256'];
  ensure(value && same(Object.keys(value), keys), 'calendar_origin_invalid');
  const adapterMatches = value.adapter_source_sha256 === sha(readFileSync(path.join(root, 'scripts/v12-native-adapter.mjs')));
  const production = value.kind === 'production-default-launcher' && value.default_launcher === true && value.test_only === false
    && value.toolchain_origin === 'production-attested/v1'
    && value.launcher_source_sha256 === sha(readFileSync(path.join(root, 'scripts/v12-production-native-adapter-launcher.mjs')))
    && value.domain_source_sha256 === sha(readFileSync(path.join(root, 'scripts/v12-production-native-calendar-action.mjs')));
  const testOnly = allowTestFixture && value.kind === 'test-fixture' && value.default_launcher === false && value.test_only === true
    && value.toolchain_origin === 'test-controlled/v1'
    && value.launcher_source_sha256 === sha(readFileSync(path.join(root, 'scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs')))
    && value.domain_source_sha256 === value.launcher_source_sha256;
  ensure(value.schema_version === 1 && value.action === 'calendar' && adapterMatches && (production || testOnly) && HASH.test(value.request_attestation_sha256 ?? ''), 'calendar_origin_invalid');
  return true;
}

export function createV12RowSelectorTable({ inputs, root = process.cwd() }) {
  const phases = { DOM: [13, 17], SHL: [14, 13], WRK: [15, 36], CAL: [16, 23], LIB: [17, 36], GAR: [18, 16], PRO: [19, 18], VER: [20, 13] };
  const expected = Object.entries(phases).flatMap(([prefix, [, count]]) => Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`));
  exactIds(inputs?.matrix?.rows?.map(row => row.requirement_id), expected, 'matrix_invalid');
  const functional = Object.fromEntries(['multi-plan', 'workout', 'library-running'].map(shard => [shard, readV12FunctionalRegistry(shard, root)]));
  const calendar = new Map(deriveV12CalendarRequirementSelectors(inputs.matrix.rows).map(entry => [entry.row_id, entry]));
  const table = inputs.matrix.rows.map(row => {
    const [prefix, suffix] = row.requirement_id.split('-'); const ordinal = Number(suffix) - 1;
    ensure(row.owning_phase === phases[prefix][0], 'matrix_phase_invalid');
    let type, id, shard, shared_contract;
    if (prefix === 'DOM') { type = 'dom-contract'; shard = 'multi-plan'; id = functional[shard][DOM_CASES[ordinal]]; shared_contract = DOM_SHARED[DOM_CASES[ordinal]]; }
    if (prefix === 'WRK' || prefix === 'LIB') { type = 'functional-case'; shard = prefix === 'WRK' ? 'workout' : 'library-running'; id = functional[shard][ordinal]; }
    if (prefix === 'SHL') { type = 'comparison-state'; shard = 'visual'; id = `BW-${String(SHL_STATES[ordinal]).padStart(3, '0')}`; }
    if (prefix === 'CAL') {
      const mapping = calendar.get(row.requirement_id);
      ensure(mapping !== undefined && mapping.evidence_id === row.inventory_id, 'calendar_selector_invalid');
      type = 'calendar-requirement'; shard = 'calendar'; id = mapping.evidence_id;
      return { row_id: row.requirement_id, owning_phase: row.owning_phase, ordinal: ordinal + 1,
        selector: { type, shard, id, contract: row.acceptance_contract, stage_ids: mapping.stage_ids, probe_ids: mapping.probe_ids } };
    }
    if (prefix === 'GAR') { type = 'garmin-case'; shard = 'garmin'; id = V12_GARMIN_SHARD_CASE_IDS[GAR_CASES[ordinal]]; }
    if (prefix === 'PRO') { type = 'performance-budget'; shard = 'performance'; id = PERFORMANCE_GATES[ordinal]; }
    if (prefix === 'VER') { type = 'phase20-gate'; shard = 'verification'; id = VER_GATES[ordinal]; }
    ensure(type && id && typeof row.acceptance_contract === 'string', 'selector_unknown');
    return { row_id: row.requirement_id, owning_phase: row.owning_phase, ordinal: ordinal + 1,
      selector: { type, shard, id, contract: row.acceptance_contract,
        ...(prefix === 'DOM' ? { native_case_ids: DOM_NATIVE_CASES[ordinal] } : {}),
        ...(shared_contract ? { shared_contract } : {}) } };
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
  const expectedIds = bounds && V12_SQLITE_SHARD_CASE_IDS.slice(...bounds);
  ensure(bounds && value?.schema_version === 1 && value.producer === 'v12-sqlite-shard'
    && value.cases === expectedIds.length && Array.isArray(value.case_facts)
    && value.case_facts.length === expectedIds.length && value.all_passed === true
    && HASH.test(value.digest ?? ''), 'sqlite_receipt_invalid');
  exactIds(value.case_facts.map(entry => entry?.id), expectedIds, 'sqlite_case_order_invalid');
  value.case_facts.forEach((entry, index) => {
    ensure(entry && same(Object.keys(entry), ['id', 'order', 'status', 'source_facts', 'digest'])
      && entry.order === bounds[0] + index && entry.status === 'passed'
      && Array.isArray(entry.source_facts) && entry.source_facts.length > 0
      && entry.source_facts.every(source => source && same(Object.keys(source), ['registry', 'cases'])
        && typeof source.registry === 'string' && Array.isArray(source.cases) && source.cases.length > 0
        && source.cases.every(sourceCase => sourceCase && same(Object.keys(sourceCase), ['id', 'status'])
          && typeof sourceCase.id === 'string' && sourceCase.status === 'passed'))
      && HASH.test(entry.digest ?? ''), 'sqlite_case_fact_invalid');
  });
  ensure(value.digest === jsonHash(value.case_facts), 'sqlite_digest_invalid');
  return { result: 'PASS', case_ids: expectedIds, case_facts: value.case_facts, digest: value.digest };
}

export function resolveV12DomContract(selector, lookup) {
  ensure(selector?.type === 'dom-contract' && selector.shard === 'multi-plan'
    && typeof selector.id === 'string' && Array.isArray(selector.native_case_ids)
    && selector.native_case_ids.length > 0 && typeof lookup === 'function', 'dom_selector_invalid');
  const keys = [`multi-plan:${selector.id}`, ...selector.native_case_ids.map(id => `sqlite-case:${id}`)];
  const members = keys.map(key => { const value = lookup(key); ensure(value, `selector_unknown:${key}`); return value; });
  return Object.freeze({ type: 'dom-contract', id: selector.id,
    result: combineV12SourceResults(members.map(({ result: memberResult }) => memberResult)), members: Object.freeze(members) });
}

export function resolveV12PerformanceGates(observation) {
  const gates = observation?.summary?.gates;
  ensure(gates && typeof gates === 'object' && !Array.isArray(gates), 'performance_summary_invalid');
  for (const gate of Object.values(gates)) {
    ensure(gate && typeof gate === 'object' && RESULTS.includes(gate.result), 'performance_summary_invalid');
  }
  return gates;
}

/** Resolve the complete source graph once; every leaf is tied to actual bytes. */
export function resolveV12SourceRows({ inputs, manifest, root = process.cwd(), readArtifact, attended, allowTestCalendarFixture = false } = {}) {
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
  const group = (keys, id) => ({ type: 'acceptance-gate', id, shared_contract: 'This verification gate requires every listed concrete source result; constituent results may also close their source-owned requirement rows.', result: combineV12SourceResults(keys.map(key => { ensure(leaves.has(key), `selector_unknown:${key}`); return leaves.get(key).result; })), members: keys.map(key => leaves.get(key)) });
  ensure(same(json('build.json'), manifest), 'build_binding_invalid');
  for (const shard of ['multi-plan', 'workout', 'library-running']) {
    const mappingPath = `mapping/${shard}.json`; const xmlPath = `maestro/${shard}.xml`;
    const mapping = json(mappingPath); const contract = V12_MAESTRO_FLOW_CONTRACTS[shard]; const ids = readV12FunctionalRegistry(shard, root);
    try { validateV12DirectMaestroMapping(mapping, { root, manifest, shard, allowTest: manifest.evidence_origin === 'test' }); }
    catch { fail('functional_attestation_invalid'); }
    ensure(mapping.run_id === manifest.run_id && mapping.shard === shard && mapping.producer === 'v12-maestro-source-map/v2', 'functional_schema_invalid');
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
  const calendarRequirements = json('calendar-requirements.json'); bindIdentity(calendarRequirements.identity);
  const calendarArtifacts = json('calendar/artifact-registry.json');
  const calendarIds = V12_CALENDAR_SHARD_STAGE_IDS;
  ensure(calendar.run_id === manifest.run_id && calendar.schema_version === 5 && calendar.producer === 'v12-calendar-shard/v6' && calendar.flow_revision === V12_CALENDAR_FLOW_REVISION
    && calendar.identity.configuration_id === manifest.configuration.id
    && calendar.flow_sha256 === sha(readFileSync(path.join(root, 'maestro/v1.2/calendar.yaml'))), 'calendar_schema_invalid');
  validateV12CalendarExecutionOrigin(calendar.execution_origin, root, allowTestCalendarFixture);
  validateV12CalendarExecutionOrigin(calendarRequirements.execution_origin, root, allowTestCalendarFixture);
  ensure(calendarRequirements.schema_version === 2 && calendarRequirements.producer === 'v12-calendar-requirements/v2'
    && calendarRequirements.run_id === manifest.run_id && calendarRequirements.fixture_id === 'v12-calendar-isolated-facts-v1'
    && calendarRequirements.flow_sha256 === sha(readFileSync(path.join(root, 'maestro/v1.2/calendar-requirements.yaml'))), 'calendar_requirement_schema_invalid');
  ensure(calendarArtifacts?.schema_version === 2 && calendarArtifacts.producer === 'v12-calendar-artifact-registry/v2'
    && calendarArtifacts.run_id === manifest.run_id && calendarArtifacts.execution_origin_sha256 === jsonHash(calendar.execution_origin)
    && calendar.artifact_registry_sha256 === jsonHash(calendarArtifacts), 'calendar_artifact_registry_invalid');
  const nativeRequirements = { flow_sha256: calendarRequirements.flow_sha256, fixture_id: calendarRequirements.fixture_id,
    records: calendarRequirements.records, junit_cases: calendarRequirements.junit_cases };
  const nativeArtifactDescriptors = calendarArtifacts.members.map((member) => member.stage_id === undefined
    ? { requirement_id: member.requirement_id, probe_id: member.probe_id, kind: member.kind, relative_path: member.path, sha256: member.sha256, size_bytes: member.size_bytes }
    : { stage_id: member.stage_id, kind: member.kind, relative_path: member.path, sha256: member.sha256, size_bytes: member.size_bytes });
  const nativeReceipt = calendar.native_receipt;
  ensure(nativeReceipt?.schema_version === 2 && nativeReceipt.producer === 'v12-calendar-native-receipt/v2'
    && nativeReceipt.native_execution === 'EXECUTED' && nativeReceipt.run_id === manifest.run_id
    && nativeReceipt.source_tree_sha256 === manifest.source.tree_sha256 && nativeReceipt.apk_sha256 === manifest.build.apk.sha256
    && nativeReceipt.installed_apk_sha256 === manifest.device.installed_apk_sha256 && nativeReceipt.apk_signature_sha256 === manifest.build.apk.signature_sha256
    && nativeReceipt.device_identity_sha256 === manifest.device.identity_sha256 && nativeReceipt.launcher_source_sha256 === calendar.execution_origin.launcher_source_sha256
    && nativeReceipt.flow_sha256 === calendar.flow_sha256 && nativeReceipt.requirements_flow_sha256 === calendarRequirements.flow_sha256
    && nativeReceipt.fixture_id === calendarRequirements.fixture_id && nativeReceipt.stage_count === calendar.stages.length
    && nativeReceipt.requirement_count === calendarRequirements.records.length
    && nativeReceipt.probe_count === calendarRequirements.junit_cases.length
    && nativeReceipt.evidence_set_sha256 === jsonHash({ stages: calendar.stages, requirements: nativeRequirements, artifacts: nativeArtifactDescriptors }), 'calendar_native_receipt_invalid');
  exactIds(calendar.stages?.map(x => x.id), calendarIds, 'calendar_selectors_invalid');
  exactIds(calendar.junit_cases?.map(x => x.id), calendarIds, 'calendar_selectors_invalid');
  ensure(Array.isArray(calendarArtifacts.members) && calendarArtifacts.members.length === (calendarIds.length + V12_CALENDAR_REQUIREMENT_PROBE_COUNT) * 2, 'calendar_artifact_registry_invalid');
  const calendarTests = parseV12SourceJUnit(bytes(full('maestro/calendar.xml')).toString('utf8'), calendarIds, Object.fromEntries(calendar.stages.map(x => [x.id, result(x.status)])));
  calendar.stages.forEach((stage, index) => {
    ensure(stage.order === index && calendar.junit_cases[index].order === index && calendar.junit_cases[index].status === stage.status, 'calendar_order_invalid');
    try { validateV12CalendarStageResult(stage, stage.id, index); } catch { fail('calendar_observation_invalid'); }
    const members = calendarArtifacts.members.slice(index * 2, index * 2 + 2);
    const stem = `${String(index).padStart(2, '0')}-${stage.id}`;
    ensure(members.length === 2 && same(members.map(({ stage_id, kind, path: artifactPath }) => ({ stage_id, kind, path: artifactPath })), [
      { stage_id: stage.id, kind: 'png', path: `calendar/stages/${stem}.png` },
      { stage_id: stage.id, kind: 'trace', path: `calendar/stages/${stem}.trace.json` },
    ]), 'calendar_artifact_registry_invalid');
    for (const member of members) {
      ensure(HASH.test(member.sha256 ?? '') && Number.isSafeInteger(member.size_bytes) && member.size_bytes > 0, 'calendar_artifact_registry_invalid');
      const content = bytes(full(member.path));
      ensure(content.length === member.size_bytes && sha(content) === member.sha256, 'calendar_artifact_hash_invalid');
      if (member.kind === 'png') ensure(member.sha256 === stage.screenshot_sha256 && content.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), 'calendar_artifact_hash_invalid');
      else ensure(member.sha256 === stage.trace_sha256 && content.toString('utf8') === JSON.stringify(stage.observation), 'calendar_artifact_hash_invalid');
    }
    const state = combineV12SourceResults([result(stage.status), calendarTests[index].result]);
    leaf(`calendar-stage:${stage.id}`, 'calendar-stage', stage.id, state, ['calendar-transitions.json', 'maestro/calendar.xml', 'calendar/artifact-registry.json', ...members.map(({ path: artifactPath }) => artifactPath)], { receipt_sha256: jsonHash(stage.observation), testcase: stage.id, stage_result: result(stage.status), junit_result: calendarTests[index].result });
  });
  const requirementMappings = deriveV12CalendarRequirementSelectors(inputs.matrix.rows);
  exactIds(calendarRequirements.records?.map(({ evidence_id: id }) => id), requirementMappings.map(({ evidence_id: id }) => id), 'calendar_requirement_selectors_invalid');
  const probeMappings = requirementMappings.flatMap((mapping) => mapping.probe_ids.map((probeId) => ({ mapping, probeId })));
  const probeTestIds = probeMappings.map(({ mapping, probeId }) => `${mapping.row_id}:${probeId}`);
  exactIds(calendarRequirements.junit_cases?.map(({ id }) => id), probeTestIds, 'calendar_requirement_selectors_invalid');
  const requirementTests = parseV12SourceJUnit(bytes(full('maestro/calendar-requirements.xml')).toString('utf8'), probeTestIds);
  const fixtureSha256 = sha(readFileSync(path.join(root, 'src/testing/phase20CalendarFixture.ts')));
  let probeOrder = 0;
  const probeNonces = new Set();
  for (const [index, mapping] of requirementMappings.entries()) {
    const record = calendarRequirements.records[index];
    ensure(record.requirement_id === mapping.row_id && record.evidence_id === mapping.evidence_id && record.native_execution === 'EXECUTED'
      && record.fixture_id === calendarRequirements.fixture_id && record.fixture_storage === 'isolated-in-memory'
      && record.fixture_source_sha256 === fixtureSha256 && record.source_digest_before === fixtureSha256 && record.source_digest_after === fixtureSha256
      && Array.isArray(record.probe_receipts), 'calendar_requirement_invalid');
    exactIds(record.probe_receipts.map(({ probe_id: id }) => id), mapping.probe_ids, 'calendar_requirement_probe_selectors_invalid');
    const probeResults = [];
    const artifacts = [];
    for (const [localOrder, probeId] of mapping.probe_ids.entries()) {
      const receipt = record.probe_receipts[localOrder];
      try { validateV12CalendarProbeReceipt(receipt, { nonce: receipt?.nonce, flowSha256: calendarRequirements.flow_sha256,
        fixtureSourceSha256: fixtureSha256, requirementId: mapping.row_id, evidenceId: mapping.evidence_id, probeId }); }
      catch { fail('calendar_requirement_probe_receipt_invalid'); }
      ensure(!probeNonces.has(receipt.nonce), 'calendar_requirement_probe_nonce_duplicate');
      probeNonces.add(receipt.nonce);
      const junit = calendarRequirements.junit_cases[probeOrder];
      const parsed = requirementTests[probeOrder];
      ensure(junit.id === `${mapping.row_id}:${probeId}` && junit.requirement_id === mapping.row_id
        && junit.probe_id === probeId && junit.order === probeOrder && junit.status === parsed.result
        && receipt.status === parsed.result, 'calendar_requirement_probe_status_invalid');
      const offset = calendarIds.length * 2 + probeOrder * 2;
      const members = calendarArtifacts.members.slice(offset, offset + 2);
      const stem = `${String(probeOrder).padStart(2, '0')}-${mapping.row_id}-${probeId}`;
      ensure(members.length === 2 && same(members.map(({ requirement_id, probe_id, kind, path: artifactPath }) => ({ requirement_id, probe_id, kind, path: artifactPath })), [
        { requirement_id: mapping.row_id, probe_id: probeId, kind: 'png', path: `calendar/requirements/${stem}.png` },
        { requirement_id: mapping.row_id, probe_id: probeId, kind: 'trace', path: `calendar/requirements/${stem}.trace.xml` },
      ]), 'calendar_requirement_artifacts_invalid');
      for (const artifact of members) {
        const content = bytes(full(artifact.path));
        ensure(HASH.test(artifact.sha256 ?? '') && Number.isSafeInteger(artifact.size_bytes) && artifact.size_bytes === content.length && artifact.sha256 === sha(content), 'calendar_requirement_artifacts_invalid');
        if (artifact.kind === 'png') ensure(content.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), 'calendar_requirement_artifacts_invalid');
        else ensure(content.toString('utf8').includes('<hierarchy') && !/(?:\/Users\/|\/home\/|password="true"|(?:text|content-desc)="[^"]*(?:@|bearer|password|credential|latitude|longitude|gps))/iu.test(content.toString('utf8')), 'calendar_requirement_artifacts_invalid');
      }
      artifacts.push(...members);
      probeResults.push(parsed.result);
      probeOrder += 1;
    }
    const stages = mapping.stage_ids.map((stageId) => leaves.get(`calendar-stage:${stageId}`));
    ensure(stages.every(Boolean), 'calendar_selector_invalid');
    const state = combineV12SourceResults([...probeResults, ...stages.map(({ result: memberResult }) => memberResult)]);
    leaf(`calendar:${mapping.evidence_id}`, 'calendar-requirement', mapping.evidence_id, state,
      ['calendar-requirements.json', 'maestro/calendar-requirements.xml', 'calendar/artifact-registry.json', ...artifacts.map(({ path: artifactPath }) => artifactPath),
        ...stages.flatMap(({ bindings }) => bindings.map(({ artifact }) => artifact.replace(prefix, '')))],
      { requirement_id: mapping.row_id, stage_ids: mapping.stage_ids,
        probe_receipts: record.probe_receipts.map(({ probe_id, receipt_sha256, status }) => ({ probe_id, receipt_sha256, status })), native_observation: 'EXECUTED' });
  }
  ensure(probeOrder === V12_CALENDAR_REQUIREMENT_PROBE_COUNT && probeNonces.size === probeOrder, 'calendar_requirement_probe_count_invalid');
  const garminGroups = { 'packaging-auth': ['packaging', 'bridge-allowlist', 'account-lifecycle', 'recovery'], 'sync-read': ['canonical-json', 'sync-read', 'privacy'], dedupe: V12_GARMIN_SHARD_CASE_IDS.slice(6, 9), matching: V12_GARMIN_SHARD_CASE_IDS.slice(9, 17) };
  const garminSchemas = { 'packaging-auth': 'packaging-auth/v1', 'sync-read': 'sync-read/v1', dedupe: 'dedupe/v1', matching: 'matching/v1' };
  const garminValues = Object.fromEntries(Object.keys(garminGroups).map(name => [name, json(`garmin/${name}.json`)]));
  const garminStates = {};
  for (const [name, ids] of Object.entries(garminGroups)) {
    const value = garminValues[name]; bindIdentity(value.identity);
    ensure(value.schema_version === 2 && value.producer === 'v12-garmin-shard/v3' && value.schema === garminSchemas[name]
      && value.identity.configuration_id === manifest.configuration.id && value.run_id === manifest.run_id && Array.isArray(value.cases), 'garmin_schema_invalid');
    exactIds(value.cases.map(entry => entry.id), ids, 'garmin_selectors_invalid');
    value.cases.forEach((entry) => {
      ensure(Object.keys(entry).sort().join(',') === 'code,count,id,order,receipt_sha256,status'
        && entry.order === V12_GARMIN_SHARD_CASE_IDS.indexOf(entry.id)
        && ['PASS', 'FAIL', 'NOT_RUN', 'REVIEW_REQUIRED'].includes(entry.status)
        && entry.code === `${entry.id}-${entry.status === 'FAIL' ? 'evidence-mismatch' : 'observed'}`
        && Number.isSafeInteger(entry.count) && entry.count >= 0 && HASH.test(entry.receipt_sha256 ?? ''), 'garmin_receipt_invalid');
      garminStates[entry.id] = result(entry.status);
    });
    if (name === 'matching' && value.cases.find(entry => entry.id === 'match-one')?.count !== 1) garminStates['match-one'] = 'FAIL';
  }
  const garminTests = parseV12SourceJUnit(bytes(full('maestro/garmin-progress.xml')).toString('utf8'), V12_GARMIN_SHARD_CASE_IDS, garminStates);
  for (const test of garminTests) {
    const name = Object.keys(garminGroups).find(key => garminGroups[key].includes(test.id));
    const receipt = garminValues[name].cases.find(entry => entry.id === test.id);
    leaf(`garmin:${test.id}`, 'garmin-case', test.id, combineV12SourceResults([test.result, garminStates[test.id]]), [`garmin/${name}.json`, 'maestro/garmin-progress.xml'], { testcase: test.id, junit_result: test.result, case_result: garminStates[test.id], receipt_sha256: receipt.receipt_sha256, shared_contract: `The ${name} artifact retains one host-derived status and receipt for each exact operation-backed case.` });
  }
  for (const name of ['migration', 'portability', 'history']) {
    const value = json(`sqlite/${name}.json`); bindIdentity(value.identity);
    const observation = resolveV12SqliteReceipt(value, name);
    leaf(`sqlite:${name}`, 'sqlite-cases', name, observation.result, [`sqlite/${name}.json`], observation);
    for (const caseFact of observation.case_facts) {
      leaf(`sqlite-case:${caseFact.id}`, 'sqlite-case', caseFact.id, caseFact.status,
        [`sqlite/${name}.json`], { order: caseFact.order, digest: caseFact.digest, source_facts: caseFact.source_facts });
    }
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
    'reduced-motion': group(['accessibility:motion', 'calendar-stage:reduced-motion'], 'reduced-motion'),
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
        : selector.type === 'dom-contract' ? resolveV12DomContract(selector, key => leaves.get(key))
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
    ensure(semantics.run_id === manifest.run_id && semantics.producer === 'v12-accessibility-native-observation/v1' && geometry.run_id === manifest.run_id && geometry.producer === 'v12-accessibility-geometry/v1' && Array.isArray(semantics.observations), 'accessibility_schema_invalid');
    validateV12AccessibilityProducer(semantics.observations, { source_tree_sha256: manifest.source.tree_sha256, fixture_sha256: manifest.fixtures.registry_sha256 }, code => fail(code));
    const configKeys = new Set(); const gates = { targets: [], 'input-focus': [], motion: [] };
    const targetGeometry = [];
    semantics.observations.forEach((observation, ordinal) => {
      const configKey = observation.native_receipts.configuration_sha256; ensure(!configKeys.has(configKey), 'accessibility_configuration_duplicate'); configKeys.add(configKey);
      const configuration = observation.configuration;
      ensure(configuration?.font_scale === 2 && Number.isFinite(configuration.density) && configuration.density > 0
        && Number.isFinite(configuration.content_bounds?.width) && configuration.content_bounds.width > 0 && Number.isFinite(configuration.content_bounds?.height) && configuration.content_bounds.height > 0
        && [configuration.insets?.top, configuration.insets?.bottom, configuration.ime_bounds?.top, configuration.ime_bounds?.bottom].every(Number.isFinite)
        && configuration.root === observation.root && configuration.motion_mode === observation.motion_mode
        && configuration.operation === observation.operation && configuration.fixture_id === observation.fixture_id
        && configuration.state_id === observation.state_id, 'accessibility_configuration_invalid');
      const base = observation.native_execution !== 'EXECUTED' ? 'NOT_RUN' : observation.restored_settings === undefined ? 'REVIEW_REQUIRED' : observation.restored_settings !== true ? 'FAIL' : 'PASS';
      const targets = observation.targets;
      ensure(Array.isArray(targets) && targets.length > 0 && targets.every(t => typeof t.id === 'string' && t.id.length > 0) && new Set(targets.map(t => t.id)).size === targets.length, 'accessibility_selector_invalid');
      targets.forEach(target => targetGeometry.push({ root: observation.root, state_id: observation.state_id, configuration_id: observation.configuration.id, id: target.id, bounds_dp: target.bounds_dp, overlap: target.overlap }));
      const targetPass = targets.every(t => typeof t.name === 'string' && t.name.length && typeof t.role === 'string' && t.role.length && typeof t.state === 'string' && t.non_color_cue === true && Number.isFinite(t.bounds_dp?.width) && t.bounds_dp.width >= 48 && Number.isFinite(t.bounds_dp?.height) && t.bounds_dp.height >= 48 && (t.overlap === false || t.bounds_dp.overlap === false));
      const interactions = observation.interactions;
      exactIds(interactions?.map(x => x.input), ['touch', 'software-keyboard', 'hardware-keyboard', 'dpad'], 'accessibility_input_selectors_invalid');
      const modal = observation.modal;
      const inputPass = interactions.every(x => typeof x.focus_before === 'string' && typeof x.focus_after === 'string' && x.focus_before !== x.focus_after && x.action === 'activate' && x.command_count === x.callback_count && x.command_count > 0 && HASH.test(x.callback_receipt_sha256 ?? '') && HASH.test(x.event_receipt_sha256 ?? '') && HASH.test(x.image_hash ?? ''))
        && modal?.focus_ring_dp === 3 && modal.focus_offset_dp === 3 && modal.background_isolated === true && modal.restores_invoker === true;
      const motion = observation.motion; const motionPass = motion?.mode === observation.motion_mode && motion.destination === observation.state_id && motion.callback_count > 0 && motion.frame_callback_count > 0 && HASH.test(motion.source_facts_sha256 ?? '') && HASH.test(motion.behavior_receipt_sha256 ?? '');
      for (const [gate, passed] of Object.entries({ targets: targetPass, 'input-focus': inputPass, motion: motionPass })) gates[gate].push({ ordinal, configuration_sha256: configKey, result: base === 'PASS' ? passed ? 'PASS' : 'FAIL' : base });
    });
    ensure(same(geometry.targets, targetGeometry), 'accessibility_geometry_binding_invalid');
    for (const [id, observations] of Object.entries(gates)) leaf(`accessibility:${id}`, 'accessibility-gate', id, combineV12SourceResults(observations.map(o => o.result)), ['semantics/accessibility.json', 'geometry/hit-targets.json'], { observations });
  }
  function resolvePerformance() {
    const value = json('performance.json'); const observation = value.observation;
    ensure(value.run_id === manifest.run_id && value.producer === 'v12-release-performance-writer/v1' && value.build_variant === 'release' && value.sample_origin === 'release-native-source-backed'
      && observation?.producer === 'v12-performance-observation-shard/v1' && RESULTS.includes(observation.observation_state) && same(observation.budgets, V12_PERFORMANCE_BUDGETS) && same(observation.workload, V12_PERFORMANCE_WORKLOAD), 'performance_schema_invalid');
    bindIdentity(observation.identity, 'sha');
    ensure(observation.identity.base_head === manifest.source.head && observation.identity.package === manifest.build.package && observation.identity.fixture_sha256 === manifest.fixtures.registry_sha256, 'performance_identity_invalid');
    validateV12PerformanceProducer({ schema_version: 1, suite: 'v1.2-performance', producer: 'v12-release-performance-collector/v1', native_execution: 'EXECUTED', sample_origin: 'release-native-source-backed', workload: observation.workload, identity: observation.identity, budgets: observation.budgets, samples: observation.raw_samples }, observation.identity, V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD, code => fail(code));
    const fixture = observation.raw_samples.phase12_merge_fixture;
    ensure(fixture?.snapshot_bytes === V12_PERFORMANCE_BUDGETS.phase12_merge_preflight.required_snapshot_bytes && fixture.rows === V12_PERFORMANCE_BUDGETS.phase12_merge_preflight.required_rows && fixture.writer_commits === 5 && fixture.sqlite_max_variable_number >= 4000, 'performance_fixture_invalid');
    ensure(same(validateV12PerformanceShard(observation, observation.identity), observation.summary), 'performance_summary_invalid');
    const gates = resolveV12PerformanceGates(observation);
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

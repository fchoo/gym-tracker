import { createHash } from 'node:crypto';
import { V12_GARMIN_SHARD_CASE_IDS } from './v12-garmin-shard.mjs';

export const fail = (code) => { throw new Error(`v12_production_native_launcher_${code}`); };
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
export const HASH = /^[a-f0-9]{64}$/u;
const STATES = ['PASS', 'FAIL', 'NOT_RUN', 'REVIEW_REQUIRED'];

export function garminCases(value) {
  if (!exact(value, ['cases']) || !Array.isArray(value.cases) || value.cases.length !== 18) fail('garmin_result_invalid');
  value.cases.forEach((entry, order) => {
    if (!exact(entry, ['id', 'order', 'status', 'code', 'count']) || entry.id !== V12_GARMIN_SHARD_CASE_IDS[order]
      || entry.order !== order || !STATES.includes(entry.status) || !/^[a-z0-9-]{3,80}$/u.test(entry.code ?? '')
      || !['observed', 'observation-failed', 'instrumentation-unavailable', 'review-required'].includes(entry.code)
      || !Number.isSafeInteger(entry.count) || entry.count < 0
      || (entry.status === 'NOT_RUN' && (entry.count !== 0 || entry.code !== 'instrumentation-unavailable'))) fail('garmin_result_invalid');
  });
  return value;
}

// Parse a bounded XML subset, not a regex search for a passing testcase. DTDs,
// entities, duplicate attributes, malformed nesting and multiple roots fail closed.
// Failure text is parsed only to locate outcomes; it is never returned.
export function junitOutcome(xml, exitCode) {
  if (typeof xml !== 'string' || xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/iu.test(xml)) fail('junit_invalid');
  const document = { name: '#document', children: [] }; const stack = [document];
  const tokens = /<\?xml\s[^?]*\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>|[^<]+/gu;
  let consumed = 0;
  for (const match of xml.matchAll(tokens)) {
    if (match.index !== consumed) fail('junit_invalid');
    const token = match[0]; consumed += token.length;
    if (token.startsWith('<?xml') || token.startsWith('<!--') || token.startsWith('<![CDATA[')) continue;
    if (!token.startsWith('<')) { if (stack.length === 1 && token.trim()) fail('junit_invalid'); continue; }
    if (token.startsWith('</')) {
      const name = /^<\/([A-Za-z][\w.-]*)\s*>$/u.exec(token)?.[1];
      if (stack.length === 1 || stack.pop().name !== name) fail('junit_invalid');
      continue;
    }
    const tag = /^<([A-Za-z][\w.-]*)([\s\S]*?)(\/?)>$/u.exec(token);
    if (!tag) fail('junit_invalid');
    let attributes = tag[2]; const names = new Set(); const values = {};
    while (attributes.trim()) {
      const attr = /^\s+([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/u.exec(attributes);
      if (!attr || names.has(attr[1])) fail('junit_invalid');
      names.add(attr[1]); values[attr[1]] = attr[2] ?? attr[3]; attributes = attributes.slice(attr[0].length);
    }
    const node = { name: tag[1], children: [], attributes: values };
    stack.at(-1).children.push(node);
    if (!tag[3]) stack.push(node);
    if (stack.length > 24) fail('junit_invalid');
  }
  if (consumed !== xml.length || stack.length !== 1 || document.children.length !== 1
    || !['testsuite', 'testsuites'].includes(document.children[0].name)) fail('junit_invalid');
  const cases = [];
  function visit(node, parent) {
    if (node.name === 'testcase') { if (parent !== 'testsuite') fail('junit_invalid'); cases.push(node); }
    if (['failure', 'error', 'skipped'].includes(node.name) && parent !== 'testcase') fail('junit_invalid');
    for (const child of node.children) visit(child, node.name);
  }
  visit(document.children[0], '#document');
  if (cases.length !== 1) fail('junit_case_count_invalid');
  const kinds = cases[0].children.map((node) => node.name);
  const status = kinds.includes('failure') || kinds.includes('error') ? 'FAIL' : kinds.includes('skipped') ? 'NOT_RUN' : 'PASS';
  function summary(node) {
    if (node.name === 'testsuite' || node.name === 'testsuites') {
      for (const [key, expected] of Object.entries({ tests: 1, failures: kinds.includes('failure') ? 1 : 0, errors: kinds.includes('error') ? 1 : 0, skipped: kinds.includes('skipped') ? 1 : 0 })) {
        if (node.attributes[key] !== undefined && node.attributes[key] !== String(expected)) fail('junit_summary_mismatch');
      }
    }
    node.children.forEach(summary);
  }
  summary(document.children[0]);
  if (![0, 1].includes(exitCode) || (exitCode !== 0 && status !== 'FAIL')) fail('junit_exit_mismatch');
  return status;
}

export function calendarStage(value, id, order) {
  if (!exact(value, ['id', 'order', 'status', 'samples', 'receipt']) || value.id !== id || value.order !== order
    || !STATES.includes(value.status) || !Array.isArray(value.samples) || value.samples.length < 2 || value.samples.length > 512) fail('calendar_receipt_invalid');
  const r = value.receipt;
  if (!exact(r, ['content_width_dp', 'start_dp', 'end_dp', 'dx_dp', 'dy_dp', 'event_sequence', 'cancelled', 'settled', 'callback_count', 'semantic_transition', 'screenshot_sha256', 'trace_sha256', 'expected_outcome'])
    || !Number.isFinite(r.content_width_dp) || r.content_width_dp <= 0
    || ![r.start_dp, r.end_dp].every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
    || ![r.dx_dp, r.dy_dp].every(Number.isFinite) || Math.abs(r.end_dp[0] - r.start_dp[0] - r.dx_dp) > 0.01 || Math.abs(r.end_dp[1] - r.start_dp[1] - r.dy_dp) > 0.01
    || !Array.isArray(r.event_sequence) || r.event_sequence.length < 3 || r.event_sequence.length > 2048
    || r.event_sequence[0] !== 'pointer-down' || r.event_sequence.at(-1) !== 'pointer-up'
    || r.event_sequence.some((event) => !['pointer-down', 'pointer-move', 'pointer-up', 'cancel'].includes(event))
    || typeof r.cancelled !== 'boolean' || typeof r.settled !== 'boolean' || (r.cancelled && r.settled)
    || r.cancelled !== r.event_sequence.includes('cancel') || (value.status === 'PASS' && !r.settled)
    || !Number.isSafeInteger(r.callback_count) || r.callback_count < 1
    || !exact(r.semantic_transition, ['pre', 'during', 'post']) || !Object.values(r.semantic_transition).every(safeLabel)
    || r.expected_outcome !== id || !HASH.test(r.screenshot_sha256) || !HASH.test(r.trace_sha256)) fail('calendar_receipt_invalid');
  value.samples.forEach((s, index) => {
    const prior = value.samples[index - 1];
    if (!exact(s, ['timestampMs', 'widthDp', 'dxDp', 'dyDp', 'intentOwner', 'translationDp', 'title', 'selectedCivilDate', 'generation', 'focusedWeek', 'rowBounds', 'callbackCount', 'focusIdentity', 'motion'])
      || ![s.timestampMs, s.widthDp, s.dxDp, s.dyDp, s.translationDp].every(Number.isFinite) || s.widthDp <= 0
      || Math.abs(s.translationDp - s.dxDp) > 2 || !['horizontal', 'vertical', 'diagonal'].includes(s.intentOwner)
      || !safeLabel(s.title) || !/^\d{4}-\d{2}-\d{2}$/u.test(s.selectedCivilDate ?? '')
      || !Number.isSafeInteger(s.generation) || s.generation < 1 || !safeLabel(s.focusedWeek) || !safeLabel(s.focusIdentity)
      || !Array.isArray(s.rowBounds) || s.rowBounds.length !== 2 || !s.rowBounds.every(Number.isFinite) || s.rowBounds[1] <= s.rowBounds[0]
      || !Number.isSafeInteger(s.callbackCount) || s.callbackCount < 1 || !['normal', 'reduced'].includes(s.motion)
      || (prior && (s.timestampMs <= prior.timestampMs || s.generation < prior.generation || s.callbackCount < prior.callbackCount))) fail('calendar_receipt_invalid');
  });
  if (hash(JSON.stringify(value.samples)) !== r.trace_sha256) fail('calendar_trace_mismatch');
  return value;
}

function safeLabel(value) {
  return typeof value === 'string' && /^[A-Za-z0-9 .:_-]{1,100}$/u.test(value)
    && !/bearer|password|secret|credential/iu.test(value);
}

export function worse(left, right) {
  const priority = ['PASS', 'REVIEW_REQUIRED', 'NOT_RUN', 'FAIL'];
  return priority[Math.max(priority.indexOf(left), priority.indexOf(right))];
}

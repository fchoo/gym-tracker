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

export function worse(left, right) {
  const priority = ['PASS', 'REVIEW_REQUIRED', 'NOT_RUN', 'FAIL'];
  return priority[Math.max(priority.indexOf(left), priority.indexOf(right))];
}

import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const SEVERITIES = ["info", "low", "moderate", "high", "critical"];
const POLICY = JSON.parse(readFileSync(new URL("./dependency-audit-policy.json", import.meta.url), "utf8"));
const defaultLock = () => JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const reject = () => { throw new Error("npm_audit_policy_rejected"); };
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function uniqueStrings(value) {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")
    || new Set(value).size !== value.length) reject();
  return [...value].sort();
}

function reviewedRecord(value) {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.isDirect !== "boolean"
    || typeof value.range !== "string" || !SEVERITIES.includes(value.severity)
    || !Array.isArray(value.via) || value.via.length === 0 || value.nodes?.length === 0) reject();
  // Keep the complete advisory record (including range, title and CVSS). Only
  // order is normalized. No unreviewed forward edge, reverse edge or node is
  // inferred acceptable from the fact that it eventually reaches a known CVE.
  const via = value.via.map(item => {
    if (typeof item === "string") return item;
    if (!isRecord(item) || !Number.isSafeInteger(item.source)) reject();
    return item;
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (new Set(via.map(item => typeof item === "string" ? item : item.source)).size !== via.length) reject();
  const variants = POLICY.accepted_derived_ranges[value.name];
  const range = variants?.includes(value.range) ? POLICY.vulnerabilities[value.name].range : value.range;
  return { name:value.name, severity:value.severity, isDirect:value.isDirect, range,
    nodes:uniqueStrings(value.nodes), via };
}

export function evaluateAudit(audit, { now = new Date(), lock } = {}) {
  if (!isRecord(audit) || !isRecord(audit.metadata?.vulnerabilities) || !isRecord(audit.vulnerabilities)) {
    throw new Error("npm_audit_malformed");
  }
  const counts = audit.metadata.vulnerabilities;
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())
    || !isDeepStrictEqual(Object.keys(counts).sort(), [...SEVERITIES, "total"].sort())
    || [...SEVERITIES, "total"].some(severity => !Number.isSafeInteger(counts[severity]) || counts[severity] < 0)
    || SEVERITIES.reduce((total, severity) => total + counts[severity], 0) !== counts.total) {
    throw new Error("npm_audit_malformed");
  }
  const entries = Object.entries(audit.vulnerabilities);
  if (entries.length !== counts.total) reject();
  for (const severity of SEVERITIES) {
    if (entries.filter(([, value]) => value?.severity === severity).length !== counts[severity]) reject();
  }
  const packages = (lock ?? defaultLock()).packages;
  if (!isRecord(packages)) reject();
  for (const [node, version] of Object.entries(POLICY.required_versions)) {
    if (!Object.hasOwn(packages, node) || !isRecord(packages[node]) || packages[node].version !== version) reject();
  }
  for (const [node, value] of Object.entries(packages)) {
    if (!/(?:^|\/)node_modules\/(?:zod|decode-uri-component|glob|minimatch)$/u.test(node)) continue;
    const version = POLICY.required_versions[node] ?? POLICY.locked_versions[node];
    if (version === undefined || !isRecord(value) || value.version !== version) reject();
  }
  if (now.getTime() > Date.parse(POLICY.review_by)) reject();
  if (entries.length === 0) return Object.freeze({ reviewed:0 });
  for (const [name, value] of entries) {
    if (!Object.hasOwn(POLICY.vulnerabilities, name)
      || !isDeepStrictEqual(reviewedRecord(value), reviewedRecord(POLICY.vulnerabilities[name]))) reject();
    const effects = uniqueStrings(value.effects);
    const expectedEffects = Object.entries(POLICY.vulnerabilities)
      .filter(([, dependent]) => dependent.via.includes(name)).map(([dependent]) => dependent).sort();
    // npm intermittently drops indirect reverse links while computing cyclic
    // metavulnerabilities. The exact forward graph remains authoritative;
    // every reported reverse link must still be reciprocal. Direct advisory
    // roots retain exact reverse-link matching, including missing links.
    if (effects.some(effect => !expectedEffects.includes(effect))
      || (Object.hasOwn(POLICY.roots, name) && !isDeepStrictEqual(effects, expectedEffects))) reject();
    for (const node of value.nodes) {
      if (!Object.hasOwn(packages, node) || packages[node].version !== POLICY.locked_versions[node]) reject();
    }
    for (const source of value.via) {
      if (typeof source === "string" && !Object.hasOwn(audit.vulnerabilities, source)) reject();
    }
  }
  // Known package cycles are bound to the reviewed forward graph; an added
  // cycle cannot gain authority through recursive traversal.
  return Object.freeze({ reviewed:entries.length });
}

if (process.argv[1]?.endsWith("evaluate-npm-audit.mjs")) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const result = evaluateAudit(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  process.stdout.write(`npm audit policy passed; ${result.reviewed} reviewed vulnerability entries\n`);
}

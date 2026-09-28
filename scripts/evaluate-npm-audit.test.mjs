import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAudit } from "./evaluate-npm-audit.mjs";

const advisory = (source, url) => ({ source, url, severity: "moderate" });
test("permits only the reviewed moderate advisory sources before expiry", () => {
  assert.doesNotThrow(() => evaluateAudit({ metadata: { vulnerabilities: { moderate: 2, high: 0, critical: 0 } }, vulnerabilities: {
    "decode-uri-component": { via: [advisory(1147955, "https://github.com/advisories/GHSA-vcc3-ghjq-m6fr")] },
    uuid: { via: [advisory(1119441, "https://github.com/advisories/GHSA-w5hq-g745-h8pq")] },
  } }, "2026-09-28"));
});
test("fails new, missing, expired, high, or malformed audit findings", () => {
  const base = { metadata: { vulnerabilities: { moderate: 2, high: 0, critical: 0 } }, vulnerabilities: {
    "decode-uri-component": { via: [advisory(1147955, "https://github.com/advisories/GHSA-vcc3-ghjq-m6fr")] }, uuid: { via: [advisory(1119441, "https://github.com/advisories/GHSA-w5hq-g745-h8pq")] },
  } };
  assert.throws(() => evaluateAudit({ ...base, metadata: { vulnerabilities: { moderate: 2, high: 1, critical: 0 } } }, "2026-09-28"));
  assert.throws(() => evaluateAudit({ ...base, vulnerabilities: { ...base.vulnerabilities, other: { via: [advisory(9, "https://github.com/advisories/GHSA-other")] } } }, "2026-09-28"));
  assert.throws(() => evaluateAudit(base, "2026-11-01"));
});

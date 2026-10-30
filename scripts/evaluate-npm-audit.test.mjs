import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAudit } from "./evaluate-npm-audit.mjs";

const cleanAudit = {
  metadata: {
    vulnerabilities: {
      info: 0,
      low: 0,
      moderate: 0,
      high: 0,
      critical: 0,
      total: 0,
    },
  },
  vulnerabilities: {},
};

test("accepts an audit with no reported advisories", () => {
  assert.doesNotThrow(() => evaluateAudit(cleanAudit));
});

test("rejects every reported severity instead of allowlisting advisories", () => {
  for (const severity of ["info", "low", "moderate", "high", "critical"]) {
    const audit = structuredClone(cleanAudit);
    audit.metadata.vulnerabilities[severity] = 1;
    audit.metadata.vulnerabilities.total = 1;
    assert.throws(() => evaluateAudit(audit), /npm_audit_policy_rejected/);
  }
});

test("rejects advisory entries even when metadata incorrectly reports zero", () => {
  const audit = structuredClone(cleanAudit);
  audit.vulnerabilities["unexpected-package"] = {
    severity: "moderate",
    via: [{ source: 123, url: "https://github.com/advisories/GHSA-example" }],
  };
  assert.throws(() => evaluateAudit(audit), /npm_audit_policy_rejected/);
});

test("rejects malformed audit output", () => {
  assert.throws(() => evaluateAudit(null), /npm_audit_malformed/);
  assert.throws(() => evaluateAudit({ metadata: {}, vulnerabilities: {} }), /npm_audit_malformed/);
  assert.throws(() => evaluateAudit({ metadata: cleanAudit.metadata }), /npm_audit_malformed/);
});

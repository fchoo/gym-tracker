import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
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

const reviewedBuildTimeAudit = JSON.parse(readFileSync(new URL("./testing/data/npm-audit-20261102.json", import.meta.url), "utf8"));

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

test("accepts only the exact reviewed build-time advisory closure before its review deadline", () => {
  assert.doesNotThrow(() => evaluateAudit(reviewedBuildTimeAudit, {
    now: new Date("2026-10-30T00:00:00.000Z"),
  }));
});

test("rejects the Zod advisory when the vulnerable node is reachable from application imports", () => {
  const audit = structuredClone(reviewedBuildTimeAudit);
  audit.vulnerabilities.zod.nodes.push("node_modules/zod");
  assert.throws(
    () => evaluateAudit(audit, { now: new Date("2026-10-30T00:00:00.000Z") }),
    /npm_audit_policy_rejected/,
  );
});

test("rejects an advisory closure after its mandatory review date", () => {
  assert.throws(
    () => evaluateAudit(reviewedBuildTimeAudit, { now: new Date("2026-12-01T00:00:00.000Z") }),
    /npm_audit_policy_rejected/,
  );
});

test("rejects an unreviewed advisory even when it is attached to an accepted package", () => {
  const audit = structuredClone(reviewedBuildTimeAudit);
  audit.vulnerabilities.zod.via[0].source = 9999999;
  assert.throws(
    () => evaluateAudit(audit, { now: new Date("2026-10-30T00:00:00.000Z") }),
    /npm_audit_policy_rejected/,
  );
});

test("rejects malformed audit output", () => {
  assert.throws(() => evaluateAudit(null), /npm_audit_malformed/);
  assert.throws(() => evaluateAudit({ metadata: {}, vulnerabilities: {} }), /npm_audit_malformed/);
  assert.throws(() => evaluateAudit({ metadata: cleanAudit.metadata }), /npm_audit_malformed/);
});

const now = new Date("2026-11-02T00:00:00.000Z");
for (const [title, mutate] of [
  ["severity counts disagree with actual entries", audit => {
    audit.metadata.vulnerabilities.info = audit.metadata.vulnerabilities.total;
    for (const severity of ["low", "moderate", "high", "critical"]) audit.metadata.vulnerabilities[severity] = 0;
  }],
  ["advisory range changes", audit => { audit.vulnerabilities.zod.via[0].range = "*"; }],
  ["advisory title changes", audit => { audit.vulnerabilities.zod.via[0].title = "Different threat"; }],
  ["direct dependency status changes", audit => { audit.vulnerabilities.zod.isDirect = true; }],
  ["dependency range changes", audit => { audit.vulnerabilities.zod.range = "*"; }],
  ["propagated entry gains another installed node", audit => { audit.vulnerabilities.expo.nodes.push("node_modules/other/node_modules/expo"); }],
  ["effects relationship changes", audit => { audit.vulnerabilities.zod.effects = []; }],
  ["unreviewed graph cycle appears", audit => { audit.vulnerabilities.zod.via = ["expo"]; }],
  ["duplicate dependency edges appear", audit => { audit.vulnerabilities.expo.via.push(audit.vulnerabilities.expo.via[0]); }],
  ["malformed entry uses an array", audit => { audit.vulnerabilities.expo = []; }],
  ["an orphan dependency is added", audit => {
    audit.vulnerabilities["fake-package"] = {name:"fake-package",severity:"high",isDirect:false,via:["zod"],effects:[],range:"*",nodes:["node_modules/fake-package"]};
    audit.metadata.vulnerabilities.high += 1;
    audit.metadata.vulnerabilities.total += 1;
  }],
]) {
  test(`rejects reviewed audit when ${title}`, () => {
    const audit = structuredClone(reviewedBuildTimeAudit);
    mutate(audit);
    assert.throws(() => evaluateAudit(audit, { now }), /npm_audit_(policy_rejected|malformed)/u);
  });
}

test("audit acceptance is independent of object and array order", () => {
  const audit = structuredClone(reviewedBuildTimeAudit);
  audit.vulnerabilities = Object.fromEntries(Object.entries(audit.vulnerabilities).reverse().map(([name, value]) => [name, {
    ...value, nodes:[...value.nodes].reverse(), effects:[...value.effects].reverse(), via:[...value.via].reverse(),
  }]));
  assert.doesNotThrow(() => evaluateAudit(audit, { now }));
});

test("rejects reviewed exceptions when their locked dependency version changes", () => {
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  lock.packages["node_modules/expo/node_modules/zod"].version = "3.25.75";
  assert.throws(() => evaluateAudit(reviewedBuildTimeAudit, { now, lock }), /npm_audit_policy_rejected/u);
});

test("clean metadata cannot hide a downgraded runtime dependency", () => {
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  lock.packages["node_modules/zod"].version = "4.4.3";
  assert.throws(() => evaluateAudit(cleanAudit, { now, lock }), /npm_audit_policy_rejected/u);
});

test("npm may omit indirect reverse links but cannot invent an inconsistent link", () => {
  const audit = structuredClone(reviewedBuildTimeAudit);
  audit.vulnerabilities["@jest/core"].effects = [];
  assert.doesNotThrow(() => evaluateAudit(audit, { now }));
  audit.vulnerabilities["@jest/core"].effects = ["expo"];
  assert.throws(() => evaluateAudit(audit, { now }), /npm_audit_policy_rejected/u);
});

for (const [node, version] of [
  ["node_modules/foo/node_modules/decode-uri-component", "0.5.0"],
  ["node_modules/foo/node_modules/zod", "4.4.3"],
  ["node_modules/foo/node_modules/minimatch", "3.1.5"],
]) {
  test(`clean audit cannot hide an unreviewed installation at ${node}`, () => {
    const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
    lock.packages[node] = { version };
    assert.throws(() => evaluateAudit(cleanAudit, { now, lock }), /npm_audit_policy_rejected/u);
  });
}

test("rejects unknown severity keys even when known counts are correct", () => {
  const audit = structuredClone(reviewedBuildTimeAudit);
  audit.metadata.vulnerabilities.unknown = 1;
  assert.throws(() => evaluateAudit(audit, { now }), /npm_audit_malformed/u);
});

test("clean metadata cannot bypass expiry of the retained exception versions", () => {
  assert.throws(() => evaluateAudit(cleanAudit, { now: new Date("2026-12-01T00:00:00.000Z") }), /npm_audit_policy_rejected/u);
});

test("accepts only the recorded nightly range variant without changing locked package authority", () => {
  const audit = structuredClone(reviewedBuildTimeAudit);
  audit.vulnerabilities["@react-native/virtualized-lists"].range += " || >=0.89.0-nightly-20260909-b830082cf";
  assert.doesNotThrow(() => evaluateAudit(audit, { now }));
  audit.vulnerabilities["@react-native/virtualized-lists"].range = "*";
  assert.throws(() => evaluateAudit(audit, { now }), /npm_audit_policy_rejected/u);
});

test("derived release ranges may grow only while still covering the exact reviewed locked versions", () => {
  const audit = structuredClone(reviewedBuildTimeAudit);
  audit.vulnerabilities["@react-native/virtualized-lists"].range += " || >=0.90.0-nightly-20261102-abcdef";
  assert.doesNotThrow(() => evaluateAudit(audit, { now }));
  audit.vulnerabilities["@react-native/virtualized-lists"].range = ">=999.0.0";
  assert.throws(() => evaluateAudit(audit, { now }), /npm_audit_policy_rejected/u);
});

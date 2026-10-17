import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  V12_PREBUILD_PREDECESSORS,
  validateV12PrebuildPredecessors,
} from "./validate-v12-prebuild-predecessors.mjs";

const TEST_TIMEOUT_MS = 30_000;

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "v12-predecessors-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  for (const predecessor of V12_PREBUILD_PREDECESSORS) {
    for (const relative of predecessor.files) {
      const target = path.join(root, relative);
      cpSync(path.join(process.cwd(), relative), target, { recursive: true });
    }
  }
  return root;
}

function replace(root, relative, from, to) {
  const file = path.join(root, relative);
  const source = readFileSync(file, "utf8");
  assert.match(source, from);
  writeFileSync(file, source.replace(from, to));
}

test("the prebuild predecessor gate accepts every exact Phase 13-19 terminal contract", { timeout: TEST_TIMEOUT_MS }, (t) => {
  assert.deepEqual(V12_PREBUILD_PREDECESSORS.map(({ phase }) => phase), [13, 14, 15, 16, 17, 18, 19]);
  const result = validateV12PrebuildPredecessors({ root: fixture(t) });
  assert.deepEqual(result, { ok: true, phases: [13, 14, 15, 16, 17, 18, 19], files: 20 });
});

test("the prebuild predecessor gate rejects missing, malformed, and incomplete terminal records", { timeout: TEST_TIMEOUT_MS }, async (t) => {
  await t.test("missing terminal summary", (t) => {
    const root = fixture(t);
    rmSync(path.join(root, V12_PREBUILD_PREDECESSORS[0].summary));
    assert.throws(() => validateV12PrebuildPredecessors({ root }), /phase20_prebuild_predecessor_missing:phase-13:summary/u);
  });
  await t.test("wrong summary schema", (t) => {
    const root = fixture(t);
    replace(root, V12_PREBUILD_PREDECESSORS[1].summary, /^phase: 14-prototype-visual-shell$/mu, "phase: 99-wrong");
    assert.throws(() => validateV12PrebuildPredecessors({ root }), /phase20_prebuild_predecessor_schema:phase-14:summary/u);
  });
  await t.test("nonterminal validation status", (t) => {
    const root = fixture(t);
    replace(root, V12_PREBUILD_PREDECESSORS[2].validation, /^status: validated_host$/mu, "status: draft");
    assert.throws(() => validateV12PrebuildPredecessors({ root }), /phase20_prebuild_predecessor_status:phase-15:validation/u);
  });
  await t.test("failed verification", (t) => {
    const root = fixture(t);
    replace(root, V12_PREBUILD_PREDECESSORS[3].verification, /^status: passed$/mu, "status: failed");
    assert.throws(() => validateV12PrebuildPredecessors({ root }), /phase20_prebuild_predecessor_status:phase-16:verification/u);
  });
  await t.test("failed summary evidence", (t) => {
    const root = fixture(t);
    replace(root, V12_PREBUILD_PREDECESSORS[0].summary, /^        status: pass$/mu, "        status: fail");
    assert.throws(() => validateV12PrebuildPredecessors({ root }), /phase20_prebuild_predecessor_status:phase-13:evidence/u);
  });
});

test("the predecessor gate rejects authority escalation and requires explicit Phase 20 deferrals", { timeout: TEST_TIMEOUT_MS }, async (t) => {
  await t.test("release authority", (t) => {
    const root = fixture(t);
    const file = V12_PREBUILD_PREDECESSORS[4].verification;
    replace(root, file, /^native_pass_claimed: false$/mu, "native_pass_claimed: false\nrelease_authorized: true");
    assert.throws(() => validateV12PrebuildPredecessors({ root }), /phase20_prebuild_predecessor_authority:phase-17:verification/u);
  });
  await t.test("native deferral removed", (t) => {
    const root = fixture(t);
    const file = V12_PREBUILD_PREDECESSORS[5].verification;
    replace(root, file, /^native_status: deferred_phase20$/mu, "native_status: passed");
    assert.throws(() => validateV12PrebuildPredecessors({ root }), /phase20_prebuild_predecessor_authority:phase-18:verification/u);
  });
});

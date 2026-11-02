import assert from "node:assert/strict";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { loadV12ContractInputs } from "../v12-evidence-contract.mjs";
import { deriveV12Ledger } from "../verify-v12-native-evidence.mjs";

const root = realpathSync(process.env.V12_PHASE20_COVERAGE_FIXTURE);
const run = readdirSync(path.join(root, "artifacts/native/v1.2")).find(name => name.startsWith("phase20-"));
const manifest = JSON.parse(readFileSync(path.join(root, "artifacts/native/v1.2", run, "build.json"), "utf8"));
const evidence = JSON.parse(readFileSync(path.join(root, "test-resolution.json"), "utf8")).row_evidence;
const passing = evidence.find(row => row.result === "PASS");
const inputs = loadV12ContractInputs({ root });
const valid = { row_id: passing.row_id, deviation_id: "DEV-20-902", owner_decision: "accepted bounded deviation", decided_at: "2026-10-17", scope: "synthetic metadata validation", configurations: [manifest.configuration.id], rationale: "otherwise passing retained evidence", evidence_hashes: [passing.sha256] };
const derive = changes => deriveV12Ledger({ inputs, manifest, evidence, root,
  readArtifact: relative => readFileSync(path.join(root, relative)), allowTestCalendarFixture: true, ...changes });

test("source-backed ledger rejects malformed or forbidden exception metadata", async t => {
  const cases = [
    ["exception collection", null, /v12_final_exception_set_invalid/u],
    ["unknown row", [{ ...valid, row_id: "unknown" }], /v12_final_exception_metadata_invalid/u],
    ["duplicate row", [valid, valid], /v12_final_exception_metadata_invalid/u],
    ["settled baseline", [{ ...valid, deviation_id: "MAP-01" }], /v12_final_exception_metadata_invalid/u],
    ["invalid date", [{ ...valid, decided_at: "invalid" }], /v12_final_exception_metadata_invalid/u],
    ["empty configurations", [{ ...valid, configurations: [] }], /v12_final_exception_metadata_invalid/u],
    ["invalid evidence digest", [{ ...valid, evidence_hashes: ["invalid"] }], /v12_final_exception_metadata_invalid/u],
  ];
  for (const [name, exceptions, expected] of cases) await t.test(name, () => {
    process.stderr.write(`[ledger metadata] before ${name}\n`);
    assert.throws(() => derive({ exceptions }), expected);
    process.stderr.write(`[ledger metadata] after ${name}\n`);
  });
});

test("reviewed readiness policy requires its exact schema and explicit permission", async t => {
  const validPolicy = { policy_id: "reviewed-policy", reviewed_by: "owner", reviewed_at: "2026-10-17", permits_accepted_exceptions: true };
  const cases = [
    ["missing fields", {}],
    ["policy identifier", { ...validPolicy, policy_id: 1 }],
    ["reviewer", { ...validPolicy, reviewed_by: 1 }],
    ["review date", { ...validPolicy, reviewed_at: "invalid" }],
    ["explicit permission", { ...validPolicy, permits_accepted_exceptions: false }],
  ];
  for (const [name, readiness_policy] of cases) await t.test(name, () => {
    process.stderr.write(`[ledger policy] before ${name}\n`);
    assert.throws(() => derive({ readiness_policy }), /v12_final_readiness_policy_invalid/u);
    process.stderr.write(`[ledger policy] after ${name}\n`);
  });
});

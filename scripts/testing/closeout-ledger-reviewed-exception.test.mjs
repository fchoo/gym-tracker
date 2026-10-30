import assert from "node:assert/strict";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { loadV12ContractInputs } from "../v12-evidence-contract.mjs";
import { deriveV12Ledger } from "../verify-v12-native-evidence.mjs";

test("reviewed exceptions cannot soften retained source blockers and only classify otherwise passing rows", () => {
  const root = realpathSync(process.env.V12_PHASE20_COVERAGE_FIXTURE);
  const run = readdirSync(path.join(root, "artifacts/native/v1.2")).find(name => name.startsWith("phase20-"));
  const manifest = JSON.parse(readFileSync(path.join(root, "artifacts/native/v1.2", run, "build.json"), "utf8"));
  const evidence = JSON.parse(readFileSync(path.join(root, "test-resolution.json"), "utf8")).row_evidence;
  const passing = evidence.find(row => row.result === "PASS");
  const blocker = evidence.find(row => ["FAIL", "NOT_RUN", "REVIEW_REQUIRED"].includes(row.result));
  assert.ok(passing);
  assert.ok(blocker);
  const exception = row => ({ row_id: row.row_id, deviation_id: "DEV-20-901", owner_decision: "accepted bounded deviation", decided_at: "2026-10-17", scope: "synthetic retained verification", configurations: [manifest.configuration.id], rationale: "retained passing evidence only", evidence_hashes: [row.sha256] });
  const policy = { policy_id: "reviewed-closeout-policy", reviewed_by: "owner", reviewed_at: "2026-10-17", permits_accepted_exceptions: true };
  const ledger = deriveV12Ledger({ inputs: loadV12ContractInputs({ root }), manifest, evidence,
    root, readArtifact: relative => readFileSync(path.join(root, relative)), allowTestCalendarFixture: true,
    exceptions: [exception(passing), exception(blocker)], readiness_policy: policy });
  assert.equal(ledger.rows.find(row => row.requirement_id === passing.row_id).verdict, "ACCEPTED_EXCEPTION");
  assert.equal(ledger.rows.find(row => row.requirement_id === blocker.row_id).verdict, blocker.result);
  assert.equal(ledger.readiness, "NOT_READY");
  assert.equal(ledger.accepted_exception_count, 1);
  assert.deepEqual(ledger.policy, policy);
});

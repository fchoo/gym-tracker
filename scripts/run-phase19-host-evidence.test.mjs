import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parsePhase19HostEvidenceArgs } from "./run-phase19-host-evidence.mjs";

test("Phase 19 host collection accepts only the automated evidence mode", () => {
  assert.deepEqual(parsePhase19HostEvidenceArgs(["--automated-only"]), {
    automated_only: true,
  });
  for (const args of [[], ["--native"], ["--automated-only", "--skip-coverage"]]) {
    assert.throws(
      () => parsePhase19HostEvidenceArgs(args),
      /phase19_host_evidence_arguments_invalid/u,
    );
  }
});

test("Phase 19 host collection bounds commands and retains every producer output", () => {
  const source = readFileSync("scripts/run-phase19-host-evidence.mjs", "utf8");
  assert.match(source, /MAX_COMMANDS = 7/u);
  assert.match(source, /MAX_OUTPUT_BYTES = 32 \* 1024 \* 1024/u);
  assert.match(source, /COVERAGE_TIMEOUT_MS = 900_000/u);
  assert.match(source, /contract-result\.json/u);
  assert.match(source, /benchmark-result\.json/u);
  assert.match(source, /coverage-result\.json/u);
  assert.match(source, /assertCleanCommittedTree/u);
  assert.doesNotMatch(source, /host:\s*\{\s*status:\s*["']PASS/u);
});

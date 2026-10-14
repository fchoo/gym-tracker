import assert from "node:assert/strict";
import test from "node:test";

import {
  parseV12EvidenceCliArgs,
  executeV12EvidenceCli,
} from "./verify-v12-native-evidence.mjs";

const RUN_ID = "phase20-20261014T031137Z-5917481c1fd1";

test("the Phase 20 verifier accepts only the explicit unified shard, preseal, and final grammars", () => {
  assert.deepEqual(
    parseV12EvidenceCliArgs(["--run", RUN_ID, "--mode", "shards-only", "--ids", "sqlite,calendar"]),
    { run_id: RUN_ID, mode: "shards-only", ids: ["sqlite", "calendar"], no_final_write: false },
  );
  assert.deepEqual(
    parseV12EvidenceCliArgs(["--run", RUN_ID, "--mode", "preseal", "--no-final-write"]),
    { run_id: RUN_ID, mode: "preseal", ids: null, no_final_write: true },
  );
  assert.deepEqual(
    parseV12EvidenceCliArgs(["--run", RUN_ID, "--mode", "final"]),
    { run_id: RUN_ID, mode: "final", ids: null, no_final_write: false },
  );
  for (const args of [
    ["--mode", "preseal", "--run", RUN_ID],
    ["--run", RUN_ID, "--mode", "preseal"],
    ["--run", RUN_ID, "--mode", "final", "--no-final-write"],
    ["--run", RUN_ID, "--mode", "shards-only"],
    ["--run", RUN_ID, "--mode", "shards-only", "--ids", "sqlite", "--no-final-write"],
  ]) assert.throws(() => parseV12EvidenceCliArgs(args), /v12_preflight_cli_invalid/u);
});

test("unified preflight execution is explicitly source-only and never falls through to the legacy Calendar CLI", () => {
  assert.throws(
    () => executeV12EvidenceCli(["--run", RUN_ID, "--mode", "preseal", "--no-final-write"], { root: process.cwd() }),
    /v12_preflight_/u,
  );
});

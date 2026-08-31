import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  pathToFileURL,
} from "node:url";

const projectRoot = process.cwd();
const SHA_A = "a".repeat(64);

async function load(relativePath) {
  return import(pathToFileURL(path.join(projectRoot, relativePath)).href);
}

function candidate() {
  return {
    candidatePackage: "com.fchoo.gymtracker",
    candidateApkSha256: SHA_A,
    installedPackage: "com.fchoo.gymtracker",
    installedApkSha256: SHA_A,
  };
}

function observed() {
  return {
    readStage: "progress_repository_load",
    branch: "current_baseline_runtime_capability",
    errorClass: "TypeError",
    errorCode: "runtime_array_to_sorted_unavailable",
    freshness: "not_returned",
    recoverability: "requires_candidate_compatible_runtime",
  };
}

test("Phase 6 Progress diagnostic binds the candidate and emits only the observed redacted signature", async () => {
  const {
    createPhase6ProgressDiagnosis,
  } = await load("scripts/diagnose-phase6-progress.mjs");

  const diagnosis = createPhase6ProgressDiagnosis({
    candidate: candidate(),
    observed: observed(),
  });

  assert.deepEqual(diagnosis, {
    read_stage: "progress_repository_load",
    branch: "current_baseline_runtime_capability",
    error_class: "TypeError",
    error_code: "runtime_array_to_sorted_unavailable",
    freshness: "not_returned",
    recoverability: "requires_candidate_compatible_runtime",
  });
  assert.deepEqual(Object.keys(diagnosis).sort(), [
    "branch",
    "error_class",
    "error_code",
    "freshness",
    "read_stage",
    "recoverability",
  ]);
});

test("Phase 6 Progress diagnostic fails closed on candidate identity mismatch", async () => {
  const {
    createPhase6ProgressDiagnosis,
  } = await load("scripts/diagnose-phase6-progress.mjs");

  assert.throws(() => createPhase6ProgressDiagnosis({
    candidate: {
      ...candidate(),
      installedApkSha256: "b".repeat(64),
    },
    observed: observed(),
  }), /candidate.*identity|identity.*candidate/u);
});

test("Phase 6 Progress diagnostic rejects raw or private diagnostic fields", async () => {
  const {
    createPhase6ProgressDiagnosis,
  } = await load("scripts/diagnose-phase6-progress.mjs");

  for (const input of [
    {
      candidate: {
        ...candidate(),
        deviceSerial: "private-device",
      },
      observed: observed(),
    },
    {
      candidate: candidate(),
      observed: {
        ...observed(),
        rawRow: "private-row",
      },
    },
    {
      candidate: candidate(),
      observed: {
        ...observed(),
        errorMessage: "private-path",
      },
    },
    {
      candidate: candidate(),
      observed: {
        ...observed(),
        backupContents: "private-backup",
      },
    },
  ]) {
    assert.throws(
      () => createPhase6ProgressDiagnosis(input),
      /allowlisted|private|diagnostic/u,
    );
  }
});

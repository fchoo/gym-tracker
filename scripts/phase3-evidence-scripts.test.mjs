import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();

async function load(relativePath) {
  return import(pathToFileURL(path.join(projectRoot, relativePath)).href);
}

function manifestFixture() {
  return {
    schema_version: 1,
    suite: "phase3",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: "a".repeat(40),
    source_tree_sha256: "b".repeat(64),
    package: "com.fchoo.gymtracker.devtest",
    apk: {
      path: "artifacts/native/phase3/gym-tracker-phase3-devtest.apk",
      sha256: "c".repeat(64),
      size_bytes: 4,
      page_alignment_kib: 16,
      page_alignment_verified: true,
    },
  };
}

function identity(manifest) {
  return {
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk: manifest.apk,
  };
}

test("Phase 3 evidence contracts cover calendar, correction, lifecycle, and deterministic rebuild facts", async () => {
  const {
    PHASE3_MAESTRO_FLOW_CONTRACTS,
    validatePhase3MaestroEvidence,
  } = await load("scripts/run-phase3-maestro.mjs");
  const {
    PHASE3_BENCHMARK_MEASUREMENTS,
    PHASE3_BENCHMARK_THRESHOLDS,
    validatePhase3BenchmarkResult,
  } = await load("scripts/benchmark-phase3.mjs");
  const {
    PHASE3_NATIVE_CONTRACT_CASE_IDS,
    validatePhase3AutomatedEvidence,
    validatePhase3NativeContract,
  } = await load("scripts/verify-phase3-native-evidence.mjs");
  const manifest = manifestFixture();

  assert.deepEqual(PHASE3_NATIVE_CONTRACT_CASE_IDS, [
    "calendar-effective-state",
    "correction-audit-facts",
    "void-restore-lifecycle",
    "stale-rebuild-rejected",
    "targeted-full-rebuild-equivalence",
  ]);
  assert.deepEqual(
    PHASE3_MAESTRO_FLOW_CONTRACTS.map(({ id, coverage }) => ({ id, coverage })),
    [
      { id: "phase3-calendar-effective-state", coverage: ["calendar-effective-state"] },
      { id: "phase3-correction-audit", coverage: ["correction-audit-facts"] },
      { id: "phase3-void-restore", coverage: ["void-restore-lifecycle"] },
      {
        id: "phase3-rebuild-integrity",
        coverage: [
          "stale-rebuild-rejected",
          "targeted-full-rebuild-equivalence",
        ],
      },
    ],
  );
  assert.deepEqual(PHASE3_BENCHMARK_MEASUREMENTS, [
    "effective-history-read",
    "history-projection-rebuild",
  ]);
  assert.deepEqual(PHASE3_BENCHMARK_THRESHOLDS, {
    minimumSamples: 100,
    maximumP95Ms: 250,
    maximumJsTaskMs: 50,
  });

  const native = {
    schema_version: 1,
    suite: "phase3",
    status: "passed",
    ...identity(manifest),
    contract: {
      expected_count: PHASE3_NATIVE_CONTRACT_CASE_IDS.length,
      total: PHASE3_NATIVE_CONTRACT_CASE_IDS.length,
      passed: PHASE3_NATIVE_CONTRACT_CASE_IDS.length,
      failed: 0,
      skipped: 0,
      cases: PHASE3_NATIVE_CONTRACT_CASE_IDS.map((id) => ({
        id,
        status: "passed",
        duration_ms: 1,
      })),
    },
  };
  const maestro = {
    schema_version: 1,
    suite: "phase3",
    status: "passed",
    ...identity(manifest),
    flows: PHASE3_MAESTRO_FLOW_CONTRACTS.map(({ id, coverage }) => ({
      id,
      coverage,
      tests: 1,
      failures: 0,
      errors: 0,
      skipped: 0,
    })),
  };
  const benchmark = {
    schema_version: 1,
    suite: "phase3",
    status: "passed",
    ...identity(manifest),
    thresholds: {
      minimum_samples: PHASE3_BENCHMARK_THRESHOLDS.minimumSamples,
      maximum_p95_ms: PHASE3_BENCHMARK_THRESHOLDS.maximumP95Ms,
      maximum_js_task_ms: PHASE3_BENCHMARK_THRESHOLDS.maximumJsTaskMs,
    },
    measurements: PHASE3_BENCHMARK_MEASUREMENTS.map((id) => ({
      id,
      samples_requested: 100,
      samples_completed: 100,
      durations_ms: Array.from({ length: 100 }, () => 1),
      p95_ms: 1,
      maximum_js_task_ms: 1,
    })),
  };

  assert.doesNotThrow(() => validatePhase3NativeContract(native, manifest));
  assert.doesNotThrow(() => validatePhase3MaestroEvidence(maestro, manifest));
  assert.doesNotThrow(() => validatePhase3BenchmarkResult(benchmark, manifest));
  const result = validatePhase3AutomatedEvidence({
    manifest,
    native,
    maestro,
    benchmark,
  });
  assert.deepEqual(result, {
    schema_version: 1,
    suite: "phase3",
    status: "passed",
    mode: "automated-only",
    approval_status: "evidence_pending",
    physical_review: "deferred_final_gate",
    build_manifest: "artifacts/native/phase3/build.json",
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk_sha256: manifest.apk.sha256,
    native_cases: "5/5",
    maestro_flows: "4/4",
    benchmark_measurements: "2/2",
  });

  assert.throws(
    () => validatePhase3NativeContract({
      ...native,
      contract: { ...native.contract, cases: native.contract.cases.slice(1) },
    }, manifest),
    /native case|counts/u,
  );
  assert.throws(
    () => validatePhase3MaestroEvidence({
      ...maestro,
      flows: maestro.flows.map((flow) => flow.id === "phase3-rebuild-integrity"
        ? { ...flow, coverage: ["stale-rebuild-rejected"] }
        : flow),
    }, manifest),
    /coverage|execution/u,
  );
  assert.throws(
    () => validatePhase3BenchmarkResult({
      ...benchmark,
      measurements: benchmark.measurements.map((measurement) => ({
        ...measurement,
        p95_ms: 251,
      })),
    }, manifest),
    /benchmark threshold/u,
  );
});

test("Phase 3 verifier fails closed on exact implementation identity drift and cannot claim attended approval", async () => {
  const {
    parsePhase3VerifierArgs,
    resolvePhase3VerifierMode,
    validateImplementationIdentity,
  } = await load("scripts/verify-phase3-native-evidence.mjs");
  const implementationHead = "a".repeat(40);
  const implementationDigest = "b".repeat(64);

  assert.doesNotThrow(() => validateImplementationIdentity({
    manifestHead: implementationHead,
    currentHead: implementationHead,
    changedPaths: [],
    manifestSourceSha256: implementationDigest,
    currentSourceSha256: implementationDigest,
    implementationSourceSha256: implementationDigest,
  }));
  assert.throws(() => validateImplementationIdentity({
    manifestHead: implementationHead,
    currentHead: "c".repeat(40),
    changedPaths: ["src/domains/history/historyLifecycleCommands.ts"],
    manifestSourceSha256: implementationDigest,
    currentSourceSha256: implementationDigest,
    implementationSourceSha256: implementationDigest,
  }), /implementation|planning/u);
  assert.throws(() => validateImplementationIdentity({
    manifestHead: implementationHead,
    currentHead: implementationHead,
    changedPaths: [],
    manifestSourceSha256: implementationDigest,
    currentSourceSha256: "c".repeat(64),
    implementationSourceSha256: implementationDigest,
  }), /source digest/u);

  assert.deepEqual(resolvePhase3VerifierMode({ automatedOnly: false }), {
    automatedOnly: true,
  });
  assert.deepEqual(resolvePhase3VerifierMode({ automatedOnly: true }), {
    automatedOnly: true,
  });
  assert.throws(
    () => resolvePhase3VerifierMode({ attendedPreflight: true }),
    /attended|physical/u,
  );
  assert.throws(
    () => parsePhase3VerifierArgs(["--require-physical"]),
    /unknown argument/u,
  );
  assert.deepEqual(parsePhase3VerifierArgs([
    "--manifest",
    "artifacts/native/phase3/build.json",
    "--automated-only",
  ]), {
    automatedOnly: true,
    manifestArgument: "artifacts/native/phase3/build.json",
  });
});

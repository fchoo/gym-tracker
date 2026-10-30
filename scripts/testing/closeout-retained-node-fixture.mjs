import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createControlledRunner } from "./v12-production-launcher/controlled-runner.mjs";
import { invokeV12NativeAdapterEnvelope } from "../v12-native-adapter.mjs";

const SUBJECTS = Object.freeze([
  "scripts/v12-atomic-shard-publication.mjs",
  "scripts/v12-sqlite-shard.mjs",
  "scripts/v12-native-adapter.mjs",
  "scripts/v12-native-execution-origin.mjs",
  "scripts/capture-v12-visual.mjs",
  "scripts/compare-v12-visual.mjs",
  "scripts/create-v12-readiness-handoff.mjs",
  "scripts/v12-blocker-row-resolver.mjs",
  "scripts/v12-visual-streaming.mjs",
]);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function createCloseoutRetainedNodeFixture({ artifactDirectory, subjects = SUBJECTS } = {}) {
  assert.ok(typeof artifactDirectory === "string" && path.isAbsolute(artifactDirectory));
  assert.ok(Array.isArray(subjects) && subjects.length > 0 && subjects.every(subject => SUBJECTS.includes(subject)));
  const workspace = realpathSync(process.cwd());
  mkdirSync(artifactDirectory, { recursive: true });
  const storage = path.join(artifactDirectory, "subjects");
  mkdirSync(storage, { recursive: true });
  const runner = createControlledRunner();
  const copiedRoot = realpathSync(runner.root);
  const rawDirectory = process.env.NODE_V8_COVERAGE;
  const invocations = [];
  const supportObservations = [];
  function persist() {
    writeFileSync(path.join(artifactDirectory, "witness.json"), `${JSON.stringify({
      schema_version: 1, copied_root: copiedRoot, generation, invocations, support_observations: supportObservations,
      mapping_rule: "Only stable observed copied bytes equal to the bound workspace subject may map. Outer full test execution must pass independently.",
    }, null, 2)}\n`);
  }

  function capture(root) {
    return subjects.map(subject => {
      const file = path.join(root, subject);
      assert.equal(lstatSync(file).isSymbolicLink(), false);
      const bytes = readFileSync(file);
      const hash = sha256(bytes);
      const snapshot = path.join(storage, `${hash}.blob`);
      if (!existsSync(snapshot)) writeFileSync(snapshot, bytes, { flag: "wx" });
      return { subject, source_url: pathToFileURL(realpathSync(file)).href, sha256: hash, bytes: bytes.length, snapshot };
    });
  }
  const generation = { workspace: capture(workspace), copied: capture(copiedRoot) };
  function inputs() {
    return [runner.manifestPath, "state.json", "native-marker.json", "fixture.apk", "bin/adb", "bin/maestro", "bin/unzip"]
      .map(file => path.isAbsolute(file) ? file : path.join(runner.scratch, file))
      .filter(file => existsSync(file))
      .map(file => {
        const bytes = readFileSync(file);
        const hash = sha256(bytes);
        const snapshot = path.join(storage, `${hash}.blob`);
        if (!existsSync(snapshot)) writeFileSync(snapshot, bytes, { flag: "wx" });
        return { path: file, sha256: hash, snapshot };
      });
  }
  function rawNames() {
    return rawDirectory && existsSync(rawDirectory) ? readdirSync(rawDirectory).filter(file => file.endsWith(".json")) : [];
  }
  function observe(kind, action, operation) {
    const startedAt = new Date().toISOString();
    const before = { workspace: capture(workspace), copied: capture(copiedRoot) };
    const inputBefore = inputs();
    const prior = new Set(rawNames());
    let result;
    let error;
    try { result = operation(); } catch (caught) { error = caught; }
    const after = { workspace: capture(workspace), copied: capture(copiedRoot) };
    const inputAfter = inputs();
    const raw = rawNames().filter(file => !prior.has(file)).map(file => {
      const absolute = path.join(rawDirectory, file);
      return { path: absolute, sha256: sha256(readFileSync(absolute)) };
    });
    const observation = {
      kind, action, started_at: startedAt, finished_at: new Date().toISOString(),
      test_process_pid: process.pid, child_pid: Number.isSafeInteger(result?.pid) ? result.pid : null,
      before, after, input_before: inputBefore, input_after: inputAfter, raw,
      source_stable: JSON.stringify(before) === JSON.stringify(after),
      source_equal_at_generation: generation.workspace.every((source, index) => source.sha256 === generation.copied[index].sha256),
      outcome: error ? "expected_or_unexpected_exception" : "returned",
      error_sha256: error ? sha256(Buffer.from(error.message)) : null,
      stdout_sha256: typeof result?.stdout === "string" ? sha256(Buffer.from(result.stdout)) : null,
      stderr_sha256: typeof result?.stderr === "string" ? sha256(Buffer.from(result.stderr)) : null,
      native_acceptance: false,
    };
    invocations.push(observation);
    persist();
    if (error) throw error;
    return result;
  }

  return {
    ...runner,
    copiedRoot,
    artifactDirectory,
    observeInputs: (label, files, operation) => {
      assert.ok(Array.isArray(files) && files.every(file => path.resolve(file).startsWith(`${artifactDirectory}${path.sep}`)));
      const captureFiles = () => files.map(file => {
        if (!existsSync(file)) return { path: file, exists: false };
        const bytes = readFileSync(file);
        return { path: file, exists: true, sha256: sha256(bytes), mode: lstatSync(file).mode };
      });
      const before = captureFiles();
      let result;
      let error;
      try { result = operation(); } catch (caught) { error = caught; }
      supportObservations.push({ label, before, after: captureFiles(), outcome: error ? "exception" : "returned" });
      persist();
      if (error) throw error;
      return result;
    },
    invoke: (action, payload = {}, extra = {}) => observe("copied-public-fixture", action, () => runner.invoke(action, payload, extra)),
    invokeCalendar: (extra = {}) => observe("copied-public-fixture", "calendar", () => runner.invokeCalendar(extra)),
    calendarSettingsScenario: (extra = {}) => observe("copied-public-fixture", "calendar-settings", () => runner.calendarSettingsScenario(extra)),
    success: (action, payload) => {
      const result = observe("copied-public-fixture", action, () => runner.invoke(action, payload));
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    },
    invokeCurrent: (action, payload = {}, extra = {}) => observe("workspace-public-api", action, () => invokeV12NativeAdapterEnvelope(
      action, { run_id: runner.build.run_id, ...payload }, {
        root: copiedRoot,
        environment: {
          ...extra, ...runner.executionEnvironment, NODE_ENV: "production",
          PATH: process.env.PATH,
          V12_DEVICE_SERIAL: "controlled-device-20",
          V12_CONTROLLED_STATE: runner.scratch,
        },
      },
    )),
    cleanup: runner.cleanup,
    runCopiedCli: (subject, args, extra = {}) => {
      assert.ok(subjects.includes(subject) && Array.isArray(args));
      const environment = {
        ...process.env, ...runner.executionEnvironment, ...extra,
        NODE_ENV: "production", V12_DEVICE_SERIAL: "controlled-device-20", V12_CONTROLLED_STATE: runner.scratch,
      };
      for (const name of ["V12_NATIVE_ADAPTER_COMMAND", "V12_NATIVE_ADAPTER_TEST_MODE", "V12_NATIVE_ADAPTER_TEST_PROCESS", "NODE_TEST_CONTEXT"]) delete environment[name];
      return observe("copied-public-cli", subject, () => spawnSync(process.execPath, [subject, ...args], {
        cwd: copiedRoot, env: environment, encoding: "utf8", timeout: 70_000, maxBuffer: 32 * 1024 * 1024,
      }));
    },
  };
}

export function createCloseoutWitnessedControlledRunner() {
  const root = process.env.CLOSEOUT_RETAINED_NODE_WITNESS_DIRECTORY;
  assert.ok(typeof root === "string" && path.isAbsolute(root));
  mkdirSync(root, { recursive: true });
  return createCloseoutRetainedNodeFixture({ artifactDirectory: mkdtempSync(path.join(root, "original-attestation-")) });
}

export function createCloseoutReadinessInputs() {
  const digest = character => character.repeat(64);
  const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
  const phaseCounts = { DOM: [13, 17], SHL: [14, 13], WRK: [15, 36], CAL: [16, 23], LIB: [17, 36], GAR: [18, 16], PRO: [19, 18], VER: [20, 13] };
  const rows = Object.entries(phaseCounts).flatMap(([prefix, [phase, count]]) => Array.from({ length: count }, (_, index) => ({
    inventory_id: `INV-${prefix}-${String(index + 1).padStart(2, "0")}`,
    requirement_id: `${prefix}-${String(index + 1).padStart(2, "0")}`,
    owning_phase: phase,
    coverage_class: "automated",
    verdict: "PASS",
    observations: [],
  })));
  const hashes = rows.map((_, index) => sha256(Buffer.from(`bounded-evidence-${index}`)));
  return {
    final_evidence: {
      schema_version: 3, run_id: runId, evidence_origin: "native",
      identity: { run_id: runId, source_tree_sha256: digest("a"), apk_sha256: digest("b"),
        apk_signature_sha256: digest("c"), installed_apk_sha256: digest("b"), device_sha256: digest("8"), config_sha256: digest("d") },
      rows, source_results: rows.map((row, index) => ({ row_id: row.requirement_id, evidence_sha256: hashes[index] })),
      evidence_hashes: hashes, gates: [{ id: "identity", verdict: "PASS", evidence_sha256: digest("3") }, { id: "automated", verdict: "PASS", evidence_sha256: digest("4") }],
      readiness: "READY", verdict_counts: { PASS: 172, ACCEPTED_EXCEPTION: 0, NOT_RUN: 0, FAIL: 0, REVIEW_REQUIRED: 0, N_A_REVIEWED: 0 },
      accepted_exception_count: 0, release_authorized: false, policy: null, exceptions: [],
    },
    rollback: { prior_release_manifest_sha256: digest("4"), prior_signed_apk_sha256: digest("5"), prior_apk_signature_sha256: digest("6"),
      prior_apk_certificate_sha256: digest("a"), compatible_archive_sha256: digest("7"), compatible_archive_format_version: 9,
      clean_restore_receipt_sha256: digest("8"), post_restore_facts_sha256: digest("9"), last_valid_schema_version: 44,
      current_schema_version: 45, newer_schema_committed: true, recovery_boundary: "compatible_restore_or_forward_fix", rollback_evidence_sha256: digest("b") },
    generated_at: "2026-10-14T01:00:00.000Z",
  };
}

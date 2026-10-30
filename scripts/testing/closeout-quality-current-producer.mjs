import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  QUALITY_NODE, QUALITY_BOOTSTRAP, QUALITY_PRODUCER, QUALITY_DERIVE,
  QUALITY_TESTS, QUALITY_SUBJECT, QUALITY_TOOL_DATA,
  assertFrozenTests, captureInputs, comparableCapture, captureExecutable,
  sha256, relativeDescriptor, writeOwnedJson, safeProjectPath,
  assertNoProtectedPath,
} from "./closeout-quality-current-capture.mjs";

function exactTestCounts(tap) {
  assert.ok(tap.startsWith("TAP version 13\n"), "quality_tap_header_invalid");
  const plan = [...tap.matchAll(/^1\.\.(\d+)$/gmu)];
  const cases = [...tap.matchAll(/^(ok|not ok) (\d+) - (.+)$/gmu)];
  const counts = {};
  for (const field of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
    const matches = [...tap.matchAll(new RegExp(`^# ${field} (\\d+)$`, "gmu"))];
    assert.equal(matches.length, 1, "quality_tap_footer_invalid"); counts[field] = Number(matches[0][1]);
  }
  assert.equal(plan.length, 1); assert.equal(Number(plan[0][1]), cases.length);
  assert.equal(counts.tests, 107, "quality107_scope_changed");
  assert.equal(cases.length, 107);
  assert.ok(cases.every((entry, index) => Number(entry[2]) === index + 1), "quality_tap_sequence_invalid");
  return { counts, all_pass: counts.pass === 107 && ["fail", "cancelled", "skipped", "todo"].every(field => counts[field] === 0)
    && cases.every(entry => entry[1] === "ok" && !/# (?:SKIP|TODO)/iu.test(entry[3])) };
}
export function runQuality107({ project = process.cwd(), outputRelative } = {}) {
  assertNoProtectedPath(project, outputRelative, process.execPath, fileURLToPath(import.meta.url));
  project = fs.realpathSync(project);
  assertNoProtectedPath(project);
  assert.equal(fs.realpathSync(process.execPath), fs.realpathSync(QUALITY_NODE), "quality_node_binding_invalid");
  assert.equal(process.version, "v24.19.0", "quality_node_version_changed");
  assert.ok(safeProjectPath(outputRelative) && outputRelative.startsWith("artifacts/native/personal-closeout-20261027/"), "quality_output_namespace_invalid");
  const output = path.join(project, outputRelative);
  assert.equal(fs.existsSync(output), false, "quality_run_directory_already_exists");
  assert.equal(fileURLToPath(import.meta.url), path.join(project, QUALITY_PRODUCER), "quality_producer_relocated");
  for (const name of ["NODE_OPTIONS", "NODE_PATH", "NODE_V8_COVERAGE", "CLOSEOUT_QUALITY_CURRENT_RUN_DIRECTORY"]) {
    assert.equal(process.env[name], undefined, `quality_outer_environment_forbidden:${name}`);
  }
  assertFrozenTests(project);
  const contextHead = execFileSync("/usr/bin/git", ["rev-parse", "HEAD"], { cwd: project, encoding: "utf8" }).trim();
  assert.match(contextHead, /^[a-f0-9]{40}$/u);
  const environment = {
    PATH: `${path.dirname(QUALITY_NODE)}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: process.env.HOME,
    TMPDIR: path.join(output, "tmp"), LANG: "en_US.UTF-8", TZ: "Asia/Singapore", CI: "true", NODE_ENV: "test",
    NODE_V8_COVERAGE: path.join(output, "raw"), CLOSEOUT_LAST_TWO_PROOF_DIRECTORY: output,
    CLOSEOUT_QUALITY_CURRENT_RUN_DIRECTORY: output, CLOSEOUT_QUALITY_CURRENT_CONTEXT_HEAD: contextHead,
  };
  assert.equal(typeof environment.HOME, "string");
  const args = ["--import", `./${QUALITY_BOOTSTRAP}`, "--test", "--test-concurrency=1", "--test-reporter=tap", ...QUALITY_TESTS];
  for (const directory of [output, environment.TMPDIR, environment.NODE_V8_COVERAGE]) fs.mkdirSync(directory, { recursive: true });
  const producerStartedAt = new Date().toISOString();
  const producer = { schema_version: 1, pid: process.pid, parent_pid: process.ppid,
    argv: [...process.argv], exec_argv: [...process.execArgv], cwd: project,
    source_context_head: contextHead, started_at: producerStartedAt,
    executable: captureExecutable(project, output, process.execPath),
    native_acceptance: false, synthetic_host_proof: true };
  writeOwnedJson(project, output, "producer-before.json", producer);
  writeOwnedJson(project, output, "scope.json", {
    schema_version: 1, subject: QUALITY_SUBJECT, tests: [...QUALITY_TESTS],
    actual_planned_test_argv: [QUALITY_NODE, ...args], bootstrap: QUALITY_BOOTSTRAP,
    capture_producer: QUALITY_PRODUCER, analysis_producer: QUALITY_DERIVE, safe_tool_data: QUALITY_TOOL_DATA,
    environment, source_context_head: contextHead, native_acceptance: false, synthetic_host_proof: true,
    policy: "Complete current actual source/config/data vector, opaque source JSON bytes, copied fixture witnesses, fixed production budgets, all107 unmodified tests, no native/device authority.",
  });
  let before, child, after, start, end, tap, parsed, preflightError;
  try {
    before = captureInputs({ project, output, environment, contextHead, label: "before" });
    writeOwnedJson(project, output, "before-inputs.json", before);
  } catch (error) {
    preflightError = error;
    writeOwnedJson(project, output, "preflight-failure.json", { schema_version: 1,
      observed_at: new Date().toISOString(), tests_executed: false, error: error.message,
      producer, native_acceptance: false });
  }
  if (preflightError) throw preflightError;
  const log = fs.openSync(path.join(output, "tests.tap"), "wx");
  start = new Date().toISOString();
  // Child budgets are owned by unchanged tests and production modules. There is
  // no new timeout, budget extension, process-tree reset or real device command.
  try { child = spawnSync(QUALITY_NODE, args, { cwd: project, env: environment, stdio: ["ignore", log, log] }); }
  finally { end = new Date().toISOString(); fs.closeSync(log); }
  tap = fs.readFileSync(path.join(output, "tests.tap"), "utf8");
  try { parsed = exactTestCounts(tap); } catch (error) { parsed = { counts: null, all_pass: false, parse_error: error.message }; }
  let afterError;
  try {
    after = captureInputs({ project, output, environment, contextHead, label: "after" });
    after.report_sha256 = sha256(Buffer.from(tap));
    writeOwnedJson(project, output, "after-inputs.json", after);
  } catch (error) {
    afterError = error;
    writeOwnedJson(project, output, "after-capture-failure.json", { schema_version: 1,
      observed_at: new Date().toISOString(), error: error.message, tests_executed: true, native_acceptance: false });
  }
  const stable = after !== undefined && JSON.stringify(comparableCapture(before)) === JSON.stringify(comparableCapture(after));
  const raw = fs.readdirSync(environment.NODE_V8_COVERAGE).filter(name => name.endsWith(".json")).sort()
    .map(name => relativeDescriptor(project, path.join(environment.NODE_V8_COVERAGE, name)));
  const processes = fs.readdirSync(output).filter(name => /^process-\d+-(?:before|after)\.json$/u.test(name)).sort()
    .map(name => relativeDescriptor(project, path.join(output, name)));
  writeOwnedJson(project, output, "raw-descriptors.json", raw);
  writeOwnedJson(project, output, "process-descriptors.json", processes);
  const actual = { schema_version: 1, execution_context_head: contextHead, started_at: start, finished_at: end,
    argv: [QUALITY_NODE, ...args], test_files: [...QUALITY_TESTS], source_inputs: before.source_inputs,
    report_sha256: sha256(Buffer.from(tap)), exit_code: child?.status ?? null, signal: child?.signal ?? null,
    error_code: child?.error?.code ?? null, pid: child?.pid ?? null, parent_pid: process.pid,
    changed_inputs: stable ? [] : ["complete_actual_capture_changed"], counts: parsed.counts,
    raw_v8: raw, processes, native_acceptance: false, synthetic_host_proof: true };
  writeOwnedJson(project, output, "execution.json", actual);
  writeOwnedJson(project, output, "producer-after.json", { ...producer, finished_at: new Date().toISOString(),
    actual_test_execution: relativeDescriptor(project, path.join(output, "execution.json")), test_pid: child?.pid ?? null,
    child_exit_code: child?.status ?? null, child_signal: child?.signal ?? null, stable_inputs: stable,
    all107pass: parsed.all_pass, after_capture_error: afterError?.message ?? null });
  const status = child?.status === 0 && child.signal === null && !child.error && parsed.all_pass && stable ? "TEST_GATE_PASS_PENDING_ROOT_ADMISSION_AND_COVERAGE" : "FAIL";
  writeOwnedJson(project, output, "test-gate-result.json", { schema_version: 1, status,
    source_context_head: contextHead, counts: parsed.counts, tap_parse_error: parsed.parse_error ?? null,
    stable_inputs: stable, execution: relativeDescriptor(project, path.join(output, "execution.json")),
    native_acceptance: false, coverage_verified: false, root_admission_required: true });
  if (status === "FAIL") throw new Error("quality107_test_gate_failed_preserved");
  return { status, output: outputRelative, actual_execution: actual };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    assert.equal(process.argv.length, 3, "quality_producer_arguments_invalid");
    const result = runQuality107({ outputRelative: process.argv[2] });
    process.stdout.write(JSON.stringify({ status: result.status, output: result.output }) + "\n");
  } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}

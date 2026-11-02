import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  QUALITY_NODE, QUALITY_BOOTSTRAP, QUALITY_PRODUCER, QUALITY_DERIVE,
  QUALITY_TESTS, QUALITY_SUBJECT, QUALITY_TEST_HASHES, QUALITY_TOOL_DATA,
  safeProjectPath, sha256, comparableCapture, relativeDescriptor, writeOwnedJson,
  assertNoProtectedPath,
} from "./closeout-quality-current-capture.mjs";

const require = createRequire(import.meta.url);
const HEAD = /^[a-f0-9]{40}$/u;
const HASH = /^[a-f0-9]{64}$/u;
function integer(value) { assert.ok(Number.isSafeInteger(value) && value > 0, "quality_pid_invalid"); }
function time(value) { const number = Date.parse(value); assert.ok(Number.isFinite(number), "quality_timestamp_invalid"); return number; }
function inside(base, file) { return file === base || file.startsWith(base + path.sep); }
function readBound(project, output, descriptor) {
  assertNoProtectedPath(project, output, descriptor?.path);
  assert.ok(descriptor && safeProjectPath(descriptor.path) && HASH.test(descriptor.sha256), "quality_bound_descriptor_invalid");
  const file = path.resolve(project, descriptor.path);
  assert.ok(inside(output, file), "quality_evidence_outside_run");
  let cursor = project;
  for (const part of descriptor.path.split("/")) {
    cursor = path.join(cursor, part); assert.equal(fs.lstatSync(cursor).isSymbolicLink(), false, "quality_evidence_symlink");
  }
  const bytes = fs.readFileSync(file); assert.equal(sha256(bytes), descriptor.sha256, "quality_bound_hash_changed");
  return bytes;
}
function readOwned(project, output, name) {
  const descriptor = relativeDescriptor(project, path.join(output, name));
  return { descriptor, value: JSON.parse(readBound(project, output, descriptor).toString("utf8")) };
}
function snapshotBytes(project, output, row) {
  assertNoProtectedPath(row.snapshot);
  if (row.path !== undefined) assertNoProtectedPath(row.path);
  if (row.realpath !== undefined) assertNoProtectedPath(row.realpath);
  const relative = path.isAbsolute(row.snapshot) ? path.relative(project, row.snapshot).split(path.sep).join("/") : row.snapshot;
  const bytes = readBound(project, output, { path: relative, sha256: row.sha256 });
  assert.equal(bytes.length, row.bytes, "quality_snapshot_length_invalid");
  return bytes;
}
function rawIdentity(file) {
  const result = /^coverage-(\d+)-(\d+)-(\d+)\.json$/u.exec(path.basename(file));
  assert.ok(result, "quality_node_raw_name_invalid");
  return { pid: Number(result[1]), captured_at_ms: Number(result[2]), sequence: Number(result[3]) };
}
function rawSourceGeometry(script, bytes) {
  const length = bytes.toString("utf8").length;
  assert.ok(Array.isArray(script.functions) && script.functions.length > 0, "quality_raw_functions_invalid");
  for (const fn of script.functions) for (const range of fn.ranges) {
    assert.ok(Number.isSafeInteger(range.startOffset) && Number.isSafeInteger(range.endOffset)
      && range.startOffset >= 0 && range.endOffset >= range.startOffset && range.endOffset <= length
      && Number.isSafeInteger(range.count) && range.count >= 0, "quality_raw_offsets_invalid");
  }
  assert.equal(script.functions[0].ranges[0].startOffset, 0);
  assert.equal(script.functions[0].ranges[0].endOffset, length);
  assert.ok(script.functions[0].ranges[0].count > 0);
}

/**
 * Independent admission validator. The root supplies verifyRootLaunch and
 * readSource capabilities from its own actual launch observer and Git authority.
 * Neither may be replaced by a run's self-declared JSON/boolean. Generic
 * hostExecution/composedCoverage do not independently verify PID ancestry.
 * This function reads proof-owned schemas and opaque captured bytes only.
 */
export function validateQuality107Lineage({ projectRoot, runRelative, rootLaunchBinding, verifyRootLaunch, testedSourceHead, readSource }) {
  assertNoProtectedPath(projectRoot, runRelative);
  assert.equal(typeof readSource, "function", "quality_trusted_source_reader_required");
  assert.equal(typeof verifyRootLaunch, "function", "quality_trusted_root_launch_verifier_required");
  assert.ok(HEAD.test(testedSourceHead ?? ""), "quality_tested_git_snapshot_required");
  const project = fs.realpathSync(projectRoot);
  assertNoProtectedPath(project);
  assert.ok(safeProjectPath(runRelative) && runRelative.startsWith("artifacts/native/personal-closeout-20261027/"));
  const output = fs.realpathSync(path.join(project, runRelative));
  assertNoProtectedPath(output);
  assert.ok(inside(path.resolve(project, "artifacts/native/personal-closeout-20261027"), output));
  const execution = readOwned(project, output, "execution.json");
  const before = readOwned(project, output, "before-inputs.json");
  const after = readOwned(project, output, "after-inputs.json");
  const producerBefore = readOwned(project, output, "producer-before.json");
  const producerAfter = readOwned(project, output, "producer-after.json");
  const scope = readOwned(project, output, "scope.json");
  const result = execution.value;
  // The trusted callback authenticates the root-owned Popen observation. It
  // cannot be populated by copying flags/fields from this untrusted receipt.
  const rootLaunch = verifyRootLaunch(rootLaunchBinding);
  assert.ok(rootLaunch && rootLaunch.schema_version === 1, "quality_root_launch_admission_required");
  assert.deepEqual(rootLaunch.execution_descriptor, execution.descriptor, "quality_root_execution_descriptor_invalid");
  assert.deepEqual(rootLaunch.producer.argv, [QUALITY_NODE, QUALITY_PRODUCER, runRelative]);
  assert.equal(rootLaunch.producer.cwd, project); integer(rootLaunch.producer.pid); integer(rootLaunch.producer.observer_pid);
  assert.equal(rootLaunch.producer.exit_code, 0); assert.equal(rootLaunch.producer.signal, null);
  assert.equal(rootLaunch.output_namespace, runRelative);
  assert.equal(producerBefore.value.pid, rootLaunch.producer.pid, "quality_root_popen_pid_mismatch");
  assert.equal(producerBefore.value.parent_pid, rootLaunch.producer.observer_pid, "quality_root_popen_parent_mismatch");
  assert.deepEqual(producerBefore.value.argv, [QUALITY_NODE, path.join(project, QUALITY_PRODUCER), runRelative], "quality_root_producer_argv_mismatch");
  assert.deepEqual(producerBefore.value.exec_argv, []); assert.equal(producerBefore.value.cwd, project);
  assert.ok(time(rootLaunch.producer.started_at) <= time(producerBefore.value.started_at));
  assert.ok(time(rootLaunch.producer.finished_at) >= time(producerAfter.value.finished_at));
  assert.equal(rootLaunch.node_sha256, before.value.node.sha256);
  assert.deepEqual(rootLaunch.reviewed_sources_before, rootLaunch.reviewed_sources_after, "quality_root_reviewed_sources_changed");
  const reviewed = new Map(rootLaunch.reviewed_sources_before.map(row => [row.path, row.sha256]));
  for (const file of [QUALITY_BOOTSTRAP, QUALITY_PRODUCER, QUALITY_DERIVE]) {
    assert.equal(reviewed.get(file), sha256(readSource(testedSourceHead, file)), "quality_reviewed_producer_source_not_bound");
  }
  assert.equal(result.schema_version, 1); assert.equal(result.exit_code, 0); assert.equal(result.signal, null);
  assert.equal(result.error_code, null); assert.equal(result.native_acceptance, false);
  assert.equal(result.synthetic_host_proof, true); assert.deepEqual(result.changed_inputs, []);
  integer(result.pid); integer(result.parent_pid);
  const expectedArgv = [QUALITY_NODE, "--import", `./${QUALITY_BOOTSTRAP}`, "--test", "--test-concurrency=1", "--test-reporter=tap", ...QUALITY_TESTS];
  assert.deepEqual(result.argv, expectedArgv); assert.deepEqual(result.test_files, [...QUALITY_TESTS]);
  assert.deepEqual(scope.value.actual_planned_test_argv, expectedArgv);
  assert.equal(before.value.execution_context_head, result.execution_context_head);
  assert.equal(after.value.execution_context_head, result.execution_context_head);
  assert.deepEqual(comparableCapture(before.value), comparableCapture(after.value), "quality_actual_inputs_changed");
  assert.equal(before.value.node_version, "v24.19.0");
  assert.deepEqual(result.source_inputs, before.value.source_inputs);
  assert.deepEqual(before.value.source_inputs, after.value.source_inputs);
  assert.ok(time(before.value.captured_at) <= time(result.started_at));
  assert.ok(time(after.value.capture_started_at) >= time(result.finished_at));
  assert.equal(after.value.report_sha256, result.report_sha256);
  const sourceRows = new Map();
  for (const row of before.value.project_inputs) {
    assert.ok(safeProjectPath(row.path) && !sourceRows.has(row.path), "quality_actual_input_duplicate");
    assert.equal(Number.isSafeInteger(row.mode), true); assert.equal(Number.isSafeInteger(row.bytes), true);
    const bytes = snapshotBytes(project, output, row);
    assert.ok(bytes.equals(readSource(testedSourceHead, row.path)), `quality_tested_source_mismatch:${row.path}`);
    sourceRows.set(row.path, { row, bytes });
  }
  assert.deepEqual(before.value.source_inputs, before.value.project_inputs.map(({ path: inputPath, sha256: digest }) => ({ path: inputPath, sha256: digest })));
  for (const required of [QUALITY_BOOTSTRAP, QUALITY_PRODUCER, QUALITY_DERIVE, QUALITY_SUBJECT, QUALITY_TOOL_DATA, ...QUALITY_TESTS,
    "scripts/testing/closeout-last-two-proof-fixture.mjs", "package.json", "package-lock.json", "jest.config.js", "tsconfig.json"]) {
    assert.ok(sourceRows.has(required), `quality_required_input_missing:${required}`);
  }
  QUALITY_TESTS.forEach((file, index) => assert.equal(sourceRows.get(file).row.sha256, QUALITY_TEST_HASHES[index], "quality_test_body_changed"));
  const source = sourceRows.get(QUALITY_SUBJECT), bootstrap = sourceRows.get(QUALITY_BOOTSTRAP);
  assert.equal(producerBefore.value.pid, result.parent_pid);
  assert.deepEqual(producerAfter.value.actual_test_execution, execution.descriptor);
  assert.equal(producerAfter.value.test_pid, result.pid); assert.equal(producerAfter.value.all107pass, true);
  assert.equal(producerAfter.value.child_exit_code, result.exit_code); assert.equal(producerAfter.value.child_signal, result.signal);
  assert.equal(producerAfter.value.stable_inputs, true); assert.equal(producerAfter.value.native_acceptance, false);
  assert.deepEqual(producerBefore.value.executable, before.value.node);
  for (const tool of before.value.tools) snapshotBytes(project, output, tool);
  const dependencies = new Map();
  for (const row of before.value.installed_dependencies) {
    assert.ok(safeProjectPath(row.path) && !dependencies.has(row.path), "quality_dependency_duplicate");
    snapshotBytes(project, output, row); dependencies.set(row.path, row);
  }
  const rawDescriptors = readOwned(project, output, "raw-descriptors.json");
  assert.deepEqual(rawDescriptors.value, result.raw_v8);
  assert.equal(new Set(result.raw_v8.map(row => row.path)).size, result.raw_v8.length);
  assert.equal(new Set(result.raw_v8.map(row => row.sha256)).size, result.raw_v8.length);
  const rawMap = new Map(result.raw_v8.map(row => [row.path, row]));
  const processDescriptors = readOwned(project, output, "process-descriptors.json");
  assert.deepEqual(processDescriptors.value, result.processes);
  const processPairs = new Map();
  for (const descriptor of result.processes) {
    const data = JSON.parse(readBound(project, output, descriptor).toString("utf8"));
    integer(data.pid); integer(data.parent_pid);
    const pair = processPairs.get(data.pid) ?? {}; processPairs.set(data.pid, pair);
    const isBefore = /-before\.json$/u.test(descriptor.path);
    const key = isBefore ? "before" : "after"; assert.equal(pair[key], undefined); pair[key] = data;
  }
  const observedWorkers = new Set();
  for (const [pid, pair] of processPairs) {
    assert.ok(pair.before && pair.after, "quality_incomplete_process_lifetime");
    const first = pair.before, last = pair.after;
    assert.ok(time(last.observed_at) >= time(first.observed_at));
    assert.deepEqual(first.bootstrap, bootstrap.row); assert.deepEqual(first.bootstrap, last.bootstrap);
    assert.deepEqual(first.subject, source.row); assert.deepEqual(first.subject, last.subject);
    assert.deepEqual(first.node, before.value.node); assert.deepEqual(first.node, last.node);
    assert.deepEqual(first.environment, last.environment, "quality_observed_process_environment_changed");
    assert.equal(first.native_acceptance, false); assert.equal(last.exit_code, 0);
    if (pid === result.pid) {
      assert.equal(first.parent_pid, result.parent_pid);
      assert.equal(first.phase, "node-test-runner");
    } else {
      assert.equal(first.parent_pid, result.pid, "quality_worker_parent_not_observed_runner");
      assert.equal(first.phase, "node-test-worker"); observedWorkers.add(pid);
    }
    assert.ok(first.exec_argv.includes(`./${QUALITY_BOOTSTRAP}`), "quality_bootstrap_not_actually_preloaded");
  }
  assert.ok(processPairs.has(result.pid), "quality_runner_lifetime_missing");
  assert.equal(observedWorkers.size, QUALITY_TESTS.length, "quality_worker_scope_invalid");
  const witnessDescriptor = relativeDescriptor(project, path.join(output, "copied-source-witnesses.ndjson"));
  const witnesses = readBound(project, output, witnessDescriptor).toString("utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  const created = new Map(), closed = new Set(), invocationPairs = new Map();
  const sourceCopy = inputPath => /^(?:scripts|src|maestro)\//u.test(inputPath) || inputPath.startsWith(".planning/design/v1.2-browser-evidence/");
  const validateCopiedInputs = (root, rows) => {
    const selected = new Set();
    for (const row of rows) {
      assert.ok(path.isAbsolute(row.path) && inside(root, row.path), "quality_copied_input_root_invalid");
      const relative = path.relative(root, row.path).split(path.sep).join("/");
      assert.ok(safeProjectPath(relative) && !selected.has(relative)); selected.add(relative);
      const bytes = snapshotBytes(project, output, row);
      if (sourceCopy(relative)) {
        const original = sourceRows.get(relative); assert.ok(original, `quality_copied_source_missing_original:${relative}`);
        assert.equal(row.sha256, original.row.sha256); assert.ok(bytes.equals(original.bytes), "quality_copied_source_changed");
      }
    }
  };
  for (const witness of witnesses) {
    assert.equal(witness.native_acceptance_proof, false);
    assert.ok(path.isAbsolute(witness.root) && inside(path.join(output, "tmp"), witness.root), "quality_copied_root_outside_run");
    if (witness.kind === "controlled-copy-created") {
      assert.equal(created.has(witness.root), false); created.set(witness.root, witness);
      validateCopiedInputs(witness.root, witness.source_digest_inputs);
    } else if (witness.kind === "child-before") {
      integer(witness.test_process_pid); assert.ok(observedWorkers.has(witness.test_process_pid));
      assert.ok(created.has(witness.root)); integer(witness.id);
      const key = `${witness.test_process_pid}:${witness.id}`; assert.equal(invocationPairs.has(key), false);
      invocationPairs.set(key, { before: witness });
      validateCopiedInputs(witness.root, witness.input_before);
      assert.equal(witness.executable, QUALITY_NODE); assert.equal(witness.node.sha256, before.value.node.sha256);
      snapshotBytes(project, output, witness.node);
      if (witness.stdin) snapshotBytes(project, output, witness.stdin);
    } else if (witness.kind === "child-after") {
      const matching = [...invocationPairs.values()].filter(pair => !pair.after && pair.before.root === witness.root && pair.before.id === witness.id);
      assert.equal(matching.length, 1, "quality_child_join_ambiguous"); matching[0].after = witness;
    } else {
      assert.equal(witness.kind, "controlled-copy-closed"); assert.ok(created.has(witness.root));
      assert.equal(closed.has(witness.root), false); closed.add(witness.root);
      assert.deepEqual(witness.subjects, created.get(witness.root).subjects);
    }
  }
  assert.equal(created.size, closed.size, "quality_copied_root_not_closed");
  const directUrl = pathToFileURL(path.join(project, QUALITY_SUBJECT)).href;
  const copiedUrls = new Map();
  for (const [root, value] of created) for (const subject of value.subjects) {
    const original = sourceRows.get(subject.id); assert.ok(original);
    assert.equal(subject.production_sha256, original.row.sha256); assert.equal(subject.copied_sha256, original.row.sha256);
    assert.equal(subject.url, pathToFileURL(path.join(root, subject.id)).href);
    if (subject.id === QUALITY_SUBJECT) copiedUrls.set(subject.url, root);
  }
  const childRaw = new Map();
  for (const [key, pair] of invocationPairs) {
    assert.ok(pair.after, "quality_child_after_missing"); const first = pair.before, last = pair.after;
    assert.deepEqual(first.subjects, last.subjects); integer(last.child_pid);
    assert.ok(time(last.finished_at) >= time(first.started_at));
    validateCopiedInputs(first.root, last.input_after);
    snapshotBytes(project, output, last.stdout); snapshotBytes(project, output, last.stderr);
    for (const descriptor of last.raw) {
      const logical = path.relative(project, descriptor.path).split(path.sep).join("/");
      assert.deepEqual(rawMap.get(logical), { path: logical, sha256: descriptor.sha256 }, "quality_child_raw_not_actual_stream");
      readBound(project, output, { path: logical, sha256: descriptor.sha256 });
      // Descendant streams remain retained but cannot borrow the returned PID.
      if (rawIdentity(logical).pid === last.child_pid) {
        assert.equal(childRaw.has(logical), false); childRaw.set(logical, { key, first, last });
      }
    }
  }
  const admitted = [], excluded = [], selected = [], dependencyBindings = [];
  for (const descriptor of result.raw_v8) {
    const raw = JSON.parse(readBound(project, output, descriptor).toString("utf8")); assert.ok(Array.isArray(raw.result));
    const identity = rawIdentity(descriptor.path);
    for (let index = 0; index < raw.result.length; index += 1) {
      const script = raw.result[index];
      if (typeof script.url === "string" && script.url.startsWith("file:")) {
        const url = new URL(script.url), pathname = fileURLToPath(url);
        if (pathname.includes(path.sep + "node_modules" + path.sep)) {
          const relative = path.relative(project, pathname).split(path.sep).join("/");
          const dependency = dependencies.get(relative); assert.ok(dependency, `quality_actual_dependency_uncaptured:${relative}`);
          dependencyBindings.push({ raw: descriptor, url: script.url, dependency });
        }
      }
      if (script.url === directUrl) {
        const owner = childRaw.get(descriptor.path);
        const processOwner = processPairs.get(identity.pid);
        assert.ok(owner || processOwner, "quality_workspace_record_pid_unobserved");
        const start = owner?.first.started_at ?? processOwner.before.observed_at;
        // Node writes a test process's final V8 stream after exit listeners.
        // The independently observed test-runner completion is its conservative
        // end bound; the exit-handler observation is never relabelled as a wall
        // process-exit timestamp. Synchronous child returns already bound raw.
        const end = owner?.last.finished_at ?? result.finished_at;
        assert.ok(identity.captured_at_ms >= time(start) && identity.captured_at_ms <= time(end), "quality_raw_capture_outside_pid_lifetime");
        rawSourceGeometry(script, source.bytes); selected.push(script);
        admitted.push({ raw: descriptor, raw_result_index: index, url: script.url, source_sha256: source.row.sha256,
          pid: identity.pid, root: owner?.first.root ?? project, test_process_pid: owner?.first.test_process_pid ?? identity.pid,
          invocation_key: owner?.key ?? null, contribution: "admitted-workspace-source", actual_raw_timestamp_ms: identity.captured_at_ms });
      } else if (copiedUrls.has(script.url)) {
        rawSourceGeometry(script, source.bytes);
        excluded.push({ raw: descriptor, raw_result_index: index, url: script.url, copied_root: copiedUrls.get(script.url),
          raw_pid: identity.pid, reason: "copied URL not selected; no independently admitted descendant PID", contribution: 0 });
      }
    }
  }
  assert.ok(selected.length > 0, "quality_subject_not_executed");
  const tapDescriptor = { path: path.posix.join(runRelative, "tests.tap"), sha256: result.report_sha256 };
  const tap = readBound(project, output, tapDescriptor).toString("utf8");
  assert.ok(tap.startsWith("TAP version 13\n") && /^1\.\.107$/mu.test(tap));
  assert.equal([...tap.matchAll(/^ok \d+ - /gmu)].length, 107);
  assert.ok(!/^not ok |Bail out!|# (?:SKIP|TODO)/mu.test(tap));
  for (const field of ["fail", "cancelled", "skipped", "todo"]) assert.ok(new RegExp(`^# ${field} 0$`, "mu").test(tap));
  assert.ok(/^# tests 107$/mu.test(tap) && /^# pass 107$/mu.test(tap));
  return { project, output, execution, before, after, producerBefore, producerAfter,
    tested_source_head: testedSourceHead, source, selected, admitted, excluded,
    dependency_bindings: dependencyBindings, witness_descriptor: witnessDescriptor,
    root_admission_required: true, generic_consumer_validates_pid_lineage: false,
    observed_workers: [...observedWorkers], observed_children: invocationPairs.size, copied_roots: created.size };
}

export async function deriveQuality107({ projectRoot, runRelative, rootLaunchBinding, verifyRootLaunch, testedSourceHead, readSource }) {
  const valid = validateQuality107Lineage({ projectRoot, runRelative, rootLaunchBinding, verifyRootLaunch, testedSourceHead, readSource });
  const { project, output } = valid;
  assert.equal(fileURLToPath(import.meta.url), path.join(project, QUALITY_DERIVE), "quality_analysis_relocated");
  assert.ok(readSource(testedSourceHead, QUALITY_DERIVE).equals(fs.readFileSync(fileURLToPath(import.meta.url))), "quality_analysis_source_changed");
  const merged = require("@bcoe/v8-coverage").mergeScriptCovs(valid.selected);
  writeOwnedJson(project, output, "mapped-raw-before-merge.json", { result: valid.selected });
  writeOwnedJson(project, output, "merged-raw-before-conversion.json", { result: [merged] });
  const converter = require("v8-to-istanbul")(path.join(project, QUALITY_SUBJECT), 0, { source: valid.source.bytes.toString("utf8") });
  await converter.load(); converter.applyCoverage(merged.functions);
  const coverage = converter.toIstanbul(), map = require("istanbul-lib-coverage").createCoverageMap(coverage);
  const metrics = map.fileCoverageFor(path.join(project, QUALITY_SUBJECT)).toSummary().toJSON();
  const exact100 = ["statements", "branches", "functions", "lines"].every(name => metrics[name].pct === 100
    && metrics[name].covered === metrics[name].total && metrics[name].skipped === 0);
  const coverageDescriptor = writeOwnedJson(project, output, "coverage-final.json", coverage);
  const lineage = writeOwnedJson(project, output, "raw-source-bindings.json", { schema_version: 1, native_acceptance: false,
    source: valid.source.row, admitted: valid.admitted, excluded: valid.excluded, dependency_bindings: valid.dependency_bindings,
    witnesses: valid.witness_descriptor, generic_consumer_validates_pid_lineage: false, root_independently_validated: true });
  const exclusions = writeOwnedJson(project, output, "excluded-records.json", { schema_version: 1,
    contribution: 0, excluded_from_metrics: true, records: valid.excluded });
  const bindings = [{ id: QUALITY_SUBJECT, url: pathToFileURL(path.join(project, QUALITY_SUBJECT)).href, sha256: valid.source.row.sha256 }];
  const actual = valid.execution.value;
  const receipt = { schema_version: 1, producer: "personal-closeout-host-execution/v1", source_head: actual.execution_context_head,
    tested_source_head: testedSourceHead, started_at: actual.started_at, finished_at: actual.finished_at, runner: "node-tap",
    test_files: [...QUALITY_TESTS], source_inputs: actual.source_inputs,
    report: { path: path.posix.join(runRelative, "tests.tap"), sha256: actual.report_sha256 }, actual_execution: valid.execution.descriptor,
    input_snapshot_before: valid.before.descriptor, input_snapshot_after: valid.after.descriptor,
    coverage_artifacts: [coverageDescriptor], raw_v8: actual.raw_v8, source_bindings: bindings,
    coverage_only: true, native_acceptance: false, coverage_subject: QUALITY_SUBJECT };
  const executionDescriptor = writeOwnedJson(project, output, "host-execution.json", receipt);
  const proof = writeOwnedJson(project, output, "coverage-proof.json", { kind: "raw-v8-coverage", id: QUALITY_SUBJECT,
    coverage_artifact: coverageDescriptor, runs: [{ execution: executionDescriptor, raw_v8: actual.raw_v8, source_bindings: bindings }] });
  const result = writeOwnedJson(project, output, "FINAL-REPORT.json", { schema_version: 1,
    status: exact100 ? "PASS_WITH_EXPLICIT_COPIED_EXCLUSIONS" : "COVERAGE_FAIL", native_acceptance: false,
    root_admission_required: true, generic_consumer_validates_pid_lineage: false,
    generic_consumer_verified: false, final_authority_compatibility: "PENDING_ROOT_HEAD_AND_INHERITANCE_CHECK",
    subject: QUALITY_SUBJECT, source_sha256: valid.source.row.sha256, metrics,
    tests: actual.counts, source_inputs: actual.source_inputs.length, observed_workers: valid.observed_workers,
    observed_children: valid.observed_children, copied_roots: valid.copied_roots, admitted_records: valid.admitted.length,
    excluded_records: valid.excluded.length, excluded_contribution: 0,
    proof, lineage, exclusions, execution: executionDescriptor, coverage: coverageDescriptor });
  return { exact100, result, proof, lineage, exclusions };
}

// No standalone self-admission CLI exists. The root invokes these exports with
// independently observed admission and trusted Git source-reader capabilities.

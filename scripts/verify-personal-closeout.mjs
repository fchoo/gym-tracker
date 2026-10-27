import { PNG } from "pngjs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, lstatSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { assertGarminCliProcessReceipt } from "./garmin-cli-coverage-evidence.mjs";
import istanbul from "istanbul-lib-coverage";
import ts from "typescript";
import { loadV12ContractInputs } from "./v12-evidence-contract.mjs";
import { validateV12RunManifest } from "./create-v12-run-manifest.mjs";
import { validateV12RecoveryShard, V12_RECOVERY_STEPS, V12_RECOVERY_CUT_IDS } from "./v12-recovery-shard.mjs";
import { validateV12SqliteShard, V12_SQLITE_SHARD_CASE_IDS } from "./v12-sqlite-shard.mjs";
import { assertV12AcceptanceNativeContractResult } from "./v12-sqlite-producer-contract.mjs";
import { createV12RowSelectorTable, parseV12SourceJUnit, resolveV12SqliteReceipt, resolveV12ProgressContract,
  V12_GARMIN_REQUIREMENT_REGISTRY, validateV12CalendarExecutionOrigin } from "./v12-blocker-row-resolver.mjs";
import { createV12ShellRequirementEvidence } from "./v12-shell-requirement-evidence.mjs";
import { validateV12CalendarShard } from "./v12-calendar-shard.mjs";
import { validateV12CalendarProbeReceipt } from "./v12-calendar-requirement-map.mjs";
import { V12_GARMIN_SHARD_CASE_IDS } from "./v12-garmin-shard.mjs";
import { validateV12PerformanceShard } from "./v12-performance-shard.mjs";
import { validateV12PerformanceProducer, validateV12AccessibilityProducer } from "./v12-quality-evidence-contract.mjs";
import { V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD } from "./benchmark-v12-interactions.mjs";
import { validateV12AttendedObservations } from "./generate-v12-attended-checklist.mjs";
import { validateV12DirectMaestroMapping, validateV12FunctionalExecutionReceipt } from "./run-v12-maestro.mjs";
import { resolveV12ProductionVisualConfiguration } from "./v12-production-native-visual-actions.mjs";
import { assertCleanCommittedTree, sourceTreeSha256, v12ContractSourceDigests } from "./source-tree-digest.mjs";
import { resolveV12GitExecution } from "./v12-native-execution-origin.mjs";
import { validateV12ContractSourceIdentity, verifyV12FinalNativeIdentity, V12_NATIVE_PROVENANCE_REGISTRY } from "./verify-v12-native-evidence.mjs";

export const HISTORICAL_PERSONAL_PROFILE_SHA256 = "d3850330f68afb910284c83beab0c30910192242ecc7783e29fc84d678f14c92";
export const APPROVED_PERSONAL_PROFILE_SHA256 = "ecf1c6d08ece2e5b9c56c3d5fdfbc00af47633c51a3d0925a8871f8afcceeee9";
export const RETAINED_SQLITE_PUBLICATION_SHA256 = "d50cd404a2fed3a4671ff4cf66ca073c46b35eb4164b68f83c5f1f3b8485e935";
const PROFILE_PATH = ".planning/verification/personal-closeout-profile-20261027-v2.json";
const FIXTURE = "v12-synthetic-fixtures-r18";
const sha = value => createHash("sha256").update(value).digest("hex");
const jsonSha = value => sha(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = code => { throw new Error(`personal_closeout_${code}`); };
const check = (value, code) => { if (!value) fail(code); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const HASH = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const FUNCTIONAL_TOAST_NONCE = /^[a-f0-9]{48}$/u;
const pair = value => `${value.state_id}/${value.configuration_id}`;
const unique = values => new Set(values).size === values.length;
const exact = (value, keys) => object(value) && same(Object.keys(value).sort(), [...keys].sort());
const safePath = value => typeof value === "string" && value.length > 0 && !path.isAbsolute(value)
  && !value.includes("\\") && value !== ".coverage" && !value.split("/").some(p => !p || p === "." || p === "..");

export function validatePersonalCloseoutProfile(profile, requirementIds) {
  check(object(profile) && jsonSha(profile) === APPROVED_PERSONAL_PROFILE_SHA256, "profile_invalid");
  check(Array.isArray(requirementIds) && same(profile.requirement_ids, requirementIds), "requirements_invalid");
  return profile;
}
function timestamp(value, now) {
  check(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
    && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now, "timestamp_invalid");
  return Date.parse(value);
}
function boundReader(readBytes) {
  const cache = new Map();
  return binding => {
    check(exact(binding, ["path", "sha256"]) && safePath(binding.path) && HASH.test(binding.sha256), "binding_invalid");
    if (!cache.has(binding.path)) cache.set(binding.path, readBytes(binding.path));
    const bytes = cache.get(binding.path);
    check(Buffer.isBuffer(bytes) && sha(bytes) === binding.sha256, "binding_changed");
    return bytes;
  };
}
function parse(bytes) { return JSON.parse(bytes.toString("utf8")); }
function nativeIdentity(value, manifest, noncePattern = NONCE) {
  check(object(value) && value.native_execution === "EXECUTED" && value.run_id === manifest.run_id
    && noncePattern.test(value.nonce ?? "") && value.source_tree_sha256 === manifest.source.tree_sha256
    && value.apk_sha256 === manifest.build.apk.sha256 && value.device_identity_sha256 === manifest.device.identity_sha256, "native_identity_invalid");
}
function proofInputs(inputs, expectedHead, authority, required) {
  check(Array.isArray(inputs) && inputs.length > 0 && unique(inputs.map(x => x.path))
    && required.every(file => inputs.some(x => x.path === file)), "source_inputs_invalid");
  for (const input of inputs) {
    check(exact(input, ["path", "sha256"]) && safePath(input.path) && HASH.test(input.sha256)
      && sha(authority.readSource(expectedHead, input.path)) === input.sha256, "source_inputs_changed");
  }
}
function actualHostExecution(receipt, hashFile, reportSha) {
  const actual = parse(hashFile(receipt.actual_execution));
  check(object(actual) && actual.schema_version === 1 && actual.exit_code === 0
    && actual.execution_context_head === receipt.source_head && actual.started_at === receipt.started_at && actual.finished_at === receipt.finished_at
    && same(actual.test_files, receipt.test_files) && same(actual.source_inputs, receipt.source_inputs)
    && actual.report_sha256 === reportSha && Array.isArray(actual.changed_inputs) && actual.changed_inputs.length === 0, "host_actual_execution_invalid");
  return actual;
}
function reconciledReportSha(receipt, hashFile, authority, start, end) {
  if (receipt.report_reconciliation === undefined) return receipt.report.sha256;
  const link = receipt.report_reconciliation;
  check(receipt.runner === "jest" && exact(link, ["kind", "log", "json"]) && link.kind === "jest-log-json"
    && same(link.json, receipt.report), "report_reconciliation_invalid");
  const log = hashFile(link.log).toString("utf8"); const raw = parse(hashFile(link.json));
  const actual = actualHostExecution(receipt, hashFile, link.log.sha256);
  const root = authority.root ?? process.cwd();
  check(Array.isArray(actual.argv) && actual.argv.every(value => typeof value === "string") && actual.argv.includes("--json"), "report_argv_invalid");
  const outputs = actual.argv.flatMap((value, index) => value.startsWith("--outputFile=") ? [value.slice(13)]
    : value === "--outputFile" ? [actual.argv[index + 1]] : []);
  check(outputs.length === 1 && typeof outputs[0] === "string" && path.resolve(root, outputs[0]) === path.resolve(root, link.json.path)
    && receipt.test_files.every(file => actual.argv.some(value => path.resolve(root, value) === path.resolve(root, file))), "report_argv_invalid");
  const footers = [...log.matchAll(/^(Test Suites|Tests):\s*(\d+) passed,\s*(\d+) total\s*$/gmu)];
  const suites = [...log.matchAll(/^PASS(?:\s+\S+)?\s+([^\s]+\.(?:test|spec)\.[cm]?[jt]sx?)(?:\s+\([0-9.]+ s\))?\s*$/gmu)];
  check(footers.length === 2 && unique(footers.map(value => value[1])) && !/^FAIL\b/mu.test(log)
    && footers.every(value => Number(value[2]) > 0 && value[2] === value[3])
    && Number(footers.find(value => value[1] === "Tests")[2]) === raw.numTotalTests
    && Number(footers.find(value => value[1] === "Test Suites")[2]) === raw.numTotalTestSuites
    && raw.numPassedTestSuites === raw.numTotalTestSuites && raw.numTotalTestSuites === receipt.test_files.length
    && raw.numFailedTestSuites === 0 && raw.numPendingTestSuites === 0 && raw.numRuntimeErrorTestSuites === 0
    && raw.wasInterrupted === false && suites.length === receipt.test_files.length
    && unique(suites.map(value => value[1])) && receipt.test_files.every(file => suites.some(value => value[1] === file)), "report_counts_invalid");
  check(Number.isSafeInteger(raw.startTime) && raw.startTime >= start && raw.startTime <= end
    && Array.isArray(raw.testResults) && raw.testResults.every(suite => Number.isSafeInteger(suite.startTime) && Number.isSafeInteger(suite.endTime)
      && suite.startTime >= raw.startTime && suite.endTime >= suite.startTime && suite.endTime <= end), "report_time_invalid");
  return link.log.sha256;
}
function hostInputScope(receipt, hashFile, authority, testedHead, required, reportSha) {
  const extras = receipt.source_inputs.filter(input => !required.includes(input.path));
  if (extras.length === 0) return;
  const actual = actualHostExecution(receipt, hashFile, reportSha);
  const before = parse(hashFile(receipt.input_snapshot_before)); const after = parse(hashFile(receipt.input_snapshot_after));
  check(before.execution_context_head === receipt.source_head && after.execution_context_head === receipt.source_head
    && same(before.source_inputs, receipt.source_inputs) && same(after.source_inputs, receipt.source_inputs)
    && after.report_sha256 === reportSha, "tested_snapshot_invalid");
  check(Array.isArray(actual.argv) && actual.argv.every(value => typeof value === "string"), "host_input_scope_invalid");
  const root = authority.root ?? process.cwd();
  const runners = actual.argv.slice(1).map(value => path.relative(root, path.resolve(root, value)).split(path.sep).join("/"))
    .filter(value => safePath(value) && /^scripts\/.*\.[cm]?js$/u.test(value));
  check(runners.every(file => receipt.source_inputs.some(input => input.path === file))
    && receipt.test_files.every(file => actual.argv.some(value => path.resolve(root, value) === path.resolve(root, file))), "host_input_scope_invalid");
  const eligible = new Set(required);
  for (const runner of runners) for (const file of authority.sourceClosure(testedHead, [runner])) eligible.add(file);
  const literals = new Set();
  for (const file of eligible) {
    const text = authority.readSource(testedHead, file).toString("utf8");
    for (const match of text.matchAll(/(["'])([^"'\r\n]+)\1/gu)) if (safePath(match[2])) literals.add(match[2]);
  }
  check(extras.every(input => eligible.has(input.path) || literals.has(input.path)), "source_scope_invalid");
}
function hostExecution(binding, hashFile, authority) {
  const receipt = parse(hashFile(binding));
  check(object(receipt) && receipt.schema_version === 1 && receipt.producer === "personal-closeout-host-execution/v1"
    && HEAD.test(receipt.source_head ?? "") && ["jest", "node-tap", "node-spec"].includes(receipt.runner)
    && Array.isArray(receipt.test_files) && receipt.test_files.length > 0 && unique(receipt.test_files)
    && receipt.test_files.every(safePath), "host_execution_invalid");
  const start = timestamp(receipt.started_at, authority.now); const end = timestamp(receipt.finished_at, authority.now);
  check(end >= start, "timestamp_invalid");
  const executionReportSha = reconciledReportSha(receipt, hashFile, authority, start, end);
  const testedHead = receipt.tested_source_head ?? receipt.source_head;
  check(HEAD.test(testedHead), "host_execution_invalid");
  if (receipt.tested_source_head !== undefined) {
    const before = parse(hashFile(receipt.input_snapshot_before)); const after = parse(hashFile(receipt.input_snapshot_after));
    check(before.execution_context_head === receipt.source_head && after.execution_context_head === receipt.source_head
      && same(before.source_inputs, receipt.source_inputs) && same(after.source_inputs, receipt.source_inputs)
      && after.report_sha256 === executionReportSha, "tested_snapshot_invalid");
    authority.readSource(receipt.source_head, "package.json");
  }
  const required = authority.sourceClosure(testedHead, receipt.test_files);
  proofInputs(receipt.source_inputs, testedHead, authority, required);
  hostInputScope(receipt, hashFile, authority, testedHead, required, executionReportSha);
  if (testedHead !== authority.source.head) {
    const inherit = receipt.inheritance;
    check(exact(inherit, ["source_head", "current_head", "ledger", "inputs"]) && inherit.source_head === testedHead
      && inherit.current_head === authority.source.head && same(inherit.inputs, receipt.source_inputs), "inheritance_invalid");
    proofInputs(inherit.inputs, authority.source.head, authority, required);
    const ledger = parse(hashFile(inherit.ledger));
    check(object(ledger) && ledger.producer === "personal-closeout-retained-host-ledger/v1"
      && ledger.source_head === receipt.source_head && ledger.execution_sha256 === jsonSha({ ...receipt, inheritance: null })
      && ledger.report_sha256 === receipt.report.sha256 && ledger.inputs_sha256 === jsonSha(receipt.source_inputs), "inheritance_ledger_invalid");
  }
  const rawBytes = hashFile(receipt.report);
  let assertions;
  if (receipt.runner === "jest") {
    const raw = parse(rawBytes);
    check(raw.success === true && raw.numTotalTests > 0 && raw.numPassedTests === raw.numTotalTests
      && raw.numFailedTests === 0 && raw.numPendingTests === 0 && raw.numTodoTests === 0
      && Array.isArray(raw.testResults) && raw.testResults.length > 0, "host_result_invalid");
    assertions = raw.testResults.flatMap(suite => {
      const file = receipt.test_files.find(file => suite.name === file || suite.name.endsWith("/" + file));
      check(file && suite.status === "passed" && Array.isArray(suite.assertionResults) && suite.assertionResults.length > 0
        && suite.assertionResults.every(a => a.status === "passed" && typeof a.fullName === "string"), "host_result_invalid");
      return suite.assertionResults.map(a => ({ file, name: a.fullName }));
    });
    check(assertions.length === raw.numTotalTests && receipt.test_files.every(file => assertions.some(a => a.file === file)), "host_result_invalid");
  } else if (receipt.runner === "node-tap") {
    const text = rawBytes.toString("utf8");
    const plan = /^1\.\.(\d+)$/mu.exec(text);
    const cases = [...text.matchAll(/^(ok|not ok) (\d+) - (.+)$/gmu)];
    check(text.startsWith("TAP version 13\n") && plan && cases.length > 0 && Number(plan[1]) === cases.length
      && cases.every((c, i) => c[1] === "ok" && Number(c[2]) === i + 1 && !/# (?:SKIP|TODO)/iu.test(c[3]))
      && !/^\s*(?:not ok|Bail out!)|^# (?:fail|skipped|todo|cancelled) [1-9]/mu.test(text), "host_result_invalid");
    assertions = cases.flatMap(c => receipt.test_files.map(file => ({ file, name: c[3] })));
  } else {
    const text = rawBytes.toString("utf8");
    const footers = [...text.matchAll(/^ℹ (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gmu)];
    check(footers.length === 6 && unique(footers.map(x => x[1])), "host_result_invalid");
    const totals = Object.fromEntries(footers.map(x => [x[1], Number(x[2])]));
    const leaves = [...text.matchAll(/^(\s*)✔ (.+?) \([0-9.]+ms\)$/gmu)];
    check(totals.tests > 0 && totals.pass === totals.tests && totals.fail === 0 && totals.cancelled === 0 && totals.skipped === 0
      && totals.todo === 0 && leaves.length >= totals.tests && !/^\s*[✖✗]|^\s*not ok|Bail out!/mu.test(text), "host_result_invalid");
    assertions = leaves.flatMap(match => receipt.test_files.map(file => ({ file, name: match[2] })));
  }
  return { receipt, assertions, executionReportSha };
}
function sourceReceipt(value, state, nonce) {
  check(exact(value, ["schema_version", "nonce", "state_id", "fixture_variant", "assertions", "production_instance_id", "mount_id", "scroll_offsets", "timer", "digest"])
    && value.schema_version === 2 && value.nonce === nonce && value.state_id === state.id
    && value.fixture_variant === state.fixture_variant && same(value.assertions, state.readiness.source_receipt.assertions)
    && /^phase20-production-instance-\d+$/u.test(value.production_instance_id)
    && /^phase20-production-mount-\d+$/u.test(value.mount_id)
    && Array.isArray(value.scroll_offsets) && value.scroll_offsets.length > 0 && unique(value.scroll_offsets.map(x => x.native_id))
    && value.scroll_offsets.every(x => exact(x, ["native_id", "x", "y"]) && typeof x.native_id === "string" && x.native_id.length > 0
      && Number.isFinite(x.x) && x.x >= 0 && Number.isFinite(x.y) && x.y >= 0), "source_receipt_invalid");
  const timer = value.timer;
  if (timer !== null) {
    check(exact(timer, ["state", "revision", "remaining_ms", "ends_at_ms"]) && Number.isSafeInteger(timer.revision) && timer.revision >= 0
      && ["idle", "running", "paused", "expired"].includes(timer.state), "timer_invalid");
    const positive = v => Number.isFinite(v) && v >= 0;
    check(timer.state === "running" ? timer.remaining_ms === null && positive(timer.ends_at_ms)
      : timer.state === "paused" ? positive(timer.remaining_ms) && timer.ends_at_ms === null
        : timer.remaining_ms === null && timer.ends_at_ms === null, "timer_invalid");
  }
  const { schema_version: _version, nonce: _nonce, digest: _digest, ...material } = value;
  check(value.digest === jsonSha(material), "source_receipt_invalid");
}
function captureProof(entry, hashFile, manifest, authority) {
  const raw = parse(hashFile(entry.capture)); const state = authority.registry.find(x => x.id === entry.state_id);
  const config = resolveV12ProductionVisualConfiguration(entry.configuration_id);
  const plugin = exact(raw, ["native_execution", "fixture_id", "png_base64", "settings"]);
  check(state && (plugin || raw.schema_version === 3 && raw.producer === "v12-visual-capture/v3" && raw.run_id === manifest.run_id
    && raw.state_id === state.id && raw.configuration_id === config.id) && raw.fixture_id === FIXTURE
    && raw.native_execution === "EXECUTED" && raw.settings?.restored === true && raw.settings.privacy === "synthetic-only", "ui_invalid");
  check(Array.isArray(state.readiness?.alignment_gaps) && state.readiness.alignment_gaps.length === 0, "alignment_gaps");
  const receipt = raw.settings.state_receipt; const observed = raw.settings.observation;
  nativeIdentity({ ...receipt, native_execution: raw.native_execution }, manifest);
  check(receipt.schema_version === 3 && receipt.state_id === state.id && receipt.configuration_id === config.id
    && receipt.fixture_id === FIXTURE && receipt.readiness_status === state.readiness.status
    && receipt.png_sha256 === entry.png.sha256 && receipt.observation_sha256 === jsonSha(observed), "native_receipt_invalid");
  sourceReceipt(receipt.source_receipt, state, receipt.nonce);
  check(observed?.native_execution === "EXECUTED" && observed.state_id === state.id && observed.configuration_id === config.id
    && observed.viewport?.width_dp === config.width && observed.viewport.height_dp === config.height && observed.viewport.density === 1
    && observed.readiness?.status === state.readiness.status && same(observed.readiness.source_receipt, receipt.source_receipt), "readiness_invalid");
  const readiness = observed.readiness;
  for (const key of ["semantics", "test_ids", "non_color"]) {
    const expected = key === "test_ids" ? state.readiness.test_ids : state.readiness[key === "non_color" ? "non_color" : "semantics"];
    check(Array.isArray(readiness[key]) && same(readiness[key].map(x => x.value), expected)
      && readiness[key].every(x => x.matched === true), "readiness_invalid");
  }
  check(Array.isArray(readiness.actions) && readiness.actions.length === state.readiness.actions.length
    && readiness.actions.every((x, i) => Object.entries(state.readiness.actions[i]).every(([k, v]) => same(x[k], v)) && x.matched === true && x.enabled === !state.readiness.actions[i].disabled)
    && Array.isArray(readiness.order) && same(readiness.order.map(x => x.value), state.readiness.order)
    && readiness.order.every((x, i, all) => Number.isSafeInteger(x.observed_order) && x.observed_order >= 0 && (i === 0 || x.observed_order >= all[i - 1].observed_order))
    && readiness.focus?.target === state.readiness.focus.target && readiness.focus.matched === true
    && Array.isArray(observed.targets) && observed.targets.length > 0 && observed.targets.every(x => x.width_dp >= 48 && x.height_dp >= 48 && x.overlap === false), "readiness_invalid");
  const bytes = hashFile(entry.png);
  check(bytes.length >= 45 && bytes.length <= 16 * 1024 * 1024 && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
    && bytes.readUInt32BE(16) === config.width && bytes.readUInt32BE(20) === config.height, "png_invalid");
  const image = PNG.sync.read(bytes, { checkCRC: true });
  check(image.width === config.width && image.height === config.height && (plugin
    ? typeof raw.png_base64 === "string" && Buffer.from(raw.png_base64, "base64").equals(bytes)
    : raw.native_png?.path === entry.png.path && raw.native_png.sha256 === sha(bytes) && raw.native_png.size_bytes === bytes.length
      && raw.native_png.width === image.width && raw.native_png.height === image.height), "png_binding_invalid");
  return true;
}
const ROUTES = Object.freeze({
  "settings-production-provider": ["/", "settings-appearance-group", "app/(tabs)/_layout.tsx"],
  "removed-sessions-production-provider": ["/more/removed-sessions", "Removed sessions", "app/more/removed-sessions.tsx"],
  "backup-options": ["/more/manual-encrypted-backup", "Manual encrypted backup", "app/more/manual-encrypted-backup.tsx"],
  "restore-review": ["/more/data-and-recovery", "restore-clean-action", "app/more/data-and-recovery.tsx"],
  "completed-session-detail": ["/session/", "Workout details", "app/session/[sessionId].tsx"],
  "history-correction": ["/session/", "session-correction-screen", "app/session/[sessionId]/correct.tsx"],
  "completion-readback": ["/completion/", "workout-completion-context-card", "app/completion/[sessionId].tsx"],
  "toast-after-confirmed-action": ["/workout/", "semantic-toast", "app/workout/[sessionId].tsx"],
});
function routeProof(item, hashFile, manifest, authority) {
  manifest = boundManifest(item.native_manifest, hashFile, manifest, authority);
  const raw = parse(hashFile(item.artifact));
  nativeIdentity(raw, manifest, item.id === "toast-after-confirmed-action" ? FUNCTIONAL_TOAST_NONCE : NONCE);
  const [route, screen, source] = ROUTES[item.id];
  check(raw.schema_version === 1 && raw.producer === "personal-closeout-normal-route-trace/v1" && raw.probe_id === item.id
    && typeof raw.route === "string" && (route === "/" ? raw.route === "/" : raw.route.startsWith(route)) && !raw.route.includes("__")
    && raw.package === manifest.build.package && raw.foreground_package === manifest.build.package
    && raw.root_layout_sha256 === sha(authority.readSource(manifest.source.head, "app/_layout.tsx"))
    && raw.route_source_sha256 === sha(authority.readSource(manifest.source.head, source)), "route_evidence_invalid");
  const semanticBytes = hashFile(raw.semantic); const semantic = semanticBytes.toString("utf8");
  check(raw.semantic_sha256 === sha(semanticBytes) && semantic.includes("<hierarchy") && semantic.includes(screen)
    && semantic.includes(manifest.build.package) && !semantic.includes("phase20-visual-probe") && !semantic.includes("phase14-toast-proof"), "route_semantic_invalid");
  if (item.id === "toast-after-confirmed-action") {
    if (raw.command === null) return false;
    const command = parse(hashFile(raw.command));
    check(command.schema_version === 1 && command.producer === "v12-maestro-functional-command/v1"
      && command.shard === "workout" && command.execution_receipt?.nonce === raw.nonce, "route_command_invalid");
    authority.validateFunctional(command.execution_receipt, manifest, command.shard, command.case_id);
  }
  return raw.status === "PASS";
}
/** Read only static declared recipes; no TypeScript code or native runner is evaluated. */
export function readPersonalSqliteRecipe(readSource) {
  const cache = new Map();
  const module = file => {
    if (cache.has(file)) return cache.get(file);
    const ast = ts.createSourceFile(file, readSource(file).toString("utf8"), ts.ScriptTarget.Latest, true);
    check(ast.parseDiagnostics.length === 0, "recipe_source_invalid");
    const declarations = new Map(); const imports = new Map(); const values = new Map();
    for (const statement of ast.statements) {
      if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration.initializer);
      }
      if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), statement.moduleSpecifier.text)) + ".ts";
        for (const item of statement.importClause.namedBindings.elements) imports.set(item.name.text, { target, name: item.propertyName?.text ?? item.name.text });
      }
    }
    const evaluate = node => {
      check(node, "recipe_source_invalid");
      if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) return evaluate(node.expression);
      if (ts.isStringLiteral(node)) return node.text;
      if (ts.isArrayLiteralExpression(node)) return node.elements.map(evaluate);
      if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => {
        check(ts.isPropertyAssignment(property), "recipe_source_invalid"); return [property.name.text, evaluate(property.initializer)];
      }));
      if (ts.isIdentifier(node)) return get(node.text);
      if (ts.isCallExpression(node) && node.expression.getText(ast) === "Object.freeze") return evaluate(node.arguments[0]);
      if (ts.isCallExpression(node) && node.expression.getText(ast) === "source") {
        const registry = evaluate(node.arguments[0]);
        return { registry, ids: node.arguments.length === 2 ? evaluate(node.arguments[1]) : get("SOURCE_REGISTRY_CASE_IDS")[registry] };
      }
      fail("recipe_source_invalid");
    };
    const get = name => {
      if (!values.has(name)) {
        const imported = imports.get(name);
        values.set(name, imported ? module(imported.target).get(imported.name) : evaluate(declarations.get(name)));
      }
      return values.get(name);
    };
    const result = { get }; cache.set(file, result); return result;
  };
  const main = module("src/testing/contracts/v12Acceptance.contract.ts");
  const registries = main.get("SOURCE_REGISTRY_CASE_IDS"); const categories = main.get("SOURCE_CASES");
  check(same(categories.map(x => x.id), V12_SQLITE_SHARD_CASE_IDS), "recipe_source_invalid");
  return { registries, categories };
}
function composeSqlite(envelope, hashFile, manifest, authority) {
  nativeIdentity(envelope, manifest);
  check(envelope.producer === "personal-closeout-native-sqlite-composition/v1"
    && Array.isArray(envelope.registries) && unique(envelope.registries.map(x => x.id)), "sqlite_composition_invalid");
  const recipe = authority.sqliteRecipe;
  const retained = envelope.retained; const old = validateV12RunManifest(parse(hashFile(retained.manifest)));
  const publication = parse(hashFile(retained.publication));
  check(retained.publication.path === "artifacts/native/v1.2/phase20-20261024T132356Z-136882436441/publication/sqlite.json"
    && retained.publication.sha256 === RETAINED_SQLITE_PUBLICATION_SHA256, "sqlite_retained_origin_invalid");
  check(sha(hashFile(retained.apk)) === old.build.apk.sha256 && hashFile(retained.apk).length === old.build.apk.size_bytes, "sqlite_binary_invalid");
  check(old.evidence_origin === "native" && publication.producer === "v12-atomic-shard-publication/v1" && publication.completed === true
    && publication.run_id === old.run_id && publication.shard === "sqlite" && publication.identity.evidence_origin === "native"
    && publication.identity.source_tree_sha256 === old.source.tree_sha256 && publication.identity.apk_sha256 === old.build.apk.sha256
    && publication.identity.installed_apk_sha256 === old.device.installed_apk_sha256
    && publication.identity.device_identity_sha256 === old.device.identity_sha256
    && publication.identity.fixture_sha256 === old.fixtures.registry_sha256
    && old.fixtures.registry_sha256 === manifest.fixtures.registry_sha256
    && publication.execution_origin.kind === "production-default-launcher" && publication.execution_origin.default_launcher === true
    && publication.execution_origin.test_only === false && publication.execution_origin.toolchain_origin === "production-attested/v1", "sqlite_retained_origin_invalid");
  const required = authority.sourceClosure(old.source.head, ["src/testing/contracts/sqliteKernel.contract.ts", "src/testing/contracts/migrationsEffects.contract.ts", "src/testing/contracts/googleDriveBackup.contract.ts"]);
  check(same(retained.source_inputs.map(x => x.path).sort(), [...required].sort()), "sqlite_retained_scope_invalid");
  proofInputs(retained.source_inputs, old.source.head, authority, required);
  proofInputs(retained.source_inputs, manifest.source.head, authority, required);
  check(authority.readSource(old.source.head, "src/testing/contracts/v12Acceptance.contract.ts").equals(
    authority.readSource(manifest.source.head, "src/testing/contracts/v12Acceptance.contract.ts")), "sqlite_recipe_changed");
  check(Array.isArray(retained.native_sqlite_binaries) && retained.native_sqlite_binaries.length > 0, "sqlite_binary_invalid");
  check(same(retained.native_sqlite_binaries.map(x => x.archive_path).sort(), authority.sqliteBinaryPaths(old, manifest, retained.apk)), "sqlite_binary_invalid");
  for (const binary of retained.native_sqlite_binaries) {
    check(exact(binary, ["archive_path", "old", "current"]) && /(?:^|\/)lib[^/]*sqlite[^/]*\.so$/u.test(binary.archive_path)
      && hashFile(binary.old).equals(hashFile(binary.current)) && binary.old.sha256 === binary.current.sha256, "sqlite_binary_invalid");
    check(authority.verifySqliteBinary(old, manifest, binary, retained.apk) === true, "sqlite_binary_invalid");
  }
  const inherited = new Map();
  check(publication.members.length === 3 && retained.members.length === 3, "sqlite_retained_members_invalid");
  for (const [index, group] of ["migration", "portability", "history"].entries()) {
    const descriptor = retained.members[index]; const bytes = hashFile(descriptor);
    const member = publication.members.find(x => x.artifact === `sqlite/${group}.json`);
    check(member && descriptor.path === `artifacts/native/v1.2/${old.run_id}/${member.artifact}`
      && member.sha256 === descriptor.sha256 && member.size_bytes === bytes.length, "sqlite_retained_members_invalid");
    const raw = parse(bytes); const result = resolveV12SqliteReceipt(raw, group);
    check(raw.identity.source_digest === old.source.tree_sha256 && raw.identity.apk_digest === old.build.apk.sha256
      && raw.identity.installed_apk_digest === old.device.installed_apk_sha256 && raw.identity.device_digest === old.device.identity_sha256, "sqlite_retained_identity_invalid");
    for (const fact of result.case_facts) for (const source of fact.source_facts) {
      if (!["sqlite-kernel", "migrations", "google-drive-backup"].includes(source.registry)) continue;
      if (!inherited.has(source.registry)) inherited.set(source.registry, new Map());
      for (const item of source.cases) inherited.get(source.registry).set(item.id, item.status);
    }
  }
  const registries = new Map();
  for (const id of ["sqlite-kernel", "migrations", "google-drive-backup"]) {
    const expected = recipe.registries[id]; const facts = inherited.get(id);
    check(facts && facts.size === expected.length && expected.every(caseId => facts.get(caseId) === "passed"), "sqlite_retained_cases_invalid");
    registries.set(id, facts);
  }
  check(same(envelope.registries.map(x => x.id).sort(), ["multi-plan-running", "portable-merge", "progress-parity"].sort()), "sqlite_composition_invalid");
  for (const item of envelope.registries) {
    const raw = parse(hashFile(item.artifact)); nativeIdentity(raw, manifest);
    const result = raw.contract; const expected = recipe.registries[item.id];
    check(raw.producer === "personal-closeout-native-registry/v1" && raw.registry === item.id && result.status === "passed"
      && result.total === expected.length && result.passed === expected.length && result.failed === 0 && result.skipped === 0
      && same(result.cases.map(x => x.id), expected) && result.cases.every(x => x.status === "passed"), "sqlite_registry_invalid");
    registries.set(item.id, new Map(result.cases.map(x => [x.id, x.status])));
  }
  const aliases = recipe.registries["garmin-acceptance"];
  registries.set("garmin-acceptance", new Map(aliases.map(id => {
    const matches = ["multi-plan-running", "portable-merge"].filter(name => registries.get(name).has(id));
    check(matches.length === 1 && registries.get(matches[0]).get(id) === "passed", "sqlite_alias_invalid"); return [id, "passed"];
  })));
  const cases = recipe.categories.map(definition => {
    const sourceFacts = definition.sources.map(source => ({ registry: source.registry,
      cases: source.ids.map(id => { check(registries.get(source.registry)?.get(id) === "passed", "sqlite_recipe_invalid"); return { id, status: "passed" }; }) }));
    return { id: definition.id, status: "passed", code: "v12_acceptance_case_passed", counts: { sourceCases: sourceFacts.reduce((n, x) => n + x.cases.length, 0) }, sourceFacts };
  });
  return { schemaVersion: 1, contractVersion: 1, status: "passed", total: 10, passed: 10, failed: 0, skipped: 0, cases };
}
function sqliteProof(critical, hashFile, manifest, authority) {
  if (critical.sqlite_artifact === null || critical.sqlite_contract === null) return null;
  const raw = parse(hashFile(critical.sqlite_artifact)); const envelope = parse(hashFile(critical.sqlite_contract));
  nativeIdentity(envelope, manifest);
  const contract = envelope.producer === "personal-closeout-native-sqlite-composition/v1" ? composeSqlite(envelope, hashFile, manifest, authority) : envelope.contract;
  check(envelope.producer === "personal-closeout-native-sqlite-contract/v1" || envelope.producer === "personal-closeout-native-sqlite-composition/v1", "sqlite_origin_invalid");
  assertV12AcceptanceNativeContractResult(contract, V12_SQLITE_SHARD_CASE_IDS);
  check(contract.cases.every((entry, i) => same(entry.sourceFacts, authority.sqliteRecipe.categories[i].sources.map(source => ({registry:source.registry,cases:source.ids.map(id=>({id,status:"passed"}))})))), "sqlite_recipe_invalid");
  const identity = { source_digest: manifest.source.tree_sha256, fixture_digest: manifest.fixtures.registry_sha256,
    apk_digest: manifest.build.apk.sha256, installed_apk_digest: manifest.device.installed_apk_sha256, device_digest: manifest.device.identity_sha256 };
  check(same(raw.identity, identity), "sqlite_identity_invalid");
  const cases = contract.cases.map((entry, order) => {
    const base = { identity, id: entry.id, order, code: entry.code, counts: entry.counts, sourceFacts: entry.sourceFacts };
    return { id: entry.id, status: "passed", order, source_facts: entry.sourceFacts,
      digests: Object.fromEntries(["pre", "post", "reopen", "rebuild"].map(cut => [cut, jsonSha({ ...base, cut })])) };
  });
  check(same(raw.cases, cases), "sqlite_case_binding_invalid"); validateV12SqliteShard(raw);
  return new Map(cases.map(x => [x.id, jsonSha(x)]));
}
function recoveryProof(critical, hashFile, manifest) {
  if (critical.recovery_artifact === null || critical.recovery_junit === null) return null;
  const raw = parse(hashFile(critical.recovery_artifact)); const xml = hashFile(critical.recovery_junit).toString("utf8");
  check(raw.run_id === manifest.run_id && raw.identity?.source_digest === manifest.source.tree_sha256, "recovery_identity_invalid");
  const { run_id: _run, observation: _observed, ...candidate } = raw;
  validateV12RecoveryShard(candidate);
  const cuts = candidate.cases.flatMap(row => row.cuts.map(cut => ({ row, cut, id: `${row.id}:${cut.step_id}:${cut.cut_id}` })));
  const states = Object.fromEntries(cuts.map(x => [x.id, x.cut.status]));
  const tests = parseV12SourceJUnit(xml, cuts.map(x => x.id), states);
  const phases = ["before", "after_cut", "after_reopen", "after_recovery", "after_retry"];
  const identities = {
    source_digest: manifest.source.tree_sha256, receipt_digest: sha(xml),
    scenario_digest: jsonSha(candidate.cases.map(({ id, order, steps }) => ({ id, order, steps }))),
    cut_digest: jsonSha(cuts.map(({ cut }) => cut.receipt_sha256)),
    ...Object.fromEntries(["pointer", "effect", "rest", "history", "timing", "restore", "merge_receipt"].map(key => [key + "_digest", jsonSha(cuts.map(({ cut }) => cut.snapshots.after_retry[key + "_facts"]))])),
    cue_digest: jsonSha(cuts.map(({ cut }) => cut.snapshots.after_retry.cue_count)),
  };
  check(same(candidate.identity, identities), "recovery_digest_invalid");
  return new Map(cuts.map(({ row, cut, id }, i) => {
    const props = tests[i].properties;
    check(props.case_id === row.id && props.step_id === cut.step_id && props.cut_id === cut.cut_id
      && props.operation_id === cut.operation_id && props.boundary_id === cut.boundary_id && props.receipt_kind === cut.receipt_kind
      && props.receipt_sha256 === cut.receipt_sha256 && props.barrier_provenance === cut.barrier.provenance
      && ["barrier_id", "process_state", "acknowledgement", "connectivity", "first_attempt"].every(k => props[k] === cut.barrier[k])
      && ["first_attempt_code", "recovery_code", "retry_code"].every(k => props[k] === cut[k])
      && phases.every(k => props[k + "_sha256"] === jsonSha(cut.snapshots[k])), "recovery_junit_invalid");
    return [id, { receipt: cut.receipt_sha256, passed: row.status === "PASS" && cut.status === "PASS" && tests[i].result === "PASS" }];
  }));
}
export const LEGACY_COMPLETE_GATE = Object.freeze({
  head: "73e1e41af78fde194aaa5dae2f905797de655d31", tree: "1ce35f05f0f5352c2cec812ee7927e12585e52a92c6f16bbd41ce6b40bd5cd71",
  runner_sha256: "2ce7f284159e8b5b0b7fd8a071c44ef0bce664e44e127f3c93c729d7b8837817",
  receipt: { path: "artifacts/native/host/phase20-final-73e1e41af78f/host-receipt.json", sha256: "fe7b5b6a775b70edb9fda75b0e5bdadb8c9296edf207e2388dc296164bc358f0" },
  log: { path: "artifacts/native/host/phase20-final-73e1e41af78f/jest-integrity.log", sha256: "22d29f108208e127ca1fb4c831f0472d21f5b522966dfa034e6f0560817c9d40" },
  jest: { path: "artifacts/native/host/phase20-final-73e1e41af78f/jest-results.json", sha256: "356fd731763135afe3a9ffac0e058cb8893b8f3680fea9e9d45d6c8901e54885" },
});
export function readPersonalCoverageRegistry(readSource) {
  const ast = ts.createSourceFile("gate.mjs", readSource("scripts/run-coverage-gate.mjs").toString("utf8"), ts.ScriptTarget.Latest, true);
  const declarations = new Map(ast.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations].map(x => [x.name.getText(ast), x.initializer])));
  const evaluate = node => {
    check(node, "legacy_registry_invalid");
    if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(item => ts.isSpreadElement(item) ? evaluate(item.expression) : [evaluate(item)]);
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isIdentifier(node)) return evaluate(declarations.get(node.text));
    if (ts.isPropertyAccessExpression(node) && node.getText(ast) === "phase19CoverageManifest.required_files") return parse(readSource("scripts/phase19-integrity-coverage.json")).required_files;
    fail("legacy_registry_invalid");
  };
  const ids = evaluate(declarations.get("integrityCriticalFiles"));
  check(ids.length === 166 && unique(ids) && ids.every(safePath), "legacy_registry_invalid"); return ids;
}
function executable(bytes, file) {
  if (!/\.(?:ts|tsx|js|mjs|cjs)$/u.test(file)) return bytes;
  return Buffer.from(ts.transpileModule(bytes.toString("utf8"), { fileName: file, compilerOptions: {
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, removeComments: true, verbatimModuleSyntax: false,
  } }).outputText);
}
export const RETAINED_TOOL_THRESHOLDS = Object.freeze({
  "src/platform/garmin/canonicalGarminPayload.ts": { head: "7e51f5363e7c14bd6e0decc048794002f566d747", tests: ["src/platform/garmin/canonicalGarminPayload.test.ts"],
    log: { path: "artifacts/native/host/canonical-array-guard-20261024/green.log", sha256: "a15bfc784ab39ef2265f1c8d1b4e6ca02a92d5ea82927945a74def56e20bbf54" },
    receipt: { path: "artifacts/native/host/canonical-array-guard-20261024/receipt.json", sha256: "43eacf89e23a1642e29520fef7b6f214d846320e28262b99dc07896d47f8d7f7" } },
  "src/platform/garmin/normalizeGarminActivity.ts": { head: "c40ba2b5e6c96bac2e68b4fc6f1f62b5ebe97dd0", tests: ["src/platform/garmin/normalizeGarminActivity.test.ts"],
    log: { path: "artifacts/native/host/final-source-c40ba2b5/utc-normalizer-green.log", sha256: "af080588be7dd8436564e629be071873496b3c53d981eb43c37342bfc51977ec" },
    receipt: { path: "artifacts/native/host/final-source-c40ba2b5/host-receipt.json", sha256: "725a061671974160ae5ee36a1b5b2f7867409d343b1887222d023fdb8b323f9f" } },
  "src/platform/garmin/garminActivityAdapter.ts": { head: "f26d01503bdc7bb40083e75f8c3db6f80d80b9b0", tests: ["src/platform/garmin/garminActivityAdapter.test.ts", "src/platform/garmin/normalizeGarminActivity.test.ts"],
    log: { path: "artifacts/native/host/treadmill-repair-20261024/adapter-green.log", sha256: "eda8bed4981ec4ad5fef9f694c57882db8167f5096eee5012293ae675a3decf4" },
    receipt: { path: "artifacts/native/host/treadmill-repair-20261024/repair.json", sha256: "113b0977df7c1e63a0868a98cbceebc77788e4e03b396668b729b2d4a4ed3273" } },
});
export const JEST_NATIVE_ROUTER_COMPATIBILITY = Object.freeze({
  old_sha256: "a6d745d507a15b57fa994614b4e4d567910dc643c31162467f916fbe09a6a6cd",
  current_sha256: "c3a2a8d9d02a5f3fe2e19546829b24414f2e1c7d03ba1f7597004c7d60f6f5c5",
  moved_test: "app/__tests__/recovery-router-transition.test.tsx",
  witness: { path: "artifacts/native/personal-closeout-20261027/jest-config-compatibility-witness-v2.json", sha256: "afdc8c62eda8ca75857b065ed84e4ed1e5eb98a46432f4780cdb09a84110be9d" },
});
function jestProjectShape(bytes) {
  const ast = ts.createSourceFile("jest.config.js", bytes.toString("utf8"), ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter({ removeComments: true }); const print = node => printer.printNode(ts.EmitHint.Unspecified, node, ast);
  const shared = ast.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations]).find(node => node.name.getText(ast) === "shared");
  const exported = ast.statements.filter(ts.isExpressionStatement).map(node => node.expression).find(node => ts.isBinaryExpression(node) && node.left.getText(ast) === "module.exports").right;
  const properties = node => node.properties.map(property => [ts.isSpreadAssignment(property) ? "..." + property.expression.getText(ast) : property.name.getText(ast), property]);
  const top = properties(exported); const projects = top.find(([name]) => name === "projects")[1].initializer;
  const rows = projects.elements.map(node => { const props = properties(node); const name = props.find(([key]) => key === "displayName")[1].initializer.text; return [name, Object.fromEntries(props.map(([key, value]) => [key, print(value)])), props]; });
  return { shared: print(shared.initializer), general: top.filter(([name]) => name !== "projects").map(([, value]) => print(value)), rows };
}
function compatibleJestRunner(item, old, current, hashFile) {
  if (item.runner_compatibility === undefined) return false;
  check(same(item.runner_compatibility, JEST_NATIVE_ROUTER_COMPATIBILITY.witness), "runner_compatibility_invalid");
  const witness = parse(hashFile(item.runner_compatibility)); const review = parse(hashFile(witness.source_witness));
  check(witness.producer === "personal-closeout-jest-native-router-compatibility/v1" && witness.old_sha256 === JEST_NATIVE_ROUTER_COMPATIBILITY.old_sha256
    && witness.current_sha256 === JEST_NATIVE_ROUTER_COMPATIBILITY.current_sha256 && witness.moved_test_requires_current_proof === true
    && review.legacy_source_owned_gate_inheritance.configuration_compatibility.includes("Jest config change only isolates recovery-router-transition.test.tsx"), "runner_compatibility_invalid");
  if (sha(old) !== witness.old_sha256 || sha(current) !== witness.current_sha256 || item.id === JEST_NATIVE_ROUTER_COMPATIBILITY.moved_test
    || item.source_inputs.some(input => input.path === JEST_NATIVE_ROUTER_COMPATIBILITY.moved_test)) return false;
  const before = jestProjectShape(old); const after = jestProjectShape(current);
  check(same(before.general, after.general) && before.shared === after.shared
    && same(before.rows.map(([name]) => name), ["unit", "components", "sqlite-host", "integration"])
    && same(after.rows.map(([name]) => name), ["unit", "components", "native-router", "sqlite-host", "integration"])
    && ["unit", "sqlite-host", "integration"].every(name => same(before.rows.find(row => row[0] === name)[1], after.rows.find(row => row[0] === name)[1])), "runner_project_delta_invalid");
  const previous = before.rows.find(row => row[0] === "components"); const updated = after.rows.find(row => row[0] === "components");
  const withoutIgnores = row => Object.fromEntries(Object.entries(row[1]).filter(([key]) => key !== "testPathIgnorePatterns"));
  const oldIgnores = previous[2].find(([key]) => key === "testPathIgnorePatterns")[1].initializer.elements;
  const newIgnores = updated[2].find(([key]) => key === "testPathIgnorePatterns")[1].initializer.elements;
  check(same(withoutIgnores(previous), withoutIgnores(updated)) && newIgnores.length === oldIgnores.length + 1
    && oldIgnores.every((node, index) => node.getText() === newIgnores[index].getText())
    && newIgnores.at(-1).text === "/app/__tests__/recovery-router-transition\\.test\\.tsx$", "runner_project_delta_invalid");
  const isolated = after.rows.find(row => row[0] === "native-router");
  check(isolated[2].find(([key]) => key === "testMatch")[1].initializer.elements[0].text === "<rootDir>/" + JEST_NATIVE_ROUTER_COMPATIBILITY.moved_test, "runner_project_delta_invalid");
  return true;
}
function compatibleThresholdInputs(item, oldHead, required, hashFile, authority) {
  check(Array.isArray(item.source_inputs) && unique(item.source_inputs.map(x => x.path)) && Array.isArray(item.replacements)
    && same(item.source_inputs.map(x => x.path).sort(), required), "legacy_gate_scope_invalid");
  let compatible = true;
  for (const input of item.source_inputs) {
    check(exact(input, ["path", "sha256", "current_sha256"]) && safePath(input.path), "legacy_gate_scope_invalid");
    const old = authority.readSource(oldHead, input.path); const current = authority.readSource(authority.source.head, input.path);
    check(sha(old) === input.sha256 && sha(current) === input.current_sha256, "legacy_gate_source_invalid");
    if (!old.equals(current) && !executable(old, input.path).equals(executable(current, input.path))) {
      if (input.path === "jest.config.js" && compatibleJestRunner(item, old, current, hashFile)) continue;
      const replacement = item.replacements.find(x => x.id === input.path);
      if (replacement === undefined || input.path === item.id || replacement.kind === "inherited-complete-gate" || !coverageProof(replacement, hashFile, authority)) compatible = false;
    }
  }
  return compatible;
}
function inheritedToolThreshold(item, hashFile, authority) {
  const descriptor = RETAINED_TOOL_THRESHOLDS[item.id];
  check(exact(item, ["kind", "id", "receipt", "source_inputs", "replacements", ...(item.runner_compatibility === undefined ? [] : ["runner_compatibility"])]) && descriptor && same(item.receipt, descriptor.receipt), "tool_threshold_invalid");
  hashFile(item.receipt); const log = hashFile(descriptor.log).toString("utf8");
  const row = log.split("\n").find(line => line.trim().startsWith(path.basename(item.id) + " "));
  const suites = /Test Suites:\s+(\d+) passed, (\d+) total/u.exec(log);
  const tests = /Tests:\s+(\d+) passed, (\d+) total/u.exec(log);
  check(row && row.split("|").slice(1, 5).every(value => Number(value.trim()) === 100)
    && suites && Number(suites[1]) > 0 && suites[1] === suites[2] && tests && Number(tests[1]) > 0 && tests[1] === tests[2]
    && descriptor.tests.every(file => log.includes(file)), "tool_threshold_result_invalid");
  const required = [...new Set([item.id, ...descriptor.tests, ...[descriptor.head, authority.source.head].flatMap(head => [item.id, ...descriptor.tests].flatMap(file => authority.executableClosure(head, file)))])].sort();
  return compatibleThresholdInputs(item, descriptor.head, required, hashFile, authority);
}
function inheritedCompleteGate(item, hashFile, authority) {
  check(exact(item, ["kind", "id", "gate", "source_inputs", "replacements", ...(item.runner_compatibility === undefined ? [] : ["runner_compatibility"])]) && same(item.gate, LEGACY_COMPLETE_GATE.receipt), "legacy_gate_invalid");
  const receipt = parse(hashFile(item.gate));
  const log = hashFile(LEGACY_COMPLETE_GATE.log).toString("utf8"); const raw = parse(hashFile(LEGACY_COMPLETE_GATE.jest));
  check(receipt.source_head === LEGACY_COMPLETE_GATE.head && receipt.source_tree_sha256 === LEGACY_COMPLETE_GATE.tree
    && receipt.status === "passed" && receipt.integrity_files === 166 && receipt.test_suites === 347 && receipt.tests === 5010 && receipt.skipped === 0
    && sha(authority.readSource(LEGACY_COMPLETE_GATE.head, "scripts/run-coverage-gate.mjs")) === LEGACY_COMPLETE_GATE.runner_sha256, "legacy_gate_invalid");
  const terminal = parse(Buffer.from(log.trim().split("\n").at(-1)));
  check(same(terminal, { ok: true, integrity_critical_files: 166, focused: false, metrics: ["statements", "branches", "functions", "lines"], required_percent: 100, changed_line_scope_files: 0 })
    && raw.success === true && raw.numTotalTestSuites === 347 && raw.numTotalTests === 5010 && raw.numPassedTests === 5010
    && raw.numFailedTests === 0 && raw.numPendingTests === 0 && raw.numTodoTests === 0
    && raw.testResults.length === 347 && raw.testResults.every(suite => suite.status === "passed" && suite.assertionResults.every(x => x.status === "passed")), "legacy_gate_result_invalid");
  const registry = authority.legacyRegistry(LEGACY_COMPLETE_GATE.head);
  check(registry.includes(item.id) && Array.isArray(item.source_inputs) && unique(item.source_inputs.map(x => x.path)) && Array.isArray(item.replacements), "legacy_gate_scope_invalid");
  const required = [...new Set([...authority.executableClosure(LEGACY_COMPLETE_GATE.head, item.id), ...authority.executableClosure(authority.source.head, item.id)])].sort();
  return compatibleThresholdInputs(item, LEGACY_COMPLETE_GATE.head, required, hashFile, authority);
}

export const RETAINED_COVERAGE_CONTRACT_BINDING = Object.freeze({ path: "artifacts/native/personal-closeout-20261027/retained-coverage-contracts-v2.json", sha256: "ee5de8e6026727a9656916db37d6d76abdb73fdd39653e9e5c041dd3d7b9807c" });
function retainedContracts(hashFile) { return parse(hashFile(RETAINED_COVERAGE_CONTRACT_BINDING)); }
function successfulNodeTotals(text, total, format) {
  const prefix = format === "node-spec" ? "ℹ" : "#";
  for (const [field, expected] of Object.entries({ tests: total, pass: total, fail: 0, cancelled: 0, skipped: 0, todo: 0 })) {
    const matches = [...text.matchAll(new RegExp(`^${prefix} ${field} (\\d+)$`, "gmu"))];
    check(matches.length === 1 && Number(matches[0][1]) === expected, "retained_node_result_invalid");
  }
  if (format === "node-tap") {
    const cases = [...text.matchAll(/^(ok|not ok) (\d+) - (.+)$/gmu)]; const plan = /^1\.\.(\d+)$/mu.exec(text);
    check(text.startsWith("TAP version 13\n") && plan && Number(plan[1]) === cases.length && cases.length > 0
      && cases.every((value, index) => value[1] === "ok" && Number(value[2]) === index + 1 && !/# (?:SKIP|TODO)/iu.test(value[3])), "retained_node_result_invalid");
  } else check(!/^\s*[✖✗]|^not ok|Bail out!/mu.test(text), "retained_node_result_invalid");
}
function completeCollectedMetrics(raw, modules) {
  const files = raw.files ?? raw;
  check(same(Object.keys(files).sort(), [...modules].sort()) && (raw.files === undefined || Array.isArray(raw.failures) && raw.failures.length === 0), "retained_coverage_scope_invalid");
  return modules.every(id => ["statements", "branches", "functions", "lines"].every(metric => {
    const value = files[id][metric];
    check(object(value) && Number.isSafeInteger(value.total) && value.total >= 0 && value.covered === value.total && value.skipped === 0, "retained_coverage_counters_invalid");
    return value.pct === 100;
  }));
}
function retainedInputScope(item, descriptor, authority, tests = descriptor.tests, additional = []) {
  const scopes = [descriptor.head, authority.source.head].flatMap(head => [item.id, ...tests].flatMap(file => authority.executableClosure(head, file)));
  return [...new Set([item.id, ...tests, ...additional, ...scopes])].sort();
}
/** Assembly aid: immutable inferred source facts, never invented observed snapshots. */
export function personalRetainedCoverageInputScope(item, readBytes, authority) {
  check(object(item) && safePath(item.id) && typeof readBytes === "function" && object(authority)
    && typeof authority.readSource === "function" && typeof authority.executableClosure === "function", "retained_scope_authority_invalid");
  const hashFile = boundReader(readBytes); const contracts = retainedContracts(hashFile);
  const descriptor = item.kind === "sealed-packaging-coverage" ? contracts.packaging : item.kind === "source-owned-jest-threshold" ? contracts.sync101
    : item.kind === "source-owned-complete-node-gate" ? [contracts.node17, contracts.quality108].find(value => same(value.log, item.gate)) : null;
  check(descriptor && descriptor.modules.includes(item.id) && same(item.gate, descriptor.seal ?? descriptor.log), "retained_gate_invalid");
  let tests = descriptor.tests; let additional = [];
  if (item.kind === "sealed-packaging-coverage") {
    const seal = parse(hashFile(descriptor.seal)); tests = seal.tests.files;
    additional = [...seal.source.files, ...seal.source.dependencies].map(value => value.path)
      .concat(path.posix.join(path.posix.dirname(seal.manifest.path), seal.output.filename));
  } else if (item.kind === "source-owned-complete-node-gate") {
    additional = ["scripts/run-coverage-gate.mjs", "scripts/phase20-subprocess-coverage.mjs"];
    if (same(descriptor.log, contracts.node17.log)) tests = descriptor.tests.filter(file => authority.executableClosure(descriptor.head, file).includes(item.id));
  }
  return { source_head: descriptor.head, test_files: tests, module_test_join_ready: tests.length > 0,
    required_inputs: retainedInputScope(item, descriptor, authority, tests, additional) };
}
function retainedNodeGate(item, hashFile, authority) {
  const contracts = retainedContracts(hashFile);
  const descriptor = [contracts.node17, contracts.quality108].find(value => same(value.log, item.gate));
  check(exact(item, ["kind", "id", "gate", "source_inputs", "replacements", ...(item.runner_compatibility === undefined ? [] : ["runner_compatibility"])])
    && descriptor && descriptor.modules.includes(item.id), "retained_gate_invalid");
  check(sha(authority.readSource(descriptor.head, "scripts/run-coverage-gate.mjs")) === descriptor.runner_sha256
    && sha(authority.readSource(descriptor.head, "scripts/phase20-subprocess-coverage.mjs")) === descriptor.collector_sha256, "retained_runner_changed");
  const log = hashFile(descriptor.log).toString("utf8");
  check(log.split("\n").filter(line => line.trim().startsWith("{") && line.trim().endsWith("}")).some(line => same(parse(Buffer.from(line)), descriptor.terminal)), "retained_terminal_invalid");
  check(completeCollectedMetrics(parse(hashFile(descriptor.coverage)), descriptor.modules), "retained_coverage_counters_invalid");
  let tests = descriptor.tests;
  if (same(descriptor.log, contracts.node17.log)) {
    const environment = parse(hashFile(descriptor.environment));
    check(environment.source_head === descriptor.head && environment.native_acceptance === false && environment.node === "v24.19.0", "retained_environment_invalid");
    for (const [file, digest] of Object.entries(environment.source_files)) check(safePath(file) && sha(authority.readSource(descriptor.head, file)) === digest, "retained_environment_changed");
    check(descriptor.projects.length === 7 && descriptor.projects.reduce((n, row) => n + row.tests, 0) === 649 && descriptor.tests.length === 50, "retained_registry_invalid");
    for (const project of descriptor.projects) successfulNodeTotals(hashFile(project.report).toString("utf8"), project.tests, "node-tap");
    tests = descriptor.tests.filter(file => authority.executableClosure(descriptor.head, file).includes(item.id));
    if (tests.length === 0) return false;
  } else {
    hashFile(descriptor.review); successfulNodeTotals(log, descriptor.total, "node-spec");
  }
  const required = retainedInputScope(item, descriptor, authority, tests, ["scripts/run-coverage-gate.mjs", "scripts/phase20-subprocess-coverage.mjs"]);
  return compatibleThresholdInputs(item, descriptor.head, required, hashFile, authority);
}
function retainedJestThreshold(item, hashFile, authority) {
  const descriptor = retainedContracts(hashFile).sync101;
  check(exact(item, ["kind", "id", "gate", "source_inputs", "replacements", ...(item.runner_compatibility === undefined ? [] : ["runner_compatibility"])])
    && same(item.gate, descriptor.log) && descriptor.modules.includes(item.id), "retained_gate_invalid");
  const text = hashFile(descriptor.log).toString("utf8"); const suites = /^Test Suites:\s+(\d+) passed, (\d+) total$/mu.exec(text); const tests = /^Tests:\s+(\d+) passed, (\d+) total$/mu.exec(text);
  check(suites?.[1] === "2" && suites[2] === "2" && Number(tests?.[1]) === descriptor.total && tests[1] === tests[2]
    && descriptor.tests.every(file => text.includes(file)) && descriptor.modules.every(id => {
      const row = text.split("\n").find(line => line.trim().startsWith(path.basename(id) + " "));
      return row && row.split("|").slice(1, 5).every(value => Number(value.trim()) === 100);
    }) && ["Statements", "Branches", "Functions", "Lines"].every(metric => new RegExp(`^${metric}\\s+: 100% \\( (\\d+)/\\1 \\)$`, "mu").test(text)), "retained_jest_result_invalid");
  return compatibleThresholdInputs(item, descriptor.head, retainedInputScope(item, descriptor, authority), hashFile, authority);
}
function sealedPackagingCoverage(item, hashFile, authority) {
  const descriptor = retainedContracts(hashFile).packaging;
  check(exact(item, ["kind", "id", "gate", "source_inputs", "replacements", ...(item.runner_compatibility === undefined ? [] : ["runner_compatibility"])])
    && same(item.gate, descriptor.seal) && descriptor.modules.includes(item.id), "retained_gate_invalid");
  const seal = parse(hashFile(item.gate)); const producer = hashFile(descriptor.producer).toString("utf8"); const inputs = parse(hashFile(descriptor.inputs));
  check(seal.schemaVersion === 1 && seal.proof === "NON_NATIVE_HOST_ONLY" && seal.producer === "real-pinned-android-cffi-cli" && seal.source.head === descriptor.head
    && seal.producerScript.sha256 === descriptor.producer.sha256 && same(inputs.source, seal.source) && inputs.producerSha256 === descriptor.producer.sha256
    && producer.includes('for (const file of [...source.files, ...source.dependencies]) assert.equal')
    && producer.includes('assert.deepEqual(coverage.failures, [], "all four helper metrics must be exactly 100%")'), "sealed_producer_invalid");
  const local = binding => hashFile({ path: path.posix.join(path.posix.dirname(descriptor.seal.path), binding.path), sha256: binding.sha256 });
  check(seal.raw.length === 18 && unique(seal.raw.map(value => value.sha256)) && seal.tests.total === 30 && seal.tests.files.length === 4
    && same(seal.source.files.slice(0, 4).map(value => value.path), descriptor.modules), "sealed_scope_invalid");
  for (const input of [...seal.source.files, ...seal.source.dependencies, ...seal.supervision]) check(safePath(input.path) && sha(authority.readSource(descriptor.head, input.path)) === input.sha256, "sealed_source_changed");
  const manifest = parse(authority.readSource(descriptor.head, seal.manifest.path));
  check(same(inputs.manifest, seal.manifest) && sha(authority.readSource(descriptor.head, seal.manifest.path)) === seal.manifest.sha256
    && same(inputs.inputFiles, manifest.inputs) && same(inputs.toolchain, manifest.toolchain) && same(seal.output, manifest.output), "sealed_inputs_invalid");
  const wheel = path.posix.join(path.posix.dirname(seal.manifest.path), seal.output.filename);
  check(sha(authority.readSource(descriptor.head, wheel)) === seal.output.sha256 && sha(local({ path: "output/" + seal.output.filename, sha256: seal.output.sha256 })) === seal.output.sha256, "sealed_output_invalid");
  const receipt = parse(local(seal.receipt));
  check(receipt.manifestSha256 === seal.manifest.sha256 && same(receipt.output, seal.output) && receipt.native.sha256 === seal.output.backendSha256, "sealed_output_invalid");
  check(same(seal.invocations.map(value => value.kind), ["tests", "cli"]), "sealed_execution_invalid");
  for (const invocation of seal.invocations) {
    check(invocation.exitCode === 0 && invocation.signal === null && invocation.cleanup === "verified-empty", "sealed_execution_invalid");
    assertGarminCliProcessReceipt(parse(local(invocation.processReceipt)), invocation); const stdout = local(invocation.stdout).toString("utf8"); local(invocation.stderr);
    if (invocation.kind === "tests") successfulNodeTotals(stdout, 30, "node-tap"); else check(same(parse(Buffer.from(stdout)), receipt), "sealed_output_invalid");
  }
  const publication = parse(hashFile(descriptor.stdout));
  check(publication.ok === true && publication.descriptorSha256 === descriptor.seal.sha256 && publication.tests === 30 && publication.cleanup === "verified-empty", "sealed_publication_invalid");
  const bytes = authority.readSource(descriptor.head, item.id); const expectedUrl = pathToFileURL(path.join(seal.source.root, item.id)).href; const scripts = [];
  for (const binding of seal.raw) for (const script of parse(local(binding)).result) if (script.url.split(/[?#]/u)[0] === expectedUrl) {
    check(script.functions.every(fn => fn.ranges.every(range => Number.isSafeInteger(range.startOffset) && Number.isSafeInteger(range.endOffset)
      && range.startOffset >= 0 && range.endOffset <= bytes.toString("utf8").length && range.endOffset >= range.startOffset && Number.isSafeInteger(range.count) && range.count >= 0)), "coverage_offsets_invalid"); scripts.push(script);
  }
  check(scripts.length > 0, "coverage_module_not_executed");
  const environment = { ...process.env }; delete environment.NODE_OPTIONS; delete environment.NODE_V8_COVERAGE; delete environment.NODE_TEST_CONTEXT; const root = authority.root ?? process.cwd();
  const recomputed = parse(execFileSync(process.execPath, ["-e", MERGE_V8_SOURCE], { cwd: root, env: environment, input: JSON.stringify({ root, id: item.id, source: bytes.toString("utf8"), scripts }), maxBuffer: 64 * 1024 * 1024, timeout: 120_000 }));
  const summary = istanbul.createCoverageMap(recomputed).fileCoverageFor(path.join(root, item.id)).toSummary().toJSON(); const collected = parse(hashFile(descriptor.coverage));
  check(completeCollectedMetrics(collected, descriptor.modules) && same(Object.fromEntries(["statements", "branches", "functions", "lines"].map(metric => [metric, summary[metric]])), Object.fromEntries(["statements", "branches", "functions", "lines"].map(metric => [metric, (collected.files ?? collected)[item.id][metric]]))), "sealed_coverage_mismatch");
  const required = retainedInputScope(item, { ...descriptor, tests: seal.tests.files }, authority, seal.tests.files, [...seal.source.files, ...seal.source.dependencies].map(value => value.path).concat(wheel));
  return compatibleThresholdInputs(item, descriptor.head, required, hashFile, authority);
}

const MERGE_V8_SOURCE = `const fs = require("node:fs");
const path = require("node:path");
const input = JSON.parse(fs.readFileSync(0, "utf8"));
const requireFromRoot = require("node:module").createRequire(path.join(input.root, "package.json"));
const convert = requireFromRoot("v8-to-istanbul");
const coverage = requireFromRoot("istanbul-lib-coverage").createCoverageMap({});
(async () => {
  for (const script of input.scripts) {
    const converter = convert(path.join(input.root, input.id), 0, { source: input.source });
    await converter.load();
    converter.applyCoverage(script.functions);
    coverage.merge(converter.toIstanbul());
  }
  process.stdout.write(JSON.stringify(coverage.toJSON()));
})().catch(error => { process.stderr.write(String(error.message)); process.exitCode = 1; });`;
function composedCoverage(item, hashFile, authority) {
  check(exact(item, ["kind", "id", "coverage_artifact", "runs"]) && Array.isArray(item.runs) && item.runs.length >= 2
    && unique(item.runs.map(run => run.execution?.path)), "coverage_composition_invalid");
  const scripts = []; const streamHashes = new Set(); const executions = new Set();
  let source;
  for (const run of item.runs) {
    check(exact(run, ["execution", "raw_v8", "source_bindings"]) && Array.isArray(run.raw_v8) && run.raw_v8.length > 0
      && Array.isArray(run.source_bindings), "coverage_composition_invalid");
    const { receipt, executionReportSha } = hostExecution(run.execution, hashFile, authority);
    const actual = parse(hashFile(receipt.actual_execution));
    check(!executions.has(receipt.actual_execution.sha256) && actual.schema_version === 1 && actual.exit_code === 0
      && actual.execution_context_head === receipt.source_head && actual.started_at === receipt.started_at && actual.finished_at === receipt.finished_at
      && same(actual.test_files, receipt.test_files) && same(actual.source_inputs, receipt.source_inputs)
      && actual.report_sha256 === executionReportSha && Array.isArray(actual.changed_inputs) && actual.changed_inputs.length === 0
      && same(receipt.raw_v8, run.raw_v8) && same(receipt.source_bindings, run.source_bindings), "coverage_execution_binding_invalid");
    executions.add(receipt.actual_execution.sha256);
    const testedHead = receipt.tested_source_head ?? receipt.source_head;
    const bytes = authority.readSource(testedHead, item.id);
    check(bytes.equals(authority.readSource(authority.source.head, item.id)) && receipt.source_inputs.some(input => input.path === item.id && input.sha256 === sha(bytes)), "coverage_source_mismatch");
    const binding = run.source_bindings.filter(value => value.id === item.id);
    check(binding.length === 1 && exact(binding[0], ["id", "url", "sha256"]) && binding[0].sha256 === sha(bytes)
      && typeof binding[0].url === "string" && binding[0].url.startsWith("file:"), "coverage_source_binding_invalid");
    const text = bytes.toString("utf8");
    check(!/\/\/[#@]\s*sourceMappingURL=/u.test(text), "coverage_source_map_unsupported");
    source = text;
    let selected = 0;
    for (const descriptor of run.raw_v8) {
      check(!streamHashes.has(descriptor.sha256), "coverage_stream_reused"); streamHashes.add(descriptor.sha256);
      const raw = parse(hashFile(descriptor));
      check(Array.isArray(raw.result), "coverage_raw_v8_invalid");
      for (const script of raw.result.filter(value => value.url === binding[0].url)) {
        check(Array.isArray(script.functions) && script.functions.length > 0 && script.functions.every(fn => Array.isArray(fn.ranges) && fn.ranges.length > 0
          && fn.ranges.every(range => Number.isSafeInteger(range.startOffset) && Number.isSafeInteger(range.endOffset)
            && range.startOffset >= 0 && range.endOffset >= range.startOffset && range.endOffset <= text.length
            && Number.isSafeInteger(range.count) && range.count >= 0))
          && script.functions[0].ranges[0].startOffset === 0 && script.functions[0].ranges[0].endOffset === text.length
          && script.functions[0].ranges[0].count > 0, "coverage_offsets_invalid");
        scripts.push(script); selected += 1;
      }
    }
    check(selected > 0, "coverage_module_not_executed");
  }
  const environment = { ...process.env }; delete environment.NODE_OPTIONS; delete environment.NODE_V8_COVERAGE; delete environment.NODE_TEST_CONTEXT;
  const root = authority.root ?? process.cwd();
  const recomputed = parse(execFileSync(process.execPath, ["-e", MERGE_V8_SOURCE], { cwd: root, env: environment,
    input: JSON.stringify({ root, id: item.id, source, scripts }), maxBuffer: 64 * 1024 * 1024, timeout: 120_000 }));
  const expected = parse(hashFile(item.coverage_artifact)); const target = path.join(root, item.id);
  const matches = Object.keys(expected).filter(key => key === item.id || key.endsWith("/" + item.id));
  check(matches.length === 1 && recomputed[target] && isDeepStrictEqual({ ...expected[matches[0]], path: item.id }, { ...recomputed[target], path: item.id }), "coverage_composition_mismatch");
  const metrics = istanbul.createCoverageMap(recomputed).fileCoverageFor(target).toSummary().toJSON();
  return ["statements", "branches", "functions", "lines"].every(metric => metrics[metric].pct === 100);
}
function coverageProof(item, hashFile, authority) {
  if (item.kind === "source-owned-complete-node-gate") return retainedNodeGate(item, hashFile, authority);
  if (item.kind === "source-owned-jest-threshold") return retainedJestThreshold(item, hashFile, authority);
  if (item.kind === "sealed-packaging-coverage") return sealedPackagingCoverage(item, hashFile, authority);
  if (item.kind === "composed-coverage") return composedCoverage(item, hashFile, authority);
  if (item.kind === "inherited-complete-gate") return inheritedCompleteGate(item, hashFile, authority);
  if (item.kind === "inherited-tool-threshold") return inheritedToolThreshold(item, hashFile, authority);
  const execution = hostExecution(item.execution, hashFile, authority);
  check(same(item.source_inputs, execution.receipt.source_inputs) && item.source_inputs.some(x => x.path === item.id), "coverage_inputs_invalid");
  check(Array.isArray(execution.receipt.coverage_artifacts) && execution.receipt.coverage_artifacts.some(binding => same(binding, item.coverage_artifact)), "coverage_execution_binding_invalid");
  const raw = parse(hashFile(item.coverage_artifact));
  const files = object(raw.files) ? raw.files : raw;
  if (object(raw.files)) check(Array.isArray(raw.failures) && raw.failures.length === 0, "coverage_counters_invalid");
  const matches = Object.keys(files).filter(key => key === item.id || key.endsWith("/" + item.id));
  check(matches.length === 1, "coverage_scope_invalid");
  const data = files[matches[0]];
  if (object(data) && ["statements", "branches", "functions", "lines"].every(metric => object(data[metric]))) {
    const counters = ["statements", "branches", "functions", "lines"].map(metric => data[metric]);
    check(counters.every(metric => Number.isSafeInteger(metric.total) && metric.total >= 0 && Number.isSafeInteger(metric.covered)
      && metric.covered >= 0 && metric.covered <= metric.total && metric.skipped === 0 && Number.isFinite(metric.pct))
      && data.statements.total > 0 && data.lines.total > 0, "coverage_counters_invalid");
    return counters.every(metric => metric.covered === metric.total && metric.pct === 100);
  }
  check(object(data) && object(data.statementMap) && object(data.fnMap) && object(data.branchMap)
    && object(data.s) && object(data.f) && object(data.b) && Object.keys(data.s).length > 0
    && same(Object.keys(data.s).sort(), Object.keys(data.statementMap).sort())
    && same(Object.keys(data.f).sort(), Object.keys(data.fnMap).sort())
    && same(Object.keys(data.b).sort(), Object.keys(data.branchMap).sort()), "coverage_counters_invalid");
  const counters = [...Object.values(data.s), ...Object.values(data.f), ...Object.values(data.b).flat()];
  check(counters.every(x => Number.isSafeInteger(x) && x >= 0)
    && Object.entries(data.b).every(([id, counts]) => Array.isArray(counts) && counts.length === data.branchMap[id].locations.length), "coverage_counters_invalid");
  const summary = istanbul.createCoverageMap({ [matches[0]]: data }).fileCoverageFor(matches[0]).toSummary().toJSON();
  return ["statements", "branches", "functions", "lines"].every(metric => summary[metric].pct === 100);
}
/** Dependency/tool proofs use the same typed consumers without changing the approved208-file set. */
export function validatePersonalCoverageProof(item, readBytes, authority) {
  check(object(item) && safePath(item.id) && typeof readBytes === "function" && object(authority)
    && typeof authority.readSource === "function" && typeof authority.sourceClosure === "function", "coverage_authority_invalid");
  return coverageProof(item, boundReader(readBytes), authority);
}
function boundManifest(binding, hashFile, primary, authority) {
  if (binding === undefined) return primary;
  const manifest = validateV12RunManifest(parse(hashFile(binding)));
  check(manifest.evidence_origin === "native" && same(manifest.source, primary.source)
    && same(manifest.build, primary.build), "supplemental_identity_invalid");
  validateV12ContractSourceIdentity(manifest, authority.contract);
  timestamp(manifest.created_at, authority.now);
  check(authority.verifyNative(manifest) === true, "native_authority_invalid"); return manifest;
}
function reviewedNormalizationBaseline(proof, raw, manifest, hashFile, authority) {
  const bindings = authority.ownerReviewBindings;
  if (!object(proof.review) || !object(bindings) || !Object.hasOwn(bindings, proof.review.sha256)
    || bindings[proof.review.sha256] !== proof.review.path) return false;
  const review = parse(hashFile(proof.review));
  check(exact(review, ["schema_version", "producer", "requirement_id", "metric", "decision", "recorded_at", "run_id", "source_head",
    "source_tree_sha256", "apk_sha256", "device_identity_sha256", "performance_sha256", "baseline_sha256", "baseline_payload_sha256",
    "normalization_samples_sha256", "rss_samples_sha256", "owner_reply"])
    && review.schema_version === 1 && review.producer === "personal-closeout-owner-baseline-review/v1"
    && review.requirement_id === "VER-11" && review.metric === "garmin_sync_normalization"
    && ["acceptable", "rejected"].includes(review.decision), "baseline_review_invalid");
  const garmin = raw.observation.raw_samples.garmin_sync_normalization;
  check(review.run_id === manifest.run_id && review.source_head === manifest.source.head
    && review.source_tree_sha256 === manifest.source.tree_sha256 && review.apk_sha256 === manifest.build.apk.sha256
    && review.device_identity_sha256 === manifest.device.identity_sha256 && review.performance_sha256 === proof.artifact.sha256
    && review.baseline_sha256 === garmin.baseline.artifact_sha256 && review.baseline_sha256 === sha(garmin.baseline.artifact_json)
    && review.baseline_payload_sha256 === garmin.payload_sha256 && review.normalization_samples_sha256 === jsonSha(garmin.normalization_ms)
    && review.rss_samples_sha256 === jsonSha(garmin.peak_rss_bytes), "baseline_review_binding_invalid");
  if (!object(review.owner_reply) || !Object.hasOwn(bindings, review.owner_reply.sha256)
    || bindings[review.owner_reply.sha256] !== review.owner_reply.path) return false;
  const reply = parse(hashFile(review.owner_reply));
  check(exact(reply, ["schema_version", "producer", "role", "text", "decision", "baseline_sha256", "recorded_at"])
    && reply.schema_version === 1 && reply.producer === "personal-closeout-captured-owner-reply/v1" && reply.role === "user"
    && typeof reply.text === "string" && reply.text.trim().length > 0 && reply.decision === review.decision
    && reply.baseline_sha256 === review.baseline_sha256, "baseline_owner_reply_invalid");
  const repliedAt = timestamp(reply.recorded_at, authority.now); const recordedAt = timestamp(review.recorded_at, authority.now);
  check(repliedAt >= timestamp(manifest.created_at, authority.now) && recordedAt >= repliedAt, "baseline_review_time_invalid");
  return review.decision === "acceptable";
}
export function resolvePersonalCloseoutFamily(id, proof, hashFile, manifest, authority) {
  const selector = authority.selectors.find(x => x.row_id === id)?.selector;
  check(selector && object(proof), "requirement_scope_invalid");
  if (proof.kind === "profile-gate") {
    check(["VER-01", "VER-02", "VER-03", "VER-07", "VER-08", "VER-13"].includes(id) && exact(proof, ["kind"]), "requirement_scope_invalid");
    // These gates close only when the independent global profile/UI/critical checks also close.
    return true;
  }
  const raw = parse(hashFile(proof.artifact));
  if (proof.kind === "native-progress") {
    check(selector.type === "progress-contract", "requirement_scope_invalid");
    nativeIdentity(raw, manifest);
    const expected = authority.sqliteRecipe.registries["progress-parity"];
    check(raw.producer === "personal-closeout-native-registry/v1" && raw.registry === "progress-parity"
      && raw.contract.status === "passed" && raw.contract.failed === 0 && raw.contract.skipped === 0
      && raw.contract.total === expected.length && raw.contract.passed === expected.length
      && same(raw.contract.cases.map(x => x.id), expected), "progress_registry_invalid");
    const row = raw.contract.cases.find(x => x.id === selector.id);
    check(row?.requirement === id && object(row.counts) && object(row.hashes) && Object.values(row.hashes).every(HASH.test.bind(HASH)), "progress_case_invalid");
    return resolveV12ProgressContract(selector, () => ({ registry: "progress-parity", id: row.id, result: row.status })).result === "PASS";
  }
  if (proof.kind === "native-shell") {
    check(selector.type === "shell-requirement", "requirement_scope_invalid");
    const phase14 = parse(hashFile(proof.phase14_manifest));
    const receipts = authority.validateShell(raw, phase14, manifest);
    return receipts.find(x => x.requirement_id === id)?.result === "PASS";
  }
  if (proof.kind === "native-calendar") {
    check(selector.type === "calendar-requirement" || id === "VER-09", "requirement_scope_invalid");
    authority.validateOrigin(raw.execution_origin, "calendar");
    const flowSha = sha(authority.readSource(manifest.source.head, "maestro/v1.2/calendar.yaml"));
    const requirementsSha = sha(authority.readSource(manifest.source.head, "maestro/v1.2/calendar-requirements.yaml"));
    const fixtureSha = sha(authority.readSource(manifest.source.head, "src/testing/phase20CalendarFixture.ts"));
    validateV12CalendarShard(raw, flowSha);
    const receipt = raw.native_receipt;
    check(receipt.run_id === manifest.run_id && receipt.native_execution === "EXECUTED" && receipt.source_tree_sha256 === manifest.source.tree_sha256
      && receipt.apk_sha256 === manifest.build.apk.sha256 && receipt.installed_apk_sha256 === manifest.device.installed_apk_sha256
      && receipt.device_identity_sha256 === manifest.device.identity_sha256 && receipt.apk_signature_sha256 === manifest.build.apk.signature_sha256
      && receipt.flow_sha256 === flowSha && receipt.requirements_flow_sha256 === requirementsSha
      && receipt.evidence_set_sha256 === jsonSha({ stages: raw.stages, requirements: raw.requirements,
        artifacts: raw.artifacts.map(({ bytes_base64: _bytes, ...descriptor }) => descriptor) }), "calendar_identity_invalid");
    const record = id === "VER-09" ? raw.requirements.records : raw.requirements.records.filter(x => x.requirement_id === id);
    check(record.length > 0, "calendar_requirement_invalid");
    for (const row of record) for (const probe of row.probe_receipts) validateV12CalendarProbeReceipt(probe, {
      nonce: probe.nonce, flowSha256: requirementsSha, fixtureSourceSha256: fixtureSha,
      requirementId: row.requirement_id, evidenceId: row.evidence_id, probeId: probe.probe_id,
    });
    const stages = id === "VER-09" ? raw.stages : raw.stages.filter(x => selector.stage_ids.includes(x.id));
    return stages.every(x => x.status === "PASS") && record.every(x => x.probe_receipts.every(p => p.status === "PASS"));
  }
  if (proof.kind === "native-garmin") {
    check(selector.type === "garmin-requirement" || id === "VER-10", "requirement_scope_invalid");
    nativeIdentity(raw, manifest); authority.validateOrigin(raw.execution_origin, "garmin");
    check(raw.producer === "personal-closeout-native-garmin/v1" && raw.result.producer === "v12-production-garmin-host/v1"
      && raw.result.execution_origin === "production-attested/v1" && same(raw.result.cases.map(x => x.id), V12_GARMIN_SHARD_CASE_IDS), "garmin_origin_invalid");
    for (const [order, item] of raw.result.cases.entries()) check(item.order === order && ["PASS", "FAIL"].includes(item.status)
      && item.code === `${item.id}-${item.status === "PASS" ? "observed" : "evidence-mismatch"}` && HASH.test(item.receipt_sha256)
      && Number.isSafeInteger(item.count) && item.count >= 0, "garmin_case_invalid");
    const required = id === "VER-10" ? V12_GARMIN_SHARD_CASE_IDS
      : [...V12_GARMIN_REQUIREMENT_REGISTRY[id].domain_case_ids, ...V12_GARMIN_REQUIREMENT_REGISTRY[id].readback_case_ids];
    return required.every(caseId => raw.result.cases.find(x => x.id === caseId)?.status === "PASS")
      && (!required.includes("match-one") || raw.result.cases.find(x => x.id === "match-one").count === 1);
  }
  if (proof.kind === "native-accessibility") {
    check(["VER-04", "VER-05", "VER-06"].includes(id), "requirement_scope_invalid");
    check(raw.run_id === manifest.run_id && raw.producer === "v12-accessibility-native-observation/v2", "accessibility_origin_invalid");
    validateV12AccessibilityProducer(raw.observations, { source_tree_sha256: manifest.source.tree_sha256, fixture_sha256: manifest.fixtures.registry_sha256 }, fail);
    return true;
  }
  if (proof.kind === "native-performance") {
    check(id === "VER-11" && raw.run_id === manifest.run_id && raw.producer === "v12-release-performance-writer/v1", "performance_origin_invalid");
    const identity = { base_head: manifest.source.head, source_tree_sha256: manifest.source.tree_sha256,
      apk_sha256: manifest.build.apk.sha256, installed_apk_sha256: manifest.device.installed_apk_sha256,
      package: manifest.build.package, device_identity_sha256: manifest.device.identity_sha256, fixture_sha256: manifest.fixtures.registry_sha256 };
    const summary = validateV12PerformanceShard(raw.observation, identity);
    return Object.entries(summary.gates).filter(([id]) => id !== "garmin_sync_normalization").every(([, gate]) => gate.result === "PASS")
      && summary.gates.garmin_sync_normalization.result === "REVIEW_REQUIRED" && reviewedNormalizationBaseline(proof, raw, manifest, hashFile, authority);
  }
  check(proof.kind === "native-attended" && id === "VER-12", "requirement_scope_invalid");
  return authority.validateAttended(raw, manifest, hashFile);
}
function requirementProof(row, proof, hashFile, manifest, authority, sqlite) {
  check(object(proof), "requirement_evidence_invalid");
  manifest = boundManifest(proof.native_manifest, hashFile, manifest, authority);
  if (["native-progress", "native-shell", "native-calendar", "native-garmin", "native-accessibility", "native-performance", "native-attended", "profile-gate"].includes(proof.kind)) return resolvePersonalCloseoutFamily(row.id, proof, hashFile, manifest, authority);
  if (proof.kind === "original-row") {
    check(exact(proof, ["kind"]), "requirement_evidence_invalid");
    return authority.originalRow(row.id, manifest)?.result === "PASS";
  }
  if (proof.kind === "host-assertion") {
    check(exact(proof, ["kind", "execution", "test_file", "full_name"]), "requirement_evidence_invalid");
    const { receipt, assertions } = hostExecution(proof.execution, hashFile, authority);
    check(typeof proof.full_name === "string" && assertions.some(x => x.file === proof.test_file && x.name === proof.full_name)
      && authority.hostAssertion(row.id, proof.test_file, proof.full_name, receipt.tested_source_head ?? receipt.source_head) === true, "assertion_mapping_invalid");
    return true;
  }
  check(proof.kind === "native-functional" && exact(proof, ["kind", "shard", "case_id", "mapping", "junit", ...(proof.native_manifest === undefined ? [] : ["native_manifest"])]), "requirement_evidence_invalid");
  const selector = authority.selectors.find(x => x.row_id === row.id)?.selector;
  check(selector && ["dom-contract", "functional-case"].includes(selector.type)
    && proof.shard === selector.shard && proof.case_id === selector.id, "requirement_scope_invalid");
  const mapping = parse(hashFile(proof.mapping)); authority.validateMapping(mapping, manifest, proof.shard);
  const tests = parseV12SourceJUnit(hashFile(proof.junit).toString("utf8"), mapping.case_ids);
  const index = mapping.case_ids.indexOf(selector.id);
  check(index >= 0 && mapping.observations[index]?.report_sha256 === sha([...hashFile(proof.junit).toString("utf8").matchAll(/(?:<\?xml[^?]*\?>)?<testsuite\b[^>]*>[\s\S]*?<\/testsuite>\s*/gu)][index][0]), "functional_report_invalid");
  return tests[index].result === "PASS" && (selector.type !== "dom-contract" || selector.native_case_ids.every(id => sqlite?.has(id)));
}

export function validatePersonalCloseoutEvidence(profile, evidence, readBytes, authority) {
  validatePersonalCloseoutProfile(profile, authority?.requirementIds);
  check(object(authority) && Number.isFinite(authority.now) && HEAD.test(authority.source?.head ?? "")
    && typeof authority.readSource === "function" && typeof authority.sourceClosure === "function"
    && typeof authority.originalRow === "function" && typeof authority.validateMapping === "function"
    && typeof authority.verifyNative === "function" && typeof authority.hostAssertion === "function" && typeof authority.validateFunctional === "function"
    && object(authority.sqliteRecipe) && typeof authority.verifySqliteBinary === "function" && typeof authority.sqliteBinaryPaths === "function" && typeof authority.validateOrigin === "function" && typeof authority.validateAttended === "function" && typeof authority.validateShell === "function" && typeof authority.legacyRegistry === "function" && typeof authority.executableClosure === "function"
    && Array.isArray(authority.registry) && Array.isArray(authority.selectors) && Array.isArray(authority.hostOnly), "authority_required");
  check(exact(evidence, ["schema_version", "profile_id", "profile_sha256", "source_head", "apk_sha256", "apk", "native_manifest", "requirements", "ui", "route_probes", "critical", "integrity"])
    && evidence.schema_version === 2 && evidence.profile_id === profile.profile_id && evidence.profile_sha256 === APPROVED_PERSONAL_PROFILE_SHA256
    && evidence.source_head === authority.source.head && HASH.test(evidence.apk_sha256 ?? "") && typeof readBytes === "function", "evidence_invalid");
  const hashFile = boundReader(readBytes); const manifest = validateV12RunManifest(parse(hashFile(evidence.native_manifest)));
  check(manifest.mode === "live" && manifest.evidence_origin === "native" && same(manifest.source, authority.source)
    && manifest.source.head === evidence.source_head && manifest.build.apk.sha256 === evidence.apk_sha256
    && manifest.device.installed_apk_sha256 === evidence.apk_sha256, "native_identity_invalid");
  validateV12ContractSourceIdentity(manifest, authority.contract);
  timestamp(manifest.created_at, authority.now);
  check(authority.verifyNative(manifest) === true, "native_authority_invalid");
  const apk = hashFile(evidence.apk);
  check(evidence.apk.path === manifest.build.apk.path && apk.length === manifest.build.apk.size_bytes
    && apk.length >= 4 && apk.subarray(0, 4).toString("hex") === "504b0304" && sha(apk) === evidence.apk_sha256, "apk_binding_invalid");
  const missing = []; const uiMissing = [];
  check(object(evidence.critical) && Array.isArray(evidence.critical.sqlite) && Array.isArray(evidence.critical.recovery), "critical_evidence_invalid");
  const sqlite = sqliteProof(evidence.critical, hashFile, manifest, authority); const recovery = recoveryProof(evidence.critical, hashFile, manifest);
  const sqliteIds = new Set(); const recoveryIds = new Set();
  for (const item of evidence.critical.sqlite) {
    check(exact(item, ["id", "case_sha256"]) && profile.critical_native.sqlite_categories.includes(item.id) && !sqliteIds.has(item.id), "critical_evidence_invalid");
    sqliteIds.add(item.id); check(sqlite?.get(item.id) === item.case_sha256, "sqlite_index_invalid");
  }
  const recoveryRequired = V12_RECOVERY_STEPS.flatMap(step => V12_RECOVERY_CUT_IDS.map(cut => `${step.case_id}:${step.id}:${cut}`));
  for (const item of evidence.critical.recovery) {
    check(exact(item, ["id", "receipt_sha256"]) && recoveryRequired.includes(item.id) && !recoveryIds.has(item.id), "critical_evidence_invalid");
    recoveryIds.add(item.id); check(recovery?.get(item.id)?.receipt === item.receipt_sha256, "recovery_index_invalid");
    if (!recovery.get(item.id).passed) missing.push("recovery:" + item.id);
  }
  const sqliteMissing = profile.critical_native.sqlite_categories.filter(id => !sqliteIds.has(id));
  for (const id of recoveryRequired) if (!recoveryIds.has(id)) missing.push("recovery:" + id);
  check(Array.isArray(evidence.requirements) && unique(evidence.requirements.map(row => row.id)), "requirements_invalid");
  for (const row of evidence.requirements) {
    check(exact(row, ["id", "proofs"]) && profile.requirement_ids.includes(row.id) && Array.isArray(row.proofs), "requirement_evidence_invalid");
    const results = row.proofs.map(proof => requirementProof(row, proof, hashFile, manifest, authority, sqlite));
    if (results.length === 0 || !results.every(Boolean)) missing.push(row.id);
  }
  for (const id of profile.requirement_ids) if (!evidence.requirements.some(x => x.id === id)) missing.push(id);
  check(Array.isArray(evidence.ui) && unique(evidence.ui.map(pair)), "ui_invalid");
  for (const item of evidence.ui) {
    check(exact(item, ["state_id", "configuration_id", "capture", "png"]) && profile.required_ui_observations.some(x => pair(x) === pair(item)), "ui_invalid");
    captureProof(item, hashFile, manifest, authority);
  }
  for (const item of profile.required_ui_observations) if (!evidence.ui.some(x => pair(x) === pair(item))) uiMissing.push(pair(item));
  check(Array.isArray(evidence.route_probes) && unique(evidence.route_probes.map(x => x.id)), "route_evidence_invalid");
  for (const item of evidence.route_probes) {
    check(exact(item, ["id", "artifact", ...(item.native_manifest === undefined ? [] : ["native_manifest"])]) && profile.required_route_probes.includes(item.id), "route_evidence_invalid");
    if (!routeProof(item, hashFile, manifest, authority)) missing.push("route:" + item.id);
  }
  for (const id of profile.required_route_probes) if (!evidence.route_probes.some(x => x.id === id)) missing.push("route:" + id);
  check(Array.isArray(evidence.integrity) && unique(evidence.integrity.map(x => x.id)), "integrity_evidence_invalid");
  for (const item of evidence.integrity) {
    check((["inherited-complete-gate", "inherited-tool-threshold", "composed-coverage"].includes(item.kind) || exact(item, ["id", "coverage_artifact", "execution", "source_inputs"])) && profile.critical_integrity_files.includes(item.id), "coverage_scope_invalid");
    if (!coverageProof(item, hashFile, authority)) missing.push("coverage:" + item.id);
  }
  for (const id of profile.critical_integrity_files) if (!evidence.integrity.some(x => x.id === id)) missing.push("coverage:" + id);
  return { schema_version: 2, profile_id: profile.profile_id, status: missing.length || uiMissing.length || sqliteMissing.length ? "NOT_READY" : "PERSONAL_USE_VERIFIED",
    source_head: evidence.source_head, apk_sha256: evidence.apk_sha256, required_ui: 153, completed_ui: evidence.ui.length, deferred_ui: 6695,
    missing_requirements: missing, missing_ui: uiMissing, missing_sqlite: sqliteMissing, completed_recovery: recoveryIds.size, required_recovery: 112,
    exhaustive_matrix_passed: false, release_authorized: false };
}
function rootReader(root) {
  check(!lstatSync(root).isSymbolicLink() && lstatSync(root).isDirectory(), "binding_invalid");
  return relative => {
    check(safePath(relative), "binding_invalid"); let cursor = root;
    for (const part of relative.split("/")) { cursor = path.join(cursor, part); check(!lstatSync(cursor).isSymbolicLink(), "binding_invalid"); }
    check(lstatSync(cursor).isFile(), "binding_invalid"); return readFileSync(cursor);
  };
}
export function collectPersonalCloseoutAuthority(root, readBytes, now = Date.now()) {
  const git = resolveV12GitExecution({ env: {} });
  const devices = process.env.PERSONAL_CLOSEOUT_DEVICE_BINDINGS === undefined ? {} : JSON.parse(process.env.PERSONAL_CLOSEOUT_DEVICE_BINDINGS);
  const ownerReviewBindings = process.env.PERSONAL_CLOSEOUT_OWNER_REVIEW_BINDINGS === undefined ? {} : JSON.parse(process.env.PERSONAL_CLOSEOUT_OWNER_REVIEW_BINDINGS);
  check(object(ownerReviewBindings) && Object.entries(ownerReviewBindings).every(([digest, file]) => HASH.test(digest) && safePath(file)), "owner_review_bindings_invalid");
  check(object(devices) && Object.entries(devices).every(([identity, serial]) => HASH.test(identity) && typeof serial === "string" && /^[A-Za-z0-9._:-]{1,200}$/u.test(serial)), "device_bindings_invalid");
  const command = args => execFileSync(git.executable, args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  const head = command(["rev-parse", "HEAD"]).toString("utf8").trim();
  assertCleanCommittedTree(head, root, { gitExecution: git });
  const inputs = loadV12ContractInputs({ root });
  const effectiveProfile = validatePersonalCloseoutProfile(parse(readBytes(PROFILE_PATH)), inputs.matrix.rows.map(x => x.requirement_id));
  for (const source of effectiveProfile.source_precedence_amendment.authorities) {
    check(safePath(source.path) && sha(readBytes(source.path)) === source.sha256, "source_precedence_invalid");
  }
  const source = { head, tree_sha256: sourceTreeSha256(root, { gitExecution: git }), dirty: false,
    package_json_sha256: sha(readBytes("package.json")), package_lock_sha256: sha(readBytes("package-lock.json")) };
  const readSource = (commit, file) => { check(HEAD.test(commit) && safePath(file), "source_inputs_invalid"); return command(["show", `${commit}:${file}`]); };
  const sourceClosure = (commit, files) => {
    const all = command(["ls-tree", "-r", "--name-only", commit]).toString("utf8").trim().split("\n");
    const selected = new Set(["package.json", "package-lock.json", ...all.filter(file => /^(?:jest[^/]*|tsconfig[^/]*)\.(?:js|json|cjs)$/u.test(file))]);
    const visit = file => {
      if (selected.has(file)) return; selected.add(file);
      const ast = ts.createSourceFile(file, readSource(commit, file).toString("utf8"), ts.ScriptTarget.Latest, true);
      const inspect = node => {
        const dependency = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
          : ts.isCallExpression(node) && /^(?:require|requireActual|import|jest\.requireActual|jest\.mock|require\.resolve)$/u.test(node.expression.getText(ast)) ? node.arguments[0] : undefined;
        if (dependency && ts.isStringLiteral(dependency) && dependency.text.startsWith(".")) {
          const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), dependency.text));
          const resolved = [base, ...[".ts", ".tsx", ".mjs", ".js", ".json", "/index.ts", "/index.tsx", "/index.js"].map(ext => base + ext)].find(x => all.includes(x));
          check(resolved, "source_dependency_invalid"); visit(resolved);
        }
        ts.forEachChild(node, inspect);
      }; inspect(ast);
    };
    files.forEach(visit); return [...selected].sort();
  };
  return { now, source, ownerReviewBindings, contract: v12ContractSourceDigests(root), requirementIds: inputs.matrix.rows.map(x => x.requirement_id),
    registry: parse(readBytes("src/testing/phase20VisualStateRegistry.json")), selectors: createV12RowSelectorTable({ inputs, root }),
    hostOnly: [], readSource, sourceClosure,
    legacyRegistry: commit => readPersonalCoverageRegistry(file => readSource(commit, file)),
    executableClosure: (commit, module) => {
      const all = command(["ls-tree", "-r", "--name-only", commit]).toString("utf8").trim().split("\n");
      const selected = new Set(["package.json", "package-lock.json", ...all.filter(file => /^(?:jest[^/]*|tsconfig[^/]*)\.(?:js|json|cjs)$/u.test(file))]);
      const visit = file => {
        if (selected.has(file)) return; selected.add(file);
        const ast = ts.createSourceFile(file, executable(readSource(commit, file), file).toString("utf8"), ts.ScriptTarget.Latest, true);
        const inspect = node => {
          const dependency = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
            : ts.isCallExpression(node) && /^(?:require|import|jest\.requireActual|jest\.mock|require\.resolve)$/u.test(node.expression.getText(ast)) ? node.arguments[0] : undefined;
          if (dependency && ts.isStringLiteral(dependency) && dependency.text.startsWith(".")) {
            const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), dependency.text));
            const resolved = [base, ...[".ts", ".tsx", ".mjs", ".js", ".json", "/index.ts", "/index.tsx", "/index.js"].map(ext => base + ext)].find(x => all.includes(x));
            check(resolved, "source_dependency_invalid"); visit(resolved);
          }
          ts.forEachChild(node, inspect);
        }; inspect(ast);
      }; visit(module); return [...selected].sort();
    },
    sqliteRecipe: readPersonalSqliteRecipe(file => readBytes(file)),
    hostAssertion: (id, file, name, commit) => {
      const row = inputs.matrix.rows.find(x => x.requirement_id === id);
      if (!row?.planned_tests?.includes(file)) return false;
      const ast = ts.createSourceFile(file, readSource(commit, file).toString("utf8"), ts.ScriptTarget.Latest, true);
      let matched = false;
      const visit = node => {
        if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])
          && /^(?:test|it)(?:\.\w+)*$/u.test(node.expression.getText(ast))
          && (name === node.arguments[0].text || name.endsWith(" " + node.arguments[0].text))) matched = true;
        ts.forEachChild(node, visit);
      };
      visit(ast); return matched;
    },
    sqliteBinaryPaths: (old, current, retainedApk) => {
      const list = (value, transportPath) => {
        const apk = readBytes(transportPath);
        check(sha(apk) === value.build.apk.sha256, "sqlite_binary_invalid");
        return execFileSync("/usr/bin/unzip", ["-Z1", path.join(root, transportPath)], { encoding: "utf8" })
          .trim().split("\n").filter(file => /^lib\/arm64-v8a\/lib[^/]*sqlite[^/]*\.so$/u.test(file)).sort();
      };
      const oldPaths = list(old, retainedApk.path); check(oldPaths.length > 0 && same(oldPaths, list(current, current.build.apk.path)), "sqlite_binary_invalid"); return oldPaths;
    },
    verifySqliteBinary: (_old, current, binary, retainedApk) => {
      const extract = transportPath => execFileSync("/usr/bin/unzip", ["-p", path.join(root, transportPath), binary.archive_path], { maxBuffer: 64 * 1024 * 1024 });
      return sha(extract(retainedApk.path)) === binary.old.sha256 && sha(extract(current.build.apk.path)) === binary.current.sha256;
    },
    root, readArtifact: readBytes,
    validateShell: (raw, phase14, manifest) => createV12ShellRequirementEvidence(raw, phase14, manifest, { root, readArtifact: readBytes }),
    validateOrigin: (origin, shard) => {
      const contract = V12_NATIVE_PROVENANCE_REGISTRY[shard];
      check(contract && origin?.kind === "production-default-launcher" && origin.toolchain_origin === "production-attested/v1"
        && origin.default_launcher === true && origin.test_only === false && contract.actions.includes(origin.action)
        && ["adapter", "launcher", "domain"].every(role => origin[role + "_source_sha256"] === sha(readBytes(contract[role]))), "execution_origin_invalid");
    },
    validateAttended: (raw, manifest, hashFile) => {
      check(raw.schema_version === 2 && raw.suite === "v12-samsung-attended" && raw.mode === "observation-only"
        && raw.release_authorized === false, "attended_invalid");
      timestamp(raw.recorded_at, now);
      const expected = { apk_sha256: manifest.build.apk.sha256, apk_signature_sha256: manifest.build.apk.signature_sha256,
        config_sha256: sha(manifest.configuration.id), device: { device_sha256: manifest.device.identity_sha256, model: "SM-S916B" },
        installed_apk_sha256: manifest.device.installed_apk_sha256, run_id: manifest.run_id, source_tree_sha256: manifest.source.tree_sha256 };
      validateV12AttendedObservations({ identity: raw.identity, rows: raw.rows.map(({ id, status, png, attestation }) => ({ id, status, png, attestation })),
        schema_version: 2, settings_restored: true, suite: "v12-samsung-attended-observations" }, { identity: expected, root });
      for (const row of raw.rows) hashFile({ path: row.png.path, sha256: row.png.sha256 });
      return raw.status === "passed" && raw.rows.every(row => row.status === "passed");
    },
    originalRow: () => null,
    validateFunctional: (receipt, manifest, shard, caseId) => validateV12FunctionalExecutionReceipt(receipt, { manifest, shard, caseId, runId: manifest.run_id }),
    validateMapping: (mapping, manifest, shard) => validateV12DirectMaestroMapping(mapping, { root, manifest, shard }),
    verifyNative: manifest => {
      const previous = process.env.V12_DEVICE_SERIAL; const serial = devices[manifest.device.identity_sha256] ?? previous;
      check(typeof serial === "string", "device_bindings_invalid");
      process.env.V12_DEVICE_SERIAL = serial;
      try { return verifyV12FinalNativeIdentity(manifest, { root, gitExecution: git }); }
      finally { if (previous === undefined) delete process.env.V12_DEVICE_SERIAL; else process.env.V12_DEVICE_SERIAL = previous; }
    },
  };
}
export function personalCloseoutExitCode(result) {
  check(result?.schema_version === 2 && ["NOT_READY", "PERSONAL_USE_VERIFIED"].includes(result.status)
    && result.exhaustive_matrix_passed === false && result.release_authorized === false, "result_invalid");
  return result.status === "PERSONAL_USE_VERIFIED" ? 0 : 1;
}
export function runPersonalCloseoutCli(args, io = process, root = process.cwd()) {
  check(Array.isArray(args) && args.length === 2 && args[0] === "--evidence", "arguments_invalid");
  const readBytes = rootReader(path.resolve(root));
  const evidence = parse(readBytes(args[1]));
  const authority = collectPersonalCloseoutAuthority(path.resolve(root), readBytes);
  const profile = validatePersonalCloseoutProfile(parse(readBytes(PROFILE_PATH)), authority.requirementIds);
  const result = validatePersonalCloseoutEvidence(profile, evidence, readBytes, authority);
  io.stdout.write(JSON.stringify(result) + "\n"); return personalCloseoutExitCode(result);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = runPersonalCloseoutCli(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

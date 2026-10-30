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
function proofInputs(inputs, expectedHead, authority, required, artifactPaths = new Set()) {
  check(Array.isArray(inputs) && inputs.length > 0 && unique(inputs.map(x => x.path))
    && required.every(file => inputs.some(x => x.path === file)), "source_inputs_invalid");
  for (const input of inputs) {
    check(exact(input, ["path", "sha256"]) && safePath(input.path) && HASH.test(input.sha256)
      && (artifactPaths.has(input.path) || sha(authority.readSource(expectedHead, input.path)) === input.sha256), "source_inputs_changed");
  }
}
const ROOT_PRODUCER_CAPABILITIES = new WeakSet();
const VERIFIED_PRODUCER_SCOPES = new WeakSet();
const PRODUCER_ROLES = new Set(["RUNTIME_REQUIRED", "STATIC_RUNTIME_ENTRYPOINT", "CAPTURED_CODE_OR_CONFIG", "OPAQUE_SOURCE_TEXT", "FIXTURE_DATA"]);
const PRODUCER_OPERATIONS = new Set(["static-seed", "static-import-closure", "static-url-entrypoint", "finite-directory-capture", "descriptor-data-read", "opaque-source-text-capture"]);
const PRODUCER_METADATA = new Map([["artifacts/native/v1.2-acceptance/build.json", "retained-host-build-input/v1"], ["artifacts/native/v1.2-acceptance/git-execution-origin.json", "git-execution-origin-input/v1"]]);
const producerHash = value => typeof value === "string" && HASH.test(value);
const producerHead = value => typeof value === "string" && HEAD.test(value);
// Admission witnesses can be emitted by Node or Python. Keep their original
// RFC3339 strings; Date.parse converts fractional precision to epoch milliseconds.
function producerTime(value, now) {
  check(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now, "producer_capture_time_invalid"); return Date.parse(value);
}
function producerNode(value) {
  check(exact(value, ["executable_sha256", "version", ...(value?.content_snapshot === undefined ? [] : ["content_snapshot"])])
    && producerHash(value.executable_sha256) && typeof value.version === "string" && value.version.length > 0, "producer_capture_vector_invalid");
  if (value.content_snapshot !== undefined) producerBinding(value.content_snapshot);
  return { executable_sha256: value.executable_sha256, version: value.version };
}
function producerPath(value) {
  check(safePath(value) && !value.split("/").some(part => part === ".coverage" || part === "untitled-2.md"), "producer_capture_path_invalid"); return value;
}
function producerBinding(value) {
  check(exact(value, ["path", "sha256"]) && producerHash(value.sha256), "producer_capture_binding_invalid"); producerPath(value.path); return value;
}
function producerFreeze(value, visited = new WeakSet()) {
  if (value && typeof value === "object" && !visited.has(value)) { visited.add(value); for (const child of Object.values(value)) producerFreeze(child, visited); Object.freeze(value); }
  return value;
}
function producerSnapshot(value) { try { return producerFreeze(structuredClone(value)); } catch { fail("producer_capture_value_invalid"); } }
function producerRead(binding, readBytes, root) {
  producerBinding(binding);
  let cursor = path.resolve(root);
  try {
    check(!lstatSync(cursor).isSymbolicLink() && lstatSync(cursor).isDirectory(), "producer_capture_path_invalid");
    for (const part of binding.path.split("/")) { cursor = path.join(cursor, part); const stat = lstatSync(cursor); check(!stat.isSymbolicLink(), "producer_capture_path_invalid"); }
    check(lstatSync(cursor).isFile(), "producer_capture_path_invalid");
  } catch { fail("producer_capture_path_invalid"); }
  const bytes = Buffer.from(readBytes(binding.path)); check(sha(bytes) === binding.sha256, "producer_capture_binding_changed"); return bytes;
}
function producerNestedBindings(value, visited = new WeakSet()) {
  if (!value || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);
  if (Object.hasOwn(value, "path") && Object.hasOwn(value, "sha256")) producerBinding({ path: value.path, sha256: value.sha256 });
  for (const child of Object.values(value)) if (child && typeof child === "object") producerNestedBindings(child, visited);
}
function producerTupleVector(value) {
  check(Array.isArray(value) && value.length > 0 && unique(value.map(row => row?.path)), "producer_capture_vector_invalid");
  for (const row of value) producerBinding(row);
}
function producerPolicyInputs(policy, capsule, options, requiredRuntime) {
  check(exact(policy, ["schema_version", "kind", "producer_code", "observer_code", "operations", "coverage_only", "native_acceptance", "outside_file_overrides"])
    && policy.schema_version === 1 && policy.kind === "producer-capture-policy/v1" && policy.coverage_only === true && policy.native_acceptance === false
    && policy.outside_file_overrides === false && Array.isArray(policy.producer_code) && Array.isArray(policy.observer_code)
    && Array.isArray(policy.operations) && policy.operations.length > 0 && unique(policy.operations.map(value => value?.id)), "producer_capture_policy_invalid");
  const code = [...policy.producer_code, ...policy.observer_code]; producerTupleVector(policy.producer_code);
  check(Array.isArray(policy.observer_code), "producer_capture_policy_invalid"); for (const binding of code) producerBinding(binding);
  const bytesByPath = new Map();
  for (const binding of code) { const bytes = options.readSource(capsule.tested_source_head, binding.path); check(Buffer.isBuffer(bytes) && sha(bytes) === binding.sha256, "producer_capture_source_changed"); bytesByPath.set(binding.path, bytes); }
  const full = capsule.source_inputs.map(value => value.path); const operations = new Map();
  for (const operation of policy.operations) {
    check(exact(operation, ["id", "kind", "producer_path", "node_start", "node_end", "node_sha256", "roots", "opaque_import_descendants"])
      && typeof operation.id === "string" && operation.id.length > 0 && PRODUCER_OPERATIONS.has(operation.kind)
      && bytesByPath.has(operation.producer_path) && Number.isSafeInteger(operation.node_start) && Number.isSafeInteger(operation.node_end)
      && operation.node_start >= 0 && operation.node_end > operation.node_start && producerHash(operation.node_sha256)
      && Array.isArray(operation.roots) && operation.roots.length > 0 && unique(operation.roots) && typeof operation.opaque_import_descendants === "boolean", "producer_capture_operation_invalid");
    operation.roots.forEach(producerPath);
    const text = bytesByPath.get(operation.producer_path).toString("utf8"); const ast = ts.createSourceFile(operation.producer_path, text, ts.ScriptTarget.Latest, true);
    check(ast.parseDiagnostics.length === 0 && operation.node_end <= text.length && sha(text.slice(operation.node_start, operation.node_end)) === operation.node_sha256, "producer_capture_ast_invalid");
    let node; const find = candidate => { if (candidate.getStart(ast) === operation.node_start && candidate.end === operation.node_end) node = candidate; ts.forEachChild(candidate, find); }; find(ast);
    check(node && (ts.isVariableDeclaration(node) || ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isArrayLiteralExpression(node) || ts.isExpressionStatement(node) || ts.isFunctionDeclaration(node)), "producer_capture_ast_invalid");
    const literals = new Set(); const inspect = value => { if (ts.isStringLiteral(value)) literals.add(value.text); ts.forEachChild(value, inspect); }; inspect(node);
    const allowed = new Set();
    for (const root of operation.roots) {
      // The ROOT-pinned policy names finite captured manifests/roots. A reviewed
      // descriptor-read expression may obtain roots from its registered vector;
      // literal seeds/directory roots must occur in the exact approved AST node.
      check(operation.kind === "descriptor-data-read" || operation.kind === "opaque-source-text-capture" || literals.has(root)
        || [...literals].some(value => value.startsWith(".") && path.posix.normalize(path.posix.join(path.posix.dirname(operation.producer_path), value)) === root)
        || root === operation.producer_path, "producer_capture_operation_invalid");
      if (operation.kind === "finite-directory-capture") {
        const capturedFiles = full.filter(value => value.startsWith(root + "/"));
        check(capturedFiles.length > 0 && operation.opaque_import_descendants === true, "producer_capture_operation_invalid");
        for (const file of capturedFiles) allowed.add(file);
      } else {
        check(full.includes(root) || bytesByPath.has(root), "producer_capture_operation_invalid"); allowed.add(root);
        if (operation.kind === "static-import-closure" || operation.kind === "static-url-entrypoint" || operation.opaque_import_descendants && operation.kind !== "opaque-source-text-capture") {
          for (const file of options.sourceClosure(capsule.tested_source_head, [root])) allowed.add(file);
        }
      }
    }
    if (operation.kind === "opaque-source-text-capture" && operation.opaque_import_descendants) {
      // Conservative producer parsing may capture literal fixture data beside
      // imports. This remains capture provenance, never runtime expansion.
      const pending = [...allowed]; const inspected = new Set();
      while (pending.length > 0) {
        const file = pending.pop(); if (inspected.has(file) || !full.includes(file)) continue; inspected.add(file);
        const content = options.readSource(capsule.tested_source_head, file).toString("utf8");
        const add = candidate => { if (full.includes(candidate) && !allowed.has(candidate)) { allowed.add(candidate); pending.push(candidate); } };
        for (const match of content.matchAll(/(["'])([^"'\r\n]+)\1/gu)) {
          for (const candidate of [match[2], path.posix.normalize(path.posix.join(path.posix.dirname(file), match[2]))]) add(candidate);
        }
        if (/\.[cm]?[jt]sx?$/u.test(file)) {
          const capturedAst = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
          const inspectCaptured = node => {
            const reference = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
              : ts.isCallExpression(node) && /^(?:require|import|jest\.requireActual|jest\.mock|require\.resolve)$/u.test(node.expression.getText(capturedAst)) ? node.arguments[0]
                : ts.isNewExpression(node) && node.expression.getText(capturedAst) === "URL" ? node.arguments?.[0] : undefined;
            if (reference && ts.isStringLiteral(reference) && reference.text.startsWith(".")) {
              const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), reference.text));
              const extensions = [".ts", ".tsx", ".mjs", ".js", ".jsx", ".cjs", ".json", ".native.ts", ".native.tsx", ".ios.ts", ".android.ts"];
              for (const candidate of [base, ...extensions.map(ext => base + ext), ...extensions.map(ext => path.posix.join(base, "index" + ext))]) add(candidate);
              if (ts.isNewExpression(node)) for (const candidate of full.filter(value => value.startsWith(base.replace(/\/$/u, "") + "/"))) add(candidate);
            }
            ts.forEachChild(node, inspectCaptured);
          }; inspectCaptured(capturedAst);
        }
      }
    }
    if (operation.kind === "static-url-entrypoint") check(operation.opaque_import_descendants === false && [...allowed].every(file => requiredRuntime.includes(file) || capsule.roles.some(row => row.path === file && row.role === "STATIC_RUNTIME_ENTRYPOINT")), "producer_capture_runtime_invalid");
    operations.set(operation.id, { operation, allowed });
  }
  return { code, operations };
}
function producerMetadataPaths(capsule, beforeInputs, afterInputs, readBound) {
  check(Array.isArray(capsule.metadata_data) && capsule.metadata_data.length <= 2 && unique(capsule.metadata_data.map(value => value.original_path)), "producer_capture_metadata_invalid");
  const paths = new Set();
  for (const item of capsule.metadata_data) {
    check(exact(item, ["original_path", "sha256", "snapshot", "schema"]) && PRODUCER_METADATA.get(item.original_path) === item.schema && producerHash(item.sha256)
      && item.snapshot.sha256 === item.sha256 && beforeInputs.some(input => input.path === item.original_path && input.sha256 === item.sha256)
      && afterInputs.some(input => input.path === item.original_path && input.sha256 === item.sha256), "producer_capture_metadata_invalid");
    const raw = parse(readBound(item.snapshot));
    if (item.schema === "git-execution-origin-input/v1") check(exact(raw, ["schema_version", "action", "execution_origin", "test_only", "tools"])
      && raw.schema_version === 1 && typeof raw.action === "string" && raw.action.length > 0 && typeof raw.execution_origin === "string" && typeof raw.test_only === "boolean"
      && Array.isArray(raw.tools) && raw.tools.length > 0 && unique(raw.tools.map(value => value.name))
      && raw.tools.every(value => exact(value, ["name", "executable_realpath_sha256", "executable_sha256", "version"]) && typeof value.name === "string"
        && producerHash(value.executable_realpath_sha256) && producerHash(value.executable_sha256) && typeof value.version === "string"), "producer_capture_metadata_invalid");
    else check(exact(raw, ["schema_version", "suite", "profile", "build_variant", "js_bundle", "base_head", "source_tree_sha256", "package", "apk", "installed_apk", "package_launch", "device", "toolchain", "started_at", "finished_at", "v12_evidence_identity"])
      && raw.schema_version === 1 && raw.suite === "v1.2-acceptance" && raw.profile === "development-test" && typeof raw.build_variant === "string"
      && exact(raw.js_bundle, ["embedded"]) && raw.js_bundle.embedded === true && producerHead(raw.base_head) && producerHash(raw.source_tree_sha256)
      && typeof raw.package === "string" && raw.package.length > 0 && object(raw.apk) && safePath(raw.apk.path) && producerHash(raw.apk.sha256)
      && Number.isSafeInteger(raw.apk.size_bytes) && raw.apk.size_bytes > 0 && object(raw.installed_apk) && raw.installed_apk.sha256 === raw.apk.sha256
      && object(raw.package_launch) && typeof raw.package_launch.component === "string" && typeof raw.package_launch.succeeded === "boolean"
      && object(raw.device) && producerHash(raw.device.identity_sha256) && object(raw.toolchain) && object(raw.v12_evidence_identity)
      && typeof raw.started_at === "string" && typeof raw.finished_at === "string", "producer_capture_metadata_invalid");
    paths.add(item.original_path);
  }
  return paths;
}
function validateRegisteredProducerScope(capsule, admission, receipt, context, options, readBound) {
  const keys = ["schema_version", "kind", "invocation_id", "policy", "source_head", "tested_source_head", "coverage_only", "native_acceptance", "test_files", "source_inputs", "roles", "raw_v8", "producer_sources", "metadata_data", "original_before", "original_after", "original_actual_execution", "original_report", "outer_before", "outer_after", "child_before", "child_after", "node_before", "node_after"];
  check(exact(capsule, keys) && capsule.schema_version === 1 && capsule.kind === "producer-capture-scope/v1" && capsule.coverage_only === true && capsule.native_acceptance === false
    && receipt.coverage_only === true && receipt.native_acceptance === false && receipt.input_scope === undefined
    && producerHead(capsule.source_head) && producerHead(capsule.tested_source_head), "producer_capture_scope_invalid");
  producerNestedBindings(capsule); producerTupleVector(capsule.source_inputs);
  producerTupleVector(capsule.raw_v8);
  check(capsule.invocation_id === admission.invocation_id && capsule.tested_source_head === admission.tested_source_head && capsule.tested_source_head === context.testedHead
    && capsule.source_head === receipt.source_head && capsule.source_head !== undefined && same(capsule.policy, admission.policy)
    && same(capsule.source_inputs, receipt.source_inputs) && jsonSha(capsule.source_inputs) === admission.source_inputs_sha256
    && same(capsule.test_files, receipt.test_files) && same(capsule.raw_v8, receipt.raw_v8) && same(capsule.original_report, receipt.report), "producer_capture_admission_invalid");
  for (const key of ["original_actual_execution", "outer_before", "outer_after", "child_before", "child_after"]) check(same(capsule[key], admission[key]), "producer_capture_admission_invalid");
  const policy = producerSnapshot(parse(readBound(capsule.policy)));
  const before = producerSnapshot(parse(readBound(capsule.original_before))); const after = producerSnapshot(parse(readBound(capsule.original_after)));
  const original = producerSnapshot(parse(readBound(capsule.original_actual_execution)));
  const outerBefore = producerSnapshot(parse(readBound(capsule.outer_before))); const outerAfter = producerSnapshot(parse(readBound(capsule.outer_after)));
  const childBefore = producerSnapshot(parse(readBound(capsule.child_before))); const childAfter = producerSnapshot(parse(readBound(capsule.child_after)));
  const nodeBefore = producerSnapshot(parse(readBound(capsule.node_before))); const nodeAfter = producerSnapshot(parse(readBound(capsule.node_after)));
  producerNestedBindings(before); producerNestedBindings(after);
  check(same(before.source_inputs, capsule.source_inputs) && same(after.source_inputs, capsule.source_inputs)
    && object(before.environment) && Array.isArray(before.installed_dependencies) && same(before.environment, after.environment) && same(before.installed_dependencies, after.installed_dependencies)
    && same(nodeBefore, nodeAfter) && same(producerNode(nodeBefore), producerNode(nodeAfter)), "producer_capture_vector_invalid");
  if (nodeBefore.content_snapshot !== undefined) check(sha(readBound(nodeBefore.content_snapshot)) === nodeBefore.executable_sha256, "producer_capture_vector_invalid");
  const actual = parse(readBound(receipt.actual_execution));
  check(original.pid === actual.pid && original.pid === childBefore.pid && original.pid === childAfter.pid && Number.isSafeInteger(original.pid) && original.pid > 0
    && original.cwd === options.root && childBefore.cwd === options.root && childAfter.cwd === options.root
    && same(original.argv, actual.argv) && same(original.argv, childBefore.argv) && same(original.argv, childAfter.argv)
    && same(original.test_files, receipt.test_files) && original.started_at === receipt.started_at && original.finished_at === receipt.finished_at
    && original.exit_code === 0 && original.signal === null && childAfter.exit_code === 0 && childAfter.signal === null
    && original.report_sha256 === context.reportSha && same(original.raw_v8, receipt.raw_v8), "producer_capture_child_invalid");
  check(Number.isSafeInteger(outerBefore.pid) && outerBefore.pid > 0 && outerBefore.pid === outerAfter.pid && original.parent_pid === outerBefore.pid
    && outerBefore.cwd === options.root && outerAfter.cwd === options.root && same(outerBefore.argv, outerAfter.argv)
    && Array.isArray(outerBefore.source_inputs) && same(outerBefore.source_inputs, outerAfter.source_inputs)
    && same(producerNode(outerBefore.node), producerNode(nodeBefore)) && same(producerNode(outerAfter.node), producerNode(nodeAfter)) && outerAfter.exit_code === 0 && outerAfter.signal === null
    && producerTime(outerBefore.recorded_at, options.now) <= context.start && producerTime(outerAfter.recorded_at, options.now) >= context.end
    && producerTime(before.recorded_at, options.now) <= context.start && producerTime(after.recorded_at, options.now) >= context.end
    && (producerTime(childBefore.recorded_at, options.now) <= context.start || childBefore.started_at === receipt.started_at
      && producerTime(childBefore.recorded_at, options.now) <= context.end) && producerTime(childAfter.recorded_at, options.now) >= context.end
    && producerTime(admission.registered_at, options.now) >= context.end, "producer_capture_parent_invalid");
  check(Array.isArray(capsule.roles) && capsule.roles.length === capsule.source_inputs.length && unique(capsule.roles.map(value => value.path))
    && capsule.roles.every((row, index) => exact(row, ["path", "sha256", "role", "operation_id", "content_snapshot"]) && row.path === capsule.source_inputs[index].path
      && row.sha256 === capsule.source_inputs[index].sha256 && PRODUCER_ROLES.has(row.role)), "producer_capture_roles_invalid");
  const { code, operations } = producerPolicyInputs(policy, capsule, options, context.requiredRuntime);
  check(Array.isArray(outerBefore.argv) && outerBefore.argv.every(value => typeof value === "string")
    && code.some(binding => outerBefore.argv.some(value => path.resolve(options.root, value) === path.resolve(options.root, binding.path))), "producer_capture_parent_invalid");
  check(code.every(binding => outerBefore.source_inputs.some(value => same(value, binding))), "producer_capture_source_changed");
  check(Array.isArray(capsule.producer_sources) && unique(capsule.producer_sources.map(value => value.path)) && code.every(binding => capsule.producer_sources.some(row => row.path === binding.path && row.sha256 === binding.sha256)), "producer_capture_source_changed");
  for (const row of capsule.producer_sources) check(exact(row, ["path", "sha256", "content_snapshot"]) && readBound(row.content_snapshot).equals(options.readSource(context.testedHead, row.path)) && row.content_snapshot.sha256 === row.sha256, "producer_capture_source_changed");
  const metadataPaths = producerMetadataPaths(capsule, before.source_inputs, after.source_inputs, readBound);
  for (const row of capsule.roles) {
    const operation = operations.get(row.operation_id);
    check(operation && operation.allowed.has(row.path), "producer_capture_unaccounted_input");
    check(context.requiredRuntime.includes(row.path) ? row.role === "RUNTIME_REQUIRED" : row.role !== "RUNTIME_REQUIRED", "producer_capture_runtime_invalid");
    check(row.role !== "STATIC_RUNTIME_ENTRYPOINT" || operation.operation.kind === "static-url-entrypoint", "producer_capture_runtime_invalid");
    const bytes = readBound(row.content_snapshot); check(sha(bytes) === row.sha256, "producer_capture_source_changed");
    if (metadataPaths.has(row.path)) check(row.role === "FIXTURE_DATA", "producer_capture_metadata_invalid");
    else check(bytes.equals(options.readSource(context.testedHead, row.path)), "producer_capture_source_changed");
  }
  readBound(capsule.original_report);
  const result = producerFreeze({ binding: admission.capsule, invocation_id: capsule.invocation_id, source_inputs: capsule.source_inputs, required_runtime: [...context.requiredRuntime], roles: capsule.roles, metadata_paths: [...metadataPaths], physical_raw_bindings: capsule.raw_v8 });
  VERIFIED_PRODUCER_SCOPES.add(result); return result;
}
/** The operator-selected exact index/hash is the trust boundary; receipts cannot select or extend it. */
export function createRootProducerCaptureCapability(indexBinding, { readBytes, readSource, sourceClosure, root = process.cwd(), now = Date.now() }) {
  const options = { readBytes, readSource, sourceClosure, root: path.resolve(root), now };
  check(typeof readBytes === "function" && typeof readSource === "function" && typeof sourceClosure === "function", "producer_capture_authority_invalid");
  const index = producerSnapshot(parse(producerRead(producerSnapshot(indexBinding), readBytes, options.root)));
  check(exact(index, ["schema_version", "kind", "admissions", "native_authority"]) && index.schema_version === 1
    && index.kind === "personal-closeout-root-producer-admissions/v1" && index.native_authority === false && Array.isArray(index.admissions)
    && index.admissions.length > 0 && unique(index.admissions.map(value => value.capsule?.path)), "producer_capture_index_invalid");
  producerNestedBindings(index);
  const registry = new Map();
  for (const entry of index.admissions) {
    check(exact(entry, ["capsule", "policy", "invocation_id", "registered_at", "tested_source_head", "original_actual_execution", "outer_before", "outer_after", "child_before", "child_after", "source_inputs_sha256"])
      && producerHead(entry.tested_source_head) && producerHash(entry.source_inputs_sha256) && typeof entry.invocation_id === "string" && entry.invocation_id.length > 0, "producer_capture_index_invalid");
    producerTime(entry.registered_at, now); registry.set(entry.capsule.path + ":" + entry.capsule.sha256, entry);
  }
  const readBound = binding => producerRead(binding, readBytes, options.root);
  const verify = (binding, receipt, context) => {
    try {
      const frozenBinding = producerSnapshot(binding); producerBinding(frozenBinding);
      const admission = registry.get(frozenBinding.path + ":" + frozenBinding.sha256); check(admission, "producer_capture_unregistered");
      const capsule = producerSnapshot(parse(readBound(frozenBinding)));
      return validateRegisteredProducerScope(capsule, admission, producerSnapshot(receipt), producerSnapshot(context), options, readBound);
    } catch (error) { if (typeof error?.message === "string" && error.message.startsWith("personal_closeout_")) throw error; fail("producer_capture_value_invalid"); }
  };
  ROOT_PRODUCER_CAPABILITIES.add(verify); return verify;
}
export const QUALITY107_INPUT_SCOPE_CAPSULE = Object.freeze({ path: "artifacts/native/personal-closeout-20261027/quality-consumer-adapter/quality107-input-scope-capsule-03.json", sha256: "bb973cea9f04622f2027b1476a356123d9f5a0105e4121940d50de9d96b9760b" });
function quality107Graph(rows, hashFile) {
  const files = rows.map(row => row.path); const edges = [];
  for (const row of rows.filter(value => /\.[cm]?[jt]sx?$/u.test(value.path))) {
    const ast = ts.createSourceFile(row.path, hashFile({ path: row.snapshot, sha256: row.sha256 }).toString("utf8"), ts.ScriptTarget.Latest, true);
    const visit = node => {
      let dependency;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) dependency = node.moduleSpecifier;
      else if (ts.isCallExpression(node) && /^(?:require|import)$/u.test(node.expression.getText(ast))) dependency = node.arguments[0];
      else if (ts.isNewExpression(node) && node.expression.getText(ast) === "URL") dependency = node.arguments[0];
      if (dependency && ts.isStringLiteral(dependency) && dependency.text.startsWith(".")) {
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(row.path), dependency.text)).replace(/\/$/u, "");
        const directory = base === "." || files.some(file => file.startsWith(base + "/"));
        if (ts.isNewExpression(node) && directory) edges.push([row.path, dependency.text, base === "." ? "/" : base + "/"]);
        else {
          const resolved = [base, ...[".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"].map(ext => base + ext), path.posix.join(base, "index.ts")].find(file => files.includes(file));
          check(resolved, "quality107_source_scope_invalid"); edges.push([row.path, dependency.text, resolved]);
        }
      }
      ts.forEachChild(node, visit);
    }; visit(ast);
  }
  return edges;
}
function quality107Closure(seeds, edges, directoryInputs = []) {
  const pending = [...seeds]; const selected = new Set();
  while (pending.length > 0) {
    const file = pending.pop();
    if (selected.has(file)) continue;
    selected.add(file);
    for (const edge of edges.filter(value => value[0] === file)) {
      if (!edge[2].endsWith("/")) pending.push(edge[2]);
      else if (edge[1].includes("maestro-safe-sdk")) pending.push(...directoryInputs.filter(value => value.startsWith(edge[2])));
    }
  }
  return [...selected].sort();
}
function quality107ProducerSeeds(capsule, hashFile, execution) {
  const ast = ts.createSourceFile("quality107-producer.mjs", hashFile(capsule.original_producer).toString("utf8"), ts.ScriptTarget.Latest, true);
  const declarations = new Map();
  const visit = node => { if (ts.isVariableDeclaration(node)) declarations.set(node.name.getText(ast), node.initializer); ts.forEachChild(node, visit); }; visit(ast);
  const pending = declarations.get("pending"); const fixtures = declarations.get("fixtures");
  check(ts.isArrayLiteralExpression(pending) && ts.isArrayLiteralExpression(fixtures), "quality107_source_scope_invalid");
  const producer = capsule.role_partition.find(value => value.original.sha256 === capsule.original_producer.sha256).original.path;
  const seeds = pending.elements.flatMap(node => {
    if (ts.isStringLiteral(node)) return node.text === "/tmp/gym-closeout-tool-binding.json" ? capsule.external_original_key : node.text;
    if (ts.isSpreadElement(node)) return node.expression.getText(ast) === "tests" ? execution.argv.slice(4) : [capsule.subject.path];
    check(node.getText(ast) === "fileURLToPath(import.meta.url)", "quality107_source_scope_invalid"); return producer;
  });
  seeds.push(...fixtures.elements.map(node => node.text), ...capsule.role_partition.filter(value => value.original.path.startsWith(".planning/design/v1.2-browser-evidence/")).map(value => value.original.path));
  check(same(seeds, capsule.producer_seed_inputs.map(value => value.file)), "quality107_source_scope_invalid");
  return seeds;
}
function quality107Witnesses(capsule, hashFile, authority, execution) {
  const witnesses = hashFile(capsule.witnesses).toString("utf8").trim().split("\n").map(value => JSON.parse(value));
  const created = new Map(); const pairs = new Map(); const copied = new Set();
  const inputMap = new Map(capsule.role_partition.map(value => [value.original.path, value.original]));
  for (const witness of witnesses) {
    check(witness.native_acceptance_proof === false, "quality107_native_authority_invalid");
    if (witness.kind === "controlled-copy-created") {
      created.set(witness.root, witness);
      for (const input of witness.source_digest_inputs) {
        const relative = path.posix.relative(witness.root, input.path); const original = inputMap.get(relative);
        if (original?.sha256 === input.sha256) copied.add(relative);
      }
    } else if (witness.kind === "child-before") pairs.set(witness.test_process_pid + ":" + witness.id, { before: witness });
    else if (witness.kind === "child-after") {
      const matching = [...pairs.values()].filter(pair => pair.before.id === witness.id && pair.before.root === witness.root && pair.after === undefined);
      check(matching.length === 1, "quality107_pid_binding_invalid"); matching[0].after = witness;
    } else check(witness.kind === "controlled-copy-closed" && same(witness.subjects, created.get(witness.root).subjects), "quality107_copy_binding_invalid");
  }
  check(created.size === 106 && pairs.size === 117 && copied.size === 128, "quality107_copy_binding_invalid");
  for (const pair of pairs.values()) {
    const before = pair.before; const after = pair.after;
    check(same(before.subjects, after.subjects) && before.node.sha256 === capsule.node.sha256
      && timestamp(before.started_at, authority.now) >= Date.parse(execution.started_at)
      && timestamp(after.finished_at, authority.now) <= Date.parse(execution.finished_at)
      && Date.parse(after.finished_at) >= Date.parse(before.started_at), "quality107_copy_binding_invalid");
  }
  const bindings = parse(hashFile(capsule.raw_bindings)); const excluded = parse(hashFile(capsule.exclusions));
  check(same(bindings.bindings, capsule.raw_workspace_subject_bindings) && bindings.native_acceptance === false
    && excluded.excluded_from_metrics === true && excluded.contribution === 0 && excluded.records.length === 3
    && same(bindings.rejected, excluded.records), "quality107_raw_binding_invalid");
  const workers = [...new Set([...pairs.values()].map(pair => pair.before.test_process_pid))].sort((a, b) => a - b);
  check(same(workers, capsule.captured_test_worker_pids), "quality107_pid_binding_invalid");
  for (const binding of bindings.bindings) {
    const pair = pairs.get(binding.invocation_key);
    if (binding.invocation_key === null) check(binding.pid === binding.test_process_pid && workers.includes(binding.pid), "quality107_pid_binding_invalid");
    else check(pair.before.root === binding.root && pair.before.test_process_pid === binding.test_process_pid && pair.before.id === binding.invocation
      && pair.after.child_pid === binding.pid && pair.after.raw.some(value => value.path === path.posix.join(capsule.raw_workspace_subject_bindings[0].root, binding.raw.path) && value.sha256 === binding.raw.sha256), "quality107_pid_binding_invalid");
    check(binding.url === capsule.raw_workspace_subject_url && binding.type === "workspace-source"
      && path.posix.basename(binding.raw.path).startsWith("coverage-" + binding.pid + "-"), "quality107_raw_binding_invalid");
  }
  return { bindings, excluded, copied };
}
function quality107InputScope(receipt, hashFile, authority) {
  if (receipt.input_scope === undefined) return null;
  check(exact(receipt.input_scope, ["kind", "capsule"]) && receipt.input_scope.kind === "quality107-captured-producer-inputs/v1"
    && same(receipt.input_scope.capsule, QUALITY107_INPUT_SCOPE_CAPSULE), "quality107_input_scope_invalid");
  const capsule = parse(hashFile(receipt.input_scope.capsule));
  const snapshot = parse(hashFile(capsule.tested_source_snapshot));
  check(same({ head: snapshot.tested_source_snapshot_commit, queue: snapshot.original_queue, count: snapshot.source_input_count, other: snapshot.other_capsule_input_count, checked_out: snapshot.snapshot_was_checked_out, native: snapshot.native_acceptance_claim },
    { head: capsule.real_tested_source_snapshot_head, queue: capsule.stage_queue, count: 420, other: 4, checked_out: false, native: false }), "quality107_source_scope_invalid");
  const before = parse(hashFile(capsule.original_before)); const after = parse(hashFile(capsule.original_after)); const execution = parse(hashFile(capsule.original_execution));
  check(exact(receipt, ["schema_version", "producer", "source_head", "tested_source_head", "started_at", "finished_at", "runner", "test_files", "source_inputs", "report", "actual_execution",
    "input_snapshot_before", "input_snapshot_after", "coverage_artifacts", "raw_v8", "source_bindings", "coverage_only", "native_acceptance", "coverage_subject", "input_scope", ...(receipt.inheritance === undefined ? [] : ["inheritance"])]), "quality107_input_scope_invalid");
  check(capsule.native_acceptance_claim === false && capsule.acceptance_claim === false && capsule.test_only === true
    && receipt.coverage_only === true && receipt.native_acceptance === false && receipt.coverage_subject === capsule.subject.path
    && receipt.tested_source_head === capsule.real_tested_source_snapshot_head && HEAD.test(receipt.tested_source_head), "quality107_native_authority_invalid");
  check(same(before.project_inputs, after.project_inputs) && same(before.installed_dependencies, after.installed_dependencies)
    && same(before.node, after.node) && same(before.environment, after.environment)
    && same(before.project_inputs, capsule.role_partition.map(value => value.original)), "quality107_inputs_invalid");
  const artifactPaths = new Set(capsule.role_partition.filter(value => value.role.startsWith("OUTER_PRODUCER_")).map(value => value.original.path));
  check(same(receipt.source_inputs, capsule.project_inputs) && receipt.source_inputs.length === 423 && artifactPaths.size === 3, "quality107_inputs_invalid");
  for (const row of capsule.role_partition) {
    const bytes = hashFile({ path: row.original.snapshot, sha256: row.original.sha256 });
    check(bytes.length === row.original.bytes, "quality107_inputs_invalid");
    if (row.role === "IMMUTABLE_TESTED_SOURCE") check(bytes.equals(authority.readSource(receipt.tested_source_head, row.original.path)), "quality107_source_changed");
  }
  const tool = parse(hashFile(capsule.external_tool));
  for (const dependency of before.installed_dependencies) check(hashFile({ path: dependency.snapshot, sha256: dependency.sha256 }).length === dependency.bytes, "quality107_tool_binding_invalid");
  check(exact(tool, capsule.external_exact_keys) && hashFile(capsule.external_tool).equals(hashFile({ path: capsule.original_external_input.snapshot, sha256: capsule.original_external_input.sha256 }))
    && before.node.sha256 === "27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1" && before.node_version === "v24.19.0", "quality107_tool_binding_invalid");
  hashFile({ path: before.node.snapshot, sha256: before.node.sha256 });
  check(hashFile({ path: capsule.safe_sdk_source_pin.snapshot, sha256: capsule.safe_sdk_source_pin.sha256 }).equals(authority.readSource(receipt.tested_source_head, capsule.safe_sdk_source_pin.path)), "quality107_tool_binding_invalid");
  const edges = quality107Graph(before.project_inputs, hashFile);
  const seeds = quality107ProducerSeeds(capsule, hashFile, execution);
  check(same([...edges].sort(), [...before.import_edges].sort()) && same([...edges].sort(), [...capsule.producer_import_edges].sort())
    && same(quality107Closure(seeds, edges, before.project_inputs.map(value => value.path)), before.project_inputs.map(value => value.path).sort()), "quality107_source_scope_invalid");
  const required = quality107Closure(["package.json", "package-lock.json", ...execution.argv.slice(4)], edges);
  check(same(required, capsule.mandatory_runtime_inputs), "quality107_source_scope_invalid");
  const actual = parse(hashFile(receipt.actual_execution)); const normalizedBefore = parse(hashFile(receipt.input_snapshot_before)); const normalizedAfter = parse(hashFile(receipt.input_snapshot_after));
  check(receipt.runner === "node-tap" && receipt.source_head === before.context_head && before.context_head === after.context_head
    && receipt.started_at === execution.started_at && receipt.finished_at === execution.finished_at && same(receipt.test_files, execution.argv.slice(4))
    && same(receipt.report, capsule.report) && same(receipt.raw_v8, execution.raw) && same(receipt.coverage_artifacts, [capsule.coverage])
    && same(receipt.source_bindings, [{ id: capsule.subject.path, url: capsule.raw_workspace_subject_url, sha256: capsule.subject.sha256 }])
    && same(actual.argv, execution.argv) && actual.pid === execution.pid && actual.signal === execution.signal && actual.native_device_operations === 0 && same(actual.original_execution, capsule.original_execution)
    && same(actual.input_scope, receipt.input_scope) && same(normalizedBefore.input_scope, receipt.input_scope) && same(normalizedAfter.input_scope, receipt.input_scope)
    && same(normalizedBefore.original_observation, capsule.original_before) && same(normalizedAfter.original_observation, capsule.original_after)
    && normalizedBefore.recorded_at === before.captured_at && normalizedAfter.recorded_at === after.captured_at, "quality107_execution_binding_invalid");
  check(same(execution.counts, { tests: 107, pass: 107, fail: 0, cancelled: 0, skipped: 0, todo: 0 }) && execution.stable === true
    && timestamp(before.captured_at, authority.now) <= Date.parse(execution.started_at) && timestamp(after.captured_at, authority.now) >= Date.parse(execution.finished_at), "quality107_execution_binding_invalid");
  const witness = quality107Witnesses(capsule, hashFile, authority, execution);
  return { capsule, required, artifactPaths, witness };
}
export const HOST_FIXTURE_CAPSULE = Object.freeze({ path: "artifacts/native/personal-closeout-20261027/host-fixture-capsules/producer-guard-relocation/binding.json", sha256: "2ef44419d1674863ae24b92a8da0695ad8ea4ac7c82a123f0bf728da8ddb8a17" });
export const HOST_FIXTURE_CAPSULE_CLEAN = Object.freeze({ path: "artifacts/native/personal-closeout-20261027/host-fixture-capsules/clean-privacy-posix/binding.json", sha256: "9d214cb9af66ed81262d9448090a0973fb3214e4fcea02578a887f73fc84e69c" });
export const HOST_FIXTURE_CAPSULE_FINAL = Object.freeze({ path: "artifacts/native/personal-closeout-20261027/host-fixture-capsules/producer-snapshot-final/binding.json", sha256: "571dd443d28b3c582ad7a00dcf9d2e74f83aac2ba1c061f92248ad060fcf71e4" });
function hostFixtureCapsule(receipt, hashFile) {
  check(exact(receipt.artifact_inputs, ["kind", "capsule"]) && [HOST_FIXTURE_CAPSULE, HOST_FIXTURE_CAPSULE_CLEAN, HOST_FIXTURE_CAPSULE_FINAL].some(value => same(receipt.artifact_inputs.capsule, value)), "artifact_input_scope_invalid");
  const capsule = parse(hashFile(receipt.artifact_inputs.capsule)); const before = parse(hashFile(capsule.original_before)); const after = parse(hashFile(capsule.original_after)); const execution = parse(hashFile(capsule.original_execution));
  check(capsule.kind === "host-fixture-data/v1" && capsule.test_only === true && capsule.native_acceptance_claim === false
    && same(capsule.artifacts.map(value => value.source_input_path).sort(), ["artifacts/native/v1.2-acceptance/build.json", "artifacts/native/v1.2-acceptance/git-execution-origin.json"])
    && same(before.project_inputs, after.project_inputs) && same(receipt.source_inputs, before.project_inputs.map(({ path, sha256 }) => ({ path, sha256 })))
    && before.project_input_sha256 === jsonSha(before.project_inputs) && after.project_input_sha256 === jsonSha(after.project_inputs)
    && before.installed_dependency_sha256 === jsonSha(before.installed_dependencies) && after.installed_dependency_sha256 === jsonSha(after.installed_dependencies)
    && same(before.installed_dependencies, after.installed_dependencies) && same(before.node, after.node) && same(before.environment, after.environment)
    && execution.source_context_head === receipt.source_head && execution.exit_code === 0 && execution.before_after_inputs_equal === true
    && same(execution.test_files, receipt.test_files) && same(execution.tests_report, receipt.report), "host_fixture_capsule_invalid");
  const paths = new Set();
  for (const value of capsule.artifacts) {
    const original = before.project_inputs.find(input => input.path === value.source_input_path);
    check(original && original.sha256 === value.artifact.sha256 && original.sha256 === value.original_content_snapshot.sha256
      && original.content_snapshot === value.original_content_snapshot.path
      && hashFile(value.artifact).equals(hashFile(value.original_content_snapshot)), "host_fixture_capsule_invalid");
    paths.add(value.source_input_path);
  }
  return paths;
}
function pinnedGarminArtifactInputs(receipt, hashFile, authority, testedHead, reportSha) {
  if (receipt.artifact_inputs === undefined) return new Set();
  if (receipt.artifact_inputs.kind === "host-fixture-data/v1") return hostFixtureCapsule(receipt, hashFile);
  const artifact = receipt.artifact_inputs; const lockPath = "modules/garmin-connect/python/garmin-python-lock.json";
  check(exact(artifact, ["kind", "lock_path", "artifacts"]) && artifact.kind === "pinned-garmin-cache/v1" && artifact.lock_path === lockPath
    && Array.isArray(artifact.artifacts) && artifact.artifacts.length === 15 && unique(artifact.artifacts.map(value => value.path)), "artifact_input_scope_invalid");
  const lockBytes = authority.readSource(testedHead, lockPath); const lock = parse(lockBytes);
  check(lockBytes.equals(authority.readSource(authority.source.head, lockPath)) && Array.isArray(lock.packages) && lock.packages.length === 15
    && receipt.source_inputs.some(input => input.path === lockPath && input.sha256 === sha(lockBytes)), "artifact_input_lock_changed");
  const expected = lock.packages.map(value => ({ path: path.posix.join(path.posix.dirname(lockPath), "garmin-python-artifacts", value.artifact.filename), sha256: value.artifact.sha256 }));
  check(isDeepStrictEqual([...artifact.artifacts].sort((a, b) => a.path.localeCompare(b.path)), expected.sort((a, b) => a.path.localeCompare(b.path))), "artifact_input_scope_invalid");
  const before = parse(hashFile(receipt.input_snapshot_before)); const after = parse(hashFile(receipt.input_snapshot_after));
  check(before.execution_context_head === receipt.source_head && after.execution_context_head === receipt.source_head
    && same(before.source_inputs, receipt.source_inputs) && same(after.source_inputs, receipt.source_inputs) && after.report_sha256 === reportSha, "tested_snapshot_invalid");
  for (const binding of artifact.artifacts) {
    check(receipt.source_inputs.some(input => same(input, binding)), "artifact_input_scope_invalid"); hashFile(binding);
  }
  return new Set(artifact.artifacts.map(value => value.path));
}
export const JEST_EXECUTION_INTERVAL_ORIGINALS = Object.freeze({
  producer: { path: "artifacts/native/personal-closeout-20261027/remaining-ts-helper-coverage/run.mjs", sha256: "d13e5c8057d205a0979538b5d49708e90e9853f332183abea425885a50327b79" },
  scope: { path: "artifacts/native/personal-closeout-20261027/remaining-ts-helper-coverage/scope.json", sha256: "4514beebdf7a8233294ac5dac3758f5a3cb5eccc113f7183336a02077778baa2" },
  before: { path: "artifacts/native/personal-closeout-20261027/remaining-ts-helper-coverage/before-inputs.json", sha256: "0afe6702a97671a9328ae52c8cf3b8ae66d8749637c72c66cf0b3e0f4ef98f96" },
  after: { path: "artifacts/native/personal-closeout-20261027/remaining-ts-helper-coverage/after-inputs.json", sha256: "7ff62c151b0515f6c92119fff9519962928dcfda9c8cc6ed6a6e4c144dbfe879" },
  jest_report: { path: "artifacts/native/personal-closeout-20261027/remaining-ts-helper-coverage/jest-results.json", sha256: "67280b8d734c7b0c96c46adf6a5b1e9d1af65d284afc9597c6c7a3cd7abf3cfd" },
  final_report: { path: "artifacts/native/personal-closeout-20261027/remaining-ts-helper-coverage/FINAL-REPORT.json", sha256: "9900df5a201ac33d06445be2c43d3abcc2940e18b8bf6b9b173adadc1066e69b" },
});
function jestExecutionInterval(receipt, actual, hashFile, authority) {
  check(receipt.runner === "jest" && receipt.timestamp_kind === "JEST_EXECUTION_INTERVAL" && actual.producer === "personal-closeout-jest-result-interval/v1"
    && actual.process_wall_time_claimed === false && actual.producer_binding_phase === "AFTER_EXECUTION_ONLY"
    && isDeepStrictEqual(actual.interval_binding, JEST_EXECUTION_INTERVAL_ORIGINALS) && same(receipt.report, actual.interval_binding.jest_report), "jest_interval_binding_invalid");
  const refs = actual.interval_binding; const producer = hashFile(refs.producer).toString("utf8"); const scope = parse(hashFile(refs.scope));
  const before = parse(hashFile(refs.before)); const after = parse(hashFile(refs.after)); const raw = parse(hashFile(refs.jest_report)); const report = parse(hashFile(refs.final_report));
  check(producer.indexOf("const before = snapshot('before')") < producer.indexOf("const execution = spawnSync(node, args")
    && producer.indexOf("const execution = spawnSync(node, args") < producer.indexOf("const after = snapshot('after')"), "jest_interval_source_invalid");
  check(raw.success === true && raw.wasInterrupted === false && raw.numTotalTests === 105 && raw.numPassedTests === 105 && raw.numFailedTests === 0
    && raw.numPendingTests === 0 && raw.numTodoTests === 0 && raw.numTotalTestSuites === 10 && raw.testResults.length === 10
    && Number.isSafeInteger(raw.startTime) && raw.testResults.every(row => Number.isSafeInteger(row.startTime) && Number.isSafeInteger(row.endTime)
      && row.startTime >= raw.startTime && row.endTime >= row.startTime), "jest_interval_results_invalid");
  const end = Math.max(...raw.testResults.map(row => row.endTime));
  check(actual.started_at === new Date(raw.startTime).toISOString() && actual.finished_at === new Date(end).toISOString()
    && timestamp(before.captured_at, authority.now) <= raw.startTime && end <= timestamp(after.captured_at, authority.now), "jest_interval_time_invalid");
  check(before.source_context_head === receipt.source_head && after.source_context_head === receipt.source_head
    && same(report.source_context_heads, { before: before.source_context_head, after: after.source_context_head })
    && same(before.project_inputs, after.project_inputs) && before.project_input_sha256 === jsonSha(before.project_inputs)
    && after.project_input_sha256 === jsonSha(after.project_inputs)
    && same(receipt.source_inputs, before.project_inputs.map(({ path, sha256 }) => ({ path, sha256 })))
    && before.unresolved_relative_inputs.length === 0 && after.unresolved_relative_inputs.length === 0, "jest_interval_inputs_invalid");
  check(before.installed_dependency_sha256 === jsonSha(before.installed_dependencies) && after.installed_dependency_sha256 === jsonSha(after.installed_dependencies)
    && same(before.installed_dependencies, after.installed_dependencies) && before.installed_dependencies.length === 77239
    && same(before.node, after.node) && before.node.version === "v24.19.0" && before.node.sha256 === "27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1"
    && same(before.environment, after.environment) && same(before.environment, scope.environment) && same(before.config_presence, after.config_presence), "jest_interval_environment_invalid");
  check(report.status === "PASS" && report.acceptance_claim === false && report.execution.exit_code === 0 && report.before_after_inputs_equal === true
    && same(report.tests, scope.tests) && same(scope.tests, receipt.test_files) && same(report.args, scope.args) && same(actual.argv, [scope.node, ...scope.args])
    && same(report.actual_tests, { passed: 105, failed: 0, skipped: 0, suites: 10 })
    && [refs.before, refs.after, refs.jest_report].every(ref => report.artifacts.some(value => same(value, ref)))
    && report.producer_source.path === refs.producer.path && report.producer_source.sha256 === refs.producer.sha256
    && report.producer_source.binding.includes("captured after execution") && same(report.scope_artifact, refs.scope), "jest_interval_report_invalid");
}
export const FAULT_EXECUTION_ORIGINAL = Object.freeze({ path: "artifacts/native/personal-closeout-20261027/verifier-coverage/fault-current-final-execution/execution.json", sha256: "125ab4ef7058723ef80de7d54c9390f1c36fcc102992f9719bd2a5148a4f2ba2" });
export const COLLECTOR_PLATFORM_SKIPS = Object.freeze({ path: "artifacts/native/personal-closeout-20261027/verifier-coverage/collector-current-final-execution/execution.json", sha256: "7953630a9deca54e7f3bac73ff783803d6c18d9ab3b5ff281b86c8c9e0e20876" });
function collectorPlatformSkips(receipt, hashFile, authority) {
  check(same(receipt.platform_skips, COLLECTOR_PLATFORM_SKIPS), "platform_skip_scope_invalid");
  const proof = parse(hashFile(receipt.platform_skips)); const root = authority.root ?? process.cwd();
  const local = value => ({ path: path.relative(root, value.path).split(path.sep).join("/"), sha256: value.sha256 });
  const before = parse(hashFile(local(proof.before))); const after = parse(hashFile(local(proof.after))); const executed = proof.actual_execution;
  const files = before.source_inputs.map(local); const tests = executed.argv.filter(value => value.endsWith(".test.mjs"));
  check(proof.native_acceptance_authority === false && proof.skipped_requirement_assertions_authorized === false && proof.all_inputs_unchanged === true
    && proof.platform_skips.kind === "coverage-only-platform-skips/v1" && proof.platform_skips.actual_platform === "darwin"
    && before.platform === "darwin" && before.platform === after.platform && executed.platform === before.platform
    && before.arch === "arm64" && before.arch === after.arch && executed.arch === before.arch
    && before.node_version === "v24.19.0" && before.node_version === after.node_version && executed.node_version === before.node_version
    && executed.exit_code === 0 && executed.signal === null && same(files, receipt.source_inputs) && same(before.source_inputs, after.source_inputs)
    && same(tests, receipt.test_files) && same(local(proof.test_log), receipt.report)
    && before.executable_sha256 === "27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1"
    && before.executable_sha256 === after.executable_sha256, "platform_skip_evidence_invalid");
  check(timestamp(before.captured_at, authority.now) <= timestamp(executed.started_at, authority.now)
    && timestamp(after.captured_at, authority.now) >= timestamp(executed.finished_at, authority.now), "platform_skip_evidence_invalid");
  if (receipt.timestamp_kind === undefined) check(receipt.started_at === executed.started_at && receipt.finished_at === executed.finished_at, "platform_skip_evidence_invalid");
  const testedHead = receipt.tested_source_head ?? receipt.source_head; const cases = proof.platform_skips.cases;
  check(cases.length === 3 && unique(cases.map(value => value.title)), "platform_skip_scope_invalid");
  for (const value of cases) {
    const bytes = authority.readSource(testedHead, value.test_file); const text = bytes.toString("utf8");
    check(value.test_file === "scripts/testing/closeout-collector-scheduler.test.mjs" && sha(bytes) === value.test_source_sha256
      && files.some(input => input.path === value.test_file && input.sha256 === value.test_source_sha256)
      && value.guard === 'process.platform !== "linux"' && value.actual_platform === "darwin" && text.includes(value.title) && text.includes(value.guard), "platform_skip_source_invalid");
  }
  return { before, after, titles: new Set(cases.map(value => value.title)) };
}
function recordedFaultExecution(receipt, actual, hashFile, authority) {
  check(same(actual.original_execution, FAULT_EXECUTION_ORIGINAL), "fixture_execution_invalid");
  const original = parse(hashFile(actual.original_execution)); const root = authority.root ?? process.cwd();
  const local = value => ({ path: path.relative(root, value.path).split(path.sep).join("/"), sha256: value.sha256 });
  const before = parse(hashFile(local(original.before))); const after = parse(hashFile(local(original.after))); const executed = original.actual_execution;
  const inputs = before.source_inputs.map(value => local(value));
  check(original.all_inputs_unchanged === true && original.native_acceptance_authority === false && original.subject_override_forbidden === true
    && executed.started_at === actual.started_at && executed.finished_at === actual.finished_at && executed.exit_code === 0 && executed.signal === null
    && same(actual.argv, [executed.executable, ...executed.argv]) && same(inputs, receipt.source_inputs)
    && same(before.source_inputs, after.source_inputs) && before.source_head === receipt.source_head && after.source_head === receipt.source_head
    && before.executable_sha256 === "27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1" && before.executable_sha256 === after.executable_sha256
    && before.node_version === "v24.19.0" && after.node_version === before.node_version && before.platform === "darwin" && before.platform === after.platform
    && same(receipt.report, local(original.test_log)) && isDeepStrictEqual(receipt.raw_v8, original.raw_streams.map(local)), "fixture_execution_invalid");
  check(timestamp(before.captured_at, authority.now) <= Date.parse(actual.started_at) && timestamp(after.captured_at, authority.now) >= Date.parse(actual.finished_at), "fixture_execution_invalid");
}
function actualHostExecution(receipt, hashFile, reportSha, authority) {
  const actual = parse(hashFile(receipt.actual_execution));
  check(object(actual) && actual.schema_version === 1 && actual.exit_code === 0
    && actual.execution_context_head === receipt.source_head && actual.started_at === receipt.started_at && actual.finished_at === receipt.finished_at
    && same(actual.test_files, receipt.test_files) && same(actual.source_inputs, receipt.source_inputs)
    && actual.report_sha256 === reportSha && Array.isArray(actual.changed_inputs) && actual.changed_inputs.length === 0, "host_actual_execution_invalid");
  if (actual.timestamp_kind !== undefined) {
    if (actual.timestamp_kind === "OBSERVED_CAPTURE_BRACKET") {
      const original = collectorPlatformSkips(receipt, hashFile, authority);
      check(receipt.timestamp_kind === "OBSERVED_CAPTURE_BRACKET" && actual.process_wall_time_claimed === false
        && actual.started_at === original.before.captured_at && actual.finished_at === original.after.captured_at, "platform_skip_evidence_invalid");
    } else { check(actual.timestamp_kind === "JEST_EXECUTION_INTERVAL", "jest_interval_binding_invalid"); jestExecutionInterval(receipt, actual, hashFile, authority); }
  } else check(receipt.timestamp_kind === undefined, "jest_interval_binding_invalid");
  if (receipt.fixture_overrides !== undefined) recordedFaultExecution(receipt, actual, hashFile, authority);
  return actual;
}
function reconciledReportSha(receipt, hashFile, authority, start, end) {
  if (receipt.report_reconciliation === undefined) return receipt.report.sha256;
  const link = receipt.report_reconciliation;
  check(receipt.runner === "jest" && exact(link, ["kind", "log", "json"]) && link.kind === "jest-log-json"
    && same(link.json, receipt.report), "report_reconciliation_invalid");
  const log = hashFile(link.log).toString("utf8"); const raw = parse(hashFile(link.json));
  const actual = actualHostExecution(receipt, hashFile, link.log.sha256, authority);
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
function hostInputScope(receipt, hashFile, authority, testedHead, required, reportSha, artifactPaths, quality107, producerScope) {
  const extras = receipt.source_inputs.filter(input => !required.includes(input.path));
  if (extras.length === 0) return;
  const actual = actualHostExecution(receipt, hashFile, reportSha, authority);
  const before = parse(hashFile(receipt.input_snapshot_before)); const after = parse(hashFile(receipt.input_snapshot_after));
  check(before.execution_context_head === receipt.source_head && after.execution_context_head === receipt.source_head
    && same(before.source_inputs, receipt.source_inputs) && same(after.source_inputs, receipt.source_inputs)
    && after.report_sha256 === reportSha, "tested_snapshot_invalid");
  if (producerScope !== null) {
    check(VERIFIED_PRODUCER_SCOPES.has(producerScope) && same(producerScope.source_inputs, receipt.source_inputs)
      && same(producerScope.required_runtime, required) && producerScope.roles.length === receipt.source_inputs.length, "producer_capture_scope_invalid"); return;
  }
  if (quality107 !== null) {
    check(required.every(file => receipt.source_inputs.some(input => input.path === file))
      && extras.every(input => quality107.capsule.project_inputs.some(value => same(value, input))), "quality107_source_scope_invalid"); return;
  }
  // The fixed helper producer explicitly captured all assets/native variants.
  // Its complete observed246-row list is validated above; never project it away.
  if (actual.timestamp_kind === "JEST_EXECUTION_INTERVAL") return;
  if (actual.timestamp_kind === "OBSERVED_CAPTURE_BRACKET") return;
  if (receipt.artifact_inputs?.kind === "host-fixture-data/v1") return;
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
    const text = (artifactPaths.has(file) ? hashFile(receipt.source_inputs.find(value => value.path === file)) : authority.readSource(testedHead, file)).toString("utf8");
    for (const match of text.matchAll(/(["'])([^"'\r\n]+)\1/gu)) if (safePath(match[2])) literals.add(match[2]);
  }
  check(extras.every(input => artifactPaths.has(input.path) || eligible.has(input.path) || literals.has(input.path)), "source_scope_invalid");
}
function inheritedHostInputs(receipt, inherit, required, hashFile, authority, artifactPaths, quality107 = null, producerScope = null) {
  const currentRequired = quality107 === null ? hostRequiredClosure(receipt, authority, authority.source.head, generatedTestContext(receipt, hashFile, authority, authority.source.head)) : quality107.required;
  check(same([...required].sort(), [...currentRequired].sort()), "host_runtime_scope_changed");
  const entrypoints = producerScope === null ? [] : producerScope.roles.filter(row => row.role === "STATIC_RUNTIME_ENTRYPOINT").map(row => row.path);
  const oldEntrypoints = entrypoints.length === 0 ? [] : authority.sourceClosure(receipt.tested_source_head ?? receipt.source_head, entrypoints);
  const currentEntrypoints = entrypoints.length === 0 ? [] : authority.sourceClosure(authority.source.head, entrypoints);
  check(same([...oldEntrypoints].sort(), [...currentEntrypoints].sort()), "host_runtime_scope_changed");
  const compatibleRuntime = new Set([...currentRequired, ...currentEntrypoints]);
  const replacements = inherit.replacements ?? [];
  check(Array.isArray(replacements) && unique(replacements.map(value => value.id)), "host_input_replacement_invalid");
  const changed = inherit.inputs.filter(input => !artifactPaths.has(input.path) && (producerScope === null || compatibleRuntime.has(input.path))
    && sha(authority.readSource(authority.source.head, input.path)) !== input.sha256);
  check(replacements.every(value => value.id === "scripts/phase20-subprocess-coverage.mjs" && changed.some(input => input.path === value.id)
    && !currentRequired.includes(value.id) && ["raw-v8-coverage", "composed-coverage"].includes(value.kind)), "host_input_replacement_invalid");
  for (const input of changed) {
    const replacement = replacements.find(value => value.id === input.path);
    check(replacement && !required.includes(input.path) && coverageProof(replacement, hashFile, authority), "host_input_replacement_invalid");
  }
}
export const COVERAGE_FIXTURE_OVERRIDE_INVENTORY = Object.freeze({ path: "artifacts/native/personal-closeout-20261027/verifier-coverage/fault-current-final-execution/fixture-overrides-inventory.json", sha256: "5f7ca2cbce58e5df751085e579d072194969b0bda1b0e22b7e111986260e277f" });
const FIXTURE_DEPENDENCIES = new Set(["src/testing/v12NativeAcceptanceProductRegistry.ts", "scripts/v12-posix-process-tree.mjs", "scripts/v12-artifact-privacy.mjs",
  "scripts/v12-atomic-shard-publication.mjs", "scripts/run-v12-maestro.mjs", "scripts/v12-native-execution-origin.mjs", "scripts/v12-rollback-evidence.mjs"]);
export const GENERATED_PRIVACY_TEST = Object.freeze({ path: "artifacts/native/personal-closeout-20261027/retained-node-corrected-proof/clean-privacy-posix/test-fragment-witness.json", sha256: "37cd628d8b4c9ac6639d6c1fe762587734189929641c918163651e1f3673ebf8" });
function generatedTestContext(receipt, hashFile, authority, head) {
  const result = { tests: new Set(), artifactPaths: new Set() };
  if (receipt.generated_tests === undefined) return result;
  check(exact(receipt.generated_tests, ["kind", "witness"]) && receipt.generated_tests.kind === "verbatim-test-fragments/v1"
    && same(receipt.generated_tests.witness, GENERATED_PRIVACY_TEST), "generated_test_invalid");
  const witness = parse(hashFile(receipt.generated_tests.witness)); const source = authority.readSource(head, witness.original_test_file);
  check(sha(source) === witness.original_sha256 && source.equals(authority.readSource(authority.source.head, witness.original_test_file))
    && witness.producer_tests_executed === false && witness.fragments.length === 3 && receipt.test_files.includes(witness.generated_test_file), "generated_test_invalid");
  const text = source.toString("utf8"); const fragments = witness.fragments.map(value => {
    check(Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.start >= 0 && value.end > value.start && value.end <= text.length
      && value.copied_verbatim === true && sha(text.slice(value.start, value.end)) === value.original_fragment_sha256, "generated_test_invalid");
    return text.slice(value.start, value.end);
  });
  const prefix = "import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport {assertV12ArtifactPrivacySafe} from '../../../../../scripts/v12-artifact-privacy.mjs';\n\n";
  const generated = hashFile({ path: witness.generated_test_file, sha256: witness.generated_sha256 });
  check(generated.toString("utf8") === prefix + fragments.join("\n\n") + "\n"
    && receipt.source_inputs.some(value => value.path === witness.generated_test_file && value.sha256 === witness.generated_sha256)
    && receipt.source_inputs.some(value => same(value, receipt.generated_tests.witness)), "generated_test_invalid");
  result.tests.add(witness.generated_test_file); result.artifactPaths.add(witness.generated_test_file); result.artifactPaths.add(receipt.generated_tests.witness.path);
  return result;
}
function hostRequiredClosure(receipt, authority, head, generated) {
  const sourceTests = receipt.test_files.filter(file => !generated.tests.has(file));
  if (generated.tests.size > 0) sourceTests.push("scripts/v12-artifact-privacy.mjs");
  return [...new Set([...authority.sourceClosure(head, sourceTests), ...generated.tests])].sort();
}
function coverageFixtureOverrides(receipt, hashFile, authority, testedHead, start, end) {
  const context = { artifactPaths: new Set(), subjectUrls: new Map() };
  if (receipt.fixture_overrides === undefined) return context;
  check(exact(receipt.fixture_overrides, ["kind", "inventory"]) && receipt.fixture_overrides.kind === "coverage-only-dependency-fault/v1"
    && same(receipt.fixture_overrides.inventory, COVERAGE_FIXTURE_OVERRIDE_INVENTORY), "fixture_override_scope_invalid");
  const inventory = parse(hashFile(receipt.fixture_overrides.inventory));
  check(inventory.kind === "coverage-only-dependency-fault/v1" && Array.isArray(inventory.rows) && inventory.rows.length === 23
    && unique(inventory.rows.map(value => value.path)), "fixture_override_scope_invalid");
  const root = authority.root ?? process.cwd();
  const readAbsolute = (file, digest) => {
    const relative = path.relative(root, file).split(path.sep).join("/");
    check(safePath(relative) && relative.startsWith("artifacts/native/personal-closeout-20261027/verifier-coverage/"), "fixture_override_path_invalid");
    return hashFile({ path: relative, sha256: digest });
  };
  for (const row of inventory.rows) {
    const proofPath = path.relative(root, row.path).split(path.sep).join("/");
    const proof = parse(readAbsolute(row.path, row.sha256));
    check(proof.schema_version === 1 && proof.evidence_type === "HOST_COVERAGE_ONLY_FAULT_INJECTION" && proof.test_only === true && proof.production_acceptance_authority === false
      && proof.native_acceptance_proof === false && proof.full_dependency_equality_claimed === false && proof.subject_override_forbidden === true
      && proof.actual_outcome === "rejected_as_asserted" && receipt.test_files.includes(proof.test.repo_path)
      && ["scripts/run-v12-maestro.mjs", "scripts/verify-v12-native-evidence.mjs", "scripts/phase20-subprocess-coverage.mjs"].includes(proof.subject.repo_path), "fixture_override_scope_invalid");
    const subjectBytes = authority.readSource(testedHead, proof.subject.repo_path);
    check(sha(subjectBytes) === proof.subject.current_source_sha256 && sha(subjectBytes) === proof.subject.fixture_source_sha256
      && subjectBytes.equals(authority.readSource(authority.source.head, proof.subject.repo_path))
      && sha(authority.readSource(receipt.source_head, proof.subject.repo_path)) === proof.subject.git_source_sha256
      && sha(authority.readSource(testedHead, proof.test.repo_path)) === proof.test.source_sha256
      && receipt.source_inputs.some(value => value.path === proof.subject.repo_path && value.sha256 === proof.subject.current_source_sha256), "fixture_subject_changed");
    const fixtureSubject = path.join(root, path.posix.dirname(proofPath), proof.subject.repo_path);
    readAbsolute(fixtureSubject, proof.subject.fixture_source_sha256);
    if (!context.subjectUrls.has(proof.subject.repo_path)) context.subjectUrls.set(proof.subject.repo_path, new Set());
    context.subjectUrls.get(proof.subject.repo_path).add(pathToFileURL(fixtureSubject).href);
    check(Array.isArray(proof.overrides) && proof.overrides.length > 0 && unique(proof.overrides.map(value => value.repo_path)), "fixture_override_scope_invalid");
    for (const override of proof.overrides) {
      check(FIXTURE_DEPENDENCIES.has(override.repo_path) && override.repo_path !== proof.subject.repo_path
        && sha(authority.readSource(testedHead, override.repo_path)) === override.current_source_sha256
        && sha(authority.readSource(receipt.source_head, override.repo_path)) === override.git_source_sha256
        && receipt.source_inputs.some(value => value.path === override.repo_path && value.sha256 === override.current_source_sha256), "fixture_override_dependency_invalid");
      readAbsolute(override.fixture_artifact_path, override.fixture_artifact_sha256);
    }
    const before = parse(readAbsolute(proof.before.path, proof.before.sha256)); const after = parse(readAbsolute(proof.after.path, proof.after.sha256));
    const material = value => ({ subject: value.subject, test: value.test, overrides: value.overrides });
    check(isDeepStrictEqual(material(before), material(proof)) && isDeepStrictEqual(material(after), material(proof))
      && timestamp(before.captured_at, authority.now) >= start && timestamp(after.captured_at, authority.now) <= end
      && timestamp(after.captured_at, authority.now) >= timestamp(before.captured_at, authority.now), "fixture_override_snapshot_invalid");
  }
  const prefix = "artifacts/native/personal-closeout-20261027/verifier-coverage/frozen-product-registry-inputs/";
  for (const input of receipt.source_inputs.filter(value => value.path.startsWith(prefix))) { hashFile(input); context.artifactPaths.add(input.path); }
  return context;
}
function hostExecution(binding, hashFile, authority) {
  const receipt = parse(hashFile(binding));
  check(object(receipt) && receipt.schema_version === 1 && receipt.producer === "personal-closeout-host-execution/v1"
    && HEAD.test(receipt.source_head ?? "") && ["jest", "node-tap", "node-spec"].includes(receipt.runner)
    && Array.isArray(receipt.test_files) && receipt.test_files.length > 0 && unique(receipt.test_files)
    && receipt.test_files.every(safePath), "host_execution_invalid");
  const start = timestamp(receipt.started_at, authority.now); const end = timestamp(receipt.finished_at, authority.now);
  check(end >= start, "timestamp_invalid");
  const quality107 = quality107InputScope(receipt, hashFile, authority);
  const executionReportSha = reconciledReportSha(receipt, hashFile, authority, start, end);
  if (receipt.actual_execution !== undefined) actualHostExecution(receipt, hashFile, executionReportSha, authority);
  const testedHead = receipt.tested_source_head ?? receipt.source_head;
  check(HEAD.test(testedHead), "host_execution_invalid");
  const fixtureContext = coverageFixtureOverrides(receipt, hashFile, authority, testedHead, start, end);
  const generated = generatedTestContext(receipt, hashFile, authority, testedHead);
  if (receipt.tested_source_head !== undefined) {
    const before = parse(hashFile(receipt.input_snapshot_before)); const after = parse(hashFile(receipt.input_snapshot_after));
    check(before.execution_context_head === receipt.source_head && after.execution_context_head === receipt.source_head
      && same(before.source_inputs, receipt.source_inputs) && same(after.source_inputs, receipt.source_inputs)
      && after.report_sha256 === executionReportSha, "tested_snapshot_invalid");
    authority.readSource(receipt.source_head, "package.json");
  }
  const required = quality107 === null ? hostRequiredClosure(receipt, authority, testedHead, generated) : quality107.required;
  let producerScope = null;
  if (receipt.producer_capture_scope !== undefined) {
    check(ROOT_PRODUCER_CAPABILITIES.has(authority.verifyProducerCaptureScope) && receipt.input_scope === undefined, "producer_capture_authority_invalid");
    producerScope = authority.verifyProducerCaptureScope(receipt.producer_capture_scope, receipt, { testedHead, requiredRuntime: required, reportSha: executionReportSha, start, end });
    check(VERIFIED_PRODUCER_SCOPES.has(producerScope) && same(producerScope.binding, receipt.producer_capture_scope)
      && same(producerScope.source_inputs, receipt.source_inputs) && same(producerScope.required_runtime, required), "producer_capture_scope_invalid");
  }
  const artifactPaths = pinnedGarminArtifactInputs(receipt, hashFile, authority, testedHead, executionReportSha);
  for (const file of fixtureContext.artifactPaths) artifactPaths.add(file);
  for (const file of generated.artifactPaths) artifactPaths.add(file);
  for (const file of quality107?.artifactPaths ?? []) artifactPaths.add(file);
  for (const file of producerScope?.metadata_paths ?? []) artifactPaths.add(file);
  proofInputs(receipt.source_inputs, testedHead, authority, required, artifactPaths);
  hostInputScope(receipt, hashFile, authority, testedHead, required, executionReportSha, artifactPaths, quality107, producerScope);
  if (testedHead !== authority.source.head) {
    const inherit = receipt.inheritance;
    check(exact(inherit, ["source_head", "current_head", "ledger", "inputs", ...(inherit?.replacements === undefined ? [] : ["replacements"])]) && inherit.source_head === testedHead
      && inherit.current_head === authority.source.head && same(inherit.inputs, receipt.source_inputs), "inheritance_invalid");
    inheritedHostInputs(receipt, inherit, required, hashFile, authority, artifactPaths, quality107, producerScope);
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
    const skips = receipt.platform_skips === undefined ? null : collectorPlatformSkips(receipt, hashFile, authority);
    if (skips !== null) {
      const allCases = [...text.matchAll(/^\s*(ok|not ok) (\d+) - (.+)$/gmu)];
      check(text.startsWith("TAP version 13\n") && plan && Number(plan[1]) === cases.length && allCases.length === 44
        && cases.every((value, index) => value[1] === "ok" && Number(value[2]) === index + 1 && !/# TODO/iu.test(value[3]))
        && allCases.every(value => value[1] === "ok")
        && cases.filter(value => /# SKIP/iu.test(value[3])).length === 3
        && cases.filter(value => /# SKIP/iu.test(value[3])).every(value => skips.titles.has(value[3].split(/\s+# SKIP/iu)[0]))
        && /^# tests 44$/mu.test(text) && /^# pass 41$/mu.test(text) && /^# skipped 3$/mu.test(text)
        && ["fail", "cancelled", "todo"].every(field => new RegExp(`^# ${field} 0$`, "mu").test(text)), "host_result_invalid");
      assertions = allCases.filter(value => !/# SKIP/iu.test(value[3])).flatMap(value => receipt.test_files.map(file => ({ file, name: value[3] })));
    } else {
    check(text.startsWith("TAP version 13\n") && plan && cases.length > 0 && Number(plan[1]) === cases.length
      && cases.every((c, i) => c[1] === "ok" && Number(c[2]) === i + 1 && !/# (?:SKIP|TODO)/iu.test(c[3]))
      && !/^\s*(?:not ok|Bail out!)|^# (?:fail|skipped|todo|cancelled) [1-9]/mu.test(text), "host_result_invalid");
    assertions = cases.flatMap(c => receipt.test_files.map(file => ({ file, name: c[3] })));
    }
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
  return { receipt, testedHead, assertions: producerScope === null && receipt.fixture_overrides === undefined && receipt.generated_tests === undefined && receipt.coverage_only !== true ? assertions : [], executionReportSha, fixtureSubjectUrls: fixtureContext.subjectUrls, quality107, producerScope };
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
    && typeof raw.route === "string" && (route === "/" ? ["/", "/index"].includes(raw.route) : raw.route.startsWith(route)) && !raw.route.includes("__")
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
    required_inputs: retainedInputScope(item, descriptor, authority, tests, additional),
    branch_authority: item.kind === "source-owned-complete-node-gate" ? "HISTORICAL_ONLY_AFFECTED_COLLECTOR" : "REQUIRES_VALIDATED_COUNTER_PROOF" };
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
  compatibleThresholdInputs(item, descriptor.head, required, hashFile, authority);
  // Both pinned Node gates used per-script conversion with container-hit inference.
  // Their retained assertions are historical; no raw survives to establish branch hits.
  return false;
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
  check(completeCollectedMetrics(collected, descriptor.modules), "sealed_coverage_mismatch");
  // Preserve the original counters as historical claims. Corrected raw merging
  // may change the branch graph; only the recomputed counters supply authority.
  if (!["statements", "branches", "functions", "lines"].every(metric => summary[metric].pct === 100)) return false;
  const required = retainedInputScope(item, { ...descriptor, tests: seal.tests.files }, authority, seal.tests.files, [...seal.source.files, ...seal.source.dependencies].map(value => value.path).concat(wheel));
  return compatibleThresholdInputs(item, descriptor.head, required, hashFile, authority);
}

const MERGE_V8_SOURCE = `const fs = require("node:fs");
const path = require("node:path");
const input = JSON.parse(fs.readFileSync(0, "utf8"));
const requireFromRoot = require("node:module").createRequire(path.join(input.root, "package.json"));
const convert = requireFromRoot("v8-to-istanbul");
const { mergeScriptCovs } = requireFromRoot("@bcoe/v8-coverage");
const coverage = requireFromRoot("istanbul-lib-coverage").createCoverageMap({});
(async () => {
  const merged = mergeScriptCovs(input.scripts);
  const converter = convert(path.join(input.root, input.id), 0, { source: input.source });
  await converter.load();
  converter.applyCoverage(merged.functions);
  coverage.merge(converter.toIstanbul());
  process.stdout.write(JSON.stringify(coverage.toJSON()));
})().catch(error => { process.stderr.write(String(error.message)); process.exitCode = 1; });`;
function quality107RawScope(item, run, quality107, hashFile) {
  if (quality107 === null) return;
  const capsule = quality107.capsule; const witness = quality107.witness;
  check(item.kind === "raw-v8-coverage" && item.id === capsule.subject.path && item.runs.length === 1
    && same(item.coverage_artifact, capsule.coverage) && same(run.raw_v8, capsule.raw), "quality107_raw_binding_invalid");
  let selected = 0; let excluded = 0;
  const dependencies = new Map(parse(hashFile(capsule.original_before)).installed_dependencies.map(value => [value.path, value]));
  for (const descriptor of run.raw_v8) {
    const raw = parse(hashFile(descriptor));
    const admitted = witness.bindings.bindings.filter(value => same(value.raw, descriptor));
    const rejected = witness.excluded.records.filter(value => same(value.raw, descriptor));
    check(raw.result.filter(script => script.url === capsule.raw_workspace_subject_url).length === admitted.length
      && rejected.every(value => raw.result.filter(script => script.url === value.url).length === 1), "quality107_raw_binding_invalid");
    for (const binding of witness.bindings.actualDependencyBindings.filter(value => same(value.raw, descriptor))) check(same(binding.dependency, dependencies.get(binding.dependency.path))
      && raw.result.some(script => script.url === binding.url), "quality107_tool_binding_invalid");
    selected += admitted.length; excluded += rejected.length;
  }
  check(selected === 115 && excluded === 3, "quality107_raw_binding_invalid");
}
function composedCoverage(item, hashFile, authority) {
  check(exact(item, ["kind", "id", "coverage_artifact", "runs"]) && Array.isArray(item.runs) && item.runs.length >= (item.kind === "raw-v8-coverage" ? 1 : 2)
    && unique(item.runs.map(run => run.execution?.path)), "coverage_composition_invalid");
  const scripts = []; const streamHashes = new Map(); const streamPaths = new Set(); const executions = new Set();
  let source;
  for (const run of item.runs) {
    check(exact(run, ["execution", "raw_v8", "source_bindings"]) && Array.isArray(run.raw_v8) && run.raw_v8.length > 0
      && Array.isArray(run.source_bindings), "coverage_composition_invalid");
    const { receipt, executionReportSha, fixtureSubjectUrls, quality107, producerScope } = hostExecution(run.execution, hashFile, authority);
    quality107RawScope(item, run, quality107, hashFile);
    check(receipt.coverage_subject === undefined || receipt.coverage_subject === item.id, "coverage_scope_invalid");
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
    const allowed = fixtureSubjectUrls.get(item.id);
    check(binding.length > 0 && unique(binding.map(value => value.url)) && (allowed === undefined ? new Set(binding.map(value => value.url.split(/[?#]/u)[0])).size === 1 : binding.every(value => allowed.has(value.url)))
      && binding.every(value => exact(value, ["id", "url", "sha256"]) && value.sha256 === sha(bytes)
      && typeof value.url === "string" && value.url.startsWith("file:")), "coverage_source_binding_invalid");
    const text = bytes.toString("utf8");
    check(!/\/\/[#@]\s*sourceMappingURL=/u.test(text), "coverage_source_map_unsupported");
    source = text;
    let selected = 0;
    for (const descriptor of run.raw_v8) {
      const registered = producerScope !== null && VERIFIED_PRODUCER_SCOPES.has(producerScope) && producerScope.physical_raw_bindings.some(binding => same(binding, descriptor));
      check(!streamPaths.has(descriptor.path) && (!streamHashes.has(descriptor.sha256) || registered && streamHashes.get(descriptor.sha256) === true), "coverage_stream_reused");
      streamPaths.add(descriptor.path); streamHashes.set(descriptor.sha256, registered);
      const raw = parse(hashFile(descriptor));
      check(Array.isArray(raw.result), "coverage_raw_v8_invalid");
      for (const script of raw.result.filter(value => binding.some(input => input.url === value.url))) {
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
  const files = object(expected.files) ? expected.files : expected;
  const matches = Object.keys(files).filter(key => key === item.id || key.endsWith("/" + item.id));
  if (matches.length === 1 && object(files[matches[0]].statements)) {
    const actual = istanbul.createCoverageMap(recomputed).fileCoverageFor(target).toSummary().toJSON();
    check((expected.files === undefined || Array.isArray(expected.failures) && expected.failures.length === 0)
      && ["statements", "branches", "functions", "lines"].every(metric => isDeepStrictEqual(actual[metric], files[matches[0]][metric])), "coverage_composition_mismatch");
    return ["statements", "branches", "functions", "lines"].every(metric => actual[metric].pct === 100);
  }
  check(matches.length === 1 && recomputed[target] && isDeepStrictEqual({ ...files[matches[0]], path: item.id }, { ...recomputed[target], path: item.id }), "coverage_composition_mismatch");
  const metrics = istanbul.createCoverageMap(recomputed).fileCoverageFor(target).toSummary().toJSON();
  return ["statements", "branches", "functions", "lines"].every(metric => metrics[metric].pct === 100);
}
function coverageProof(item, hashFile, authority) {
  if (item.kind === "source-owned-complete-node-gate") return retainedNodeGate(item, hashFile, authority);
  if (item.kind === "source-owned-jest-threshold") return retainedJestThreshold(item, hashFile, authority);
  if (item.kind === "sealed-packaging-coverage") return sealedPackagingCoverage(item, hashFile, authority);
  if (["composed-coverage", "raw-v8-coverage"].includes(item.kind)) return composedCoverage(item, hashFile, authority);
  if (item.kind === "inherited-complete-gate") return inheritedCompleteGate(item, hashFile, authority);
  if (item.kind === "inherited-tool-threshold") return inheritedToolThreshold(item, hashFile, authority);
  const execution = hostExecution(item.execution, hashFile, authority);
  check(same(item.source_inputs, execution.receipt.source_inputs) && item.source_inputs.some(x => x.path === item.id), "coverage_inputs_invalid");
  check(Array.isArray(execution.receipt.coverage_artifacts) && execution.receipt.coverage_artifacts.some(binding => same(binding, item.coverage_artifact)), "coverage_execution_binding_invalid");
  if (execution.receipt.runner !== "jest") { hashFile(item.coverage_artifact); return false; }
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
/** Actual fault-context URLs only; this does not assert coverage or native acceptance. */
export function personalCoverageFixtureSubjectBindings(execution, readBytes, authority) {
  const result = hostExecution(execution, boundReader(readBytes), authority);
  check(result.receipt.fixture_overrides !== undefined, "fixture_override_scope_invalid");
  return [...result.fixtureSubjectUrls].flatMap(([id, urls]) => [...urls].map(url => ({ id, url,
    sha256: sha(authority.readSource(result.testedHead, id)) })));
}
export function validatePersonalHostExecution(execution, readBytes, authority) {
  const result = hostExecution(execution, boundReader(readBytes), authority);
  return { source_head: result.receipt.source_head, tested_source_head: result.testedHead,
    assertion_count: result.assertions.length, coverage_only: result.receipt.coverage_only === true };
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
    check((["inherited-complete-gate", "inherited-tool-threshold", "composed-coverage", "raw-v8-coverage", "source-owned-complete-node-gate", "source-owned-jest-threshold", "sealed-packaging-coverage"].includes(item.kind) || exact(item, ["id", "coverage_artifact", "execution", "source_inputs"])) && profile.critical_integrity_files.includes(item.id), "coverage_scope_invalid");
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
export function collectPersonalCloseoutAuthority(root, readBytes, now = Date.now(), { producerAdmissionIndex } = {}) {
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
  const verifyProducerCaptureScope = producerAdmissionIndex === undefined ? undefined : createRootProducerCaptureCapability(producerAdmissionIndex, { readBytes, readSource, sourceClosure, root, now });
  return { now, source, ownerReviewBindings, ...(verifyProducerCaptureScope === undefined ? {} : { verifyProducerCaptureScope }), contract: v12ContractSourceDigests(root), requirementIds: inputs.matrix.rows.map(x => x.requirement_id),
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
  check(Array.isArray(args) && [2, 6].includes(args.length) && args[0] === "--evidence"
    && (args.length === 2 || args[2] === "--admission-index" && args[4] === "--admission-sha256"), "arguments_invalid");
  const producerAdmissionIndex = args.length === 2 ? undefined : producerBinding({ path: args[3], sha256: args[5] });
  const readBytes = rootReader(path.resolve(root));
  const evidence = parse(readBytes(args[1]));
  const authority = collectPersonalCloseoutAuthority(path.resolve(root), readBytes, Date.now(), { producerAdmissionIndex });
  const profile = validatePersonalCloseoutProfile(parse(readBytes(PROFILE_PATH)), authority.requirementIds);
  const result = validatePersonalCloseoutEvidence(profile, evidence, readBytes, authority);
  io.stdout.write(JSON.stringify(result) + "\n"); return personalCloseoutExitCode(result);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = runPersonalCloseoutCli(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

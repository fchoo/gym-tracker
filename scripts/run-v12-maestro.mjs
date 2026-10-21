import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { validateV12RunManifest as validateGenericV12RunManifest } from "./create-v12-run-manifest.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { exactKeys } from "./node-evidence-utils.mjs";
import {
  initializeV12CalendarRun,
  readV12CalendarRunState,
  recordV12CalendarStageResult,
} from "./v12-calendar-artifacts.mjs";
import { publishV12AtomicShard, recordV12AtomicFailure } from "./v12-atomic-shard-publication.mjs";
import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";
import {
  digestV12CanonicalRestorationSnapshot,
  readV12CanonicalRestorationSnapshot,
  V12_CANONICAL_RESTORATION_SETTINGS,
} from "./v12-device-settings-contract.mjs";
import {
  readV12RetainedGitExecution,
  resolveV12GitExecution,
  resolveV12NativeExecutionTools,
  V12_PRODUCTION_EXECUTION_ORIGIN,
  V12_TEST_EXECUTION_ORIGIN,
} from "./v12-native-execution-origin.mjs";
import { V12_RECOVERY_CASE_IDS, V12_RECOVERY_CUT_IDS, V12_RECOVERY_STEPS } from "./v12-recovery-shard.mjs";
import {
  V12_CALENDAR_FLOW_REVISION,
  V12_CALENDAR_CHUNK_MARKER,
  V12_CALENDAR_STAGE_GROUPS,
  V12_CALENDAR_STAGE_IDS,
} from "./v12-calendar-observation-contract.mjs";
import {
  deriveV12MaestroCaseIdsFromSource,
  V12_MAESTRO_FUNCTIONAL_REGISTRIES,
} from "./v12-maestro-source-registry.mjs";
import {
  v12NativeAcceptanceCaseContract,
} from "../src/testing/contracts/phase15Workout.contract.ts";
import {
  V12_NATIVE_ACCEPTANCE_PRODUCT_REGISTRY,
  v12NativeAcceptanceProductDefinition,
} from "../src/testing/v12NativeAcceptanceProductRegistry.ts";
import { PHASE20_VISUAL_STATE_REGISTRY } from "../src/testing/phase20VisualStateRegistry.generated.ts";
import {
  createV12PosixProcessTreeTracker,
  V12_POSIX_OWNERSHIP_ENV,
} from "./v12-posix-process-tree.mjs";

const ROOT = process.cwd();
const FLOW = "maestro/v1.2/calendar.yaml";
const PACKAGE = "com.fchoo.gymtracker.devtest";
const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_HEAD = /^[a-f0-9]{40}$/u;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stableJson = (value) => {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value !== "object" || value === undefined) genericFail("source_readback_invalid");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
};
const LIVE_GENERIC_SHARDS = Object.freeze(["multi-plan", "workout", "library-running"]);
const DIRECT_MAESTRO_TOOL_NAMES = Object.freeze(["adb", "maestro", "unzip"]);
const DIRECT_MAESTRO_TOOL_VERSIONS = Object.freeze({
  adb: Object.freeze(["version"]),
  maestro: Object.freeze(["--version"]),
  unzip: Object.freeze(["-v"]),
});
const sourceSha256 = (file) => {
  try { return sha256(readFileSync(file)); }
  catch { genericFail("toolchain_invalid"); }
};

const V12_RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const V12_PACKAGE = "com.fchoo.gymtracker.devtest";
const FUNCTIONAL_NONCE = /^[a-f0-9]{48}$/u;
const FUNCTIONAL_RECEIPT_PHASES = Object.freeze(["pre", "action", "post"]);
const V12_PRODUCT_FIXTURE_ID = "v12-synthetic-fixtures-r18";
const V12_PRODUCT_PREREQUISITE_LIMIT = 8;
const PRODUCT_PREREQUISITE_ENVIRONMENT_KEYS = Object.freeze(Array.from(
  { length: V12_PRODUCT_PREREQUISITE_LIMIT },
  (_, index) => ["interaction", "kind", "value", "input_value"].map((field) => `prerequisite_${index + 1}_${field}`),
).flat());
const PRODUCT_ENVIRONMENT_KEYS = Object.freeze([
  "schema_version", "producer", "shard", "case_id", "fixture_id", "nonce", "mode",
  "interaction", "product_url", "ready_kind", "ready_value", "action_kind", "action_value",
  "input_value", "prerequisite_count", ...PRODUCT_PREREQUISITE_ENVIRONMENT_KEYS,
  "result_kind", "result_value", "callback_group", "contract_operation", "canonical_operation", "binding_sha256",
]);
export const V12_MAESTRO_COMMAND_BUDGETS = Object.freeze({
  version_ms: 10_000,
  adb_ms: 30_000,
  maestro_case_ms: 10 * 60_000,
  term_grace_ms: 5_000,
  kill_grace_ms: 5_000,
});

export const V12_MAESTRO_FLOW_CONTRACTS = Object.freeze({
  sqlite: Object.freeze({ flow: "maestro/v1.2/sqlite.yaml", sources: Object.freeze(["scripts/v12-sqlite-shard.mjs"]) }),
  recovery: Object.freeze({ flow: "maestro/v1.2/recovery.yaml", sources: Object.freeze(["scripts/v12-recovery-shard.mjs"]) }),
  garmin: Object.freeze({ flow: "maestro/v1.2/garmin-progress.yaml", sources: Object.freeze(["scripts/v12-garmin-shard.mjs"]) }),
  calendar: Object.freeze({ flow: "maestro/v1.2/calendar.yaml", sources: Object.freeze(["scripts/v12-calendar-shard.mjs"]) }),
  "multi-plan": Object.freeze({ flow: "maestro/v1.2/multi-plan.yaml", sources: Object.freeze([V12_MAESTRO_FUNCTIONAL_REGISTRIES["multi-plan"].source]), prefix: V12_MAESTRO_FUNCTIONAL_REGISTRIES["multi-plan"].prefix }),
  workout: Object.freeze({ flow: "maestro/v1.2/workout.yaml", sources: Object.freeze([V12_MAESTRO_FUNCTIONAL_REGISTRIES.workout.source]), prefix: V12_MAESTRO_FUNCTIONAL_REGISTRIES.workout.prefix }),
  "library-running": Object.freeze({ flow: "maestro/v1.2/library-running.yaml", sources: Object.freeze([V12_MAESTRO_FUNCTIONAL_REGISTRIES["library-running"].source]), prefix: V12_MAESTRO_FUNCTIONAL_REGISTRIES["library-running"].prefix }),
});

export const V12_MAESTRO_SOURCE_PATHS = Object.freeze(Object.fromEntries(
  LIVE_GENERIC_SHARDS.map((shard) => [shard, Object.freeze({
    adapter: "scripts/run-v12-maestro.mjs",
    launcher: "scripts/run-v12-maestro.mjs",
    domain: V12_MAESTRO_FLOW_CONTRACTS[shard].sources[0],
  })]),
));

function genericFail(code) {
  throw new Error(`v12_maestro_${code}`);
}

/** Run one native tool in its own process group. Timeout or caller cancellation
 * first sends TERM to the whole tree, then escalates to KILL after a fixed grace. */
export function runV12BoundedProcess(program, args, {
  cwd = ROOT,
  env = process.env,
  signal,
  timeoutMs,
  termGraceMs = V12_MAESTRO_COMMAND_BUDGETS.term_grace_ms,
  killGraceMs = V12_MAESTRO_COMMAND_BUDGETS.kill_grace_ms,
  maxBuffer = 16 * 1024 * 1024,
  platform = process.platform,
  spawnImplementation = spawn,
  taskkillImplementation = spawnSync,
  windowsTreeProbeImplementation = spawnSync,
  posixProcessProbeImplementation = spawnSync,
  posixPidfdSignalImplementation = spawnSync,
  posixPidfdPythonExecutable = "python3",
} = {}) {
  if (typeof program !== "string" || !path.isAbsolute(program) || !Array.isArray(args)
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(termGraceMs) || termGraceMs < 1
    || !Number.isSafeInteger(killGraceMs) || killGraceMs < 1 || !["win32", "darwin", "linux", "freebsd", "openbsd", "aix", "sunos"].includes(platform)
    || typeof spawnImplementation !== "function" || typeof taskkillImplementation !== "function"
    || typeof windowsTreeProbeImplementation !== "function" || typeof posixProcessProbeImplementation !== "function"
    || typeof posixPidfdSignalImplementation !== "function" || typeof posixPidfdPythonExecutable !== "string"
    || posixPidfdPythonExecutable === ""
    || signal?.aborted) {
    return Promise.reject(new Error(signal?.aborted ? "v12_maestro_process_cancelled" : "v12_maestro_process_arguments_invalid"));
  }
  return new Promise((resolve, reject) => {
    const posixOwnershipToken = platform === "win32" ? undefined : randomBytes(32).toString("hex");
    const childEnvironment = platform === "win32" ? env : { ...env, [V12_POSIX_OWNERSHIP_ENV]: posixOwnershipToken };
    const child = spawnImplementation(program, args, {
      cwd, env: childEnvironment, detached: platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = ""; let stdoutBytes = 0; let stderrBytes = 0; let settled = false;
    let terminationCode; let cleanupCode; let terminalOutcome;
    let timeout; let escalation; let killDeadline;
    let posixTree;
    if (platform !== "win32") {
      try {
        posixTree = createV12PosixProcessTreeTracker({ ownershipToken: posixOwnershipToken, platform,
          probeImplementation: posixProcessProbeImplementation,
          pidfdSignalImplementation: posixPidfdSignalImplementation,
          pidfdPythonExecutable: posixPidfdPythonExecutable,
          probeTimeoutMs: killGraceMs });
      } catch {
        cleanupCode = "process_tree_enumeration_failed";
      }
    }
    const windowsTreePids = () => {
      if (child.pid === undefined) return [];
      const script = "$root=[uint32]$args[0];$all=@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId);$seen=@{};$queue=New-Object System.Collections.Queue;$queue.Enqueue($root);while($queue.Count -gt 0){$parent=[uint32]$queue.Dequeue();foreach($item in $all){if([uint32]$item.ParentProcessId -eq $parent -and -not $seen.ContainsKey([uint32]$item.ProcessId)){$seen[[uint32]$item.ProcessId]=$true;$queue.Enqueue([uint32]$item.ProcessId)}}};foreach($item in $all){if([uint32]$item.ProcessId -eq $root){$seen[$root]=$true}};$seen.Keys | Sort-Object";
      let outcome;
      try {
        outcome = windowsTreeProbeImplementation("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script, String(child.pid)], {
          encoding: "utf8", maxBuffer: 256 * 1024, timeout: killGraceMs, windowsHide: true,
        });
      } catch { return null; }
      if (outcome?.status !== 0 || outcome.signal !== null || outcome.error !== undefined || typeof outcome.stdout !== "string") return null;
      const values = outcome.stdout.trim() === "" ? [] : outcome.stdout.trim().split(/\r?\n/u).map((value) => Number(value.trim()));
      if (values.length > 4_096 || values.some((value) => !Number.isSafeInteger(value) || value < 1)) return null;
      return [...new Set(values)];
    };
    const treeState = () => {
      if (child.pid === undefined) return "empty";
      if (platform === "win32") {
        const pids = windowsTreePids();
        return pids === null ? "unknown" : pids.length === 0 ? "empty" : "alive";
      }
      if (posixTree === undefined) return "unknown";
      try { return posixTree.treeState(); }
      catch {
        cleanupCode ??= "process_tree_enumeration_failed";
        return "unknown";
      }
    };
    const taskkillTree = (force) => {
      if (child.pid === undefined) return false;
      const observed = windowsTreePids();
      if (Array.isArray(observed) && observed.length === 0) return true;
      const targets = observed === null || observed.includes(child.pid) ? [child.pid] : observed;
      const signalled = targets.every((pid) => {
        let outcome;
        try {
          outcome = taskkillImplementation("taskkill", ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])], {
            encoding: "utf8", maxBuffer: 64 * 1024, timeout: force ? killGraceMs : termGraceMs, windowsHide: true,
          });
        } catch { return false; }
        return outcome?.status === 0 && outcome.signal === null && outcome.error === undefined;
      });
      if (signalled) return true;
      const after = windowsTreePids();
      return Array.isArray(after) && after.length === 0;
    };
    const killTree = (signalName) => {
      if (child.pid === undefined) return false;
      if (platform === "win32") return taskkillTree(signalName === "SIGKILL");
      if (posixTree === undefined) return false;
      try { return posixTree.signal(signalName); }
      catch {
        cleanupCode ??= "process_tree_enumeration_failed";
        return false;
      }
    };
    const cleanup = () => {
      clearTimeout(timeout); clearTimeout(escalation); clearTimeout(killDeadline);
      signal?.removeEventListener("abort", onAbort);
    };
    const settleAfterTree = () => {
      if (settled) return;
      const state = treeState();
      if (state !== "empty") cleanupCode ??= state === "unknown" && platform !== "win32"
        ? "process_tree_enumeration_failed" : "process_tree_termination_failed";
      if (state === "empty" && posixTree !== undefined) {
        try { posixTree.stop(); }
        catch { cleanupCode ??= "process_tree_termination_failed"; }
      }
      settled = true; cleanup();
      if (cleanupCode !== undefined) reject(new Error(`v12_maestro_${cleanupCode}`));
      else if (terminationCode !== undefined) reject(new Error(`v12_maestro_${terminationCode}`));
      else if (terminalOutcome?.code !== 0 || terminalOutcome?.signal !== null) reject(new Error("v12_maestro_process_failed"));
      else resolve(stdout);
    };
    const drainTree = () => {
      if (settled || escalation !== undefined || killDeadline !== undefined) return;
      if (treeState() === "empty") { settleAfterTree(); return; }
      const cooperative = killTree("SIGTERM");
      if (platform === "win32" && !cooperative) {
        if (!killTree("SIGKILL")) {
          cleanupCode = "process_tree_termination_failed";
          settleAfterTree();
          return;
        }
        killDeadline = setTimeout(settleAfterTree, killGraceMs);
        return;
      }
      escalation = setTimeout(() => {
        escalation = undefined;
        if (treeState() === "empty") { settleAfterTree(); return; }
        if (!killTree("SIGKILL")) {
          cleanupCode ??= "process_tree_termination_failed";
          settleAfterTree();
          return;
        }
        killDeadline = setTimeout(settleAfterTree, killGraceMs);
      }, termGraceMs);
    };
    const terminate = (code) => {
      if (settled) return;
      terminationCode ??= code;
      drainTree();
    };
    const onAbort = () => terminate("process_cancelled");
    signal?.addEventListener("abort", onAbort, { once: true });
    timeout = setTimeout(() => terminate("process_timeout"), timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBytes += Buffer.byteLength(chunk);
      if (stdoutBytes > maxBuffer) { terminate("process_output_limit"); return; }
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > maxBuffer) terminate("process_output_limit");
    });
    child.on("error", () => {
      if (settled) return;
      terminationCode = "process_spawn_failed";
      drainTree();
    });
    child.on("close", (code, childSignal) => {
      if (settled) return;
      terminalOutcome = { code, signal: childSignal };
      if (treeState() === "empty") settleAfterTree();
      else drainTree();
    });
  });
}

function commandRunner(dependencies, signal) {
  if (typeof dependencies.runProcess === "function") return async (program, args, options = {}) => {
    if (signal?.aborted) throw new Error("v12_maestro_process_cancelled");
    const value = await dependencies.runProcess(program, args, { ...options, signal });
    if (signal?.aborted) throw new Error("v12_maestro_process_cancelled");
    return value;
  };
  if (typeof dependencies.execFileSync === "function") return async (program, args, options = {}) => {
    if (signal?.aborted) throw new Error("v12_maestro_process_cancelled");
    const value = dependencies.execFileSync(program, args, {
      ...options,
      timeout: options.timeoutMs,
      killSignal: "SIGKILL",
    });
    if (signal?.aborted) throw new Error("v12_maestro_process_cancelled");
    return value;
  };
  return (program, args, options = {}) => runV12BoundedProcess(program, args, { cwd: options.cwd, env: options.env, signal,
    timeoutMs: options.timeoutMs, maxBuffer: options.maxBuffer });
}

const APP_SOURCE_RECEIPT_KEYS = Object.freeze(["schema_version", "producer", "authority", "shard", "case_id", "nonce", "action_id", "operation_id", "operation_kind", "operation_result", "operation_result_sha256", "operation_handler_id", "operation_postcondition_id", "command_receipt_id", "command_outcome", "committed_effects", "source_probe", "authority_tables", "pre", "action", "post", "action_request_sha256", "source_receipt_sha256"]);
const APP_UI_READBACK_KEYS = Object.freeze(["schema_version", "producer", "shard", "case_id", "nonce", "declared_action", "declared_readback", "readback_id", "source_receipt_sha256", "ui_receipt_sha256"]);
const APP_SOURCE_STATE_KEYS = Object.freeze(["probe_id", "facts_sha256", "source_sha256", "row_count", "table_count", "schema_version"]);

export function createV12AppFunctionalReadbacks({ shard, caseId, nonce, actionId, sourceProbe, declaredReadback, authorityTables, pre, action, post, operationResult = undefined }) {
  let contract;
  try { contract = v12NativeAcceptanceCaseContract(shard, caseId); }
  catch { genericFail("case_contract_invalid"); }
  if ((actionId !== undefined && actionId !== contract.actionId)
    || (sourceProbe !== undefined && sourceProbe !== contract.sourceProbe)
    || (declaredReadback !== undefined && declaredReadback !== contract.uiReadback.label)
    || (authorityTables !== undefined && JSON.stringify(authorityTables) !== JSON.stringify(contract.probes.post.tables))) genericFail("case_contract_invalid");
  const sourceState = (value, probe) => Object.freeze({
    probe_id: probe.id,
    facts_sha256: value?.facts_sha256 ?? value?.source_sha256,
    source_sha256: value?.source_sha256,
    row_count: value?.row_count,
    table_count: probe.tables.length,
    schema_version: value?.schema_version,
  });
  const preState = sourceState(pre, contract.probes.pre);
  const actionState = sourceState(action, contract.probes.action);
  const postState = sourceState(post, contract.probes.post);
  const normalizedOperationResult = operationResult ?? Object.freeze({
    result: contract.operation.expectedResult,
    handler_id: contract.operation.handlerId,
    postcondition_id: contract.operation.postcondition.id,
    receipt_id: contract.operation.kind === "repository-mutation" ? `${caseId}:durable-test-receipt` : null,
    outcome: contract.operation.kind === "repository-mutation" ? "already_committed" : null,
    committed_effects: 0,
  });
  const operationProof = {
    operation_id: contract.operation.id,
    result: normalizedOperationResult.result,
    handler_id: normalizedOperationResult.handler_id,
    postcondition_id: normalizedOperationResult.postcondition_id,
    receipt_id: normalizedOperationResult.receipt_id,
    outcome: normalizedOperationResult.outcome,
    committed_effects: normalizedOperationResult.committed_effects,
    authoritative_facts_sha256: postState.facts_sha256,
  };
  const actionRequest = {
    schema_version: 2,
    producer: "v12-native-acceptance-action-request/v2",
    shard,
    case_id: caseId,
    nonce,
    action_id: contract.actionId,
    operation_id: contract.operation.id,
    operation_kind: contract.operation.kind,
    operation_handler_id: contract.operation.handlerId,
    operation_postcondition_id: contract.operation.postcondition.id,
    expected_result: contract.operation.expectedResult,
    source_probe: contract.sourceProbe,
    authority_tables: contract.probes.post.tables,
    probe_ids: [contract.probes.pre.id, contract.probes.action.id, contract.probes.post.id],
    ui_readback_id: contract.uiReadback.id,
  };
  const sourceUnsigned = {
    schema_version: 2,
    producer: "v12-native-acceptance-source/v2",
    authority: "sqlite-production-operation",
    shard,
    case_id: caseId,
    nonce,
    action_id: contract.actionId,
    operation_id: contract.operation.id,
    operation_kind: contract.operation.kind,
    operation_result: normalizedOperationResult.result,
    operation_result_sha256: sha256(stableJson(operationProof)),
    operation_handler_id: normalizedOperationResult.handler_id,
    operation_postcondition_id: normalizedOperationResult.postcondition_id,
    command_receipt_id: normalizedOperationResult.receipt_id,
    command_outcome: normalizedOperationResult.outcome,
    committed_effects: normalizedOperationResult.committed_effects,
    source_probe: contract.sourceProbe,
    authority_tables: contract.probes.post.tables,
    pre: preState,
    action: actionState,
    post: postState,
    action_request_sha256: sha256(JSON.stringify(actionRequest)),
  };
  const sourceReceipt = Object.freeze({ ...sourceUnsigned, source_receipt_sha256: sha256(JSON.stringify(sourceUnsigned)) });
  const uiUnsigned = {
    schema_version: 2,
    producer: "v12-native-acceptance-ui-readback/v2",
    shard,
    case_id: caseId,
    nonce,
    declared_action: contract.actionId,
    declared_readback: contract.uiReadback.label,
    readback_id: contract.uiReadback.id,
    source_receipt_sha256: sourceReceipt.source_receipt_sha256,
  };
  const uiReadback = Object.freeze({ ...uiUnsigned, ui_receipt_sha256: sha256(JSON.stringify(uiUnsigned)) });
  return Object.freeze({ source_receipt: sourceReceipt, ui_readback: uiReadback });
}

function validateV12AppFunctionalReadbackObjects({ sourceReceipt, uiReadback, shard, caseId, nonce }) {
  let contract;
  try { contract = v12NativeAcceptanceCaseContract(shard, caseId); }
  catch { genericFail("case_contract_invalid"); }
  if (!exactKeys(sourceReceipt, APP_SOURCE_RECEIPT_KEYS)
    || sourceReceipt.schema_version !== 2 || sourceReceipt.producer !== "v12-native-acceptance-source/v2"
    || sourceReceipt.authority !== "sqlite-production-operation" || sourceReceipt.shard !== shard
    || sourceReceipt.case_id !== caseId || sourceReceipt.nonce !== nonce || !FUNCTIONAL_NONCE.test(sourceReceipt.nonce ?? "")
    || sourceReceipt.action_id !== contract.actionId || sourceReceipt.operation_id !== contract.operation.id
    || sourceReceipt.operation_kind !== contract.operation.kind || sourceReceipt.operation_result !== contract.operation.expectedResult
    || sourceReceipt.operation_handler_id !== contract.operation.handlerId
    || sourceReceipt.operation_postcondition_id !== contract.operation.postcondition.id
    || !SHA256.test(sourceReceipt.operation_result_sha256 ?? "") || sourceReceipt.source_probe !== contract.sourceProbe
    || JSON.stringify(sourceReceipt.authority_tables) !== JSON.stringify(contract.probes.post.tables)
    || !Array.isArray(sourceReceipt.authority_tables) || sourceReceipt.authority_tables.length === 0
    || new Set(sourceReceipt.authority_tables).size !== sourceReceipt.authority_tables.length
    || sourceReceipt.authority_tables.some((table) => !/^[a-z][a-z0-9_]{1,80}$/u.test(table))) genericFail("source_readback_invalid");
  for (const [index, state] of [sourceReceipt.pre, sourceReceipt.action, sourceReceipt.post].entries()) {
    if (!exactKeys(state, APP_SOURCE_STATE_KEYS) || !SHA256.test(state.source_sha256 ?? "")
      || !SHA256.test(state.facts_sha256 ?? "") || state.probe_id !== [contract.probes.pre.id, contract.probes.action.id, contract.probes.post.id][index]
      || !Number.isSafeInteger(state.row_count) || state.row_count < 0
      || !Number.isSafeInteger(state.table_count) || state.table_count !== sourceReceipt.authority_tables.length
      || !Number.isSafeInteger(state.schema_version) || state.schema_version < 1) genericFail("source_readback_invalid");
  }
  if (contract.operation.kind === "repository-read") {
    if (sourceReceipt.command_receipt_id !== null || sourceReceipt.command_outcome !== null
      || sourceReceipt.committed_effects !== 0 || sourceReceipt.pre.facts_sha256 !== sourceReceipt.post.facts_sha256) genericFail("source_readback_invalid");
  } else {
    if (typeof sourceReceipt.command_receipt_id !== "string" || sourceReceipt.command_receipt_id.length < 8
      || !["committed", "already_committed"].includes(sourceReceipt.command_outcome)
      || !Number.isSafeInteger(sourceReceipt.committed_effects) || sourceReceipt.committed_effects < 0
      || (sourceReceipt.command_outcome === "committed" && (sourceReceipt.committed_effects === 0 || sourceReceipt.pre.facts_sha256 === sourceReceipt.post.facts_sha256))
      || (sourceReceipt.command_outcome === "already_committed" && (sourceReceipt.committed_effects !== 0 || sourceReceipt.pre.facts_sha256 !== sourceReceipt.post.facts_sha256))) genericFail("source_readback_invalid");
  }
  const operationProof = {
    operation_id: contract.operation.id,
    result: sourceReceipt.operation_result,
    handler_id: sourceReceipt.operation_handler_id,
    postcondition_id: sourceReceipt.operation_postcondition_id,
    receipt_id: sourceReceipt.command_receipt_id,
    outcome: sourceReceipt.command_outcome,
    committed_effects: sourceReceipt.committed_effects,
    authoritative_facts_sha256: sourceReceipt.post.facts_sha256,
  };
  if (sourceReceipt.operation_result_sha256 !== sha256(stableJson(operationProof))) genericFail("source_readback_invalid");
  const actionRequest = {
    schema_version: 2, producer: "v12-native-acceptance-action-request/v2", shard, case_id: caseId, nonce,
    action_id: contract.actionId, operation_id: contract.operation.id, operation_kind: contract.operation.kind,
    operation_handler_id: contract.operation.handlerId, operation_postcondition_id: contract.operation.postcondition.id,
    expected_result: contract.operation.expectedResult, source_probe: contract.sourceProbe,
    authority_tables: contract.probes.post.tables,
    probe_ids: [contract.probes.pre.id, contract.probes.action.id, contract.probes.post.id],
    ui_readback_id: contract.uiReadback.id,
  };
  const { source_receipt_sha256: sourceReceiptSha256, ...sourceUnsigned } = sourceReceipt;
  if (!SHA256.test(sourceReceipt.action_request_sha256 ?? "")
    || sourceReceipt.action_request_sha256 !== sha256(JSON.stringify(actionRequest))
    || !SHA256.test(sourceReceiptSha256 ?? "") || sourceReceiptSha256 !== sha256(JSON.stringify(sourceUnsigned))) genericFail("source_readback_invalid");
  if (!exactKeys(uiReadback, APP_UI_READBACK_KEYS)
    || uiReadback.schema_version !== 2 || uiReadback.producer !== "v12-native-acceptance-ui-readback/v2"
    || uiReadback.shard !== shard || uiReadback.case_id !== caseId || uiReadback.nonce !== nonce
    || uiReadback.declared_action !== contract.actionId || uiReadback.declared_readback !== contract.uiReadback.label
    || uiReadback.readback_id !== contract.uiReadback.id
    || uiReadback.source_receipt_sha256 !== sourceReceiptSha256) genericFail("ui_readback_invalid");
  const { ui_receipt_sha256: uiReceiptSha256, ...uiUnsigned } = uiReadback;
  if (!SHA256.test(uiReceiptSha256 ?? "") || uiReceiptSha256 !== sha256(JSON.stringify(uiUnsigned))) genericFail("ui_readback_invalid");
  return true;
}

function readV12HierarchyReceipt(hierarchy, marker, code) {
  if (typeof hierarchy !== "string" || !hierarchy.includes("<hierarchy")
    || /(?:password="true"|(?:text|content-desc)="[^"]*(?:@|bearer|password|credential|latitude|longitude|gps))/iu.test(hierarchy)) genericFail(code);
  const matches = [...hierarchy.matchAll(new RegExp(`(?:content-desc|text)="${marker}:([^"]+)"`, "gu"))];
  if (matches.length !== 1) genericFail(code);
  try { return JSON.parse(decodeURIComponent(matches[0][1])); }
  catch { genericFail(code); }
}

export function validateV12FunctionalCaseReadbacks({ hierarchy, report, shard, caseId, nonce }) {
  if (typeof report !== "string" || !report.includes("<testsuite") || /<(?:failure|error|skipped)\b/iu.test(report)) genericFail("junit_readback_invalid");
  const sourceReceipt = readV12HierarchyReceipt(hierarchy, "V12_SOURCE_RECEIPT", "source_readback_invalid");
  const uiReadback = readV12HierarchyReceipt(hierarchy, "V12_UI_READBACK", "ui_readback_invalid");
  validateV12AppFunctionalReadbackObjects({ sourceReceipt, uiReadback, shard, caseId, nonce });
  return Object.freeze({ source_receipt: sourceReceipt, ui_readback: uiReadback });
}

export function createV12FunctionalExecutionReceipt({ nonce, runId, shard, caseId, identity, sourceReceipt, uiReadback, pre, action, post }) {
  validateV12AppFunctionalReadbackObjects({ sourceReceipt, uiReadback, shard, caseId, nonce });
  const receipt = {
    schema_version: 1,
    producer: "v12-functional-execution-receipt/v1",
    nonce,
    run_id: runId,
    shard,
    case_id: caseId,
    identity: Object.freeze({ ...identity }),
    source_receipt: sourceReceipt,
    ui_readback: uiReadback,
    phases: Object.freeze([
      Object.freeze({ phase: "pre", nonce, authority: "authoritative-sqlite", source_sha256: pre?.source_sha256 }),
      Object.freeze({ phase: "action", nonce, authority: "executable-maestro", report_sha256: action?.report_sha256 }),
      Object.freeze({ phase: "post", nonce, authority: "sqlite-and-native-ui", source_sha256: post?.source_sha256, ui_sha256: post?.ui_sha256 }),
    ]),
  };
  return Object.freeze({ ...receipt, receipt_sha256: sha256(JSON.stringify(receipt)) });
}

export function validateV12FunctionalExecutionReceipt(receipt, { runId, shard, caseId, manifest }) {
  const identityKeys = ["source_tree_sha256", "apk_sha256", "installed_apk_sha256", "device_identity_sha256", "configuration_id"];
  const expectedIdentity = {
    source_tree_sha256: manifest?.source?.tree_sha256,
    apk_sha256: manifest?.build?.apk?.sha256,
    installed_apk_sha256: manifest?.device?.installed_apk_sha256,
    device_identity_sha256: manifest?.device?.identity_sha256,
    configuration_id: manifest?.configuration?.id,
  };
  if (!exactKeys(receipt, ["schema_version", "producer", "nonce", "run_id", "shard", "case_id", "identity", "source_receipt", "ui_readback", "phases", "receipt_sha256"])
    || receipt.schema_version !== 1 || receipt.producer !== "v12-functional-execution-receipt/v1"
    || !FUNCTIONAL_NONCE.test(receipt.nonce ?? "") || receipt.run_id !== runId || receipt.shard !== shard || receipt.case_id !== caseId
    || !exactKeys(receipt.identity, identityKeys) || JSON.stringify(receipt.identity) !== JSON.stringify(expectedIdentity)
    || !Array.isArray(receipt.phases) || receipt.phases.length !== FUNCTIONAL_RECEIPT_PHASES.length) genericFail("execution_receipt_invalid");
  validateV12AppFunctionalReadbackObjects({ sourceReceipt: receipt.source_receipt, uiReadback: receipt.ui_readback, shard, caseId, nonce: receipt.nonce });
  const expectedPhaseKeys = [
    ["phase", "nonce", "authority", "source_sha256"],
    ["phase", "nonce", "authority", "report_sha256"],
    ["phase", "nonce", "authority", "source_sha256", "ui_sha256"],
  ];
  const authorities = ["authoritative-sqlite", "executable-maestro", "sqlite-and-native-ui"];
  for (const [index, phase] of receipt.phases.entries()) {
    if (!exactKeys(phase, expectedPhaseKeys[index]) || phase.phase !== FUNCTIONAL_RECEIPT_PHASES[index]
      || phase.nonce !== receipt.nonce || phase.authority !== authorities[index]
      || Object.entries(phase).filter(([key]) => key.endsWith("_sha256")).some(([, value]) => !SHA256.test(value))) genericFail("execution_receipt_invalid");
  }
  if (receipt.phases[0].source_sha256 !== receipt.source_receipt.pre.source_sha256
    || receipt.phases[2].source_sha256 !== receipt.source_receipt.post.source_sha256
    || receipt.phases[2].ui_sha256 !== receipt.ui_readback.ui_receipt_sha256) genericFail("execution_receipt_invalid");
  const { receipt_sha256: receiptSha256, ...unsigned } = receipt;
  if (!SHA256.test(receiptSha256 ?? "") || receiptSha256 !== sha256(JSON.stringify(unsigned))) genericFail("execution_receipt_invalid");
  return true;
}

export function validateV12FunctionalMaestroFlow(flow) {
  const domainOnly = typeof flow === "string" && flow.includes("/native-acceptance/multi-plan");
  const productAction = typeof flow === "string" ? flow.indexOf("V12_PRODUCT_INTERACTION == 'tap'") : -1;
  const productInput = typeof flow === "string" ? flow.indexOf("V12_PRODUCT_INTERACTION == 'input'") : -1;
  const receiptRoute = typeof flow === "string" ? flow.indexOf("/native-acceptance/") : -1;
  if (typeof flow !== "string" || !flow.includes("V12_EVIDENCE_NONCE")
    || !["V12_PRODUCT_URL", "V12_PRODUCT_INTERACTION", "V12_PRODUCT_READY_KIND", "V12_PRODUCT_READY_VALUE", "V12_PRODUCT_ACTION_KIND", "V12_PRODUCT_ACTION_VALUE", "V12_PRODUCT_INPUT_VALUE", "V12_PRODUCT_RESULT_KIND", "V12_PRODUCT_RESULT_VALUE",
      ...Array.from({ length: V12_PRODUCT_PREREQUISITE_LIMIT }, (_, index) => `V12_PRODUCT_PREREQ_${index + 1}_INTERACTION`)]
      .every((name) => flow.includes(`${name} != null`) || flow.includes(`${name} == 'none'`)
        || name === "V12_PRODUCT_INTERACTION" && flow.includes(`${name} == 'domain-observation'`))
    || !flow.includes('openLink: "${V12_PRODUCT_URL}"')
    || !flow.includes("mode=receipt")
    || (domainOnly
      ? !flow.includes("V12_PRODUCT_INTERACTION == 'domain-observation'") || /\btapOn:/u.test(flow)
      : productAction < 0 || productInput < 0 || receiptRoute <= Math.max(productAction, productInput)
        || !flow.includes('tapOn: { id: "${V12_PRODUCT_ACTION_VALUE}" }')
        || !flow.includes('tapOn: "${V12_PRODUCT_ACTION_VALUE}"')
        || !flow.includes('inputText: "${V12_PRODUCT_INPUT_VALUE}"'))
    || /native-acceptance-execute|Native acceptance fixture/u.test(flow)
    || !/assertVisible:\s*\{\s*id:\s*["']native-acceptance-source-receipt["']\s*\}/u.test(flow)
    || !/assertVisible:\s*\{\s*id:\s*["']native-acceptance-readback["']\s*\}/u.test(flow)) genericFail("functional_flow_not_executable");
  return true;
}

export function createV12ProductCaseEnvironment({ shard, caseId, nonce } = {}) {
  if (!LIVE_GENERIC_SHARDS.includes(shard) || typeof caseId !== "string" || !FUNCTIONAL_NONCE.test(nonce ?? "")) genericFail("product_environment_invalid");
  let definition;
  try { definition = v12NativeAcceptanceProductDefinition(shard, caseId); }
  catch { genericFail("product_environment_invalid"); }
  const productUrl = new URL(`gymtracker-devtest://${definition.productPath(nonce)}`);
  const routeParams = definition.routeParams(nonce);
  for (const [key, value] of Object.entries(routeParams)) productUrl.searchParams.append(key, value);
  for (const [key, value] of [["shard", shard], ["case", caseId], ["fixture", V12_PRODUCT_FIXTURE_ID], ["nonce", nonce], ["mode", "product"]]) {
    productUrl.searchParams.append(key, value);
  }
  const unsigned = {
    schema_version: 1,
    producer: "v12-product-case-environment/v1",
    shard,
    case_id: caseId,
    fixture_id: V12_PRODUCT_FIXTURE_ID,
    nonce,
    mode: "product",
    product_url: productUrl.href,
    interaction: definition.interaction,
    ready_kind: definition.readySelector.kind,
    ready_value: definition.readySelector.value,
    action_kind: definition.actionSelector?.kind ?? "none",
    action_value: definition.actionSelector?.value ?? "none",
    input_value: definition.inputValue ?? "none",
    prerequisite_count: definition.prerequisites.length,
    ...Object.fromEntries(Array.from({ length: V12_PRODUCT_PREREQUISITE_LIMIT }, (_, index) => {
      const item = definition.prerequisites[index];
      const prefix = `prerequisite_${index + 1}`;
      return [
        [`${prefix}_interaction`, item?.interaction ?? "none"],
        [`${prefix}_kind`, item?.selector.kind ?? "none"],
        [`${prefix}_value`, item?.selector.value ?? "none"],
        [`${prefix}_input_value`, item?.inputValue ?? "none"],
      ];
    }).flat()),
    result_kind: definition.resultSelector.kind,
    result_value: definition.resultSelector.value,
    callback_group: definition.callbackGroup,
    contract_operation: definition.contractOperation,
    canonical_operation: definition.canonicalOperation,
  };
  return Object.freeze({ ...unsigned, binding_sha256: sha256(JSON.stringify(unsigned)) });
}

export function validateV12ProductCaseEnvironment(environment, expected) {
  if (!exactKeys(environment, PRODUCT_ENVIRONMENT_KEYS)) genericFail("product_environment_invalid");
  const canonical = createV12ProductCaseEnvironment(expected);
  if (JSON.stringify(environment) !== JSON.stringify(canonical)) genericFail("product_environment_invalid");
  let productUrl;
  try { productUrl = new URL(environment.product_url); } catch { genericFail("product_environment_invalid"); }
  let definition;
  try { definition = v12NativeAcceptanceProductDefinition(expected.shard, expected.caseId); }
  catch { genericFail("product_environment_invalid"); }
  const expectedKeys = [...Object.keys(definition.routeParams(expected.nonce)), "shard", "case", "fixture", "nonce", "mode"];
  if (productUrl.protocol !== "gymtracker-devtest:" || productUrl.hostname !== ""
    || decodeURIComponent(productUrl.pathname) !== decodeURIComponent(definition.productPath(expected.nonce))
    || JSON.stringify([...productUrl.searchParams.keys()]) !== JSON.stringify(expectedKeys)) genericFail("product_environment_invalid");
  return true;
}

export function assertV12ProductCaseEnvironmentRegistry({ root = ROOT } = {}) {
  if (V12_NATIVE_ACCEPTANCE_PRODUCT_REGISTRY.length !== 101) genericFail("product_registry_invalid");
  const visualStates = new Map(PHASE20_VISUAL_STATE_REGISTRY.map((state) => [state.id, state]));
  const productionSources = [];
  const collectSources = (directory) => {
    for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__" && entry.name !== "testing") collectSources(relative);
      } else if (/\.(?:ts|tsx)$/u.test(entry.name) && !/\.test\./u.test(entry.name)) {
        productionSources.push(readFileSync(path.join(root, relative), "utf8"));
      }
    }
  };
  collectSources("app");
  collectSources("src");
  const liveProductionSource = productionSources.join("\n");
  if (/nativeAcceptanceAction|useV12NativeAcceptanceProductAction|executeV12NativeAcceptanceProductAction|executeMultiPlanRunningWrapper/u.test(liveProductionSource)) {
    genericFail("product_registry_testing_dispatcher_live");
  }
  const physicalOwners = new Map();
  const semanticOwners = new Map();
  const recordSemanticOwner = ({ callbackGroup, canonicalOperation, callbackSource, callbackOwnerToken }) => {
    const ownership = stableJson({ canonicalOperation, callbackSource, callbackOwnerToken });
    const existing = semanticOwners.get(callbackGroup);
    if (existing !== undefined && existing !== ownership) genericFail("product_registry_semantic_group_collapsed");
    semanticOwners.set(callbackGroup, ownership);
  };
  for (const definition of V12_NATIVE_ACCEPTANCE_PRODUCT_REGISTRY) {
    if (!Array.isArray(definition.prerequisites) || definition.prerequisites.length > V12_PRODUCT_PREREQUISITE_LIMIT) {
      genericFail("product_registry_prerequisite_invalid");
    }
    const productionFiles = [definition.routeSource, definition.selectorSource, definition.readySource, definition.resultSource,
      ...(definition.callbackSource === null ? [] : [definition.callbackSource]),
      ...definition.prerequisites.flatMap((item) => [item.selectorSource, item.callbackSource])];
    if (productionFiles
      .some((file) => !/^(?:app|src)\//u.test(file) || /(?:^|\/)(?:__tests__|testing)(?:\/|$)|\.test\./u.test(file))) {
      genericFail("product_registry_non_production_source");
    }
    let routeSource; let selectorSource; let callbackSource; let readySource; let resultSource; let phaseFlowSource;
    try {
      routeSource = readFileSync(path.join(root, definition.routeSource), "utf8");
      selectorSource = readFileSync(path.join(root, definition.selectorSource), "utf8");
      callbackSource = definition.callbackSource === null ? null : readFileSync(path.join(root, definition.callbackSource), "utf8");
      readySource = readFileSync(path.join(root, definition.readySource), "utf8");
      resultSource = readFileSync(path.join(root, definition.resultSource), "utf8");
      phaseFlowSource = readFileSync(path.join(root, definition.phaseFlowSource), "utf8");
    } catch { genericFail("product_registry_source_missing"); }
    const visualState = visualStates.get(definition.visualStateId);
    const selectorPresent = (source, selector) => source.includes(selector.value);
    if (!selectorPresent(readySource, definition.readySelector)
      || !selectorPresent(resultSource, definition.resultSelector)
      || visualState === undefined || visualState.route.startsWith("/__")
      || routeSource.includes("nativeAcceptanceAction")
      || definition.callbackGroup.includes("generic") || definition.canonicalOperation.includes("generic")) {
      genericFail("product_registry_binding_invalid");
    }
    const contract = v12NativeAcceptanceCaseContract(definition.shard, definition.caseId);
    if (definition.contractOperation !== contract.operation.handlerId) genericFail("product_registry_contract_owner_invalid");
    for (const item of definition.prerequisites) {
      let prerequisiteSelectorSource; let prerequisiteCallbackSource;
      try {
        prerequisiteSelectorSource = readFileSync(path.join(root, item.selectorSource), "utf8");
        prerequisiteCallbackSource = readFileSync(path.join(root, item.callbackSource), "utf8");
      } catch { genericFail("product_registry_source_missing"); }
      if (!selectorPresent(prerequisiteSelectorSource, item.selector)
        || !prerequisiteCallbackSource.includes(item.callbackOwnerToken)
        || (item.interaction === "input") !== (item.inputValue !== null)
        || item.callbackGroup.includes("generic") || item.canonicalOperation.includes("generic")) {
        genericFail("product_registry_prerequisite_invalid");
      }
      recordSemanticOwner(item);
    }
    if (definition.interaction === "tap" || definition.interaction === "input") {
      if (definition.actionSelector === null || definition.callbackSource === null || definition.callbackOwnerToken === null
        || !selectorPresent(selectorSource, definition.actionSelector)
        || !callbackSource?.includes(definition.callbackOwnerToken)) genericFail("product_registry_binding_invalid");
      if ((definition.interaction === "input") !== (definition.inputValue !== null)) genericFail("product_registry_input_invalid");
      const physicalKey = stableJson({ selector: definition.actionSelector, source: definition.selectorSource });
      const existing = physicalOwners.get(physicalKey);
      const ownership = `${definition.callbackGroup}:${definition.canonicalOperation}`;
      if (existing !== undefined && existing !== ownership) genericFail("product_registry_semantic_owner_collapsed");
      physicalOwners.set(physicalKey, ownership);
      recordSemanticOwner(definition);
    } else if (definition.actionSelector !== null || definition.interaction === "domain-observation"
      && (definition.callbackSource !== null || definition.callbackOwnerToken !== null)) {
      genericFail("product_registry_observation_action_invalid");
    } else if (definition.interaction === "ui-observation") {
      recordSemanticOwner(definition);
    }
  }
  return true;
}

function exactGenericArguments(args) {
  if (!Array.isArray(args) || args.length !== 4 || args[0] !== "--run" || args[2] !== "--shard"
    || !V12_RUN_ID.test(args[1] ?? "") || !Object.hasOwn(V12_MAESTRO_FLOW_CONTRACTS, args[3] ?? "")) {
    genericFail("arguments_invalid");
  }
  return Object.freeze({ runId: args[1], shard: args[3] });
}

function genericIdentityMatches(manifest, current) {
  const expected = {
    head: manifest.source.head,
    tree_sha256: manifest.source.tree_sha256,
    package: manifest.build.package,
    apk_sha256: manifest.build.apk.sha256,
    installed_apk_sha256: manifest.device.installed_apk_sha256,
    certificate_sha256: manifest.build.apk.certificate_sha256,
    device_identity_sha256: manifest.device.identity_sha256,
    settings_sha256: manifest.device.settings_sha256,
    configuration_id: manifest.configuration.id,
  };
  if (Object.entries(expected).some(([key, value]) => current?.[key] !== value)) genericFail("identity_mismatch");
}

function containsVerdictAuthority(value) {
  if (Array.isArray(value)) return value.some(containsVerdictAuthority);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => (
    ["verdict", "readiness", "final_evidence", "seal"].includes(key) || containsVerdictAuthority(child)
  ));
}

function immutableWrite(root, relativePath, value, write = undefined) {
  if (typeof write === "function") return write(relativePath, value);
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`) || existsSync(absolute)) genericFail("immutable_output_invalid");
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx" });
}

function sourceOrderedCaseIds(bytes, shard) {
  try { return deriveV12MaestroCaseIdsFromSource(shard, bytes.toString("utf8")); }
  catch { genericFail("source_case_ids_invalid"); }
}

function validateSourceOrderedObservations(observations, caseIds, shard) {
  if (!Array.isArray(observations) || observations.length !== caseIds.length) genericFail("observation_count_invalid");
  const seen = new Set();
  for (const [index, observation] of observations.entries()) {
    if (!observation || observation.case_id !== caseIds[index] || observation.ordinal !== index + 1
      || observation.fixture_id !== "v12-synthetic-fixtures-r18" || typeof observation.report_sha256 !== "string"
      || !SHA256.test(observation.report_sha256) || seen.has(observation.case_id)
      || observation.execution_receipt === undefined
      || containsVerdictAuthority(observation)) genericFail("observation_mapping_invalid");
    seen.add(observation.case_id);
  }
  if (seen.size !== caseIds.length || shard === "recovery") genericFail("observation_mapping_invalid");
}

function resolvedExecutionTools(value) {
  if (!value || ![V12_PRODUCTION_EXECUTION_ORIGIN, V12_TEST_EXECUTION_ORIGIN].includes(value.execution_origin)
    || value.test_only !== (value.execution_origin === V12_TEST_EXECUTION_ORIGIN)) genericFail("toolchain_invalid");
  const resolved = { execution_origin: value.execution_origin, test_only: value.test_only };
  for (const name of DIRECT_MAESTRO_TOOL_NAMES) {
    if (typeof value[name] !== "string" || !path.isAbsolute(value[name])) genericFail("toolchain_invalid");
    try {
      const executable = realpathSync(value[name]);
      if (!path.isAbsolute(executable) || !statSync(executable).isFile()) genericFail("toolchain_invalid");
      accessSync(executable, constants.X_OK);
      resolved[name] = executable;
    } catch (error) {
      if (error instanceof Error && error.message === "v12_maestro_toolchain_invalid") throw error;
      genericFail("toolchain_invalid");
    }
  }
  return Object.freeze(resolved);
}

function toolVersion(execute, name, executable, testOnly) {
  if (testOnly) return "test-controlled";
  let output;
  try { output = execute(executable, DIRECT_MAESTRO_TOOL_VERSIONS[name], { encoding: "utf8", maxBuffer: 64 * 1024, timeout: V12_MAESTRO_COMMAND_BUDGETS.version_ms, killSignal: "SIGKILL" }); }
  catch { genericFail("toolchain_invalid"); }
  const line = String(output).split(/\r?\n/u).map((value) => value.trim()).find(Boolean);
  if (line === undefined || line.length > 512 || /[\u0000-\u001f\u007f]/u.test(line)) genericFail("toolchain_invalid");
  return line;
}

async function toolVersionAsync(run, name, executable, testOnly) {
  if (testOnly) return "test-controlled";
  let output;
  try { output = await run(executable, DIRECT_MAESTRO_TOOL_VERSIONS[name], { encoding: "utf8", maxBuffer: 64 * 1024, timeoutMs: V12_MAESTRO_COMMAND_BUDGETS.version_ms }); }
  catch { genericFail("toolchain_invalid"); }
  const line = String(output).split(/\r?\n/u).map((value) => value.trim()).find(Boolean);
  if (line === undefined || line.length > 512 || /[\u0000-\u001f\u007f]/u.test(line)) genericFail("toolchain_invalid");
  return line;
}

export function createV12DirectMaestroToolAttestation({ execute = execFileSync, executionTools, shard } = {}) {
  const tools = resolvedExecutionTools(executionTools);
  if (!LIVE_GENERIC_SHARDS.includes(shard)) genericFail("tool_attestation_invalid");
  return Object.freeze({
    schema_version: 1,
    action: shard,
    execution_origin: tools.execution_origin,
    test_only: tools.test_only,
    tools: Object.freeze(DIRECT_MAESTRO_TOOL_NAMES.map((name) => Object.freeze({
      name,
      executable_realpath_sha256: sha256(tools[name]),
      executable_sha256: sourceSha256(tools[name]),
      version: toolVersion(execute, name, tools[name], tools.test_only),
    }))),
  });
}

async function createV12DirectMaestroToolAttestationAsync({ run, executionTools, shard }) {
  const tools = resolvedExecutionTools(executionTools);
  if (!LIVE_GENERIC_SHARDS.includes(shard)) genericFail("tool_attestation_invalid");
  const versions = await Promise.all(DIRECT_MAESTRO_TOOL_NAMES.map((name) => toolVersionAsync(run, name, tools[name], tools.test_only)));
  return Object.freeze({
    schema_version: 1,
    action: shard,
    execution_origin: tools.execution_origin,
    test_only: tools.test_only,
    tools: Object.freeze(DIRECT_MAESTRO_TOOL_NAMES.map((name, index) => Object.freeze({
      name,
      executable_realpath_sha256: sha256(tools[name]),
      executable_sha256: sourceSha256(tools[name]),
      version: versions[index],
    }))),
  });
}

function directMaestroRequestAttestation({ runId, shard, manifest, snapshot, gitAttestationSha256, toolAttestation, observations }) {
  return sha256(JSON.stringify({
    schema_version: 2,
    action: shard,
    run_id: runId,
    source_tree_sha256: manifest.source.tree_sha256,
    apk_sha256: manifest.build.apk.sha256,
    device_identity_sha256: manifest.device.identity_sha256,
    flow_sha256: snapshot.flow_sha256,
    source_sha256: snapshot.source_sha256,
    git_attestation_sha256: gitAttestationSha256,
    tool_attestation_sha256: sha256(JSON.stringify(toolAttestation)),
    measurement_sha256: sha256(JSON.stringify(observations.map(({ device_measurement: measurement }) => measurement))),
    execution_receipt_sha256: sha256(JSON.stringify(observations.map(({ execution_receipt: receipt }) => receipt?.receipt_sha256))),
  }));
}

function executionOrigin({ root, runId, shard, manifest, snapshot, tools, gitAttestationSha256, toolAttestation, observations }) {
  const production = tools.execution_origin === V12_PRODUCTION_EXECUTION_ORIGIN;
  const sources = V12_MAESTRO_SOURCE_PATHS[shard];
  if (sources === undefined) genericFail("toolchain_invalid");
  return Object.freeze({
    schema_version: 1,
    action: shard,
    kind: production ? "production-default-launcher" : "test-fixture",
    toolchain_origin: tools.execution_origin,
    default_launcher: production,
    test_only: !production,
    adapter_source_sha256: sourceSha256(path.join(root, sources.adapter)),
    launcher_source_sha256: sourceSha256(path.join(root, sources.launcher)),
    domain_source_sha256: snapshot.source_sha256[sources.domain],
    request_attestation_sha256: directMaestroRequestAttestation({
      runId, shard, manifest, snapshot, gitAttestationSha256, toolAttestation, observations,
    }),
  });
}

function directMaestroAdb(run, adbExecutable, serial, timeoutMs = V12_MAESTRO_COMMAND_BUDGETS.adb_ms) {
  return async (...command) => {
    try {
      return String(await run(adbExecutable, ["-s", serial, ...command], {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        timeoutMs,
      })).trim();
    } catch { genericFail("native_command_failed"); }
  };
}

async function directMaestroUiReadback(adb, nonce) {
  const remote = `/sdcard/v12-functional-ui-${nonce}.xml`;
  await adb("shell", "uiautomator", "dump", remote);
  const value = await adb("exec-out", "cat", remote);
  if (typeof value !== "string" || !value.includes("<hierarchy")
    || /(?:password="true"|(?:text|content-desc)="[^"]*(?:@|bearer|password|credential|latitude|longitude|gps))/iu.test(value)) genericFail("ui_readback_invalid");
  return value;
}

async function measureDirectMaestroDeviceAsync(adb, serial, manifest) {
  if (await adb("get-state") !== "device") genericFail("identity_mismatch");
  const packageName = manifest.build.package;
  const packages = (await adb("shell", "pm", "list", "packages", packageName)).split(/\r?\n/u).filter(Boolean);
  if (packages.length !== 1 || packages[0] !== `package:${packageName}`) genericFail("identity_mismatch");
  const installedPaths = (await adb("shell", "pm", "path", packageName)).split(/\r?\n/u).filter(Boolean);
  if (installedPaths.length !== 1 || !/^package:\/data\/app\/[A-Za-z0-9_./=+~-]+\.apk$/u.test(installedPaths[0])) genericFail("identity_mismatch");
  const installedApkSha256 = (await adb("shell", "sha256sum", installedPaths[0].slice("package:".length))).split(/\s/u)[0];
  const abi = await adb("shell", "getprop", "ro.product.cpu.abi");
  const apiLevel = await adb("shell", "getprop", "ro.build.version.sdk");
  const model = await adb("shell", "getprop", "ro.product.model");
  const settings = {};
  for (const { key, adb_args: args } of V12_CANONICAL_RESTORATION_SETTINGS) settings[key] = await adb(...args);
  const measurement = Object.freeze({
    schema_version: 1,
    source: "attested-absolute-adb/v1",
    package: packageName,
    installed_apk_sha256: installedApkSha256,
    device_identity_sha256: phase18DeviceIdentitySha256({ serial, abi, apiLevel, model }),
    abi,
    settings_sha256: digestV12CanonicalRestorationSnapshot(settings),
    configuration_id: manifest.configuration.id,
  });
  if (!SHA256.test(measurement.installed_apk_sha256)) genericFail("identity_mismatch");
  return Object.freeze({ measurement, settings });
}

export function readV12DirectMaestroDeviceMeasurement(manifest, {
  serial = process.env.V12_DEVICE_SERIAL,
  execute = execFileSync,
  executionTools = resolveV12NativeExecutionTools({ domain: true }),
} = {}) {
  if (typeof serial !== "string" || !/^[A-Za-z0-9._:-]+$/u.test(serial) || serial.startsWith("emulator-")) genericFail("ephemeral_device_required");
  const tools = resolvedExecutionTools(executionTools);
  const adb = (...command) => {
    try { return String(execute(tools.adb, ["-s", serial, ...command], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
      timeout: V12_MAESTRO_COMMAND_BUDGETS.adb_ms, killSignal: "SIGKILL" })).trim(); }
    catch { genericFail("native_command_failed"); }
  };
  if (adb("get-state") !== "device") genericFail("identity_mismatch");
  const packageName = manifest.build.package;
  const packages = adb("shell", "pm", "list", "packages", packageName).split(/\r?\n/u).filter(Boolean);
  if (packages.length !== 1 || packages[0] !== `package:${packageName}`) genericFail("identity_mismatch");
  const installedPaths = adb("shell", "pm", "path", packageName).split(/\r?\n/u).filter(Boolean);
  if (installedPaths.length !== 1 || !/^package:\/data\/app\/[A-Za-z0-9_./=+~-]+\.apk$/u.test(installedPaths[0])) genericFail("identity_mismatch");
  const installedApkSha256 = adb("shell", "sha256sum", installedPaths[0].slice("package:".length)).split(/\s/u)[0];
  const abi = adb("shell", "getprop", "ro.product.cpu.abi");
  const apiLevel = adb("shell", "getprop", "ro.build.version.sdk");
  const model = adb("shell", "getprop", "ro.product.model");
  const settings = readV12CanonicalRestorationSnapshot((args) => adb(...args));
  const measurement = Object.freeze({ schema_version: 1, source: "attested-absolute-adb/v1", package: packageName,
    installed_apk_sha256: installedApkSha256, device_identity_sha256: phase18DeviceIdentitySha256({ serial, abi, apiLevel, model }),
    abi, settings_sha256: digestV12CanonicalRestorationSnapshot(settings), configuration_id: manifest.configuration.id });
  if (!SHA256.test(measurement.installed_apk_sha256)) genericFail("identity_mismatch");
  return measurement;
}

async function restoreDirectMaestroSettings(adb, settings) {
  for (const { key, adb_args: getArgs } of V12_CANONICAL_RESTORATION_SETTINGS) {
    const [, , scope] = getArgs;
    const value = settings[key];
    await adb("shell", "settings", value === "null" ? "delete" : "put", scope, key, ...(value === "null" ? [] : [value]));
  }
}

function directMaestroIdentity(manifest, sourceIdentity, apkSha256, measurement) {
  return Object.freeze({
    source_tree_sha256: sourceIdentity.tree_sha256,
    package: measurement.package,
    apk_sha256: apkSha256,
    installed_apk_sha256: measurement.installed_apk_sha256,
    certificate_sha256: manifest.build.apk.certificate_sha256,
    device_identity_sha256: measurement.device_identity_sha256,
    settings_sha256: measurement.settings_sha256,
    configuration_id: measurement.configuration_id,
  });
}

function assertDirectMaestroMeasurement(manifest, sourceIdentity, apkSha256, measurement) {
  genericIdentityMatches(manifest, {
    head: sourceIdentity.head,
    tree_sha256: sourceIdentity.tree_sha256,
    package: measurement.package,
    apk_sha256: apkSha256,
    installed_apk_sha256: measurement.installed_apk_sha256,
    certificate_sha256: manifest.build.apk.certificate_sha256,
    device_identity_sha256: measurement.device_identity_sha256,
    settings_sha256: measurement.settings_sha256,
    configuration_id: measurement.configuration_id,
  });
  if (measurement.abi !== manifest.device.abi) genericFail("identity_mismatch");
}

function validateDirectMaestroToolAttestation(value, shard, executionOrigin, allowTest) {
  if (!exactKeys(value, ["schema_version", "action", "execution_origin", "test_only", "tools"])
    || value.schema_version !== 1 || value.action !== shard
    || value.execution_origin !== executionOrigin.toolchain_origin
    || value.test_only !== executionOrigin.test_only
    || (!allowTest && value.test_only !== false)
    || !Array.isArray(value.tools) || value.tools.length !== DIRECT_MAESTRO_TOOL_NAMES.length) genericFail("tool_attestation_invalid");
  for (const [index, descriptor] of value.tools.entries()) {
    if (!exactKeys(descriptor, ["name", "executable_realpath_sha256", "executable_sha256", "version"])
      || descriptor.name !== DIRECT_MAESTRO_TOOL_NAMES[index]
      || !SHA256.test(descriptor.executable_realpath_sha256 ?? "")
      || !SHA256.test(descriptor.executable_sha256 ?? "")
      || typeof descriptor.version !== "string" || descriptor.version.length < 1 || descriptor.version.length > 512
      || /[\u0000-\u001f\u007f]/u.test(descriptor.version)
      || (value.test_only ? descriptor.version !== "test-controlled" : descriptor.version === "test-controlled")) genericFail("tool_attestation_invalid");
  }
}

function validateDirectMaestroMeasurement(value, manifest) {
  if (!exactKeys(value, ["schema_version", "source", "package", "installed_apk_sha256", "device_identity_sha256", "abi", "settings_sha256", "configuration_id"])
    || value.schema_version !== 1 || value.source !== "attested-absolute-adb/v1"
    || value.package !== manifest.build.package
    || value.installed_apk_sha256 !== manifest.device.installed_apk_sha256
    || value.installed_apk_sha256 !== manifest.build.apk.sha256
    || value.device_identity_sha256 !== manifest.device.identity_sha256
    || value.abi !== manifest.device.abi
    || value.settings_sha256 !== manifest.device.settings_sha256
    || value.configuration_id !== manifest.configuration.id) genericFail("measurement_invalid");
}

export function validateV12DirectMaestroMapping(mapping, { root = ROOT, manifest, shard, allowTest = false } = {}) {
  if (!LIVE_GENERIC_SHARDS.includes(shard)
    || !exactKeys(mapping, ["schema_version", "producer", "run_id", "shard", "identity", "git_attestation_sha256", "execution_origin", "tool_attestation", "flow_sha256", "source_sha256", "case_ids", "observations"])
    || mapping.schema_version !== 2 || mapping.producer !== "v12-maestro-source-map/v2" || mapping.shard !== shard
    || !manifest || mapping.run_id !== manifest.run_id || !SHA256.test(mapping.git_attestation_sha256 ?? "")) genericFail("mapping_invalid");
  const contract = V12_MAESTRO_FLOW_CONTRACTS[shard];
  if (!allowTest) assertV12ProductCaseEnvironmentRegistry({ root });
  const caseIds = deriveV12MaestroCaseIdsFromSource(shard, readFileSync(path.join(root, contract.sources[0]), "utf8"));
  if (JSON.stringify(mapping.case_ids) !== JSON.stringify(caseIds)) genericFail("mapping_invalid");
  validateSourceOrderedObservations(mapping.observations, caseIds, shard);
  const origin = mapping.execution_origin;
  const production = origin?.kind === "production-default-launcher" && origin.default_launcher === true
    && origin.test_only === false && origin.toolchain_origin === V12_PRODUCTION_EXECUTION_ORIGIN;
  const testOnly = allowTest && origin?.kind === "test-fixture" && origin.default_launcher === false
    && origin.test_only === true && origin.toolchain_origin === V12_TEST_EXECUTION_ORIGIN;
  if (!exactKeys(origin, ["schema_version", "action", "kind", "toolchain_origin", "default_launcher", "test_only", "adapter_source_sha256", "launcher_source_sha256", "domain_source_sha256", "request_attestation_sha256"])
    || origin.schema_version !== 1 || origin.action !== shard || (!production && !testOnly)
    || origin.adapter_source_sha256 !== sourceSha256(path.join(root, V12_MAESTRO_SOURCE_PATHS[shard].adapter))
    || origin.launcher_source_sha256 !== sourceSha256(path.join(root, V12_MAESTRO_SOURCE_PATHS[shard].launcher))
    || origin.domain_source_sha256 !== sourceSha256(path.join(root, V12_MAESTRO_SOURCE_PATHS[shard].domain))) genericFail("mapping_origin_invalid");
  validateDirectMaestroToolAttestation(mapping.tool_attestation, shard, origin, allowTest);
  for (const observation of mapping.observations) {
    if (!exactKeys(observation, ["case_id", "ordinal", "fixture_id", "product_environment", "report_sha256", "device_measurement", "execution_receipt"])
      || !exactKeys(observation.device_measurement, ["before", "after"])) genericFail("measurement_invalid");
    validateV12ProductCaseEnvironment(observation.product_environment, {
      shard, caseId: observation.case_id, nonce: observation.execution_receipt?.nonce,
    });
    validateDirectMaestroMeasurement(observation.device_measurement.before, manifest);
    validateDirectMaestroMeasurement(observation.device_measurement.after, manifest);
    if (JSON.stringify(observation.device_measurement.before) !== JSON.stringify(observation.device_measurement.after)) genericFail("measurement_drift");
    validateV12FunctionalExecutionReceipt(observation.execution_receipt, {
      runId: mapping.run_id, shard, caseId: observation.case_id, manifest,
    });
    if (observation.execution_receipt.phases[1].report_sha256 !== observation.report_sha256) genericFail("execution_receipt_invalid");
  }
  if (new Set(mapping.observations.map(({ execution_receipt: receipt }) => receipt.nonce)).size !== mapping.observations.length) genericFail("execution_receipt_invalid");
  const firstMeasurement = mapping.observations[0]?.device_measurement.before;
  const expectedIdentity = firstMeasurement === undefined ? undefined : {
    source_tree_sha256: manifest.source.tree_sha256,
    package: firstMeasurement.package,
    apk_sha256: manifest.build.apk.sha256,
    installed_apk_sha256: firstMeasurement.installed_apk_sha256,
    certificate_sha256: manifest.build.apk.certificate_sha256,
    device_identity_sha256: firstMeasurement.device_identity_sha256,
    settings_sha256: firstMeasurement.settings_sha256,
    configuration_id: firstMeasurement.configuration_id,
  };
  if (JSON.stringify(mapping.identity) !== JSON.stringify(expectedIdentity)
    || mapping.flow_sha256 !== sourceSha256(path.join(root, contract.flow))
    || !exactKeys(mapping.source_sha256, contract.sources)
    || contract.sources.some((file) => mapping.source_sha256[file] !== sourceSha256(path.join(root, file)))) genericFail("mapping_identity_invalid");
  const requestSha256 = directMaestroRequestAttestation({
    runId: mapping.run_id,
    shard,
    manifest,
    snapshot: { flow_sha256: mapping.flow_sha256, source_sha256: mapping.source_sha256 },
    gitAttestationSha256: mapping.git_attestation_sha256,
    toolAttestation: mapping.tool_attestation,
    observations: mapping.observations,
  });
  if (origin.request_attestation_sha256 !== requestSha256) genericFail("request_attestation_invalid");
  return true;
}

export function executeGenericV12Maestro(args = process.argv.slice(2), dependencies = {}) {
  const { runId, shard } = exactGenericArguments(args);
  const root = dependencies.root ?? ROOT;
  const contract = V12_MAESTRO_FLOW_CONTRACTS[shard];
  const manifestPath = `artifacts/native/v1.2/${runId}/build.json`;
  const readJson = dependencies.readJson ?? ((file) => JSON.parse(readFileSync(path.join(root, file), "utf8")));
  const readBytes = dependencies.readBytes ?? ((file) => readFileSync(path.join(root, file)));
  const exists = dependencies.exists ?? ((file) => existsSync(path.join(root, file)));
  if (!exists(manifestPath) || !exists(contract.flow) || contract.sources.some((file) => !exists(file))) genericFail("artifact_missing");
  const manifest = readJson(manifestPath);
  try { validateGenericV12RunManifest(manifest); }
  catch { genericFail("manifest_invalid"); }
  if (manifest.run_id !== runId || manifest.mode !== "live" || manifest.build.package !== V12_PACKAGE) genericFail("manifest_invalid");
  genericIdentityMatches(manifest, dependencies.currentIdentity);

  const snapshot = () => Object.freeze({
    flow_sha256: sha256(readBytes(contract.flow)),
    source_sha256: Object.freeze(Object.fromEntries(contract.sources.map((file) => [file, sha256(readBytes(file))]))),
  });
  const before = snapshot();
  const caseIds = contract.prefix === undefined ? Object.freeze([]) : sourceOrderedCaseIds(readBytes(contract.sources[0]), shard);
  const adapter = dependencies.adapter;
  if (!adapter || typeof adapter.snapshotSettings !== "function" || typeof adapter.execute !== "function" || typeof adapter.restoreSettings !== "function") genericFail("adapter_invalid");
  const settings = adapter.snapshotSettings();
  let result;
  let executionError;
  try {
    result = adapter.execute(Object.freeze({ run_id: runId, shard, flow: contract.flow, settings }));
    if (containsVerdictAuthority(result)) genericFail("producer_verdict_forbidden");
  } catch (error) {
    executionError = error;
  } finally {
    if (adapter.restoreSettings(settings) !== true) genericFail("settings_restore_failed");
  }
  if (executionError !== undefined) throw executionError;
  const after = snapshot();
  if (before.flow_sha256 !== after.flow_sha256) genericFail("flow_hash_mismatch");
  if (JSON.stringify(before.source_sha256) !== JSON.stringify(after.source_sha256)) genericFail("source_hash_mismatch");
  const rawObservations = structuredClone(result?.observations ?? []);
  if (caseIds.length > 0) validateSourceOrderedObservations(rawObservations, caseIds, shard);
  const record = Object.freeze({
    schema_version: 1,
    producer: "v12-maestro-runner/v1",
    run_id: runId,
    shard,
    identity: Object.freeze({
      source_tree_sha256: manifest.source.tree_sha256,
      apk_sha256: manifest.build.apk.sha256,
      installed_apk_sha256: manifest.device.installed_apk_sha256,
      certificate_sha256: manifest.build.apk.certificate_sha256,
      device_identity_sha256: manifest.device.identity_sha256,
      settings_sha256: manifest.device.settings_sha256,
      configuration_id: manifest.configuration.id,
    }),
    flow_sha256: before.flow_sha256,
    source_sha256: before.source_sha256,
    case_ids: caseIds,
    observations: Object.freeze(rawObservations),
  });
  if (["multi-plan", "workout", "library-running"].includes(shard)) {
    immutableWrite(root, `artifacts/native/v1.2/${runId}/mapping/${shard}.json`, record, dependencies.writeImmutableJson);
  } else immutableWrite(root, `artifacts/native/v1.2/${runId}/shards/${shard}.json`, record, dependencies.writeImmutableJson);
  return record;
}

/**
 * Executes a generic source-owned Maestro flow with an ephemeral device lease.
 * It is intentionally separate from recovery: recovery carries destructive-cut
 * semantics that cannot be safely inferred for normal product flows.
 */
export async function executeLiveV12GenericMaestro(args = process.argv.slice(2), dependencies = {}) {
  const { runId, shard } = exactGenericArguments(args);
  if (shard === "recovery") return executeLiveV12RecoveryMaestro(args, dependencies);
  if (!LIVE_GENERIC_SHARDS.includes(shard)) genericFail("live_shard_invalid");
  const root = dependencies.root ?? ROOT;
  const readJson = dependencies.readJson ?? ((file) => JSON.parse(readFileSync(path.join(root, file), "utf8")));
  const manifest = readJson(`artifacts/native/v1.2/${runId}/build.json`);
  try { validateGenericV12RunManifest(manifest); } catch { genericFail("manifest_invalid"); }
  if (manifest.run_id !== runId || manifest.mode !== "live" || manifest.build.package !== V12_PACKAGE) genericFail("manifest_invalid");
  const gitExecution = dependencies.gitExecution ?? (manifest.evidence_origin === "native"
    ? readV12RetainedGitExecution({ root, runManifest: manifest, env: dependencies.environment ?? process.env })
    : resolveV12GitExecution({ env: dependencies.environment ?? process.env }));
  const sourceIdentity = validateV12LiveSourceLineage(manifest, { ...dependencies, gitExecution });
  const contract = V12_MAESTRO_FLOW_CONTRACTS[shard];
  const flowPath = path.join(root, contract.flow);
  if (!existsSync(flowPath)) genericFail("artifact_missing");
  validateV12FunctionalMaestroFlow(readFileSync(flowPath, "utf8"));
  const sourceBytes = readFileSync(path.join(root, contract.sources[0]));
  const caseIds = sourceOrderedCaseIds(sourceBytes, shard);
  const serial = dependencies.serial ?? process.env.V12_DEVICE_SERIAL;
  if (typeof serial !== "string" || !/^[A-Za-z0-9._:-]+$/u.test(serial) || serial.startsWith("emulator-")) genericFail("ephemeral_device_required");
  const tools = resolvedExecutionTools(dependencies.executionTools
    ?? resolveV12NativeExecutionTools({ domain: true, env: dependencies.environment ?? process.env }));
  if (!tools.test_only) assertV12ProductCaseEnvironmentRegistry({ root });
  const runnerDependencies = tools.test_only && dependencies.runProcess === undefined && dependencies.execFileSync === undefined
    ? { ...dependencies, execFileSync } : dependencies;
  const run = commandRunner(runnerDependencies, dependencies.signal);
  await assertMaestroVersionAsync(run, tools.maestro);
  const toolAttestation = await createV12DirectMaestroToolAttestationAsync({ run, executionTools: tools, shard });
  const apkSha256 = retainedApkSha256(root, manifest);
  const outputRoot = `artifacts/native/v1.2/${runId}`;
  const reportPath = `${outputRoot}/maestro/${shard}.xml`;
  const mappingPath = `${outputRoot}/mapping/${shard}.json`;
  const leaseDirectory = path.join(root, `${outputRoot}/.leases`);
  const serialSha256 = sha256(serial);
  const leasePath = path.join(leaseDirectory, `device-${serialSha256}.lease`);
  const legacyDeviceLeaseExists = existsSync(leaseDirectory) && readdirSync(leaseDirectory).some((name) => {
    const candidate = path.join(leaseDirectory, name);
    try { return readFileSync(candidate, "utf8") === `${serialSha256}\n`; }
    catch { return true; }
  });
  if ([reportPath, mappingPath].some((file) => existsSync(path.join(root, file))) || legacyDeviceLeaseExists) genericFail("immutable_output_invalid");
  mkdirSync(leaseDirectory, { recursive: true });
  try { writeFileSync(leasePath, `${sha256(shard)}\n`, { flag: "wx" }); }
  catch { genericFail("immutable_output_invalid"); }
  const adb = dependencies.adb ?? directMaestroAdb(run, tools.adb, serial);
  const cleanupRun = commandRunner(runnerDependencies, undefined);
  const cleanupAdb = dependencies.adb ?? directMaestroAdb(cleanupRun, tools.adb, serial);
  const reports = [];
  const observations = [];
  let restored = false;
  let retainLease = false;
  let outcome;
  try {
    for (const [index, caseId] of caseIds.entries()) {
      const temporary = path.join(root, `${outputRoot}/maestro/.${shard}-${index + 1}.xml`);
      mkdirSync(path.dirname(temporary), { recursive: true });
      const before = await measureDirectMaestroDeviceAsync(adb, serial, manifest);
      assertDirectMaestroMeasurement(manifest, sourceIdentity, apkSha256, before.measurement);
      const nonce = randomBytes(24).toString("hex");
      const productEnvironment = createV12ProductCaseEnvironment({ shard, caseId, nonce });
      const prerequisiteEnvironmentArguments = Array.from({ length: V12_PRODUCT_PREREQUISITE_LIMIT }, (_, prerequisiteIndex) => {
        const number = prerequisiteIndex + 1;
        return [
          "-e", `V12_PRODUCT_PREREQ_${number}_INTERACTION=${productEnvironment[`prerequisite_${number}_interaction`]}`,
          "-e", `V12_PRODUCT_PREREQ_${number}_KIND=${productEnvironment[`prerequisite_${number}_kind`]}`,
          "-e", `V12_PRODUCT_PREREQ_${number}_VALUE=${productEnvironment[`prerequisite_${number}_value`]}`,
          "-e", `V12_PRODUCT_PREREQ_${number}_INPUT_VALUE=${productEnvironment[`prerequisite_${number}_input_value`]}`,
        ];
      }).flat();
      const captureUiReadback = dependencies.captureUiReadback ?? ((input) => directMaestroUiReadback(input.adb, input.nonce));
      let after;
      let flowError;
      try {
        await run(tools.maestro, ["test", "--device", serial, "-e", `V12_CASE_ID=${caseId}`, "-e", `V12_EVIDENCE_NONCE=${nonce}`, "-e", "V12_CONFIG_ID=AP-L-C390-P-F100", "-e", `V12_FIXTURE_ID=${V12_PRODUCT_FIXTURE_ID}`, "-e", `V12_PRODUCT_URL=${productEnvironment.product_url}`, "-e", `V12_PRODUCT_INTERACTION=${productEnvironment.interaction}`, "-e", `V12_PRODUCT_READY_KIND=${productEnvironment.ready_kind}`, "-e", `V12_PRODUCT_READY_VALUE=${productEnvironment.ready_value}`, ...prerequisiteEnvironmentArguments, "-e", `V12_PRODUCT_ACTION_KIND=${productEnvironment.action_kind}`, "-e", `V12_PRODUCT_ACTION_VALUE=${productEnvironment.action_value}`, "-e", `V12_PRODUCT_INPUT_VALUE=${productEnvironment.input_value}`, "-e", `V12_PRODUCT_RESULT_KIND=${productEnvironment.result_kind}`, "-e", `V12_PRODUCT_RESULT_VALUE=${productEnvironment.result_value}`, "--format", "junit", "--output", temporary, flowPath], { timeoutMs: V12_MAESTRO_COMMAND_BUDGETS.maestro_case_ms, maxBuffer: 16 * 1024 * 1024 });
      } catch (error) {
        if (/^v12_maestro_process_tree_(?:enumeration|termination)_failed$/u.test(error?.message ?? "")) {
          retainLease = true;
        }
        flowError = new Error(error?.message === "v12_maestro_process_timeout" ? "v12_maestro_native_command_timeout"
          : error?.message === "v12_maestro_process_cancelled" ? "v12_maestro_native_command_cancelled" : "v12_maestro_native_command_failed");
      }
      finally {
        await restoreDirectMaestroSettings(cleanupAdb, before.settings);
        after = await measureDirectMaestroDeviceAsync(cleanupAdb, serial, manifest);
        assertDirectMaestroMeasurement(manifest, sourceIdentity, apkSha256, after.measurement);
        if (JSON.stringify(before.measurement) !== JSON.stringify(after.measurement)) genericFail("measurement_drift");
      }
      if (flowError !== undefined) throw flowError;
      if (!existsSync(temporary)) genericFail("report_missing");
      const report = readFileSync(temporary, "utf8");
      let uiHierarchy;
      if (tools.test_only && dependencies.captureUiReadback === undefined) {
        const state = { source_sha256: sha256(`test-source:${caseId}`), row_count: 1, table_count: 1, schema_version: 42 };
        const appReadbacks = createV12AppFunctionalReadbacks({
          shard, caseId, nonce, pre: state, action: state, post: state,
        });
        uiHierarchy = `<hierarchy><node content-desc="V12_SOURCE_RECEIPT:${encodeURIComponent(JSON.stringify(appReadbacks.source_receipt))}"/><node content-desc="V12_UI_READBACK:${encodeURIComponent(JSON.stringify(appReadbacks.ui_readback))}"/></hierarchy>`;
      } else {
        uiHierarchy = await captureUiReadback({ adb, manifest, nonce, caseId });
      }
      const appReadbacks = validateV12FunctionalCaseReadbacks({ hierarchy: uiHierarchy, report, shard, caseId, nonce });
      const executionReceipt = createV12FunctionalExecutionReceipt({
        nonce, runId, shard, caseId,
        identity: {
          source_tree_sha256: manifest.source.tree_sha256,
          apk_sha256: manifest.build.apk.sha256,
          installed_apk_sha256: manifest.device.installed_apk_sha256,
          device_identity_sha256: manifest.device.identity_sha256,
          configuration_id: manifest.configuration.id,
        },
        sourceReceipt: appReadbacks.source_receipt,
        uiReadback: appReadbacks.ui_readback,
        pre: { source_sha256: appReadbacks.source_receipt.pre.source_sha256 },
        action: { report_sha256: sha256(report) },
        post: { source_sha256: appReadbacks.source_receipt.post.source_sha256, ui_sha256: appReadbacks.ui_readback.ui_receipt_sha256 },
      });
      reports.push(report);
      observations.push(Object.freeze({
        case_id: caseId,
        ordinal: index + 1,
        fixture_id: V12_PRODUCT_FIXTURE_ID,
        product_environment: productEnvironment,
        report_sha256: sha256(report),
        device_measurement: Object.freeze({ before: before.measurement, after: after.measurement }),
        execution_receipt: executionReceipt,
      }));
      unlinkSync(temporary);
    }
    const measuredIdentity = directMaestroIdentity(manifest, sourceIdentity, apkSha256, observations[0].device_measurement.before);
    const reportText = `<testsuites source_tree_sha256="${measuredIdentity.source_tree_sha256}" apk_sha256="${measuredIdentity.apk_sha256}" installed_apk_sha256="${measuredIdentity.installed_apk_sha256}" device_identity_sha256="${measuredIdentity.device_identity_sha256}">${reports.join("")}</testsuites>\n`;
    const flowSha256 = sha256(readFileSync(flowPath));
    const sourceSnapshot = Object.freeze({ flow_sha256: flowSha256, source_sha256: Object.freeze({ [contract.sources[0]]: sha256(sourceBytes) }) });
    const gitAttestationSha256 = gitExecution.retained_sha256 ?? sha256(`${JSON.stringify(gitExecution.attestation)}\n`);
    const provenance = executionOrigin({ root, runId, shard, manifest, snapshot: sourceSnapshot, tools, gitAttestationSha256, toolAttestation, observations });
    const mapping = Object.freeze({ schema_version: 2, producer: "v12-maestro-source-map/v2", run_id: runId, shard, identity: measuredIdentity, git_attestation_sha256: gitAttestationSha256, execution_origin: provenance, tool_attestation: toolAttestation, flow_sha256: flowSha256, source_sha256: sourceSnapshot.source_sha256, case_ids: caseIds, observations });
    validateSourceOrderedObservations(observations, caseIds, shard);
    validateV12DirectMaestroMapping(mapping, { root, manifest, shard, allowTest: tools.test_only });
    const writeReport = dependencies.writeReport ?? ((file, value) => {
      const absoluteReport = path.join(root, file);
      mkdirSync(path.dirname(absoluteReport), { recursive: true });
      writeFileSync(absoluteReport, value, { flag: "wx" });
    });
    writeReport(reportPath, reportText);
    immutableWrite(root, mappingPath, mapping, dependencies.writeImmutableJson);
    outcome = Object.freeze({ run_id: runId, shard, report: reportPath, mapping: mappingPath, cases: caseIds.length, execution_origin: provenance });
    restored = true;
  } catch (error) {
    if (/^v12_maestro_process_tree_(?:enumeration|termination)_failed$/u.test(error?.message ?? "")) {
      retainLease = true;
    }
    throw error;
  } finally {
    if (!retainLease) unlinkSync(leasePath);
  }
  if (!restored) genericFail("settings_restore_failed");
  return outcome;
}

export function validateV12LiveSourceLineage(manifest, dependencies = {}) {
  const root = dependencies.root ?? ROOT;
  const gitExecution = dependencies.gitExecution ?? ((dependencies.currentHead !== undefined
    && dependencies.sourceDigest !== undefined && dependencies.isAncestor !== undefined)
    ? undefined : resolveV12GitExecution({ env: dependencies.environment ?? process.env }));
  const currentHead = dependencies.currentHead
    ?? execFileSync(gitExecution.executable, ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const sourceDigest = dependencies.sourceDigest ?? sourceTreeSha256(root, {
    gitExecution,
    expectedGitAttestation: gitExecution.attestation,
  });
  const isAncestor = dependencies.isAncestor ?? ((ancestor, descendant) => {
    try {
      execFileSync(gitExecution.executable, ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: root, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });
  if (!GIT_HEAD.test(manifest?.source?.head ?? "") || !SHA256.test(manifest?.source?.tree_sha256 ?? "") || !GIT_HEAD.test(currentHead)) {
    genericFail("identity_mismatch");
  }
  if (isAncestor(manifest.source.head, currentHead) !== true) genericFail("source_lineage_mismatch");
  if (sourceDigest !== manifest.source.tree_sha256) genericFail("source_tree_mismatch");
  return Object.freeze({
    head: manifest.source.head,
    tree_sha256: manifest.source.tree_sha256,
  });
}

function liveIdentity(manifest, root, sourceIdentity) {
  return {
    head: sourceIdentity.head,
    tree_sha256: sourceIdentity.tree_sha256,
    package: manifest.build.package,
    apk_sha256: manifest.build.apk.sha256,
    installed_apk_sha256: manifest.device.installed_apk_sha256,
    certificate_sha256: manifest.build.apk.certificate_sha256,
    device_identity_sha256: manifest.device.identity_sha256,
    settings_sha256: manifest.device.settings_sha256,
    configuration_id: manifest.configuration.id,
  };
}

function retainedApkSha256(root, manifest) {
  const workspace = path.resolve(root);
  const apkPath = path.resolve(root, manifest.build.apk.path);
  if (!apkPath.startsWith(`${workspace}${path.sep}`)) genericFail("identity_mismatch");
  let bytes;
  try {
    if (!statSync(apkPath).isFile()) genericFail("identity_mismatch");
    bytes = readFileSync(apkPath);
  } catch (error) {
    if (error instanceof Error && error.message === "v12_maestro_identity_mismatch") throw error;
    genericFail("identity_mismatch");
  }
  const digest = sha256(bytes);
  if (bytes.length !== manifest.build.apk.size_bytes || digest !== manifest.build.apk.sha256) genericFail("identity_mismatch");
  return digest;
}

async function assertMaestroVersionAsync(run, maestro) {
  let version;
  try { version = String(await run(maestro, ["--version"], { encoding: "utf8", maxBuffer: 64 * 1024, timeoutMs: V12_MAESTRO_COMMAND_BUDGETS.version_ms })).trim(); }
  catch { genericFail("maestro_version_invalid"); }
  if (!/(?:^|\s)2\.8\.0(?:\s|$)/u.test(version)) genericFail("maestro_version_invalid");
}

export async function executeLiveV12RecoveryMaestro(args = process.argv.slice(2), dependencies = {}) {
  const { runId, shard } = exactGenericArguments(args);
  if (shard !== "recovery") genericFail("live_shard_invalid");
  const root = dependencies.root ?? ROOT;
  const manifest = (dependencies.readJson ?? ((file) => JSON.parse(readFileSync(path.join(root, file), "utf8"))))(`artifacts/native/v1.2/${runId}/build.json`);
  try { validateGenericV12RunManifest(manifest); } catch { genericFail("manifest_invalid"); }
  if (manifest.run_id !== runId || manifest.mode !== "live") genericFail("manifest_invalid");
  const gitExecution = dependencies.gitExecution ?? ((dependencies.currentHead !== undefined
    && dependencies.sourceDigest !== undefined && dependencies.isAncestor !== undefined)
    ? undefined : readV12RetainedGitExecution({ root, runManifest: manifest, env: dependencies.environment ?? process.env }));
  const sourceIdentity = validateV12LiveSourceLineage(manifest, {
    root,
    currentHead: dependencies.currentHead,
    sourceDigest: dependencies.sourceDigest,
    isAncestor: dependencies.isAncestor,
    gitExecution,
  });
  genericIdentityMatches(manifest, dependencies.currentIdentity ?? liveIdentity(manifest, root, sourceIdentity));
  const flow = V12_MAESTRO_FLOW_CONTRACTS.recovery.flow;
  if (!(dependencies.exists ?? ((file) => existsSync(path.join(root, file))))(flow)) genericFail("artifact_missing");
  const tools = resolvedExecutionTools(dependencies.executionTools
    ?? resolveV12NativeExecutionTools({ domain: true, env: dependencies.environment ?? process.env }));
  const runnerDependencies = tools.test_only && dependencies.runProcess === undefined && dependencies.execFileSync === undefined
    ? { ...dependencies, execFileSync } : dependencies;
  const run = commandRunner(runnerDependencies, dependencies.signal);
  await assertMaestroVersionAsync(run, tools.maestro);
  const output = path.join(root, `artifacts/native/v1.2/${runId}/maestro/recovery.xml`);
  const writeReport = dependencies.writeReport ?? ((file, content) => {
    if (existsSync(file)) genericFail("immutable_output_invalid");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, { flag: "wx" });
  });
  const serial = dependencies.serial ?? "emulator-5554";
  const adb = dependencies.adb ?? directMaestroAdb(run, tools.adb, serial);
  const cleanupRun = commandRunner(runnerDependencies, undefined);
  const cleanupAdb = dependencies.adb ?? directMaestroAdb(cleanupRun, tools.adb, serial);
  const priorAirplane = await adb("shell", "settings", "get", "global", "airplane_mode_on");
  const reports = [];
  let restored = false;
  try {
    for (const step of V12_RECOVERY_STEPS) {
      for (const cut of V12_RECOVERY_CUT_IDS) {
        const nonce = randomBytes(16).toString("hex");
        for (const phase of ["arm", "recover"]) {
          const temporary = path.join(root, `artifacts/native/v1.2/${runId}/maestro/.${step.case_id}-${step.id}-${cut}-${phase}.xml`);
          mkdirSync(path.dirname(temporary), { recursive: true });
          try { await run(tools.maestro, ["test", "--device", serial,
            "-e", `V12_DOMAIN_NONCE=${nonce}`,
            "-e", `V12_RECOVERY_CASE=${step.case_id}`,
            "-e", `V12_RECOVERY_STEP=${step.id}`,
            "-e", `V12_RECOVERY_STAGE=${cut}`,
            "-e", `V12_RECOVERY_PHASE=${phase}`,
            "--format", "junit", "--output", temporary, path.join(root, flow)], { timeoutMs: V12_MAESTRO_COMMAND_BUDGETS.maestro_case_ms, maxBuffer: 16 * 1024 * 1024 }); }
          catch (error) {
            if (error?.message === "v12_maestro_process_timeout") genericFail("native_command_timeout");
            if (error?.message === "v12_maestro_process_cancelled") genericFail("native_command_cancelled");
            genericFail("native_command_failed");
          }
          if (!existsSync(temporary)) genericFail("report_missing");
          reports.push(readFileSync(temporary, "utf8"));
          unlinkSync(temporary);
        }
      }
    }
    writeReport(output, `<testsuites>${reports.join("")}</testsuites>\n`);
  } finally {
    await cleanupAdb("shell", "settings", "put", "global", "airplane_mode_on", priorAirplane);
    restored = await cleanupAdb("shell", "settings", "get", "global", "airplane_mode_on") === priorAirplane;
  }
  if (!restored) genericFail("settings_restore_failed");
  return Object.freeze({ ok: true, run_id: runId, shard, report: path.relative(root, output), cases: V12_RECOVERY_CASE_IDS.length,
    steps: V12_RECOVERY_STEPS.length, cuts: V12_RECOVERY_STEPS.length * V12_RECOVERY_CUT_IDS.length, executions: reports.length });
}
export const V12_CALENDAR_DIAGNOSTIC_STAGES = V12_CALENDAR_STAGE_IDS;

const IN_APP_GESTURE_STAGES = new Set([
  ...V12_CALENDAR_STAGE_GROUPS.pointer,
  ...V12_CALENDAR_STAGE_GROUPS.input_interrupt,
]);

export function validateV12CalendarManifest(manifest, current = {}) {
  if (!exactKeys(manifest, ["schema_version", "suite", "profile", "package", "js_bundle", "base_head", "source_tree_sha256", "source_manifest_sha256", "reference_map_sha256", "apk", "installed_apk", "device", "report_sha256"])) throw new Error("v12_calendar_manifest_invalid");
  if ([!exactKeys(manifest.js_bundle, ["embedded"]), !exactKeys(manifest.apk, ["path", "sha256", "size_bytes"]), !exactKeys(manifest.installed_apk, ["sha256", "matches_retained_apk"]), !exactKeys(manifest.device, ["identity_sha256"])].some(Boolean)) throw new Error("v12_calendar_manifest_invalid");
  if ([
    manifest.schema_version !== 1,
    manifest.suite !== "v1.2-calendar",
    manifest.profile !== "development-test",
    manifest.package !== PACKAGE,
    manifest.js_bundle.embedded !== true,
    !GIT_HEAD.test(manifest.base_head),
    !SHA256.test(manifest.source_tree_sha256),
    !SHA256.test(manifest.source_manifest_sha256),
    !SHA256.test(manifest.reference_map_sha256),
    !SHA256.test(manifest.apk.sha256),
    manifest.installed_apk.matches_retained_apk !== true,
    manifest.installed_apk.sha256 !== manifest.apk.sha256,
    !SHA256.test(manifest.device.identity_sha256),
    !SHA256.test(manifest.report_sha256),
  ].some(Boolean)) throw new Error("v12_calendar_manifest_invalid");
  if (current.head !== undefined && manifest.base_head !== current.head) throw new Error("v12_calendar_manifest_stale_head");
  if (current.source !== undefined && manifest.source_tree_sha256 !== current.source) throw new Error("v12_calendar_manifest_stale_source");
  return true;
}

export function validateV12CalendarFlow(flow) {
  const route = "gymtracker-devtest://calendar?phase20CalendarStage=${V12_CALENDAR_STAGE}&phase20CalendarNonce=${V12_CALENDAR_NONCE}&phase20CalendarFlowSha256=${V12_CALENDAR_FLOW_SHA256}&phase20CalendarFlowRevision=${V12_CALENDAR_FLOW_REVISION}";
  if (typeof flow !== "string" || !flow.includes("Phase 20 real Calendar native observation")
    || flow.split(route).length - 1 !== 1 || !flow.includes(`V12_CALENDAR_FLOW_REVISION == '${V12_CALENDAR_FLOW_REVISION}'`)
    || /PHASE16|synthetic|expected_outcome|\bPASS\b/u.test(flow)) throw new Error("v12_calendar_flow_invalid");
  for (const stage of V12_CALENDAR_DIAGNOSTIC_STAGES) {
    const marker = `V12_CALENDAR_STAGE == '${stage}'`;
    const start = flow.indexOf(marker);
    if (start < 0 || flow.split(marker).length !== 2) throw new Error(`v12_calendar_stage_missing:${stage}`);
    const next = flow.indexOf("- runFlow:", start);
    const block = flow.slice(start, next < 0 ? flow.length : next);
    if (IN_APP_GESTURE_STAGES.has(stage)) {
      if (!/swipe:\s*\{/u.test(block) || !/start:.*end:.*duration:/us.test(block)
        || /pressKey: BACK/u.test(block)) throw new Error(`v12_calendar_flow_stage_invalid:${stage}`);
    }
  }
  if (!flow.includes('takeScreenshot: "calendar-${V12_CALENDAR_STAGE}"')) throw new Error("v12_calendar_capture_missing");
  return true;
}

export function createV12CalendarRunnerPlan(manifest) {
  return Object.freeze({
    suite: "v1.2-acceptance",
    native_execution: "NOT_RUN",
    package: manifest.package,
    stages: V12_CALENDAR_DIAGNOSTIC_STAGES,
    observation_source: "/calendar",
    terminal_marker: V12_CALENDAR_CHUNK_MARKER,
    flow_revision: V12_CALENDAR_FLOW_REVISION,
    flow_sha256: sha256(readFileSync(path.join(ROOT, FLOW))),
    identity: { base_head: manifest.base_head, source_tree_sha256: manifest.source_tree_sha256, source_manifest_sha256: manifest.source_manifest_sha256, reference_map_sha256: manifest.reference_map_sha256, apk_sha256: manifest.apk.sha256, device_identity_sha256: manifest.device.identity_sha256 },
    prohibited_verdicts: ["PASS", "FAIL"],
  });
}

export function initializeV12CalendarRunnerState({ root, runId }) {
  return initializeV12CalendarRun({ root, runId, stageIds: V12_CALENDAR_DIAGNOSTIC_STAGES });
}

export function readV12CalendarRunnerState({ root, runId }) {
  return readV12CalendarRunState({ root, runId, stageIds: V12_CALENDAR_DIAGNOSTIC_STAGES });
}

export function recordV12CalendarRunnerStage({ root, runId, stageId, status, artifactSha256 }) {
  return recordV12CalendarStageResult({
    root,
    runId,
    stageIds: V12_CALENDAR_DIAGNOSTIC_STAGES,
    stageId,
    status,
    artifactSha256,
  });
}

export function executeV12Maestro(args = process.argv.slice(2), dependencies = {}) {
  if (args.includes("--run") || args.includes("--shard")) return executeGenericV12Maestro(args, dependencies);
  if (!args.includes("--diagnostic")) throw new Error("v12_calendar_diagnostic_flag_required");
  const manifestIndex = args.indexOf("--manifest");
  if ([manifestIndex < 0, manifestIndex >= 0 && args[manifestIndex + 1] === undefined].some(Boolean)) throw new Error("v12_calendar_manifest_required");
  const root = dependencies.root ?? ROOT;
  const manifestPath = path.resolve(root, args[manifestIndex + 1]);
  const fileExists = dependencies.exists ?? existsSync;
  if (!fileExists(manifestPath)) throw new Error("v12_calendar_manifest_missing");
  const readText = dependencies.readText ?? ((file) => readFileSync(file, "utf8"));
  const manifest = JSON.parse(readText(manifestPath));
  const gitExecution = dependencies.gitExecution ?? resolveV12GitExecution({ env: dependencies.environment ?? process.env });
  const head = dependencies.head ?? execFileSync(gitExecution.executable, ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const source = dependencies.source ?? sourceTreeSha256(root, { gitExecution, expectedGitAttestation: gitExecution.attestation });
  validateV12CalendarManifest(manifest, { head, source });
  validateV12CalendarFlow(readText(path.join(root, FLOW)));
  throw new Error("v12_calendar_native_execution_phase20_only");
}

export async function runV12MaestroCli(args = process.argv.slice(2), io = process, dependencies = {}) {
  const controller = dependencies.signal === undefined ? new AbortController() : undefined;
  const signal = dependencies.signal ?? controller.signal;
  const cancel = () => controller?.abort();
  if (controller !== undefined) {
    process.once("SIGTERM", cancel);
    process.once("SIGINT", cancel);
  }
  try {
    if (args.includes("--run")) {
      const { runId, shard } = exactGenericArguments(args);
      if (shard === "recovery") {
        io.stdout.write(`${JSON.stringify(await executeLiveV12RecoveryMaestro(args, { ...dependencies, signal }))}\n`);
      } else {
        const writes = [];
        const result = await executeLiveV12GenericMaestro(args, {
          ...dependencies,
          signal,
          writeReport: (file, value) => writes.push([file.replace(`artifacts/native/v1.2/${runId}/`, ""), value]),
          writeImmutableJson: (file, value) => writes.push([file.replace(`artifacts/native/v1.2/${runId}/`, ""), value]),
        });
        publishV12AtomicShard({ root: dependencies.root, runId, shard, executionOrigin: result.execution_origin,
          produce: ({ write }) => writes.forEach(([file, value]) => write(file, value)) });
        io.stdout.write(`${JSON.stringify(result)}\n`);
      }
    } else io.stdout.write(`${JSON.stringify(executeV12Maestro(args))}\n`);
    return 0;
  } catch (error) {
    const runIndex = args.indexOf("--run"); const shardIndex = args.indexOf("--shard");
    const runId = runIndex >= 0 ? args[runIndex + 1] : undefined; const shard = shardIndex >= 0 ? args[shardIndex + 1] : undefined;
    if (V12_RUN_ID.test(runId ?? "") && typeof shard === "string" && shard !== "recovery") { try { recordV12AtomicFailure({ root: dependencies.root, runId, shard, error }); } catch { /* first receipt wins */ } }
    io.stderr.write(`${error.message}\n`);
    return 1;
  } finally {
    if (controller !== undefined) {
      process.removeListener("SIGTERM", cancel);
      process.removeListener("SIGINT", cancel);
    }
  }
}

/* node:coverage ignore next 4 */
if (process.argv[1]?.endsWith("run-v12-maestro.mjs")) {
  process.exitCode = await runV12MaestroCli();
}

#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { createProductionNativeRuntime } from "./v12-production-native-runtime.mjs";
import { archiveInspection } from "./v12-rollback-archive-inspection.mjs";
import { normalizeV12AirplaneModeStatus } from "./v12-airplane-mode-status.mjs";
import { resolveV12NativeExecutionTools, V12_PRODUCTION_EXECUTION_ORIGIN } from "./v12-native-execution-origin.mjs";

const PACKAGE = "com.fchoo.gymtracker.devtest";
const RUN = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
function fail(code) { throw new Error(`v12_rollback_${code}`); }
export const rollbackBridgeError = error => error instanceof Error && /^v12_rollback_[a-z_]+$/u.test(error.message) ? error.message : "v12_rollback_native_failed";

function safeFile(file) {
  if (typeof file !== "string" || !path.isAbsolute(file)) fail("native_request_invalid");
  let cursor = path.parse(file).root;
  for (const part of file.slice(cursor.length).split(path.sep)) {
    cursor = path.join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) fail("native_request_invalid");
  }
  if (!lstatSync(cursor).isFile()) fail("native_request_invalid");
  return cursor;
}
function directory(root, runId, nonce) {
  let cursor = root;
  for (const part of ["artifacts", "native", "phase20-operations", runId]) {
    cursor = path.join(cursor, part); mkdirSync(cursor, { recursive: true, mode: 0o700 });
    if (lstatSync(cursor).isSymbolicLink() || !lstatSync(cursor).isDirectory()) fail("operations_path_invalid");
  }
  cursor = path.join(cursor, `rollback-${nonce}`); mkdirSync(cursor, { mode: 0o700 });
  return cursor;
}

/** Source-owned transport. Injected boundaries are for host unit tests only, never CLI evidence. */
export async function runV12NativeRollbackBridge({ root = process.cwd(), runId, phase, archive,
  environment = process.env } = {}, dependencies = {}) {
  if (!RUN.test(runId ?? "") || !["create", "restore"].includes(phase)) fail("arguments_invalid");
  if (environment.V12_ROLLBACK_REQUEST_PATH === undefined) fail("restore_parser_required");
  if (environment.NODE_ENV === "test" || Object.keys(environment).some(key => key.startsWith("V12_NATIVE_ADAPTER_TEST")
    || key === "V12_NATIVE_ADAPTER_COMMAND") || environment.V12_EXECUTION_ORIGIN !== undefined) fail("test_environment_forbidden");
  if (phase === "restore" && (!Buffer.isBuffer(archive) || archive.length < 26 || archive.length > 32 * 1024 * 1024)) fail("archive_invalid");
  const requestPath = safeFile(environment.V12_ROLLBACK_REQUEST_PATH);
  const operationsRoot = path.join(path.resolve(root), "artifacts/native/phase20-operations", runId);
  if (path.dirname(requestPath) !== operationsRoot) fail("native_request_invalid");
  const request = JSON.parse(readFileSync(requestPath, "utf8"));
  if (!exact(request, ["schema_version", "producer", "run_id", "lease"]) || request.schema_version !== 1
    || request.producer !== "v12-rollback-native-request/v1" || request.run_id !== runId
    || !exact(request.lease, ["lease_id", "native_execution"]) || !/^[a-f0-9]{48}$/u.test(request.lease.lease_id ?? "")
    || request.lease.native_execution !== "EXECUTED") fail("native_request_invalid");
  const manifest = JSON.parse(readFileSync(safeFile(path.join(root, `artifacts/native/v1.2/${runId}/build.json`)), "utf8"));
  const attestation = { run_id: runId, source_tree_sha256: manifest.source?.tree_sha256, apk_sha256: manifest.build?.apk?.sha256,
    apk_signature_sha256: manifest.build?.apk?.signature_sha256, device_identity_sha256: manifest.device?.identity_sha256,
    installed_apk_sha256: manifest.device?.installed_apk_sha256 };
  if (manifest.run_id !== runId || manifest.mode !== "live" || manifest.build?.profile !== "development-test"
    || manifest.build?.package !== PACKAGE || attestation.apk_sha256 !== attestation.installed_apk_sha256
    || !Object.entries(attestation).filter(([key]) => key.endsWith("sha256")).every(([, value]) => HASH.test(value ?? ""))) fail("identity_invalid");
  const tools = (dependencies.resolveTools ?? resolveV12NativeExecutionTools)({ requiredTools: ["adb", "unzip"], env: environment });
  if (tools.execution_origin !== V12_PRODUCTION_EXECUTION_ORIGIN || tools.test_only !== false) fail("test_environment_forbidden");
  const serial = environment.V12_DEVICE_SERIAL;
  if (typeof serial !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/u.test(serial)) fail("device_binding_unavailable");
  const runtimeFactory = dependencies.runtime ?? createProductionNativeRuntime;
  const runtime = runtimeFactory(attestation, { root, executionTools: tools });
  const execute = dependencies.command ?? spawnSync;
  const now = dependencies.now ?? Date.now;
  const wait = dependencies.wait ?? delay;
  const nonce = (dependencies.nonce ?? (() => randomBytes(16).toString("hex")))();
  if (!/^[a-f0-9]{32}$/u.test(nonce)) fail("arguments_invalid");
  const operational = directory(root, runId, nonce);
  const remote = `files/v12-rollback-${nonce}`;
  const deadline = now() + 180_000;
  function command(exe, args, input, allowAbsent = false) {
    const result = execute(exe, args, { input, timeout: 10_000, maxBuffer: 34 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
    if (result.error || result.signal || (result.status !== 0 && (!allowAbsent || result.status !== 1))) fail("native_prerequisite_failed");
    return result;
  }
  const adb = (args, input, allowAbsent) => command(tools.adb, ["-s", serial, ...args], input, allowAbsent);
  const shell = (...args) => adb(["shell", args.map(quote).join(" ")]).stdout.toString().trim();
  try {
    return await runtime.withLease({ lease: request.lease }, async () => {
      if (normalizeV12AirplaneModeStatus(shell("cmd", "connectivity", "airplane-mode")) !== "Airplane mode is enabled"
        || shell("settings", "get", "global", "wifi_on") !== "0"
        || shell("settings", "get", "global", "mobile_data") !== "0") fail("offline_required");
      const apk = safeFile(path.join(root, manifest.build.apk.path));
      const config = JSON.parse(command(tools.unzip, ["-p", apk, "assets/app.config"]).stdout.toString());
      if (config.android?.package !== PACKAGE || config.scheme !== "gymtracker-devtest"
        || config.extra?.buildProfile !== "development-test" || config.extra?.nativeContractsEnabled !== true
        || config.extra?.nativeContractSuite !== "v1.2-acceptance") fail("standalone_required");
      const deviceMs = Number(shell("date", "+%s")) * 1_000;
      if (!Number.isSafeInteger(deviceMs) || deviceMs <= 0) fail("arm_invalid");
      const arm = { schema_version: 1, route_id: "v12-rollback-bridge", phase, nonce, run_id: runId,
        source_tree_sha256: attestation.source_tree_sha256, apk_sha256: attestation.apk_sha256,
        device_identity_sha256: attestation.device_identity_sha256, lease_id_sha256: hash(request.lease.lease_id),
        archive_sha256: phase === "restore" ? hash(archive) : hash(Buffer.alloc(0)), declared_schema_version: 22, expires_at_ms: deviceMs + 180_000 };
      writeFileSync(path.join(operational, "arm.json"), `${JSON.stringify(arm)}\n`, { flag: "wx", mode: 0o600 });
      shell("run-as", PACKAGE, "sh", "-c", `umask 077; mkdir ${remote}`);
      if (phase === "restore") adb(["shell", `run-as ${PACKAGE} sh -c ${quote(`cat > ${remote}/incoming.gtbk`)}`], archive);
      adb(["shell", `run-as ${PACKAGE} sh -c ${quote(`umask 077; cat > ${remote}/arm.json`)}`], Buffer.from(JSON.stringify(arm)));
      shell("am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", `gymtracker-devtest://__v12-recovery-archive?nonce=${nonce}`, PACKAGE);
      let resultBytes;
      while (now() < deadline) {
        const fetched = adb(["exec-out", "run-as", PACKAGE, "sh", "-c", `test -f ${remote}/result.ready && test "$(cat ${remote}/result.ready)" = ready && test -f ${remote}/result.json && cat ${remote}/result.json`], undefined, true);
        if (fetched.status === 0) { resultBytes = Buffer.from(fetched.stdout); break; }
        await wait(250);
      }
      if (resultBytes === undefined || now() >= deadline) fail("native_timeout");
      const result = JSON.parse(resultBytes);
      if (!exact(result, ["schema_version", "producer", "arm", Object.hasOwn(result, "failure") ? "failure" : "inspection"])
        || result.schema_version !== 1 || result.producer !== "v12-native-rollback-bridge/v1"
        || JSON.stringify(result.arm) !== JSON.stringify(arm)) fail("native_result_invalid");
      if (Object.hasOwn(result, "failure")) {
        if (!/^v12_rollback_[a-z_]+$/u.test(result.failure ?? "")) fail("native_result_invalid");
        writeFileSync(path.join(operational, "native-result.json"), resultBytes, { flag: "wx", mode: 0o600 });
        fail("native_restore_failed");
      }
      const archiveBytes = Buffer.from(adb(["exec-out", "run-as", PACKAGE, "cat", `${remote}/archive.gtbk`]).stdout);
      if (archiveBytes.length < 26 || archiveBytes.length > 32 * 1024 * 1024 || archiveBytes[4] !== 2
        || (phase === "restore" && !archiveBytes.equals(archive))
        || result.inspection?.canonical_post_restore_facts?.archive_sha256 !== hash(archiveBytes)) fail("archive_invalid");
      archiveInspection(result.inspection, archiveBytes, 22);
      // Reconstruct the real runtime to recheck final source/device identity, then verify the owned lease/APK again.
      return await runtimeFactory(attestation, { root, executionTools: tools }).withLease({ lease: request.lease }, async () => {
        if (now() >= deadline) fail("native_timeout");
        writeFileSync(path.join(operational, "native-result.json"), resultBytes, { flag: "wx", mode: 0o600 });
        const archivePath = path.join(operational, "compatible-archive.gtbk");
        writeFileSync(archivePath, archiveBytes, { flag: "wx", mode: 0o600 });
        return { archivePath, archiveBytes, inspection: result.inspection };
      });
    });
  } catch (error) {
    const code = rollbackBridgeError(error);
    writeFileSync(path.join(operational, "failure.json"), `${JSON.stringify({ schema_version: 1, nonce, code })}\n`, { flag: "wx", mode: 0o600 });
    throw new Error(code);
  }
}

export async function authenticateV12RollbackOnDevice({ root = process.cwd(), runId, request, environment = process.env } = {}, dependencies) {
  if (environment.V12_ROLLBACK_REQUEST_PATH === undefined) fail("restore_parser_required");
  if (request?.required_parser !== "src/domains/portability/restoreCommands.ts#createRestoreCommands"
    || request?.operation !== "clean_restore" || request?.declared_schema_version !== 22) fail("schema_boundary_invalid");
  const result = await runV12NativeRollbackBridge({ root, runId, phase: "restore", archive: request.archive_bytes, environment }, dependencies);
  return result.inspection;
}

export async function executeRollbackBridgeCli(args, { root = process.cwd(), environment = process.env, ...dependencies } = {}) {
  if (args.length !== 3 || args[0] !== "--prepare" || args[1] !== "--run") fail("arguments_invalid");
  const result = await runV12NativeRollbackBridge({ root, environment, runId: args[2], phase: "create" }, dependencies);
  return { archive_sha256: hash(result.archiveBytes), format_version: 2, schema_version: 22 };
}
export async function rollbackBridgeMain(args, execute = executeRollbackBridgeCli) {
  try { process.stdout.write(`${JSON.stringify(await execute(args))}\n`); }
  catch (error) { process.stderr.write(`${rollbackBridgeError(error)}\n`); process.exitCode = 1; }
}
const main = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (main) await rollbackBridgeMain(process.argv.slice(2));

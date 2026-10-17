import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const V12_PRODUCTION_EXECUTION_ORIGIN = "production-attested/v1";
export const V12_TEST_EXECUTION_ORIGIN = "test-controlled/v1";
export const V12_RETAINED_GIT_ATTESTATION_PATH = "artifacts/native/v1.2-acceptance/git-execution-origin.json";

const TEST_PATHS = Object.freeze({
  adb: "V12_ADB_PATH",
  maestro: "V12_MAESTRO_PATH",
  java: "V12_JAVA_PATH",
  unzip: "V12_UNZIP_PATH",
  apksigner: "V12_APKSIGNER_PATH",
  git: "V12_GIT_PATH",
});
const TOOL_NAMES = Object.freeze(Object.keys(TEST_PATHS));
const VERSION_COMMANDS = Object.freeze({
  adb: Object.freeze(["version"]),
  maestro: Object.freeze(["--version"]),
  java: Object.freeze(["-version"]),
  unzip: Object.freeze(["-v"]),
  apksigner: Object.freeze(["version"]),
  git: Object.freeze(["--version"]),
});
export const V12_NATIVE_ACTION_TOOL_REQUIREMENTS = Object.freeze({
  "acquire-lease": Object.freeze(["adb"]),
  "release-lease": Object.freeze(["adb"]),
  "snapshot-settings": Object.freeze(["adb"]),
  "restore-settings": Object.freeze(["adb"]),
  sqlite: Object.freeze(["adb"]),
  "visual-capture": Object.freeze(["adb", "maestro"]),
  "visual-capture-batch": Object.freeze(["adb", "maestro"]),
  "visual-compare": Object.freeze(["adb", "maestro"]),
  accessibility: Object.freeze(["adb"]),
  performance: Object.freeze(["adb"]),
  recovery: Object.freeze(["adb", "maestro", "unzip"]),
  garmin: Object.freeze(["adb", "maestro", "unzip"]),
  calendar: Object.freeze(["adb", "maestro", "unzip"]),
  "source-control": Object.freeze(["git"]),
});

function fail(code) {
  throw new Error(`v12_production_native_launcher_${code}`);
}

function executable(candidate, code) {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate)) fail(code);
  let resolved;
  try {
    resolved = realpathSync(candidate);
    if (!path.isAbsolute(resolved) || !statSync(resolved).isFile()) fail(code);
    accessSync(resolved, constants.X_OK);
  } catch (error) {
    if (error instanceof Error && error.message === `v12_production_native_launcher_${code}`) throw error;
    fail(code);
  }
  return resolved;
}

function productionAndroidRoot(env) {
  const home = env.ANDROID_HOME;
  const sdkRoot = env.ANDROID_SDK_ROOT;
  if (home !== undefined && sdkRoot !== undefined) {
    if (!path.isAbsolute(home) || !path.isAbsolute(sdkRoot)) fail("android_sdk_invalid");
    let homeReal; let sdkReal;
    try { homeReal = realpathSync(home); sdkReal = realpathSync(sdkRoot); }
    catch { fail("android_sdk_invalid"); }
    if (homeReal !== sdkReal) fail("android_sdk_invalid");
    return homeReal;
  }
  const selected = home ?? sdkRoot ?? "/opt/homebrew/share/android-commandlinetools";
  if (!path.isAbsolute(selected)) fail("android_sdk_invalid");
  try { return realpathSync(selected); }
  catch { fail("android_sdk_missing"); }
}

function productionMaestro() {
  const candidates = [
    path.join(homedir(), ".local/bin/maestro"),
    path.join(homedir(), ".maestro/bin/maestro"),
  ];
  for (const candidate of candidates) {
    try { return executable(candidate, "maestro_missing"); }
    catch { /* try the next pinned install location */ }
  }
  fail("maestro_missing");
}

function productionJava(env) {
  const candidate = env.JAVA_HOME === undefined ? "/usr/bin/java" : path.join(env.JAVA_HOME, "bin", "java");
  if (env.JAVA_HOME !== undefined && !path.isAbsolute(env.JAVA_HOME)) fail("java_missing");
  return executable(candidate, "java_missing");
}

function productionGit() {
  return executable("/usr/bin/git", "git_missing");
}

function required(requiredTools, domain) {
  const names = requiredTools ?? (domain ? ["adb", "maestro", "unzip"] : ["adb"]);
  if (!Array.isArray(names) || names.length === 0 || new Set(names).size !== names.length
    || names.some((name) => !TOOL_NAMES.includes(name))) fail("tool_requirement_invalid");
  return names;
}

export function requiredV12NativeToolsForAction(action) {
  const names = V12_NATIVE_ACTION_TOOL_REQUIREMENTS[action];
  if (names === undefined) fail("tool_requirement_invalid");
  return names;
}

/**
 * Production never resolves native evidence tools through PATH. Test transports
 * must opt into a distinct origin and supply all absolute subprocess paths.
 */
export function resolveV12NativeExecutionTools({ domain = false, requiredTools, env = process.env } = {}) {
  const names = required(requiredTools, domain);
  const requestedOrigin = env.V12_EXECUTION_ORIGIN;
  if (requestedOrigin === V12_TEST_EXECUTION_ORIGIN) {
    return Object.freeze(Object.fromEntries([
      ["execution_origin", V12_TEST_EXECUTION_ORIGIN],
      ["test_only", true],
      ...names.map((name) => [name, executable(env[TEST_PATHS[name]], "test_toolchain_invalid")]),
    ]));
  }
  if (requestedOrigin !== undefined || Object.values(TEST_PATHS).some((name) => env[name] !== undefined)) {
    fail("execution_origin_invalid");
  }
  const androidRoot = names.some((name) => name === "adb" || name === "apksigner") ? productionAndroidRoot(env) : undefined;
  const candidates = {
    adb: () => executable(path.join(androidRoot, "platform-tools", "adb"), "adb_missing"),
    maestro: () => productionMaestro(),
    java: () => productionJava(env),
    unzip: () => executable("/usr/bin/unzip", "unzip_missing"),
    apksigner: () => executable(path.join(androidRoot, "build-tools", "36.0.0", "apksigner"), "apksigner_missing"),
    git: () => productionGit(),
  };
  return Object.freeze(Object.fromEntries([
    ["execution_origin", V12_PRODUCTION_EXECUTION_ORIGIN],
    ["test_only", false],
    ...names.map((name) => [name, candidates[name]()]),
  ]));
}

function productionVersion(name, executablePath, runCommand) {
  const result = runCommand(executablePath, VERSION_COMMANDS[name], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 64 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!result || result.error || result.signal || result.status !== 0) fail("tool_version_invalid");
  const line = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.split(/\r?\n/u).map((value) => value.trim()).find(Boolean);
  if (line === undefined || line.length > 512 || /[\u0000-\u001f\u007f]/u.test(line)) fail("tool_version_invalid");
  return line;
}

/** Privacy-safe toolchain binding. Realpaths are hashed, never serialized. */
export function createV12NativeExecutionOriginAttestation({ action, executionTools, runCommand = spawnSync } = {}) {
  const expected = requiredV12NativeToolsForAction(action);
  if (!executionTools || ![V12_PRODUCTION_EXECUTION_ORIGIN, V12_TEST_EXECUTION_ORIGIN].includes(executionTools.execution_origin)
    || executionTools.test_only !== (executionTools.execution_origin === V12_TEST_EXECUTION_ORIGIN)
    || expected.some((name) => typeof executionTools[name] !== "string")) fail("execution_origin_invalid");
  const present = TOOL_NAMES.filter((name) => Object.hasOwn(executionTools, name));
  if (present.length !== expected.length || expected.some((name) => !present.includes(name))) fail("execution_origin_invalid");
  const sha256 = (value) => createHash("sha256").update(value).digest("hex");
  const tools = present.sort().map((name) => {
    const resolved = executable(executionTools[name], "execution_origin_invalid");
    return Object.freeze({
      name,
      executable_realpath_sha256: sha256(resolved),
      executable_sha256: sha256(readFileSync(resolved)),
      version: executionTools.test_only && name !== "git" ? "test-controlled" : productionVersion(name, resolved, runCommand),
    });
  });
  return Object.freeze({
    schema_version: 1,
    action,
    execution_origin: executionTools.execution_origin,
    test_only: executionTools.test_only,
    tools: Object.freeze(tools),
  });
}

export function resolveV12GitExecution({ env = process.env, runCommand = spawnSync } = {}) {
  if (env.V12_EXECUTION_ORIGIN !== undefined && env.V12_EXECUTION_ORIGIN !== V12_TEST_EXECUTION_ORIGIN) fail("execution_origin_invalid");
  const executionTools = env.V12_GIT_PATH === undefined
    ? Object.freeze({ execution_origin: V12_PRODUCTION_EXECUTION_ORIGIN, test_only: false, git: productionGit() })
    : resolveV12NativeExecutionTools({ requiredTools: ["git"], env });
  const attestation = createV12NativeExecutionOriginAttestation({
    action: "source-control",
    executionTools,
    runCommand,
  });
  return Object.freeze({ executable: executionTools.git, attestation });
}

export function assertV12GitExecutionAttestation(value, {
  execution = undefined,
  env = process.env,
  runCommand = spawnSync,
} = {}) {
  const current = execution ?? resolveV12GitExecution({ env, runCommand });
  if (JSON.stringify(value) !== JSON.stringify(current.attestation)) fail("git_attestation_invalid");
  return true;
}

function retainedFile(root, relative) {
  const base = realpathSync(root);
  let cursor = base;
  for (const part of relative.split("/")) {
    cursor = path.join(cursor, part);
    const stat = lstatSync(cursor, { throwIfNoEntry: false });
    if (stat === undefined || stat.isSymbolicLink()) fail("git_attestation_invalid");
  }
  if (!lstatSync(cursor).isFile()) fail("git_attestation_invalid");
  return cursor;
}

export function readV12RetainedGitExecution({
  root = process.cwd(),
  runManifest = undefined,
  env = process.env,
  runCommand = spawnSync,
} = {}) {
  let build; let attestation; let bytes;
  try {
    build = JSON.parse(readFileSync(retainedFile(root, "artifacts/native/v1.2-acceptance/build.json"), "utf8"));
    const descriptor = build?.v12_evidence_identity?.git_attestation;
    if (descriptor?.path !== V12_RETAINED_GIT_ATTESTATION_PATH || typeof descriptor.sha256 !== "string") fail("git_attestation_invalid");
    bytes = readFileSync(retainedFile(root, descriptor.path));
    if (createHash("sha256").update(bytes).digest("hex") !== descriptor.sha256) fail("git_attestation_invalid");
    attestation = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    if (error instanceof Error && error.message === "v12_production_native_launcher_git_attestation_invalid") throw error;
    fail("git_attestation_invalid");
  }
  if (runManifest !== undefined && (build.base_head !== runManifest.source?.head
    || build.source_tree_sha256 !== runManifest.source?.tree_sha256
    || build.apk?.sha256 !== runManifest.build?.apk?.sha256)) fail("git_attestation_invalid");
  const execution = resolveV12GitExecution({ env, runCommand });
  assertV12GitExecutionAttestation(attestation, { execution });
  return Object.freeze({ ...execution, retained_sha256: createHash("sha256").update(bytes).digest("hex") });
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const execution = resolveV12GitExecution();
    if (process.argv.length !== 3 || !["--git-path", "--git-attestation"].includes(process.argv[2])) fail("arguments_invalid");
    process.stdout.write(process.argv[2] === "--git-path"
      ? `${execution.executable}\n`
      : `${JSON.stringify(execution.attestation)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "v12_production_native_launcher_failed"}\n`);
    process.exitCode = 1;
  }
}

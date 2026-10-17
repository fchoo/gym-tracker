import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const V12_PRODUCTION_EXECUTION_ORIGIN = "production-attested/v1";
export const V12_TEST_EXECUTION_ORIGIN = "test-controlled/v1";

const TEST_PATHS = Object.freeze({
  adb: "V12_ADB_PATH",
  maestro: "V12_MAESTRO_PATH",
  unzip: "V12_UNZIP_PATH",
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

/**
 * Production never resolves native evidence tools through PATH. Test transports
 * must opt into a distinct origin and supply all absolute subprocess paths.
 */
export function resolveV12NativeExecutionTools({ domain = false, env = process.env } = {}) {
  const requestedOrigin = env.V12_EXECUTION_ORIGIN;
  if (requestedOrigin === V12_TEST_EXECUTION_ORIGIN) {
    return Object.freeze({
      execution_origin: V12_TEST_EXECUTION_ORIGIN,
      adb: executable(env[TEST_PATHS.adb], "test_toolchain_invalid"),
      ...(domain ? {
        maestro: executable(env[TEST_PATHS.maestro], "test_toolchain_invalid"),
        unzip: executable(env[TEST_PATHS.unzip], "test_toolchain_invalid"),
      } : {}),
    });
  }
  if (requestedOrigin !== undefined || Object.values(TEST_PATHS).some((name) => env[name] !== undefined)) {
    fail("execution_origin_invalid");
  }
  const androidRoot = productionAndroidRoot(env);
  return Object.freeze({
    execution_origin: V12_PRODUCTION_EXECUTION_ORIGIN,
    adb: executable(path.join(androidRoot, "platform-tools", "adb"), "adb_missing"),
    ...(domain ? {
      maestro: productionMaestro(),
      unzip: executable("/usr/bin/unzip", "unzip_missing"),
    } : {}),
  });
}

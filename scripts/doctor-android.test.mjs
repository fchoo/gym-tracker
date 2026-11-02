import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const TEST_TIMEOUT_MS = 30_000;
const doctor = new URL("./doctor-android.sh", import.meta.url).pathname;
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

function executable(file, body) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}

function toolchain(t) {
  const root = mkdtempSync(path.join(tmpdir(), "doctor-android-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const sdk = path.join(root, "private-sdk-path");
  const bin = path.join(root, "bin");
  const javaHome = path.join(root, "private-java-path");
  executable(path.join(bin, "node"), `if [ "\${1:-}" = --version ]; then printf 'v24.19.0\\n'; else exec ${quote(process.execPath)} "$@"; fi`);
  executable(path.join(bin, "npm"), "printf '11.17.0\\n'");
  executable(path.join(javaHome, "bin/java"), "printf 'openjdk version \"17.0.20\" 2026-07-21\\nOpenJDK Runtime Environment Temurin-17.0.20+8\\n' >&2");
  executable(path.join(sdk, "cmdline-tools/latest/bin/sdkmanager"), "exit 0");
  executable(path.join(sdk, "cmdline-tools/latest/bin/avdmanager"), "printf 'Name: gym-tracker-api36\\n'");
  executable(path.join(sdk, "platform-tools/adb"), `
case "\${1:-}" in
  version) printf 'Android Debug Bridge version 1.0.41\\n' ;;
  devices) printf 'List of devices attached\\nprivate-serial-20\\tdevice\\n' ;;
  -s)
    shift 2
    if [ "\${1:-}" = get-state ]; then printf 'device\\n'; exit 0; fi
    shift
    if [ "\${1:-}" = getprop ]; then
      case "\${2:-}" in
        sys.boot_completed) printf '1\\n' ;;
        ro.build.version.sdk) printf '36\\n' ;;
        ro.product.cpu.abi) printf 'arm64-v8a\\n' ;;
        ro.product.model) printf 'private-model-20\\n' ;;
      esac
    fi
    ;;
esac`);
  executable(path.join(sdk, "emulator/emulator"), "exit 0");
  executable(path.join(sdk, "build-tools/36.0.0/zipalign"), "exit 0");
  executable(path.join(sdk, "build-tools/36.0.0/apksigner"), "exit 0");
  executable(path.join(sdk, "cmake/3.22.1/bin/cmake"), "exit 0");
  mkdirSync(path.join(sdk, "platforms/android-36"), { recursive: true });
  writeFileSync(path.join(sdk, "platforms/android-36/android.jar"), "fixture");
  mkdirSync(path.join(sdk, "ndk/27.1.12297006"), { recursive: true });
  writeFileSync(path.join(sdk, "ndk/27.1.12297006/source.properties"), "Pkg.Revision = 27.1.12297006\n");
  mkdirSync(path.join(sdk, "system-images/android-36/google_apis/arm64-v8a"), { recursive: true });
  writeFileSync(path.join(sdk, "system-images/android-36/google_apis/arm64-v8a/package.xml"), "fixture");
  executable(path.join(bin, "maestro"), "printf '2.8.0\\n'");
  return { root, sdk, bin, javaHome };
}

function runDoctor(paths, extra = {}) {
  return spawnSync("sh", [doctor, "--phase20"], {
    encoding: "utf8",
    timeout: 10_000,
    env: {
      ...process.env,
      HOME: paths.root,
      PATH: `${paths.bin}:/usr/bin:/bin`,
      JAVA_HOME: paths.javaHome,
      ANDROID_HOME: paths.sdk,
      ANDROID_SDK_ROOT: paths.sdk,
      GYM_TRACKER_ANDROID_SERIAL: "private-serial-20",
      ...extra,
    },
  });
}

test("Phase 20 doctor emits only pinned versions and a hashed device identity", { timeout: TEST_TIMEOUT_MS }, (t) => {
  const paths = toolchain(t);
  const result = runDoctor(paths);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^doctor-android: ok node=v24\.19\.0 npm=11\.17\.0 java=17\.0\.20\+8 android_api=36 build_tools=36\.0\.0 ndk=27\.1\.12297006 adb=1\.0\.41 maestro=2\.8\.0 device_identity_sha256=[a-f0-9]{64}\n$/u);
  assert.equal(result.stderr, "");
  assert.doesNotMatch(result.stdout, /private-|\/Users\/|\/tmp\/|device=/u);
});

test("Phase 20 doctor failures are stable and path-free", { timeout: TEST_TIMEOUT_MS }, (t) => {
  const paths = toolchain(t);
  const result = runDoctor(paths, {
    ANDROID_HOME: path.join(paths.root, "private-missing-sdk"),
    ANDROID_SDK_ROOT: path.join(paths.root, "private-missing-sdk"),
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "doctor-android: error=android_sdk_missing\n");
  assert.doesNotMatch(result.stderr, /private-|\/Users\/|\/tmp\//u);
});

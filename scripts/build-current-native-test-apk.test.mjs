import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

function claimFixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "v12-single-build-claim-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  cpSync(new URL("./build-current-native-test-apk.sh", import.meta.url), path.join(root, "scripts/build-current-native-test-apk.sh"));
  writeFileSync(path.join(root, "scripts/doctor-android.sh"), "#!/bin/sh\nexit 0\n");
  const bin = path.join(root, "bin"); mkdirSync(bin);
  const fakeGit = path.join(bin, "git");
  writeFileSync(fakeGit, `#!/bin/sh
case "$1 $2" in
  "rev-parse --show-toplevel") printf '%s\\n' ${JSON.stringify(root)} ;;
  "rev-parse HEAD") printf '%s\\n' '${"b".repeat(40)}' ;;
  "check-ignore -q") exit 0 ;;
  "ls-files android") exit 0 ;;
  *) exit 0 ;;
esac
`);
  const fakeNode = path.join(bin, "node");
  writeFileSync(fakeNode, `#!/bin/sh
if [ "$#" -eq 0 ]; then exec "$REAL_NODE"; fi
case "$1 $2" in
  "scripts/v12-native-execution-origin.mjs --git-path") printf '%s\\n' ${JSON.stringify(fakeGit)} ;;
  "scripts/v12-native-execution-origin.mjs --git-attestation") printf '%s\\n' '{"schema_version":1}' ;;
  "scripts/validate-v12-prebuild-predecessors.mjs ") exit 0 ;;
  "scripts/source-tree-digest.mjs --head") printf '%s\\n' '${"a".repeat(64)}' ;;
  "scripts/assert-generated-android.mjs "*) exit 0 ;;
  "scripts/validate-development-test-native-access.mjs "*) exec "$REAL_NODE" "$@" ;;
  *) printf 'unexpected fake node command: %s\\n' "$*" >&2; exit 97 ;;
esac
`);
  mkdirSync(path.join(bin, "platform-tools"));
  const fakeAdb = path.join(bin, "platform-tools/adb");
  writeFileSync(fakeAdb, `#!/bin/sh
if [ "$1" = devices ]; then printf 'List of devices attached\\nfixture-device\\tdevice\\n'; exit 0; fi
if [ "$1" = -s ] && [ "$3 $4 $5" = 'shell getprop sys.boot_completed' ]; then printf '1\\n'; exit 0; fi
exit 96
`);
  for (const file of [fakeGit, fakeNode, fakeAdb, path.join(root, "scripts/build-current-native-test-apk.sh"), path.join(root, "scripts/doctor-android.sh")]) chmodSync(file, 0o755);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_NODE: process.execPath,
    NODE_TEST_CONTEXT: "child-v8", GYM_TRACKER_ANDROID_SERIAL: "fixture-device",
    ANDROID_HOME: bin, ANDROID_SDK_ROOT: bin };
  return { root, env, script: path.join(root, "scripts/build-current-native-test-apk.sh") };
}

function waitForFile(file, timeoutMs = 5_000) {
  const started = Date.now();
  while (!existsSync(file) && Date.now() - started < timeoutMs) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
  assert.equal(existsSync(file), true, `timed out waiting for ${file}`);
}

function waitForActiveClaim(claimsRoot, timeoutMs = 5_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (existsSync(claimsRoot)) {
      const active = readdirSync(claimsRoot).find(name => name.endsWith(".claim") && !name.includes(".stale-"));
      if (active !== undefined && existsSync(path.join(claimsRoot, active, "owner.json"))) return path.join(claimsRoot, active);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
  assert.fail(`timed out waiting for an active claim under ${claimsRoot}`);
}

test("the native test APK build gates compiled debug capability before retaining, installing, or publishing", () => {
  const source = readFileSync(new URL("./build-current-native-test-apk.sh", import.meta.url), "utf8");
  const gate = source.indexOf('scripts/validate-development-test-native-access.mjs');
  const retain = source.indexOf('cp "$generated_apk" "$staged_apk_path.tmp"');
  const install = source.indexOf('adb -s "$device_serial" install -r');
  const publish = source.indexOf('ln "$staged_apk_path" "$apk_path"');
  assert.ok(gate > source.indexOf(':app:assembleRelease'));
  assert.ok(gate < retain && retain < install && install < publish);
  assert.match(source, /"\$node_executable" scripts\/validate-development-test-native-access\.mjs "\$generated_apk" "\$project_root\/android"/u);
});

test("compiled capability failure stops the builder before install and publication", (t) => {
  for (const failure of ['missing-debug-flag', 'release-debug-true', 'tool-failure']) {
    const f = claimFixture(t);
    cpSync(new URL('./validate-development-test-native-access.mjs', import.meta.url), path.join(f.root, 'scripts/validate-development-test-native-access.mjs'));
    const npx = path.join(f.env.ANDROID_HOME, 'npx');
    writeFileSync(npx, `#!/bin/sh
mkdir -p android/app/build/outputs/apk/release android/app/build/generated/source/buildConfig/release/com/fchoo/gymtracker/devtest
printf 'fixture APK' > android/app/build/outputs/apk/release/app-release.apk
printf '%s\\n' 'package com.fchoo.gymtracker.devtest;' 'public final class BuildConfig {' 'public static final boolean DEBUG = ${failure === 'release-debug-true' ? 'true' : 'false'};' 'public static final String APPLICATION_ID = "com.fchoo.gymtracker.devtest";' 'public static final String BUILD_TYPE = "release";' '}' > android/app/build/generated/source/buildConfig/release/com/fchoo/gymtracker/devtest/BuildConfig.java
printf '#!/bin/sh\\nexit 0\\n' > android/gradlew
chmod +x android/gradlew
`);
    chmodSync(npx, 0o755);
    const validator = path.join(f.root, 'scripts/validate-development-test-app-config.mjs');
    writeFileSync(validator, '#!/bin/sh\nexit 0\n'); chmodSync(validator, 0o755);
    const aapt = path.join(f.env.ANDROID_HOME, 'build-tools/36.0.0/aapt');
    mkdirSync(path.dirname(aapt), { recursive: true });
    writeFileSync(aapt, `#!/bin/sh\nprintf '%s\\n' "package: name='com.fchoo.gymtracker.devtest' versionCode='1' versionName='0.1.0'" "application: label='Gym Tracker Dev Test' icon=''"\n${failure === 'missing-debug-flag' ? '' : "printf 'application-debuggable\\n'"}\nexit ${failure === 'tool-failure' ? 7 : 0}\n`);
    chmodSync(aapt, 0o755);
    const adb = path.join(f.env.ANDROID_HOME, 'platform-tools/adb');
    writeFileSync(adb, `#!/bin/sh
if [ "$1" = -s ] && [ "$3 $4 $5" = 'shell getprop sys.boot_completed' ]; then printf '1\\n'; exit 0; fi
printf 'unexpected device mutation\\n' > ${JSON.stringify(path.join(f.root, 'device-mutation.txt'))}
exit 96
`);
    chmodSync(adb, 0o755);
    const result = spawnSync('sh', [f.script, '--suite', 'phase14-access-fixture'], {
      cwd: f.root, encoding: 'utf8', env: f.env,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /compiled development-test native access capability is invalid/u);
    assert.equal(existsSync(path.join(f.root, 'device-mutation.txt')), false);
    assert.equal(existsSync(path.join(f.root, 'artifacts/native/phase14-access-fixture')), false);
  }
});

test("the native test APK build retries launcher resolution after install", () => {
  const source = readFileSync(
    new URL("./build-current-native-test-apk.sh", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /while \[ "\$attempts" -lt 15 \][\s\S]*cmd package resolve-activity --brief[\s\S]*sleep 1/u,
  );
  assert.match(
    source,
    /phase14 \| phase14-\* \| v1\.2-acceptance/u,
  );
  assert.match(source, /phase18-garmin-proof\|phase18-garmin-acceptance\|phase18-garmin-adversarial/u);
  assert.match(source, /use v1\.2-acceptance/u);
  assert.doesNotMatch(
    source,
    /v1\.2-acceptance[\s\S]*device=%\$?device_serial/u,
  );
});

test("the v1.2 acceptance build accepts the explicit one-build guard without changing legacy suites", () => {
  const source = readFileSync(new URL("./build-current-native-test-apk.sh", import.meta.url), "utf8");
  assert.match(source, /--single-build\)/u);
  assert.match(source, /single_build=0/u);
  assert.match(source, /\[ "\$single_build" -eq 0 \] \|\| \[ "\$suite" = 'v1\.2-acceptance' \] \|\|/u);
});

test("single-build consumes a durable source-scoped claim, survives crash retry, and rejects a live owner", (t) => {
  const fixture = claimFixture(t);
  const invoke = (action) => spawnSync("sh", [fixture.script, "--suite", "v1.2-acceptance", "--single-build"], {
    cwd: fixture.root, encoding: "utf8", env: { ...fixture.env, V12_SINGLE_BUILD_CLAIM_TEST_ACTION: action },
  });
  const first = invoke("kill");
  assert.equal(first.signal, "SIGKILL", first.stderr);
  const claimsRoot = path.join(fixture.root, "artifacts/native/.single-build-claims");
  const firstActive = readdirSync(claimsRoot).find(name => name.endsWith(".claim") && !name.includes(".stale-"));
  assert.ok(firstActive);
  const firstOwner = JSON.parse(readFileSync(path.join(claimsRoot, firstActive, "owner.json"), "utf8"));
  assert.match(firstOwner.process_birth_sha256, /^[a-f0-9]{64}$/u);

  const retry = invoke("kill");
  assert.equal(retry.signal, "SIGKILL", retry.stderr);
  assert.equal(readdirSync(claimsRoot).filter(name => name.includes(".stale-")).length, 1);
  assert.equal(existsSync(path.join(fixture.root, "artifacts/native/v1.2-acceptance")), false);

  rmSync(claimsRoot, { recursive: true, force: true });
  const holder = spawn("sh", [fixture.script, "--suite", "v1.2-acceptance", "--single-build"], {
    cwd: fixture.root, stdio: "ignore", env: { ...fixture.env, V12_SINGLE_BUILD_CLAIM_TEST_ACTION: "hold" },
  });
  t.after(() => { try { holder.kill("SIGKILL"); } catch { /* already gone */ } });
  const activeDirectory = waitForActiveClaim(claimsRoot);
  const blocked = invoke("kill");
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /held by a live process/u);
  holder.kill("SIGKILL");
});

test("artifact publication is no-clobber and writes the build manifest last", () => {
  const source = readFileSync(new URL("./build-current-native-test-apk.sh", import.meta.url), "utf8");
  assert.doesNotMatch(source, /rm -rf "\$artifact_directory"/u);
  assert.match(source, /\[ ! -e "\$artifact_directory" \].*never deleted or overwritten/u);
  const directoryClaim = source.indexOf('mkdir "$artifact_directory"');
  const apkLink = source.indexOf('ln "$staged_apk_path" "$apk_path"');
  const manifestLink = source.indexOf('ln "$staged_build_manifest" "$build_manifest"');
  assert.ok(directoryClaim >= 0 && apkLink > directoryClaim && manifestLink > apkLink);
});

test("a normally failed single-build attempt remains consumed for the same source/run scope", (t) => {
  const fixture = claimFixture(t);
  const invoke = (action) => spawnSync("sh", [fixture.script, "--suite", "v1.2-acceptance", "--single-build"], {
    cwd: fixture.root, encoding: "utf8", env: { ...fixture.env, V12_SINGLE_BUILD_CLAIM_TEST_ACTION: action },
  });
  const failed = invoke("invalid");
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /claim test mode is invalid/u);
  const claimsRoot = path.join(fixture.root, "artifacts/native/.single-build-claims");
  const active = readdirSync(claimsRoot).find(name => name.endsWith(".claim") && !name.includes(".stale-"));
  const owner = JSON.parse(readFileSync(path.join(claimsRoot, active, "owner.json"), "utf8"));
  assert.equal(owner.state, "failed");
  const retry = invoke("kill");
  assert.equal(retry.status, 1);
  assert.match(retry.stderr, /already consumed.*failed/u);
});

test("the v1.2 acceptance build uses the canonical restoration digest contract", () => {
  const source = readFileSync(new URL("./build-current-native-test-apk.sh", import.meta.url), "utf8");
  assert.match(source, /v12-device-settings-contract\.mjs --read-digest/u);
  assert.doesNotMatch(source, /shell settings get system font_scale[\s\S]*shasum -a 256/u);
});

test("the v1.2 acceptance build validates predecessors and uses privacy-safe doctor mode before freezing source", () => {
  const source = readFileSync(new URL("./build-current-native-test-apk.sh", import.meta.url), "utf8");
  const predecessor = source.indexOf("scripts/validate-v12-prebuild-predecessors.mjs");
  const doctor = source.indexOf("sh scripts/doctor-android.sh --phase20");
  const freeze = source.indexOf('base_head=$("$git_executable" rev-parse HEAD)');
  const generation = source.indexOf("npx expo prebuild --clean");

  assert.ok(predecessor >= 0);
  assert.ok(doctor > predecessor);
  assert.ok(freeze > doctor);
  assert.ok(generation > freeze);
});

test("the v1.2 acceptance build resolves one absolute Git and retains its attestation", () => {
  const source = readFileSync(new URL("./build-current-native-test-apk.sh", import.meta.url), "utf8");
  assert.match(source, /git_executable=.*v12-native-execution-origin\.mjs --git-path/u);
  assert.match(source, /v12-native-execution-origin\.mjs --git-attestation/u);
  assert.match(source, /V12_GIT_ATTESTATION_PATH=/u);
  assert.match(source, /git-execution-origin\.json/u);
  assert.doesNotMatch(source, /\$\(git |^git /mu);
});

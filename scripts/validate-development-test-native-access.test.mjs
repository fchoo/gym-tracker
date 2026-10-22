import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validateCompiledDevtestBadging, validateReleaseBuildConfig, validateDevelopmentTestNativeAccess } from './validate-development-test-native-access.mjs';

// Build Tools dump badging reads these fields from the binary AndroidManifest.xml.
const badging = `package: name='com.fchoo.gymtracker.devtest' versionCode='1' versionName='0.1.0' platformBuildVersionName='16' platformBuildVersionCode='36' compileSdkVersion='36' compileSdkVersionCodename='16'
sdkVersion:'24'
targetSdkVersion:'36'
application-label:'Gym Tracker Dev Test'
application: label='Gym Tracker Dev Test' icon='res/icon.png'
application-debuggable
launchable-activity: name='com.fchoo.gymtracker.devtest.MainActivity' label='' icon=''
native-code: 'arm64-v8a'
`;
const buildConfig = `package com.fchoo.gymtracker.devtest;
public final class BuildConfig {
  public static final boolean DEBUG = false;
  public static final String APPLICATION_ID = "com.fchoo.gymtracker.devtest";
  public static final String BUILD_TYPE = "release";
}`;
const helper = fileURLToPath(new URL('./validate-development-test-native-access.mjs', import.meta.url));

function fixture(t, tool = 'aapt') {
  const root = mkdtempSync(path.join(tmpdir(), 'p20-apk-access-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const androidRoot = path.join(root, 'android');
  const androidHome = path.join(root, 'sdk');
  const buildConfigPath = path.join(androidRoot, 'app/build/generated/source/buildConfig/release/com/fchoo/gymtracker/devtest/BuildConfig.java');
  mkdirSync(path.dirname(buildConfigPath), { recursive: true });
  writeFileSync(buildConfigPath, buildConfig);
  const toolPath = path.join(androidHome, 'build-tools/36.0.0', tool);
  mkdirSync(path.dirname(toolPath), { recursive: true });
  const output = path.join(root, 'badging.txt');
  writeFileSync(output, badging);
  const invocation = path.join(root, 'invocation.txt');
  writeFileSync(toolPath, `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(invocation)}\n/bin/cat ${JSON.stringify(output)}\n`);
  chmodSync(toolPath, 0o755);
  const apkPath = path.join(root, 'candidate.apk');
  writeFileSync(apkPath, 'binary APK fixture is replaced at the external tool boundary');
  const options = { apkPath, androidRoot, androidHome };
  return { root, toolPath, output, invocation, buildConfigPath, options,
    run: (env = {}) => spawnSync(process.execPath, [helper, apkPath, androidRoot], {
      encoding: 'utf8', env: { ...process.env, ANDROID_HOME: androidHome, ANDROID_SDK_ROOT: '', ...env },
    }) };
}

test('compiled manifest badging requires exact package and affirmative application debug capability', () => {
  assert.doesNotThrow(() => validateCompiledDevtestBadging(badging));
  for (const invalid of ['', 'malformed private-payload',
    badging.replace('com.fchoo.gymtracker.devtest', 'com.fchoo.gymtracker'),
    badging.replace('application-debuggable\n', ''),
    badging.replace('application-debuggable', 'application-debuggable: false'),
    badging.replace('application-debuggable', 'application-debuggable: true'),
    badging.replace("package: name='", "package: name=\""),
    badging + "package: name='com.fchoo.gymtracker.devtest'\n",
    badging + 'application-debuggable\n',
    badging.replace(/^application:.*\n/mu, ''),
    badging.replace(/^application:.*$/mu, 'application: malformed'),
    badging.replace(/^package:.*$/mu, "package: name='com.fchoo.gymtracker.devtest'"),
    badging.replace("versionCode='1'", "versionCode='invalid'"),
    badging + "application: label='duplicate' icon=''\n",
  ]) assert.throws(() => validateCompiledDevtestBadging(invalid), /devtest_native_access_invalid/u);
});

test('release BuildConfig must bind the exact package, release variant and literal false DEBUG', () => {
  assert.doesNotThrow(() => validateReleaseBuildConfig(buildConfig));
  for (const invalid of ['', buildConfig.replace('DEBUG = false', 'DEBUG = true'),
    buildConfig.replace('DEBUG = false', 'DEBUG = Boolean.parseBoolean("false")'),
    buildConfig.replace('package com.fchoo.gymtracker.devtest;', 'package com.fchoo.gymtracker;'),
    buildConfig.replace('"release"', '"debug"'),
    buildConfig + '\npublic static final boolean DEBUG = true;',
    '// ' + buildConfig.replaceAll('\n', '\n// '),
  ]) assert.throws(() => validateReleaseBuildConfig(invalid), /devtest_native_access_invalid/u);
});

test('native access validator uses only pinned aapt and validates release generated source', t => {
  const f = fixture(t);
  assert.doesNotThrow(() => validateDevelopmentTestNativeAccess(f.options));
  writeFileSync(f.buildConfigPath, buildConfig.replace('DEBUG = false', 'DEBUG = true'));
  assert.throws(() => validateDevelopmentTestNativeAccess(f.options), /devtest_native_access_invalid/u);
});

test('native access validator falls back to pinned aapt2 only when aapt is unavailable', t => {
  const f = fixture(t, 'aapt2');
  assert.doesNotThrow(() => validateDevelopmentTestNativeAccess(f.options));
});

test('native access validator fails closed on unavailable tool, tool failure, and missing BuildConfig', t => {
  const f = fixture(t);
  chmodSync(f.toolPath, 0o644);
  assert.throws(() => validateDevelopmentTestNativeAccess(f.options), /devtest_native_access_invalid/u);
  chmodSync(f.toolPath, 0o755);
  writeFileSync(f.toolPath, '#!/bin/sh\nprintf "private tool output" >&2\nexit 7\n');
  assert.throws(() => validateDevelopmentTestNativeAccess(f.options));
  rmSync(f.buildConfigPath);
  assert.throws(() => validateDevelopmentTestNativeAccess(f.options));
});

test('native access CLI emits no payload and sanitizes every rejection', t => {
  const f = fixture(t);
  assert.deepEqual([f.run().status, f.run().stdout, f.run().stderr], [0, '', '']);
  const rejection = 'validate-development-test-native-access: invalid native access capability.\n';
  writeFileSync(f.output, badging.replace('application-debuggable\n', '') + 'private tool output\n');
  const invalid = f.run();
  assert.deepEqual([invalid.status, invalid.stdout, invalid.stderr], [1, '', rejection]);
  writeFileSync(f.toolPath, '#!/bin/sh\nprintf "private tool output" >&2\nexit 7\n');
  const failed = f.run();
  assert.deepEqual([failed.status, failed.stdout, failed.stderr], [1, '', rejection]);
  const missing = spawnSync(process.execPath, [helper], { encoding: 'utf8', env: { ...process.env, ANDROID_HOME: '', ANDROID_SDK_ROOT: '' } });
  assert.deepEqual([missing.status, missing.stdout, missing.stderr], [1, '', rejection]);
});

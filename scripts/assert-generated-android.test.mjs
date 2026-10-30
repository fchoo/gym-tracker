import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./assert-generated-android.mjs', import.meta.url));

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'p20-generated-android-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, content) => {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  const exclusions = [['database', '.'], ['file', 'backup-staging'], ['file', 'plaintext-staging'],
    ['external', 'backup-staging'], ['external', 'plaintext-staging']]
    .map(([domain, excludedPath]) => `<exclude domain="${domain}" path="${excludedPath}" />`).join('\n');
  const manifest = `<manifest><uses-permission android:name="android.permission.INTERNET" /><uses-permission android:name="android.permission.VIBRATE" />
<application android:debuggable="true" android:allowBackup="true" android:fullBackupContent="@xml/backup_rules" android:dataExtractionRules="@xml/data_extraction_rules">
<data android:scheme="gymtracker-devtest" /><service android:name=".GymTrackerPhysicalTestService" android:exported="true" android:permission="android.permission.DUMP" /></application></manifest>`;
  const gradle = `apply plugin: "com.facebook.react"
compileSdk rootProject.ext.compileSdkVersion
minSdkVersion rootProject.ext.minSdkVersion
targetSdkVersion rootProject.ext.targetSdkVersion
buildToolsVersion rootProject.ext.buildToolsVersion
ndkVersion rootProject.ext.ndkVersion
applicationId "com.fchoo.gymtracker.devtest"
namespace "com.fchoo.gymtracker.devtest"
implementation("com.facebook.react:hermes-android")`;
  write('android/gradle/wrapper/gradle-wrapper.properties', 'distributionUrl=https://services.gradle.org/distributions/gradle-9.3.1-bin.zip\nvalidateDistributionUrl=true');
  write('android/gradle.properties', 'newArchEnabled=true\nhermesEnabled=true');
  write('android/build.gradle', 'apply plugin: "expo-root-project"\napply plugin: "com.facebook.react.rootproject"');
  write('android/app/build.gradle', gradle);
  write('android/app/src/main/AndroidManifest.xml', manifest);
  write('android/app/src/main/res/values/strings.xml', '<string name="app_name">Gym Tracker Dev Test</string>');
  write('android/app/src/main/res/xml/backup_rules.xml', exclusions);
  write('android/app/src/main/res/xml/data_extraction_rules.xml', `<cloud-backup>${exclusions}</cloud-backup><device-transfer>${exclusions}</device-transfer>`);
  write('android/app/src/main/java/com/fchoo/gymtracker/devtest/GymTrackerPhysicalTestService.kt', 'class GymTrackerPhysicalTestService : HeadlessJsTaskService() { HeadlessJsTaskConfig("GymTrackerPhysicalTest", 900_000) }');
  write('node_modules/react-native/gradle/libs.versions.toml', Object.entries({ agp: '8.12.0', kotlin: '2.1.20', compileSdk: '36', targetSdk: '36', minSdk: '24', buildTools: '36.0.0', ndkVersion: '27.1.12297006' }).map(([key, value]) => `${key} = "${value}"`).join('\n'));
  write('node_modules/expo-notifications/android/src/main/AndroidManifest.xml', '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" /><uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />');
  const run = () => spawnSync(process.execPath, [script, 'android'], { cwd: root, encoding: 'utf8' });
  return { write, run, manifest, gradle };
}

test('devtest generated contract requires the main application debug flag, not a component flag', t => {
  const { write, run, manifest } = fixture(t);
  assert.equal(run().status, 0);
  for (const candidate of [manifest.replace('android:debuggable="true" ', ''),
    manifest.replace('android:debuggable="true"', 'android:debuggable="false"'),
    manifest.replace('<application android:debuggable="true"', '<activity android:debuggable="true" /><application')]) {
    write('android/app/src/main/AndroidManifest.xml', candidate);
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /main application.*debuggable/u);
  }
});

test('devtest generated debug capability does not relax identity, backup, or service protection', t => {
  const { write, run, manifest, gradle } = fixture(t);
  for (const [name, candidate, message] of [
    ['android/app/build.gradle', gradle.replace('applicationId "com.fchoo.gymtracker.devtest"', 'applicationId "com.fchoo.gymtracker"'), /applicationId/u],
    ['android/app/src/main/AndroidManifest.xml', manifest.replace('android:fullBackupContent="@xml/backup_rules"', ''), /backup rules/u],
    ['android/app/src/main/AndroidManifest.xml', manifest.replace('android:permission="android.permission.DUMP"', ''), /unprotected/u],
  ]) {
    write(name, candidate);
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
    write('android/app/build.gradle', gradle);
    write('android/app/src/main/AndroidManifest.xml', manifest);
  }
});

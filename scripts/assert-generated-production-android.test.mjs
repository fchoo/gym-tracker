import assert from "node:assert/strict";
import { test } from "node:test";
import { validateGeneratedProductionAndroidSources, validateProductionNativeContractConfig } from "./assert-generated-production-android.mjs";
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOOGLE_OAUTH_REGISTRATIONS } from './google-oauth-config.mjs';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

function productionSources() {
  const exclusions = [
    ['database', '.'], ['root', 'backup-staging'], ['root', 'plaintext-staging'],
    ['file', 'backup-staging'], ['file', 'plaintext-staging'],
    ['external', 'backup-staging'], ['external', 'plaintext-staging'],
  ].map(([domain, excludedPath]) => `<exclude domain="${domain}" path="${excludedPath}" />`).join('\n');
  return {
    gradle: 'applicationId "com.fchoo.gymtracker"\nbuildTypes { debug { debuggable true } release { signingConfig signingConfigs.release } }',
    gradleProperties: 'reactNativeArchitectures=arm64-v8a',
    manifest: '<application android:fullBackupContent="@xml/backup_rules" android:dataExtractionRules="@xml/data_extraction_rules"><data android:scheme="gymtracker" /></application>',
    strings: '<string name="app_name">Gym Tracker</string>',
    backup: `<full-backup-content>\n${exclusions}\n</full-backup-content>`,
    extraction: `<data-extraction-rules>\n<cloud-backup>\n${exclusions}\n</cloud-backup>\n<device-transfer>\n${exclusions}\n</device-transfer>\n</data-extraction-rules>`,
  };
}

test('production rejects application debugging without rejecting a normal debug build type', () => {
  const sources = productionSources();
  assert.deepEqual(validateGeneratedProductionAndroidSources(sources), []);
  assert.deepEqual(validateGeneratedProductionAndroidSources({ ...sources,
    manifest: sources.manifest.replace('<application ', '<application android:debuggable="false" '),
  }), []);
  for (const debugValue of ['true', '@bool/debug_enabled', '${debuggable}']) {
    assert.match(validateGeneratedProductionAndroidSources({ ...sources,
      manifest: sources.manifest.replace('<application ', `<application android:debuggable="${debugValue}" `),
    }).join(' '), /nondebuggable/u);
  }
});

test('production rejects release debugging overrides and test instrumentation', () => {
  for (const gradle of [
    'buildTypes { release { debuggable true } }',
    'buildTypes { release { debuggable = true } }',
    'buildTypes.release.debuggable = true',
    'react { debuggableVariants = ["debug", "release"] }',
  ]) {
    assert.match(validateGeneratedProductionAndroidSources({ ...productionSources(),
      gradle: `applicationId "com.fchoo.gymtracker"\n${gradle}`,
    }).join(' '), /release.*debug/u);
  }
  for (const forbidden of [
    '<service android:name=".GymTrackerPhysicalTestService" />',
    '<instrumentation android:name=".Phase20QualityInstrumentation" />',
  ]) {
    assert.match(validateGeneratedProductionAndroidSources({ ...productionSources(),
      manifest: productionSources().manifest + forbidden,
    }).join(' '), /service|instrumentation/u);
  }
});

test('production requires hooks false and suite null in its app config', () => {
  assert.deepEqual(validateProductionNativeContractConfig({ extra: { nativeContractsEnabled: false, nativeContractSuite: null } }), []);
  for (const config of [{}, { extra: {} },
    { extra: { nativeContractsEnabled: true, nativeContractSuite: null } },
    { extra: { nativeContractsEnabled: false, nativeContractSuite: 'v1.2-acceptance' } }]) {
    assert.match(validateProductionNativeContractConfig(config).join(' '), /native contract/u);
  }
});

test('production app config ignores an environment-requested acceptance suite', () => {
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  // Evaluate the factory directly: pinned Expo Serialize converts null into {}.
  const result = spawnSync(process.execPath, ['-e', 'const {loadModuleSync}=require("@expo/require-utils"); const config=loadModuleSync(process.cwd()+"/app.config.ts").default({config:{}}); process.stdout.write(JSON.stringify(config));'], {
    cwd: root, encoding: 'utf8', env: { ...process.env,
      GYM_TRACKER_BUILD_PROFILE: 'production', EXPO_PUBLIC_NATIVE_CONTRACT_SUITE: 'v1.2-acceptance',
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: GOOGLE_OAUTH_REGISTRATIONS.webClientId },
  });
  assert.equal(result.status, 0, 'production config generation failed');
  const config = JSON.parse(result.stdout);
  assert.equal(config.extra.nativeContractsEnabled, false);
  assert.equal(config.extra.nativeContractSuite, null);
  assert.equal(config.android.package, 'com.fchoo.gymtracker');
});

test('production assertion CLI evaluates raw config when cache is absent and rejects poisoned cache', t => {
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const temporary = mkdtempSync(path.join(tmpdir(), 'p20-production-cli-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const sources = productionSources();
  const android = path.join(temporary, 'android');
  for (const [name, value] of Object.entries({ 'app/build.gradle': sources.gradle,
    'gradle.properties': sources.gradleProperties, 'app/src/main/AndroidManifest.xml': sources.manifest,
    'app/src/main/res/values/strings.xml': sources.strings, 'app/src/main/res/xml/backup_rules.xml': sources.backup,
    'app/src/main/res/xml/data_extraction_rules.xml': sources.extraction })) {
    mkdirSync(path.dirname(path.join(android, name)), { recursive: true });
    writeFileSync(path.join(android, name), value);
  }
  const run = () => spawnSync(process.execPath, [path.join(root, 'scripts/assert-generated-production-android.mjs'), android], {
    cwd: temporary, encoding: 'utf8', env: { ...process.env,
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: GOOGLE_OAUTH_REGISTRATIONS.webClientId,
      EXPO_PUBLIC_NATIVE_CONTRACT_SUITE: 'v1.2-acceptance' },
  });
  assert.equal(run().status, 0, 'uncached production assertion failed');
  const config = spawnSync(process.execPath, ['-e', 'const {loadModuleSync}=require("@expo/require-utils"); process.stdout.write(JSON.stringify(loadModuleSync(process.cwd()+"/app.config.ts").default({config:{}})));'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, GYM_TRACKER_BUILD_PROFILE: 'production',
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: GOOGLE_OAUTH_REGISTRATIONS.webClientId },
  });
  assert.equal(config.status, 0);
  const poisoned = JSON.parse(config.stdout);
  poisoned.extra.nativeContractsEnabled = true;
  poisoned.extra.nativeContractSuite = 'v1.2-acceptance';
  mkdirSync(path.join(temporary, '.expo'));
  writeFileSync(path.join(temporary, '.expo/production-app-config.json'), JSON.stringify(poisoned));
  const rejected = run();
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /native contract hooks/u);
});

test('production assertion accepts the Garmin-selected ARM64 generation contract', () => {
  assert.deepEqual(validateGeneratedProductionAndroidSources(productionSources()), []);
});

test('production assertion rejects absent, widened, and non-ARM64 ABI properties', () => {
  for (const gradleProperties of ['', 'reactNativeArchitectures=x86_64',
    'reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64',
    'reactNativeArchitectures=arm64-v8a,x86_64']) {
    assert.match(validateGeneratedProductionAndroidSources({
      ...productionSources(), gradleProperties,
    }).join(' '), /architectures.*ARM64/u);
  }
});

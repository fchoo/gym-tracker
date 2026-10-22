import assert from "node:assert/strict";
import { test } from "node:test";
import { validateGeneratedProductionAndroidSources } from "./assert-generated-production-android.mjs";

export function productionSources() {
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

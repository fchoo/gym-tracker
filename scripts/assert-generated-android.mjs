#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const androidRoot = path.resolve(projectRoot, process.argv[2] ?? 'android');
const failures = [];

const required = {
  gradle: '9.3.1',
  agp: '8.12.0',
  kotlin: '2.1.20',
  compileSdk: '36',
  targetSdk: '36',
  minSdk: '24',
  buildTools: '36.0.0',
  ndk: '27.1.12297006',
  packageName: 'com.fchoo.gymtracker.devtest',
};

const allowedPermissions = new Set([
  'android.permission.INTERNET',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.VIBRATE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
]);

const forbiddenExactAlarmPermissions = new Set([
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
]);

function fail(message) {
  failures.push(message);
}

async function read(relativePath) {
  const absolutePath = path.join(androidRoot, relativePath);
  try {
    return await readFile(absolutePath, 'utf8');
  } catch {
    fail(`missing generated file: android/${relativePath}`);
    return '';
  }
}

async function assertDirectory() {
  try {
    const details = await stat(androidRoot);
    if (!details.isDirectory()) {
      fail(`generated Android path is not a directory: ${androidRoot}`);
    }
  } catch {
    fail(`generated Android directory is missing: ${androidRoot}`);
  }
}

function assertMatch(contents, pattern, message) {
  if (!pattern.test(contents)) {
    fail(message);
  }
}

function parseTomlVersions(contents) {
  const values = new Map();
  for (const match of contents.matchAll(/^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*"([^"]+)"\s*$/gm)) {
    values.set(match[1], match[2]);
  }
  return values;
}

function assertCatalogValue(values, key, expected) {
  const actual = values.get(key);
  if (actual !== expected) {
    fail(`React Native catalog ${key} must be ${expected}; found ${actual ?? 'missing'}`);
  }
}

function permissionTags(manifest) {
  return [...manifest.matchAll(/<uses-permission\b[^>]*>/g)].map((match) => match[0]);
}

function attribute(tag, name) {
  return tag.match(new RegExp(`${name}="([^"]+)"`))?.[1];
}

function assertPermissions(manifest) {
  const activePermissions = new Set();

  for (const tag of permissionTags(manifest)) {
    const permission = attribute(tag, 'android:name');
    if (!permission) {
      fail(`generated manifest has a permission without android:name: ${tag}`);
      continue;
    }

    const removalOnly = attribute(tag, 'tools:node') === 'remove';
    if (forbiddenExactAlarmPermissions.has(permission)) {
      if (!removalOnly) {
        fail(`exact-alarm permission must not be active: ${permission}`);
      }
      continue;
    }

    if (!removalOnly) {
      activePermissions.add(permission);
      if (!allowedPermissions.has(permission)) {
        fail(`unreviewed Android permission is active: ${permission}`);
      }
    }
  }

  for (const expectedPermission of [
    'android.permission.INTERNET',
    'android.permission.VIBRATE',
  ]) {
    if (!activePermissions.has(expectedPermission)) {
      fail(`expected Android permission is missing: ${expectedPermission}`);
    }
  }
}

function assertNotificationLibraryPermissions(manifest) {
  const permissions = new Set(
    permissionTags(manifest)
      .map((tag) => attribute(tag, 'android:name'))
      .filter(Boolean),
  );

  for (const expectedPermission of [
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.RECEIVE_BOOT_COMPLETED',
  ]) {
    if (!permissions.has(expectedPermission)) {
      fail(`expo-notifications permission is missing: ${expectedPermission}`);
    }
  }

  for (const forbiddenPermission of forbiddenExactAlarmPermissions) {
    if (permissions.has(forbiddenPermission)) {
      fail(`expo-notifications declares a forbidden exact-alarm permission: ${forbiddenPermission}`);
    }
  }
}

function assertBackupRules(contents, relativePath, sectionName = null) {
  const section = sectionName
    ? contents.match(new RegExp(`<${sectionName}>[\\s\\S]*?<\\/${sectionName}>`))?.[0] ?? ''
    : contents;

  if (!section) {
    fail(`android/${relativePath} is missing <${sectionName}>`);
    return;
  }

  const expectedExclusions = [
    ['database', '.'],
    ['file', 'backup-staging'],
    ['file', 'plaintext-staging'],
    ['external', 'backup-staging'],
    ['external', 'plaintext-staging'],
  ];

  for (const [domain, excludedPath] of expectedExclusions) {
    const pattern = new RegExp(
      `<exclude\\s+domain="${domain}"\\s+path="${excludedPath.replace('.', '\\.')}"\\s*/>`,
    );
    if (!pattern.test(section)) {
      fail(
        `android/${relativePath}${sectionName ? ` <${sectionName}>` : ''} must exclude ${domain}:${excludedPath}`,
      );
    }
  }
}

await assertDirectory();

const [
  wrapperProperties,
  gradleProperties,
  rootBuildGradle,
  appBuildGradle,
  manifest,
  strings,
  backupRules,
  extractionRules,
  physicalTestService,
] = await Promise.all([
  read('gradle/wrapper/gradle-wrapper.properties'),
  read('gradle.properties'),
  read('build.gradle'),
  read('app/build.gradle'),
  read('app/src/main/AndroidManifest.xml'),
  read('app/src/main/res/values/strings.xml'),
  read('app/src/main/res/xml/backup_rules.xml'),
  read('app/src/main/res/xml/data_extraction_rules.xml'),
  read(
    'app/src/main/java/com/fchoo/gymtracker/devtest/GymTrackerPhysicalTestService.kt',
  ),
]);

assertMatch(
  wrapperProperties,
  new RegExp(`gradle-${required.gradle.replaceAll('.', '\\.')}-(?:bin|all)\\.zip`),
  `Gradle wrapper must be ${required.gradle}`,
);
assertMatch(
  wrapperProperties,
  /^validateDistributionUrl=true$/m,
  'Gradle wrapper distribution URL validation must be enabled',
);
assertMatch(rootBuildGradle, /apply plugin:\s*["']expo-root-project["']/, 'Expo root Gradle plugin is missing');
assertMatch(
  rootBuildGradle,
  /apply plugin:\s*["']com\.facebook\.react\.rootproject["']/,
  'React Native root Gradle plugin is missing',
);
assertMatch(
  appBuildGradle,
  /apply plugin:\s*["']com\.facebook\.react["']/,
  'React Native application Gradle plugin is missing',
);
assertMatch(
  appBuildGradle,
  /compileSdk\s+rootProject\.ext\.compileSdkVersion/,
  'app build must consume the generated compileSdk contract',
);
assertMatch(
  appBuildGradle,
  /minSdkVersion\s+rootProject\.ext\.minSdkVersion/,
  'app build must consume the generated minSdk contract',
);
assertMatch(
  appBuildGradle,
  /targetSdkVersion\s+rootProject\.ext\.targetSdkVersion/,
  'app build must consume the generated targetSdk contract',
);
assertMatch(
  appBuildGradle,
  /buildToolsVersion\s+rootProject\.ext\.buildToolsVersion/,
  'app build must consume the generated Build Tools contract',
);
assertMatch(
  appBuildGradle,
  /ndkVersion\s+rootProject\.ext\.ndkVersion/,
  'app build must consume the generated NDK contract',
);
assertMatch(
  appBuildGradle,
  new RegExp(`applicationId\\s+["']${required.packageName.replaceAll('.', '\\.')}["']`),
  `development-test applicationId must be ${required.packageName}`,
);
assertMatch(
  appBuildGradle,
  new RegExp(`namespace\\s+["']${required.packageName.replaceAll('.', '\\.')}["']`),
  `development-test namespace must be ${required.packageName}`,
);
assertMatch(
  appBuildGradle,
  /implementation\(["']com\.facebook\.react:hermes-android["']\)/,
  'Hermes dependency branch is missing',
);
assertMatch(gradleProperties, /^newArchEnabled=true$/m, 'New Architecture must be enabled');
assertMatch(gradleProperties, /^hermesEnabled=true$/m, 'Hermes must be enabled');

const catalogPath = path.join(
  projectRoot,
  'node_modules',
  'react-native',
  'gradle',
  'libs.versions.toml',
);
let catalog = '';
try {
  catalog = await readFile(catalogPath, 'utf8');
} catch {
  fail(`React Native generated-version catalog is missing: ${catalogPath}`);
}
const catalogVersions = parseTomlVersions(catalog);
assertCatalogValue(catalogVersions, 'agp', required.agp);
assertCatalogValue(catalogVersions, 'kotlin', required.kotlin);
assertCatalogValue(catalogVersions, 'compileSdk', required.compileSdk);
assertCatalogValue(catalogVersions, 'targetSdk', required.targetSdk);
assertCatalogValue(catalogVersions, 'minSdk', required.minSdk);
assertCatalogValue(catalogVersions, 'buildTools', required.buildTools);
assertCatalogValue(catalogVersions, 'ndkVersion', required.ndk);

const notificationManifestPath = path.join(
  projectRoot,
  'node_modules',
  'expo-notifications',
  'android',
  'src',
  'main',
  'AndroidManifest.xml',
);
let notificationManifest = '';
try {
  notificationManifest = await readFile(notificationManifestPath, 'utf8');
} catch {
  fail(`expo-notifications Android manifest is missing: ${notificationManifestPath}`);
}

assertMatch(manifest, /android:allowBackup="true"/, 'Android backup must be explicitly enabled with exclusions');
assertMatch(
  manifest,
  /android:fullBackupContent="@xml\/backup_rules"/,
  'Android 11-and-lower backup rules are not linked',
);
assertMatch(
  manifest,
  /android:dataExtractionRules="@xml\/data_extraction_rules"/,
  'Android 12+ extraction rules are not linked',
);
assertMatch(
  manifest,
  /<data[^>]*android:scheme="gymtracker-devtest"/,
  'development-test URL scheme is missing from generated manifest',
);
if (/android:screenOrientation="portrait"/.test(manifest)) {
  fail('generated Android activity must allow rotation; portrait lock is present');
}
assertMatch(
  strings,
  /<string name="app_name">Gym Tracker Dev Test<\/string>/,
  'development-test app label is missing',
);
assertMatch(
  manifest,
  /<service\b(?=[^>]*android:name="\.GymTrackerPhysicalTestService")(?=[^>]*android:exported="true")(?=[^>]*android:permission="android\.permission\.DUMP")[^>]*\/>/,
  'development-test physical Headless JS service is missing or unprotected',
);
assertMatch(
  physicalTestService,
  /class GymTrackerPhysicalTestService : HeadlessJsTaskService\(\)/,
  'development-test physical Headless JS service source is missing',
);
assertMatch(
  physicalTestService,
  /HeadlessJsTaskConfig\(\s*"GymTrackerPhysicalTest"/,
  'development-test physical Headless JS task key is missing',
);
assertMatch(
  physicalTestService,
  /900_000/,
  'physical Headless JS task must retain its bounded fifteen-minute timeout',
);
assertPermissions(manifest);
assertNotificationLibraryPermissions(notificationManifest);
assertBackupRules(backupRules, 'app/src/main/res/xml/backup_rules.xml');
assertBackupRules(extractionRules, 'app/src/main/res/xml/data_extraction_rules.xml', 'cloud-backup');
assertBackupRules(extractionRules, 'app/src/main/res/xml/data_extraction_rules.xml', 'device-transfer');

if (failures.length > 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: 'generated_android_contract_failed',
        failures: failures.slice(0, 30),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify({
    ok: true,
    profile: 'development-test',
    package: required.packageName,
    gradle: required.gradle,
    agp: required.agp,
    kotlin: required.kotlin,
    sdk: {
      compile: Number(required.compileSdk),
      target: Number(required.targetSdk),
      minimum: Number(required.minSdk),
    },
    buildTools: required.buildTools,
    ndk: required.ndk,
    hermes: true,
    newArchitecture: true,
  }),
);

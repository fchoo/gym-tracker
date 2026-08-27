#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  readlinkSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const resultArgument = process.argv[2]
  ?? 'artifacts/native/sqlite-kernel/result.json';
const resultPath = path.resolve(projectRoot, resultArgument);
const failures = [];
const SQLITE_KERNEL_CASE_IDS = [
  'connection-configuration',
  'foreign-key-enforcement',
  'fifo-write-serialization',
  'bounded-write-contention',
  'reader-committed-isolation',
  'rollback-fixture-matrix',
  'commit-latch',
  'duplicate-idempotency',
  'prepared-statement-cleanup',
  'private-boundary',
];
const phase2FtsContractSource = readFileSync(
  path.join(
    projectRoot,
    'src/testing/contracts/phase2Fts.contract.ts',
  ),
  'utf8',
);
const phase2FtsCaseBlock = phase2FtsContractSource.match(
  /export const PHASE2_FTS_CASE_IDS = \[([\s\S]*?)\] as const;/u,
)?.[1] ?? '';
const PHASE2_FTS_CASE_IDS = [
  ...phase2FtsCaseBlock.matchAll(/"([a-z0-9-]+)"/gu),
].map((match) => match[1]);

function fail(message) {
  failures.push(message);
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    fail(`${label} is not readable JSON: ${error.message}`);
    return {};
  }
}

function git(...args) {
  return execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
}

function sourcePaths() {
  const output = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: projectRoot,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const excluded = /^(?:android|ios|node_modules|artifacts|\.expo|\.gradle|\.kotlin|\.cache|coverage|dist|web-build)(?:\/|$)|^modules\/[^/]+\/android\/build(?:\/|$)|(?:^|\/)\.metro-health-check|\.tsbuildinfo$/;
  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((filePath) => !excluded.test(filePath))
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

function sourceTreeSha256() {
  const hash = createHash('sha256');
  for (const filePath of sourcePaths()) {
    const absolutePath = path.join(projectRoot, filePath);
    const details = lstatSync(absolutePath);
    const type = details.isSymbolicLink()
      ? 'symlink'
      : details.isFile()
        ? 'file'
        : 'other';
    const contents = details.isSymbolicLink()
      ? Buffer.from(readlinkSync(absolutePath))
      : details.isFile()
        ? readFileSync(absolutePath)
        : Buffer.alloc(0);
    const pathBytes = Buffer.from(filePath);
    hash.update(
      Buffer.from(
        `${pathBytes.length}\0${type}\0${(details.mode & 0o777).toString(8)}\0${contents.length}\0`,
      ),
    );
    hash.update(pathBytes);
    hash.update(Buffer.from('\0'));
    hash.update(contents);
    hash.update(Buffer.from('\0'));
  }
  return hash.digest('hex');
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function same(label, left, right) {
  if (left !== right) {
    fail(`${label} mismatch: ${String(left)} != ${String(right)}`);
  }
}

function adb(serial, ...args) {
  const androidHome = process.env.ANDROID_HOME
    ?? process.env.ANDROID_SDK_ROOT
    ?? '/opt/homebrew/share/android-commandlinetools';
  const executable = path.join(androidHome, 'platform-tools', 'adb');
  return execFileSync(executable, ['-s', serial, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

const result = await readJson(resultPath, 'result');
const manifestPath = path.resolve(
  projectRoot,
  result.build_manifest
    ?? path.join(path.dirname(resultArgument), 'build.json'),
);
const manifest = await readJson(manifestPath, 'build manifest');
const expectedCaseIds = new Set(
  manifest.suite === 'phase2-fts'
    ? PHASE2_FTS_CASE_IDS
    : SQLITE_KERNEL_CASE_IDS,
);
const expectedCount = expectedCaseIds.size;
if (
  manifest.suite === 'phase2-fts'
  && (
    expectedCount < 1
    || expectedCount !== PHASE2_FTS_CASE_IDS.length
  )
) {
  fail('PHASE2_FTS_CASE_IDS could not be derived from source.');
}

same('schema version', result.schema_version, 1);
same('manifest schema version', manifest.schema_version, 1);
same('suite', result.suite, manifest.suite);
same('result status', result.status, 'passed');
same('profile', manifest.profile, 'development-test');
same('build variant', manifest.build_variant, 'release');
same('embedded JS bundle', manifest.js_bundle?.embedded, true);
same('base_head result/manifest', result.base_head, manifest.base_head);
same(
  'source_tree_sha256 result/manifest',
  result.source_tree_sha256,
  manifest.source_tree_sha256,
);
same('package result/manifest', result.package, manifest.package);
same('APK path result/manifest', result.apk?.path, manifest.apk?.path);
same('APK SHA-256 result/manifest', result.apk?.sha256, manifest.apk?.sha256);
same('APK size result/manifest', result.apk?.size_bytes, manifest.apk?.size_bytes);
same('device serial result/manifest', result.device?.serial, manifest.device?.serial);
same('device API result/manifest', result.device?.api, manifest.device?.api);
same('device ABI result/manifest', result.device?.abi, manifest.device?.abi);

same('current base HEAD', manifest.base_head, git('rev-parse', 'HEAD'));
same('current source-tree digest', manifest.source_tree_sha256, sourceTreeSha256());

const apkPath = path.resolve(projectRoot, manifest.apk?.path ?? '');
try {
  const retainedSha256 = sha256(apkPath);
  same('retained APK SHA-256', manifest.apk?.sha256, retainedSha256);
  same('result APK SHA-256', result.apk?.sha256, retainedSha256);
  same('installed APK result SHA-256', result.installed_apk?.sha256, retainedSha256);
  same('installed APK byte match', result.installed_apk?.matches_retained_apk, true);
  const entries = execFileSync('unzip', ['-Z1', apkPath], {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).split(/\r?\n/u);
  if (!entries.includes('assets/index.android.bundle')) {
    fail('retained APK does not contain assets/index.android.bundle.');
  }
} catch (error) {
  fail(`retained APK is unavailable: ${error.message}`);
}

same('16 KiB alignment size', manifest.apk?.page_alignment_kib, 16);
same('manifest page-alignment proof', manifest.apk?.page_alignment_verified, true);

same('contract expected count', result.contract?.expected_count, expectedCount);
same('contract total', result.contract?.total, expectedCount);
same('contract passed', result.contract?.passed, expectedCount);
same('contract failed', result.contract?.failed, 0);
same('contract skipped', result.contract?.skipped, 0);
if (
  !Array.isArray(result.contract?.cases)
  || result.contract.cases.length !== expectedCount
) {
  fail(
    expectedCount === SQLITE_KERNEL_CASE_IDS.length
      ? 'contract cases must contain exactly ten results.'
      : `contract cases must contain exactly ${expectedCount} results.`,
  );
} else {
  const caseIds = new Set();
  for (const contractCase of result.contract.cases) {
    if (contractCase.status !== 'passed') {
      fail(`contract case did not pass: ${String(contractCase.id)}`);
    }
    if (!contractCase.id || caseIds.has(contractCase.id)) {
      fail(`contract case ID is missing or duplicated: ${String(contractCase.id)}`);
    }
    caseIds.add(contractCase.id);
  }
  for (const expectedCaseId of expectedCaseIds) {
    if (!caseIds.has(expectedCaseId)) {
      fail(`required contract case is missing: ${expectedCaseId}`);
    }
  }
}

for (const [label, timestamp] of [
  ['manifest started_at', manifest.started_at],
  ['manifest finished_at', manifest.finished_at],
  ['contract started_at', result.contract?.started_at],
  ['contract finished_at', result.contract?.finished_at],
  ['runner started_at', result.runner?.started_at],
  ['runner finished_at', result.runner?.finished_at],
]) {
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    fail(`${label} must be an ISO timestamp.`);
  }
}

if (!/^[0-9a-f]{40}$/u.test(manifest.base_head ?? '')) {
  fail('base_head must be a full 40-character Git SHA.');
}
if (!/^[0-9a-f]{64}$/u.test(manifest.source_tree_sha256 ?? '')) {
  fail('source_tree_sha256 must be a 64-character SHA-256.');
}
if (!/^[0-9a-f]{64}$/u.test(manifest.apk?.sha256 ?? '')) {
  fail('APK SHA-256 must be a 64-character digest.');
}
if (!manifest.package || !manifest.device?.serial || !manifest.device?.abi) {
  fail('package, device serial, and ABI are required.');
}
if (!Number.isInteger(manifest.device?.api) || manifest.device.api < 24) {
  fail('device API must be an integer >= 24.');
}

try {
  const packagePath = adb(
    manifest.device?.serial,
    'shell',
    'pm',
    'path',
    manifest.package,
  )
    .split(/\r?\n/u)
    .find((line) => line.startsWith('package:'))
    ?.slice('package:'.length);
  if (!packagePath) {
    fail(`package is not installed on the bound device: ${String(manifest.package)}`);
  } else {
    same('installed package path', result.installed_apk?.device_path, packagePath);
    const installedBytes = execFileSync(
      path.join(
        process.env.ANDROID_HOME
          ?? process.env.ANDROID_SDK_ROOT
          ?? '/opt/homebrew/share/android-commandlinetools',
        'platform-tools',
        'adb',
      ),
      ['-s', manifest.device.serial, 'exec-out', 'cat', packagePath],
      { cwd: projectRoot, maxBuffer: 256 * 1024 * 1024 },
    );
    const installedSha256 = createHash('sha256')
      .update(installedBytes)
      .digest('hex');
    same('live installed APK SHA-256', installedSha256, manifest.apk?.sha256);
  }

  const deviceApi = Number(
    adb(manifest.device?.serial, 'shell', 'getprop', 'ro.build.version.sdk')
      .replace(/\r/gu, ''),
  );
  const deviceAbi = adb(
    manifest.device?.serial,
    'shell',
    'getprop',
    'ro.product.cpu.abi',
  ).replace(/\r/gu, '');
  same('live device API', deviceApi, manifest.device?.api);
  same('live device ABI', deviceAbi, manifest.device?.abi);
} catch (error) {
  fail(`live package/device verification failed: ${error.message}`);
}

if (failures.length > 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: 'native_sqlite_evidence_failed',
        failures: failures.slice(0, 40),
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
    suite: manifest.suite,
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    apk_sha256: manifest.apk.sha256,
    package: manifest.package,
    device: manifest.device,
    contracts: {
      total: result.contract.total,
      passed: result.contract.passed,
      skipped: result.contract.skipped,
    },
  }),
);

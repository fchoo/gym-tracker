#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  readlinkSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const resultArgument = process.argv[2] ?? 'artifacts/native/bootstrap/result.json';
const projectRoot = process.cwd();
const resultPath = path.resolve(projectRoot, resultArgument);
const failures = [];

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
    const type = details.isSymbolicLink() ? 'symlink' : details.isFile() ? 'file' : 'other';
    const contents = details.isSymbolicLink()
      ? Buffer.from(readlinkSync(absolutePath))
      : details.isFile()
        ? readFileSync(absolutePath)
        : Buffer.alloc(0);
    const pathBytes = Buffer.from(filePath);
    const header = Buffer.from(
      `${pathBytes.length}\0${type}\0${(details.mode & 0o777).toString(8)}\0${contents.length}\0`,
    );
    hash.update(header);
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

const result = await readJson(resultPath, 'result');
const manifestPath = path.resolve(
  projectRoot,
  result.build_manifest ?? path.join(path.dirname(resultArgument), 'build.json'),
);
const manifest = await readJson(manifestPath, 'build manifest');

same('schema version', result.schema_version, 1);
same('result status', result.status, 'passed');
same('suite', result.suite, manifest.suite);
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
  const actualApkSha256 = sha256(apkPath);
  same('retained APK SHA-256', manifest.apk?.sha256, actualApkSha256);
  same('result APK SHA-256', result.apk?.sha256, actualApkSha256);
  same('installed APK SHA-256', result.installed_apk?.sha256, actualApkSha256);
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
same('result page-alignment proof', result.apk?.page_alignment_verified, true);
same('launch proof', result.launch?.succeeded, true);

if (!/^[0-9a-f]{40}$/u.test(manifest.base_head ?? '')) {
  fail('base_head must be a full 40-character Git SHA.');
}
if (!/^[0-9a-f]{64}$/u.test(manifest.source_tree_sha256 ?? '')) {
  fail('source_tree_sha256 must be a 64-character SHA-256.');
}
if (!/^[0-9a-f]{64}$/u.test(manifest.apk?.sha256 ?? '')) {
  fail('APK sha256 must be a 64-character SHA-256.');
}
if (!Number.isInteger(manifest.device?.api) || manifest.device.api < 24) {
  fail(`device API must be an integer >= 24; found ${String(manifest.device?.api)}`);
}
if (!manifest.device?.serial || !manifest.device?.abi) {
  fail('device serial and ABI are required.');
}

if (failures.length > 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: 'bootstrap_native_evidence_failed',
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
    suite: manifest.suite,
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    apk_sha256: manifest.apk.sha256,
    package: manifest.package,
    device: manifest.device,
  }),
);

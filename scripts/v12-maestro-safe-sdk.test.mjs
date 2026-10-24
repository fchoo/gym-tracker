import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { inspectSafeSdkToolchain, prepareSafeMaestroSdk, resolveSafeSdkToolchain, safeSdkArguments, validateSafeSdkRequest, verifySafeSdkBinding } from './v12-maestro-safe-sdk.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'maestro-safe-host-'));
  const lib = path.join(root, 'lib'); const jdk = path.join(root, 'jdk'); const compiler = path.join(root, 'compiler.jar');
  mkdirSync(lib); mkdirSync(path.join(jdk, 'bin'), { recursive: true });
  writeFileSync(path.join(lib, 'sdk.jar'), 'sdk'); writeFileSync(path.join(jdk, 'bin/java'), 'java'); writeFileSync(compiler, 'compiler');
  const source = path.join(root, 'source'); mkdirSync(source);
  for (const name of ['SafeFlow.kt', 'SafeMaestro.kt', 'SessionOwnedDriver.kt']) writeFileSync(path.join(source, name), name);
  const pins = { maestro_version: '2.8.0', compiler: { version: '2.2.0', sha256: sha('compiler') },
    jdk: { version: '17.0.20+8', files: { 'bin/java': sha('java') } }, jars: { 'sdk.jar': sha('sdk') } };
  const runCommand = (_command, args) => {
    if (args[0] === '-version') return { status: 0, stderr: 'openjdk version "17.0.20"\nTemurin-17.0.20+8', stdout: '' };
    writeFileSync(args[args.indexOf('-d') + 1], 'compiled-source');
    return { status: 0, stdout: '', stderr: '' };
  };
  return { root, toolchain: { pins, lib, compiler, jdk }, source, buildRoot: path.join(root, 'builds'), runCommand };
}

test('safe SDK contract carries the exact serial, YAML, explicit environment, JUnit and bounded deadline', () => {
  const request = { serial: 'review-serial', flow: '/flows/recovery.yaml', junit: '/private/raw.xml', deadlineMs: 180_000, env: { V12_DOMAIN_NONCE: 'ab', VALUE: 'a=b' } };
  assert.deepEqual(validateSafeSdkRequest(request), request);
  assert.deepEqual(safeSdkArguments({ jar: '/runner.jar', classpath: '/sdk.jar' }, request), [
    '-cp', '/runner.jar:/sdk.jar', 'gymtracker.maestrosafe.SafeMaestroKt',
    'review-serial', '/flows/recovery.yaml', '/private/raw.xml', '180000', 'V12_DOMAIN_NONCE=ab', 'VALUE=a=b',
  ]);
});

test('safe SDK contract rejects missing identity, ambiguous environment and unbounded deadlines', () => {
  const request = { serial: 'review-serial', flow: '/flows/recovery.yaml', junit: '/private/raw.xml', deadlineMs: 180_000, env: {} };
  for (const change of [{ serial: '' }, { serial: '-s' }, { serial: null }, { flow: null }, { flow: 'relative.yaml' }, { flow: '/bad\nflow' }, { junit: null }, { junit: 'relative.xml' }, { junit: '/bad\0report' }, { deadlineMs: 0 }, { deadlineMs: 180_001 }, { deadlineMs: 1.1 }, { env: null }, { env: 1 }, { env: [] }, { env: { 'BAD=KEY': 'x' } }, { env: { KEY: 1 } }, { env: { KEY: 'x\0y' } }, { env: { KEY: 'x'.repeat(4097) } }]) {
    assert.throws(() => validateSafeSdkRequest({ ...request, ...change }), /maestro_safe_sdk_request_invalid/u);
  }
  assert.throws(() => validateSafeSdkRequest(null), /maestro_safe_sdk_request_invalid/u);
});

test('offline toolchain binds fixed versions and every JAR/compiler/JDK byte before compilation', () => {
  const f = fixture();
  assert.equal(inspectSafeSdkToolchain(f.toolchain, f.runCommand).receipt.jdk_version, '17.0.20+8');
  const changes = [
    (v) => { v.pins.maestro_version = '2.9'; }, (v) => { v.pins.compiler.version = '2.3'; }, (v) => { v.pins.jdk.version = '18'; },
    (v) => { writeFileSync(path.join(v.lib, 'extra.jar'), 'extra'); },
    (v) => { writeFileSync(path.join(v.lib, 'sdk.jar'), 'changed'); },
    (v) => { writeFileSync(v.compiler, 'changed'); },
    (v) => { symlinkSync(v.compiler, path.join(v.lib, 'link.jar')); v.pins.jars['link.jar'] = sha('compiler'); },
    (v) => { mkdirSync(path.join(v.lib, 'directory.jar')); v.pins.jars['directory.jar'] = sha('directory'); },
  ];
  for (const change of changes) { const v = fixture(); change(v.toolchain); assert.throws(() => inspectSafeSdkToolchain(v.toolchain, v.runCommand), /maestro_safe_sdk_toolchain_invalid/u); }
  for (const result of [{ status: 1 }, { status: 0, signal: 'SIGTERM' }, { status: 0, error: new Error('failure') },
    { status: 0, stderr: 'openjdk version "18" Temurin-17.0.20+8' }, { status: 0, stderr: 'openjdk version "17.0.20" wrong vendor' }]) {
    assert.throws(() => inspectSafeSdkToolchain(f.toolchain, () => result), /maestro_safe_sdk_jdk_version_invalid/u);
  }
  const resolved = resolveSafeSdkToolchain('/fixed-home');
  assert.equal(resolved.lib, '/fixed-home/.maestro/lib');
  assert.ok(resolved.compiler.startsWith('/fixed-home/.gradle/'));
});

test('source-owned builds retain immutable inputs, compiler failures and tamper-evident tool receipts', () => {
  const f = fixture(); const binding = prepareSafeMaestroSdk(f);
  assert.equal(verifySafeSdkBinding(binding), true);
  assert.equal(binding.receipt.jar_sha256, sha('compiled-source'));
  assert.deepEqual(Object.keys(binding.receipt.sources), ['SafeFlow.kt', 'SafeMaestro.kt', 'SessionOwnedDriver.kt']);
  chmodSync(binding.jar, 0o600); writeFileSync(binding.jar, 'altered');
  assert.throws(() => verifySafeSdkBinding(binding), /maestro_safe_sdk_toolchain_invalid/u);
  writeFileSync(binding.jar, 'compiled-source'); chmodSync(binding.receiptPath, 0o600); writeFileSync(binding.receiptPath, '{}');
  assert.throws(() => verifySafeSdkBinding(binding), /maestro_safe_sdk_receipt_invalid/u);
  for (const result of [{ status: 1, stdout: 'compile failed' }, { status: 0, signal: 'SIGTERM' }, { status: 0, error: new Error('failure') }, { status: 0 }]) {
    const v = fixture();
    assert.throws(() => prepareSafeMaestroSdk({ ...v, runCommand: (exe, args) => args[0] === '-version' ? v.runCommand(exe, args) : result }), /maestro_safe_sdk_compile_failed/u);
    const directory = path.join(v.buildRoot, readdirSync(v.buildRoot)[0]);
    assert.ok(existsSync(path.join(directory, 'inputs.json')) && existsSync(path.join(directory, 'compile.log')));
    assert.equal(existsSync(path.join(directory, 'tool-receipt.json')), false);
  }
  for (const kind of ['symlink', 'directory']) {
    const v = fixture();
    assert.throws(() => prepareSafeMaestroSdk({ ...v, runCommand: (exe, args) => {
      if (args[0] === '-version') return v.runCommand(exe, args);
      const jar = args[args.indexOf('-d') + 1];
      if (kind === 'symlink') symlinkSync(v.toolchain.compiler, jar); else mkdirSync(jar);
      return { status: 0, stdout: '', stderr: '' };
    } }), /maestro_safe_sdk_build_path_invalid/u);
  }
  const v = fixture(); symlinkSync(v.root, v.buildRoot);
  assert.throws(() => prepareSafeMaestroSdk(v), /maestro_safe_sdk_build_path_invalid/u);
  const w = fixture(); writeFileSync(w.buildRoot, 'not a directory');
  assert.throws(() => prepareSafeMaestroSdk(w));
  for (const mutate of [
    (v, b) => writeFileSync(path.join(v.source, 'SafeFlow.kt'), 'source changed'),
    (v, b) => writeFileSync(v.toolchain.compiler, 'compiler changed'),
    (v, b) => writeFileSync(path.join(v.toolchain.lib, 'sdk.jar'), 'SDK changed'),
    (v, b) => writeFileSync(path.join(v.toolchain.jdk, 'bin/java'), 'JDK changed'),
    (v, b) => writeFileSync(path.join(v.toolchain.lib, 'extra.jar'), 'extra'),
    (v, b) => { b.receipt.wrapper_sha256 = 'altered'; chmodSync(b.receiptPath, 0o600); writeFileSync(b.receiptPath, JSON.stringify(b.receipt)); },
    (v, b) => { b.receipt.toolchain.java_realpath_sha256 = 'altered'; chmodSync(b.receiptPath, 0o600); writeFileSync(b.receiptPath, JSON.stringify(b.receipt)); },
  ]) {
    const v = fixture(); const b = prepareSafeMaestroSdk(v); mutate(v, b); assert.throws(() => verifySafeSdkBinding(b), /maestro_safe_sdk_(?:toolchain|receipt)_invalid/u);
  }
  const drift = fixture();
  const captured = prepareSafeMaestroSdk({ ...drift, runCommand: (exe, args) => {
    if (args[0] !== '-version') {
      writeFileSync(path.join(drift.source, 'SafeMaestro.kt'), 'changed during compiler startup');
      assert.equal(readFileSync(args.at(-1), 'utf8'), 'SessionOwnedDriver.kt');
    }
    return drift.runCommand(exe, args);
  } });
  assert.throws(() => verifySafeSdkBinding(captured), /maestro_safe_sdk_toolchain_invalid/u);
});

function cachedJar(group, name, version) {
  const pins = resolveSafeSdkToolchain().pins.coverage.jars[name];
  assert.equal(pins.version, version);
  assert.ok(pins.relative_path.startsWith(`.gradle/caches/modules-2/files-2.1/${group}/${name}/${version}/`));
  const file = path.join(homedir(), pins.relative_path);
  assert.equal(sha(readFileSync(file)), pins.sha256);
  return file;
}
function checkedRun(exe, args, timeout = 60_000) {
  const r = spawnSync(exe, args, { encoding: 'utf8', timeout, maxBuffer: 1024 * 1024 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`); return r;
}
test('pinned Kotlin runner executes real YAML/Env/Orchestra/JUnit and verifies complete host JaCoCo coverage', () => {
  const binding = prepareSafeMaestroSdk();
  assert.equal(verifySafeSdkBinding(binding), true);
  const root = path.dirname(binding.jar); const source = path.resolve('scripts/maestro-safe-sdk');
  const tools = resolveSafeSdkToolchain();
  const testJar = path.join(root, 'host-tests.jar');
  checkedRun(binding.java, ['-cp', `${tools.compiler}:${binding.classpath}`, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
    '-jvm-target', '17', '-no-stdlib', '-no-reflect', '-classpath', `${binding.jar}:${binding.classpath}`,
    '-d', testJar, path.join(source, 'SafeFlowTest.kt'), path.join(source, 'SessionOwnedDriverTest.kt')]);
  const agentJar = cachedJar('org.jacoco', 'org.jacoco.agent', '0.8.13');
  checkedRun('/usr/bin/unzip', ['-o', agentJar, 'jacocoagent.jar', '-d', root]);
  assert.equal(sha(readFileSync(path.join(root, 'jacocoagent.jar'))), tools.pins.coverage.agent_runtime_sha256);
  const exec = path.join(root, 'host-coverage.exec');
  const host = checkedRun(binding.java, [`-javaagent:${root}/jacocoagent.jar=destfile=${exec},includes=gymtracker.maestrosafe.*`,
    '-cp', `${testJar}:${binding.jar}:${binding.classpath}`, 'gymtracker.maestrosafe.SafeFlowTestKt', root]);
  assert.match(host.stdout, /safe_sdk_host_cases=11/u);
  const ownership = checkedRun(binding.java, [`-javaagent:${root}/jacocoagent.jar=destfile=${exec},append=true,includes=gymtracker.maestrosafe.*`,
    '-cp', `${testJar}:${binding.jar}:${binding.classpath}`, 'gymtracker.maestrosafe.SessionOwnedDriverTestKt', root]);
  assert.match(ownership.stdout, /safe_sdk_owned_driver_cases=complete/u);
  const jacoco = ['org.jacoco.core', 'org.jacoco.report'].map((name) => cachedJar('org.jacoco', name, '0.8.13'));
  const asm = ['asm', 'asm-tree', 'asm-commons'].map((name) => cachedJar('org.ow2.asm', name, '9.8'));
  const reportClasspath = [...jacoco, ...asm].join(':');
  checkedRun(path.join(tools.jdk, 'bin/javac'), ['-cp', reportClasspath, '-d', root, path.join(source, 'CoverageReport.java')]);
  const report = path.join(root, 'host-jacoco.xml');
  checkedRun(binding.java, ['-cp', `${root}:${reportClasspath}`, 'gymtracker.maestrosafe.CoverageReport', exec, binding.jar, source, report]);
  const xml = readFileSync(report, 'utf8');
  for (const name of ['SafeFlow.kt', 'SessionOwnedDriver.kt']) {
    const sourceFile = [...xml.matchAll(/<sourcefile name="([^"]+)">([\s\S]*?)<\/sourcefile>/gu)].find((m) => m[1] === name)[2];
    const metrics = Object.fromEntries([...sourceFile.matchAll(/<counter type="([A-Z]+)" missed="(\d+)" covered="(\d+)"\/>/gu)].map((m) => [m[1], { missed: Number(m[2]), covered: Number(m[3]) }]));
    console.log(JSON.stringify({ host_kotlin_source: name, metrics, report }));
    for (const type of ['INSTRUCTION', 'BRANCH', 'METHOD', 'LINE']) assert.equal(metrics[type].missed, 0, `${name} ${type} coverage incomplete; report ${report}`);
  }
});

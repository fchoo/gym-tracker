import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = fileURLToPath(new URL('./maestro-safe-sdk/', import.meta.url));
const SOURCES = ['SafeFlow.kt', 'SafeMaestro.kt'];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (code) => { throw new Error(`maestro_safe_sdk_${code}`); };

export function validateSafeSdkRequest(request) {
  if (!request || typeof request.serial !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u.test(request.serial)
    || typeof request.flow !== 'string' || !path.isAbsolute(request.flow)
    || typeof request.junit !== 'string' || !path.isAbsolute(request.junit)
    || [request.flow, request.junit].some((value) => /[\u0000\r\n]/u.test(value))
    || !Number.isSafeInteger(request.deadlineMs) || request.deadlineMs < 1 || request.deadlineMs > 180_000
    || !request.env || Array.isArray(request.env) || typeof request.env !== 'object'
    || Object.entries(request.env).some(([key, value]) => !/^[A-Z][A-Z0-9_]{0,127}$/u.test(key)
      || typeof value !== 'string' || value.length > 4_096 || /[\u0000\r\n]/u.test(value))) fail('request_invalid');
  return request;
}

export function safeSdkArguments(binding, request) {
  validateSafeSdkRequest(request);
  return ['-cp', `${binding.jar}${path.delimiter}${binding.classpath}`, 'gymtracker.maestrosafe.SafeMaestroKt',
    request.serial, request.flow, request.junit, String(request.deadlineMs),
    ...Object.entries(request.env).map(([key, value]) => `${key}=${value}`)];
}

/** Fixed offline locations only. Production never reads a tool-path override. */
export function resolveSafeSdkToolchain(home = homedir()) {
  const pins = JSON.parse(readFileSync(path.join(SOURCE, 'toolchain-pins.json'), 'utf8'));
  return {
    pins,
    lib: path.join(home, '.maestro/lib'),
    compiler: path.join(home, pins.compiler.relative_path),
    jdk: path.join(home, pins.jdk.relative_path),
  };
}

function checkedFile(file, expected) {
  const stat = lstatSync(file);
  if (!stat.isFile() || digest(readFileSync(file)) !== expected) fail('toolchain_invalid');
}

export function inspectSafeSdkToolchain(toolchain, runCommand = spawnSync) {
  const { pins, lib, compiler, jdk } = toolchain;
  if (pins.maestro_version !== '2.8.0' || pins.compiler.version !== '2.2.0' || pins.jdk.version !== '17.0.20+8') fail('toolchain_invalid');
  const names = readdirSync(lib).filter((name) => name.endsWith('.jar')).sort();
  if (JSON.stringify(names) !== JSON.stringify(Object.keys(pins.jars).sort())) fail('toolchain_invalid');
  for (const name of names) checkedFile(path.join(lib, name), pins.jars[name]);
  checkedFile(compiler, pins.compiler.sha256);
  for (const [name, hash] of Object.entries(pins.jdk.files)) checkedFile(path.join(jdk, name), hash);
  const java = path.join(jdk, 'bin/java');
  const result = runCommand(java, ['-version'], { encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.signal || result.status !== 0
    || !/openjdk version "17\.0\.20"/u.test(result.stderr)
    || !/Temurin-17\.0\.20\+8/u.test(result.stderr)) fail('jdk_version_invalid');
  return {
    java, compiler, classpath: names.map((name) => path.join(lib, name)).join(path.delimiter),
    receipt: {
      maestro_version: pins.maestro_version, compiler_version: pins.compiler.version, jdk_version: pins.jdk.version,
      compiler_sha256: pins.compiler.sha256, jdk_files: pins.jdk.files, jars: pins.jars,
      java_realpath_sha256: digest(realpathSync(java)),
    },
  };
}

/** Each build is fresh and retained, including failed compiler attempts. */
export function prepareSafeMaestroSdk({ toolchain = resolveSafeSdkToolchain(), source = SOURCE,
  buildRoot = path.join(tmpdir(), 'gym-tracker-maestro-safe-sdk'), runCommand = spawnSync } = {}) {
  const tools = inspectSafeSdkToolchain(toolchain, runCommand);
  const sourceBytes = Object.fromEntries(SOURCES.map((name) => [name, readFileSync(path.join(source, name))]));
  const sources = Object.fromEntries(SOURCES.map((name) => [name, digest(sourceBytes[name])]));
  mkdirSync(buildRoot, { recursive: true, mode: 0o700 });
  if (!lstatSync(buildRoot).isDirectory()) fail('build_path_invalid');
  const directory = mkdtempSync(path.join(buildRoot, 'build-')); chmodSync(directory, 0o700);
  for (const name of SOURCES) writeFileSync(path.join(directory, name), sourceBytes[name], { flag: 'wx', mode: 0o400 });
  const jar = path.join(directory, 'runner.jar');
  const identity = { schema_version: 1, engine: 'official-maestro-sdk/artifacts-disabled',
    node_version: process.versions.node, wrapper_sha256: digest(readFileSync(fileURLToPath(import.meta.url))),
    sources, toolchain: tools.receipt };
  writeFileSync(path.join(directory, 'inputs.json'), `${JSON.stringify(identity, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  const result = runCommand(tools.java, ['-cp', `${tools.compiler}${path.delimiter}${tools.classpath}`,
    'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-jvm-target', '17', '-no-stdlib', '-no-reflect',
    '-classpath', tools.classpath, '-d', jar, ...SOURCES.map((name) => path.join(directory, name))],
  { encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  // Compiler diagnostics contain host source paths only; never receive flow/env values.
  writeFileSync(path.join(directory, 'compile.log'), `${result.stdout ?? ''}${result.stderr ?? ''}`, { flag: 'wx', mode: 0o600 });
  if (result.error || result.signal || result.status !== 0 || !existsSync(jar)) fail('compile_failed');
  if (lstatSync(jar).isSymbolicLink() || !lstatSync(jar).isFile()) fail('build_path_invalid');
  chmodSync(jar, 0o400);
  const receipt = { ...identity, jar_sha256: digest(readFileSync(jar)) };
  const receiptPath = path.join(directory, 'tool-receipt.json');
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o400 });
  return Object.freeze({ java: tools.java, classpath: tools.classpath, compiler: tools.compiler, source,
    jdk: toolchain.jdk, lib: toolchain.lib, jar, receipt, receiptPath });
}

export function verifySafeSdkBinding(binding) {
  checkedFile(binding.jar, binding.receipt.jar_sha256);
  if (JSON.stringify(JSON.parse(readFileSync(binding.receiptPath, 'utf8'))) !== JSON.stringify(binding.receipt)) fail('receipt_invalid');
  const expected = binding.receipt.toolchain;
  if (JSON.stringify(readdirSync(binding.lib).filter((name) => name.endsWith('.jar')).sort()) !== JSON.stringify(Object.keys(expected.jars).sort())
    || digest(readFileSync(fileURLToPath(import.meta.url))) !== binding.receipt.wrapper_sha256
    || digest(realpathSync(binding.java)) !== expected.java_realpath_sha256) fail('receipt_invalid');
  for (const [name, hash] of Object.entries(binding.receipt.sources)) checkedFile(path.join(binding.source, name), hash);
  checkedFile(binding.compiler, expected.compiler_sha256);
  for (const [name, hash] of Object.entries(expected.jars)) checkedFile(path.join(binding.lib, name), hash);
  for (const [name, hash] of Object.entries(expected.jdk_files)) checkedFile(path.join(binding.jdk, name), hash);
  return true;
}
